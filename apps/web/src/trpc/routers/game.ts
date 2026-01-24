import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../index";
import { TRPCError } from "@trpc/server";

export const gameRouter = createTRPCRouter({
  // Get questions for a specific question set
  getQuestions: publicProcedure
    .input(z.object({
      questionSetId: z.string().optional(),
      difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
      limit: z.number().min(1).max(100).default(30),
    }))
    .query(async ({ ctx, input }) => {
      const questions = await ctx.db.question.findMany({
        where: {
          ...(input.questionSetId && { questionSetId: input.questionSetId }),
          ...(input.difficulty && { difficulty: input.difficulty }),
        },
        include: {
          questionSet: {
            include: {
              categories: {
                include: {
                  category: true,
                },
              },
            },
          },
        },
        take: input.limit,
      });
      return questions;
    }),

  // Get all categories
  getCategories: publicProcedure
    .query(async ({ ctx }) => {
      const categories = await ctx.db.category.findMany({
        orderBy: { name: 'asc' },
      });
      return categories;
    }),

  // Get question sets with filters
  getQuestionSets: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const questionSets = await ctx.db.questionSet.findMany({
        include: {
          categories: {
            include: {
              category: true,
            },
          },
          _count: {
            select: { questions: true },
          },
        },
        take: input.limit,
        orderBy: { airDate: 'desc' },
      });
      return questionSets;
    }),

  // Create a new room
  createRoom: publicProcedure
    .input(z.object({
      name: z.string().optional(),
      maxPlayers: z.number().min(2).max(12).default(8),
      isPrivate: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      // Generate unique room code (4 letters)
      const generateRoomCode = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let code = '';
        for (let i = 0; i < 4; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
      };

      let roomCode: string;
      let isUnique = false;

      // Keep generating until we get a unique code
      do {
        roomCode = generateRoomCode();
        const existing = await ctx.db.room.findUnique({
          where: { code: roomCode },
        });
        isUnique = !existing;
      } while (!isUnique);

      const room = await ctx.db.room.create({
        data: {
          code: roomCode,
          hostId: ctx.session?.user?.id,
          name: input.name,
          maxPlayers: input.maxPlayers,
          private: input.isPrivate,
        },
        include: {
          host: true,
        },
      });

      // Create default configuration
      await ctx.db.gameConfiguration.create({
        data: {
          roomId: room.id,
        },
      });

      return room;
    }),

  // Join a room
  joinRoom: publicProcedure
    .input(z.object({
      roomCode: z.string().length(4),
      playerName: z.string().min(1).max(20),
      userId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const room = await ctx.db.room.findUnique({
        where: { code: input.roomCode.toUpperCase() },
        include: {
          players: {
            where: { isActive: true },
          },
        },
      });

      if (!room) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Room not found',
        });
      }

      if (room.status !== 'WAITING') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Game has already started',
        });
      }

      if (room.players.length >= room.maxPlayers) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Room is full',
        });
      }

      // Check if user is already in the room (by name or userId)
      const existingPlayer = room.players.find(p =>
        (input.userId && p.userId === input.userId) ||
        p.name === input.playerName
      );

      if (existingPlayer) {
        // Return existing player if they're rejoining
        return existingPlayer;
      }

      // Create new player
      const player = await ctx.db.player.create({
        data: {
          roomId: room.id,
          userId: input.userId,
          name: input.playerName,
          isActive: true,
        },
        include: {
          user: true,
        },
      });

      // Update room player count
      await ctx.db.room.update({
        where: { id: room.id },
        data: {
          numPlayers: { increment: 1 },
        },
      });

      return player;
    }),

  // Get room details
  getRoom: publicProcedure
    .input(z.object({
      roomCode: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const room = await ctx.db.room.findUnique({
        where: { code: input.roomCode.toUpperCase() },
        include: {
          host: true,
          players: {
            where: { isActive: true },
            include: {
              user: true,
            },
          },
          configuration: true,
          gameSessions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!room) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Room not found',
        });
      }

      return room;
    }),

  // Update room configuration (host only - no auth check since host is not logged in)
  updateRoomConfig: publicProcedure
    .input(z.object({
      roomId: z.string(),
      config: z.object({
        difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
        buzzWindowMs: z.number().min(1000).max(30000).optional(),
        answerWindowMs: z.number().min(5000).max(60000).optional(),
        revealWindowMs: z.number().min(1000).max(10000).optional(),
        roundCount: z.number().min(1).max(3).optional(),
        questionsPerCategory: z.number().min(1).max(10).optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const config = await ctx.db.gameConfiguration.upsert({
        where: { roomId: input.roomId },
        update: input.config,
        create: {
          roomId: input.roomId,
          ...input.config,
        },
      });

      return config;
    }),

  // Get player statistics
  getPlayerStats: publicProcedure
    .input(z.object({
      userId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const userId = input.userId || ctx.session?.user?.id;

      if (!userId) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'User not authenticated',
        });
      }

      const stats = await ctx.db.playerStatistics.findUnique({
        where: { userId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      });

      if (!stats) {
        // Create default stats if they don't exist
        return await ctx.db.playerStatistics.create({
          data: {
            userId,
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
          },
        });
      }

      return stats;
    }),

  // Get leaderboard
  getLeaderboard: publicProcedure
    .input(z.object({
      period: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'ALL_TIME']).default('ALL_TIME'),
      limit: z.number().min(1).max(100).default(10),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const entries = await ctx.db.leaderboard.findMany({
        where: {
          period: input.period,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
        orderBy: [
          { score: 'desc' },
          { gamesWon: 'desc' },
        ],
        take: input.limit,
        skip: input.offset,
      });

      // Add rank to entries
      return entries.map((entry, index) => ({
        ...entry,
        rank: input.offset + index + 1,
      }));
    }),

  // Update leaderboard entry (called after game ends)
  updateLeaderboardEntry: publicProcedure
    .input(z.object({
      userId: z.string(),
      score: z.number(),
      won: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const periods: Array<'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ALL_TIME'> = [
        'DAILY',
        'WEEKLY',
        'MONTHLY',
        'ALL_TIME',
      ];

      // Update all period leaderboards
      const updates = periods.map(period =>
        ctx.db.leaderboard.upsert({
          where: {
            userId_period: {
              userId: input.userId,
              period,
            },
          },
          update: {
            score: { increment: input.score },
            gamesWon: input.won ? { increment: 1 } : undefined,
          },
          create: {
            userId: input.userId,
            period,
            score: input.score,
            gamesWon: input.won ? 1 : 0,
          },
        })
      );

      await Promise.all(updates);

      return { success: true };
    }),

  // Leave room
  leaveRoom: publicProcedure
    .input(z.object({
      roomCode: z.string(),
      playerId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const player = await ctx.db.player.update({
        where: { id: input.playerId },
        data: { isActive: false },
      });

      // Decrement room player count
      await ctx.db.room.update({
        where: { code: input.roomCode.toUpperCase() },
        data: {
          numPlayers: { decrement: 1 },
        },
      });

      return player;
    }),
});

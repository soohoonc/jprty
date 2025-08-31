import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../index";
import { TRPCError } from "@trpc/server";

export const gameRouter = createTRPCRouter({
  // Get questions for a specific category or set
  getQuestions: publicProcedure
    .input(z.object({
      categoryId: z.string().optional(),
      questionSetId: z.string().optional(),
      limit: z.number().min(1).max(100).default(30),
    }))
    .query(async ({ ctx, input }) => {
      const questions = await ctx.db.question.findMany({
        where: {
          ...(input.categoryId && { categoryId: input.categoryId }),
          ...(input.questionSetId && { questionSetId: input.questionSetId }),
        },
        include: {
          category: true,
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
      season: z.number().optional(),
      difficulty: z.enum(['EASY', 'MEDIUM', 'HARD', 'EXPERT']).optional(),
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const questionSets = await ctx.db.questionSet.findMany({
        where: {
          ...(input.season && { season: input.season }),
          ...(input.difficulty && { difficulty: input.difficulty }),
        },
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
      isPublic: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      // Generate unique room code
      const generateRoomCode = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
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
          hostId: ctx.session?.user.id,
          name: input.name,
          maxPlayers: input.maxPlayers,
          isPublic: input.isPublic,
        },
        include: {
          host: true,
          configuration: true,
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
      roomCode: z.string().length(6),
      playerName: z.string().min(1).max(20),
      userId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const room = await ctx.db.room.findUnique({
        where: { code: input.roomCode.toUpperCase() },
        include: {
          players: true,
          _count: {
            select: { players: true },
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

      if (room._count.players >= room.maxPlayers) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Room is full',
        });
      }

      // Check if user is already in the room
      if (input.userId) {
        const existingPlayer = await ctx.db.player.findUnique({
          where: {
            roomId_userId: {
              roomId: room.id,
              userId: input.userId,
            },
          },
        });

        if (existingPlayer) {
          return existingPlayer;
        }
      }

      // Create new player
      const player = await ctx.db.player.create({
        data: {
          roomId: room.id,
          userId: input.userId,
          guestName: !input.userId ? input.playerName : undefined,
          isHost: false,
        },
        include: {
          user: true,
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

  // Update room configuration (host only)
  updateRoomConfig: publicProcedure
    .input(z.object({
      roomId: z.string(),
      config: z.object({
        buzzWindow: z.number().min(1000).max(30000).optional(),
        responseWindow: z.number().min(5000).max(60000).optional(),
        revealWindow: z.number().min(1000).max(10000).optional(),
        minYear: z.number().min(1984).max(2024).optional(),
        maxYear: z.number().min(1984).max(2024).optional(),
        difficulty: z.enum(['EASY', 'MEDIUM', 'HARD', 'EXPERT']).optional(),
        categoryTags: z.array(z.string()).optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify user is host
      const room = await ctx.db.room.findUnique({
        where: { id: input.roomId },
      });

      if (!room || room.hostId !== ctx.session?.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only the host can update room configuration',
        });
      }

      const config = await ctx.db.gameConfiguration.update({
        where: { roomId: input.roomId },
        data: input.config,
      });

      return config;
    }),

  // Get player statistics
  getPlayerStats: publicProcedure
    .query(async ({ ctx }) => {
      const stats = await ctx.db.playerStatistics.findUnique({
        where: { userId: ctx.session?.user.id },
      });

      if (!stats) {
        // Create default stats if they don't exist
        return await ctx.db.playerStatistics.create({
          data: {
            userId: ctx.session?.user.id ?? '',
          },
        });
      }

      return stats;
    }),

  // Get leaderboard
  getLeaderboard: publicProcedure
    .input(z.object({
      type: z.enum(['GLOBAL', 'DAILY', 'WEEKLY', 'MONTHLY']),
      limit: z.number().min(1).max(100).default(10),
    }))
    .query(async ({ ctx, input }) => {
      const period = input.type === 'GLOBAL' ? null : new Date().toISOString().split('T')[0];

      const leaderboard = await ctx.db.leaderboard.findUnique({
        where: {
          type_period: {
            type: input.type,
            period: period || '',
          },
        },
        include: {
          entries: {
            take: input.limit,
            orderBy: { rank: 'asc' },
          },
        },
      });

      return leaderboard?.entries || [];
    }),
});
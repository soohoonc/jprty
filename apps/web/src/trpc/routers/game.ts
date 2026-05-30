import {
	canReadGameStateFromSpacetime,
	getGameStateFromSpacetimeByRoomCode,
} from "@/server/spacetimedb-game-state-read";
import { getRoomByCodeFromSpacetime } from "@/lib/spacetimedb-read";
import {
	answerSpacetimeGame,
	buzzSpacetimeGame,
	selectSpacetimeQuestion,
	startSpacetimeGameForRoom,
} from "@/server/spacetimedb-gameplay";
import {
	canProvisionRoomInSpacetime,
	provisionRoomInSpacetime,
	removeRoomPlayerInSpacetime,
	syncRoomPlayerInSpacetime,
} from "@/server/spacetimedb-room-provision";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../index";

type GameStateSnapshot = {
	roomId: string;
	phase: string;
	roundType: string;
	roundNumber: number;
	totalRounds: number;
	scores: [string, number][];
	board?: {
		categories: string[];
		grid?: Array<{
			questionId: string;
			value: number;
			isUsed: boolean;
			isDailyDouble: boolean;
			row: number;
			col: number;
		}>;
	};
	currentQuestion?: {
		id: string;
		clue: string;
		category?: string;
		value?: number;
	};
	currentPlayerId?: string;
	selectorPlayerId?: string;
	buzzQueue: string[];
	timeRemaining?: number;
	currentWager?: number;
};

const GAME_SERVER_URL = process.env.GAME_SERVER_URL || "http://localhost:8080";

function cleanEnv(value: string | undefined): string | undefined {
	if (!value) return undefined;
	const trimmed = value.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

function getServerSpacetimeReadConfig() {
	return {
		baseUrl: cleanEnv(process.env.SPACETIMEDB_URL),
		database: cleanEnv(process.env.SPACETIMEDB_DATABASE),
		token: cleanEnv(process.env.SPACETIMEDB_TOKEN),
	};
}

async function provisionRuntimeRoom(room: {
	id: string;
	code: string;
	maxPlayers: number;
	status: "WAITING" | "IN_GAME" | "FINISHED" | "CLOSED";
}) {
	if (canProvisionRoomInSpacetime()) {
		try {
			const provisioned = await provisionRoomInSpacetime(room);
			if (provisioned) {
				return;
			}
		} catch (error) {
			console.warn(
				"[createRoom] SpacetimeDB room provisioning failed, falling back to GAME_SERVER_URL",
				error,
			);
		}
	}

	const response = await fetch(
		`${GAME_SERVER_URL}/api/runtime/rooms/provision`,
		{
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify({
				roomId: room.id,
				roomCode: room.code,
				maxPlayers: room.maxPlayers,
				status: room.status,
				phase: "LOBBY",
				numPlayers: 0,
				hostConnected: false,
			}),
		},
	);

	if (!response.ok) {
		throw new Error(
			`Failed to provision runtime room: ${await response.text()}`,
		);
	}
}

function logMembershipMirrorSkip(scope: "joinRoom" | "leaveRoom") {
	console.warn(
		`[${scope}] SpacetimeDB membership mirror skipped: SPACETIMEDB_URL/SPACETIMEDB_DATABASE not configured`,
	);
}

export const gameRouter = createTRPCRouter({
	// Get questions for a specific question set
	getQuestions: publicProcedure
		.input(
			z.object({
				questionSetId: z.string().optional(),
				difficulty: z.enum(["easy", "medium", "hard"]).optional(),
				limit: z.number().min(1).max(100).default(30),
			}),
		)
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
	getCategories: publicProcedure.query(async ({ ctx }) => {
		const categories = await ctx.db.category.findMany({
			orderBy: { name: "asc" },
		});
		return categories;
	}),

	// Get question sets with filters
	getQuestionSets: publicProcedure
		.input(
			z.object({
				limit: z.number().min(1).max(50).default(20),
			}),
		)
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
				orderBy: { airDate: "desc" },
			});
			return questionSets;
		}),

	// Create a new room
	createRoom: publicProcedure
		.input(
			z.object({
				name: z.string().optional(),
				maxPlayers: z.number().min(2).max(12).default(8),
				isPrivate: z.boolean().default(true),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// Generate unique room code (4 letters)
			const generateRoomCode = () => {
				const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
				let code = "";
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

			try {
				await provisionRuntimeRoom({
					id: room.id,
					code: room.code,
					maxPlayers: room.maxPlayers,
					status: room.status,
				});
			} catch (error) {
				console.warn("[createRoom] failed to provision runtime room", error);
			}

			return room;
		}),

	// Join a room
	joinRoom: publicProcedure
		.input(
			z.object({
				roomCode: z.string().length(4),
				playerName: z.string().min(1).max(20),
				userId: z.string().optional(),
			}),
		)
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
					code: "NOT_FOUND",
					message: "Room not found",
				});
			}

			if (room.status !== "WAITING") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Game has already started",
				});
			}

			if (room.players.length >= room.maxPlayers) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Room is full",
				});
			}

			// Check if user is already active in the room (by name or userId)
			let existingActivePlayer = null;
			for (const activePlayer of room.players) {
				if (
					(input.userId && activePlayer.userId === input.userId) ||
					activePlayer.name === input.playerName
				) {
					existingActivePlayer = activePlayer;
					break;
				}
			}

			if (existingActivePlayer) {
				return existingActivePlayer;
			}

			const existingInactivePlayer = await ctx.db.player.findFirst({
				where: {
					roomId: room.id,
					isActive: false,
					OR: [
						...(input.userId ? [{ userId: input.userId }] : []),
						{ name: input.playerName },
					],
				},
				orderBy: { joinedAt: "asc" },
				include: {
					user: true,
				},
			});

			const player = existingInactivePlayer
				? await ctx.db.player.update({
						where: { id: existingInactivePlayer.id },
						data: {
							isActive: true,
							userId: input.userId ?? existingInactivePlayer.userId,
							name: input.playerName,
						},
						include: {
							user: true,
						},
					})
				: await ctx.db.player.create({
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

			try {
				if (!canProvisionRoomInSpacetime()) {
					logMembershipMirrorSkip("joinRoom");
				} else {
					await syncRoomPlayerInSpacetime({
						playerId: player.id,
						roomId: room.id,
						name: player.name,
						guestName: player.name,
						isHost: Boolean(
							player.userId && room.hostId && player.userId === room.hostId,
						),
						isActive: true,
						score: player.score,
						joinedAt: player.joinedAt.toISOString(),
					});
				}
			} catch (error) {
				console.warn(
					"[joinRoom] SpacetimeDB membership sync failed; continuing without mirror",
					error,
				);
			}

			return player;
		}),

	// Get room details
	getRoom: publicProcedure
		.input(
			z.object({
				roomCode: z.string(),
			}),
		)
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
						orderBy: { createdAt: "desc" },
						take: 1,
					},
				},
			});

			if (!room) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Room not found",
				});
			}

			return room;
		}),

	getLiveRoomRuntime: publicProcedure
		.input(
			z.object({
				roomCode: z.string().length(4),
			}),
		)
		.query(async ({ input }) => {
			const config = getServerSpacetimeReadConfig();
			if (!config.baseUrl || !config.database) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message:
						"SpacetimeDB runtime reads are not configured on the server.",
				});
			}

			try {
				return await getRoomByCodeFromSpacetime({
					baseUrl: config.baseUrl,
					database: config.database,
					roomCode: input.roomCode.toUpperCase(),
					token: config.token,
				});
			} catch (error) {
				console.warn("[getLiveRoomRuntime] SpacetimeDB read failed", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch SpacetimeDB live room runtime",
				});
			}
		}),

	// Update room configuration (host only - no auth check since host is not logged in)
	updateRoomConfig: publicProcedure
		.input(
			z.object({
				roomId: z.string(),
				config: z.object({
					difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
					buzzWindowMs: z.number().min(1000).max(30000).optional(),
					answerWindowMs: z.number().min(5000).max(60000).optional(),
					revealWindowMs: z.number().min(1000).max(10000).optional(),
					roundCount: z.number().min(1).max(3).optional(),
					questionsPerCategory: z.number().min(1).max(10).optional(),
				}),
			}),
		)
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
		.input(
			z.object({
				userId: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const userId = input.userId || ctx.session?.user?.id;

			if (!userId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "User not authenticated",
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
		.input(
			z.object({
				period: z
					.enum(["DAILY", "WEEKLY", "MONTHLY", "ALL_TIME"])
					.default("ALL_TIME"),
				limit: z.number().min(1).max(100).default(10),
				offset: z.number().min(0).default(0),
			}),
		)
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
				orderBy: [{ score: "desc" }, { gamesWon: "desc" }],
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
		.input(
			z.object({
				userId: z.string(),
				score: z.number(),
				won: z.boolean(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const periods: Array<"DAILY" | "WEEKLY" | "MONTHLY" | "ALL_TIME"> = [
				"DAILY",
				"WEEKLY",
				"MONTHLY",
				"ALL_TIME",
			];

			// Update all period leaderboards
			const updates = periods.map((period) =>
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
				}),
			);

			await Promise.all(updates);

			return { success: true };
		}),

	// Get game results
	getGameResults: publicProcedure
		.input(
			z.object({
				roomCode: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const room = await ctx.db.room.findUnique({
				where: { code: input.roomCode.toUpperCase() },
				include: {
					players: {
						orderBy: { score: "desc" },
						include: {
							user: {
								select: {
									id: true,
									name: true,
									image: true,
								},
							},
						},
					},
					gameSessions: {
						orderBy: { createdAt: "desc" },
						take: 1,
					},
				},
			});

			if (!room) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Room not found",
				});
			}

			const sortedPlayers = room.players.sort((a, b) => b.score - a.score);
			const winner = sortedPlayers[0] || null;

			return {
				roomCode: room.code,
				gameId: room.gameSessions[0]?.id || room.id,
				winner: winner
					? {
							id: winner.id,
							name: winner.name || winner.user?.name || "Anonymous",
							score: winner.score,
							correctAnswers: 0, // TODO: track in DB
							incorrectAnswers: 0,
						}
					: null,
				players: sortedPlayers.map((p) => ({
					id: p.id,
					name: p.name || p.user?.name || "Anonymous",
					score: p.score,
					correctAnswers: 0,
					incorrectAnswers: 0,
				})),
			};
		}),

	// Leave room
	leaveRoom: publicProcedure
		.input(
			z.object({
				roomCode: z.string(),
				playerId: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const existingPlayer = await ctx.db.player.findUnique({
				where: { id: input.playerId },
			});

			if (!existingPlayer) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Player not found",
				});
			}

			const shouldRemoveMirror = existingPlayer.isActive;
			const player = shouldRemoveMirror
				? await ctx.db.player.update({
						where: { id: existingPlayer.id },
						data: { isActive: false },
					})
				: existingPlayer;

			const activePlayerCount = await ctx.db.player.count({
				where: {
					roomId: existingPlayer.roomId,
					isActive: true,
				},
			});

			await ctx.db.room.update({
				where: { id: existingPlayer.roomId },
				data: { numPlayers: activePlayerCount },
			});

			try {
				if (!canProvisionRoomInSpacetime()) {
					logMembershipMirrorSkip("leaveRoom");
				} else if (shouldRemoveMirror) {
					await removeRoomPlayerInSpacetime(player.id);
				}
			} catch (error) {
				console.warn(
					"[leaveRoom] SpacetimeDB membership remove failed; continuing without mirror",
					error,
				);
			}

			return player;
		}),

	// Legacy game-server reads are retired. Live room/game state now belongs to SpacetimeDB.
	startGame: publicProcedure
		.input(
			z.object({
				roomCode: z.string().length(4),
			}),
		)
		.mutation(async ({ input }) => {
			try {
				return await startSpacetimeGameForRoom(input.roomCode);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error ? error.message : "Failed to start game",
				});
			}
		}),

	selectQuestion: publicProcedure
		.input(
			z.object({
				roomCode: z.string().length(4),
				playerId: z.string().min(1),
				questionId: z.string().min(1),
			}),
		)
		.mutation(async ({ input }) => {
			try {
				await selectSpacetimeQuestion(input);
				return { ok: true };
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error
							? error.message
							: "Failed to select question",
				});
			}
		}),

	buzz: publicProcedure
		.input(
			z.object({
				roomCode: z.string().length(4),
				playerId: z.string().min(1),
			}),
		)
		.mutation(async ({ input }) => {
			try {
				await buzzSpacetimeGame(input);
				return { ok: true };
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error instanceof Error ? error.message : "Failed to buzz",
				});
			}
		}),

	submitAnswer: publicProcedure
		.input(
			z.object({
				roomCode: z.string().length(4),
				playerId: z.string().min(1),
				answer: z.string().min(1),
			}),
		)
		.mutation(async ({ input }) => {
			try {
				return await answerSpacetimeGame(input);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error
							? error.message
							: "Failed to submit answer",
				});
			}
		}),

	getGameState: publicProcedure
		.input(
			z.object({
				roomCode: z.string(),
			}),
		)
		.query(async ({ input }): Promise<GameStateSnapshot | null> => {
			const roomCode = input.roomCode.toUpperCase();

			if (!canReadGameStateFromSpacetime()) {
				return null;
			}

			try {
				return await getGameStateFromSpacetimeByRoomCode(roomCode);
			} catch (error) {
				console.warn("[getGameState] SpacetimeDB read failed", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch SpacetimeDB game state",
				});
			}
		}),
});

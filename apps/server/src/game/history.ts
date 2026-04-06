import { db, type Prisma, type RoundType } from "@jprty/db";

export interface RecordAnswerInput {
  roundId: string;
  questionId: string;
  playerId: string;
  answer: string;
  correct: boolean;
  wager?: number;
}

export interface CreateRoundInput {
  gameSessionId: string;
  roundNumber: number;
  roundType: RoundType;
  questionSetId: string;
}

export interface FinalizeGameInput {
  sessionId?: string;
  winnerId?: string;
  scores: Array<[playerId: string, score: number]>;
}

interface PersistedRoundEvent {
  questionId: string;
  playerId: string;
  eventType: "answered" | "daily_double";
  answer: string;
  correct: boolean;
  wager?: number;
  timestamp: string;
}

export interface GameHistoryWriter {
  startSession(roomId: string): Promise<{ id: string }>;
  createRound(input: CreateRoundInput): Promise<{ id: string }>;
  recordAnswer(input: RecordAnswerInput): Promise<void>;
  finalizeGame(input: FinalizeGameInput): Promise<void>;
}

export class PrismaGameHistoryService implements GameHistoryWriter {
  async startSession(roomId: string): Promise<{ id: string }> {
    const session = await db.gameSession.create({
      data: {
        roomId,
        status: "ACTIVE",
        startedAt: new Date(),
      },
      select: { id: true },
    });

    return session;
  }

  async createRound(input: CreateRoundInput): Promise<{ id: string }> {
    const round = await db.round.create({
      data: {
        gameSessionId: input.gameSessionId,
        roundNumber: input.roundNumber,
        roundType: input.roundType,
        questionSetId: input.questionSetId,
        events: [],
      },
      select: { id: true },
    });

    return round;
  }

  async recordAnswer(input: RecordAnswerInput): Promise<void> {
    const round = await db.round.findUnique({
      where: { id: input.roundId },
      select: { events: true },
    });

    if (!round) {
      throw new Error("Round not found");
    }

    const event: PersistedRoundEvent = {
      questionId: input.questionId,
      playerId: input.playerId,
      eventType: input.wager !== undefined ? "daily_double" : "answered",
      answer: input.answer,
      correct: input.correct,
      wager: input.wager,
      timestamp: new Date().toISOString(),
    };

    const currentEvents = round.events.filter((value) => value !== null) as Prisma.InputJsonValue[];

    await db.round.update({
      where: { id: input.roundId },
      data: {
        events: [...currentEvents, event as unknown as Prisma.InputJsonValue],
      },
    });
  }

  async finalizeGame(input: FinalizeGameInput): Promise<void> {
    await db.$transaction(async (tx) => {
      if (input.sessionId) {
        await tx.gameSession.update({
          where: { id: input.sessionId },
          data: {
            status: "COMPLETED",
            endedAt: new Date(),
            winnerId: input.winnerId,
          },
        });
      }

      for (const [playerId, score] of input.scores) {
        await tx.player.update({
          where: { id: playerId },
          data: { score },
        });
      }
    });
  }
}

export const gameHistory = new PrismaGameHistoryService();

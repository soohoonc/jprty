import { afterEach, describe, expect, test } from "bun:test";
import { db } from "@jprty/db";
import { gameHistory } from "./history";

const createdRoomIds = new Set<string>();
const createdQuestionSetIds = new Set<string>();

afterEach(async () => {
  for (const roomId of createdRoomIds) {
    await db.room.delete({ where: { id: roomId } }).catch(() => null);
  }
  createdRoomIds.clear();

  for (const questionSetId of createdQuestionSetIds) {
    await db.questionSet.delete({ where: { id: questionSetId } }).catch(() => null);
  }
  createdQuestionSetIds.clear();
});

describe("gameHistory", () => {
  test("persists session, round events, and final player scores", async () => {
    const room = await db.room.create({
      data: {
        code: `T${Date.now().toString(36).slice(-5).toUpperCase()}`,
        maxPlayers: 2,
      },
    });
    createdRoomIds.add(room.id);

    const [playerOne, playerTwo] = await Promise.all([
      db.player.create({
        data: {
          roomId: room.id,
          name: "Ada",
          isActive: true,
        },
      }),
      db.player.create({
        data: {
          roomId: room.id,
          name: "Grace",
          isActive: true,
        },
      }),
    ]);

    const questionSet = await db.questionSet.create({
      data: {
        title: `History Layer ${room.id}`,
      },
    });
    createdQuestionSetIds.add(questionSet.id);

    const session = await gameHistory.startSession(room.id);
    const round = await gameHistory.createRound({
      gameSessionId: session.id,
      roundNumber: 1,
      roundType: "SINGLE_JEOPARDY",
      questionSetId: questionSet.id,
    });

    await gameHistory.recordAnswer({
      roundId: round.id,
      questionId: "question-1",
      playerId: playerOne.id,
      answer: "Who is Ada?",
      correct: true,
    });

    await gameHistory.finalizeGame({
      sessionId: session.id,
      winnerId: playerOne.id,
      scores: [
        [playerOne.id, 400],
        [playerTwo.id, -200],
      ],
    });

    const storedRound = await db.round.findUnique({
      where: { id: round.id },
      select: { events: true },
    });
    const storedSession = await db.gameSession.findUnique({
      where: { id: session.id },
      select: { status: true, winnerId: true, endedAt: true },
    });
    const storedPlayers = await db.player.findMany({
      where: { id: { in: [playerOne.id, playerTwo.id] } },
      select: { id: true, score: true },
      orderBy: { id: "asc" },
    });

    expect(storedRound?.events).toHaveLength(1);
    expect(storedRound?.events[0]).toMatchObject({
      questionId: "question-1",
      playerId: playerOne.id,
      eventType: "answered",
      answer: "Who is Ada?",
      correct: true,
    });
    expect((storedRound?.events[0] as { timestamp?: unknown }).timestamp).toEqual(
      expect.any(String),
    );

    expect(storedSession).toMatchObject({
      status: "COMPLETED",
      winnerId: playerOne.id,
    });
    expect(storedSession?.endedAt).toEqual(expect.any(Date));

    expect(storedPlayers).toEqual([
      { id: playerOne.id, score: 400 },
      { id: playerTwo.id, score: -200 },
    ]);
  });
});

import { describe, expect, test } from "bun:test";
import { gameRuntime } from "./game-runtime";
import type { GameState, GameStateSnapshot } from "../game/state";

describe("gameRuntime", () => {
  test("buildStateUpdate projects answered questions from the snapshot grid", () => {
    const snapshot: GameStateSnapshot = {
      roomId: "room-1",
      phase: "SELECTING",
      roundType: "SINGLE_JEOPARDY",
      roundNumber: 1,
      totalRounds: 1,
      scores: [["player-1", 400]],
      board: {
        categories: ["History", "Science"],
        grid: [
          {
            questionId: "q-1",
            value: 200,
            isUsed: true,
            isDailyDouble: false,
            row: 0,
            col: 0,
          },
          {
            questionId: "q-2",
            value: 200,
            isUsed: false,
            isDailyDouble: false,
            row: 0,
            col: 1,
          },
        ],
      },
      buzzQueue: [],
    };

    expect(gameRuntime.buildStateUpdate(snapshot)).toEqual({
      ...snapshot,
      board: {
        categories: ["History", "Science"],
        answeredQuestions: ["History_200"],
      },
    });
  });

  test("buildGameEndPayload sorts scores and exposes the winner first", () => {
    const state = {
      scores: new Map([
        ["player-2", 200],
        ["player-1", 600],
        ["player-3", -100],
      ]),
    } as Pick<GameState, "scores"> as GameState;

    expect(gameRuntime.buildGameEndPayload(state)).toEqual({
      winner: ["player-1", 600],
      finalScores: [
        ["player-1", 600],
        ["player-2", 200],
        ["player-3", -100],
      ],
    });
  });
});

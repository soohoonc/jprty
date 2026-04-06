import { afterEach, describe, expect, test } from "bun:test";
import {
  SpacetimeMirrorService,
  toMirrorBoardCells,
  toMirrorGameScores,
  toMirrorGameState,
  toMirrorPlayer,
  toMirrorRoom,
} from "./spacetimedb-mirror";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("spacetimeMirror", () => {
  test("short-circuits when SpacetimeDB is not configured", async () => {
    const fetchCalls: unknown[] = [];
    const fetchStub = ((...args: unknown[]) => {
      fetchCalls.push(args);
      return Promise.resolve(new Response(null, { status: 200 }));
    }) as typeof fetch;

    const service = new SpacetimeMirrorService({}, fetchStub);

    expect(
      await service.syncRoom({
        roomId: "room-1",
        roomCode: "ABCD",
        status: "WAITING",
        phase: "LOBBY",
        maxPlayers: 8,
        numPlayers: 0,
        hostConnected: false,
      }),
    ).toBe(false);
    expect(fetchCalls).toHaveLength(0);
  });

  test("posts reducer calls with auth when configured", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchStub = ((url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return Promise.resolve(new Response(null, { status: 200 }));
    }) as typeof fetch;

    const service = new SpacetimeMirrorService(
      {
        baseUrl: "https://stdb.example.com/",
        database: "jprty-room-runtime",
        token: "secret-token",
      },
      fetchStub,
    );

    await service.syncRoom(
      toMirrorRoom({
        backend: "prisma-socket-bridge",
        roomId: "room-1",
        roomCode: "ABCD",
        status: "WAITING",
        phase: "LOBBY",
        maxPlayers: 8,
        numPlayers: 1,
        hostConnected: true,
        players: [],
      }),
    );

    await service.syncPlayer(
      toMirrorPlayer(
        {
          id: "player-1",
          name: "Ada",
          guestName: "Ada",
          score: 200,
          isHost: false,
          isActive: true,
          joinedAt: "2026-04-04T00:00:00.000Z",
        },
        "room-1",
      ),
    );

    await service.removePlayer("player-1");
    await service.syncGameState(
      toMirrorGameState({
        roomId: "room-1",
        phase: "SELECTING",
        roundType: "SINGLE_JEOPARDY",
        roundNumber: 1,
        totalRounds: 1,
        scores: [["player-1", 200]],
        board: {
          categories: ["History"],
          grid: [
            {
              questionId: "q-1",
              value: 200,
              isUsed: false,
              isDailyDouble: true,
              row: 0,
              col: 0,
            },
          ],
        },
        currentQuestion: {
          id: "q-1",
          clue: "A clue",
          category: "History",
          value: 200,
        },
        selectorPlayerId: "player-1",
        buzzQueue: [],
        timeRemaining: 5,
        currentWager: 0,
      }),
    );
    await service.syncGameScore(
      toMirrorGameScores({
        roomId: "room-1",
        phase: "SELECTING",
        roundType: "SINGLE_JEOPARDY",
        roundNumber: 1,
        totalRounds: 1,
        scores: [["player-1", 200]],
        buzzQueue: [],
      })[0]!,
    );
    await service.syncBoardCell(
      toMirrorBoardCells({
        roomId: "room-1",
        phase: "SELECTING",
        roundType: "SINGLE_JEOPARDY",
        roundNumber: 1,
        totalRounds: 1,
        scores: [],
        board: {
          categories: ["History"],
          grid: [
            {
              questionId: "q-1",
              value: 200,
              isUsed: false,
              isDailyDouble: true,
              row: 0,
              col: 0,
            },
          ],
        },
        buzzQueue: [],
      })[0]!,
    );

    expect(requests).toEqual([
      {
        url: "https://stdb.example.com/v1/database/jprty-room-runtime/call/sync_live_room",
        init: {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer secret-token",
          },
          body: JSON.stringify(["room-1", "ABCD", "WAITING", "LOBBY", 8, 1, true]),
        },
      },
      {
        url: "https://stdb.example.com/v1/database/jprty-room-runtime/call/sync_live_room_player",
        init: {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer secret-token",
          },
          body: JSON.stringify([
            "player-1",
            "room-1",
            "Ada",
            "Ada",
            false,
            true,
            200,
            "2026-04-04T00:00:00.000Z",
          ]),
        },
      },
      {
        url: "https://stdb.example.com/v1/database/jprty-room-runtime/call/remove_live_room_player",
        init: {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer secret-token",
          },
          body: JSON.stringify(["player-1"]),
        },
      },
      {
        url: "https://stdb.example.com/v1/database/jprty-room-runtime/call/sync_mirrored_game_state",
        init: {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer secret-token",
          },
          body: JSON.stringify([
            "room-1",
            "SELECTING",
            "SINGLE_JEOPARDY",
            1,
            1,
            "player-1",
            "",
            "q-1",
            "History",
            200,
            5,
            0,
          ]),
        },
      },
      {
        url: "https://stdb.example.com/v1/database/jprty-room-runtime/call/sync_mirrored_game_score",
        init: {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer secret-token",
          },
          body: JSON.stringify(["room-1:player-1", "room-1", "player-1", 200]),
        },
      },
      {
        url: "https://stdb.example.com/v1/database/jprty-room-runtime/call/sync_mirrored_game_board_cell",
        init: {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer secret-token",
          },
          body: JSON.stringify([
            "room-1:0:0",
            "room-1",
            1,
            0,
            0,
            "History",
            "q-1",
            200,
            false,
            true,
          ]),
        },
      },
    ]);
  });

  test("syncGameplaySnapshot mirrors state, scores, and board cells", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchStub = ((url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return Promise.resolve(new Response(null, { status: 200 }));
    }) as typeof fetch;

    const service = new SpacetimeMirrorService(
      {
        baseUrl: "https://stdb.example.com/",
        database: "jprty-room-runtime",
      },
      fetchStub,
    );

    await service.syncGameplaySnapshot({
      roomId: "room-1",
      phase: "READING",
      roundType: "SINGLE_JEOPARDY",
      roundNumber: 1,
      totalRounds: 1,
      scores: [["player-1", 200], ["player-2", -200]],
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
            isDailyDouble: true,
            row: 0,
            col: 1,
          },
        ],
      },
      currentQuestion: {
        id: "q-1",
        clue: "A clue",
        category: "History",
        value: 200,
      },
      currentPlayerId: "player-1",
      selectorPlayerId: "player-2",
      buzzQueue: [],
      timeRemaining: 7,
    });

    expect(requests).toHaveLength(5);
    expect(requests.map((request) => request.url)).toEqual([
      "https://stdb.example.com/v1/database/jprty-room-runtime/call/sync_mirrored_game_state",
      "https://stdb.example.com/v1/database/jprty-room-runtime/call/sync_mirrored_game_score",
      "https://stdb.example.com/v1/database/jprty-room-runtime/call/sync_mirrored_game_score",
      "https://stdb.example.com/v1/database/jprty-room-runtime/call/sync_mirrored_game_board_cell",
      "https://stdb.example.com/v1/database/jprty-room-runtime/call/sync_mirrored_game_board_cell",
    ]);
  });
});

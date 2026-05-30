import { describe, expect, test } from "bun:test";
import { SpacetimeReadService } from "./spacetimedb-read";

describe("SpacetimeReadService", () => {
  test("hydrates live room snapshot from SQL rows", async () => {
    const fetchStub = (async (_url: string | URL | Request, init?: RequestInit) => {
      const sql = String(init?.body || "");

      if (sql.includes("from live_room where room_code")) {
        return new Response(
          JSON.stringify([
            {
              schema: {
                elements: [
                  { name: "room_id" },
                  { name: "room_code" },
                  { name: "status" },
                  { name: "phase" },
                  { name: "max_players" },
                  { name: "num_players" },
                  { name: "host_connected" },
                ],
              },
              rows: [
                {
                  room_id: "room-1",
                  room_code: "ABCD",
                  status: "WAITING",
                  phase: "LOBBY",
                  max_players: 8,
                  num_players: 2,
                  host_connected: true,
                },
              ],
              total_duration_micros: 1,
            },
          ]),
          { status: 200 },
        );
      }

      if (sql.includes("from live_room_player")) {
        return new Response(
          JSON.stringify([
            {
              schema: {
                elements: [
                  { name: "player_id" },
                  { name: "room_id" },
                  { name: "name" },
                  { name: "guest_name" },
                  { name: "is_host" },
                  { name: "is_active" },
                  { name: "score" },
                  { name: "joined_at" },
                ],
              },
              rows: [
                {
                  player_id: "p1",
                  room_id: "room-1",
                  name: "Ada",
                  guest_name: "Ada",
                  is_host: false,
                  is_active: true,
                  score: 200,
                  joined_at: "2026-04-17T00:00:00.000Z",
                },
                {
                  player_id: "p2",
                  room_id: "room-1",
                  name: "Grace",
                  guest_name: "Grace",
                  is_host: false,
                  is_active: true,
                  score: 400,
                  joined_at: "2026-04-17T00:00:01.000Z",
                },
              ],
              total_duration_micros: 1,
            },
          ]),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify([]), { status: 200 });
    }) as typeof fetch;

    const service = new SpacetimeReadService(
      {
        baseUrl: "https://stdb.example.com/",
        database: "jprty-room-runtime",
        readsEnabled: true,
      },
      fetchStub,
    );

    const snapshot = await service.getRoomByCode("abcd");

    expect(snapshot).toEqual({
      backend: "spacetimedb",
      roomId: "room-1",
      roomCode: "ABCD",
      status: "WAITING",
      phase: "LOBBY",
      maxPlayers: 8,
      numPlayers: 2,
      hostConnected: true,
      players: [
        {
          id: "p1",
          name: "Ada",
          guestName: "Ada",
          score: 200,
          isHost: false,
          isActive: true,
          joinedAt: "2026-04-17T00:00:00.000Z",
        },
        {
          id: "p2",
          name: "Grace",
          guestName: "Grace",
          score: 400,
          isHost: false,
          isActive: true,
          joinedAt: "2026-04-17T00:00:01.000Z",
        },
      ],
    });
  });

  test("hydrates gameplay snapshot from SATS tuple rows", async () => {
    const fetchStub = (async (_url: string | URL | Request, init?: RequestInit) => {
      const sql = String(init?.body || "");

      if (sql.includes("from mirrored_game_state")) {
        return new Response(
          JSON.stringify([
            {
              schema: {
                elements: [
                  { name: "room_id" },
                  { name: "phase" },
                  { name: "round_type" },
                  { name: "round_number" },
                  { name: "total_rounds" },
                  { name: "selector_player_id" },
                  { name: "current_player_id" },
                  { name: "current_question_id" },
                  { name: "current_question_clue" },
                  { name: "current_question_category" },
                  { name: "current_question_value" },
                  { name: "time_remaining" },
                  { name: "current_wager" },
                ],
              },
              rows: [
                {
                  elements: [
                    "room-1",
                    "SELECTING",
                    "SINGLE_JEOPARDY",
                    1,
                    1,
                    "p2",
                    "",
                    "",
                    "",
                    "",
                    0,
                    -1,
                    -1,
                  ],
                },
              ],
              total_duration_micros: 1,
            },
          ]),
          { status: 200 },
        );
      }

      if (sql.includes("from mirrored_game_score")) {
        return new Response(
          JSON.stringify([
            {
              schema: {
                elements: [{ name: "player_id" }, { name: "score" }],
              },
              rows: [{ elements: ["p2", 400] }, { elements: ["p1", 200] }],
              total_duration_micros: 1,
            },
          ]),
          { status: 200 },
        );
      }

      if (sql.includes("from mirrored_game_board_cell")) {
        return new Response(
          JSON.stringify([
            {
              schema: {
                elements: [
                  { name: "question_id" },
                  { name: "value" },
                  { name: "is_used" },
                  { name: "is_daily_double" },
                  { name: "row" },
                  { name: "col" },
                  { name: "category" },
                ],
              },
              rows: [
                { elements: ["q1", 200, true, false, 0, 0, "History"] },
                { elements: ["q2", 200, false, true, 0, 1, "Science"] },
              ],
              total_duration_micros: 1,
            },
          ]),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify([]), { status: 200 });
    }) as typeof fetch;

    const service = new SpacetimeReadService(
      {
        baseUrl: "https://stdb.example.com/",
        database: "jprty-room-runtime",
        readsEnabled: true,
      },
      fetchStub,
    );

    const snapshot = await service.getGameSnapshotByRoomId("room-1");
    expect(snapshot).toEqual({
      roomId: "room-1",
      phase: "SELECTING",
      roundType: "SINGLE_JEOPARDY",
      roundNumber: 1,
      totalRounds: 1,
      scores: [
        ["p2", 400],
        ["p1", 200],
      ],
      board: {
        categories: ["History", "Science"],
        grid: [
          {
            questionId: "q1",
            value: 200,
            isUsed: true,
            isDailyDouble: false,
            row: 0,
            col: 0,
          },
          {
            questionId: "q2",
            value: 200,
            isUsed: false,
            isDailyDouble: true,
            row: 0,
            col: 1,
          },
        ],
      },
      currentQuestion: undefined,
      currentPlayerId: undefined,
      selectorPlayerId: "p2",
      buzzQueue: [],
      timeRemaining: undefined,
      currentWager: undefined,
    });
  });

  test("hydrates current question clue directly from mirrored game state", async () => {
    const fetchStub = (async (_url: string | URL | Request, init?: RequestInit) => {
      const sql = String(init?.body || "");

      if (sql.includes("from mirrored_game_state")) {
        return new Response(
          JSON.stringify([
            {
              schema: {
                elements: [
                  { name: "room_id" },
                  { name: "phase" },
                  { name: "round_type" },
                  { name: "round_number" },
                  { name: "total_rounds" },
                  { name: "selector_player_id" },
                  { name: "current_player_id" },
                  { name: "current_question_id" },
                  { name: "current_question_clue" },
                  { name: "current_question_category" },
                  { name: "current_question_value" },
                  { name: "time_remaining" },
                  { name: "current_wager" },
                ],
              },
              rows: [
                {
                  elements: [
                    "room-2",
                    "READING",
                    "SINGLE_JEOPARDY",
                    1,
                    1,
                    "p1",
                    "p2",
                    "q-99",
                    "This clue came from mirrored state",
                    "Science",
                    400,
                    8,
                    -1,
                  ],
                },
              ],
              total_duration_micros: 1,
            },
          ]),
          { status: 200 },
        );
      }

      if (sql.includes("from mirrored_game_score")) {
        return new Response(
          JSON.stringify([
            {
              schema: {
                elements: [{ name: "player_id" }, { name: "score" }],
              },
              rows: [{ elements: ["p1", 100] }, { elements: ["p2", 200] }],
              total_duration_micros: 1,
            },
          ]),
          { status: 200 },
        );
      }

      if (sql.includes("from mirrored_game_board_cell")) {
        return new Response(
          JSON.stringify([
            {
              schema: {
                elements: [
                  { name: "question_id" },
                  { name: "value" },
                  { name: "is_used" },
                  { name: "is_daily_double" },
                  { name: "row" },
                  { name: "col" },
                  { name: "category" },
                ],
              },
              rows: [{ elements: ["q-99", 400, true, false, 0, 0, "Science"] }],
              total_duration_micros: 1,
            },
          ]),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify([]), { status: 200 });
    }) as typeof fetch;

    const service = new SpacetimeReadService(
      {
        baseUrl: "https://stdb.example.com/",
        database: "jprty-room-runtime",
        readsEnabled: true,
      },
      fetchStub,
    );

    const snapshot = await service.getGameSnapshotByRoomId("room-2");
    expect(snapshot?.currentQuestion).toEqual({
      id: "q-99",
      clue: "This clue came from mirrored state",
      category: "Science",
      value: 400,
    });
  });
});

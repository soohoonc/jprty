import { afterEach, describe, expect, test } from "bun:test";
import { SpacetimeMirrorService, toMirrorPlayer, toMirrorRoom } from "./spacetimedb-mirror";

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
    ]);
  });
});

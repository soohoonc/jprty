import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

const originalFetch = globalThis.fetch;
const originalEnv = {
	SPACETIMEDB_URL: process.env.SPACETIMEDB_URL,
	SPACETIMEDB_DATABASE: process.env.SPACETIMEDB_DATABASE,
	SPACETIMEDB_TOKEN: process.env.SPACETIMEDB_TOKEN,
};

let canProvisionRoomInSpacetime: () => boolean;
let provisionRoomInSpacetime: (room: {
	id: string;
	code: string;
	maxPlayers: number;
	status: "WAITING" | "IN_GAME" | "FINISHED" | "CLOSED";
}) => Promise<boolean>;
let syncRoomPlayerInSpacetime: (player: {
	playerId: string;
	roomId: string;
	name: string;
	guestName: string;
	isHost: boolean;
	isActive: boolean;
	score: number;
	joinedAt: string;
}) => Promise<boolean>;
let removeRoomPlayerInSpacetime: (playerId: string) => Promise<boolean>;

beforeAll(async () => {
	mock.module("server-only", () => ({}));
	const module = await import("./spacetimedb-room-provision");
	canProvisionRoomInSpacetime = module.canProvisionRoomInSpacetime;
	provisionRoomInSpacetime = module.provisionRoomInSpacetime;
	syncRoomPlayerInSpacetime = module.syncRoomPlayerInSpacetime;
	removeRoomPlayerInSpacetime = module.removeRoomPlayerInSpacetime;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
	process.env.SPACETIMEDB_URL = originalEnv.SPACETIMEDB_URL;
	process.env.SPACETIMEDB_DATABASE = originalEnv.SPACETIMEDB_DATABASE;
	process.env.SPACETIMEDB_TOKEN = originalEnv.SPACETIMEDB_TOKEN;
});

describe("spacetimedb-room-provision", () => {
	test("returns false without required config", async () => {
		process.env.SPACETIMEDB_URL = "";
		process.env.SPACETIMEDB_DATABASE = "";
		process.env.SPACETIMEDB_TOKEN = "";

		const fetchCalls: unknown[] = [];
		globalThis.fetch = ((...args: unknown[]) => {
			fetchCalls.push(args);
			return Promise.resolve(new Response(null, { status: 200 }));
		}) as typeof fetch;

		expect(canProvisionRoomInSpacetime()).toBe(false);
		expect(
			await provisionRoomInSpacetime({
				id: "room-1",
				code: "ABCD",
				maxPlayers: 8,
				status: "WAITING",
			}),
		).toBe(false);
		expect(
			await syncRoomPlayerInSpacetime({
				playerId: "player-1",
				roomId: "room-1",
				name: "Host",
				guestName: "Host",
				isHost: true,
				isActive: true,
				score: 0,
				joinedAt: "2026-01-01T00:00:00.000Z",
			}),
		).toBe(false);
		expect(await removeRoomPlayerInSpacetime("player-1")).toBe(false);
		expect(fetchCalls).toHaveLength(0);
	});

	test("posts sync_live_room reducer call when configured", async () => {
		process.env.SPACETIMEDB_URL = "https://stdb.example.com/";
		process.env.SPACETIMEDB_DATABASE = "jprty-room-runtime";
		process.env.SPACETIMEDB_TOKEN = "token-123";

		const requests: Array<{ url: string; init?: RequestInit }> = [];
		globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
			requests.push({ url: String(url), init });
			return Promise.resolve(new Response(null, { status: 200 }));
		}) as typeof fetch;

		expect(canProvisionRoomInSpacetime()).toBe(true);
		expect(
			await provisionRoomInSpacetime({
				id: "room-1",
				code: "ABCD",
				maxPlayers: 8,
				status: "WAITING",
			}),
		).toBe(true);

		expect(requests).toEqual([
			{
				url: "https://stdb.example.com/v1/database/jprty-room-runtime/call/sync_live_room",
				init: {
					method: "POST",
					headers: {
						"content-type": "application/json",
						authorization: "Bearer token-123",
					},
					body: JSON.stringify([
						"room-1",
						"ABCD",
						"WAITING",
						"LOBBY",
						8,
						0,
						false,
					]),
				},
			},
		]);
	});

	test("posts sync_live_room_player reducer call with expected args", async () => {
		process.env.SPACETIMEDB_URL = "https://stdb.example.com/";
		process.env.SPACETIMEDB_DATABASE = "jprty-room-runtime";
		process.env.SPACETIMEDB_TOKEN = "token-123";

		const requests: Array<{ url: string; init?: RequestInit }> = [];
		globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
			requests.push({ url: String(url), init });
			return Promise.resolve(new Response(null, { status: 200 }));
		}) as typeof fetch;

		expect(
			await syncRoomPlayerInSpacetime({
				playerId: "player-1",
				roomId: "room-1",
				name: "Alice",
				guestName: "Alice",
				isHost: false,
				isActive: true,
				score: 0,
				joinedAt: "2026-01-01T00:00:00.000Z",
			}),
		).toBe(true);

		expect(requests).toEqual([
			{
				url: "https://stdb.example.com/v1/database/jprty-room-runtime/call/sync_live_room_player",
				init: {
					method: "POST",
					headers: {
						"content-type": "application/json",
						authorization: "Bearer token-123",
					},
					body: JSON.stringify([
						"player-1",
						"room-1",
						"Alice",
						"Alice",
						false,
						true,
						0,
						"2026-01-01T00:00:00.000Z",
					]),
				},
			},
		]);
	});

	test("posts remove_live_room_player reducer call with expected args", async () => {
		process.env.SPACETIMEDB_URL = "https://stdb.example.com/";
		process.env.SPACETIMEDB_DATABASE = "jprty-room-runtime";
		process.env.SPACETIMEDB_TOKEN = "token-123";

		const requests: Array<{ url: string; init?: RequestInit }> = [];
		globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
			requests.push({ url: String(url), init });
			return Promise.resolve(new Response(null, { status: 200 }));
		}) as typeof fetch;

		expect(await removeRoomPlayerInSpacetime("player-1")).toBe(true);
		expect(requests).toEqual([
			{
				url: "https://stdb.example.com/v1/database/jprty-room-runtime/call/remove_live_room_player",
				init: {
					method: "POST",
					headers: {
						"content-type": "application/json",
						authorization: "Bearer token-123",
					},
					body: JSON.stringify(["player-1"]),
				},
			},
		]);
	});

	test("throws when reducer call fails", async () => {
		process.env.SPACETIMEDB_URL = "https://stdb.example.com/";
		process.env.SPACETIMEDB_DATABASE = "jprty-room-runtime";
		process.env.SPACETIMEDB_TOKEN = "";

		globalThis.fetch = (() =>
			Promise.resolve(
				new Response("boom", { status: 500 }),
			)) as unknown as typeof fetch;

		await expect(
			provisionRoomInSpacetime({
				id: "room-1",
				code: "ABCD",
				maxPlayers: 8,
				status: "WAITING",
			}),
		).rejects.toThrow("SpacetimeDB reducer sync_live_room failed (500): boom");
	});
});

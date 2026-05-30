import "server-only";

interface SpacetimeProvisionConfig {
	baseUrl?: string;
	database?: string;
	token?: string;
}

interface RoomProvisionInput {
	id: string;
	code: string;
	maxPlayers: number;
	status: "WAITING" | "IN_GAME" | "FINISHED" | "CLOSED";
}

interface RoomPlayerMirrorInput {
	playerId: string;
	roomId: string;
	name: string;
	guestName: string;
	isHost: boolean;
	isActive: boolean;
	score: number;
	joinedAt: string;
}

function normalizeBaseUrl(baseUrl: string) {
	return baseUrl.replace(/\/+$/, "");
}

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

function getConfig(): SpacetimeProvisionConfig {
	return {
		baseUrl: cleanEnv(process.env.SPACETIMEDB_URL),
		database: cleanEnv(process.env.SPACETIMEDB_DATABASE),
		token: cleanEnv(process.env.SPACETIMEDB_TOKEN),
	};
}

function headers(config: SpacetimeProvisionConfig) {
	return {
		"content-type": "application/json",
		...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
	};
}

function reducerUrl(baseUrl: string, database: string, reducer: string) {
	return `${normalizeBaseUrl(baseUrl)}/v1/database/${database}/call/${reducer}`;
}

async function callReducer(reducer: string, args: unknown[]) {
	const config = getConfig();
	if (!config.baseUrl || !config.database) {
		return false;
	}

	const response = await fetch(
		reducerUrl(config.baseUrl, config.database, reducer),
		{
			method: "POST",
			headers: headers(config),
			body: JSON.stringify(args),
		},
	);

	if (!response.ok) {
		const body = await response.text();
		throw new Error(
			`SpacetimeDB reducer ${reducer} failed (${response.status}): ${body}`,
		);
	}

	return true;
}

export function canProvisionRoomInSpacetime() {
	const config = getConfig();
	return Boolean(config.baseUrl && config.database);
}

export async function provisionRoomInSpacetime(room: RoomProvisionInput) {
	return callReducer("sync_live_room", [
		room.id,
		room.code,
		room.status,
		"LOBBY",
		room.maxPlayers,
		0,
		false,
	]);
}

export async function syncRoomPlayerInSpacetime(player: RoomPlayerMirrorInput) {
	return callReducer("sync_live_room_player", [
		player.playerId,
		player.roomId,
		player.name,
		player.guestName,
		player.isHost,
		player.isActive,
		player.score,
		player.joinedAt,
	]);
}

export async function removeRoomPlayerInSpacetime(playerId: string) {
	return callReducer("remove_live_room_player", [playerId]);
}

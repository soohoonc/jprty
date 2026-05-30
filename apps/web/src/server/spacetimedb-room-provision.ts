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

function normalizeBaseUrl(baseUrl: string) {
	return baseUrl.replace(/\/+$/, "");
}

function getConfig(): SpacetimeProvisionConfig {
	return {
		baseUrl: process.env.SPACETIMEDB_URL,
		database: process.env.SPACETIMEDB_DATABASE,
		token: process.env.SPACETIMEDB_TOKEN,
	};
}

export function canProvisionRoomInSpacetime() {
	const config = getConfig();
	return Boolean(config.baseUrl && config.database);
}

export async function provisionRoomInSpacetime(room: RoomProvisionInput) {
	const config = getConfig();
	if (!config.baseUrl || !config.database) {
		return false;
	}

	const response = await fetch(
		`${normalizeBaseUrl(config.baseUrl)}/v1/database/${config.database}/call/sync_live_room`,
		{
			method: "POST",
			headers: {
				"content-type": "application/json",
				...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
			},
			body: JSON.stringify([
				room.id,
				room.code,
				room.status,
				"LOBBY",
				room.maxPlayers,
				0,
				false,
			]),
		},
	);

	if (!response.ok) {
		const body = await response.text();
		throw new Error(
			`SpacetimeDB reducer sync_live_room failed (${response.status}): ${body}`,
		);
	}

	return true;
}

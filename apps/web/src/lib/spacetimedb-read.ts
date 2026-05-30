import type {
	LiveRoomRuntimePlayer,
	LiveRoomRuntimeSnapshot,
} from "@jprty/shared";

interface SqlStmtResult {
	schema?: {
		elements?: Array<{
			name?: string;
		}>;
	};
	rows: unknown[];
}

function normalizeBaseUrl(baseUrl: string) {
	return baseUrl.replace(/\/+$/, "");
}

function escapeSqlString(value: string) {
	return value.replace(/'/g, "''");
}

function coerceBoolean(value: unknown): boolean {
	if (typeof value === "boolean") return value;
	if (typeof value === "string")
		return value.toLowerCase() === "true" || value === "1";
	if (typeof value === "number") return value !== 0;
	return false;
}

function coerceNumber(value: unknown, fallback = 0): number {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return fallback;
}

function coerceString(value: unknown, fallback = ""): string {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean")
		return String(value);
	return fallback;
}

function getObjectValue(row: unknown, key: string): unknown {
	if (!row || typeof row !== "object" || Array.isArray(row)) return undefined;
	return (row as Record<string, unknown>)[key];
}

function getRowElements(row: unknown): unknown[] | null {
	if (Array.isArray(row)) return row;
	const elements = getObjectValue(row, "elements");
	if (Array.isArray(elements)) return elements;
	return null;
}

function getFieldNames(stmt: SqlStmtResult): string[] {
	return (
		stmt.schema?.elements
			?.map((element) => {
				if (typeof element.name === "string") {
					return element.name;
				}
				const wrapped = element.name as { some?: string } | undefined;
				if (wrapped && typeof wrapped.some === "string") {
					return wrapped.some;
				}
				return "";
			})
			.filter(Boolean) || []
	);
}

function getFieldValue(
	row: unknown,
	key: string,
	fieldNames: string[],
): unknown {
	const directValue = getObjectValue(row, key);
	if (directValue !== undefined) return directValue;

	const elements = getRowElements(row);
	if (!elements) return undefined;

	const index = fieldNames.indexOf(key);
	if (index === -1) return undefined;
	return elements[index];
}

async function querySql(
	sqlUrl: string,
	sql: string,
	token?: string,
): Promise<Array<Record<string, unknown>>> {
	const response = await fetch(sqlUrl, {
		method: "POST",
		headers: {
			"content-type": "text/plain",
			...(token ? { authorization: `Bearer ${token}` } : {}),
		},
		body: sql,
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`SpacetimeDB sql failed (${response.status}): ${body}`);
	}

	const json = (await response.json()) as SqlStmtResult[];
	const statement = json[0];
	if (!statement) return [];

	const fieldNames = getFieldNames(statement);
	return statement.rows.map((row) => {
		if (
			row &&
			typeof row === "object" &&
			!Array.isArray(row) &&
			!getRowElements(row)
		) {
			return row as Record<string, unknown>;
		}

		const mapped: Record<string, unknown> = {};
		for (const fieldName of fieldNames) {
			mapped[fieldName] = getFieldValue(row, fieldName, fieldNames);
		}
		return mapped;
	});
}

export async function getRoomByCodeFromSpacetime(args: {
	baseUrl: string;
	database: string;
	roomCode: string;
	token?: string;
}): Promise<LiveRoomRuntimeSnapshot | null> {
	const sqlUrl = `${normalizeBaseUrl(args.baseUrl)}/v1/database/${args.database}/sql`;
	const normalizedCode = args.roomCode.toUpperCase();
	const roomRows = await querySql(
		sqlUrl,
		`select room_id, room_code, status, phase, max_players, num_players, host_connected from live_room where room_code = '${escapeSqlString(normalizedCode)}' limit 1`,
		args.token,
	);

	const room = roomRows[0];
	if (!room) return null;

	const roomId = coerceString(room.room_id);
	const playerRows = await querySql(
		sqlUrl,
		`select player_id, room_id, name, guest_name, is_host, is_active, score, joined_at from live_room_player where room_id = '${escapeSqlString(roomId)}'`,
		args.token,
	);

	const players: LiveRoomRuntimePlayer[] = playerRows
		.map((player) => ({
			id: coerceString(player.player_id),
			name: coerceString(player.name) || undefined,
			guestName: coerceString(player.guest_name) || undefined,
			score: coerceNumber(player.score),
			isHost: coerceBoolean(player.is_host),
			isActive: coerceBoolean(player.is_active),
			joinedAt: coerceString(player.joined_at) || undefined,
		}))
		.filter((player) => player.isActive)
		.sort((a, b) => {
			const aJoined = a.joinedAt ?? "";
			const bJoined = b.joinedAt ?? "";
			return aJoined.localeCompare(bJoined);
		});

	return {
		backend: "spacetimedb",
		roomId,
		roomCode: coerceString(room.room_code).toUpperCase(),
		status: coerceString(room.status) as LiveRoomRuntimeSnapshot["status"],
		phase: coerceString(room.phase) as LiveRoomRuntimeSnapshot["phase"],
		maxPlayers: coerceNumber(room.max_players, 8),
		numPlayers: players.length,
		hostConnected: coerceBoolean(room.host_connected),
		players,
	};
}

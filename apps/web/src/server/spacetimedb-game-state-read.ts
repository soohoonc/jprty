import "server-only";

interface SqlStmtResult {
	schema?: {
		elements?: Array<{
			name?: string;
		}>;
	};
	rows: unknown[];
}

export interface RuntimeGameStateSnapshot {
	roomId: string;
	phase: string;
	roundType: string;
	roundNumber: number;
	totalRounds: number;
	scores: [string, number][];
	board: {
		categories: string[];
		grid: Array<{
			questionId: string;
			value: number;
			isUsed: boolean;
			isDailyDouble: boolean;
			row: number;
			col: number;
		}>;
	};
	currentQuestion?: {
		id: string;
		clue: string;
		category?: string;
		value?: number;
	};
	currentPlayerId?: string;
	selectorPlayerId?: string;
	buzzQueue: string[];
	timeRemaining?: number;
	currentWager?: number;
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
			?.map((element) => element.name || "")
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

function getSpacetimeReadConfig() {
	return {
		enabled: process.env.SPACETIMEDB_READS_ENABLED === "true",
		baseUrl: process.env.SPACETIMEDB_URL,
		database: process.env.SPACETIMEDB_DATABASE,
		token: process.env.SPACETIMEDB_TOKEN,
	};
}

export function canReadGameStateFromSpacetime() {
	const config = getSpacetimeReadConfig();
	return Boolean(config.enabled && config.baseUrl && config.database);
}

export async function getGameStateFromSpacetimeByRoomCode(
	roomCode: string,
): Promise<RuntimeGameStateSnapshot | null> {
	const config = getSpacetimeReadConfig();
	if (!config.enabled || !config.baseUrl || !config.database) {
		return null;
	}

	const sqlUrl = `${normalizeBaseUrl(config.baseUrl)}/v1/database/${config.database}/sql`;
	const normalizedCode = roomCode.toUpperCase();
	const roomRows = await querySql(
		sqlUrl,
		`select room_id from live_room where room_code = '${escapeSqlString(normalizedCode)}' limit 1`,
		config.token,
	);

	const roomId = coerceString(roomRows[0]?.room_id);
	if (!roomId) return null;

	const gameStateRows = await querySql(
		sqlUrl,
		`select room_id, phase, round_type, round_number, total_rounds, selector_player_id, current_player_id, current_question_id, current_question_clue, current_question_category, current_question_value, time_remaining, current_wager from mirrored_game_state where room_id = '${escapeSqlString(roomId)}' limit 1`,
		config.token,
	);
	const stateRow = gameStateRows[0];
	if (!stateRow) return null;

	const scoreRows = await querySql(
		sqlUrl,
		`select player_id, score from mirrored_game_score where room_id = '${escapeSqlString(roomId)}' order by score desc`,
		config.token,
	);
	const boardRows = await querySql(
		sqlUrl,
		`select question_id, value, is_used, is_daily_double, row, col, category from mirrored_game_board_cell where room_id = '${escapeSqlString(roomId)}' order by row asc, col asc`,
		config.token,
	);

	const currentQuestionId = coerceString(stateRow.current_question_id);
	const currentQuestionClue = coerceString(stateRow.current_question_clue);

	const categoriesByColumn = new Map<number, string>();
	for (const row of boardRows) {
		const col = coerceNumber(row.col);
		if (!categoriesByColumn.has(col)) {
			categoriesByColumn.set(col, coerceString(row.category));
		}
	}
	const sortedColumnIndexes = Array.from(categoriesByColumn.keys()).sort(
		(a, b) => a - b,
	);
	const categories = sortedColumnIndexes.map(
		(index) => categoriesByColumn.get(index) || "",
	);

	const grid = boardRows.map((row) => ({
		questionId: coerceString(row.question_id),
		value: coerceNumber(row.value),
		isUsed: coerceBoolean(row.is_used),
		isDailyDouble: coerceBoolean(row.is_daily_double),
		row: coerceNumber(row.row),
		col: coerceNumber(row.col),
	}));

	const timeRemaining = coerceNumber(stateRow.time_remaining, -1);
	const currentWager = coerceNumber(stateRow.current_wager, -1);

	return {
		roomId: coerceString(stateRow.room_id),
		phase: coerceString(stateRow.phase),
		roundType: coerceString(stateRow.round_type),
		roundNumber: coerceNumber(stateRow.round_number, 1),
		totalRounds: coerceNumber(stateRow.total_rounds, 1),
		scores: scoreRows.map((row) => [
			coerceString(row.player_id),
			coerceNumber(row.score),
		]),
		board: {
			categories,
			grid,
		},
		currentQuestion: currentQuestionId
			? {
					id: currentQuestionId,
					clue: currentQuestionClue,
					category:
						coerceString(stateRow.current_question_category) || undefined,
					value: coerceNumber(stateRow.current_question_value, 0),
				}
			: undefined,
		currentPlayerId: coerceString(stateRow.current_player_id) || undefined,
		selectorPlayerId: coerceString(stateRow.selector_player_id) || undefined,
		buzzQueue: [],
		timeRemaining: timeRemaining >= 0 ? timeRemaining : undefined,
		currentWager: currentWager >= 0 ? currentWager : undefined,
	};
}

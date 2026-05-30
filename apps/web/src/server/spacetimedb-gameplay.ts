import "server-only";

import { db } from "@jprty/db";

const BOARD_VALUES = [200, 400, 600, 800, 1000] as const;
const BOARD_CATEGORY_COUNT = 5;

type SpacetimeConfig = {
	baseUrl?: string;
	database?: string;
	token?: string;
};

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

function getConfig(): SpacetimeConfig {
	return {
		baseUrl: cleanEnv(process.env.SPACETIMEDB_URL),
		database: cleanEnv(process.env.SPACETIMEDB_DATABASE),
		token: cleanEnv(process.env.SPACETIMEDB_TOKEN),
	};
}

function normalizeTag(value: string) {
	return value
		.trim()
		.toUpperCase()
		.replace(/[^\w\s]/g, "")
		.replace(/\s+/g, " ");
}

function normalizeAnswer(value: string) {
	return value
		.toLowerCase()
		.replace(/<[^>]+>/g, " ")
		.replace(/\b(a|an|the)\b/g, " ")
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function isAnswerCorrect(guess: string, expected: string) {
	const normalizedGuess = normalizeAnswer(guess);
	const normalizedExpected = normalizeAnswer(expected);
	if (!normalizedGuess || !normalizedExpected) return false;
	if (normalizedGuess === normalizedExpected) return true;
	if (
		normalizedGuess.length >= 4 &&
		(normalizedExpected.includes(normalizedGuess) ||
			normalizedGuess.includes(normalizedExpected))
	) {
		return true;
	}
	return false;
}

function headers(config: SpacetimeConfig) {
	return {
		"content-type": "application/json",
		...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
	};
}

function reducerUrl(baseUrl: string, database: string, reducer: string) {
	return `${normalizeBaseUrl(baseUrl)}/v1/database/${database}/call/${reducer}`;
}

function sqlUrl(baseUrl: string, database: string) {
	return `${normalizeBaseUrl(baseUrl)}/v1/database/${database}/sql`;
}

async function callReducer(reducer: string, args: unknown[]) {
	const config = getConfig();
	if (!config.baseUrl || !config.database) {
		throw new Error(
			"SpacetimeDB is not configured. Missing SPACETIMEDB_URL or SPACETIMEDB_DATABASE.",
		);
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
}

async function runSql(sql: string) {
	const config = getConfig();
	if (!config.baseUrl || !config.database) {
		throw new Error(
			"SpacetimeDB is not configured. Missing SPACETIMEDB_URL or SPACETIMEDB_DATABASE.",
		);
	}

	const response = await fetch(sqlUrl(config.baseUrl, config.database), {
		method: "POST",
		headers: {
			"content-type": "text/plain",
			...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
		},
		body: sql,
	});

	const body = await response.text();
	if (!response.ok) {
		throw new Error(`SpacetimeDB SQL failed (${response.status}): ${body}`);
	}

	return JSON.parse(body) as Array<{
		rows?: Array<Record<string, unknown>>;
		schema?: { elements?: Array<{ name?: string }> };
	}>;
}

function decodeRows(payload: Awaited<ReturnType<typeof runSql>>) {
	const statement = payload[0];
	if (!statement?.rows?.length) return [];
	const rows = statement.rows;
	const fields =
		statement.schema?.elements?.map((el) => {
			const raw = (el as { name?: string | { some?: string } }).name;
			if (typeof raw === "string") {
				return raw;
			}
			return raw?.some || "";
		}) || [];
	return rows.map((row) => {
		if (!Array.isArray(row)) {
			return row;
		}

		const mapped: Record<string, unknown> = {};
		for (let i = 0; i < fields.length; i += 1) {
			const field = fields[i];
			if (field) {
				mapped[field] = row[i];
			}
		}
		return mapped;
	});
}

async function chooseBoardQuestions() {
	const buildValueFallbackBoard = (
		set: {
			id: string;
			questions: Array<{
				id: string;
				clue: string;
				answer: string;
				value: number | null;
			}>;
		},
		eligibleCategories: string[],
	) => {
		const byValue = new Map<
			number,
			Array<{
				id: string;
				clue: string;
				answer: string;
				value: number;
			}>
		>();

		for (const boardValue of BOARD_VALUES) {
			byValue.set(boardValue, []);
		}

		for (const question of set.questions) {
			if (!question.value) continue;
			if (!BOARD_VALUES.includes(question.value as (typeof BOARD_VALUES)[number])) {
				continue;
			}
			const bucket = byValue.get(question.value);
			if (!bucket) continue;
			bucket.push({
				id: question.id,
				clue: question.clue,
				answer: question.answer,
				value: question.value,
			});
		}

		if (
			BOARD_VALUES.some(
				(boardValue) =>
					(byValue.get(boardValue)?.length ?? 0) < BOARD_CATEGORY_COUNT,
			)
		) {
			return null;
		}

		const pickedIds = new Set<string>();
		const board: Array<{
			category: string;
			questions: Array<{
				id: string;
				clue: string;
				answer: string;
				value: number;
			}>;
		}> = [];

		for (let col = 0; col < BOARD_CATEGORY_COUNT; col += 1) {
			const categoryName = eligibleCategories[col] ?? `Category ${col + 1}`;
			const questions = BOARD_VALUES.map((boardValue) => {
				const options = byValue.get(boardValue) ?? [];
				const candidate =
					options.find((question) => !pickedIds.has(question.id)) ??
					options[0];
				if (!candidate) {
					return null;
				}
				pickedIds.add(candidate.id);
				return candidate;
			}).filter(Boolean) as Array<{
				id: string;
				clue: string;
				answer: string;
				value: number;
			}>;

			if (questions.length !== BOARD_VALUES.length) {
				return null;
			}

			board.push({
				category: categoryName,
				questions,
			});
		}

		return board;
	};

	const sets = await db.questionSet.findMany({
		orderBy: { createdAt: "desc" },
		take: 10,
		include: {
			categories: {
				orderBy: { order: "asc" },
				include: { category: true },
			},
			questions: {
				where: {
					value: { in: [...BOARD_VALUES] },
				},
				include: {
					tags: { include: { tag: true } },
				},
				orderBy: { createdAt: "asc" },
			},
		},
	});

	for (const set of sets) {
		const eligibleCategories = set.categories
			.map((entry) => entry.category.name)
			.filter(Boolean);

		const selected: Array<{
			category: string;
			questions: Array<{
				id: string;
				clue: string;
				answer: string;
				value: number;
			}>;
		}> = [];

		for (const categoryName of eligibleCategories) {
			const categoryTag = normalizeTag(categoryName);
			const byValue = new Map<number, { id: string; clue: string; answer: string; value: number }>();

			for (const question of set.questions) {
				if (!question.value) continue;
				if (!BOARD_VALUES.includes(question.value as (typeof BOARD_VALUES)[number])) {
					continue;
				}
				if (
					!question.tags.some((tagLink) => tagLink.tag.name === categoryTag)
				) {
					continue;
				}
				if (!byValue.has(question.value)) {
					byValue.set(question.value, {
						id: question.id,
						clue: question.clue,
						answer: question.answer,
						value: question.value,
					});
				}
			}

			const pickedValues = BOARD_VALUES.map((value) => byValue.get(value)).filter(
				Boolean,
			) as Array<{ id: string; clue: string; answer: string; value: number }>;

			if (pickedValues.length === BOARD_VALUES.length) {
				selected.push({
					category: categoryName,
					questions: pickedValues,
				});
			}

			if (selected.length >= BOARD_CATEGORY_COUNT) {
				break;
			}
		}

		if (selected.length >= BOARD_CATEGORY_COUNT) {
			return selected.slice(0, BOARD_CATEGORY_COUNT);
		}

		const fallback = buildValueFallbackBoard(set, eligibleCategories);
		if (fallback) {
			console.warn(
				`[startGame] Using value-only fallback board for question set ${set.id}`,
			);
			return fallback;
		}
	}

	throw new Error(
		"No board-ready question set found. Seed question data before starting a game.",
	);
}

export async function startSpacetimeGameForRoom(roomCode: string) {
	const normalizedRoomCode = roomCode.toUpperCase();
	const room = await db.room.findUnique({
		where: { code: normalizedRoomCode },
		include: {
			players: {
				where: { isActive: true },
				orderBy: { joinedAt: "asc" },
			},
		},
	});

	if (!room) {
		throw new Error("Room not found");
	}

	if (room.players.length === 0) {
		throw new Error("Cannot start game without players");
	}

	const selector = room.players[0]?.id;
	if (!selector) {
		throw new Error("Missing selector player");
	}

	const board = await chooseBoardQuestions();

	await callReducer("sync_live_room", [
		room.id,
		room.code,
		"IN_GAME",
		"SELECTING",
		room.maxPlayers,
		room.players.length,
		true,
	]);

	for (const player of room.players) {
		await callReducer("sync_live_room_player", [
			player.id,
			room.id,
			player.name,
			player.name,
			Boolean(player.userId && room.hostId && player.userId === room.hostId),
			player.isActive,
			player.score,
			player.joinedAt.toISOString(),
		]);
	}

	await callReducer("start_live_game", [room.id, selector, 1, 1]);

	for (const player of room.players) {
		await callReducer("sync_live_game_score", [
			`${room.id}:${player.id}`,
			room.id,
			player.id,
			player.score,
		]);
	}

	for (let col = 0; col < board.length; col += 1) {
		const category = board[col];
		if (!category) continue;

		for (let row = 0; row < category.questions.length; row += 1) {
			const question = category.questions[row];
			if (!question) continue;

			await callReducer("sync_live_game_board_cell", [
				`${room.id}:${row}:${col}`,
				room.id,
				row,
				col,
				category.category,
				question.id,
				question.clue,
				question.answer,
				question.value,
				false,
				false,
			]);
		}
	}

	await db.room.update({
		where: { id: room.id },
		data: { status: "IN_GAME" },
	});

	return { roomId: room.id, roomCode: room.code };
}

export async function selectSpacetimeQuestion(args: {
	roomCode: string;
	playerId: string;
	questionId: string;
}) {
	const room = await db.room.findUnique({
		where: { code: args.roomCode.toUpperCase() },
		select: { id: true },
	});
	if (!room) throw new Error("Room not found");

	const rows = decodeRows(
		await runSql(
			`select cell_id from live_game_board_cell where room_id = '${room.id}' and question_id = '${args.questionId}' limit 1`,
		),
	);
	const cellId = String(rows[0]?.cell_id || "");
	if (!cellId) throw new Error("Question cell not found");

	await callReducer("select_live_game_cell", [room.id, args.playerId, cellId]);
}

export async function buzzSpacetimeGame(args: {
	roomCode: string;
	playerId: string;
}) {
	const room = await db.room.findUnique({
		where: { code: args.roomCode.toUpperCase() },
		select: { id: true },
	});
	if (!room) throw new Error("Room not found");
	await callReducer("buzz_live_game", [room.id, args.playerId]);
}

export async function answerSpacetimeGame(args: {
	roomCode: string;
	playerId: string;
	answer: string;
}) {
	const room = await db.room.findUnique({
		where: { code: args.roomCode.toUpperCase() },
		select: { id: true },
	});
	if (!room) throw new Error("Room not found");

	const stateRows = decodeRows(
		await runSql(
			`select active_cell_id from live_game_state where room_id = '${room.id}' limit 1`,
		),
	);
	const activeCellId = String(stateRows[0]?.active_cell_id || "");
	if (!activeCellId) throw new Error("No active question");

	const cellRows = decodeRows(
		await runSql(
			`select answer from live_game_board_cell where cell_id = '${activeCellId}' limit 1`,
		),
	);
	const expected = String(cellRows[0]?.answer || "");
	const correct = isAnswerCorrect(args.answer, expected);

	await callReducer("submit_live_game_answer", [room.id, args.playerId, correct]);
	return {
		isCorrect: correct,
		correctAnswer: expected,
	};
}

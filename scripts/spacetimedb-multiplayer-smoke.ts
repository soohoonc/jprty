import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

type JsonObject = Record<string, unknown>;

type RunnerConfig = {
  baseUrl: string;
  database: string;
  token?: string;
};

type Evidence = {
  startedAt: string;
  finishedAt?: string;
  baseUrl: string;
  database: string;
  roomId: string;
  roomCode: string;
  players: string[];
  steps: Array<{ step: string; ok: boolean; detail?: unknown }>;
  assertions: Array<{ check: string; ok: boolean; detail?: unknown }>;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env ${name}`);
  }
  return value;
}

function withAuth(headers: Headers, token?: string) {
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

async function callReducer(config: RunnerConfig, reducer: string, args: JsonObject) {
  const response = await fetch(
    `${config.baseUrl.replace(/\/+$/, "")}/v1/database/${config.database}/call/${reducer}`,
    {
      method: "POST",
      headers: withAuth(new Headers({ "content-type": "application/json" }), config.token),
      body: JSON.stringify(args),
    },
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Reducer ${reducer} failed (${response.status}): ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function runSql(config: RunnerConfig, sql: string) {
  const endpoint = `${config.baseUrl.replace(/\/+$/, "")}/v1/database/${config.database}/sql`;

  const textHeaders = withAuth(new Headers({ "content-type": "text/plain" }), config.token);
  const textResponse = await fetch(endpoint, { method: "POST", headers: textHeaders, body: sql });
  const textBody = await textResponse.text();

  if (!textResponse.ok) {
    throw new Error(`SQL failed (${textResponse.status}): ${textBody}`);
  }

  try {
    return JSON.parse(textBody);
  } catch {
    return textBody;
  }
}

function extractRows(raw: unknown): JsonObject[] {
  if (Array.isArray(raw)) {
    if (raw.length > 0 && typeof raw[0] === "object" && raw[0] !== null && "rows" in (raw[0] as JsonObject)) {
      const first = raw[0] as JsonObject;
      const rows = (first.rows as unknown[]) ?? [];
      const schema = first.schema as JsonObject | undefined;
      const elements = (schema?.elements as Array<{ name?: { some?: string } }>) ?? [];

      if (rows.length > 0 && Array.isArray(rows[0]) && elements.length > 0) {
        return (rows as unknown[][]).map((row) => {
          const obj: JsonObject = {};
          elements.forEach((element, index) => {
            const name = element?.name?.some;
            if (name) {
              obj[name] = row[index];
            }
          });
          return obj;
        });
      }

      return rows as JsonObject[];
    }
    return raw as JsonObject[];
  }

  if (raw && typeof raw === "object") {
    const obj = raw as JsonObject;
    if (Array.isArray(obj.rows)) {
      return obj.rows as JsonObject[];
    }
    if (Array.isArray(obj.data)) {
      return obj.data as JsonObject[];
    }
  }

  return [];
}

function assertAndRecord(evidence: Evidence, check: string, condition: boolean, detail?: unknown) {
  evidence.assertions.push({ check, ok: condition, detail });
  if (!condition) {
    throw new Error(`Assertion failed: ${check}`);
  }
}

async function main() {
  const config: RunnerConfig = {
    baseUrl: requiredEnv("SPACETIMEDB_URL"),
    database: requiredEnv("SPACETIMEDB_DATABASE"),
    token: process.env.SPACETIMEDB_TOKEN,
  };

  const roomId = `room-${Date.now()}`;
  const roomCode = `R${String(Math.floor(Math.random() * 8999) + 1000)}`;
  const p1 = `player-a-${Date.now()}`;
  const p2 = `player-b-${Date.now()}`;

  const outputPath = resolve(
    process.argv[2] || "/workspace/.ouroboros/executions/3/artifacts/spacetimedb-multiplayer-smoke.json",
  );

  const evidence: Evidence = {
    startedAt: new Date().toISOString(),
    baseUrl: config.baseUrl,
    database: config.database,
    roomId,
    roomCode,
    players: [p1, p2],
    steps: [],
    assertions: [],
  };

  const step = async (name: string, fn: () => Promise<unknown>) => {
    const detail = await fn();
    evidence.steps.push({ step: name, ok: true, detail });
  };

  await step("sync_live_room", () =>
    callReducer(config, "sync_live_room", {
      room_id: roomId,
      room_code: roomCode,
      status: "WAITING",
      phase: "LOBBY",
      max_players: 4,
      num_players: 0,
      host_connected: false,
    }),
  );

  await step("sync_live_room_player host", () =>
    callReducer(config, "sync_live_room_player", {
      player_id: p1,
      room_id: roomId,
      name: "Player A",
      guest_name: "Player A",
      is_host: false,
      is_active: true,
      score: 0,
      joined_at: new Date().toISOString(),
    }),
  );

  await step("sync_live_room_player challenger", () =>
    callReducer(config, "sync_live_room_player", {
      player_id: p2,
      room_id: roomId,
      name: "Player B",
      guest_name: "Player B",
      is_host: false,
      is_active: true,
      score: 0,
      joined_at: new Date().toISOString(),
    }),
  );

  await step("start_live_game", () =>
    callReducer(config, "start_live_game", {
      room_id: roomId,
      selector_player_id: p1,
      round_number: 1,
      total_rounds: 1,
    }),
  );

  await step("sync_live_game_score p1", () =>
    callReducer(config, "sync_live_game_score", {
      score_id: `${roomId}:${p1}`,
      room_id: roomId,
      player_id: p1,
      score: 0,
    }),
  );
  await step("sync_live_game_score p2", () =>
    callReducer(config, "sync_live_game_score", {
      score_id: `${roomId}:${p2}`,
      room_id: roomId,
      player_id: p2,
      score: 0,
    }),
  );

  await step("sync_live_game_board_cell 0", () =>
    callReducer(config, "sync_live_game_board_cell", {
      cell_id: `${roomId}:0:0`,
      room_id: roomId,
      row: 0,
      col: 0,
      category: "SCIENCE",
      question_id: "q-1",
      clue: "The force that pulls objects toward Earth is called this.",
      answer: "gravity",
      value: 200,
      is_used: false,
      is_daily_double: false,
    }),
  );

  await step("sync_live_game_board_cell 1", () =>
    callReducer(config, "sync_live_game_board_cell", {
      cell_id: `${roomId}:1:0`,
      room_id: roomId,
      row: 1,
      col: 0,
      category: "SCIENCE",
      question_id: "q-2",
      clue: "This planet is known as the Red Planet.",
      answer: "mars",
      value: 400,
      is_used: false,
      is_daily_double: false,
    }),
  );

  await step("select_live_game_cell", () =>
    callReducer(config, "select_live_game_cell", {
      room_id: roomId,
      selector_player_id: p1,
      cell_id: `${roomId}:0:0`,
    }),
  );

  await step("buzz_live_game", () =>
    callReducer(config, "buzz_live_game", { room_id: roomId, player_id: p2 }),
  );

  await step("submit_live_game_answer", () =>
    callReducer(config, "submit_live_game_answer", {
      room_id: roomId,
      player_id: p2,
      is_correct: true,
    }),
  );

  const gameStateRows = extractRows(await runSql(config, `SELECT * FROM live_game_state WHERE room_id = '${roomId}';`));
  const scoreRows = extractRows(await runSql(config, `SELECT * FROM live_game_score WHERE room_id = '${roomId}';`));
  const boardRows = extractRows(await runSql(config, `SELECT * FROM live_game_board_cell WHERE room_id = '${roomId}';`));

  const stateRow = gameStateRows[0] || {};
  const p1Score = scoreRows.find((row) => row.player_id === p1)?.score;
  const p2Score = scoreRows.find((row) => row.player_id === p2)?.score;
  const firstCell = boardRows.find((row) => row.cell_id === `${roomId}:0:0`);

  assertAndRecord(evidence, "state row exists", gameStateRows.length === 1, gameStateRows);
  assertAndRecord(evidence, "phase reset to SELECTING", stateRow.phase === "SELECTING", stateRow);
  assertAndRecord(evidence, "turn moved to correct player", stateRow.selector_player_id === p2, stateRow);
  assertAndRecord(evidence, "winner score incremented", p2Score === 200, scoreRows);
  assertAndRecord(evidence, "other player score unchanged", p1Score === 0, scoreRows);
  assertAndRecord(evidence, "selected cell marked used", firstCell?.is_used === true, firstCell);

  evidence.finishedAt = new Date().toISOString();

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(evidence, null, 2));

  console.log(`Wrote smoke evidence: ${outputPath}`);
}

main().catch(async (error) => {
  const outputPath = resolve(
    process.argv[2] || "/workspace/.ouroboros/executions/3/artifacts/spacetimedb-multiplayer-smoke.json",
  );
  const failed = {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    at: new Date().toISOString(),
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(failed, null, 2));
  console.error(failed.error);
  process.exit(1);
});

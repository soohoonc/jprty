import { db } from "@jprty/db";
import type { LiveRoomRuntimePlayer, LiveRoomRuntimeSnapshot } from "@jprty/shared";
import type { GameStateSnapshot } from "../game/state";

interface SpacetimeReadConfig {
  baseUrl?: string;
  database?: string;
  token?: string;
  readsEnabled?: boolean;
}

interface SqlStmtResult {
  schema?: {
    elements?: Array<{
      name?: string;
    }>;
  };
  rows: unknown[];
}

type FetchLike = typeof fetch;

function defaultConfig(): SpacetimeReadConfig {
  return {
    baseUrl: process.env.SPACETIMEDB_URL,
    database: process.env.SPACETIMEDB_DATABASE,
    token: process.env.SPACETIMEDB_TOKEN,
    readsEnabled: process.env.SPACETIMEDB_READS_ENABLED === "true",
  };
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function escapeSqlString(value: string) {
  return value.replace(/'/g, "''");
}

function coerceBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.toLowerCase() === "true" || value === "1";
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  return false;
}

function coerceNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function coerceString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
}

function getObjectValue(row: unknown, key: string): unknown {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return undefined;
  }
  return (row as Record<string, unknown>)[key];
}

function getRowElements(row: unknown): unknown[] | null {
  if (Array.isArray(row)) {
    return row;
  }
  const elements = getObjectValue(row, "elements");
  if (Array.isArray(elements)) {
    return elements;
  }
  return null;
}

function getFieldNames(stmt: SqlStmtResult): string[] {
  return (
    stmt.schema?.elements?.map((element) => element.name || "").filter(Boolean) || []
  );
}

function getFieldValue(
  row: unknown,
  key: string,
  fieldNames: string[],
): unknown {
  const directValue = getObjectValue(row, key);
  if (directValue !== undefined) {
    return directValue;
  }

  const elements = getRowElements(row);
  if (!elements) {
    return undefined;
  }

  const index = fieldNames.indexOf(key);
  if (index === -1) {
    return undefined;
  }

  return elements[index];
}

export class SpacetimeReadService {
  constructor(
    private readonly config: SpacetimeReadConfig = defaultConfig(),
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  isEnabled() {
    return Boolean(
      this.config.readsEnabled && this.config.baseUrl && this.config.database,
    );
  }

  async getRoomByCode(roomCode: string): Promise<LiveRoomRuntimeSnapshot | null> {
    const normalizedCode = roomCode.toUpperCase();
    const rows = await this.query(
      `select room_id, room_code, status, phase, max_players, num_players, host_connected from live_room where room_code = '${escapeSqlString(normalizedCode)}' limit 1`,
    );

    const room = rows[0];
    if (!room) {
      return null;
    }

    return this.buildRoomSnapshot(room);
  }

  async getRoomById(roomId: string): Promise<LiveRoomRuntimeSnapshot | null> {
    const rows = await this.query(
      `select room_id, room_code, status, phase, max_players, num_players, host_connected from live_room where room_id = '${escapeSqlString(roomId)}' limit 1`,
    );

    const room = rows[0];
    if (!room) {
      return null;
    }

    return this.buildRoomSnapshot(room);
  }

  async getGameSnapshotByRoomId(roomId: string): Promise<GameStateSnapshot | null> {
    const gameStateRows = await this.query(
      `select room_id, phase, round_type, round_number, total_rounds, selector_player_id, current_player_id, current_question_id, current_question_category, current_question_value, time_remaining, current_wager from mirrored_game_state where room_id = '${escapeSqlString(roomId)}' limit 1`,
    );
    const stateRow = gameStateRows[0];
    if (!stateRow) {
      return null;
    }

    const scoreRows = await this.query(
      `select player_id, score from mirrored_game_score where room_id = '${escapeSqlString(roomId)}' order by score desc`,
    );
    const boardRows = await this.query(
      `select question_id, value, is_used, is_daily_double, row, col, category from mirrored_game_board_cell where room_id = '${escapeSqlString(roomId)}' order by row asc, col asc`,
    );

    const currentQuestionId = coerceString(stateRow.current_question_id);
    let currentQuestionClue = "";
    if (currentQuestionId) {
      const question = await db.question.findUnique({
        where: { id: currentQuestionId },
        select: { clue: true },
      });
      currentQuestionClue = question?.clue || "";
    }

    const categoriesByColumn = new Map<number, string>();
    for (const row of boardRows) {
      const col = coerceNumber(row.col);
      if (!categoriesByColumn.has(col)) {
        categoriesByColumn.set(col, coerceString(row.category));
      }
    }
    const sortedColumnIndexes = Array.from(categoriesByColumn.keys()).sort((a, b) => a - b);
    const categories = sortedColumnIndexes.map((index) => categoriesByColumn.get(index) || "");

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
      phase: coerceString(stateRow.phase) as GameStateSnapshot["phase"],
      roundType: coerceString(stateRow.round_type) as GameStateSnapshot["roundType"],
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
            category: coerceString(stateRow.current_question_category) || undefined,
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

  private async buildRoomSnapshot(
    room: Record<string, unknown>,
  ): Promise<LiveRoomRuntimeSnapshot> {
    const roomId = coerceString(room.room_id);
    const playerRows = await this.query(
      `select player_id, room_id, name, guest_name, is_host, is_active, score, joined_at from live_room_player where room_id = '${escapeSqlString(roomId)}' and is_active = true order by joined_at asc`,
    );

    const players: LiveRoomRuntimePlayer[] = playerRows.map((player) => ({
      id: coerceString(player.player_id),
      name: coerceString(player.name) || undefined,
      guestName: coerceString(player.guest_name) || undefined,
      score: coerceNumber(player.score),
      isHost: coerceBoolean(player.is_host),
      isActive: coerceBoolean(player.is_active),
      joinedAt: coerceString(player.joined_at) || undefined,
    }));

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

  private async query(sql: string): Promise<Array<Record<string, unknown>>> {
    if (!this.isEnabled()) {
      return [];
    }

    const response = await this.fetchImpl(this.sqlUrl(), {
      method: "POST",
      headers: this.headers(),
      body: sql,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`SpacetimeDB sql failed (${response.status}): ${body}`);
    }

    const json = (await response.json()) as SqlStmtResult[];
    const statement = json[0];
    if (!statement) {
      return [];
    }

    const fieldNames = getFieldNames(statement);
    return statement.rows.map((row) => {
      if (row && typeof row === "object" && !Array.isArray(row) && !getRowElements(row)) {
        return row as Record<string, unknown>;
      }

      const mapped: Record<string, unknown> = {};
      for (const fieldName of fieldNames) {
        mapped[fieldName] = getFieldValue(row, fieldName, fieldNames);
      }
      return mapped;
    });
  }

  private headers() {
    return {
      "content-type": "text/plain",
      ...(this.config.token ? { authorization: `Bearer ${this.config.token}` } : {}),
    };
  }

  private sqlUrl() {
    return `${normalizeBaseUrl(this.config.baseUrl!)}/v1/database/${this.config.database}/sql`;
  }
}

export const spacetimeRead = new SpacetimeReadService();

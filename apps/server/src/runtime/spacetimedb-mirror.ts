import type {
  GamePhase,
  LiveRoomRuntimePlayer,
  LiveRoomRuntimeSnapshot,
  RoomStatus,
} from "@jprty/shared";
import type { GameStateSnapshot } from "../game/state";

export interface SpacetimeMirrorConfig {
  baseUrl?: string;
  database?: string;
  token?: string;
}

export interface SpacetimeMirrorRoomRecord {
  roomId: string;
  roomCode: string;
  status: RoomStatus;
  phase: GamePhase | "LOBBY";
  maxPlayers: number;
  numPlayers: number;
  hostConnected: boolean;
}

export interface SpacetimeMirrorPlayerRecord {
  playerId: string;
  roomId: string;
  name: string;
  guestName: string;
  isHost: boolean;
  isActive: boolean;
  score: number;
  joinedAt: string;
}

export interface SpacetimeMirrorGameStateRecord {
  roomId: string;
  phase: string;
  roundType: string;
  roundNumber: number;
  totalRounds: number;
  selectorPlayerId: string;
  currentPlayerId: string;
  currentQuestionId: string;
  currentQuestionClue: string;
  currentQuestionCategory: string;
  currentQuestionValue: number;
  timeRemaining: number;
  currentWager: number;
}

export interface SpacetimeMirrorGameScoreRecord {
  scoreId: string;
  roomId: string;
  playerId: string;
  score: number;
}

export interface SpacetimeMirrorBoardCellRecord {
  cellId: string;
  roomId: string;
  roundNumber: number;
  row: number;
  col: number;
  category: string;
  questionId: string;
  value: number;
  isUsed: boolean;
  isDailyDouble: boolean;
}

type FetchLike = typeof fetch;

function defaultConfig(): SpacetimeMirrorConfig {
  return {
    baseUrl: process.env.SPACETIMEDB_URL,
    database: process.env.SPACETIMEDB_DATABASE,
    token: process.env.SPACETIMEDB_TOKEN,
  };
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function toRoomArgs(room: SpacetimeMirrorRoomRecord) {
  return [
    room.roomId,
    room.roomCode,
    room.status,
    room.phase,
    room.maxPlayers,
    room.numPlayers,
    room.hostConnected,
  ];
}

function toPlayerArgs(player: SpacetimeMirrorPlayerRecord) {
  return [
    player.playerId,
    player.roomId,
    player.name,
    player.guestName,
    player.isHost,
    player.isActive,
    player.score,
    player.joinedAt,
  ];
}

function toGameStateArgs(state: SpacetimeMirrorGameStateRecord) {
  return [
    state.roomId,
    state.phase,
    state.roundType,
    state.roundNumber,
    state.totalRounds,
    state.selectorPlayerId,
    state.currentPlayerId,
    state.currentQuestionId,
    state.currentQuestionClue,
    state.currentQuestionCategory,
    state.currentQuestionValue,
    state.timeRemaining,
    state.currentWager,
  ];
}

function toGameScoreArgs(score: SpacetimeMirrorGameScoreRecord) {
  return [score.scoreId, score.roomId, score.playerId, score.score];
}

function toGameScoreId(roomId: string, playerId: string) {
  return `${roomId}:${playerId}`;
}

function toBoardCellArgs(cell: SpacetimeMirrorBoardCellRecord) {
  return [
    cell.cellId,
    cell.roomId,
    cell.roundNumber,
    cell.row,
    cell.col,
    cell.category,
    cell.questionId,
    cell.value,
    cell.isUsed,
    cell.isDailyDouble,
  ];
}

export function toMirrorRoom(snapshot: LiveRoomRuntimeSnapshot): SpacetimeMirrorRoomRecord {
  return {
    roomId: snapshot.roomId,
    roomCode: snapshot.roomCode,
    status: snapshot.status,
    phase: snapshot.phase,
    maxPlayers: snapshot.maxPlayers,
    numPlayers: snapshot.numPlayers,
    hostConnected: snapshot.hostConnected,
  };
}

export function toMirrorPlayer(player: LiveRoomRuntimePlayer, roomId: string): SpacetimeMirrorPlayerRecord {
  return {
    playerId: player.id,
    roomId,
    name: player.name || player.guestName || "Guest",
    guestName: player.guestName || player.name || "Guest",
    isHost: player.isHost,
    isActive: player.isActive,
    score: player.score,
    joinedAt: player.joinedAt || new Date(0).toISOString(),
  };
}

export function toMirrorGameState(
  snapshot: GameStateSnapshot,
): SpacetimeMirrorGameStateRecord {
  return {
    roomId: snapshot.roomId,
    phase: snapshot.phase,
    roundType: snapshot.roundType,
    roundNumber: snapshot.roundNumber,
    totalRounds: snapshot.totalRounds,
    selectorPlayerId: snapshot.selectorPlayerId || "",
    currentPlayerId: snapshot.currentPlayerId || "",
    currentQuestionId: snapshot.currentQuestion?.id || "",
    currentQuestionClue: snapshot.currentQuestion?.clue || "",
    currentQuestionCategory: snapshot.currentQuestion?.category || "",
    currentQuestionValue: snapshot.currentQuestion?.value || 0,
    timeRemaining: snapshot.timeRemaining ?? -1,
    currentWager: snapshot.currentWager ?? -1,
  };
}

export function toMirrorGameScores(
  snapshot: GameStateSnapshot,
): SpacetimeMirrorGameScoreRecord[] {
  return snapshot.scores.map(([playerId, score]) => ({
    scoreId: toGameScoreId(snapshot.roomId, playerId),
    roomId: snapshot.roomId,
    playerId,
    score,
  }));
}

export function toMirrorBoardCells(
  snapshot: GameStateSnapshot,
): SpacetimeMirrorBoardCellRecord[] {
  return (
    snapshot.board?.grid?.map((cell) => ({
      cellId: `${snapshot.roomId}:${cell.row}:${cell.col}`,
      roomId: snapshot.roomId,
      roundNumber: snapshot.roundNumber,
      row: cell.row,
      col: cell.col,
      category: snapshot.board?.categories[cell.col] || "",
      questionId: cell.questionId,
      value: cell.value,
      isUsed: cell.isUsed,
      isDailyDouble: cell.isDailyDouble,
    })) || []
  );
}

export class SpacetimeMirrorService {
  constructor(
    private readonly config: SpacetimeMirrorConfig = defaultConfig(),
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  isEnabled() {
    return Boolean(this.config.baseUrl && this.config.database);
  }

  async syncRoom(room: SpacetimeMirrorRoomRecord) {
    return this.callReducer("sync_live_room", toRoomArgs(room));
  }

  async syncPlayer(player: SpacetimeMirrorPlayerRecord) {
    return this.callReducer("sync_live_room_player", toPlayerArgs(player));
  }

  async removePlayer(playerId: string) {
    return this.callReducer("remove_live_room_player", [playerId]);
  }

  async syncGameState(state: SpacetimeMirrorGameStateRecord) {
    return this.callReducer("sync_mirrored_game_state", toGameStateArgs(state));
  }

  async syncGameScore(score: SpacetimeMirrorGameScoreRecord) {
    return this.callReducer("sync_mirrored_game_score", toGameScoreArgs(score));
  }

  async removeGameScore(roomId: string, playerId: string) {
    return this.callReducer("remove_mirrored_game_score", [toGameScoreId(roomId, playerId)]);
  }

  async syncBoardCell(cell: SpacetimeMirrorBoardCellRecord) {
    return this.callReducer("sync_mirrored_game_board_cell", toBoardCellArgs(cell));
  }

  async syncGameplaySnapshot(snapshot: GameStateSnapshot | null) {
    if (!snapshot || !this.isEnabled()) {
      return false;
    }

    await this.syncGameState(toMirrorGameState(snapshot));

    for (const score of toMirrorGameScores(snapshot)) {
      await this.syncGameScore(score);
    }

    for (const cell of toMirrorBoardCells(snapshot)) {
      await this.syncBoardCell(cell);
    }

    return true;
  }

  private async callReducer(reducer: string, args: unknown[]) {
    if (!this.isEnabled()) {
      return false;
    }

    const response = await this.fetchImpl(this.reducerUrl(reducer), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(args),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`SpacetimeDB reducer ${reducer} failed (${response.status}): ${body}`);
    }

    return true;
  }

  private headers() {
    return {
      "content-type": "application/json",
      ...(this.config.token ? { authorization: `Bearer ${this.config.token}` } : {}),
    };
  }

  private reducerUrl(reducer: string) {
    return `${normalizeBaseUrl(this.config.baseUrl!)}/v1/database/${this.config.database}/call/${reducer}`;
  }
}

export const spacetimeMirror = new SpacetimeMirrorService();

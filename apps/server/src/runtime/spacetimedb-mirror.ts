import type {
  GamePhase,
  LiveRoomRuntimePlayer,
  LiveRoomRuntimeSnapshot,
  RoomStatus,
} from "@jprty/shared";

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

import type { GamePhase, Player, RoomStatus } from "./types";

export type LiveRoomRuntimeBackend = "prisma-socket-bridge" | "spacetimedb";

export interface LiveRoomRuntimePlayer extends Player {
  joinedAt?: string;
}

export interface LiveRoomRuntimeSnapshot {
  backend: LiveRoomRuntimeBackend;
  roomId: string;
  roomCode: string;
  status: RoomStatus;
  phase: GamePhase | "LOBBY";
  maxPlayers: number;
  numPlayers: number;
  hostConnected: boolean;
  players: LiveRoomRuntimePlayer[];
}


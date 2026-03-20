import { db } from "@jprty/db";
import type {
  GamePhase,
  JoinedRoomPayload,
  LiveRoomRuntimePlayer,
  LiveRoomRuntimeSnapshot,
  Player,
  PlayerLeftPayload,
  PlayerJoinedPayload,
} from "@jprty/shared";
import { gameState } from "../game/state";
import { roomManager } from "../game/rooms";
import { gameRuntime } from "./game-runtime";

type RoomRecord = Awaited<ReturnType<typeof fetchRoomById>>;

function toLegacyPlayer(player: LiveRoomRuntimePlayer): Player {
  return {
    id: player.id,
    name: player.name,
    guestName: player.guestName,
    score: player.score,
    isHost: player.isHost,
    isActive: player.isActive,
  };
}

function hostPlayer(): LiveRoomRuntimePlayer {
  return {
    id: "host",
    name: "Host",
    guestName: "Host",
    score: 0,
    isHost: true,
    isActive: true,
  };
}

async function fetchRoomById(roomId: string) {
  return db.room.findUnique({
    where: { id: roomId },
    include: {
      players: {
        where: { isActive: true },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
}

async function fetchRoomByCode(roomCode: string) {
  return db.room.findUnique({
    where: { code: roomCode.toUpperCase() },
    include: {
      players: {
        where: { isActive: true },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
}

async function syncRoomPlayerCount(roomId: string) {
  const numPlayers = await db.player.count({
    where: { roomId, isActive: true },
  });

  await db.room.update({
    where: { id: roomId },
    data: { numPlayers },
  });
}

function getRoomPhase(roomId: string): GamePhase | "LOBBY" {
  return gameState.get(roomId)?.phase ?? "LOBBY";
}

export class LiveRoomRuntimeService {
  async joinHost(socketId: string, roomCode: string): Promise<JoinedRoomPayload> {
    const room = await fetchRoomByCode(roomCode);

    if (!room) {
      throw new Error("Room not found");
    }

    roomManager.addConnection(socketId, "host", room.id, true);

    const snapshot = await this.getSnapshot(room.id);
    const player = hostPlayer();

    return {
      room: snapshot,
      players: snapshot.players.map(toLegacyPlayer),
      isHost: true,
      player,
      gameState: gameRuntime.buildActiveGameState(gameState.getSnapshot(room.id)),
    };
  }

  async joinPlayer(
    socketId: string,
    roomCode: string,
    playerName: string,
  ): Promise<{ roomId: string; payload: JoinedRoomPayload }> {
    const room = await fetchRoomByCode(roomCode);

    if (!room) {
      throw new Error("Room not found");
    }

    if (room.status !== "WAITING") {
      throw new Error("Game already started");
    }

    if (room.players.length >= room.maxPlayers) {
      throw new Error("Room is full");
    }

    let player = await db.player.findFirst({
      where: { roomId: room.id, name: playerName },
    });

    if (!player) {
      player = await db.player.create({
        data: {
          roomId: room.id,
          name: playerName,
          isActive: true,
        },
      });
    } else if (!player.isActive) {
      player = await db.player.update({
        where: { id: player.id },
        data: { isActive: true },
      });
    }

    roomManager.addConnection(socketId, player.id, room.id, false);
    await syncRoomPlayerCount(room.id);

    const snapshot = await this.getSnapshot(room.id);
    const playerPayload = snapshot.players.find(({ id }) => id === player.id);

    if (!playerPayload) {
      throw new Error("Player was not added to the room runtime");
    }

    return {
      roomId: room.id,
      payload: {
        room: snapshot,
        players: snapshot.players.map(toLegacyPlayer),
        isHost: false,
        player: toLegacyPlayer(playerPayload),
        gameState: gameRuntime.buildActiveGameState(gameState.getSnapshot(room.id)),
      },
    };
  }

  async leave(socketId: string): Promise<PlayerLeftPayload | null> {
    const connection = roomManager.getConnection(socketId);

    if (!connection) {
      return null;
    }

    await roomManager.leave(socketId);
    await syncRoomPlayerCount(connection.roomId);

    const snapshot = await this.getSnapshot(connection.roomId);

    return {
      room: snapshot,
      players: snapshot.players.map(toLegacyPlayer),
      player: { id: connection.playerId },
    };
  }

  async getSnapshot(roomId: string): Promise<LiveRoomRuntimeSnapshot> {
    const room = await fetchRoomById(roomId);

    if (!room) {
      throw new Error("Room not found");
    }

    return this.toSnapshot(room);
  }

  async getSnapshotByCode(roomCode: string): Promise<LiveRoomRuntimeSnapshot> {
    const room = await fetchRoomByCode(roomCode);

    if (!room) {
      throw new Error("Room not found");
    }

    return this.toSnapshot(room);
  }

  ensureConnection(
    socketId: string,
    roomId: string,
    options: { isHost: boolean; playerId?: string | null },
  ) {
    if (roomManager.getConnection(socketId)) {
      return;
    }

    roomManager.addConnection(
      socketId,
      options.isHost ? "host" : options.playerId || socketId,
      roomId,
      options.isHost,
    );
  }

  isHost(socketId: string) {
    return roomManager.isPlayerHost(socketId);
  }

  getConnection(socketId: string) {
    return roomManager.getConnection(socketId);
  }

  async buildPlayerJoinedPayload(roomId: string, playerId: string): Promise<PlayerJoinedPayload> {
    const snapshot = await this.getSnapshot(roomId);
    const player = snapshot.players.find(({ id }) => id === playerId);

    if (!player) {
      throw new Error("Player not found");
    }

    return {
      room: snapshot,
      players: snapshot.players.map(toLegacyPlayer),
      player: toLegacyPlayer(player),
    };
  }

  private toSnapshot(room: NonNullable<RoomRecord>): LiveRoomRuntimeSnapshot {
    const players: LiveRoomRuntimePlayer[] = room.players.map((player) => ({
      id: player.id,
      name: player.name || undefined,
      guestName: player.name || "Guest",
      score: player.score,
      isHost: false,
      isActive: player.isActive,
      joinedAt: player.joinedAt.toISOString(),
    }));

    return {
      backend: "prisma-socket-bridge",
      roomId: room.id,
      roomCode: room.code,
      status: room.status,
      phase: getRoomPhase(room.id),
      maxPlayers: room.maxPlayers,
      numPlayers: players.length,
      hostConnected: Boolean(roomManager.getHostSocket(room.id)),
      players,
    };
  }
}

export const liveRoomRuntime = new LiveRoomRuntimeService();

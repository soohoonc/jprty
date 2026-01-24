import { db } from '@jprty/db';
import { generateRoomCode } from '../utils';

const MAX_PLAYERS = 8;

export interface RoomConnection {
  socketId: string;
  playerId: string;
  roomId: string;
  isHost: boolean;
}

class RoomManager {
  private connections: Map<string, RoomConnection> = new Map();
  private roomSockets: Map<string, Set<string>> = new Map();

  async create(hostSocketId: string, hostName: string): Promise<{ room: any; player: any }> {
    const code = await generateRoomCode();

    const room = await db.room.create({
      data: {
        code,
        status: 'WAITING',
        maxPlayers: MAX_PLAYERS,
      },
    });

    const player = await db.player.create({
      data: {
        roomId: room.id,
        name: hostName,
        isActive: true,
      },
    });

    // Set the player as the host
    await db.room.update({
      where: { id: room.id },
      data: { hostId: player.userId },
    });

    this.addConnection(hostSocketId, player.id, room.id, true); // isHost = true

    return { room, player };
  }

  async join(socketId: string, code: string, playerName: string): Promise<{ room: any; player: any }> {
    const room = await db.room.findUnique({
      where: { code },
      include: { players: { where: { isActive: true } } },
    });

    if (!room) throw new Error('Room not found');
    if (room.status !== 'WAITING') throw new Error('Game already started');
    if (room.players.length >= room.maxPlayers) throw new Error('Room is full');

    const player = await db.player.create({
      data: {
        roomId: room.id,
        name: playerName,
        isActive: true,
      },
    });

    this.addConnection(socketId, player.id, room.id);

    return { room, player };
  }

  async leave(socketId: string): Promise<void> {
    const connection = this.connections.get(socketId);
    if (!connection) return;

    await db.player.update({
      where: { id: connection.playerId },
      data: { isActive: false },
    });

    this.removeConnection(socketId);

    const remainingPlayers = await db.player.findMany({
      where: { roomId: connection.roomId, isActive: true },
    });

    if (!remainingPlayers || remainingPlayers.length === 0) {
      await db.room.update({
        where: { id: connection.roomId },
        data: { status: 'CLOSED' },
      });
    } else {
      // Transfer host to first remaining player if needed
      const room = await db.room.findUnique({
        where: { id: connection.roomId },
      });
      const firstPlayer = remainingPlayers[0];
      if (room && !room.hostId && firstPlayer?.userId) {
        await db.room.update({
          where: { id: connection.roomId },
          data: { hostId: firstPlayer.userId },
        });
      }
    }
  }

  async reconnect(socketId: string, playerId: string): Promise<RoomConnection | null> {
    const player = await db.player.findUnique({
      where: { id: playerId },
      include: { room: true },
    });

    if (!player || !player.room) return null;

    await db.player.update({
      where: { id: playerId },
      data: { isActive: true },
    });

    // Check if this player was the host (compare by checking if they're first player by join time)
    const isHost = player.room.hostId === player.userId;

    this.addConnection(socketId, playerId, player.roomId, isHost);

    return {
      socketId,
      playerId,
      roomId: player.roomId,
      isHost,
    };
  }

  getConnection(socketId: string): RoomConnection | undefined {
    return this.connections.get(socketId);
  }

  getRoomSockets(roomId: string): string[] {
    return Array.from(this.roomSockets.get(roomId) || []);
  }

  addConnection(socketId: string, playerId: string, roomId: string, isHost: boolean = false): void {
    this.connections.set(socketId, { socketId, playerId, roomId, isHost });

    if (!this.roomSockets.has(roomId)) {
      this.roomSockets.set(roomId, new Set());
    }
    this.roomSockets.get(roomId)!.add(socketId);
  }

  getHostSocket(roomId: string): string | undefined {
    const sockets = this.roomSockets.get(roomId);
    if (!sockets) return undefined;

    for (const socketId of sockets) {
      const conn = this.connections.get(socketId);
      if (conn?.isHost) return socketId;
    }
    return undefined;
  }

  isPlayerHost(socketId: string): boolean {
    const connection = this.connections.get(socketId);
    return connection?.isHost ?? false;
  }

  private removeConnection(socketId: string): void {
    const connection = this.connections.get(socketId);
    if (connection) {
      this.connections.delete(socketId);
      const roomSockets = this.roomSockets.get(connection.roomId);
      if (roomSockets) {
        roomSockets.delete(socketId);
        if (roomSockets.size === 0) {
          this.roomSockets.delete(connection.roomId);
        }
      }
    }
  }
}

export const roomManager = new RoomManager();
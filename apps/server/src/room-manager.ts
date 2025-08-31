import { Socket } from 'socket.io';
import { generateRoomCode } from './utils';

export interface Player {
  id: string;
  socketId: string;
  userId?: string;
  name: string;
  isHost: boolean;
  score: number;
  isActive: boolean;
}

export interface Room {
  id: string;
  code: string;
  hostId: string;
  players: Map<string, Player>;
  status: 'WAITING' | 'IN_GAME' | 'FINISHED' | 'CLOSED';
  maxPlayers: number;
  createdAt: Date;
  gameSessionId?: string;
  configuration?: GameConfiguration;
}

export interface GameConfiguration {
  buzzWindow: number;
  responseWindow: number;
  revealWindow: number;
  minYear?: number;
  maxYear?: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT';
  categoryTags: string[];
}

class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private socketToRoom: Map<string, string> = new Map();
  private roomCodeToId: Map<string, string> = new Map();

  createRoom(hostSocketId: string, hostName: string, userId?: string): Room {
    const roomId = this.generateRoomId();
    const roomCode = this.generateUniqueRoomCode();

    const host: Player = {
      id: this.generatePlayerId(),
      socketId: hostSocketId,
      userId,
      name: hostName,
      isHost: true,
      score: 0,
      isActive: true
    };

    const room: Room = {
      id: roomId,
      code: roomCode,
      hostId: host.id,
      players: new Map([[host.id, host]]),
      status: 'WAITING',
      maxPlayers: 8,
      createdAt: new Date(),
      configuration: {
        buzzWindow: 5000,
        responseWindow: 30000,
        revealWindow: 3000,
        difficulty: 'MEDIUM',
        categoryTags: []
      }
    };

    this.rooms.set(roomId, room);
    this.socketToRoom.set(hostSocketId, roomId);
    this.roomCodeToId.set(roomCode, roomId);

    return room;
  }

  joinRoom(roomCode: string, socket: Socket, playerName: string, userId?: string): { room: Room; player: Player } | null {
    const roomId = this.roomCodeToId.get(roomCode.toUpperCase());
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) return null;

    if (room.status !== 'WAITING') return null;
    if (room.players.size >= room.maxPlayers) return null;

    // Check if user is already in room
    if (userId) {
      for (const player of room.players.values()) {
        if (player.userId === userId) {
          // Update socket ID for returning player
          player.socketId = socket.id;
          player.isActive = true;
          this.socketToRoom.set(socket.id, roomId);
          return { room, player };
        }
      }
    }

    const player: Player = {
      id: this.generatePlayerId(),
      socketId: socket.id,
      userId,
      name: playerName,
      isHost: false,
      score: 0,
      isActive: true
    };

    room.players.set(player.id, player);
    this.socketToRoom.set(socket.id, roomId);

    return { room, player };
  }

  leaveRoom(socketId: string): { room: Room; player: Player } | null {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) return null;

    let leavingPlayer: Player | null = null;
    for (const player of room.players.values()) {
      if (player.socketId === socketId) {
        leavingPlayer = player;
        player.isActive = false;
        break;
      }
    }

    if (!leavingPlayer) return null;

    this.socketToRoom.delete(socketId);

    // Check if all players have left
    const activePlayers = Array.from(room.players.values()).filter(p => p.isActive);
    if (activePlayers.length === 0) {
      this.closeRoom(roomId);
    } else if (leavingPlayer.isHost) {
      // Transfer host to another active player
      const newHost = activePlayers[0];
      if (!newHost) return null;
      newHost.isHost = true;
      room.hostId = newHost.id;
    }

    return { room, player: leavingPlayer };
  }

  closeRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.status = 'CLOSED';
    this.roomCodeToId.delete(room.code);

    // Clean up socket mappings
    for (const player of room.players.values()) {
      this.socketToRoom.delete(player.socketId);
    }

    this.rooms.delete(roomId);
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getRoomByCode(code: string): Room | undefined {
    const roomId = this.roomCodeToId.get(code.toUpperCase());
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  getRoomBySocketId(socketId: string): Room | undefined {
    const roomId = this.socketToRoom.get(socketId);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  getPlayerBySocketId(socketId: string): { room: Room; player: Player } | null {
    const room = this.getRoomBySocketId(socketId);
    if (!room) return null;

    for (const player of room.players.values()) {
      if (player.socketId === socketId) {
        return { room, player };
      }
    }
    return null;
  }

  updateRoomStatus(roomId: string, status: Room['status']): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.status = status;
    }
  }

  updatePlayerScore(roomId: string, playerId: string, scoreChange: number): void {
    const room = this.rooms.get(roomId);
    if (room) {
      const player = room.players.get(playerId);
      if (player) {
        player.score += scoreChange;
      }
    }
  }

  getRoomCount(): number {
    return this.rooms.size;
  }

  private generateRoomId(): string {
    return `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generatePlayerId(): string {
    return `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateUniqueRoomCode(): string {
    let code: string;
    do {
      code = generateRoomCode();
    } while (this.roomCodeToId.has(code));
    return code;
  }
}

export const roomManager = new RoomManager();
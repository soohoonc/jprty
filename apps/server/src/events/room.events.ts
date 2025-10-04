import { Server, Socket } from 'socket.io';
import { roomManager } from '../game/rooms';
import { gameState } from '../game/state';
import { EVENTS } from '../utils';

export function room(io: Server, socket: Socket) {
  socket.on(EVENTS.room.create, async (data: { playerName: string }) => {
    try {
      const { room, player } = await roomManager.create(socket.id, data.playerName);

      socket.join(room.id);
      gameState.create(room.id);

      socket.emit(EVENTS.room.created, { room, player });
    } catch (error: any) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on(EVENTS.room.join, async (data: { code: string; playerName: string }) => {
    try {
      const { room, player } = await roomManager.join(socket.id, data.code, data.playerName);

      socket.join(room.id);

      socket.emit(EVENTS.room.joined, { room, player });
      socket.to(room.id).emit(EVENTS.room.joined, { player });
    } catch (error: any) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on(EVENTS.room.leave, async () => {
    try {
      const connection = roomManager.getConnection(socket.id);
      if (!connection) return;

      await roomManager.leave(socket.id);

      socket.leave(connection.roomId);
      socket.to(connection.roomId).emit(EVENTS.room.left, { playerId: connection.playerId });
    } catch (error: any) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on(EVENTS.room.start, async (data?: { filter?: any }) => {
    try {
      const connection = roomManager.getConnection(socket.id);
      if (!connection) throw new Error('Not in a room');

      const state = await gameState.start(connection.roomId, data?.filter);
      const board = gameState.getBoard(connection.roomId);

      io.to(connection.roomId).emit(EVENTS.room.started, { state, board });
    } catch (error: any) {
      socket.emit('error', { message: error.message });
    }
  });
}
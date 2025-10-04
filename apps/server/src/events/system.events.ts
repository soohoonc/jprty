import { Server, Socket } from 'socket.io';
import { roomManager } from '../game/rooms';
import { EVENTS } from '../utils';

export function system(io: Server, socket: Socket) {
  socket.on(EVENTS.system.ping, () => {
    socket.emit(EVENTS.system.pong, { timestamp: Date.now() });
  });

  socket.on(EVENTS.system.reconnect, async (data: { playerId: string }) => {
    try {
      const connection = await roomManager.reconnect(socket.id, data.playerId);

      if (connection) {
        socket.join(connection.roomId);
        socket.emit(EVENTS.system.reconnected, { connection });
      } else {
        socket.emit(EVENTS.system.error, { message: 'Unable to reconnect' });
      }
    } catch (error: any) {
      socket.emit(EVENTS.system.error, { message: error.message });
    }
  });
}
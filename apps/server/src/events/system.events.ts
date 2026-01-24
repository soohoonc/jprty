import { Server, Socket } from 'socket.io';
import { roomManager } from '../game/rooms';
import { SYSTEM_EVENTS } from '@jprty/shared';

export function system(io: Server, socket: Socket) {
  socket.on(SYSTEM_EVENTS.PING, () => {
    socket.emit(SYSTEM_EVENTS.PONG, { timestamp: Date.now() });
  });

  socket.on(SYSTEM_EVENTS.RECONNECT, async (data: { playerId: string }) => {
    try {
      const connection = await roomManager.reconnect(socket.id, data.playerId);

      if (connection) {
        socket.join(connection.roomId);
        socket.emit(SYSTEM_EVENTS.RECONNECTED, { connection });
      } else {
        socket.emit(SYSTEM_EVENTS.ERROR, { message: 'Unable to reconnect' });
      }
    } catch (error: any) {
      socket.emit(SYSTEM_EVENTS.ERROR, { message: error.message });
    }
  });
}

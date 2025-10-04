import { Server, Socket } from 'socket.io';
import { room } from './room.events';
import { game } from './game.events';
import { system } from './system.events';

export function registerEventHandlers(io: Server) {
  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    room(io, socket);
    game(io, socket);
    system(io, socket);

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });
}
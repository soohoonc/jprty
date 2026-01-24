import { Server, Socket } from 'socket.io';
import { db } from '@jprty/db';
import { ROOM_EVENTS, type Player } from '@jprty/shared';
import { gameState } from '../game/state';
import { roomManager } from '../game/rooms';

async function getPlayersForRoom(roomId: string): Promise<Player[]> {
  const room = await db.room.findUnique({
    where: { id: roomId },
    include: {
      players: { where: { isActive: true }, orderBy: { joinedAt: 'asc' } },
    },
  });

  if (!room) return [];

  // All players are contestants (host is separate, not in DB)
  return room.players.map((p) => ({
    id: p.id,
    name: p.name || undefined,
    guestName: p.name || 'Guest',
    score: p.score,
    isHost: false,
    isActive: p.isActive,
  }));
}

export function room(io: Server, socket: Socket) {
  // Join room
  socket.on(ROOM_EVENTS.JOIN, async (data: { roomCode: string; playerName: string; isHost?: boolean }) => {
    try {
      const existingRoom = await db.room.findUnique({
        where: { code: data.roomCode },
        include: { players: { where: { isActive: true } } },
      });

      if (!existingRoom) {
        socket.emit(ROOM_EVENTS.ERROR, { message: 'Room not found' });
        return;
      }

      socket.join(existingRoom.id);

      // If joining as host, don't create a player record
      if (data.isHost) {
        roomManager.addConnection(socket.id, 'host', existingRoom.id, true);

        const players = await getPlayersForRoom(existingRoom.id);

        console.log(`Host connected to room ${existingRoom.code}. Players: ${players.length}`);

        socket.emit(ROOM_EVENTS.JOINED, {
          players,
          isHost: true,
          player: { id: 'host', name: 'Host', isHost: true, isActive: true, score: 0 },
        });
        return;
      }

      // Regular player joining
      let player = existingRoom.players.find((p) => p.name === data.playerName);

      if (!player) {
        player = await db.player.create({
          data: {
            roomId: existingRoom.id,
            name: data.playerName,
            isActive: true,
          },
        });

        await db.room.update({
          where: { id: existingRoom.id },
          data: { numPlayers: { increment: 1 } },
        });
      } else {
        await db.player.update({
          where: { id: player.id },
          data: { isActive: true },
        });
      }

      roomManager.addConnection(socket.id, player.id, existingRoom.id, false);

      const players = await getPlayersForRoom(existingRoom.id);

      console.log(`Player ${player.name} joined room ${existingRoom.code}. Players: ${players.length}`);

      const playerData = {
        id: player.id,
        name: player.name,
        guestName: player.name || 'Guest',
        score: player.score,
        isHost: false,
        isActive: true,
      };

      socket.emit(ROOM_EVENTS.JOINED, {
        players,
        isHost: false,
        player: playerData,
      });

      socket.to(existingRoom.id).emit(ROOM_EVENTS.PLAYER_JOINED, {
        players,
        player: playerData,
      });
    } catch (error: any) {
      console.error('room:join error:', error);
      socket.emit(ROOM_EVENTS.ERROR, { message: error.message });
    }
  });

  // Leave room
  socket.on(ROOM_EVENTS.LEAVE, async () => {
    try {
      const connection = roomManager.getConnection(socket.id);
      if (!connection) return;

      const { roomId, playerId, isHost } = connection;

      // Only update DB if not host (host doesn't have a player record)
      if (!isHost && playerId !== 'host') {
        await db.player.update({
          where: { id: playerId },
          data: { isActive: false },
        });

        await db.room.update({
          where: { id: roomId },
          data: { numPlayers: { decrement: 1 } },
        });
      }

      socket.leave(roomId);

      const players = await getPlayersForRoom(roomId);

      socket.to(roomId).emit(ROOM_EVENTS.PLAYER_LEFT, {
        players,
        player: { id: playerId },
      });
    } catch (error: any) {
      console.error('room:leave error:', error);
      socket.emit(ROOM_EVENTS.ERROR, { message: error.message });
    }
  });

  // Start game - only host can start
  socket.on(ROOM_EVENTS.START_GAME, async () => {
    try {
      const rooms = Array.from(socket.rooms).filter((r) => r !== socket.id);
      const roomId = rooms[0];
      if (!roomId) {
        socket.emit(ROOM_EVENTS.ERROR, { message: 'Not in a room' });
        return;
      }

      // Verify that the caller is the host
      if (!roomManager.isPlayerHost(socket.id)) {
        socket.emit(ROOM_EVENTS.ERROR, { message: 'Only the host can start the game' });
        return;
      }

      // Initialize game state if needed
      if (!gameState.get(roomId)) {
        gameState.create(roomId);
      }

      const state = await gameState.start(roomId);
      const board = gameState.getBoard(roomId);

      // Transform board to match frontend's expected format
      let transformedBoard = null;
      if (board) {
        const answeredQuestions: string[] = [];
        board.cells.forEach((row) => {
          row.forEach((cell) => {
            if (cell.isAnswered) {
              const category = board.categories[cell.col];
              answeredQuestions.push(`${category}_${cell.value}`);
            }
          });
        });
        transformedBoard = {
          categories: board.categories,
          answeredQuestions,
        };
      }

      console.log('Game started, emitting room:game_started with board:', transformedBoard?.categories);
      io.to(roomId).emit(ROOM_EVENTS.GAME_STARTED, { state, board: transformedBoard });
    } catch (error: any) {
      console.error('room:start_game error:', error);
      socket.emit(ROOM_EVENTS.ERROR, { message: error.message });
    }
  });

  // Get current game state (for when play/host page loads)
  socket.on(ROOM_EVENTS.GET_STATE, (data?: { isHost?: boolean }) => {
    try {
      const rooms = Array.from(socket.rooms).filter((r) => r !== socket.id);
      const roomId = rooms[0];
      if (!roomId) {
        socket.emit(ROOM_EVENTS.ERROR, { message: 'Not in a room' });
        return;
      }

      // Ensure connection is registered (handles reconnection cases)
      const existingConnection = roomManager.getConnection(socket.id);
      if (!existingConnection) {
        // Re-register the connection based on isHost flag
        const isHost = data?.isHost === true;
        roomManager.addConnection(socket.id, isHost ? 'host' : socket.id, roomId, isHost);
        console.log(`Re-registered connection for socket ${socket.id}, isHost: ${isHost}`);
      }

      const state = gameState.get(roomId);
      const board = gameState.getBoard(roomId);

      if (state && board) {
        const answeredQuestions: string[] = [];
        board.cells.forEach((row) => {
          row.forEach((cell) => {
            if (cell.isAnswered) {
              const category = board.categories[cell.col];
              answeredQuestions.push(`${category}_${cell.value}`);
            }
          });
        });

        const transformedBoard = {
          categories: board.categories,
          answeredQuestions,
        };

        socket.emit(ROOM_EVENTS.STATE, {
          board: transformedBoard,
          phase: state.phase,
          currentQuestion: state.currentQuestion,
          selectorPlayerId: state.selectorPlayerId,
        });
      } else {
        socket.emit(ROOM_EVENTS.STATE, { board: null, phase: 'LOBBY' });
      }
    } catch (error: any) {
      console.error('room:get_state error:', error);
      socket.emit(ROOM_EVENTS.ERROR, { message: error.message });
    }
  });

  // Handle disconnect
  socket.on('disconnect', async () => {
    const connection = roomManager.getConnection(socket.id);
    if (!connection) return;

    const players = await getPlayersForRoom(connection.roomId);
    socket.to(connection.roomId).emit(ROOM_EVENTS.PLAYER_LEFT, { players });
  });
}

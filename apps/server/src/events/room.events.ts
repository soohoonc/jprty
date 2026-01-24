import { Server, Socket } from 'socket.io';
import { db } from '@jprty/db';
import { ROOM_EVENTS, GAME_EVENTS, type Player } from '@jprty/shared';
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
        socket.join(existingRoom.id); // Join the socket.io room
        roomManager.addConnection(socket.id, 'host', existingRoom.id, true);

        const players = await getPlayersForRoom(existingRoom.id);

        console.log(`Host connected to room ${existingRoom.code}. Players: ${players.length}`);

        // Include current game state for host (if game has started)
        const state = gameState.get(existingRoom.id);
        const board = gameState.getBoard(existingRoom.id);
        let gameData = null;

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
          gameData = {
            board: { categories: board.categories, answeredQuestions },
            phase: state.phase,
            currentQuestion: state.currentQuestion,
            selectorPlayerId: state.selectorPlayerId,
          };
        }

        socket.emit(ROOM_EVENTS.JOINED, {
          players,
          isHost: true,
          player: { id: 'host', name: 'Host', isHost: true, isActive: true, score: 0 },
          gameState: gameData,
        });
        return;
      }

      // Regular player joining - check current DB state to avoid race conditions
      let player = await db.player.findFirst({
        where: { roomId: existingRoom.id, name: data.playerName },
      });

      if (!player) {
        player = await db.player.create({
          data: {
            roomId: existingRoom.id,
            name: data.playerName,
            isActive: true,
          },
        });
      } else {
        player = await db.player.update({
          where: { id: player.id },
          data: { isActive: true },
        });
      }

      // Update room player count based on actual active players
      const activeCount = await db.player.count({
        where: { roomId: existingRoom.id, isActive: true },
      });
      await db.room.update({
        where: { id: existingRoom.id },
        data: { numPlayers: activeCount },
      });

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

      // Include current game state for player (if game has started)
      const state = gameState.get(existingRoom.id);
      const board = gameState.getBoard(existingRoom.id);
      let gameData = null;

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
        gameData = {
          board: { categories: board.categories, answeredQuestions },
          phase: state.phase,
          currentQuestion: state.currentQuestion,
          selectorPlayerId: state.selectorPlayerId,
        };
      }

      socket.emit(ROOM_EVENTS.JOINED, {
        players,
        isHost: false,
        player: playerData,
        gameState: gameData,
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
      console.log(`[START_GAME] Socket ${socket.id} rooms:`, rooms);

      if (!roomId) {
        socket.emit(ROOM_EVENTS.ERROR, { message: 'Not in a room' });
        return;
      }

      // Debug: Check how many sockets are in this room
      const socketsInRoom = await io.in(roomId).fetchSockets();
      console.log(`[START_GAME] Sockets in room ${roomId}:`, socketsInRoom.map(s => s.id));

      // Verify that the caller is the host
      if (!roomManager.isPlayerHost(socket.id)) {
        socket.emit(ROOM_EVENTS.ERROR, { message: 'Only the host can start the game' });
        return;
      }

      // Initialize game state if needed
      if (!gameState.get(roomId)) {
        gameState.create(roomId);
      }

      // Register state change callback to emit socket events
      gameState.onStateChange(roomId, (newState) => {
        console.log(`[CALLBACK] State changed to phase: ${newState.phase}, currentQuestion: ${newState.currentQuestion?.id || 'null'}`);
        if (newState.phase === 'BUZZING') {
          io.to(roomId).emit(GAME_EVENTS.BUZZER_OPEN, {
            timeRemaining: newState.timeRemaining,
          });
        }
        // Broadcast state update for all phase changes
        io.to(roomId).emit(GAME_EVENTS.STATE_UPDATE, {
          phase: newState.phase,
          currentPlayerId: newState.currentPlayerId,
          selectorPlayerId: newState.selectorPlayerId,
          timeRemaining: newState.timeRemaining,
          // Include correct answer when revealing
          correctAnswer: newState.phase === 'REVEALING' ? newState.currentQuestion?.answer : undefined,
        });
      });

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

      console.log('Game started, emitting room:game_started with board:', transformedBoard?.categories, 'selectorPlayerId:', state.selectorPlayerId);
      io.to(roomId).emit(ROOM_EVENTS.GAME_STARTED, { state, board: transformedBoard });
    } catch (error: any) {
      console.error('room:start_game error:', error);
      socket.emit(ROOM_EVENTS.ERROR, { message: error.message });
    }
  });

  // Get current game state (for when play/host page loads)
  socket.on(ROOM_EVENTS.GET_STATE, (data?: { isHost?: boolean; playerId?: string }) => {
    console.log(`[GET_STATE] Received from socket ${socket.id}, data:`, data);
    try {
      const rooms = Array.from(socket.rooms).filter((r) => r !== socket.id);
      const roomId = rooms[0];
      console.log(`[GET_STATE] Socket rooms:`, rooms, 'roomId:', roomId);
      if (!roomId) {
        console.log(`[GET_STATE] Socket not in a room, emitting error`);
        socket.emit(ROOM_EVENTS.ERROR, { message: 'Not in a room' });
        return;
      }

      // Ensure connection is registered (handles reconnection cases)
      const existingConnection = roomManager.getConnection(socket.id);
      if (!existingConnection) {
        // Re-register the connection based on isHost flag
        // Use the playerId from the client if provided (for players)
        const isHost = data?.isHost === true;
        const playerId = isHost ? 'host' : (data?.playerId || socket.id);
        roomManager.addConnection(socket.id, playerId, roomId, isHost);
        console.log(`Re-registered connection for socket ${socket.id}, playerId: ${playerId}, isHost: ${isHost}`);
      }

      const state = gameState.get(roomId);
      const board = gameState.getBoard(roomId);

      // Re-register state change callback if game exists but callback was lost (e.g., server restart)
      if (state && !gameState.hasCallback(roomId)) {
        console.log(`[GET_STATE] Re-registering state change callback for room ${roomId}`);
        gameState.onStateChange(roomId, (newState) => {
          console.log(`[CALLBACK] State changed to phase: ${newState.phase}, currentQuestion: ${newState.currentQuestion?.id || 'null'}`);
          if (newState.phase === 'BUZZING') {
            io.to(roomId).emit(GAME_EVENTS.BUZZER_OPEN, {
              timeRemaining: newState.timeRemaining,
            });
          }
          // Broadcast state update for all phase changes
          io.to(roomId).emit(GAME_EVENTS.STATE_UPDATE, {
            phase: newState.phase,
            currentPlayerId: newState.currentPlayerId,
            selectorPlayerId: newState.selectorPlayerId,
            timeRemaining: newState.timeRemaining,
            // Include correct answer when revealing
            correctAnswer: newState.phase === 'REVEALING' ? newState.currentQuestion?.answer : undefined,
          });
        });
      }

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

        console.log(`[GET_STATE] Sending STATE with board categories:`, transformedBoard.categories, 'phase:', state.phase, 'selectorPlayerId:', state.selectorPlayerId);
        socket.emit(ROOM_EVENTS.STATE, {
          board: transformedBoard,
          phase: state.phase,
          currentQuestion: state.currentQuestion,
          selectorPlayerId: state.selectorPlayerId,
        });
      } else {
        console.log(`[GET_STATE] No state/board found, sending LOBBY phase`);
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

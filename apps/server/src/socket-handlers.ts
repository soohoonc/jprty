import { Server, Socket } from 'socket.io';
import { roomManager } from './room-manager';
import { gameManager } from './game-manager';
import { validateAnswer } from './utils';

export function setupSocketHandlers(io: Server) {
  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Room Management
    socket.on('create-room', (data: { playerName: string; userId?: string }) => {
      const room = roomManager.createRoom(socket.id, data.playerName, data.userId);
      socket.join(room.id);
      
      socket.emit('room-created', {
        roomCode: room.code,
        roomId: room.id,
        players: Array.from(room.players.values())
      });
    });

    socket.on('join-room', (data: { roomCode: string; playerName: string; userId?: string }) => {
      const result = roomManager.joinRoom(data.roomCode, socket, data.playerName, data.userId);
      
      if (!result) {
        socket.emit('join-error', { message: 'Room not found or full' });
        return;
      }

      const { room, player } = result;
      socket.join(room.id);
      
      socket.emit('joined-room', {
        roomId: room.id,
        roomCode: room.code,
        player,
        players: Array.from(room.players.values()),
        isHost: player.isHost
      });

      // Notify other players
      socket.to(room.id).emit('player-joined', {
        player,
        players: Array.from(room.players.values())
      });
    });

    socket.on('leave-room', () => {
      const result = roomManager.leaveRoom(socket.id);
      if (!result) return;

      const { room, player } = result;
      socket.leave(room.id);
      
      socket.to(room.id).emit('player-left', {
        player,
        players: Array.from(room.players.values()),
        newHostId: room.hostId
      });
    });

    // Game Management
    socket.on('start-game', () => {
      const playerInfo = roomManager.getPlayerBySocketId(socket.id);
      if (!playerInfo || !playerInfo.player.isHost) {
        socket.emit('error', { message: 'Only host can start the game' });
        return;
      }

      const { room } = playerInfo;
      const session = gameManager.createGameSession(room);
      gameManager.startGame(session.id);
      
      roomManager.updateRoomStatus(room.id, 'IN_GAME');

      io.to(room.id).emit('game-started', {
        sessionId: session.id,
        board: session.board
      });
    });

    socket.on('select-question', (data: { questionId: string }) => {
      const playerInfo = roomManager.getPlayerBySocketId(socket.id);
      if (!playerInfo) return;

      const { room } = playerInfo;
      if (!room.gameSessionId) return;

      const question = gameManager.selectQuestion(room.gameSessionId, data.questionId);
      if (!question) return;

      io.to(room.id).emit('question-selected', {
        question: {
          id: question.id,
          question: question.question,
          value: question.value,
          category: question.category
        }
      });

      // Start buzz timer after displaying question
      setTimeout(() => {
        gameManager.openBuzzer(room.gameSessionId!, room.configuration?.buzzWindow || 5000);
        io.to(room.id).emit('buzzer-open');
      }, 3000); // 3 seconds to read question
    });

    socket.on('buzz', () => {
      const playerInfo = roomManager.getPlayerBySocketId(socket.id);
      if (!playerInfo) return;

      const { room, player } = playerInfo;
      if (!room.gameSessionId) return;

      const success = gameManager.playerBuzz(room.gameSessionId, player.id);
      if (success) {
        io.to(room.id).emit('player-buzzed', {
          playerId: player.id,
          playerName: player.name
        });
      }
    });

    socket.on('submit-answer', (data: { answer: string }) => {
      const playerInfo = roomManager.getPlayerBySocketId(socket.id);
      if (!playerInfo) return;

      const { room, player } = playerInfo;
      if (!room.gameSessionId) return;

      const session = gameManager.getSession(room.gameSessionId);
      if (!session || !session.currentQuestion) return;

      const isCorrect = validateAnswer(data.answer, session.currentQuestion.answer);
      const points = isCorrect ? session.currentQuestion.value : -session.currentQuestion.value;
      
      roomManager.updatePlayerScore(room.id, player.id, points);

      io.to(room.id).emit('answer-submitted', {
        playerId: player.id,
        playerName: player.name,
        answer: data.answer,
        isCorrect,
        correctAnswer: session.currentQuestion.answer,
        points,
        players: Array.from(room.players.values())
      });

      if (isCorrect) {
        gameManager.markQuestionAnswered(room.gameSessionId, session.currentQuestion.id);
      }

      // Move to next state
      gameManager.updateGameStatus(room.gameSessionId, 'ANSWER_REVEAL');
      
      setTimeout(() => {
        gameManager.updateGameStatus(room.gameSessionId, 'SELECTING');
        io.to(room.id).emit('ready-for-next-question');
      }, room.configuration?.revealWindow || 3000);
    });

    socket.on('end-game', () => {
      const playerInfo = roomManager.getPlayerBySocketId(socket.id);
      if (!playerInfo || !playerInfo.player.isHost) {
        socket.emit('error', { message: 'Only host can end the game' });
        return;
      }

      const { room } = playerInfo;
      if (!room.gameSessionId) return;

      gameManager.endGame(room.gameSessionId);
      roomManager.updateRoomStatus(room.id, 'FINISHED');

      const finalScores = Array.from(room.players.values())
        .sort((a, b) => b.score - a.score);

      io.to(room.id).emit('game-ended', {
        finalScores,
        winner: finalScores[0]
      });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
      const result = roomManager.leaveRoom(socket.id);
      
      if (result) {
        const { room, player } = result;
        socket.to(room.id).emit('player-disconnected', {
          player,
          players: Array.from(room.players.values()),
          newHostId: room.hostId
        });
      }
    });
  });
}
import { Server, Socket } from 'socket.io';
import { roomManager } from '../game/rooms';
import { gameState } from '../game/state';
import { judge, EVENTS } from '../utils';

const BUZZ_WINDOW_DELAY = 3000;
const ANSWER_DELAY = 10000;

export function game(io: Server, socket: Socket) {
  socket.on(EVENTS.game.question_revealed, (data: { questionId: string }) => {
    try {
      const connection = roomManager.getConnection(socket.id);
      if (!connection) throw new Error('Not in a room');

      const state = gameState.selectQuestion(connection.roomId, data.questionId);

      io.to(connection.roomId).emit(EVENTS.game.question_revealed, {
        questionId: data.questionId,
        phase: state.phase
      });

      setTimeout(() => {
        io.to(connection.roomId).emit(EVENTS.game.buzz_window_open);
      }, BUZZ_WINDOW_DELAY);
    } catch (error: any) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on(EVENTS.game.buzz_window_open, () => {
    try {
      const connection = roomManager.getConnection(socket.id);
      if (!connection) throw new Error('Not in a room');

      const state = gameState.buzz(connection.roomId, connection.playerId);

      io.to(connection.roomId).emit(EVENTS.game.player_buzzed, {
        playerId: connection.playerId,
        position: state.buzzQueue.length,
        isAnswering: state.currentPlayerId === connection.playerId,
      });
    } catch (error: any) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on(EVENTS.game.player_buzzed, async (data: { answer: string }) => {
    try {
      const connection = roomManager.getConnection(socket.id);
      if (!connection) throw new Error('Not in a room');

      const game = gameState.get(connection.roomId);
      if (!game || !game.currentQuestion) throw new Error('No active question');

      const isCorrect = await judge(game.currentQuestion.answer, data.answer);
      const state = await gameState.submitAnswer(
        connection.roomId,
        connection.playerId,
        data.answer,
        isCorrect
      );

      io.to(connection.roomId).emit(EVENTS.game.answer_result, {
        playerId: connection.playerId,
        isCorrect,
        scores: Array.from(state.scores.entries()),
      });

      if (state.phase === 'REVEALING') {
        setTimeout(() => {
          io.to(connection.roomId).emit(EVENTS.game.ready_for_next);
        }, ANSWER_DELAY);
      }
    } catch (error: any) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on(EVENTS.game.answer_result, () => {
    try {
      const connection = roomManager.getConnection(socket.id);
      if (!connection) throw new Error('Not in a room');

      const state = gameState.handleTimeout(connection.roomId);

      io.to(connection.roomId).emit(EVENTS.game.question_skipped, {
        nextPlayer: state.currentPlayerId,
      });
    } catch (error: any) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on(EVENTS.game.question_skipped, () => {
    try {
      const connection = roomManager.getConnection(socket.id);
      if (!connection) throw new Error('Not in a room');

      const state = gameState.get(connection.roomId);
      if (!state) throw new Error('No active game');

      const winner = Array.from(state.scores.entries())
        .sort((a, b) => b[1] - a[1])[0];

      gameState.end(connection.roomId);

      io.to(connection.roomId).emit(EVENTS.game.winner, {
        winnerId: winner?.[0],
        finalScores: Array.from(state.scores.entries()),
      });
    } catch (error: any) {
      socket.emit('error', { message: error.message });
    }
  });
}
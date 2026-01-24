import { Server, Socket } from 'socket.io';
import { db } from '@jprty/db';
import { GAME_EVENTS, GAME_CONFIG } from '@jprty/shared';
import { roomManager } from '../game/rooms';
import { gameState, GameState } from '../game/state';

function broadcastState(io: Server, roomId: string, _state: GameState): void {
  const snapshot = gameState.getSnapshot(roomId);
  if (snapshot) {
    // Transform board to frontend format
    let transformedBoard = null;
    if (snapshot.board && snapshot.board.grid) {
      const answeredQuestions: string[] = [];
      snapshot.board.grid.forEach((cell) => {
        if (cell.isAnswered) {
          const category = snapshot.board!.categories[cell.col];
          answeredQuestions.push(`${category}_${cell.value}`);
        }
      });
      transformedBoard = {
        categories: snapshot.board.categories,
        answeredQuestions,
      };
    }

    io.to(roomId).emit(GAME_EVENTS.STATE_UPDATE, {
      ...snapshot,
      board: transformedBoard,
    });
  }
}

export function game(io: Server, socket: Socket) {
  // Get current game state
  socket.on(GAME_EVENTS.GET_STATE, () => {
    try {
      const connection = roomManager.getConnection(socket.id);
      if (!connection) throw new Error('Not in a room');

      const snapshot = gameState.getSnapshot(connection.roomId);
      socket.emit(GAME_EVENTS.STATE_UPDATE, snapshot);
    } catch (error: any) {
      socket.emit(GAME_EVENTS.ERROR, { message: error.message });
    }
  });

  // Select a question from the board - ONLY the selector player can select (host cannot)
  socket.on(GAME_EVENTS.SELECT_QUESTION, async (data: { questionId: string }) => {
    console.log(`[GAME] Received select_question: ${data.questionId} from socket ${socket.id}`);
    try {
      const connection = roomManager.getConnection(socket.id);
      console.log(`[GAME] Connection for socket ${socket.id}:`, connection);
      if (!connection) throw new Error('Not in a room');

      // Host cannot select questions - only display
      if (connection.isHost) {
        throw new Error('Host cannot select questions');
      }

      const game = gameState.get(connection.roomId);
      if (!game) throw new Error('Game not found');

      // Only the designated selector player can select
      const isSelector = game.selectorPlayerId === connection.playerId;
      if (!isSelector) {
        throw new Error('Not your turn to select');
      }

      console.log(`[GAME] Calling gameState.selectQuestion with roomId: ${connection.roomId}, questionId: ${data.questionId}`);
      const state = await gameState.selectQuestion(
        connection.roomId,
        data.questionId,
        connection.playerId
      );
      console.log(`[GAME] selectQuestion returned, phase: ${state.phase}, question:`, state.currentQuestion?.id);

      // Emit appropriate event based on whether it's a Daily Double
      if (state.phase === 'DAILY_DOUBLE') {
        io.to(connection.roomId).emit(GAME_EVENTS.DAILY_DOUBLE, {
          playerId: connection.playerId,
          questionId: data.questionId,
          maxWager: state.scores.get(connection.playerId) || GAME_CONFIG.wager.lowScoreMaxWager.SINGLE_JEOPARDY,
        });
      } else {
        io.to(connection.roomId).emit(GAME_EVENTS.QUESTION_SELECTED, {
          questionId: data.questionId,
          question: state.currentQuestion,
          value: state.currentQuestionValue,
          phase: state.phase,
        });

        // Note: BUZZER_OPEN is emitted via the state change callback registered in room.events.ts
      }

      broadcastState(io, connection.roomId, state);
    } catch (error: any) {
      console.error(`[GAME] Error in select_question:`, error.message, error.stack);
      socket.emit(GAME_EVENTS.ERROR, { message: error.message });
    }
  });

  // Submit Daily Double wager
  socket.on(GAME_EVENTS.SUBMIT_WAGER, (data: { wager: number }) => {
    try {
      const connection = roomManager.getConnection(socket.id);
      if (!connection) throw new Error('Not in a room');

      const state = gameState.submitDailyDoubleWager(
        connection.roomId,
        connection.playerId,
        data.wager
      );

      io.to(connection.roomId).emit(GAME_EVENTS.QUESTION_SELECTED, {
        questionId: state.currentQuestion?.id,
        question: state.currentQuestion,
        value: state.currentWager,
        phase: state.phase,
        isDailyDouble: true,
      });

      broadcastState(io, connection.roomId, state);
    } catch (error: any) {
      socket.emit(GAME_EVENTS.ERROR, { message: error.message });
    }
  });

  // Buzz in - PLAYERS ONLY (host cannot buzz)
  socket.on(GAME_EVENTS.BUZZ, async () => {
    console.log(`[GAME] Received BUZZ from socket ${socket.id}`);
    try {
      const connection = roomManager.getConnection(socket.id);
      console.log(`[GAME] BUZZ connection:`, connection);
      if (!connection) throw new Error('Not in a room');

      // Host cannot buzz - only players can
      if (connection.isHost) {
        throw new Error('The host cannot buzz in');
      }

      const game = gameState.get(connection.roomId);
      console.log(`[GAME] BUZZ game phase before buzz:`, game?.phase);

      const state = gameState.buzz(connection.roomId, connection.playerId);
      console.log(`[GAME] BUZZ succeeded, new phase:`, state.phase);

      // Get player name from DB
      const player = await db.player.findUnique({ where: { id: connection.playerId } });
      const playerName = player?.name || 'Player';

      console.log(`[GAME] Emitting PLAYER_BUZZED to room ${connection.roomId}, playerId: ${connection.playerId}, playerName: ${playerName}`);
      io.to(connection.roomId).emit(GAME_EVENTS.PLAYER_BUZZED, {
        playerId: connection.playerId,
        playerName,
        position: state.buzzQueue.indexOf(connection.playerId) + 1,
        isAnswering: state.currentPlayerId === connection.playerId,
        timeRemaining: state.timeRemaining,
      });

      broadcastState(io, connection.roomId, state);
    } catch (error: any) {
      console.error(`[GAME] BUZZ error:`, error.message);
      socket.emit(GAME_EVENTS.ERROR, { message: error.message });
    }
  });

  // Submit answer - PLAYERS ONLY (host cannot answer)
  socket.on(GAME_EVENTS.SUBMIT_ANSWER, async (data: { answer: string }) => {
    try {
      const connection = roomManager.getConnection(socket.id);
      if (!connection) throw new Error('Not in a room');

      // Host cannot answer - only players can
      if (connection.isHost) {
        throw new Error('The host cannot submit answers');
      }

      const game = gameState.get(connection.roomId);
      if (!game || !game.currentQuestion) throw new Error('No active question');

      // Capture previous score BEFORE submitting answer
      const previousScore = game.scores.get(connection.playerId) || 0;

      const state = await gameState.submitAnswer(
        connection.roomId,
        connection.playerId,
        data.answer
      );

      // Get the new score and determine if correct
      const newScore = state.scores.get(connection.playerId) || 0;
      const isCorrect = newScore > previousScore;

      // Get player name for display
      const player = await db.player.findUnique({ where: { id: connection.playerId } });
      const playerName = player?.name || 'Player';

      io.to(connection.roomId).emit(GAME_EVENTS.ANSWER_RESULT, {
        playerId: connection.playerId,
        playerName,
        answer: data.answer,
        correctAnswer: state.currentQuestion?.answer,
        isCorrect,
        pointChange: newScore - previousScore,
        newScore,
        phase: state.phase,
        selectorPlayerId: state.selectorPlayerId,
      });

      // Handle phase transitions
      if (state.phase === 'REVEALING') {
        setTimeout(() => {
          const currentState = gameState.get(connection.roomId);
          if (currentState) {
            broadcastState(io, connection.roomId, currentState);
          }
        }, state.timing.revealWindowMs);
      } else if (state.phase === 'ROUND_END') {
        io.to(connection.roomId).emit(GAME_EVENTS.ROUND_END, {
          roundNumber: state.roundNumber,
          scores: Array.from(state.scores.entries()),
        });
      } else if (state.phase === 'GAME_END') {
        const sortedScores = Array.from(state.scores.entries())
          .sort((a, b) => b[1] - a[1]);

        io.to(connection.roomId).emit(GAME_EVENTS.GAME_END, {
          winner: sortedScores[0],
          finalScores: sortedScores,
        });
      }

      broadcastState(io, connection.roomId, state);
    } catch (error: any) {
      socket.emit(GAME_EVENTS.ERROR, { message: error.message });
    }
  });

  // Next question - selector player (who answered correctly) can advance
  socket.on(GAME_EVENTS.NEXT_QUESTION, () => {
    try {
      const connection = roomManager.getConnection(socket.id);
      if (!connection) throw new Error('Not in a room');

      const game = gameState.get(connection.roomId);
      if (!game) throw new Error('Game not found');

      // Allow host OR the selector (player who answered correctly) to advance
      const isSelector = game.selectorPlayerId === connection.playerId;
      if (!connection.isHost && !isSelector) {
        throw new Error('Only the selector can advance to the next question');
      }

      const state = gameState.nextQuestion(connection.roomId);

      // Broadcast state update to all clients
      broadcastState(io, connection.roomId, state);
    } catch (error: any) {
      socket.emit(GAME_EVENTS.ERROR, { message: error.message });
    }
  });

  // Submit Final Jeopardy wager
  socket.on(GAME_EVENTS.SUBMIT_FINAL_WAGER, (data: { wager: number }) => {
    try {
      const connection = roomManager.getConnection(socket.id);
      if (!connection) throw new Error('Not in a room');

      const state = gameState.submitFinalJeopardyWager(
        connection.roomId,
        connection.playerId,
        data.wager
      );

      // Don't broadcast individual wagers - they're secret
      socket.emit(GAME_EVENTS.STATE_UPDATE, {
        phase: state.phase,
        wagerSubmitted: true,
      });

      // If phase changed to answering, notify everyone
      if (state.phase === 'FINAL_JEOPARDY_ANSWER') {
        io.to(connection.roomId).emit(GAME_EVENTS.FINAL_JEOPARDY_START, {
          question: state.finalJeopardyQuestion,
          timeRemaining: state.timing.finalJeopardyAnswerMs / 1000,
        });
      }
    } catch (error: any) {
      socket.emit(GAME_EVENTS.ERROR, { message: error.message });
    }
  });

  // Submit Final Jeopardy answer
  socket.on(GAME_EVENTS.SUBMIT_FINAL_ANSWER, (data: { answer: string }) => {
    try {
      const connection = roomManager.getConnection(socket.id);
      if (!connection) throw new Error('Not in a room');

      const state = gameState.submitFinalJeopardyAnswer(
        connection.roomId,
        connection.playerId,
        data.answer
      );

      // Don't broadcast individual answers - they're secret until reveal
      socket.emit(GAME_EVENTS.STATE_UPDATE, {
        phase: state.phase,
        answerSubmitted: true,
      });

      // If phase changed to reveal, broadcast results
      if (state.phase === 'FINAL_JEOPARDY_REVEAL') {
        const answers = state.finalJeopardyAnswers
          ? Array.from(state.finalJeopardyAnswers.entries()).map(([id, ans]) => ({
              playerId: id,
              wager: ans.wager,
              answer: ans.answer,
              revealed: ans.revealed,
            }))
          : [];

        io.to(connection.roomId).emit(GAME_EVENTS.FINAL_JEOPARDY_REVEAL, {
          correctAnswer: state.finalJeopardyQuestion?.answer,
          answers,
          finalScores: Array.from(state.scores.entries()),
        });
      }
    } catch (error: any) {
      socket.emit(GAME_EVENTS.ERROR, { message: error.message });
    }
  });
}

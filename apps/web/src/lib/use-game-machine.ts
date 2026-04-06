"use client";

import { useEffect, useCallback, useRef } from "react";
import { useMachine } from "@xstate/react";
import { useSocket } from "./socket";
import { api } from "@/trpc/react";
import { GAME_EVENTS, ROOM_EVENTS } from "@jprty/shared";
import { gameMachine, getPhase, type GameBoard } from "./game-machine";

interface Options {
  roomCode: string;
  playerId?: string | null;
  isHost?: boolean;
  enabled?: boolean;
  onGameEnd?: () => void;
  onError?: (message: string) => void;
}

export function useGameMachine({
  roomCode,
  playerId = null,
  isHost = false,
  enabled = true,
  onGameEnd,
  onError,
}: Options) {
  const { socket, isConnected } = useSocket();
  const utils = api.useUtils();
  const initializedRef = useRef(false);

  const [state, send] = useMachine(gameMachine);
  const ctx = state.context;
  const phase = getPhase(state.value as string);

  // Get room data for player name lookup
  const { data: room } = api.game.getRoom.useQuery(
    { roomCode },
    { enabled: !!roomCode && enabled }
  );

  // Create player name lookup
  const getPlayerName = (id: string | null): string | null => {
    if (!id) return null;
    const player = room?.players?.find((p) => p.id === id);
    return player?.name || player?.user?.name || null;
  };

  // Sync identity when it changes
  useEffect(() => {
    // Always set identity when playerId is available
    if (playerId || isHost) {
      send({ type: "SET_IDENTITY", playerId, isHost });
    }
  }, [playerId, isHost, send]);

  // Load initial state from server
  const { data: serverState, isLoading } = api.game.getGameState.useQuery(
    { roomCode },
    { enabled: !!roomCode && enabled, staleTime: 0 }
  );

  // Sync server state on load
  useEffect(() => {
    if (!serverState) return;

    if (serverState.board) {
      // Extract unique values from grid, sorted ascending
      const values = [...new Set(serverState.board.grid?.map((c) => c.value) ?? [])].sort((a, b) => a - b);
      const questionIds = Object.fromEntries(
        (serverState.board.grid ?? []).map((cell) => [
          `${serverState.board!.categories[cell.col]}_${cell.value}`,
          cell.questionId,
        ]),
      );
      const board: GameBoard = {
        categories: serverState.board.categories,
        questionIds,
        answeredQuestions: new Set(
          serverState.board.grid
            ?.filter((c) => c.isUsed)
            .map((c) => c.questionId) ?? []
        ),
        values: values.length > 0 ? values : [200, 400, 600, 800, 1000],
      };
      send({ type: "UPDATE_BOARD", board });
    }

    if (serverState.scores) send({ type: "UPDATE_SCORES", scores: serverState.scores });
    if (serverState.selectorPlayerId) send({ type: "UPDATE_SELECTOR", selectorPlayerId: serverState.selectorPlayerId });

    // Only sync phase on first load
    if (!initializedRef.current && serverState.phase) {
      initializedRef.current = true;
      send({
        type: "SYNC",
        phase: serverState.phase,
        data: serverState.currentQuestion
          ? {
              currentQuestion: {
                id: serverState.currentQuestion.id,
                clue: serverState.currentQuestion.clue,
                category: serverState.currentQuestion.category || "Unknown",
                value: serverState.currentQuestion.value || 0,
              },
            }
          : undefined,
      });
    }
  }, [serverState, send]);

  // Socket events
  useEffect(() => {
    if (!socket || !isConnected || !enabled) return;

    const handleQuestionSelected = (d: any) => {
      // Handle both formats: { question: {...} } or { id, clue } directly
      const question = d.question || (d.id && d.clue ? { id: d.id, clue: d.clue } : null);
      if (question) {
        // Build questionId - try multiple sources
        const category = d.category || d.question?.category || question.category;
        const value = d.value || d.question?.value || 0;
        const questionId = d.questionId || d.id || (category && value ? `${category}_${value}` : "");
        send({
          type: "QUESTION_SELECTED",
          question,
          questionId,
          value,
          category,
          isDailyDouble: d.isDailyDouble || false,
        });
      }
    };

    const handleBuzzerOpen = (d: any) => {
      send({ type: "BUZZER_OPEN", timeRemaining: d?.timeRemaining });
    };

    const handlePlayerBuzzed = (d: any) => {
      send({ type: "PLAYER_BUZZED", playerId: d.playerId, playerName: d.playerName, timeRemaining: d.timeRemaining });
    };

    const handleAnswerResult = (d: any) => {
      send({ type: "ANSWER_RESULT", ...d });
      // Update selector from server's authoritative state
      if (d.selectorPlayerId) {
        send({ type: "UPDATE_SELECTOR", selectorPlayerId: d.selectorPlayerId });
      }
      if (d.phase === "REVEALING") utils.game.getGameState.invalidate({ roomCode });
    };

    const handleStateUpdate = (d: any) => {
      // Include all relevant data in sync
      const syncData: any = {};
      if (d.currentQuestion) {
        syncData.currentQuestion = {
          id: d.currentQuestion.id,
          clue: d.currentQuestion.clue,
          category: d.currentQuestion.category || "Unknown",
          value: d.currentQuestion.value || 0,
        };
      }
      // Handle Daily Double phases - set dailyDoublePlayerId
      if (d.phase === "DAILY_DOUBLE" || d.phase === "DAILY_DOUBLE_ANSWER") {
        if (d.currentPlayerId) {
          syncData.isDailyDouble = true;
          syncData.dailyDoublePlayerId = d.currentPlayerId;
          syncData.maxWager = d.maxWager || 1000;
        }
        if (d.currentWager !== undefined) {
          syncData.currentWager = d.currentWager;
        }
      } else if (d.currentPlayerId) {
        // Include buzzer info from currentPlayerId (but don't overwrite name with ID)
        syncData.buzzedPlayerId = d.currentPlayerId;
        // Only set name if server provides it, otherwise let PLAYER_BUZZED set it
        if (d.currentPlayerName) {
          syncData.buzzedPlayerName = d.currentPlayerName;
        }
      } else if (d.phase === "BUZZING" || d.phase === "SELECTING" || d.phase === "REVEALING") {
        // Clear buzzer when no one is answering
        syncData.buzzedPlayerId = null;
        syncData.buzzedPlayerName = null;
      }
      if (d.timeRemaining !== undefined) {
        syncData.timeRemaining = d.timeRemaining;
        syncData.totalTime = d.totalTime || d.timeRemaining;
      }
      // Capture correct answer when revealed (e.g., time runs out)
      if (d.correctAnswer) {
        syncData.revealedAnswer = d.correctAnswer;
      }
      if (d.phase) send({ type: "SYNC", phase: d.phase, data: Object.keys(syncData).length > 0 ? syncData : undefined });
      if (d.selectorPlayerId) send({ type: "UPDATE_SELECTOR", selectorPlayerId: d.selectorPlayerId });
      if (d.phase === "SELECTING" || d.phase === "REVEALING") utils.game.getGameState.invalidate({ roomCode });
    };

    const handleRoomState = (d: any) => {
      if (d.phase) {
        const syncData: any = {};
        if (d.currentQuestion) {
          syncData.currentQuestion = {
            id: d.currentQuestion.id,
            clue: d.currentQuestion.clue,
            category: d.currentQuestion.category || "Unknown",
            value: d.currentQuestion.value || 0,
          };
        }
        send({ type: "SYNC", phase: d.phase, data: Object.keys(syncData).length > 0 ? syncData : undefined });
      }
    };

    const handleJoined = (d: any) => {
      if (d.gameState?.phase) send({ type: "SYNC", phase: d.gameState.phase });
      utils.game.getGameState.invalidate({ roomCode });
    };

    const handleDailyDouble = (d: any) => {
      send({
        type: "DAILY_DOUBLE",
        playerId: d.playerId,
        questionId: d.questionId,
        maxWager: d.maxWager,
        question: d.question,
        value: d.value,
        category: d.category,
      });
    };

    socket.on(GAME_EVENTS.DAILY_DOUBLE, handleDailyDouble);
    socket.on(GAME_EVENTS.QUESTION_SELECTED, handleQuestionSelected);
    socket.on(GAME_EVENTS.BUZZER_OPEN, handleBuzzerOpen);
    socket.on(GAME_EVENTS.PLAYER_BUZZED, handlePlayerBuzzed);
    socket.on(GAME_EVENTS.ANSWER_RESULT, handleAnswerResult);
    socket.on(GAME_EVENTS.STATE_UPDATE, handleStateUpdate);
    socket.on(GAME_EVENTS.GAME_END, () => { send({ type: "GAME_END" }); onGameEnd?.(); });
    socket.on(ROOM_EVENTS.STATE, handleRoomState);
    socket.on(ROOM_EVENTS.JOINED, handleJoined);
    socket.on(ROOM_EVENTS.ERROR, (d: any) => onError?.(d.message));
    socket.on(ROOM_EVENTS.PLAYER_JOINED, () => utils.game.getRoom.invalidate({ roomCode }));
    socket.on(ROOM_EVENTS.PLAYER_LEFT, () => utils.game.getRoom.invalidate({ roomCode }));
    socket.on(ROOM_EVENTS.GAME_STARTED, () => { utils.game.getGameState.invalidate({ roomCode }); utils.game.getRoom.invalidate({ roomCode }); });

    return () => {
      socket.off(GAME_EVENTS.DAILY_DOUBLE, handleDailyDouble);
      socket.off(GAME_EVENTS.QUESTION_SELECTED, handleQuestionSelected);
      socket.off(GAME_EVENTS.BUZZER_OPEN, handleBuzzerOpen);
      socket.off(GAME_EVENTS.PLAYER_BUZZED, handlePlayerBuzzed);
      socket.off(GAME_EVENTS.ANSWER_RESULT, handleAnswerResult);
      socket.off(GAME_EVENTS.STATE_UPDATE, handleStateUpdate);
      socket.off(GAME_EVENTS.GAME_END);
      socket.off(ROOM_EVENTS.STATE, handleRoomState);
      socket.off(ROOM_EVENTS.JOINED, handleJoined);
      socket.off(ROOM_EVENTS.ERROR);
      socket.off(ROOM_EVENTS.PLAYER_JOINED);
      socket.off(ROOM_EVENTS.PLAYER_LEFT);
      socket.off(ROOM_EVENTS.GAME_STARTED);
    };
  }, [socket, isConnected, enabled, send, roomCode, utils, onGameEnd, onError]);

  // Timer
  useEffect(() => {
    if (!ctx.timeRemaining || ctx.timeRemaining <= 0) return;
    const id = setInterval(() => send({ type: "TICK" }), 1000);
    return () => clearInterval(id);
  }, [ctx.timeRemaining, send]);

  // Actions
  const selectQuestion = useCallback(
    (questionId: string) => socket?.emit(GAME_EVENTS.SELECT_QUESTION, { questionId }),
    [socket]
  );

  const buzz = useCallback(() => {
    if (state.can({ type: "BUZZ" })) {
      send({ type: "BUZZ" });
      socket?.emit(GAME_EVENTS.BUZZ);
    }
  }, [socket, state, send]);

  const submitAnswer = useCallback(
    (answer: string) => answer.trim() && socket?.emit(GAME_EVENTS.SUBMIT_ANSWER, { answer }),
    [socket]
  );

  const nextQuestion = useCallback(() => {
    if (state.matches("revealing")) {
      send({ type: "NEXT_QUESTION" });
      socket?.emit(GAME_EVENTS.NEXT_QUESTION);
    }
  }, [socket, state, send]);

  const submitWager = useCallback(
    (wager: number) => {
      if (state.matches("dailyDouble")) {
        socket?.emit(GAME_EVENTS.SUBMIT_WAGER, { wager });
      }
    },
    [socket, state]
  );

  return {
    // Phase
    phase,
    isSelecting: state.matches("selecting"),
    isReading: state.matches("reading"),
    isBuzzing: state.matches("buzzing"),
    isAnswering: state.matches("answering"),
    isRevealing: state.matches("revealing"),
    isDailyDouble: state.matches("dailyDouble"),
    isDailyDoubleAnswer: state.matches("dailyDoubleAnswer"),

    // Roles
    isMyTurn: ctx.buzzedPlayerId !== null && ctx.buzzedPlayerId === ctx.playerId,
    isSelector: !ctx.isHost && ctx.selectorPlayerId !== null && ctx.selectorPlayerId === ctx.playerId,
    isDailyDoublePlayer: ctx.dailyDoublePlayerId !== null && ctx.dailyDoublePlayerId === ctx.playerId,
    selectorPlayerName: getPlayerName(ctx.selectorPlayerId),
    dailyDoublePlayerName: getPlayerName(ctx.dailyDoublePlayerId),
    canBuzz: state.can({ type: "BUZZ" }),

    // Data
    board: ctx.board,
    scores: ctx.scores,
    myScore: ctx.scores.find(([id]) => id === ctx.playerId)?.[1] ?? 0,
    currentQuestion: ctx.currentQuestion,
    buzzedPlayerName: getPlayerName(ctx.buzzedPlayerId) || ctx.buzzedPlayerName,
    timeRemaining: ctx.timeRemaining,
    totalTime: ctx.totalTime,
    lastAnswer: ctx.lastAnswer ? {
      ...ctx.lastAnswer,
      playerName: getPlayerName(ctx.lastAnswer.playerId ?? null) || ctx.lastAnswer.playerName,
    } : null,
    showAnswer: ctx.lastAnswer !== null || ctx.revealedAnswer !== null,
    correctAnswer: ctx.lastAnswer?.correctAnswer || ctx.revealedAnswer || "",
    maxWager: ctx.maxWager,
    currentWager: ctx.currentWager,

    // Meta
    isLoading,

    // Actions
    selectQuestion,
    buzz,
    submitAnswer,
    submitWager,
    nextQuestion,
  };
}

export type { GameBoard, QuestionData, AnswerResult, PlayerScore } from "./game-machine";

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSocket } from "./socket";
import { useSocketInvalidation } from "./use-socket-invalidation";
import { api } from "@/trpc/react";
import { GAME_EVENTS, ROOM_EVENTS } from "@jprty/shared";

interface AnswerResult {
  isCorrect: boolean;
  pointChange: number;
  answer?: string;
  playerId?: string;
  playerName?: string;
  correctAnswer?: string;
}

interface QuestionData {
  id: string;
  clue: string;
  category: string;
  value: number;
}

interface UseGameStateOptions {
  roomCode: string;
  playerId?: string | null;
  isHost?: boolean;
  enabled?: boolean;
  onGameEnd?: () => void;
  onError?: (message: string) => void;
}

export function useGameState({
  roomCode,
  playerId,
  isHost = false,
  enabled = true,
  onGameEnd,
  onError,
}: UseGameStateOptions) {
  const { socket, isConnected } = useSocket();

  // Server state via React Query
  const {
    data: gameState,
    isLoading,
    error,
  } = api.game.getGameState.useQuery(
    { roomCode },
    {
      enabled: !!roomCode && enabled,
      refetchInterval: false,
      staleTime: 0, // Always refetch on invalidation
    }
  );

  // Socket invalidation bridge
  useSocketInvalidation({ roomCode, enabled: enabled && !!roomCode });

  // Local state for socket event data - updated immediately from socket events
  const [buzzedPlayer, setBuzzedPlayer] = useState<string | null>(null);
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null);
  const [canBuzz, setCanBuzz] = useState(false);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [hasAttemptedCurrentQuestion, setHasAttemptedCurrentQuestion] = useState(false);
  const hasAttemptedRef = useRef(false); // Ref to avoid stale closure issues

  // Time-sensitive state that needs immediate updates from socket events
  const [socketQuestion, setSocketQuestion] = useState<QuestionData | null>(null);
  const [socketPhase, setSocketPhase] = useState<string | null>(null);

  // Countdown timer state
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [totalTime, setTotalTime] = useState<number | null>(null);
  const [timerKey, setTimerKey] = useState(0); // Incremented to force timer restart
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to start a new timer - increments key to restart the effect
  const startTimer = useCallback((time: number) => {
    setTimeRemaining(time);
    setTotalTime(time);
    setTimerKey((k) => k + 1);
  }, []);

  // Countdown timer effect - restarts when timerKey changes
  useEffect(() => {
    // Always clear any existing interval first
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    // Don't start a new interval if there's no time
    if (timeRemaining === null || timeRemaining <= 0) {
      return;
    }

    // Start new interval
    countdownRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev <= 1) {
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [timerKey]); // Re-run when timerKey changes (new timer started)

  // Use socket state if available (more recent), otherwise fall back to React Query
  const gameStatus = socketPhase || gameState?.phase || "WAITING";
  const isSelector = !isHost && gameState?.selectorPlayerId === playerId;


  // Transform board for components
  const gameBoard = gameState?.board
    ? {
        categories: gameState.board.categories,
        answeredQuestions: new Set(
          gameState.board.grid
            ?.filter((cell) => cell.isAnswered)
            .map((cell) => {
              // Build category_value format that UI components expect
              const category = gameState.board!.categories[cell.col];
              return `${category}_${cell.value}`;
            }) || []
        ),
      }
    : null;

  // Use socket question if available (more recent), otherwise fall back to React Query
  const currentQuestion = socketQuestion || (gameState?.currentQuestion
    ? {
        id: gameState.currentQuestion.id,
        clue: gameState.currentQuestion.clue,
        category: gameState.currentQuestion.category || "Unknown",
        value: gameState.currentQuestion.value || 0,
      }
    : null);

  // Socket event handlers for local state updates
  useEffect(() => {
    if (!socket || !isConnected || !enabled) return;

    const handleBuzzerOpen = (data?: { timeRemaining?: number }) => {
      console.log('[SOCKET] BUZZER_OPEN received, hasAttempted:', hasAttemptedRef.current);
      // Only allow buzzing if player hasn't already attempted this question
      // Use ref to avoid stale closure issues
      setCanBuzz(!hasAttemptedRef.current);
      setSocketPhase("BUZZING");
      setBuzzedPlayer(null);
      setAnswerResult(null);
      // Set countdown for buzz window - use startTimer to ensure timer restarts
      const buzzTime = data?.timeRemaining || 5;
      startTimer(buzzTime);
    };

    const handlePlayerBuzzed = (data: { playerName?: string; playerId: string; timeRemaining?: number }) => {
      console.log('[SOCKET] PLAYER_BUZZED:', data, 'myPlayerId:', playerId, 'isMe:', data.playerId === playerId);
      setBuzzedPlayer(data.playerName || data.playerId);
      setCanBuzz(false);
      setIsMyTurn(data.playerId === playerId);
      setSocketPhase("ANSWERING");
      // Set countdown for answer window - use startTimer to ensure timer restarts
      const answerTime = data.timeRemaining || 15;
      startTimer(answerTime);
    };

    const handleAnswerResult = (data: AnswerResult & { correctAnswer: string; phase?: string; playerName?: string }) => {
      setAnswerResult({
        isCorrect: data.isCorrect,
        pointChange: data.pointChange,
        answer: data.answer,
        playerId: data.playerId,
        playerName: data.playerName,
        correctAnswer: data.correctAnswer,
      });
      setIsMyTurn(false);
      setTimeRemaining(null);
      setTotalTime(null);
      if (data.phase) {
        setSocketPhase(data.phase);
      }
    };

    // Handle question selected - immediate update with question data
    const handleQuestionSelected = (data: {
      questionId: string;
      question?: { id: string; clue: string; answer?: string };
      value: number;
      phase: string;
    }) => {
      console.log('[SOCKET] QUESTION_SELECTED:', data);
      if (data.question) {
        // Extract category from questionId (format: "Category_Value")
        const category = data.questionId.split("_")[0] || "Unknown";
        setSocketQuestion({
          id: data.question.id,
          clue: data.question.clue,
          category,
          value: data.value,
        });
      }
      setSocketPhase(data.phase);
      setBuzzedPlayer(null);
      setAnswerResult(null);
      // Reset attempt tracking for new question
      setHasAttemptedCurrentQuestion(false);
      hasAttemptedRef.current = false;
    };

    const handleStateUpdate = (data: { phase?: string; selectorPlayerId?: string; timeRemaining?: number }) => {
      console.log('[SOCKET] STATE_UPDATE:', data);
      if (data.phase) {
        setSocketPhase(data.phase);
      }
      if (data.phase === "SELECTING") {
        // Delay reset to allow answer to be visible
        setTimeout(() => {
          setSocketQuestion(null);
          setBuzzedPlayer(null);
          setAnswerResult(null);
          setCanBuzz(false);
          setIsMyTurn(false);
          setTimeRemaining(null);
          setTotalTime(null);
        }, 3000); // 3 second delay to show answer
      } else if (data.phase === "BUZZING") {
        setCanBuzz(true);
        if (data.timeRemaining) {
          startTimer(data.timeRemaining);
        }
      }
    };

    // Handle ROOM_EVENTS.STATE (response to GET_STATE, e.g., after refresh)
    const handleRoomState = (data: {
      phase?: string;
      selectorPlayerId?: string;
      currentQuestion?: { id: string; clue: string };
      board?: { categories: string[]; answeredQuestions: string[] };
    }) => {
      console.log('[SOCKET] ROOM_STATE:', data);
      if (data.phase) {
        setSocketPhase(data.phase);
      }
      if (data.currentQuestion) {
        setSocketQuestion({
          id: data.currentQuestion.id,
          clue: data.currentQuestion.clue,
          category: "Unknown",
          value: 0,
        });
      }
    };

    // Handle ROOM_EVENTS.JOINED - extract game state (important for play page load)
    const handleJoined = (data: {
      gameState?: {
        phase?: string;
        selectorPlayerId?: string;
        currentQuestion?: { id: string; clue: string };
      };
    }) => {
      if (data.gameState?.phase) {
        setSocketPhase(data.gameState.phase);
      }
    };

    const handleGameEnd = () => {
      onGameEnd?.();
    };

    const handleError = (data: { message: string }) => {
      onError?.(data.message);
    };

    console.log('[SOCKET] Registering event handlers for events:', {
      BUZZER_OPEN: GAME_EVENTS.BUZZER_OPEN,
      PLAYER_BUZZED: GAME_EVENTS.PLAYER_BUZZED,
      QUESTION_SELECTED: GAME_EVENTS.QUESTION_SELECTED,
    });

    socket.on(GAME_EVENTS.BUZZER_OPEN, handleBuzzerOpen);
    socket.on(GAME_EVENTS.PLAYER_BUZZED, handlePlayerBuzzed);
    socket.on(GAME_EVENTS.ANSWER_RESULT, handleAnswerResult);
    socket.on(GAME_EVENTS.QUESTION_SELECTED, handleQuestionSelected);
    socket.on(GAME_EVENTS.STATE_UPDATE, handleStateUpdate);
    socket.on(GAME_EVENTS.GAME_END, handleGameEnd);
    socket.on(ROOM_EVENTS.STATE, handleRoomState);
    socket.on(ROOM_EVENTS.JOINED, handleJoined);
    socket.on(ROOM_EVENTS.ERROR, handleError);

    return () => {
      socket.off(GAME_EVENTS.BUZZER_OPEN, handleBuzzerOpen);
      socket.off(GAME_EVENTS.PLAYER_BUZZED, handlePlayerBuzzed);
      socket.off(GAME_EVENTS.ANSWER_RESULT, handleAnswerResult);
      socket.off(GAME_EVENTS.QUESTION_SELECTED, handleQuestionSelected);
      socket.off(GAME_EVENTS.STATE_UPDATE, handleStateUpdate);
      socket.off(GAME_EVENTS.GAME_END, handleGameEnd);
      socket.off(ROOM_EVENTS.STATE, handleRoomState);
      socket.off(ROOM_EVENTS.JOINED, handleJoined);
      socket.off(ROOM_EVENTS.ERROR, handleError);
    };
  }, [socket, isConnected, enabled, playerId, onGameEnd, onError, startTimer]);

  // Actions - emit to socket for low latency
  const selectQuestion = useCallback(
    (questionId: string) => {
      if (!socket || gameStatus !== "SELECTING") return;
      socket.emit(GAME_EVENTS.SELECT_QUESTION, { questionId });
    },
    [socket, gameStatus]
  );

  const buzz = useCallback(() => {
    console.log('[BUZZ] buzz() called, socket:', !!socket, 'canBuzz:', canBuzz);
    if (!socket || !canBuzz) {
      console.log('[BUZZ] Early return - socket or canBuzz is falsy');
      return;
    }
    console.log('[BUZZ] Emitting GAME_EVENTS.BUZZ');
    socket.emit(GAME_EVENTS.BUZZ);
    setCanBuzz(false);
    setHasAttemptedCurrentQuestion(true); // Mark that this player has attempted
    hasAttemptedRef.current = true; // Also update ref for immediate reads
  }, [socket, canBuzz]);

  const submitAnswer = useCallback(
    (answer: string) => {
      if (!socket || !answer.trim()) return;
      socket.emit(GAME_EVENTS.SUBMIT_ANSWER, { answer });
      setIsMyTurn(false);
    },
    [socket]
  );

  const nextQuestion = useCallback(() => {
    if (!socket) return;
    socket.emit(GAME_EVENTS.NEXT_QUESTION);
  }, [socket]);

  return {
    // Server state
    gameBoard,
    currentQuestion,
    gameStatus,
    selectorPlayerId: gameState?.selectorPlayerId,
    scores: gameState?.scores,
    roundNumber: gameState?.roundNumber,
    roundType: gameState?.roundType,

    // Local socket state
    buzzedPlayer,
    answerResult,
    canBuzz,
    isMyTurn,
    timeRemaining,
    totalTime,

    // Derived state
    isSelector,
    showAnswer: !!answerResult,
    correctAnswer: answerResult?.correctAnswer || "",
    isCorrect: answerResult?.isCorrect ?? null,
    playerAnswer: answerResult?.answer || null,
    answeringPlayerName: answerResult?.playerName || null,

    // Loading state
    isLoading,
    error,

    // Actions
    selectQuestion,
    buzz,
    submitAnswer,
    nextQuestion,
  };
}

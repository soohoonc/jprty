import { setup, assign } from "xstate";

// Types
export interface QuestionData {
  id: string;
  clue: string;
  category: string;
  value: number;
}

export interface AnswerResult {
  isCorrect: boolean;
  pointChange: number;
  answer?: string;
  playerId?: string;
  playerName?: string;
  correctAnswer?: string;
}

export interface GameBoard {
  categories: string[];
  answeredQuestions: Set<string>;
}

export type PlayerScore = [string, number];

export interface GameContext {
  playerId: string | null;
  isHost: boolean;
  board: GameBoard | null;
  scores: PlayerScore[];
  currentQuestion: QuestionData | null;
  selectorPlayerId: string | null;
  buzzedPlayerId: string | null;
  buzzedPlayerName: string | null;
  hasAttempted: boolean;
  timeRemaining: number | null;
  totalTime: number | null;
  lastAnswer: AnswerResult | null;
  revealedAnswer: string | null;
  // Daily Double
  isDailyDouble: boolean;
  dailyDoublePlayerId: string | null;
  maxWager: number;
  currentWager: number | null;
}

export type GameEvent =
  | { type: "SYNC"; phase: string; data?: Partial<GameContext> }
  | { type: "SET_IDENTITY"; playerId: string | null; isHost: boolean }
  | { type: "QUESTION_SELECTED"; question: { id: string; clue: string }; questionId: string; value: number; isDailyDouble?: boolean }
  | { type: "BUZZER_OPEN"; timeRemaining?: number }
  | { type: "PLAYER_BUZZED"; playerId: string; playerName?: string; timeRemaining?: number }
  | { type: "ANSWER_RESULT"; isCorrect: boolean; pointChange: number; answer?: string; playerId?: string; playerName?: string; correctAnswer?: string; phase?: string }
  | { type: "BUZZ" }
  | { type: "NEXT_QUESTION" }
  | { type: "TICK" }
  | { type: "UPDATE_BOARD"; board: GameBoard }
  | { type: "UPDATE_SCORES"; scores: PlayerScore[] }
  | { type: "UPDATE_SELECTOR"; selectorPlayerId: string }
  | { type: "GAME_END" }
  | { type: "DAILY_DOUBLE"; playerId: string; questionId: string; maxWager: number; question?: { id: string; clue: string }; value?: number }
  | { type: "WAGER_SUBMITTED"; timeRemaining?: number };

export const gameMachine = setup({
  types: {} as { context: GameContext; events: GameEvent },
  guards: {
    canBuzz: ({ context }) => !context.hasAttempted && !context.isHost,
    isCorrect: ({ event }) => event.type === "ANSWER_RESULT" && event.isCorrect,
    buzzerReopens: ({ event }) => event.type === "ANSWER_RESULT" && !event.isCorrect && event.phase === "BUZZING",
  },
  actions: {
    setQuestion: assign(({ context, event }) => {
      if (event.type !== "QUESTION_SELECTED") return {};
      // Optimistically mark question as answered
      const existingAnswered = context.board?.answeredQuestions instanceof Set
        ? Array.from(context.board.answeredQuestions)
        : (context.board?.answeredQuestions ?? []);
      const newAnsweredQuestions = new Set(existingAnswered);
      if (event.questionId) {
        newAnsweredQuestions.add(event.questionId);
      }
      return {
        currentQuestion: {
          id: event.question.id,
          clue: event.question.clue,
          category: event.questionId?.split("_")[0] || "Unknown",
          value: event.value,
        },
        board: context.board ? {
          ...context.board,
          answeredQuestions: newAnsweredQuestions,
        } : null,
        hasAttempted: false,
        lastAnswer: null,
        revealedAnswer: null,
        buzzedPlayerId: null,
        buzzedPlayerName: null,
        timeRemaining: null,
        totalTime: null,
        // Set currentWager if this is a Daily Double (wager was submitted)
        currentWager: event.isDailyDouble ? event.value : null,
      };
    }),
    setTimer: assign(({ event }) => {
      const time = (event as { timeRemaining?: number }).timeRemaining ?? 5;
      return { timeRemaining: time, totalTime: time };
    }),
    recordBuzz: assign(({ event }) => {
      if (event.type !== "PLAYER_BUZZED") return {};
      const time = event.timeRemaining ?? 15;
      return {
        buzzedPlayerId: event.playerId,
        buzzedPlayerName: event.playerName || event.playerId,
        timeRemaining: time,
        totalTime: time,
      };
    }),
    markAttempted: assign({ hasAttempted: true }),
    recordAnswer: assign(({ context, event }) => {
      if (event.type !== "ANSWER_RESULT") return {};
      return {
        lastAnswer: {
          isCorrect: event.isCorrect,
          pointChange: event.pointChange,
          answer: event.answer,
          playerId: event.playerId,
          playerName: event.playerName,
          correctAnswer: event.correctAnswer,
        },
        revealedAnswer: event.correctAnswer || context.revealedAnswer,
        buzzedPlayerId: event.phase === "BUZZING" ? null : context.buzzedPlayerId,
        buzzedPlayerName: event.phase === "BUZZING" ? null : context.buzzedPlayerName,
        timeRemaining: null,
        totalTime: null,
        // selectorPlayerId is updated via UPDATE_SELECTOR from server
      };
    }),
    tick: assign(({ context }) => ({
      timeRemaining: context.timeRemaining && context.timeRemaining > 0 ? context.timeRemaining - 1 : null,
    })),
    clearQuestion: assign({
      currentQuestion: null,
      lastAnswer: null,
      revealedAnswer: null,
      buzzedPlayerId: null,
      buzzedPlayerName: null,
      hasAttempted: false,
      timeRemaining: null,
      totalTime: null,
      isDailyDouble: false,
      dailyDoublePlayerId: null,
      maxWager: 0,
      currentWager: null,
    }),
    setDailyDouble: assign(({ event }) => {
      if (event.type !== "DAILY_DOUBLE") return {};
      return {
        isDailyDouble: true,
        dailyDoublePlayerId: event.playerId,
        maxWager: event.maxWager,
        currentQuestion: event.question ? {
          id: event.question.id,
          clue: event.question.clue,
          category: event.questionId?.split("_")[0] || "Unknown",
          value: event.value || 0,
        } : null,
      };
    }),
    setWager: assign(({ event }) => {
      if (event.type !== "WAGER_SUBMITTED") return {};
      const time = event.timeRemaining ?? 15;
      return {
        timeRemaining: time,
        totalTime: time,
      };
    }),
    setDailyDoubleAnswering: assign(({ context }) => ({
      // For Daily Double, the dailyDoublePlayerId becomes the answering player
      buzzedPlayerId: context.dailyDoublePlayerId,
      buzzedPlayerName: null, // Will be resolved via getPlayerName
    })),
    syncContext: assign(({ event }) => (event.type === "SYNC" ? event.data ?? {} : {})),
  },
}).createMachine({
  id: "game",
  initial: "lobby",
  context: {
    playerId: null,
    isHost: false,
    board: null,
    scores: [],
    currentQuestion: null,
    selectorPlayerId: null,
    buzzedPlayerId: null,
    buzzedPlayerName: null,
    hasAttempted: false,
    timeRemaining: null,
    totalTime: null,
    lastAnswer: null,
    revealedAnswer: null,
    isDailyDouble: false,
    dailyDoublePlayerId: null,
    maxWager: 0,
    currentWager: null,
  },

  on: {
    SET_IDENTITY: { actions: assign(({ event }) => ({ playerId: event.playerId, isHost: event.isHost })) },
    UPDATE_BOARD: { actions: assign(({ context, event }) => {
      // Merge answered questions to preserve optimistic updates
      // Ensure we handle both Set and Array inputs
      const existingAnswered = context.board?.answeredQuestions instanceof Set
        ? Array.from(context.board.answeredQuestions)
        : (context.board?.answeredQuestions ?? []);
      const newAnswered = event.board.answeredQuestions instanceof Set
        ? Array.from(event.board.answeredQuestions)
        : (event.board.answeredQuestions ?? []);
      const mergedAnswered = new Set([...existingAnswered, ...newAnswered]);
      return {
        board: {
          ...event.board,
          answeredQuestions: mergedAnswered,
        },
      };
    }) },
    UPDATE_SCORES: { actions: assign(({ event }) => ({ scores: event.scores })) },
    UPDATE_SELECTOR: { actions: assign(({ event }) => ({ selectorPlayerId: event.selectorPlayerId })) },
    GAME_END: { target: ".gameEnd" },
    SYNC: [
      { guard: ({ event }) => event.phase === "WAITING", target: ".lobby", actions: "syncContext" },
      { guard: ({ event }) => event.phase === "SELECTING", target: ".selecting", actions: "syncContext" },
      { guard: ({ event }) => event.phase === "READING", target: ".reading", actions: "syncContext" },
      { guard: ({ event }) => event.phase === "BUZZING", target: ".buzzing", actions: "syncContext" },
      { guard: ({ event }) => event.phase === "ANSWERING", target: ".answering", actions: "syncContext" },
      { guard: ({ event }) => event.phase === "REVEALING", target: ".revealing", actions: "syncContext" },
      { guard: ({ event }) => event.phase === "DAILY_DOUBLE", target: ".dailyDouble", actions: "syncContext" },
      { guard: ({ event }) => event.phase === "DAILY_DOUBLE_ANSWER", target: ".dailyDoubleAnswer", actions: "syncContext" },
      { guard: ({ event }) => event.phase === "ENDED", target: ".gameEnd", actions: "syncContext" },
    ],
  },

  states: {
    lobby: {
      on: {
        QUESTION_SELECTED: { target: "reading", actions: "setQuestion" },
        DAILY_DOUBLE: { target: "dailyDouble", actions: "setDailyDouble" },
      },
    },
    selecting: {
      entry: "clearQuestion",
      on: {
        QUESTION_SELECTED: { target: "reading", actions: "setQuestion" },
        DAILY_DOUBLE: { target: "dailyDouble", actions: "setDailyDouble" },
      },
    },
    reading: {
      on: { BUZZER_OPEN: { target: "buzzing", actions: "setTimer" } },
    },
    buzzing: {
      on: {
        PLAYER_BUZZED: { target: "answering", actions: "recordBuzz" },
        BUZZ: { guard: "canBuzz", actions: "markAttempted" },
        TICK: { actions: "tick" },
        ANSWER_RESULT: { target: "revealing", actions: "recordAnswer" },
      },
    },
    answering: {
      on: {
        ANSWER_RESULT: [
          { guard: "isCorrect", target: "revealing", actions: "recordAnswer" },
          { guard: "buzzerReopens", target: "buzzing", actions: "recordAnswer" },
          { target: "revealing", actions: "recordAnswer" },
        ],
        TICK: { actions: "tick" },
      },
    },
    revealing: {
      on: {
        ANSWER_RESULT: { actions: "recordAnswer" },
        NEXT_QUESTION: { target: "selecting" },
        QUESTION_SELECTED: { target: "reading", actions: "setQuestion" },
        DAILY_DOUBLE: { target: "dailyDouble", actions: "setDailyDouble" },
      },
    },
    dailyDouble: {
      // Waiting for wager submission
      on: {
        WAGER_SUBMITTED: { target: "dailyDoubleAnswer", actions: ["setWager", "setDailyDoubleAnswering"] },
        QUESTION_SELECTED: { target: "dailyDoubleAnswer", actions: ["setQuestion", "setDailyDoubleAnswering"] },
        TICK: { actions: "tick" },
      },
    },
    dailyDoubleAnswer: {
      // Player is answering Daily Double
      on: {
        ANSWER_RESULT: { target: "revealing", actions: "recordAnswer" },
        TICK: { actions: "tick" },
      },
    },
    gameEnd: { type: "final" },
  },
});

const PHASE_MAP: Record<string, string> = {
  lobby: "WAITING",
  selecting: "SELECTING",
  reading: "READING",
  buzzing: "BUZZING",
  answering: "ANSWERING",
  revealing: "REVEALING",
  dailyDouble: "DAILY_DOUBLE",
  dailyDoubleAnswer: "DAILY_DOUBLE_ANSWER",
  gameEnd: "ENDED",
};

export const getPhase = (state: string) => PHASE_MAP[state] || "WAITING";

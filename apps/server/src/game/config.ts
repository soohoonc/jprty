import type { RoundType } from '@jprty/db';

export const GAME_CONFIG = {
  categoriesPerRound: 6,
  questionsPerCategory: 5,

  // Point values per row (1-5) for Single Jeopardy
  singleJeopardyValues: [200, 400, 600, 800, 1000],

  // Point values per row (1-5) for Double Jeopardy
  doubleJeopardyValues: [400, 800, 1200, 1600, 2000],

  // Daily Doubles per round
  dailyDoublesPerRound: {
    SINGLE_JEOPARDY: 1,
    DOUBLE_JEOPARDY: 2,
    FINAL_JEOPARDY: 0,
  },

  // Timing (in ms)
  timing: {
    readingDelay: 3000,      // Time to read question before buzzer opens
    buzzWindow: 5000,        // Time players have to buzz in
    answerWindow: 15000,     // Time to answer after buzzing
    revealDelay: 8000,       // Time showing answer before next question
    dailyDoubleWager: 10000, // Time to place Daily Double wager
    finalJeopardyWager: 30000, // Time to place Final Jeopardy wager
    finalJeopardyAnswer: 30000, // Time to write Final Jeopardy answer
  },

  // Wagering rules
  wager: {
    minimumWager: 5,
    // If score < minimum board value, can wager up to highest value on board
    lowScoreMaxWager: {
      SINGLE_JEOPARDY: 1000,
      DOUBLE_JEOPARDY: 2000,
    },
  },

  // Legacy point values (for backward compatibility)
  pointValues: {
    easy: 200,
    medium: 400,
    hard: 800,
  },
  doubleMultiplier: 2,
  finalValue: 0, // Final Jeopardy value is based on wager
} as const;

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface QuestionSetFilter {
  categories?: string[];
  airDateStart?: Date;
  airDateEnd?: Date;
}

export interface RoundEvent {
  questionId: string;
  playerId: string;
  eventType: 'answered' | 'skipped' | 'timeout' | 'wager' | 'daily_double';
  answer?: string;
  correct?: boolean;
  wager?: number;
  timestamp: Date;
}

export interface BoardCell {
  questionId: string;
  value: number;
  isAnswered: boolean;
  isDailyDouble: boolean;
  row: number;
  col: number;
}

export interface GameBoard {
  categories: string[];
  cells: BoardCell[][];
  answeredCount: number;
  totalQuestions: number;
}

export interface RoundConfig {
  roundType: RoundType;
  values: number[];
  dailyDoubles: number;
}

export function getRoundConfig(roundType: RoundType): RoundConfig {
  switch (roundType) {
    case 'SINGLE_JEOPARDY':
      return {
        roundType,
        values: [...GAME_CONFIG.singleJeopardyValues],
        dailyDoubles: GAME_CONFIG.dailyDoublesPerRound.SINGLE_JEOPARDY,
      };
    case 'DOUBLE_JEOPARDY':
      return {
        roundType,
        values: [...GAME_CONFIG.doubleJeopardyValues],
        dailyDoubles: GAME_CONFIG.dailyDoublesPerRound.DOUBLE_JEOPARDY,
      };
    case 'FINAL_JEOPARDY':
      return {
        roundType,
        values: [0], // Wager-based
        dailyDoubles: 0,
      };
    default:
      return {
        roundType: 'SINGLE_JEOPARDY',
        values: [...GAME_CONFIG.singleJeopardyValues],
        dailyDoubles: 1,
      };
  }
}

export function getNextRoundType(currentRound: RoundType): RoundType | null {
  switch (currentRound) {
    case 'SINGLE_JEOPARDY':
      return 'DOUBLE_JEOPARDY';
    case 'DOUBLE_JEOPARDY':
      return 'FINAL_JEOPARDY';
    case 'FINAL_JEOPARDY':
      return null; // Game over
    default:
      return null;
  }
}

export function calculateMaxWager(
  playerScore: number,
  roundType: RoundType
): number {
  if (roundType === 'FINAL_JEOPARDY') {
    // In Final Jeopardy, you can only wager what you have (can't go negative)
    return Math.max(0, playerScore);
  }

  // For Daily Doubles
  const minBoardValue = roundType === 'DOUBLE_JEOPARDY' ? 400 : 200;
  const maxBoardValue = GAME_CONFIG.wager.lowScoreMaxWager[
    roundType as 'SINGLE_JEOPARDY' | 'DOUBLE_JEOPARDY'
  ];

  if (playerScore < minBoardValue) {
    return maxBoardValue;
  }

  return Math.max(playerScore, maxBoardValue);
}

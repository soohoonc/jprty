import type { RoundType } from './types';

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
  } as Record<RoundType, number>,

  // Timing (in ms)
  timing: {
    readingDelay: 3000,
    buzzWindow: 5000,
    answerWindow: 15000,
    revealDelay: 3000,
    dailyDoubleWager: 10000,
    finalJeopardyWager: 30000,
    finalJeopardyAnswer: 30000,
  },

  // Wagering rules
  wager: {
    minimumWager: 5,
    lowScoreMaxWager: {
      SINGLE_JEOPARDY: 1000,
      DOUBLE_JEOPARDY: 2000,
    } as Record<'SINGLE_JEOPARDY' | 'DOUBLE_JEOPARDY', number>,
  },
} as const;

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
        values: [0],
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
      return null;
    default:
      return null;
  }
}

export function calculateMaxWager(
  playerScore: number,
  roundType: RoundType
): number {
  if (roundType === 'FINAL_JEOPARDY') {
    return Math.max(0, playerScore);
  }

  const minBoardValue = roundType === 'DOUBLE_JEOPARDY' ? 400 : 200;
  const maxBoardValue = GAME_CONFIG.wager.lowScoreMaxWager[
    roundType as 'SINGLE_JEOPARDY' | 'DOUBLE_JEOPARDY'
  ];

  if (playerScore < minBoardValue) {
    return maxBoardValue;
  }

  return Math.max(playerScore, maxBoardValue);
}

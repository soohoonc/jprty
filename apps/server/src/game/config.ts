export const GAME_CONFIG = {
  categoriesPerRound: 6,
  questionsPerCategory: 5,
  pointValues: {
    easy: 100,
    medium: 200,
    hard: 400,
  },
  doubleMultiplier: 2,
  finalValue: 1000,
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
  eventType: 'answered' | 'skipped' | 'timeout';
  answer?: string;
  correct?: boolean;
  timestamp: Date;
}

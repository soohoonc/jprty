import { describe, expect, test } from 'bun:test';
import {
  GAME_CONFIG,
  getRoundConfig,
  getNextRoundType,
  calculateMaxWager,
} from './config';

describe('GAME_CONFIG', () => {
  test('has correct Single Jeopardy values', () => {
    expect(GAME_CONFIG.singleJeopardyValues).toEqual([200, 400, 600, 800, 1000]);
  });

  test('has correct Double Jeopardy values', () => {
    expect(GAME_CONFIG.doubleJeopardyValues).toEqual([400, 800, 1200, 1600, 2000]);
  });

  test('has correct daily doubles per round', () => {
    expect(GAME_CONFIG.dailyDoublesPerRound.SINGLE_JEOPARDY).toBe(1);
    expect(GAME_CONFIG.dailyDoublesPerRound.DOUBLE_JEOPARDY).toBe(2);
    expect(GAME_CONFIG.dailyDoublesPerRound.FINAL_JEOPARDY).toBe(0);
  });

  test('has valid timing values', () => {
    expect(GAME_CONFIG.timing.readingDelay).toBeGreaterThan(0);
    expect(GAME_CONFIG.timing.buzzWindow).toBeGreaterThan(0);
    expect(GAME_CONFIG.timing.answerWindow).toBeGreaterThan(0);
    expect(GAME_CONFIG.timing.revealDelay).toBeGreaterThan(0);
  });
});

describe('getRoundConfig', () => {
  test('returns correct config for Single Jeopardy', () => {
    const config = getRoundConfig('SINGLE_JEOPARDY');
    expect(config.roundType).toBe('SINGLE_JEOPARDY');
    expect(config.values).toEqual([200, 400, 600, 800, 1000]);
    expect(config.dailyDoubles).toBe(1);
  });

  test('returns correct config for Double Jeopardy', () => {
    const config = getRoundConfig('DOUBLE_JEOPARDY');
    expect(config.roundType).toBe('DOUBLE_JEOPARDY');
    expect(config.values).toEqual([400, 800, 1200, 1600, 2000]);
    expect(config.dailyDoubles).toBe(2);
  });

  test('returns correct config for Final Jeopardy', () => {
    const config = getRoundConfig('FINAL_JEOPARDY');
    expect(config.roundType).toBe('FINAL_JEOPARDY');
    expect(config.values).toEqual([0]);
    expect(config.dailyDoubles).toBe(0);
  });
});

describe('getNextRoundType', () => {
  test('Single Jeopardy -> Double Jeopardy', () => {
    expect(getNextRoundType('SINGLE_JEOPARDY')).toBe('DOUBLE_JEOPARDY');
  });

  test('Double Jeopardy -> Final Jeopardy', () => {
    expect(getNextRoundType('DOUBLE_JEOPARDY')).toBe('FINAL_JEOPARDY');
  });

  test('Final Jeopardy -> null (game over)', () => {
    expect(getNextRoundType('FINAL_JEOPARDY')).toBeNull();
  });
});

describe('calculateMaxWager', () => {
  describe('Daily Double wagering', () => {
    test('allows wagering up to current score if score > max board value', () => {
      // Player has $5000, max board value in Single Jeopardy is $1000
      expect(calculateMaxWager(5000, 'SINGLE_JEOPARDY')).toBe(5000);
    });

    test('allows wagering up to max board value if score is low', () => {
      // Player has $100, should still be able to wager up to $1000
      expect(calculateMaxWager(100, 'SINGLE_JEOPARDY')).toBe(1000);
    });

    test('uses Double Jeopardy max for that round', () => {
      expect(calculateMaxWager(100, 'DOUBLE_JEOPARDY')).toBe(2000);
    });

    test('allows wagering higher of score or max board value', () => {
      // Player has $1500 in Single Jeopardy, can wager $1500 (> $1000 max)
      expect(calculateMaxWager(1500, 'SINGLE_JEOPARDY')).toBe(1500);
    });
  });

  describe('Final Jeopardy wagering', () => {
    test('can only wager up to current score', () => {
      expect(calculateMaxWager(5000, 'FINAL_JEOPARDY')).toBe(5000);
      expect(calculateMaxWager(1000, 'FINAL_JEOPARDY')).toBe(1000);
    });

    test('returns 0 for negative or zero score', () => {
      expect(calculateMaxWager(0, 'FINAL_JEOPARDY')).toBe(0);
      expect(calculateMaxWager(-500, 'FINAL_JEOPARDY')).toBe(0);
    });
  });
});

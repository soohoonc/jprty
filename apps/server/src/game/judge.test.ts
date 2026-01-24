import { describe, expect, test } from 'bun:test';
import { judge, judgeWithDetails } from './judge';

describe('judge', () => {
  describe('exact matches', () => {
    test('returns true for exact match', () => {
      expect(judge('Paris', 'Paris')).toBe(true);
    });

    test('is case insensitive', () => {
      expect(judge('Paris', 'paris')).toBe(true);
      expect(judge('PARIS', 'paris')).toBe(true);
      expect(judge('paris', 'PARIS')).toBe(true);
    });

    test('ignores leading/trailing whitespace', () => {
      expect(judge('Paris', '  Paris  ')).toBe(true);
      expect(judge('  Paris  ', 'Paris')).toBe(true);
    });

    test('normalizes internal whitespace', () => {
      expect(judge('New York', 'New  York')).toBe(true);
      expect(judge('New   York', 'New York')).toBe(true);
    });
  });

  describe('Jeopardy format stripping', () => {
    test('accepts "What is X" format', () => {
      expect(judge('Paris', 'What is Paris')).toBe(true);
      expect(judge('Paris', 'what is paris')).toBe(true);
    });

    test('accepts "Who is X" format', () => {
      expect(judge('Abraham Lincoln', 'Who is Abraham Lincoln')).toBe(true);
      expect(judge('Einstein', 'who was einstein')).toBe(true);
    });

    test('accepts "Where is X" format', () => {
      expect(judge('France', 'Where is France')).toBe(true);
    });

    test('accepts "What are X" format', () => {
      expect(judge('electrons', 'What are electrons')).toBe(true);
    });

    test('strips articles after Jeopardy prefix', () => {
      expect(judge('Eiffel Tower', 'What is the Eiffel Tower')).toBe(true);
      expect(judge('apple', 'What is an apple')).toBe(true);
    });
  });

  describe('article handling', () => {
    test('ignores leading "the"', () => {
      expect(judge('Beatles', 'The Beatles')).toBe(true);
      expect(judge('the Beatles', 'Beatles')).toBe(true);
    });

    test('ignores leading "a" and "an"', () => {
      expect(judge('dog', 'a dog')).toBe(true);
      expect(judge('apple', 'an apple')).toBe(true);
    });
  });

  describe('fuzzy matching', () => {
    test('accepts minor typos', () => {
      expect(judge('Mississippi', 'Missisippi')).toBe(true); // one s missing
      expect(judge('necessary', 'necesary')).toBe(true); // one s missing
    });

    test('accepts minor spelling variations', () => {
      // Note: "color"/"colour" is 83% similar, below 85% threshold
      // These work because they're longer words with small differences
      expect(judge('organization', 'organisation')).toBe(true);
      expect(judge('recognize', 'recognise')).toBe(true);
    });

    test('rejects answers that are too different', () => {
      expect(judge('Paris', 'London')).toBe(false);
      expect(judge('Abraham Lincoln', 'George Washington')).toBe(false);
    });
  });

  describe('number variations', () => {
    test('accepts numeric vs word numbers', () => {
      expect(judge('3', 'three')).toBe(true);
      expect(judge('three', '3')).toBe(true);
      expect(judge('10', 'ten')).toBe(true);
      expect(judge('twenty', '20')).toBe(true);
    });
  });

  describe('common abbreviations', () => {
    test('accepts USA variations', () => {
      expect(judge('United States', 'USA')).toBe(true);
      expect(judge('USA', 'United States')).toBe(true);
      expect(judge('United States of America', 'USA')).toBe(true);
    });

    test('accepts UK variations', () => {
      expect(judge('United Kingdom', 'UK')).toBe(true);
      expect(judge('Great Britain', 'UK')).toBe(true);
    });
  });

  describe('plural variations', () => {
    test('accepts simple plural/singular differences', () => {
      expect(judge('cat', 'cats')).toBe(true);
      expect(judge('dogs', 'dog')).toBe(true);
    });

    test('accepts -es plural variations', () => {
      expect(judge('box', 'boxes')).toBe(true);
      expect(judge('churches', 'church')).toBe(true);
    });
  });

  describe('punctuation handling', () => {
    test('ignores punctuation', () => {
      expect(judge("it's", 'its')).toBe(true);
      expect(judge('Mr. Smith', 'Mr Smith')).toBe(true);
      expect(judge('U.S.A.', 'USA')).toBe(true);
    });

    test('ignores quotes', () => {
      expect(judge('Hamlet', '"Hamlet"')).toBe(true);
      expect(judge("'Hamlet'", 'Hamlet')).toBe(true);
    });
  });

  describe('edge cases', () => {
    test('rejects empty answers', () => {
      expect(judge('Paris', '')).toBe(false);
      expect(judge('Paris', '   ')).toBe(false);
    });

    test('handles null/undefined gracefully', () => {
      expect(judge('Paris', null as any)).toBe(false);
      expect(judge('Paris', undefined as any)).toBe(false);
    });

    test('handles very long answers', () => {
      const longAnswer = 'a'.repeat(200);
      expect(judge('test', longAnswer)).toBe(false);
    });
  });
});

describe('judgeWithDetails', () => {
  test('returns confidence score', () => {
    const result = judgeWithDetails('Paris', 'Paris');
    expect(result.correct).toBe(true);
    expect(result.confidence).toBe(1.0);
  });

  test('returns normalized strings', () => {
    const result = judgeWithDetails('The PARIS!', '  what is paris  ');
    expect(result.normalizedExpected).toBe('the paris');
    expect(result.normalizedGiven).toBe('paris');
  });

  test('returns reason for match', () => {
    const exactMatch = judgeWithDetails('Paris', 'Paris');
    expect(exactMatch.reason).toContain('Exact');

    const fuzzyMatch = judgeWithDetails('Mississippi', 'Missisippi');
    expect(fuzzyMatch.reason).toContain('similar');
  });

  test('returns low confidence for wrong answers', () => {
    const result = judgeWithDetails('Paris', 'London');
    expect(result.correct).toBe(false);
    expect(result.confidence).toBeLessThan(0.5);
  });
});

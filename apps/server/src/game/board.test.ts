import { describe, expect, test } from 'bun:test';
import {
  generateDailyDoublePositions,
  createGameBoard,
  markQuestionUsed,
  isBoardComplete,
  getBoardCell,
} from './board';

describe('generateDailyDoublePositions', () => {
  test('generates correct number of Daily Doubles', () => {
    const positions = generateDailyDoublePositions(6, 5, 1);
    expect(positions.size).toBe(1);

    const positions2 = generateDailyDoublePositions(6, 5, 2);
    expect(positions2.size).toBe(2);
  });

  test('does not place two Daily Doubles in same category', () => {
    // Run multiple times to ensure randomness doesn't break this
    for (let i = 0; i < 10; i++) {
      const positions = generateDailyDoublePositions(6, 5, 2);
      const categories = Array.from(positions).map(pos => pos.split('-')[0]);
      const uniqueCategories = new Set(categories);
      expect(uniqueCategories.size).toBe(categories.length);
    }
  });

  test('positions are within valid bounds', () => {
    const positions = generateDailyDoublePositions(6, 5, 2);
    for (const pos of positions) {
      const [col, row] = pos.split('-').map(Number);
      expect(col).toBeGreaterThanOrEqual(0);
      expect(col).toBeLessThan(6);
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(5);
    }
  });
});

describe('createGameBoard', () => {
  const mockCategories = ['History', 'Science', 'Arts', 'Sports', 'Music', 'Movies'];
  const mockQuestions = Array.from({ length: 30 }, (_, i) => ({
    id: `q${i}`,
    clue: `Question ${i}`,
    answer: `Answer ${i}`,
    difficulty: 'medium',
  }));

  test('creates board with correct dimensions', () => {
    const board = createGameBoard(mockCategories, mockQuestions, 'SINGLE_JEOPARDY');
    expect(board.categories.length).toBe(6);
    expect(board.cells.length).toBe(5); // 5 rows
    expect(board.cells[0]!.length).toBe(6); // 6 columns
  });

  test('Single Jeopardy has correct point values', () => {
    const board = createGameBoard(mockCategories, mockQuestions, 'SINGLE_JEOPARDY');
    const expectedValues = [200, 400, 600, 800, 1000];

    for (let row = 0; row < 5; row++) {
      expect(board.cells[row]![0]!.value).toBe(expectedValues[row]);
    }
  });

  test('Double Jeopardy has correct point values', () => {
    const board = createGameBoard(mockCategories, mockQuestions, 'DOUBLE_JEOPARDY');
    const expectedValues = [400, 800, 1200, 1600, 2000];

    for (let row = 0; row < 5; row++) {
      expect(board.cells[row]![0]!.value).toBe(expectedValues[row]);
    }
  });

  test('has correct number of Daily Doubles for Single Jeopardy', () => {
    const board = createGameBoard(mockCategories, mockQuestions, 'SINGLE_JEOPARDY');
    let dailyDoubleCount = 0;

    for (const row of board.cells) {
      for (const cell of row) {
        if (cell.isDailyDouble) dailyDoubleCount++;
      }
    }

    expect(dailyDoubleCount).toBe(1);
  });

  test('has correct number of Daily Doubles for Double Jeopardy', () => {
    const board = createGameBoard(mockCategories, mockQuestions, 'DOUBLE_JEOPARDY');
    let dailyDoubleCount = 0;

    for (const row of board.cells) {
      for (const cell of row) {
        if (cell.isDailyDouble) dailyDoubleCount++;
      }
    }

    expect(dailyDoubleCount).toBe(2);
  });

  test('initializes with zero answered questions', () => {
    const board = createGameBoard(mockCategories, mockQuestions, 'SINGLE_JEOPARDY');
    expect(board.answeredCount).toBe(0);
    expect(board.totalQuestions).toBe(30);
  });

  test('all cells start as unused', () => {
    const board = createGameBoard(mockCategories, mockQuestions, 'SINGLE_JEOPARDY');

    for (const row of board.cells) {
      for (const cell of row) {
        expect(cell.isUsed).toBe(false);
      }
    }
  });

  test('prefers questions tagged to the requested category when available', () => {
    const taggedCategories = ['SCIENCE', 'HISTORY', 'SPORTS', 'MUSIC', 'ART', 'TECH'];
    const taggedQuestions = taggedCategories.flatMap((category, categoryIndex) =>
      [200, 400, 600, 800, 1000].map((value, rowIndex) => ({
        id: `${category}-${value}`,
        clue: `${category} clue ${rowIndex}`,
        answer: `${category} answer ${rowIndex}`,
        value,
        difficulty: 'medium',
        difficultyScore: rowIndex + 1,
        tags: [{ tag: { name: category } }],
      })),
    );

    const board = createGameBoard(taggedCategories, taggedQuestions, 'SINGLE_JEOPARDY');

    expect(board.cells[0]![0]!.questionId).toBe('SCIENCE-200');
    expect(board.cells[4]![5]!.questionId).toBe('TECH-1000');
  });
});

describe('markQuestionUsed', () => {
  const mockCategories = ['Cat1', 'Cat2', 'Cat3', 'Cat4', 'Cat5', 'Cat6'];
  const mockQuestions = Array.from({ length: 30 }, (_, i) => ({
    id: `q${i}`,
    clue: `Question ${i}`,
    answer: `Answer ${i}`,
    difficulty: 'medium',
  }));

  test('marks question as used', () => {
    const board = createGameBoard(mockCategories, mockQuestions, 'SINGLE_JEOPARDY');
    const questionId = board.cells[0]![0]!.questionId;

    const newBoard = markQuestionUsed(board, questionId);

    expect(newBoard.cells[0]![0]!.isUsed).toBe(true);
  });

  test('increments answered count', () => {
    const board = createGameBoard(mockCategories, mockQuestions, 'SINGLE_JEOPARDY');
    const questionId = board.cells[0]![0]!.questionId;

    const newBoard = markQuestionUsed(board, questionId);

    expect(newBoard.answeredCount).toBe(1);
  });

  test('does not modify other cells', () => {
    const board = createGameBoard(mockCategories, mockQuestions, 'SINGLE_JEOPARDY');
    const questionId = board.cells[0]![0]!.questionId;

    const newBoard = markQuestionUsed(board, questionId);

    // Check other cells are still unused
    expect(newBoard.cells[0]![1]!.isUsed).toBe(false);
    expect(newBoard.cells[1]![0]!.isUsed).toBe(false);
  });

  test('returns new board object (immutable)', () => {
    const board = createGameBoard(mockCategories, mockQuestions, 'SINGLE_JEOPARDY');
    const questionId = board.cells[0]![0]!.questionId;

    const newBoard = markQuestionUsed(board, questionId);

    expect(newBoard).not.toBe(board);
    expect(board.cells[0]![0]!.isUsed).toBe(false); // Original unchanged
  });
});

describe('isBoardComplete', () => {
  const mockCategories = ['Cat1', 'Cat2', 'Cat3', 'Cat4', 'Cat5', 'Cat6'];
  const mockQuestions = Array.from({ length: 30 }, (_, i) => ({
    id: `q${i}`,
    clue: `Question ${i}`,
    answer: `Answer ${i}`,
    difficulty: 'medium',
  }));

  test('returns false for new board', () => {
    const board = createGameBoard(mockCategories, mockQuestions, 'SINGLE_JEOPARDY');
    expect(isBoardComplete(board)).toBe(false);
  });

  test('returns false for partially completed board', () => {
    let board = createGameBoard(mockCategories, mockQuestions, 'SINGLE_JEOPARDY');

    // Mark half the questions as used
    for (let i = 0; i < 15; i++) {
      const row = Math.floor(i / 6);
      const col = i % 6;
      board = markQuestionUsed(board, board.cells[row]![col]!.questionId);
    }

    expect(isBoardComplete(board)).toBe(false);
  });

  test('returns true when all questions used', () => {
    let board = createGameBoard(mockCategories, mockQuestions, 'SINGLE_JEOPARDY');

    // Mark all questions as used
    for (const row of board.cells) {
      for (const cell of row) {
        board = markQuestionUsed(board, cell.questionId);
      }
    }

    expect(isBoardComplete(board)).toBe(true);
  });
});

describe('getBoardCell', () => {
  const mockCategories = ['Cat1', 'Cat2', 'Cat3', 'Cat4', 'Cat5', 'Cat6'];
  const mockQuestions = Array.from({ length: 30 }, (_, i) => ({
    id: `q${i}`,
    clue: `Question ${i}`,
    answer: `Answer ${i}`,
    difficulty: 'medium',
  }));

  test('returns cell for valid question ID', () => {
    const board = createGameBoard(mockCategories, mockQuestions, 'SINGLE_JEOPARDY');
    const questionId = board.cells[0]![0]!.questionId;

    const cell = getBoardCell(board, questionId);

    expect(cell).not.toBeNull();
    expect(cell!.questionId).toBe(questionId);
  });

  test('returns null for invalid question ID', () => {
    const board = createGameBoard(mockCategories, mockQuestions, 'SINGLE_JEOPARDY');

    const cell = getBoardCell(board, 'nonexistent-id');

    expect(cell).toBeNull();
  });

  test('returns correct cell position', () => {
    const board = createGameBoard(mockCategories, mockQuestions, 'SINGLE_JEOPARDY');
    const questionId = board.cells[2]![3]!.questionId;

    const cell = getBoardCell(board, questionId);

    expect(cell!.row).toBe(2);
    expect(cell!.col).toBe(3);
  });
});

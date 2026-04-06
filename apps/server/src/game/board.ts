import { db, RoundType } from '@jprty/db';
import {
  GAME_CONFIG,
  QuestionSetFilter,
  BoardCell,
  GameBoard,
  getRoundConfig,
} from './config';

type BoardSourceQuestion = {
  id: string;
  clue: string;
  answer: string;
  value?: number | null;
  difficulty?: string | null;
  difficultyScore?: number | null;
  tags?: Array<{ tag?: { name: string } | null }>;
  category?: string | null;
};

function normalizeCategoryKey(value: string | null | undefined) {
  return value
    ?.trim()
    .toUpperCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

function questionMatchesCategory(question: BoardSourceQuestion, categoryName: string) {
  const normalizedCategory = normalizeCategoryKey(categoryName);
  const tagNames = question.tags?.map((entry) => normalizeCategoryKey(entry.tag?.name)).filter(Boolean);

  return (
    normalizeCategoryKey(question.category) === normalizedCategory ||
    tagNames?.includes(normalizedCategory) === true
  );
}

function sortCategoryQuestions(a: BoardSourceQuestion, b: BoardSourceQuestion) {
  const valueDelta = (a.value ?? Number.MAX_SAFE_INTEGER) - (b.value ?? Number.MAX_SAFE_INTEGER);
  if (valueDelta !== 0) {
    return valueDelta;
  }

  const difficultyDelta = (a.difficultyScore ?? Number.MAX_SAFE_INTEGER) - (b.difficultyScore ?? Number.MAX_SAFE_INTEGER);
  if (difficultyDelta !== 0) {
    return difficultyDelta;
  }

  return a.id.localeCompare(b.id);
}

function buildCategoryMatrix(
  categories: string[],
  questions: BoardSourceQuestion[],
  numCategories: number,
  numRows: number,
) {
  const selectedCategories = categories.slice(0, numCategories);
  const categoryBuckets = selectedCategories.map((categoryName) =>
    questions
      .filter((question) => questionMatchesCategory(question, categoryName))
      .sort(sortCategoryQuestions),
  );
  const hasTaggedCoverage = categoryBuckets.some((bucket) => bucket.length > 0);

  if (!hasTaggedCoverage) {
    return selectedCategories.map((_, col) =>
      Array.from({ length: numRows }, (_, row) => questions[(row * numCategories) + col]),
    );
  }

  const usedQuestionIds = new Set<string>();
  const fallbackQuestions = questions.filter((question) => !usedQuestionIds.has(question.id));

  return categoryBuckets.map((bucket) => {
    const columnQuestions: Array<BoardSourceQuestion | undefined> = [];

    for (const question of bucket) {
      if (columnQuestions.length >= numRows) {
        break;
      }
      if (usedQuestionIds.has(question.id)) {
        continue;
      }

      usedQuestionIds.add(question.id);
      columnQuestions.push(question);
    }

    while (columnQuestions.length < numRows) {
      const fallback = fallbackQuestions.find((question) => !usedQuestionIds.has(question.id));
      if (!fallback) {
        break;
      }

      usedQuestionIds.add(fallback.id);
      columnQuestions.push(fallback);
    }

    return columnQuestions;
  });
}

export async function selectQuestionSet(filter?: QuestionSetFilter): Promise<any> {
  const where: any = {};

  if (filter?.airDateStart || filter?.airDateEnd) {
    where.airDate = {};
    if (filter.airDateStart) where.airDate.gte = filter.airDateStart;
    if (filter.airDateEnd) where.airDate.lte = filter.airDateEnd;
  }

  if (filter?.categories && filter.categories.length > 0) {
    where.categories = {
      some: {
        category: {
          name: { in: filter.categories }
        }
      }
    };
  }

  const questionSets = await db.questionSet.findMany({
    where,
    include: {
      categories: { include: { category: true } },
      questions: true,
    },
  });

  if (questionSets.length === 0) {
    throw new Error('No question sets found matching filter');
  }

  // Select random question set
  const randomIndex = Math.floor(Math.random() * questionSets.length);
  return questionSets[randomIndex];
}

export function generateDailyDoublePositions(
  numCategories: number,
  numRows: number,
  numDailyDoubles: number
): Set<string> {
  const positions = new Set<string>();

  // Daily Doubles are more likely to appear in higher-value rows (rows 3, 4, 5)
  // Weight: row 1: 1, row 2: 2, row 3: 3, row 4: 4, row 5: 5
  const weightedRows: number[] = [];
  for (let row = 0; row < numRows; row++) {
    const weight = row + 1;
    for (let i = 0; i < weight; i++) {
      weightedRows.push(row);
    }
  }

  while (positions.size < numDailyDoubles) {
    const col = Math.floor(Math.random() * numCategories);
    const row = weightedRows[Math.floor(Math.random() * weightedRows.length)]!;
    const key = `${col}-${row}`;

    // Ensure we don't place two Daily Doubles in the same category
    const categoryHasDD = Array.from(positions).some(pos => pos.startsWith(`${col}-`));
    if (!categoryHasDD) {
      positions.add(key);
    }
  }

  return positions;
}

export function createGameBoard(
  categories: string[],
  questions: BoardSourceQuestion[],
  roundType: RoundType
): GameBoard {
  const config = getRoundConfig(roundType);
  const numRows = GAME_CONFIG.questionsPerCategory;
  const numCategories = Math.min(categories.length, GAME_CONFIG.categoriesPerRound);
  const questionMatrix = buildCategoryMatrix(categories, questions, numCategories, numRows);

  // Generate Daily Double positions
  const dailyDoublePositions = generateDailyDoublePositions(
    numCategories,
    numRows,
    config.dailyDoubles
  );

  // Create board cells
  const cells: BoardCell[][] = [];

  for (let row = 0; row < numRows; row++) {
    const rowCells: BoardCell[] = [];

    for (let col = 0; col < numCategories; col++) {
      const question = questionMatrix[col]?.[row];

      const isDailyDouble = dailyDoublePositions.has(`${col}-${row}`);

      rowCells.push({
        questionId: question?.id || `placeholder-${row}-${col}`,
        value: config.values[row] || 200,
        isUsed: false,
        isDailyDouble,
        row,
        col,
      });
    }

    cells.push(rowCells);
  }

  return {
    categories: categories.slice(0, numCategories),
    cells,
    answeredCount: 0,
    totalQuestions: numRows * numCategories,
  };
}

export async function getBoardQuestions(questionSetId: string | null, roundType: RoundType = 'SINGLE_JEOPARDY'): Promise<{ questionSet: any; board: GameBoard }> {
  if (!questionSetId) {
    throw new Error('Question set ID is required');
  }

  const questionSet = await db.questionSet.findUnique({
    where: { id: questionSetId },
    include: {
      categories: {
        include: { category: true },
        orderBy: { order: 'asc' }
      },
      questions: {
        include: {
          tags: {
            include: {
              tag: true,
            },
          },
        },
        orderBy: [
          { value: 'asc' },
          { createdAt: 'asc' },
        ],
      },
    },
  });

  if (!questionSet) {
    throw new Error('Question set not found');
  }

  const categoryNames = questionSet.categories.map(qsc => qsc.category.name);

  const board = createGameBoard(
    categoryNames,
    questionSet.questions,
    roundType
  );

  return {
    questionSet,
    board,
  };
}

export function getQuestionValue(board: GameBoard, questionId: string): number {
  for (const row of board.cells) {
    for (const cell of row) {
      if (cell.questionId === questionId) {
        return cell.value;
      }
    }
  }
  return 0;
}

export function markQuestionUsed(board: GameBoard, questionId: string): GameBoard {
  const newCells = board.cells.map(row =>
    row.map(cell => {
      if (cell.questionId === questionId) {
        return { ...cell, isUsed: true };
      }
      return cell;
    })
  );

  return {
    ...board,
    cells: newCells,
    answeredCount: board.answeredCount + 1,
  };
}

export function isBoardComplete(board: GameBoard): boolean {
  return board.answeredCount >= board.totalQuestions;
}

export function isDailyDouble(board: GameBoard, questionId: string): boolean {
  for (const row of board.cells) {
    for (const cell of row) {
      if (cell.questionId === questionId) {
        return cell.isDailyDouble;
      }
    }
  }
  return false;
}

export function getBoardCell(board: GameBoard, questionId: string): BoardCell | null {
  // First, try to match by exact questionId (UUID)
  for (const row of board.cells) {
    for (const cell of row) {
      if (cell.questionId === questionId) {
        return cell;
      }
    }
  }

  // If not found, try to match by category_value format (e.g., "History_200")
  const parts = questionId.split('_');
  if (parts.length >= 2) {
    const categoryName = parts.slice(0, -1).join('_'); // Handle categories with underscores
    const value = parseInt(parts[parts.length - 1]!, 10);

    if (!isNaN(value)) {
      const categoryIndex = board.categories.findIndex(
        cat => cat.toLowerCase() === categoryName.toLowerCase()
      );

      if (categoryIndex >= 0) {
        for (const row of board.cells) {
          const cell = row[categoryIndex];
          if (cell && cell.value === value) {
            return cell;
          }
        }
      }
    }
  }

  return null;
}

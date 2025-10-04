import { db, RoundType } from '@jprty/db';
import { GAME_CONFIG, QuestionSetFilter, Difficulty } from './config';

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

export function calculatePoints(difficulty: Difficulty, roundType: RoundType): number {
  const baseValue = GAME_CONFIG.pointValues[difficulty];

  if (roundType === 'DOUBLE_JEOPARDY') {
    return baseValue * GAME_CONFIG.doubleMultiplier;
  }

  if (roundType === 'FINAL_JEOPARDY') {
    return GAME_CONFIG.finalValue;
  }

  return baseValue;
}

export async function getBoardQuestions(questionSetId: string) {
  const questionSet = await db.questionSet.findUnique({
    where: { id: questionSetId },
    include: {
      categories: {
        include: { category: true },
        orderBy: { order: 'asc' }
      },
      questions: true,
    },
  });

  if (!questionSet) {
    throw new Error('Question set not found');
  }

  // Group questions by category
  const board = questionSet.categories.map(qsc => ({
    category: qsc.category,
    questions: questionSet.questions.filter(q =>
      // We'll need to add categoryId to Question later if we want strict filtering
      // For now, just distribute questions evenly
      true
    ),
  }));

  return {
    questionSet,
    board,
  };
}

export async function initializeRound(
  gameSessionId: string,
  roundNumber: number,
  roundType: RoundType,
  filter?: QuestionSetFilter
): Promise<any> {
  const questionSet = await selectQuestionSet(filter);

  const round = await db.round.create({
    data: {
      gameSessionId,
      roundNumber,
      roundType,
      questionSetId: questionSet.id,
      events: [],
    },
    include: {
      questionSet: {
        include: {
          categories: { include: { category: true } },
          questions: true,
        },
      },
    },
  });

  return round;
}

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { db } from './index';

type SourceQuestion = {
  id: number;
  question: string;
  answer: string;
  value: number;
  airdate: string;
  category: {
    id: number;
    title: string;
  };
};

type SeedPack = {
  title: string;
  description: string;
  categoryOrder: string[];
};

const QUESTION_PACKS: SeedPack[] = [
  {
    title: 'J-Archive Showcase Pack 1',
    description: 'Curated real-sample clues spanning classic trivia categories.',
    categoryOrder: ['MUSIC', 'SCIENCE', 'GEOGRAPHY', 'AMERICAN HISTORY', 'LITERATURE', 'SPORTS'],
  },
  {
    title: 'J-Archive Showcase Pack 2',
    description: 'Curated real-sample clues focused on pop culture and modern knowledge.',
    categoryOrder: ['FOOD & DRINK', 'TECHNOLOGY', 'ART', 'TV SHOWS', 'MYTHOLOGY', 'HEALTH'],
  },
  {
    title: 'J-Archive Showcase Pack 3',
    description: 'Curated real-sample clues for space, language, games, and world trivia.',
    categoryOrder: ['SPACE', 'LANGUAGES', 'GAMES', 'US STATES', 'BIOLOGY', 'WORLD LANDMARKS'],
  },
];

function normalizeTag(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

function deriveDifficulty(value: number) {
  if (value <= 400) {
    return { difficulty: 'easy', difficultyScore: value === 200 ? 1 : 2 };
  }

  if (value === 600) {
    return { difficulty: 'medium', difficultyScore: 3 };
  }

  return {
    difficulty: 'hard',
    difficultyScore: value === 800 ? 4 : 5,
  };
}

async function loadSampleQuestions() {
  const filePath = resolve(import.meta.dir, '../import-cli/data/jeopardy.json');
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content) as SourceQuestion[];
}

async function ensureTag(name: string) {
  return db.tag.upsert({
    where: { name },
    update: {},
    create: { name },
  });
}

async function createShowcasePack(pack: SeedPack, questions: SourceQuestion[]) {
  const categories = pack.categoryOrder.map((categoryName) => {
    const categoryQuestions = questions
      .filter((question) => question.category.title === categoryName)
      .sort((a, b) => a.value - b.value);

    if (categoryQuestions.length < 5) {
      throw new Error(`Not enough questions to seed category ${categoryName}`);
    }

    return {
      name: categoryName,
      questions: categoryQuestions.slice(0, 5),
    };
  });

  await db.questionSet.deleteMany({
    where: {
      title: pack.title,
    },
  });

  const questionSet = await db.questionSet.create({
    data: {
      title: pack.title,
      description: pack.description,
      airDate: new Date(Math.max(...categories.flatMap((category) =>
        category.questions.map((question) => new Date(question.airdate).getTime()),
      ))),
      config: { source: 'jarchive-sample', questionsPerCategory: 5 },
    },
  });

  for (const [order, categorySeed] of categories.entries()) {
    const category = await db.category.upsert({
      where: { name: categorySeed.name },
      update: {
        description: `Real-sample Jeopardy clues for ${categorySeed.name}`,
      },
      create: {
        name: categorySeed.name,
        description: `Real-sample Jeopardy clues for ${categorySeed.name}`,
      },
    });

    await ensureTag(normalizeTag(categorySeed.name));

    await db.questionSetCategory.create({
      data: {
        questionSetId: questionSet.id,
        categoryId: category.id,
        order,
      },
    });

    for (const questionSeed of categorySeed.questions) {
      const tag = await ensureTag(normalizeTag(categorySeed.name));
      const { difficulty, difficultyScore } = deriveDifficulty(questionSeed.value);

      await db.question.create({
        data: {
          clue: questionSeed.question,
          answer: questionSeed.answer,
          difficulty,
          difficultyScore,
          airDate: new Date(questionSeed.airdate),
          value: questionSeed.value,
          clueHash: `seed:${questionSeed.id}`,
          source: 'jarchive-sample',
          externalId: `${pack.title}:${questionSeed.id}`,
          questionSetId: questionSet.id,
          tags: {
            create: [{ tagId: tag.id }],
          },
        },
      });
    }
  }

  return questionSet;
}

async function seed() {
  console.log('Seeding database...');
  const sampleQuestions = await loadSampleQuestions();
  await db.questionSet.deleteMany({
    where: {
      title: 'General Knowledge Pack 1',
    },
  });

  for (const pack of QUESTION_PACKS) {
    const questionSet = await createShowcasePack(pack, sampleQuestions);
    console.log(`Created question set: ${questionSet.title}`);
  }

  console.log(`Created ${QUESTION_PACKS.length} real-data question sets`);
  console.log('Seed complete!');
}

seed()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

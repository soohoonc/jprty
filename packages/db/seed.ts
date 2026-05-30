import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { db } from './index';

type SeedPackDefinition = {
  title: string;
  description: string;
  categories: Array<{
    slug: string;
    name: string;
    questions: Array<{
      clue: string;
      answer: string;
      choices: string[];
    }>;
  }>;
};

type OpenTriviaSeedData = {
  source: {
    name: string;
    url: string;
    license: string;
    licenseUrl: string;
    generatedAt: string;
  };
  packs: SeedPackDefinition[];
};

const CLUE_VALUES = [200, 400, 600, 800, 1000] as const;

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

async function loadOpenTriviaSeedData() {
  const filePath = resolve(import.meta.dir, './data/open-trivia-showcase.json');
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content) as OpenTriviaSeedData;
}

async function ensureTag(name: string) {
  return db.tag.upsert({
    where: { name },
    update: {},
    create: { name },
  });
}

async function createShowcasePack(pack: SeedPackDefinition, metadata: OpenTriviaSeedData['source']) {
  await db.questionSet.deleteMany({
    where: {
      title: pack.title,
    },
  });

  const questionSet = await db.questionSet.create({
    data: {
      title: pack.title,
      description: pack.description,
      airDate: new Date(metadata.generatedAt),
      config: {
        source: metadata.name,
        sourceUrl: metadata.url,
        sourceLicense: metadata.license,
        sourceLicenseUrl: metadata.licenseUrl,
        questionsPerCategory: 5,
      },
    },
  });

  for (const [order, categorySeed] of pack.categories.entries()) {
    if (categorySeed.questions.length < 5) {
      throw new Error(`Not enough questions to seed category ${categorySeed.name}`);
    }

    const category = await db.category.upsert({
      where: { name: categorySeed.name },
      update: {
        description: `OpenTriviaQA seeded clues for ${categorySeed.name}`,
      },
      create: {
        name: categorySeed.name,
        description: `OpenTriviaQA seeded clues for ${categorySeed.name}`,
      },
    });

    const categoryTag = await ensureTag(normalizeTag(categorySeed.name));
    const slugTag = await ensureTag(normalizeTag(categorySeed.slug));
    const tagIds = Array.from(new Set([categoryTag.id, slugTag.id]));

    await db.questionSetCategory.create({
      data: {
        questionSetId: questionSet.id,
        categoryId: category.id,
        order,
      },
    });

    for (const [index, questionSeed] of categorySeed.questions.slice(0, 5).entries()) {
      const value = CLUE_VALUES[index]!;
      const { difficulty, difficultyScore } = deriveDifficulty(value);

      await db.question.create({
        data: {
          clue: questionSeed.clue,
          answer: questionSeed.answer,
          difficulty,
          difficultyScore,
          airDate: new Date(metadata.generatedAt),
          value,
          clueHash: `seed:${categorySeed.slug}:${index}:${normalizeTag(questionSeed.clue)}`,
          source: 'open-trivia-qa',
          externalId: `${pack.title}:${categorySeed.slug}:${index}`,
          questionSetId: questionSet.id,
          tags: {
            create: tagIds.map((tagId) => ({ tagId })),
          },
        },
      });
    }
  }

  return questionSet;
}

async function seed() {
  console.log('Seeding database...');
  const openTriviaData = await loadOpenTriviaSeedData();

  await db.questionSet.deleteMany({
    where: {
      title: 'General Knowledge Pack 1',
    },
  });

  for (const pack of openTriviaData.packs) {
    const questionSet = await createShowcasePack(pack, openTriviaData.source);
    console.log(`Created question set: ${questionSet.title}`);
  }

  console.log(
    `Created ${openTriviaData.packs.length} OpenTriviaQA question sets (${openTriviaData.source.license})`,
  );
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

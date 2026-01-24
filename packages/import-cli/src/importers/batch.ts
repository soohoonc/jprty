/**
 * Batch importer with progress tracking for importing questions into the database.
 */

import { db } from "@jprty/db";
import type { ParsedQuestion } from "../parsers/types.js";
import { deriveDifficulty } from "../transformers/difficulty.js";
import { extractTags, getAllTags } from "../transformers/tags.js";
import { generateClueHash } from "../transformers/hash.js";

export interface ImportStats {
  total: number;
  imported: number;
  skipped: number;
  duplicates: number;
  errors: number;
}

export interface ImportOptions {
  /** Batch size for database operations */
  batchSize?: number;
  /** Dry run - don't actually insert */
  dryRun?: boolean;
  /** Progress callback */
  onProgress?: (stats: ImportStats) => void;
  /** Error callback */
  onError?: (error: Error, question: ParsedQuestion) => void;
}

interface QuestionData {
  clue: string;
  answer: string;
  difficulty: string;
  difficultyScore: number;
  airDate: Date | null;
  showNumber: number | null;
  roundType: string | null;
  value: number | null;
  clueHash: string;
  source: string;
  externalId: string | null;
  tags: string[];
}

/**
 * Prepare question data for insertion.
 */
function prepareQuestion(parsed: ParsedQuestion): QuestionData {
  const { difficulty, difficultyScore } = deriveDifficulty(
    parsed.value,
    parsed.roundType
  );
  const tagResult = extractTags(parsed.category);
  const tags = getAllTags(tagResult);
  const clueHash = generateClueHash(parsed.clue, parsed.answer);

  return {
    clue: parsed.clue,
    answer: parsed.answer,
    difficulty,
    difficultyScore,
    airDate: parsed.airDate ?? null,
    showNumber: parsed.showNumber ?? null,
    roundType: parsed.roundType ?? null,
    value: parsed.value ?? null,
    clueHash,
    source: "jarchive",
    externalId: parsed.externalId ?? null,
    tags,
  };
}

/**
 * Get or create tags in the database.
 */
async function ensureTags(
  tagNames: string[],
  tagCache: Map<string, string>
): Promise<Map<string, string>> {
  const newTags = tagNames.filter((name) => !tagCache.has(name));

  if (newTags.length > 0) {
    // Upsert tags
    await db.$transaction(
      newTags.map((name) =>
        db.tag.upsert({
          where: { name },
          create: { name },
          update: {},
        })
      )
    );

    // Fetch the created/existing tags
    const tags = await db.tag.findMany({
      where: { name: { in: newTags } },
      select: { id: true, name: true },
    });

    for (const tag of tags) {
      tagCache.set(tag.name, tag.id);
    }
  }

  return tagCache;
}

/**
 * Import a batch of questions into the database.
 */
async function importBatch(
  questions: QuestionData[],
  tagCache: Map<string, string>,
  dryRun: boolean
): Promise<{ imported: number; duplicates: number }> {
  if (dryRun) {
    return { imported: questions.length, duplicates: 0 };
  }

  let imported = 0;
  let duplicates = 0;

  // Collect all unique tags from the batch
  const allTags = new Set<string>();
  for (const q of questions) {
    for (const tag of q.tags) {
      allTags.add(tag);
    }
  }

  // Ensure all tags exist
  await ensureTags([...allTags], tagCache);

  // Insert questions one by one to handle duplicates gracefully
  for (const q of questions) {
    try {
      // Check for existing hash
      const existing = await db.question.findUnique({
        where: { clueHash: q.clueHash },
      });

      if (existing) {
        duplicates++;
        continue;
      }

      // Get tag IDs
      const tagIds = q.tags
        .map((name) => tagCache.get(name))
        .filter((id): id is string => !!id);

      // Create question with tags
      await db.question.create({
        data: {
          clue: q.clue,
          answer: q.answer,
          difficulty: q.difficulty,
          difficultyScore: q.difficultyScore,
          airDate: q.airDate,
          showNumber: q.showNumber,
          roundType: q.roundType,
          value: q.value,
          clueHash: q.clueHash,
          source: q.source,
          externalId: q.externalId,
          tags: {
            create: tagIds.map((tagId) => ({
              tagId,
            })),
          },
        },
      });

      imported++;
    } catch (error) {
      // Handle unique constraint violation (duplicate)
      if (
        error instanceof Error &&
        error.message.includes("Unique constraint")
      ) {
        duplicates++;
      } else {
        throw error;
      }
    }
  }

  return { imported, duplicates };
}

/**
 * Import questions from an async generator into the database.
 */
export async function batchImport(
  questions: AsyncGenerator<ParsedQuestion>,
  options: ImportOptions = {}
): Promise<ImportStats> {
  const { batchSize = 100, dryRun = false, onProgress, onError } = options;

  const stats: ImportStats = {
    total: 0,
    imported: 0,
    skipped: 0,
    duplicates: 0,
    errors: 0,
  };

  const tagCache = new Map<string, string>();
  let batch: QuestionData[] = [];

  for await (const parsed of questions) {
    stats.total++;

    try {
      const prepared = prepareQuestion(parsed);
      batch.push(prepared);

      if (batch.length >= batchSize) {
        const result = await importBatch(batch, tagCache, dryRun);
        stats.imported += result.imported;
        stats.duplicates += result.duplicates;
        batch = [];

        if (onProgress) {
          onProgress(stats);
        }
      }
    } catch (error) {
      stats.errors++;
      if (onError && error instanceof Error) {
        onError(error, parsed);
      }
    }
  }

  // Import remaining batch
  if (batch.length > 0) {
    try {
      const result = await importBatch(batch, tagCache, dryRun);
      stats.imported += result.imported;
      stats.duplicates += result.duplicates;
    } catch (error) {
      stats.errors += batch.length;
      if (onError && error instanceof Error) {
        onError(error, batch[0] as unknown as ParsedQuestion);
      }
    }
  }

  if (onProgress) {
    onProgress(stats);
  }

  return stats;
}

export default batchImport;

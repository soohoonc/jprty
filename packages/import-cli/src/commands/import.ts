/**
 * Import command for importing J-Archive questions.
 */

import { resolve } from "path";
import { existsSync } from "fs";
import { getParser } from "../parsers/index.js";
import { batchImport, type ImportStats } from "../importers/batch.js";

export interface ImportCommandOptions {
  file: string;
  limit?: number;
  dateStart?: string;
  dateEnd?: string;
  dryRun?: boolean;
  batchSize?: number;
}

function parseDate(dateStr: string | undefined): Date | undefined {
  if (!dateStr) return undefined;
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Invalid date format: ${dateStr}. Use YYYY-MM-DD.`);
  }
  return parsed;
}

function formatStats(stats: ImportStats): string {
  const lines = [
    `Total processed: ${stats.total}`,
    `Imported: ${stats.imported}`,
    `Duplicates: ${stats.duplicates}`,
    `Skipped: ${stats.skipped}`,
    `Errors: ${stats.errors}`,
  ];
  return lines.join("\n");
}

function printProgress(stats: ImportStats): void {
  const percent =
    stats.total > 0
      ? Math.round(((stats.imported + stats.duplicates) / stats.total) * 100)
      : 0;
  process.stdout.write(
    `\rProcessed: ${stats.total} | Imported: ${stats.imported} | Duplicates: ${stats.duplicates} | ${percent}%`
  );
}

export async function importCommand(
  options: ImportCommandOptions
): Promise<void> {
  const filePath = resolve(options.file);

  // Validate file exists
  if (!existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  // Get appropriate parser
  const parser = getParser(filePath);
  if (!parser) {
    console.error(
      `Error: Unsupported file format. Supported: .json (JService), .csv (Kaggle)`
    );
    process.exit(1);
  }

  // Parse dates
  const dateStart = parseDate(options.dateStart);
  const dateEnd = parseDate(options.dateEnd);

  console.log(`Importing from: ${filePath}`);
  console.log(`Parser: ${filePath.endsWith(".json") ? "JService JSON" : "Kaggle CSV"}`);
  if (options.limit) console.log(`Limit: ${options.limit}`);
  if (dateStart) console.log(`Date start: ${dateStart.toISOString().split("T")[0]}`);
  if (dateEnd) console.log(`Date end: ${dateEnd.toISOString().split("T")[0]}`);
  if (options.dryRun) console.log("** DRY RUN - No data will be inserted **");
  console.log("");

  const startTime = Date.now();

  try {
    const questions = parser.parse(filePath, {
      limit: options.limit,
      dateStart,
      dateEnd,
    });

    const stats = await batchImport(questions, {
      batchSize: options.batchSize ?? 100,
      dryRun: options.dryRun ?? false,
      onProgress: printProgress,
      onError: (error, question) => {
        console.error(`\nError importing question: ${error.message}`);
        console.error(`  Clue: ${question.clue.substring(0, 50)}...`);
      },
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log("\n\n--- Import Complete ---");
    console.log(formatStats(stats));
    console.log(`Duration: ${duration}s`);
  } catch (error) {
    console.error("\nImport failed:", error);
    process.exit(1);
  }
}

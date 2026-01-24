#!/usr/bin/env bun
/**
 * J-Archive Questions Import CLI
 *
 * Usage:
 *   bun run import -f data/jeopardy.json --limit 1000
 *   bun run import -f data/jeopardy.csv --date-start 2010-01-01
 *   bun run import -f data/jeopardy.json --dry-run
 */

import { program } from "commander";
import { importCommand } from "./commands/import.js";

program
  .name("jprty-import")
  .description("Import J-Archive questions into the database")
  .version("0.0.1");

program
  .command("import")
  .description("Import questions from a data file")
  .requiredOption("-f, --file <path>", "Path to the data file (JSON or CSV)")
  .option("-l, --limit <number>", "Limit number of questions to import", parseInt)
  .option("--date-start <date>", "Filter questions after this date (YYYY-MM-DD)")
  .option("--date-end <date>", "Filter questions before this date (YYYY-MM-DD)")
  .option("--dry-run", "Validate without inserting data", false)
  .option("--batch-size <number>", "Batch size for database operations", parseInt)
  .action(async (options) => {
    await importCommand({
      file: options.file,
      limit: options.limit,
      dateStart: options.dateStart,
      dateEnd: options.dateEnd,
      dryRun: options.dryRun,
      batchSize: options.batchSize,
    });
  });

// Default to import if called with just a file
program
  .argument("[file]", "Path to the data file (shorthand for import -f)")
  .action(async (file) => {
    if (file) {
      await importCommand({ file });
    } else {
      program.help();
    }
  });

program.parse();

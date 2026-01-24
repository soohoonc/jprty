/**
 * Parser for Kaggle CSV format.
 *
 * Kaggle CSV columns:
 * show_number, air_date, round, category, value, question, answer
 *
 * Example row:
 * 4680,2004-12-31,Jeopardy!,"HISTORY","$200","This city hosted the 2004 Summer Olympics","Athens"
 */

import { createReadStream } from "fs";
import { parse } from "csv-parse";
import type { ParsedQuestion, Parser, ParserOptions } from "./types.js";
import { parseValue } from "../transformers/difficulty.js";

interface KaggleRow {
  show_number: string;
  air_date: string;
  round: string;
  category: string;
  value: string;
  question: string;
  answer: string;
}

function parseAirDate(airDateStr: string | undefined): Date | undefined {
  if (!airDateStr) return undefined;

  // Kaggle format: "2004-12-31"
  const parsed = new Date(airDateStr);
  return isNaN(parsed.getTime()) ? undefined : parsed;
}

function isWithinDateRange(
  date: Date | undefined,
  dateStart?: Date,
  dateEnd?: Date
): boolean {
  if (!date) return true;
  if (dateStart && date < dateStart) return false;
  if (dateEnd && date > dateEnd) return false;
  return true;
}

export const kaggleParser: Parser = {
  canHandle(filePath: string): boolean {
    return filePath.endsWith(".csv");
  },

  async *parse(
    filePath: string,
    options?: ParserOptions
  ): AsyncGenerator<ParsedQuestion> {
    const limit = options?.limit ?? Infinity;
    let count = 0;

    const parser = createReadStream(filePath).pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_quotes: true,
        relax_column_count: true,
      })
    );

    for await (const row of parser as AsyncIterable<KaggleRow>) {
      if (count >= limit) break;

      // Skip rows with empty question or answer
      if (!row.question?.trim() || !row.answer?.trim()) {
        continue;
      }

      const airDate = parseAirDate(row.air_date);

      // Apply date filter
      if (!isWithinDateRange(airDate, options?.dateStart, options?.dateEnd)) {
        continue;
      }

      const showNumber = parseInt(row.show_number, 10);
      const value = parseValue(row.value);

      yield {
        externalId: `${row.show_number}-${count}`, // Create synthetic ID
        clue: row.question.trim(),
        answer: row.answer.trim(),
        category: row.category,
        value: value ?? undefined,
        airDate,
        showNumber: isNaN(showNumber) ? undefined : showNumber,
        roundType: row.round,
      };

      count++;
    }
  },
};

export default kaggleParser;

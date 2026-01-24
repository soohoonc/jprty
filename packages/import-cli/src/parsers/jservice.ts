/**
 * Parser for JService JSON format.
 *
 * JService format:
 * [
 *   {
 *     "id": 1,
 *     "answer": "The answer",
 *     "question": "The clue/question",
 *     "value": 200,
 *     "airdate": "2004-12-31T12:00:00.000Z",
 *     "category": {
 *       "id": 1,
 *       "title": "CATEGORY NAME"
 *     }
 *   },
 *   ...
 * ]
 */

import { readFile } from "fs/promises";
import type { ParsedQuestion, Parser, ParserOptions } from "./types.js";

interface JServiceCategory {
  id: number;
  title: string;
  created_at?: string;
  updated_at?: string;
  clues_count?: number;
}

interface JServiceQuestion {
  id: number;
  answer: string;
  question: string;
  value: number | null;
  airdate: string;
  created_at?: string;
  updated_at?: string;
  category_id?: number;
  game_id?: number;
  category?: JServiceCategory;
  invalid_count?: number;
  round?: string;
  show_number?: number;
}

function parseAirDate(airdate: string | undefined): Date | undefined {
  if (!airdate) return undefined;

  const parsed = new Date(airdate);
  return isNaN(parsed.getTime()) ? undefined : parsed;
}

function isWithinDateRange(
  date: Date | undefined,
  dateStart?: Date,
  dateEnd?: Date
): boolean {
  if (!date) return true; // If no date, include by default
  if (dateStart && date < dateStart) return false;
  if (dateEnd && date > dateEnd) return false;
  return true;
}

export const jserviceParser: Parser = {
  canHandle(filePath: string): boolean {
    return filePath.endsWith(".json");
  },

  async *parse(
    filePath: string,
    options?: ParserOptions
  ): AsyncGenerator<ParsedQuestion> {
    const content = await readFile(filePath, "utf-8");
    const data: JServiceQuestion[] = JSON.parse(content);

    let count = 0;
    const limit = options?.limit ?? Infinity;

    for (const item of data) {
      if (count >= limit) break;

      // Skip questions with empty clue or answer
      if (!item.question?.trim() || !item.answer?.trim()) {
        continue;
      }

      const airDate = parseAirDate(item.airdate);

      // Apply date filter
      if (!isWithinDateRange(airDate, options?.dateStart, options?.dateEnd)) {
        continue;
      }

      yield {
        externalId: String(item.id),
        clue: item.question.trim(),
        answer: item.answer.trim(),
        category: item.category?.title,
        value: item.value ?? undefined,
        airDate,
        showNumber: item.show_number,
        roundType: item.round,
      };

      count++;
    }
  },
};

export default jserviceParser;

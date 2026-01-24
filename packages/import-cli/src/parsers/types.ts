/**
 * Common types for parsed question data.
 */

export interface ParsedQuestion {
  /** External ID from source (if available) */
  externalId?: string;
  /** The question/clue text */
  clue: string;
  /** The answer text */
  answer: string;
  /** Category name from source */
  category?: string;
  /** Original dollar value */
  value?: number;
  /** Air date of the show */
  airDate?: Date;
  /** Show number from J-Archive */
  showNumber?: number;
  /** Round type (Jeopardy!, Double Jeopardy!, Final Jeopardy!) */
  roundType?: string;
}

export interface ParserOptions {
  /** Limit number of records to parse */
  limit?: number;
  /** Start date filter */
  dateStart?: Date;
  /** End date filter */
  dateEnd?: Date;
}

export interface Parser {
  /** Parse file and return async generator of questions */
  parse(filePath: string, options?: ParserOptions): AsyncGenerator<ParsedQuestion>;
  /** Check if parser can handle this file */
  canHandle(filePath: string): boolean;
}

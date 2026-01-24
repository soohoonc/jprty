export * from "./types.js";
export { jserviceParser } from "./jservice.js";
export { kaggleParser } from "./kaggle.js";

import { jserviceParser } from "./jservice.js";
import { kaggleParser } from "./kaggle.js";
import type { Parser } from "./types.js";

const parsers: Parser[] = [jserviceParser, kaggleParser];

/**
 * Get the appropriate parser for a file based on extension.
 */
export function getParser(filePath: string): Parser | undefined {
  return parsers.find((p) => p.canHandle(filePath));
}

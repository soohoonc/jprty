/**
 * Clue deduplication using SHA-256 hash.
 *
 * Generates a unique hash from normalized clue + answer for deduplication.
 */

import { createHash } from "crypto";

/**
 * Normalize text for consistent hashing.
 * - Lowercase
 * - Remove extra whitespace
 * - Remove punctuation (except for meaning-critical ones)
 * - Trim
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/['"]/g, "") // Remove quotes
    .replace(/[.,!?;:]+/g, "") // Remove common punctuation
    .trim();
}

/**
 * Generate a SHA-256 hash from clue and answer for deduplication.
 * @param clue - The question/clue text
 * @param answer - The answer text
 * @returns SHA-256 hash string (hex)
 */
export function generateClueHash(clue: string, answer: string): string {
  const normalizedClue = normalizeText(clue);
  const normalizedAnswer = normalizeText(answer);

  // Combine with a separator that won't appear in normalized text
  const combined = `${normalizedClue}|||${normalizedAnswer}`;

  return createHash("sha256").update(combined).digest("hex");
}

/**
 * Check if two clue/answer pairs are duplicates.
 */
export function isDuplicate(
  clue1: string,
  answer1: string,
  clue2: string,
  answer2: string
): boolean {
  return generateClueHash(clue1, answer1) === generateClueHash(clue2, answer2);
}

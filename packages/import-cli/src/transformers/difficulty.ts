/**
 * Difficulty transformation from J-Archive value to difficulty score and enum.
 *
 * Value mapping (based on row position / dollar value):
 * | Value (Jeopardy!) | Value (Double) | Score | Enum   |
 * |-------------------|----------------|-------|--------|
 * | $200              | $400           | 1     | easy   |
 * | $400              | $800           | 2     | easy   |
 * | $600              | $1200          | 3     | medium |
 * | $800              | $1600          | 4     | hard   |
 * | $1000             | $2000          | 5     | hard   |
 * | Final Jeopardy    | -              | 5     | hard   |
 */

export type DifficultyEnum = "easy" | "medium" | "hard";

export interface DifficultyResult {
  difficulty: DifficultyEnum;
  difficultyScore: number;
}

// Standard Jeopardy! round values
const JEOPARDY_VALUES: Record<number, number> = {
  200: 1,
  400: 2,
  600: 3,
  800: 4,
  1000: 5,
};

// Double Jeopardy! round values (doubled)
const DOUBLE_JEOPARDY_VALUES: Record<number, number> = {
  400: 1,
  800: 2,
  1200: 3,
  1600: 4,
  2000: 5,
};

function scoreToEnum(score: number): DifficultyEnum {
  if (score <= 2) return "easy";
  if (score === 3) return "medium";
  return "hard";
}

/**
 * Derive difficulty from the original dollar value.
 * @param value - The original dollar value (e.g., 200, 400, 600, 800, 1000)
 * @param roundType - Optional round type ("Jeopardy!", "Double Jeopardy!", "Final Jeopardy!")
 * @returns DifficultyResult with both enum and numeric score
 */
export function deriveDifficulty(
  value: number | null | undefined,
  roundType?: string | null
): DifficultyResult {
  // Final Jeopardy is always hardest
  if (roundType?.toLowerCase().includes("final")) {
    return { difficulty: "hard", difficultyScore: 5 };
  }

  if (!value) {
    // Default to medium if no value
    return { difficulty: "medium", difficultyScore: 3 };
  }

  // Check if it's a Double Jeopardy value
  const isDoubleJeopardy = roundType?.toLowerCase().includes("double");

  let score: number | undefined;

  if (isDoubleJeopardy) {
    score = DOUBLE_JEOPARDY_VALUES[value];
  } else {
    // Try Jeopardy first, then Double Jeopardy (for when roundType is unknown)
    score = JEOPARDY_VALUES[value] ?? DOUBLE_JEOPARDY_VALUES[value];
  }

  if (!score) {
    // For non-standard values (Daily Doubles with varied amounts), estimate based on range
    if (value <= 400) score = 1;
    else if (value <= 800) score = 2;
    else if (value <= 1200) score = 3;
    else if (value <= 1600) score = 4;
    else score = 5;
  }

  return {
    difficulty: scoreToEnum(score),
    difficultyScore: score,
  };
}

/**
 * Parse value string (e.g., "$1,000" or "1000") to number
 */
export function parseValue(valueStr: string | null | undefined): number | null {
  if (!valueStr) return null;

  // Remove $ sign, commas, and whitespace
  const cleaned = valueStr.replace(/[$,\s]/g, "");
  const parsed = parseInt(cleaned, 10);

  return isNaN(parsed) ? null : parsed;
}

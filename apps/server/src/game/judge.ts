/**
 * Answer Judging System for JPRTY
 *
 * Validates player answers against expected answers using:
 * - Normalization (case, punctuation, whitespace)
 * - Jeopardy format stripping ("What is X" -> "X")
 * - Fuzzy matching with Levenshtein distance
 * - Acceptable variations (articles, common alternatives)
 */

export interface JudgeResult {
  correct: boolean;
  confidence: number;
  normalizedExpected: string;
  normalizedGiven: string;
  reason?: string;
}

// Similarity threshold for fuzzy matching (0.0 - 1.0)
const SIMILARITY_THRESHOLD = 0.85;

/**
 * Main judge function - determines if a player's answer is correct
 */
export function judge(expectedAnswer: string, playerAnswer: string): boolean {
  const result = judgeWithDetails(expectedAnswer, playerAnswer);
  return result.correct;
}

/**
 * Detailed judge function - returns full analysis
 */
export function judgeWithDetails(expectedAnswer: string, playerAnswer: string): JudgeResult {
  // Handle invalid inputs
  if (!playerAnswer || typeof playerAnswer !== 'string') {
    return {
      correct: false,
      confidence: 0,
      normalizedExpected: normalizeAnswer(expectedAnswer || ''),
      normalizedGiven: '',
      reason: 'Empty or invalid answer',
    };
  }

  if (!expectedAnswer || typeof expectedAnswer !== 'string') {
    return {
      correct: false,
      confidence: 0,
      normalizedExpected: '',
      normalizedGiven: normalizeAnswer(playerAnswer),
      reason: 'No expected answer provided',
    };
  }

  // Normalize both answers
  const expected = normalizeAnswer(expectedAnswer);
  const given = normalizeAnswer(playerAnswer);

  // Strip Jeopardy format from player answer
  const strippedGiven = stripJeopardyFormat(given);

  // Also try stripping from expected (in case it's stored with format)
  const strippedExpected = stripJeopardyFormat(expected);

  // 1. Exact match after normalization
  if (expected === strippedGiven || strippedExpected === strippedGiven) {
    return {
      correct: true,
      confidence: 1.0,
      normalizedExpected: expected,
      normalizedGiven: strippedGiven,
      reason: 'Exact match',
    };
  }

  // 2. Check without articles
  const expectedNoArticles = stripArticles(strippedExpected);
  const givenNoArticles = stripArticles(strippedGiven);

  if (expectedNoArticles === givenNoArticles) {
    return {
      correct: true,
      confidence: 0.98,
      normalizedExpected: expected,
      normalizedGiven: strippedGiven,
      reason: 'Match without articles',
    };
  }

  // 3. Fuzzy match using Levenshtein distance
  const similarity = calculateSimilarity(strippedExpected, strippedGiven);

  if (similarity >= SIMILARITY_THRESHOLD) {
    return {
      correct: true,
      confidence: similarity,
      normalizedExpected: expected,
      normalizedGiven: strippedGiven,
      reason: `Fuzzy match (${Math.round(similarity * 100)}% similar)`,
    };
  }

  // 4. Check if answer contains the expected (for partial matches)
  if (strippedGiven.includes(strippedExpected) || strippedExpected.includes(strippedGiven)) {
    const containsSimilarity = Math.min(strippedExpected.length, strippedGiven.length) /
      Math.max(strippedExpected.length, strippedGiven.length);

    if (containsSimilarity >= 0.7) {
      return {
        correct: true,
        confidence: containsSimilarity * 0.9,
        normalizedExpected: expected,
        normalizedGiven: strippedGiven,
        reason: 'Partial containment match',
      };
    }
  }

  // 5. Check acceptable variations (numbers, common misspellings)
  if (isAcceptableVariation(strippedExpected, strippedGiven)) {
    return {
      correct: true,
      confidence: 0.9,
      normalizedExpected: expected,
      normalizedGiven: strippedGiven,
      reason: 'Acceptable variation',
    };
  }

  // Not a match
  return {
    correct: false,
    confidence: similarity,
    normalizedExpected: expected,
    normalizedGiven: strippedGiven,
    reason: `No match (${Math.round(similarity * 100)}% similar)`,
  };
}

/**
 * Normalize an answer for comparison
 */
function normalizeAnswer(answer: string): string {
  return answer
    .toLowerCase()
    .trim()
    // Remove parenthetical content (often contains alternate answers)
    .replace(/\([^)]*\)/g, '')
    // Remove quotes
    .replace(/["'`]/g, '')
    // Remove punctuation except hyphens and apostrophes within words
    .replace(/[^\w\s'-]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strip Jeopardy answer format prefixes
 * "What is the Eiffel Tower" -> "eiffel tower"
 * "Who is Abraham Lincoln" -> "abraham lincoln"
 */
function stripJeopardyFormat(answer: string): string {
  // Common Jeopardy prefixes
  const prefixes = [
    /^what\s+(is|are|was|were)\s+(a|an|the\s+)?/i,
    /^who\s+(is|are|was|were)\s+(a|an|the\s+)?/i,
    /^where\s+(is|are|was|were)\s+(a|an|the\s+)?/i,
    /^when\s+(is|are|was|were)\s+(a|an|the\s+)?/i,
    /^why\s+(is|are|was|were)\s+(a|an|the\s+)?/i,
    /^how\s+(is|are|was|were)\s+(a|an|the\s+)?/i,
  ];

  let stripped = answer;
  for (const prefix of prefixes) {
    stripped = stripped.replace(prefix, '');
  }

  return stripped.trim();
}

/**
 * Remove leading articles
 */
function stripArticles(answer: string): string {
  return answer
    .replace(/^(the|a|an)\s+/i, '')
    .trim();
}

/**
 * Calculate similarity between two strings using Levenshtein distance
 */
function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const distance = levenshteinDistance(a, b);
  const maxLength = Math.max(a.length, b.length);

  return 1 - distance / maxLength;
}

/**
 * Levenshtein distance implementation
 */
function levenshteinDistance(a: string, b: string): number {
  // Create matrix with proper initialization
  const matrix: number[][] = Array.from({ length: b.length + 1 }, () =>
    Array.from({ length: a.length + 1 }, () => 0)
  );

  // Initialize first column
  for (let i = 0; i <= b.length; i++) {
    matrix[i]![0] = i;
  }

  // Initialize first row
  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1, // substitution
          matrix[i]![j - 1]! + 1,     // insertion
          matrix[i - 1]![j]! + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length]![a.length]!;
}

/**
 * Check for acceptable variations between expected and given answers
 */
function isAcceptableVariation(expected: string, given: string): boolean {
  // Number variations (e.g., "3" vs "three")
  const numberWords: Record<string, string> = {
    '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four',
    '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine',
    '10': 'ten', '11': 'eleven', '12': 'twelve', '13': 'thirteen',
    '14': 'fourteen', '15': 'fifteen', '16': 'sixteen', '17': 'seventeen',
    '18': 'eighteen', '19': 'nineteen', '20': 'twenty',
  };

  // Convert numbers to words in both strings and compare
  let expectedWithWords = expected;
  let givenWithWords = given;

  for (const [num, word] of Object.entries(numberWords)) {
    const regex = new RegExp(`\\b${num}\\b`, 'g');
    expectedWithWords = expectedWithWords.replace(regex, word);
    givenWithWords = givenWithWords.replace(regex, word);
  }

  if (expectedWithWords === givenWithWords) {
    return true;
  }

  // Convert words to numbers and compare
  let expectedWithNums = expected;
  let givenWithNums = given;

  for (const [num, word] of Object.entries(numberWords)) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    expectedWithNums = expectedWithNums.replace(regex, num);
    givenWithNums = givenWithNums.replace(regex, num);
  }

  if (expectedWithNums === givenWithNums) {
    return true;
  }

  // Common acceptable variations
  const variations: [RegExp, string][] = [
    [/\busa\b/gi, 'united states'],
    [/\bunited states of america\b/gi, 'united states'],
    [/\bu\.s\.a?\b/gi, 'united states'],
    [/\buk\b/gi, 'united kingdom'],
    [/\bgreat britain\b/gi, 'united kingdom'],
    [/\bnyc\b/gi, 'new york city'],
    [/\bla\b/gi, 'los angeles'],
    [/\bdc\b/gi, 'washington dc'],
    [/\bdr\b/gi, 'doctor'],
    [/\bmr\b/gi, 'mister'],
    [/\bmrs\b/gi, 'missus'],
    [/\bmt\b/gi, 'mount'],
    [/\bst\b/gi, 'saint'],
  ];

  let normalizedExpected = expected;
  let normalizedGiven = given;

  for (const [pattern, replacement] of variations) {
    normalizedExpected = normalizedExpected.replace(pattern, replacement);
    normalizedGiven = normalizedGiven.replace(pattern, replacement);
  }

  if (normalizedExpected === normalizedGiven) {
    return true;
  }

  // Check plural/singular variations
  if (
    expected + 's' === given ||
    expected === given + 's' ||
    expected + 'es' === given ||
    expected === given + 'es'
  ) {
    return true;
  }

  return false;
}

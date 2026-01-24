/**
 * Tag extraction from J-Archive categories.
 *
 * Primary tag: The category name itself
 * Subject tags: Auto-detected from patterns (HISTORY, SCIENCE, GEOGRAPHY, etc.)
 */

// Common subject patterns for auto-tagging
const SUBJECT_PATTERNS: Record<string, RegExp[]> = {
  HISTORY: [
    /\bhistor/i,
    /\bwar\b/i,
    /\bcentur/i,
    /\bpresident/i,
    /\broyal/i,
    /\bking\b/i,
    /\bqueen\b/i,
    /\bempire/i,
    /\bancient/i,
    /\bmedieval/i,
    /\bworld war/i,
    /\bcivil war/i,
    /\brevolution/i,
  ],
  SCIENCE: [
    /\bscien/i,
    /\bphysic/i,
    /\bchemis/i,
    /\bbiolog/i,
    /\banatom/i,
    /\bmedic/i,
    /\bdoctor/i,
    /\bdiseas/i,
    /\belement/i,
    /\batom/i,
    /\bmolecul/i,
    /\bdna\b/i,
    /\bgene/i,
    /\bcell\b/i,
  ],
  GEOGRAPHY: [
    /\bgeograph/i,
    /\bcountr/i,
    /\bcapital/i,
    /\bcit(?:y|ies)/i,
    /\bstate/i,
    /\briver/i,
    /\bmountain/i,
    /\bisland/i,
    /\bcontinent/i,
    /\bocean/i,
    /\bmap\b/i,
    /\bborder/i,
  ],
  LITERATURE: [
    /\bliterat/i,
    /\bbook/i,
    /\bnovel/i,
    /\bauthor/i,
    /\bpoet/i,
    /\bpoem/i,
    /\bshakespeare/i,
    /\bfiction/i,
    /\bwriter/i,
    /\bplay\b/i,
    /\bdrama/i,
  ],
  SPORTS: [
    /\bsport/i,
    /\bbaseball/i,
    /\bfootball/i,
    /\bbasketball/i,
    /\bhockey/i,
    /\bsoccer/i,
    /\btenn(?:is)/i,
    /\bgolf/i,
    /\bolympic/i,
    /\bathlet/i,
    /\bteam/i,
  ],
  MUSIC: [
    /\bmusic/i,
    /\bsong/i,
    /\bsinger/i,
    /\bband\b/i,
    /\brock\b/i,
    /\bjazz/i,
    /\bclassical/i,
    /\bopera/i,
    /\bcomposer/i,
    /\balbum/i,
  ],
  MOVIES: [
    /\bmovie/i,
    /\bfilm/i,
    /\bcinema/i,
    /\bactor/i,
    /\bactress/i,
    /\bdirector/i,
    /\boscar/i,
    /\bhollywood/i,
  ],
  TV: [
    /\btv\b/i,
    /\btelevi/i,
    /\bshow\b/i,
    /\bseries/i,
    /\bsitcom/i,
    /\bnetwork/i,
  ],
  ART: [
    /\bart\b/i,
    /\bartist/i,
    /\bpaint/i,
    /\bsculptur/i,
    /\bmuseum/i,
    /\bgaller/i,
  ],
  FOOD: [
    /\bfood/i,
    /\bcook/i,
    /\bcuisine/i,
    /\brestaurant/i,
    /\bdrink/i,
    /\bwine/i,
    /\bbeer/i,
    /\brecipe/i,
  ],
  RELIGION: [
    /\brelig/i,
    /\bbible/i,
    /\bchurch/i,
    /\bgod\b/i,
    /\bjesus/i,
    /\bislam/i,
    /\bbuddh/i,
    /\bhindu/i,
    /\bjewish/i,
  ],
  POLITICS: [
    /\bpolit/i,
    /\bgovern/i,
    /\bcongress/i,
    /\bsenate/i,
    /\blaw\b/i,
    /\blegal/i,
    /\bcourt/i,
    /\belection/i,
    /\bvote/i,
  ],
  TECHNOLOGY: [
    /\btech/i,
    /\bcomputer/i,
    /\binternet/i,
    /\bsoftware/i,
    /\bhardware/i,
    /\bdigital/i,
    /\binvent/i,
  ],
  NATURE: [
    /\bnatur/i,
    /\banimal/i,
    /\bplant/i,
    /\btree/i,
    /\bflower/i,
    /\bbird/i,
    /\bfish/i,
    /\bmammal/i,
    /\binsect/i,
    /\bwildlife/i,
  ],
  LANGUAGE: [
    /\blanguage/i,
    /\bword/i,
    /\bvocab/i,
    /\bgrammar/i,
    /\bspell/i,
    /\bforeign/i,
    /\blatin/i,
    /\bfrench/i,
    /\bspanish/i,
  ],
};

export interface TagResult {
  primaryTag: string;
  subjectTags: string[];
}

/**
 * Normalize a tag name for consistency.
 */
function normalizeTag(tag: string): string {
  return tag
    .trim()
    .toUpperCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Detect subject tags from a category name.
 */
function detectSubjectTags(categoryName: string): string[] {
  const subjects: string[] = [];

  for (const [subject, patterns] of Object.entries(SUBJECT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(categoryName)) {
        subjects.push(subject);
        break; // Only add each subject once
      }
    }
  }

  return subjects;
}

/**
 * Extract tags from a J-Archive category.
 * @param categoryName - The original category name from J-Archive
 * @returns TagResult with primary tag and detected subject tags
 */
export function extractTags(categoryName: string | null | undefined): TagResult {
  if (!categoryName) {
    return { primaryTag: "UNCATEGORIZED", subjectTags: [] };
  }

  const primaryTag = normalizeTag(categoryName);
  const subjectTags = detectSubjectTags(categoryName);

  return { primaryTag, subjectTags };
}

/**
 * Get all unique tags from a TagResult.
 */
export function getAllTags(result: TagResult): string[] {
  const allTags = [result.primaryTag, ...result.subjectTags];
  return [...new Set(allTags)]; // Deduplicate
}

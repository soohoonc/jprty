# Question Bank Source (Open Trivia Fallback)

## Source choice

JPRTY currently uses **OpenTriviaQA** as the seed source for playable question sets.

- Source URL: https://github.com/uberspot/OpenTriviaQA
- License: Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0)
- License URL: https://creativecommons.org/licenses/by-sa/4.0/

We preferred a Jeopardy-style open clue corpus, but did not find a clearly licensed Jeopardy-clue dataset already bundled in-repo. The previous sample seed path used a `jarchive-sample` label without explicit license metadata in app docs. This fallback moves the default seed to a source with clear published licensing.

## Seed/import path

- Seed data file: `packages/db/data/open-trivia-showcase.json`
- Seed script: `packages/db/seed.ts`
- Command: `bun run --cwd packages/db db:seed`

The seed file contains 3 packs, each with 6 categories and 5 clues per category.

## Coverage and mapping

- Total seeded clues: **90**
- Board-ready shape: **6 categories x 5 clues** per pack
- Pack count: **3**

Category/tag mapping is done in `packages/db/seed.ts`:

- Prisma `Category.name` uses the normalized display name from each source category slug.
- Each question gets two tags:
  - normalized category name (for gameplay category matching)
  - normalized category slug (for source traceability)
- `questionSet.config` stores source + license metadata for attribution.

## Attribution notes

CC BY-SA 4.0 requires attribution and share-alike for adaptations/distribution. Keep this document and the `questionSet.config` source metadata when shipping seeded data.

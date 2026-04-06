# SpacetimeDB Migration: Gameplay Mirror Slice

This slice keeps Prisma + Socket.IO as the live gameplay path, but mirrors the authoritative game snapshot into the checked-in SpacetimeDB module on every game-state transition.

## What this slice adds

- New public SpacetimeDB tables for mirrored gameplay state, player scores, and board cells.
- New module reducers for `sync_mirrored_game_state`, `sync_mirrored_game_score`, and `sync_mirrored_game_board_cell`.
- A server-side `syncGameplaySnapshot` mirror path that projects the existing in-memory `GameStateSnapshot` into those reducers.
- Coverage for the new reducer call payloads in `apps/server/src/runtime/spacetimedb-mirror.test.ts`.

## Runtime behavior

- The room lifecycle mirror remains opt-in through the existing server env vars:
  - `SPACETIMEDB_URL`
  - `SPACETIMEDB_DATABASE`
  - `SPACETIMEDB_TOKEN` (optional)
- When those vars are set, every authoritative `gameState.onStateChange(...)` callback now also mirrors:
  - current phase and round metadata
  - selector/current player pointers
  - current clue identity/category/value
  - remaining timer and wager state
  - per-player scores
  - per-cell board state, including Daily Double flags and used status

If those values are absent, the current app flow still runs without attempting SpacetimeDB gameplay writes.

## Validation used for this slice

- `bun test ./apps/server/src/runtime/game-runtime.test.ts ./apps/server/src/runtime/spacetimedb-mirror.test.ts --timeout 20000`
- `cargo check --manifest-path spacetimedb/Cargo.toml`

## Demo artifact

The end-to-end demo path for this gameplay-mirror slice is documented in `docs/spacetimedb-e2e-demo.md`. That document points at the recorded full-game artifact bundle and the exact local rerun steps for a mirror-enabled session.

## Follow-up

- Read lobby and gameplay state from SpacetimeDB subscriptions instead of the Prisma/socket bridge.
- Generate TypeScript bindings for the web client.
- Move one reducer path from mirrored writes to primary gameplay execution inside the module.

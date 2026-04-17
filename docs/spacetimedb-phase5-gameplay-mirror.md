# SpacetimeDB Migration: Gameplay Mirror Slice

This slice now keeps Prisma + Socket.IO as the write/event path, while adding an env-gated SpaceTimeDB read cutover for room and gameplay snapshot reads.

## What this slice adds

- New public SpacetimeDB tables for mirrored gameplay state, player scores, and board cells.
- New module reducers for `sync_mirrored_game_state`, `sync_mirrored_game_score`, and `sync_mirrored_game_board_cell`.
- A server-side `syncGameplaySnapshot` mirror path that projects the existing in-memory `GameStateSnapshot` into those reducers.
- A server-side `SpacetimeReadService` that reads `live_room`, `live_room_player`, and mirrored gameplay tables through the SpaceTimeDB SQL endpoint.
- Runtime/read-path wiring so `/api/game-state/:roomCode` and socket `ROOM_EVENTS.GET_STATE` / `GAME_EVENTS.GET_STATE` can serve SpaceTimeDB-backed snapshots.
- Coverage for the new reducer call payloads in `apps/server/src/runtime/spacetimedb-mirror.test.ts`.

## Runtime behavior

- The room lifecycle mirror remains opt-in through the existing server env vars:
  - `SPACETIMEDB_URL`
  - `SPACETIMEDB_DATABASE`
  - `SPACETIMEDB_TOKEN` (optional)
- SpaceTimeDB read cutover is gated behind:
  - `SPACETIMEDB_READS_ENABLED=true`
- When those vars are set, every authoritative `gameState.onStateChange(...)` callback now also mirrors:
  - current phase and round metadata
  - selector/current player pointers
  - current clue identity/category/value
  - remaining timer and wager state
  - per-player scores
  - per-cell board state, including Daily Double flags and used status

If read-cutover is disabled (or SpaceTimeDB reads fail), runtime snapshots fall back to the existing Prisma/socket-backed path.

## Validation used for this slice

- `bun test ./apps/server/src/runtime/game-runtime.test.ts ./apps/server/src/runtime/spacetimedb-mirror.test.ts --timeout 20000`
- `cargo check --manifest-path spacetimedb/Cargo.toml`

## Demo artifact

The end-to-end demo path for this gameplay-mirror slice is documented in `docs/spacetimedb-e2e-demo.md`. That document points at the recorded full-game artifact bundle and the exact local rerun steps for a mirror-enabled session.

## Follow-up

- Replace SQL polling/read-through with subscription-backed SpaceTimeDB bindings.
- Generate TypeScript bindings for the web client.
- Move one reducer path from mirrored writes to primary gameplay execution inside the module.

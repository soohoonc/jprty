# SpacetimeDB Module

This directory contains the live-room runtime module and source-of-truth gameplay state.

## Current scope

- Give local development a stable `spacetimedb/` project path.
- Keep room lifecycle in SpacetimeDB reducers/tables.
- Keep authoritative gameplay snapshot, scores, and board cells in SpacetimeDB reducers/tables.

## Local workflow

1. Install Rust.
2. Install the `spacetime` CLI.
3. Start a local node:

```bash
spacetime start
```

4. Publish this module from the repo root:

```bash
spacetime publish --server local --project-path spacetimedb jprty-room-runtime
```

## Module reducers

- `sync_live_room` upserts the mirrored room snapshot.
- `sync_live_room_player` upserts mirrored player presence rows.
- `remove_live_room_player` deletes mirrored player presence rows.
- `sync_mirrored_game_state` upserts the current gameplay snapshot for a room.
- `sync_mirrored_game_score` upserts one mirrored player score row.
- `sync_mirrored_game_board_cell` upserts one mirrored board-cell row.
- `init` keeps the module publishable before app reads switch over to SpacetimeDB.

## Planned follow-up

- Generate TypeScript bindings for `apps/web`.
- Switch runtime reads from the Prisma/socket bridge to SpacetimeDB-backed subscriptions.
- Move gameplay reducers into the module after the mirrored lobby slice is stable.

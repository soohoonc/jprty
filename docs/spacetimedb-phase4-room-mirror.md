# SpacetimeDB Migration: Room Mirror Slice

This slice keeps Prisma + Socket.IO as the live path, but starts mirroring room lifecycle data into the checked-in SpacetimeDB module.

## What this slice adds

- A server-side `SpacetimeMirrorService` that calls SpacetimeDB reducers over HTTP when the runtime is configured.
- A room provision endpoint so `createRoom` can seed the mirror immediately after Prisma creates the room.
- Shadow writes for host join, player join, player leave, game start, and game end.
- A real Rust module implementation for `sync_live_room`, `sync_live_room_player`, and `remove_live_room_player`.

## Runtime configuration

The mirror path is opt-in. Set these server environment variables to enable it:

- `SPACETIMEDB_URL`
- `SPACETIMEDB_DATABASE`
- `SPACETIMEDB_TOKEN` (optional)

If those values are absent, the current app flow continues without attempting SpacetimeDB writes.

## Validation used for this slice

- `bun test ./apps/server/src/runtime/game-runtime.test.ts ./apps/server/src/runtime/spacetimedb-mirror.test.ts --timeout 20000`
- `cargo check --manifest-path spacetimedb/Cargo.toml`

## Follow-up

- Switch room snapshot reads to SpacetimeDB subscriptions instead of the Prisma/socket bridge.
- Generate TypeScript bindings for `apps/web`.
- Move gameplay reducers into the module after the mirrored lobby flow is stable.

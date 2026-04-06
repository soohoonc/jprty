# SpacetimeDB Migration: Phase 1

This PR starts the hybrid SpacetimeDB migration without replacing the current auth, content, or gameplay stack.

## What this slice establishes

- A checked-in `spacetimedb/` module scaffold for local development.
- A shared live-room runtime contract in `packages/shared/src/runtime.ts`.
- A server-side runtime boundary in `apps/server/src/runtime/` that keeps the current Prisma + Socket.IO path behind a thin adapter.
- A first subscribed runtime slice for room lobby state: host join, player join, player leave, and room state fetch all emit the same canonical room snapshot.

## Current architecture

- `apps/web` still creates rooms through tRPC + Prisma.
- `apps/server` still owns the live gameplay loop and Socket.IO transport.
- `apps/server/src/runtime/live-room-runtime.ts` is the phase-1 adapter. Today it hydrates runtime state from Prisma and active socket connections.
- `spacetimedb/src/lib.rs` defines the initial target data model for the live-room runtime, but this PR does not switch production traffic to that module yet.

## Vertical slice in this PR

Implemented:

- Host joins a room and receives a canonical live-room snapshot.
- Players join a room and receive the same canonical live-room snapshot.
- Lobby state updates (`room:joined`, `room:player_joined`, `room:player_left`, `room:state`) now carry a `room` snapshot.
- The host waiting screen and player waiting screen can subscribe to that runtime snapshot through `apps/web/src/lib/use-room-runtime.ts`.

Not implemented yet:

- SpacetimeDB-backed room creation.
- SpacetimeDB subscriptions on the web client.
- SpacetimeDB-backed gameplay state and reducers.
- Generated module bindings in the web app.

## Local development

Current app flow:

1. Run the existing app stack as usual.
2. The lobby slice will use the new runtime boundary automatically.

SpacetimeDB scaffold flow:

1. Install Rust and the `spacetime` CLI.
2. Start a local node with `spacetime start`.
3. From the repo root, publish the module with `spacetime publish --server local --project-path spacetimedb jprty-room-runtime`.

## Why this split

The repo currently mixes room lifecycle logic across tRPC, Socket.IO handlers, and ad hoc database reads. This phase introduces one runtime contract first, so later PRs can swap the backing implementation from the Prisma/socket bridge to SpacetimeDB without changing every consumer again.

## Next PRs

- Wire room creation into a SpacetimeDB-backed adapter path.
- Introduce generated TypeScript module bindings and a client subscription provider.
- Move lobby membership presence off Socket.IO connection bookkeeping and into SpacetimeDB reducers.
- Start migrating one gameplay reducer path after the lobby slice is stable.

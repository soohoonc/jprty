# Vercel + SpacetimeDB Cutover Plan

## Goal

Move JPRTY to:

- Vercel-hosted frontend (`apps/web`).
- SpacetimeDB-owned live room/game runtime.
- Postgres only for auth/accounts/question catalog/history.
- No Fly deployment target in this repo.

## Current Runtime (May 30, 2026)

- `apps/web` is a Next.js app intended for Vercel.
- `apps/server` still runs a standalone Socket.IO + Hono process.
- Authoritative gameplay still executes in server memory (`gameState`) and is mirrored into SpacetimeDB.
- Runtime reads can be switched to SpacetimeDB via `SPACETIMEDB_READS_ENABLED=true`, with fallback to the legacy Prisma/socket bridge.
- Postgres (Prisma) owns users/auth, room/player records, question catalog, leaderboard/history.

## What Changed In This Pass

- Removed Fly config (`fly.toml`) so the repo no longer advertises Fly as a backend target.
- Kept Vercel build focused on build artifacts only (`scripts/vercel-build.sh` no longer runs `db:deploy`).

## Target Runtime Split

- SpacetimeDB authoritative:
  - Room membership/presence.
  - Game phase transitions.
  - Board/question selection and lock state.
  - Buzz queue and answer/wager windows.
  - Live score state.
- Postgres authoritative:
  - Better Auth tables (`User`, `Session`, `Account`, `Verification`).
  - Question set/catalog data.
  - Durable history/reporting (`GameSession`, `Round`, leaderboards, player stats).
- Vercel app:
  - UI + auth + catalog browse + history views.
  - Runtime subscriptions and reducer calls through SpacetimeDB bindings.

## Migration Sequence

1. Keep current mirror path and read-cutover env gate as safety fallback.
2. Add SpacetimeDB client bindings in `apps/web` and introduce room/game subscriptions beside Socket.IO.
3. Move command authority (join/start/select/buzz/answer/wager/advance) from server events to SpacetimeDB reducers.
4. Replace `GAME_SERVER_URL`/`NEXT_PUBLIC_SOCKET_URL` dependencies in web runtime flows.
5. Keep `apps/server` only as optional bridge during migration; stop using it for primary gameplay authority.
6. Remove bridge-only runtime code (`apps/server/src/events/*`, in-memory `gameState`) after parity and soak.
7. Keep Postgres writes for history/accounting as async projection from finalized runtime events.

## Risks

- Race/ordering differences when moving from single-process memory state to reducer-driven state.
- Latency-sensitive buzz fairness can regress without deterministic server-side timing design.
- Dual-write period can drift unless reducer events become the source for Postgres projections.
- Existing reconnect semantics currently tied to Socket.IO connection identity.

## Product + Architecture Questions To Resolve

1. Hosting: where will the temporary bridge (`apps/server`) run while Socket.IO is still needed, if not Fly?
2. Authority model: should game timers be reducer-owned (SpacetimeDB clock/event model) or client-triggered with server validation?
3. Identity: for anonymous players, what stable identity should map reconnects and score ownership across tabs/devices?
4. Projection policy: what gameplay milestones must be persisted to Postgres synchronously vs asynchronously?
5. Abuse controls: do reducer calls need authenticated user tokens, room-scoped host capability tokens, or both?
6. Rollout: should read-cutover (`SPACETIMEDB_READS_ENABLED`) be global, room-scoped, or percentage-based?

# Vercel + SpacetimeDB Cutover Plan

## Goal

Move JPRTY to:

- Vercel-hosted frontend (`apps/web`).
- Vercel-hosted API surface for auth/accounts/catalog/history endpoints.
- SpacetimeDB-owned live room/game runtime.
- Postgres only for auth/accounts/question catalog/history.
- No new long-lived backend provider.
- No Fly deployment target in this repo.

## Recorded Hosting Decision (May 30, 2026)

- Keep Vercel as the only web/API hosting surface.
- Use SpacetimeDB as the authoritative realtime/game backend.
- Keep Postgres only for auth/accounts/question catalog/history/projection data.
- Do not add another long-lived backend provider.
- Do not use Fly for this cutover.

## Current Runtime (May 30, 2026)

- `apps/web` is a Next.js app intended for Vercel.
- `apps/server` still runs a standalone Socket.IO + Hono process.
- Authoritative gameplay still executes in server memory (`gameState`) and is mirrored into SpacetimeDB.
- Runtime reads can be switched to SpacetimeDB via `SPACETIMEDB_READS_ENABLED=true`, with fallback to the legacy Prisma/socket bridge.
- Postgres (Prisma) owns users/auth, room/player records, question catalog, leaderboard/history.

## What Changed In This Pass (May 30, 2026, Phase 2 Slice)

- Removed Fly config (`fly.toml`) so the repo no longer advertises Fly as a backend target.
- Kept Vercel build focused on build artifacts only (`scripts/vercel-build.sh` no longer runs `db:deploy`).
- Added a web runtime gate for direct SpacetimeDB room reads:
  - `NEXT_PUBLIC_LIVE_RUNTIME_BACKEND=spacetimedb`
  - `NEXT_PUBLIC_SPACETIMEDB_URL`
  - `NEXT_PUBLIC_SPACETIMEDB_DATABASE`
  - optional `NEXT_PUBLIC_SPACETIMEDB_TOKEN` and `NEXT_PUBLIC_SPACETIMEDB_POLL_MS`
- `apps/web/src/lib/use-room-runtime.ts` now attempts direct SpacetimeDB room polling only when that gate is enabled and `roomCode` is known.
- `apps/web/src/app/room/[code]/page.tsx` keeps runtime reads enabled by `roomCode` even before Socket.IO connects, so direct SpacetimeDB reads are not blocked by socket connection state.
- If direct read config is absent or any SpacetimeDB read fails, the hook falls back to existing Socket.IO room runtime listeners automatically.
- Gameplay command/write authority (join/start/select/buzz/answer/wager/advance) remains on Socket.IO in this slice.

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

## Phase 2 Plan (Short)

1. Wire `apps/web` to SpacetimeDB subscriptions/reducers for room/game state while Socket.IO remains fallback-gated.
2. Shift gameplay command authority to SpacetimeDB reducers; keep Vercel API routes only for auth/account/catalog/history paths.
3. Add projection from finalized SpacetimeDB events into Postgres history/reporting tables.
4. Remove Fly assumptions and avoid introducing any new long-lived bridge host; retire bridge-only server paths after parity.

## Remaining Blockers For Full Phase 2

1. Browser subscription client decision: choose official web bindings generation path and module distribution for `apps/web` (current slice uses direct SQL polling only, not realtime subscriptions).
2. Reducer auth model for browser calls: define whether reducer access uses public anonymous identity, Better Auth user token bridging, room-scoped capability tokens, or a hybrid.
3. Vercel-to-SpacetimeDB network policy: confirm CORS/origin + token exposure policy for browser direct calls before enabling non-read reducer paths in production.

## Risks

- Race/ordering differences when moving from single-process memory state to reducer-driven state.
- Latency-sensitive buzz fairness can regress without deterministic server-side timing design.
- Dual-write period can drift unless reducer events become the source for Postgres projections.
- Existing reconnect semantics currently tied to Socket.IO connection identity.

## Product + Architecture Questions To Resolve

1. Authority model: should game timers be reducer-owned (SpacetimeDB clock/event model) or client-triggered with server validation?
2. Identity: for anonymous players, what stable identity should map reconnects and score ownership across tabs/devices?
3. Projection policy: what gameplay milestones must be persisted to Postgres synchronously vs asynchronously?
4. Abuse controls: do reducer calls need authenticated user tokens, room-scoped host capability tokens, or both?
5. Rollout: should read-cutover (`SPACETIMEDB_READS_ENABLED`) be global, room-scoped, or percentage-based?

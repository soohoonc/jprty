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
- `apps/server` is no longer in the production gameplay path.
- Authoritative gameplay command/read flow now runs from `apps/web` directly against SpacetimeDB live reducers/tables.
- Runtime reads use SpacetimeDB live tables (`live_game_*`, `live_room*`) for room/game state.
- Postgres (Prisma) owns users/auth, room/player records, question catalog, leaderboard/history.
- `apps/web` tRPC now exposes SpacetimeDB gameplay mutations:
  - `game.startGame`
  - `game.selectQuestion`
  - `game.buzz`
  - `game.submitAnswer`
- `apps/web` `game.getGameState` now reads only SpacetimeDB when enabled (no `GAME_SERVER_URL` fallback).
- Lobby/player pages join/leave via tRPC and consume SpacetimeDB runtime polling (no Socket.IO event requirement on the production path).

## What Changed In This Pass (May 30, 2026, Live Reducer Cutover Slice)

- Removed Fly config (`fly.toml`) so the repo no longer advertises Fly as a backend target.
- Kept Vercel build focused on build artifacts only (`scripts/vercel-build.sh` no longer runs `db:deploy`).
- Added a web runtime gate for direct SpacetimeDB room reads:
  - `NEXT_PUBLIC_LIVE_RUNTIME_BACKEND=spacetimedb`
  - `NEXT_PUBLIC_SPACETIMEDB_URL`
  - `NEXT_PUBLIC_SPACETIMEDB_DATABASE`
  - optional `NEXT_PUBLIC_SPACETIMEDB_POLL_MS`
- `apps/web/src/server/spacetimedb-gameplay.ts` adds reducer-backed gameplay writes for start/select/buzz/answer.
- `apps/web/src/server/spacetimedb-game-state-read.ts` now reads live gameplay tables instead of mirrored projections.
- `apps/web/src/lib/use-game-machine.ts` now drives gameplay through polling + tRPC mutations instead of Socket.IO gameplay events.
- Host/player/room pages no longer emit gameplay Socket.IO events for the main production flow.
- `NEXT_PUBLIC_LIVE_RUNTIME_BACKEND=spacetimedb` now disables Socket.IO fallback in room runtime when direct SpacetimeDB reads are enabled.

## Private Vercel Web/API Contract (Current)

- Required:
  - `SPACETIMEDB_URL`
  - `SPACETIMEDB_DATABASE`
- Optional:
  - `SPACETIMEDB_TOKEN`
- Browser/runtime required:
  - `NEXT_PUBLIC_LIVE_RUNTIME_BACKEND=spacetimedb`
  - `NEXT_PUBLIC_SPACETIMEDB_URL` (public SQL/read endpoint base, e.g. `https://maincloud.spacetimedb.com`)
  - `NEXT_PUBLIC_SPACETIMEDB_DATABASE`
  - optional `NEXT_PUBLIC_SPACETIMEDB_POLL_MS`
- These values route lobby/gameplay reads to SpacetimeDB and keep Socket.IO out of the production gameplay path.

## Private Vercel Web/API Room Provisioning Contract

- `apps/web` `game.createRoom` attempts direct SpacetimeDB provisioning first when both are set:
  - `SPACETIMEDB_URL`
  - `SPACETIMEDB_DATABASE`
- Optional:
  - `SPACETIMEDB_TOKEN` (Bearer auth for reducer calls)
- Server-only requirement: these variables must not be exposed via `NEXT_PUBLIC_*`.
- Reducer call used: `sync_live_room(room_id, room_code, status, phase, max_players, num_players, host_connected)`.
- Fallback behavior (non-breaking): if config is missing, disabled by omission, or SpacetimeDB reducer call fails, `game.createRoom` uses existing `GAME_SERVER_URL/api/runtime/rooms/provision`.

## Private Vercel Web/API Membership Mirroring Contract

- `apps/web` membership mutations attempt SpacetimeDB reducer calls when both are set:
  - `SPACETIMEDB_URL`
  - `SPACETIMEDB_DATABASE`
- Optional:
  - `SPACETIMEDB_TOKEN` (Bearer auth for reducer calls)
- Server-only requirement: these variables must not be exposed via `NEXT_PUBLIC_*`.
- Reducer calls used:
  - `sync_live_room_player(player_id, room_id, name, guest_name, is_host, is_active, score, joined_at)` after `joinRoom` creates/reactivates a player.
  - `remove_live_room_player(player_id)` after `leaveRoom` transitions an active player to inactive.
- `leaveRoom` is now idempotent for transitional dual-path leave handling: it deactivates only if still active, reconciles `room.numPlayers` from current active rows, and skips duplicate membership mirror removal when the player was already inactive (for example, after Socket.IO `ROOM_EVENTS.LEAVE` runs first).
- Fallback behavior (non-breaking): if config is missing or reducer calls fail, `joinRoom`/`leaveRoom` continue their existing Postgres flow and log warnings.

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

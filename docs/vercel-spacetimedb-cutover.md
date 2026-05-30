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
- `apps/web` tRPC `game.getGameState` now supports server-side mirrored reads from SpacetimeDB using private Vercel env before falling back to `GAME_SERVER_URL`.
- `apps/web` tRPC `game.createRoom` now attempts server-side `sync_live_room` reducer provisioning in SpacetimeDB using private env before falling back to `GAME_SERVER_URL` runtime room provisioning.
- `apps/web` tRPC `game.joinRoom`/`game.leaveRoom` now attempt server-side membership mirroring to SpacetimeDB (`sync_live_room_player`/`remove_live_room_player`) after successful Postgres writes, with warn-and-continue fallback on missing config or reducer errors.
- Normal player entry at `apps/web/src/app/room/[code]/page.tsx` now calls `game.joinRoom` on room entry (before gameplay), caches `{roomCode, playerName, playerId}` in localStorage (`roomMembership`), and uses that cached `playerId` to call `game.leaveRoom` on explicit leave; Socket.IO `JOIN`/`LEAVE` remains in place for transitional event transport and runtime updates.

## What Changed In This Pass (May 30, 2026, Phase 2 Slice)

- Removed Fly config (`fly.toml`) so the repo no longer advertises Fly as a backend target.
- Kept Vercel build focused on build artifacts only (`scripts/vercel-build.sh` no longer runs `db:deploy`).
- Added a web runtime gate for direct SpacetimeDB room reads:
  - `NEXT_PUBLIC_LIVE_RUNTIME_BACKEND=spacetimedb`
  - `NEXT_PUBLIC_SPACETIMEDB_URL`
  - `NEXT_PUBLIC_SPACETIMEDB_DATABASE`
  - optional `NEXT_PUBLIC_SPACETIMEDB_POLL_MS`
- `apps/web/src/lib/use-room-runtime.ts` now attempts direct SpacetimeDB room polling only when that gate is enabled and `roomCode` is known.
- `apps/web/src/app/room/[code]/page.tsx` keeps runtime reads enabled by `roomCode` even before Socket.IO connects, so direct SpacetimeDB reads are not blocked by socket connection state.
- If direct read config is absent or any SpacetimeDB read fails, the hook falls back to existing Socket.IO room runtime listeners automatically.
- `apps/web` server-side `game.getGameState` now attempts mirrored SpacetimeDB reads using private env (`SPACETIMEDB_URL`, `SPACETIMEDB_DATABASE`, `SPACETIMEDB_TOKEN`, `SPACETIMEDB_READS_ENABLED`) and falls back to `GAME_SERVER_URL` when disabled, misconfigured, missing mirrored rows, or on read errors.
- Gameplay command/write authority (join/start/select/buzz/answer/wager/advance) remains on Socket.IO in this slice.

## Private Vercel Web/API Read Contract

- `SPACETIMEDB_READS_ENABLED=true` enables the `apps/web` server-side mirrored read attempt for `game.getGameState`.
- Required when enabled:
  - `SPACETIMEDB_URL`
  - `SPACETIMEDB_DATABASE`
- Optional:
  - `SPACETIMEDB_TOKEN`
- These are server-only variables. Do not expose them through `NEXT_PUBLIC_*`.
- Fallback behavior (non-breaking): `game.getGameState` uses existing `GAME_SERVER_URL` fetch when:
  - reads are disabled (`SPACETIMEDB_READS_ENABLED` is not `true`)
  - required SpacetimeDB config is missing
  - room is not mirrored in `live_room`
  - mirrored gameplay state is absent
  - any SpacetimeDB SQL read fails

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

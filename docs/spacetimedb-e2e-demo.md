# SpacetimeDB Migration: End-to-End Demo Path

This document packages the existing gameplay recording into the SpacetimeDB migration deliverable and makes the demo path explicit.

## What this demo proves

- The app can run a full local game end to end with the current Prisma + Socket.IO live path.
- The same server runtime can mirror room lifecycle and authoritative gameplay snapshots into SpacetimeDB when the mirror env vars are set.
- The migration remains hybrid: gameplay execution is still local app logic, while SpacetimeDB receives shadow writes for room and gameplay state.

## Recorded demo evidence

Verified local gameplay recording from April 4, 2026:

- Video: `artifacts/pr-3-real-gameplay-demo.mp4`
- Browser wrapper: `artifacts/pr-3-real-gameplay-demo.html`
- Structured summary: `artifacts/pr-3-real-gameplay-demo.json`
- Final scoreboard screenshot: `artifacts/pr-3-real-gameplay-results.png`

The recorded session completed one full 6x5 board with 30 questions played. The JSON summary shows room `RACR`, winner `Ada`, final scores `Ada 9200` and `Grace 8000`, and completion time `2026-04-04T20:19:43.070Z`.

For the earlier room-mirror-only slice, the small proof video still lives at `artifacts/pr-3-spacetimedb-room-mirror-demo.mp4`.

## Local rerun path

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL on `localhost:5432` with database `jprty`.
3. Run `bun run --cwd packages/db db:migrate`.
4. Run `bun run --cwd packages/db db:seed`.
5. If you want mirrored SpacetimeDB writes enabled during the run:
   - start a local node with `spacetime start`
   - publish the module with `spacetime publish --server local --project-path spacetimedb jprty-room-runtime`
   - set `SPACETIMEDB_URL`, `SPACETIMEDB_DATABASE`, and optionally `SPACETIMEDB_TOKEN`
   - set `SPACETIMEDB_READS_ENABLED=true` to exercise SpaceTimeDB-backed runtime reads
6. Start the web app with `bun run --cwd apps/web dev`.
7. Start the game server with `bun run --cwd apps/server dev`.
8. Record a fresh gameplay run with `bun run artifacts/record-full-game-demo.ts`.

The recorder writes its outputs to the directory in `ATTEMPT_ARTIFACTS_DIR` when that env var is set. Otherwise it writes to the repo `artifacts/` directory.

## Remaining hosted prerequisites for cutover

The repo now has a local end-to-end demo path, but a hosted cutover demo still requires external deployment inputs:

- A reachable SpacetimeDB deployment URL for `SPACETIMEDB_URL`.
- A published SpacetimeDB database/module name for `SPACETIMEDB_DATABASE`.
- A token if the deployment does not allow anonymous reducer calls.
- Deployment access to the hosted app environment so those vars can be set and a new build can be rolled out.

Without those hosted inputs, the migration can be validated locally and in tests, but not demonstrated as a true hosted cutover.

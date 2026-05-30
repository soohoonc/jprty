# SpacetimeDB Multiplayer Smoke

This smoke test drives the SpacetimeDB reducers directly with two simulated players and verifies live state sync via SQL reads.

## Prerequisites

1. `spacetime` CLI installed.
2. Local node running: `spacetime start`
3. Module published:

```bash
spacetime publish --server local --project-path spacetimedb jprty-room-runtime
```

## Run

```bash
export SPACETIMEDB_URL="http://127.0.0.1:3000"
export SPACETIMEDB_DATABASE="jprty-room-runtime"
bun scripts/spacetimedb-multiplayer-smoke.ts
```

## What it proves

- Two players join the same room (`sync_live_room_player`).
- Selector chooses a clue (`select_live_game_cell`).
- A different player buzzes (`buzz_live_game`).
- Correct answer updates score and selector turn (`submit_live_game_answer`).
- SQL reads of `live_game_state`, `live_game_score`, and `live_game_board_cell` confirm state synchronization.

Evidence JSON is written to:

- `/workspace/.ouroboros/executions/3/artifacts/spacetimedb-multiplayer-smoke.json`

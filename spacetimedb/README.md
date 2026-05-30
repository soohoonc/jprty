# SpacetimeDB Module

This directory contains the SpacetimeDB runtime module for JPRTY live state.

## Current scope

- SpacetimeDB is the source of truth for room presence and gameplay state.
- Reducers cover room lifecycle, player presence, clue selection, buzzer ownership, answer submission, scores, and selector turn progression.
- Legacy `sync_mirrored_*` reducers remain available for compatibility while clients move to direct live tables.

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

## Live gameplay reducers

- `sync_live_room`
- `sync_live_room_player`
- `remove_live_room_player`
- `start_live_game`
- `sync_live_game_board_cell`
- `sync_live_game_score`
- `select_live_game_cell`
- `buzz_live_game`
- `submit_live_game_answer`
- `init`

## Live tables

- `live_room`
- `live_room_player`
- `live_game_state`
- `live_game_board_cell`
- `live_game_score`
- `live_game_buzz`

## Compatibility reducers/tables

- `sync_mirrored_game_state`
- `sync_mirrored_game_score`
- `remove_mirrored_game_score`
- `sync_mirrored_game_board_cell`
- `mirrored_game_state`
- `mirrored_game_score`
- `mirrored_game_board_cell`

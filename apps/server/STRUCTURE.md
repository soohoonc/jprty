# Server Structure

Socket.io server for Jeopardy game state and real-time communication.

## Folders

```
src/
├── game/        # Game logic and state machine
├── events/      # Socket.io event handlers
└── utils.ts     # Utilities (validation, timers)
```

Uses `@jprty/db` package for database operations.

## Data Flow

Player action → Event handler → Game logic → Update DB → Broadcast to room
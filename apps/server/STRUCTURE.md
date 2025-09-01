# Server Directory Structure

```
apps/server/
├── src/
│   ├── index.ts                    # Entry point - HTTP server + Socket.io initialization
│   │
│   ├── core/                       # Core abstractions (as defined in architecture)
│   │   ├── connections.ts          # Socket ID ↔ Player ID ↔ Room ID mappings
│   │   ├── rooms.ts                # Room lifecycle and player management
│   │   ├── games.ts                # Game session and round progression
│   │   └── events.ts               # Event dispatcher and permission validation
│   │
│   ├── handlers/                   # Socket event handlers (grouped by domain)
│   │   ├── room.handlers.ts        # room:create, room:join, room:leave, etc.
│   │   ├── game.handlers.ts        # game:select_question, game:buzz, game:answer, etc.
│   │   └── system.handlers.ts      # ping, reconnect, error handling
│   │
│   ├── state/                      # State management
│   │   ├── memory.ts               # In-memory state (timers, buzz queue, etc.)
│   │   ├── cache.ts                # Hybrid state caching layer
│   │   └── timers.ts               # Timer management for buzz windows, timeouts
│   │
│   ├── db/                         # Database operations
│   │   ├── rooms.ts                # Room CRUD operations via Prisma
│   │   ├── players.ts              # Player operations
│   │   ├── games.ts                # Game session operations
│   │   └── questions.ts            # Question retrieval and tracking
│   │
│   ├── lib/                        # Shared utilities
│   │   ├── validators.ts           # Input validation, state transition rules
│   │   ├── errors.ts               # Custom error types and handlers
│   │   ├── codes.ts                # Room code generation
│   │   └── answers.ts              # Answer validation logic
│   │
│   └── types/                      # TypeScript types
│       ├── socket.ts               # Socket event types and payloads
│       ├── state.ts                # State machine types
│       └── index.ts                # Re-exports from @jprty/db + custom types
│
├── tests/                          # Test files
│   ├── unit/
│   ├── integration/
│   └── fixtures/
│
├── .env.example                    # Environment variables template
├── package.json
└── tsconfig.json
```

## Module Responsibilities

### `/core` - Core Abstractions
The heart of the server, implementing the four main abstractions from the architecture:

- **connections.ts**: Connection Manager
  - Socket-to-player mappings
  - Room membership tracking
  - Reconnection logic

- **rooms.ts**: Room Coordinator
  - Room creation/joining/leaving
  - Host management
  - Player state within rooms

- **games.ts**: Game Engine
  - Game session lifecycle
  - Round progression
  - Question flow
  - Score tracking

- **events.ts**: Event Dispatcher
  - Event routing
  - Permission checking
  - Broadcasting logic

### `/handlers` - Socket Event Handlers
Thin handlers that receive socket events and coordinate between core modules:

- **room.handlers.ts**: All room-related events
- **game.handlers.ts**: All gameplay events  
- **system.handlers.ts**: Infrastructure events (ping, reconnect)

### `/state` - State Management
Manages the three-tier state strategy:

- **memory.ts**: Pure in-memory state (ephemeral)
- **cache.ts**: Cached database state (hybrid)
- **timers.ts**: Timer lifecycle management

### `/db` - Database Layer
Prisma operations grouped by domain:

- **rooms.ts**: Room persistence
- **players.ts**: Player persistence
- **games.ts**: Game session persistence
- **questions.ts**: Question data access

### `/lib` - Utilities
Shared functionality:

- **validators.ts**: Input sanitization, rule validation
- **errors.ts**: Error handling and custom errors
- **codes.ts**: Room code generation logic
- **answers.ts**: Answer matching algorithms

### `/types` - Type Definitions
All TypeScript types:

- **socket.ts**: Socket event interfaces
- **state.ts**: State machine types
- **index.ts**: Central type exports

## Key Design Principles

1. **Separation of Concerns**: Each module has a single, clear responsibility
2. **Layered Architecture**: Handlers → Core → State/DB
3. **Domain Grouping**: Related functionality stays together
4. **Dependency Direction**: Lower layers don't know about higher layers
5. **Testability**: Each module can be tested in isolation

## Data Flow Example

When a player buzzes in:
1. `handlers/game.handlers.ts` receives `game:buzz` event
2. Calls `core/games.ts` to validate game state
3. `core/games.ts` checks `state/memory.ts` for buzz window status
4. If valid, updates `state/memory.ts` buzz queue
5. Updates database via `db/games.ts`
6. Broadcasts via `core/events.ts` to all players in room
7. If first buzz, starts answer timer via `state/timers.ts`

## Import Graph

```
index.ts
  ├→ handlers/*.ts
  │    ├→ core/*.ts
  │    │    ├→ state/*.ts
  │    │    ├→ db/*.ts
  │    │    └→ lib/*.ts
  │    └→ types/*.ts
  └→ types/*.ts
```

This structure ensures:
- Clear dependencies
- No circular imports
- Easy to trace data flow
- Simple to test each layer
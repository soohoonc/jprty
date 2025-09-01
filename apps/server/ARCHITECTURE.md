# Jeopardy Game Server Architecture

This server acts as the state machine coordinator for the Jeopardy game, managing real-time gameplay through WebSockets while persisting game state to PostgreSQL.

## Core Architecture

The server is primarily a **state machine coordinator** that:
1. Validates state transitions
2. Persists important state to DB via Prisma
3. Broadcasts state changes to connected clients
4. Manages time-sensitive operations (buzzers, timeouts)

## Data Model Overview

### Core Entities & Their Lifecycles

**Room** - The lobby where players gather
- States: `WAITING` → `IN_GAME` → `FINISHED` → `CLOSED`
- Has a unique 6-character code for joining
- Tracks host, max players, privacy settings
- Can have multiple game sessions over time

**Player** - A participant in a room
- Can be tied to a User (authenticated) or anonymous
- Maintains score, active/inactive status
- Can win games and answer questions
- Persists across disconnections

**GameSession** - An instance of a game in a room
- States: `PENDING` → `ACTIVE` → `COMPLETED`
- Contains multiple rounds
- Tracks winner and timestamps
- One active session per room at a time

**Round** - Segments of a game
- Types: `SINGLE_JEOPARDY` → `DOUBLE_JEOPARDY` → `FINAL_JEOPARDY`
- Sequential within a session
- Different rules/scoring per type

**Question** - The trivia content
- Has clue, answer, difficulty level
- Belongs to categories
- Tracks who answered it

## State Management Strategy

### Persistent State (PostgreSQL via Prisma)
- Room configurations and membership
- Player profiles and cumulative scores
- Complete game history and results
- Question bank and categories
- User accounts and sessions

### Ephemeral State (In-Memory)
- Socket ID ↔ Player ID ↔ Room ID mappings
- Active timers (buzz windows, answer timeouts)
- Current buzz queue (order of who buzzed)
- Question reveal state during gameplay
- Temporary connection state

### Hybrid State
- Current game phase (DB + cache for performance)
- Active question (reference in DB, full data in memory during play)
- Room participant list (DB truth, memory cache)

## Key State Flows

### Room Lifecycle
```
CREATE (host) 
  → WAITING (players join)
  → IN_GAME (host starts)
  → FINISHED (game ends)
  → CLOSED (all leave or timeout)

Special cases:
- Host disconnect → transfer to another player
- All players leave → immediate close
- Reconnection → restore player state
```

### Game Flow
```
PENDING (session created)
  → ACTIVE (game starts)
    → Round begins
      → Categories revealed
      → Question selected
      → Clue displayed
      → Buzz window opens
      → Player buzzes (first gets control)
      → Answer submitted
      → Result revealed (correct/incorrect)
      → Score updated
      → Next question or round
  → COMPLETED (winner determined)
```

### Player Journey
```
CONNECT (socket established)
  → JOIN (enter room code)
  → ACTIVE (in room/game)
  → PLAYING (making game actions)
  → DISCONNECTED (connection lost)
  → RECONNECT (restore state)
```

## Socket Event Categories

### Room Management Events
**Client → Server:**
- `room:create` - Create new room
- `room:join` - Join existing room
- `room:leave` - Leave current room
- `room:start` - Start game (host only)
- `room:settings` - Update room config

**Server → Client:**
- `room:created` - Room successfully created
- `room:joined` - Successfully joined room
- `room:updated` - Room state changed
- `room:player_joined` - New player in room
- `room:player_left` - Player left room
- `room:host_changed` - Host transferred

### Game Action Events
**Client → Server:**
- `game:select_question` - Choose question from board
- `game:buzz` - Buzz in to answer
- `game:answer` - Submit answer
- `game:skip` - Skip/timeout
- `game:next_round` - Progress to next round

**Server → Client:**
- `game:started` - Game has begun
- `game:question_revealed` - Show question
- `game:buzz_window_open` - Can now buzz
- `game:player_buzzed` - Someone buzzed
- `game:answer_result` - Correct/incorrect
- `game:scores_updated` - New scores
- `game:round_complete` - Round ended
- `game:winner` - Game over, winner announced

### System Events
**Client → Server:**
- `ping` - Heartbeat
- `reconnect` - Restore session

**Server → Client:**
- `pong` - Heartbeat response
- `error` - Error occurred
- `reconnected` - State restored

## Core Abstractions

### Connection Manager
Maintains bidirectional mappings between:
- Socket IDs → Player IDs
- Player IDs → Room IDs
- Room IDs → Socket IDs (all sockets in room)

Handles:
- Connection lifecycle
- Reconnection with state restoration
- Broadcasting to rooms vs individuals

### Room Coordinator
Manages:
- Room creation with unique codes
- Player join/leave operations
- Host designation and transfer
- Room state transitions
- Maximum player enforcement

### Game Engine
Controls:
- Game session lifecycle
- Round progression logic
- Question presentation flow
- Buzz window timing
- Answer validation
- Score calculation
- Winner determination

### Event Dispatcher
Responsibilities:
- Route events to appropriate handlers
- Validate permissions (is player host?)
- Emit responses to correct scope
- Handle error propagation
- Manage event ordering

## Time-Sensitive Operations

The server manages several time-critical operations:

1. **Buzz Windows** - Limited time to buzz in (typically 5-10 seconds)
2. **Answer Timeouts** - Time limit to provide answer after buzzing (typically 10-15 seconds)
3. **Question Reveal** - Delay before opening buzz window (typically 2-3 seconds)
4. **Auto-progression** - Move to next state if no action taken

All timers are:
- Stored in memory during execution
- Cancelable if state changes
- Cleaned up on game end or disconnect

## Error Recovery

The server implements several recovery mechanisms:

1. **Reconnection** - Players can reconnect and resume with same ID
2. **Host Migration** - Automatic host transfer if host disconnects
3. **State Validation** - Prevent invalid state transitions
4. **Timeout Handling** - Auto-progress if players don't respond
5. **Cleanup** - Remove stale rooms and sessions

## Development Notes

- Server runs on Bun runtime for performance
- Uses Socket.io for WebSocket management
- Prisma for database operations
- Hono for HTTP endpoints (health checks, etc.)
- TypeScript for type safety

## Environment Variables

```env
DATABASE_URL=postgresql://...
PORT=8080
CLIENT_URL=http://localhost:3000
NODE_ENV=development
```
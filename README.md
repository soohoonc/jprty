jprty

### Notes 

Question (question, answer, points, (QuestionSetId)) (some questions will be imputed as the dataset is not complete)
QuestionSet Question[] (year/date, title, tags[] (this will be generated from the question set))
Player
Host
Host State
Player State
Game State 
Room (code, Players[], Host)
Accounts
Leaderboard 

Configurations 
Number of Players to Room Size
Question Set types (tags)
Question Set year (range)
Question Set difficulty (?)

Buzz Window
Response Window
Answer Reveal Window

### Screens 

Settings screen (host only) pick categories, year range, difficulty,
(later down the line allow people to upload/connect question sets) 

Start screen (computer/default host/create a room)

Start screen join a room (enter room code, usually mobile)

Waiting screen (waiting for players to join)

Close queue: either the VIP player or the host can close the queue

Starting round 

Categories description 

Category picker screen (host or VIP player starts)

Question picked

Question being read, Buzz window for players

players that buzz in write ansewr 

validate answer. 

Continue until question answered or timer runs out or everyone answered. 

Reveal Answer

Leaderboard/Points update

Continue until timeout, or all players have answered. (host can also end round early)

Continue until all rounds are done. 

Display winner. 


#
Room State
- Players (Host, Guest, Logged in, Active)
- Game State (Pending, Round, Buzzed)
- Room State (Waiting, Players, Etc)

## SpacetimeDB migration

The first hybrid SpacetimeDB migration slice is documented in `docs/spacetimedb-phase1.md`.

- `spacetimedb/` contains the initial module scaffold for the live-room runtime.
- The current migration work also mirrors room creation, lobby presence, and room status transitions into SpacetimeDB through an optional server-side sync path.
- `docs/spacetimedb-phase4-room-mirror.md` documents the current room-mirror slice and its env-gated runtime path.
- `apps/server/src/runtime/` contains the phase-1 runtime adapter boundary that still uses Prisma + Socket.IO underneath.
- `apps/web/src/lib/use-room-runtime.ts` is the first subscribed room-runtime consumer on the web side.

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
- The current branch also mirrors authoritative gameplay snapshots, scores, and board cells into SpacetimeDB through the same env-gated path.
- `docs/spacetimedb-phase4-room-mirror.md` documents the current room-mirror slice and its env-gated runtime path.
- `docs/spacetimedb-phase5-gameplay-mirror.md` documents the gameplay-mirror follow-up slice.
- `docs/spacetimedb-e2e-demo.md` documents the end-to-end demo path and the remaining hosted cutover prerequisites.
- `apps/server/src/runtime/` contains the phase-1 runtime adapter boundary that still uses Prisma + Socket.IO underneath.
- `apps/web/src/lib/use-room-runtime.ts` is the first subscribed room-runtime consumer on the web side.

## Local Postgres

- Copy `.env.example` to `.env` at the repo root.
- Start a local PostgreSQL instance on `localhost:5432` with a `jprty` database and the `postgres` user.
- Run `bun run --cwd packages/db db:migrate` and `bun run --cwd packages/db db:seed`.
- Vercel builds should only generate the Prisma client. Run `bun run --cwd packages/db db:deploy` once per release from a single deploy job or operator shell instead of from the parallel build graph.

The DB package now loads the repo-root `.env` directly, so package-scoped commands such as `db:seed` do not require manual shell exports first.

## Demo Video

- The PR #3 MP4 lives at `artifacts/pr-3-spacetimedb-room-mirror-demo.mp4`.
- Open `artifacts/pr-3-spacetimedb-room-mirror-demo.html` in a browser for a direct local video player.
- The full gameplay demo bundle for the current migration slice is documented in `docs/spacetimedb-e2e-demo.md`.

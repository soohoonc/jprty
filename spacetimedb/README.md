# SpacetimeDB Scaffold

This directory is the initial SpacetimeDB module scaffold for the jprty live-room runtime.

## Scope in phase 1

- Define the intended live-room tables.
- Give local development a stable `spacetimedb/` project path.
- Keep the current app runtime on the existing Prisma + Socket.IO path.

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

## Planned follow-up

- Add reducers for room creation, membership, and presence.
- Generate TypeScript bindings for `apps/web`.
- Switch the server runtime adapter from the Prisma/socket bridge to SpacetimeDB.

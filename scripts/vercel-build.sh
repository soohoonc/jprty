#!/usr/bin/env bash

set -euo pipefail

if [[ "${VERCEL:-}" == "1" && "${VERCEL_ENV:-}" == "production" ]]; then
  echo "Running Prisma migrate deploy before production build"
  bun run --cwd packages/db db:deploy
fi

turbo build

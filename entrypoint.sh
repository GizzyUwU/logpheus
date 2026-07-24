#!/bin/sh
set -e
if [ ! -d "/usr/src/app/cache" ]; then
  mkdir -p "/usr/src/app/cache"
fi

chown -R bun:bun /usr/src/app/cache
export GIT_COMMIT_SHA="$(git --git-dir=/usr/src/app/.git rev-parse HEAD 2>/dev/null || echo unknown)"
exec su-exec bun bun run src/index.ts
#!/bin/sh
set -e
if [ ! -d "/usr/src/app/cache" ]; then
  mkdir -p "/usr/src/app/cache"
fi

chown -R bun:bun /usr/src/app/cache
exec su-exec bun bun run src/index.ts
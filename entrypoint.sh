#!/bin/sh
set -e
if [ ! -d "/usr/src/app/cache" ]; then
  mkdir -p "/usr/src/app/cache"
fi

exec bun run src/index.ts
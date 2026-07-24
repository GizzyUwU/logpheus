FROM oven/bun:alpine AS gitfetch
RUN apk add --no-cache git
RUN git clone --no-checkout --depth 1 https://github.com/gizzyuwu/logpheus.git /tmp/repo

FROM oven/bun:alpine
WORKDIR /usr/src/app
RUN apk add curl su-exec jq git
COPY package.json bun.lock ./
RUN --mount=type=cache,target=$HOME/.bun/install/cache \
    bun install --frozen-lockfile --production

COPY --chown=bun:bun src/ /usr/src/app/src/
COPY --chown=bun:bun migrations/ /usr/src/app/migrations
COPY --chown=bun:bun drizzle.config.ts /usr/src/app/drizzle.config.ts
COPY --chown=bun:bun entrypoint.sh /usr/src/app/entrypoint.sh
COPY --chown=bun:bun tsconfig.json /usr/src/app/tsconfig.json
COPY --chown=bun:bun --from=gitfetch /tmp/repo/.git /usr/src/app/.git


RUN mkdir /usr/src/app/cache
RUN chmod 700 /usr/src/app/cache
RUN chmod +x /usr/src/app/entrypoint.sh

EXPOSE 3000/tcp
ENTRYPOINT ["/usr/src/app/entrypoint.sh"]

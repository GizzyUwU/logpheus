FROM oven/bun:alpine
WORKDIR /usr/src/app
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.npm \
    bun install --frozen-lockfile --production

COPY src/ /usr/src/app/src/
COPY drizzle.config.ts /usr/src/app/drizzle.config.ts
RUN mkdir /usr/src/app/cache
RUN chown -R bun:bun /usr/src/app
COPY entrypoint.sh /usr/src/app/entrypoint.sh
RUN chmod +x /usr/src/app/entrypoint.sh
RUN chmod 700 /usr/src/app/cache
RUN --mount=type=cache,target=/var/cache/apk apk add --no-cache curl su-exec

EXPOSE 3000/tcp
ENTRYPOINT ["/usr/src/app/entrypoint.sh"]

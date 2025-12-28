FROM oven/bun:alpine
WORKDIR /usr/src/app
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.npm \
    bun install --frozen-lockfile --production

COPY src/ /usr/src/app/src/
RUN mkdir /usr/src/app/cache
RUn chown -R bun:bun /usr/src/app
COPY entrypoint.sh /usr/src/app/entrypoint.sh
RUN chmod +x /usr/src/app/entrypoint.sh
RUN chmod 700 /usr/src/app/cache
RUN --mount=type=cache,target=/var/cache/apk apk add --no-cache curl

EXPOSE 3000/tcp
ENTRYPOINT ["/usr/src/app/entrypoint.sh"]

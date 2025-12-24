FROM oven/bun:alpine AS base
WORKDIR /usr/src/app

FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

FROM base AS release
RUN apk add --no-cache curl
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /usr/src/app/src src/
COPY --from=prerelease /usr/src/app/package.json .
RUN chown -R bun:bun /usr/src/app
COPY entrypoint.sh /usr/src/app/entrypoint.sh
RUN chmod +x /usr/src/app/entrypoint.sh

EXPOSE 3000/tcp
ENTRYPOINT ["/usr/src/app/entrypoint.sh"]
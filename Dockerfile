# One image: the BFF serves the API, the media proxy and the built web app.
ARG NODE=node:26.12.1-alpine3.24

FROM ${NODE} AS build
RUN npm install -g pnpm@11.12.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @flix/server typecheck && pnpm --filter @flix/web build

FROM ${NODE}
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
# Production deps only; then drop npm and pnpm, which the server never uses at runtime
# (and whose bundled dependencies are most of a scanner's findings on node images).
RUN apk upgrade --no-cache \
 && npm install -g pnpm@11.12.0 \
 && pnpm install --frozen-lockfile --prod --filter @flix/server \
 && pnpm store prune \
 && npm rm -g pnpm \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /root/.cache /root/.npm
COPY apps/server/src apps/server/src
COPY apps/server/drizzle apps/server/drizzle
COPY --from=build /app/apps/web/dist /app/web
ENV NODE_ENV=production PORT=8080 WEB_DIST=/app/web CACHE_DIR=/cache
RUN mkdir /cache && chown node:node /cache
VOLUME /cache
USER node
WORKDIR /app/apps/server
EXPOSE 8080
CMD ["node", "src/index.ts"]

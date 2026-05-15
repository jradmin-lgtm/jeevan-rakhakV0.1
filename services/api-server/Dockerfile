# Multi-stage build for the api-server.
# Build context must be the monorepo root: `docker build -f services/api-server/Dockerfile .`

FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.8.1 --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json turbo.json ./
COPY services/api-server/package.json services/api-server/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/types/package.json packages/types/
COPY packages/utils/package.json packages/utils/
RUN pnpm install --filter @jr/api-server... --frozen-lockfile=false

FROM deps AS build
COPY tsconfig*.json ./
COPY services/api-server services/api-server
COPY packages/config packages/config
COPY packages/db packages/db
COPY packages/types packages/types
COPY packages/utils packages/utils
RUN pnpm --filter @jr/api-server build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@10.8.1 --activate
# Copy the whole service folder so the workspace's node_modules symlinks
# (pointing into ../../node_modules/.pnpm/*) are preserved — otherwise the
# runtime container can't resolve `fastify`, `drizzle-orm`, `@jr/db`, etc.
COPY --from=build /app/services/api-server services/api-server
COPY --from=build /app/packages packages
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/pnpm-workspace.yaml /app/package.json /app/turbo.json ./
EXPOSE 4000
WORKDIR /app/services/api-server
# Use tsx in production: the compiled dist/main.js requires workspace deps
# (@jr/config etc.) whose package.json `main` points at src/*.ts. tsx hooks
# the module loader and transpiles those .ts imports on demand. Slight
# startup cost; no other code changes needed.
CMD ["pnpm", "exec", "tsx", "dist/main.js"]

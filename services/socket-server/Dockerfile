FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.8.1 --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json turbo.json ./
COPY services/socket-server/package.json services/socket-server/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
RUN pnpm install --filter @jr/socket-server... --frozen-lockfile=false

FROM deps AS build
COPY tsconfig*.json ./
COPY services/socket-server services/socket-server
COPY packages/config packages/config
COPY packages/db packages/db
RUN pnpm --filter @jr/socket-server build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@10.8.1 --activate
# Copy the whole service folder so the workspace's node_modules symlinks
# (pointing into ../../node_modules/.pnpm/*) are preserved — otherwise the
# runtime container can't resolve `socket.io`, `drizzle-orm`, `@jr/db`, etc.
COPY --from=build /app/services/socket-server services/socket-server
COPY --from=build /app/packages packages
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/pnpm-workspace.yaml /app/package.json /app/turbo.json ./
EXPOSE 4001
WORKDIR /app/services/socket-server
# Use tsx in production: workspace deps (@jr/config etc.) have main=src/*.ts.
# tsx transpiles those .ts imports on demand from the compiled entry.
CMD ["pnpm", "exec", "tsx", "dist/server.js"]

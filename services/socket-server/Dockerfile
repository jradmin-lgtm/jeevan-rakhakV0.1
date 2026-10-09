FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS deps
ARG NPM_REGISTRY=https://registry.npmjs.org
RUN corepack enable && COREPACK_NPM_REGISTRY=$NPM_REGISTRY corepack prepare pnpm@10.8.1 --activate
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY services/socket-server/package.json services/socket-server/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
RUN pnpm install --filter @jr/socket-server... --frozen-lockfile --registry=$NPM_REGISTRY

FROM deps AS build
COPY tsconfig*.json ./
COPY services/socket-server services/socket-server
COPY packages/config packages/config
COPY packages/db packages/db
RUN pnpm --filter @jr/socket-server build

FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS runtime
WORKDIR /app
ENV NODE_ENV=production
ARG NPM_REGISTRY=https://registry.npmjs.org
RUN corepack enable && COREPACK_NPM_REGISTRY=$NPM_REGISTRY corepack prepare pnpm@10.8.1 --activate
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

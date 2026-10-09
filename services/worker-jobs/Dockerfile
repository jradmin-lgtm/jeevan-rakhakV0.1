FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS deps
ARG NPM_REGISTRY=https://registry.npmjs.org
RUN corepack enable && COREPACK_NPM_REGISTRY=$NPM_REGISTRY corepack prepare pnpm@10.8.1 --activate
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY services/worker-jobs/package.json services/worker-jobs/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
RUN pnpm install --filter @jr/worker-jobs... --frozen-lockfile --registry=$NPM_REGISTRY

FROM deps AS build
COPY tsconfig*.json ./
COPY services/worker-jobs services/worker-jobs
COPY packages/config packages/config
COPY packages/db packages/db
RUN pnpm --filter @jr/worker-jobs build

FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS runtime
WORKDIR /app
ENV NODE_ENV=production
ARG NPM_REGISTRY=https://registry.npmjs.org
RUN corepack enable && COREPACK_NPM_REGISTRY=$NPM_REGISTRY corepack prepare pnpm@10.8.1 --activate
COPY --from=build /app/services/worker-jobs/dist services/worker-jobs/dist
COPY --from=build /app/services/worker-jobs/package.json services/worker-jobs/
COPY --from=build /app/packages packages
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/pnpm-workspace.yaml /app/package.json /app/turbo.json ./
WORKDIR /app/services/worker-jobs
CMD ["node", "dist/worker.js"]

FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.8.1 --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json turbo.json ./
COPY apps/admin-web/package.json apps/admin-web/
RUN pnpm install --filter @jr/admin-web... --frozen-lockfile=false

FROM deps AS build
COPY apps/admin-web apps/admin-web
COPY tsconfig*.json ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @jr/admin-web build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.8.1 --activate
COPY --from=build /app/apps/admin-web/.next apps/admin-web/.next
COPY --from=build /app/apps/admin-web/package.json apps/admin-web/
COPY --from=build /app/apps/admin-web/next.config.ts apps/admin-web/
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/pnpm-workspace.yaml /app/package.json /app/turbo.json ./
EXPOSE 3000
WORKDIR /app/apps/admin-web
CMD ["pnpm", "start"]

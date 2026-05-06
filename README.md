# Jeevan Rakshak — v0.2

Cost-first emergency ambulance dispatch platform.

## Apps

- `apps/user-app` — Expo (React Native) patient app, Hermes-enabled.
- `apps/driver-app` — Expo driver app with availability toggle + live location push.
- `apps/admin-web` — Next.js operations dashboard (auto-refresh every 5s).

## Services

- `services/api-server` — Fastify 5 + JWT + zod + Drizzle ORM.
- `services/socket-server` — socket.io with rooms, JWT-authed handshake.
- `services/worker-jobs` — booking timeout reaper + stale-driver sweeper.

## Packages

- `packages/ui` — shared design system (tokens + 11 components, optimized for low-RAM).
- `packages/config` — single env / feature-flag registry.
- `packages/db` — Drizzle schema, migration, seed.
- `packages/types`, `packages/utils` — shared DTOs / helpers.

## One-shot setup

```bash
cp .env.example .env
pnpm install
docker compose up -d postgres
pnpm --filter @jr/db migrate
pnpm --filter @jr/db seed
pnpm dev
```

See `../LAUNCH_GUIDE.md` for production deploy + APK build instructions.

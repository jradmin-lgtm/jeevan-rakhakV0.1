# DEPLOYMENT_AUDIT_AND_SETUP

## 1) Project Overview

- Monorepo root: `jeevan_rakshak`
- Primary deploy targets:
  - `apps/user-app` (Expo React Native Android app)
  - `apps/driver-app` (Expo React Native Android app)
  - `apps/admin-web` (Next.js admin panel)
- Supporting production services:
  - `services/api-server` (Fastify REST API)
  - `services/socket-server` (Socket.IO realtime server)
  - `services/worker-jobs` (timeout + stale-driver jobs)

### Android package names

- User app: `com.jeevanrakshak.user`
- Driver app: `com.jeevanrakshak.driver`

---

## 2) Required Environment Setup

- Node.js: `20.x` (CI uses Node 20)
- pnpm: `10.8.1` (from `packageManager` and Dockerfiles)
- JDK: `22` (repo deployment docs indicate JDK 22 for stable Android release builds)
- Android SDK: API 35 toolchain (per existing deployment docs and Gradle setup)
- Android NDK: `27.1.12297006` (per existing deployment docs)
- Windows recommended working path: short path such as `C:\jrbuild\jeevan_rakshak` to reduce path-length build issues.

---

## 3) ALL Required Production Replacements (Repo Audit Table)

| File path | Current value | Replacement needed | Purpose | Severity |
|---|---|---|---|---|
| `apps/user-app/android/gradle.properties` | `MYAPP_UPLOAD_STORE_PASSWORD=changeit123` / `MYAPP_UPLOAD_KEY_PASSWORD=changeit123` | Generate strong unique passwords and inject via secure secret store/CI vars | Android upload-key protection | CRITICAL |
| `apps/driver-app/android/gradle.properties` | `MYAPP_UPLOAD_STORE_PASSWORD=changeit123` / `MYAPP_UPLOAD_KEY_PASSWORD=changeit123` | Generate strong unique passwords and inject via secure secret store/CI vars | Android upload-key protection | CRITICAL |
| `apps/user-app/android/app/app-upload-key.keystore` | Keystore committed in repo | Remove from repo, rotate keys, store in secure vault/artifact store | Prevent key compromise | CRITICAL |
| `apps/driver-app/android/app/app-upload-key.keystore` | Keystore committed in repo | Remove from repo, rotate keys, store in secure vault/artifact store | Prevent key compromise | CRITICAL |
| `services/socket-server/src/server.ts` | Internal header check uses `config.jwtSecret` | Change to `config.internalApiSecret` to match API sender header | Internal service auth correctness/security | CRITICAL |
| `apps/admin-web/lib/adminFetch.ts` | `NEXT_PUBLIC_ADMIN_API_KEY ?? "dev-admin-key-change-in-prod"` | Set strong non-default `NEXT_PUBLIC_ADMIN_API_KEY` matching API `ADMIN_API_KEY` | Protect admin endpoints | CRITICAL |
| `packages/config/src/index.ts` | `JWT_SECRET` fallback starts with `dev-secret...` | Set `JWT_SECRET` to random 64+ char value | JWT signing integrity | CRITICAL |
| `packages/config/src/index.ts` | `INTERNAL_API_SECRET` fallback `dev-internal-secret...` | Set strong random `INTERNAL_API_SECRET` | Service-to-service auth | CRITICAL |
| `packages/config/src/index.ts` | `ADMIN_API_KEY` fallback `dev-admin-key-change-in-prod` | Set strong random `ADMIN_API_KEY` | Admin API guard | CRITICAL |
| `packages/config/src/index.ts` | `CORS_ALLOWED_ORIGINS="*"` default | Set explicit allowlist of production domains | Browser-origin security | CRITICAL |
| `apps/admin-web/app/page.tsx` and related admin pages | `NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000"` | Set `NEXT_PUBLIC_API_BASE_URL=https://api.<your-domain>` | Admin web -> API routing | IMPORTANT |
| `apps/user-app/src/api.ts` | dev fallback `http://localhost:4000` / `http://localhost:4001` | Ensure release uses `.env.production` with public HTTPS/WSS endpoints | Mobile API/socket connectivity | IMPORTANT |
| `apps/driver-app/src/api.ts` | dev fallback `http://localhost:4000` / `http://localhost:4001` | Ensure release uses `.env.production` with public HTTPS/WSS endpoints | Mobile API/socket connectivity | IMPORTANT |
| `apps/user-app/.env.production.example` | `https://api.example.com` / `wss://socket.example.com` | Replace with real domains in `.env.production` | Production endpoint config | IMPORTANT |
| `apps/driver-app/.env.production.example` | `https://api.example.com` / `wss://socket.example.com` | Replace with real domains in `.env.production` | Production endpoint config | IMPORTANT |
| `apps/user-app/eas-project.json` | Static `expoProjectId` UUID | Verify this UUID belongs to your Expo org/project | Correct OTA target | IMPORTANT |
| `apps/driver-app/eas-project.json` | Static `expoProjectId` UUID | Verify this UUID belongs to your Expo org/project | Correct OTA target | IMPORTANT |
| `apps/user-app/android/app/build.gradle` | `versionCode 1` / `versionName "1.0.0"` | Increment release versions per Play upload | Play Store versioning compliance | IMPORTANT |
| `apps/driver-app/android/app/build.gradle` | `versionCode 1` / `versionName "1.0.0"` | Increment release versions per Play upload | Play Store versioning compliance | IMPORTANT |
| `apps/admin-web/app/layout.tsx` | Footer text `v0.2 demo · investor preview` | Replace with production branding text | Public production presentation | OPTIONAL |
| `docker-compose.yml` | Production profile defaults include dev placeholders and mock providers | Use dedicated production orchestrator/secrets, do not deploy with defaults | Infra hardening | IMPORTANT |

---

## 4) API and Backend Configuration

### Public API endpoints in use

- Auth:
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/verify-otp`
- User/driver profile:
  - `GET /api/v1/me`
  - `PATCH /api/v1/me`
- Bookings:
  - `POST /api/v1/bookings`
  - `GET /api/v1/bookings/:id`
  - `GET /api/v1/bookings/mine`
  - `GET /api/v1/bookings/pending`
  - `POST /api/v1/bookings/:id/accept`
  - `POST /api/v1/bookings/:id/arrived`
  - `POST /api/v1/bookings/:id/pickup`
  - `POST /api/v1/bookings/:id/complete`
  - `POST /api/v1/bookings/:id/rate`
  - `POST /api/v1/bookings/:id/cancel`
- Driver:
  - `POST /api/v1/driver/availability`
  - `POST /api/v1/driver/location`
- Admin:
  - `GET /api/v1/admin/dashboard`
  - `GET /api/v1/admin/bookings`
  - `GET /api/v1/admin/bookings/:id`
  - `GET /api/v1/admin/drivers`
  - `GET /api/v1/admin/users`
- Health:
  - `GET /health`
  - `GET /health/db`

### Socket/internal endpoints

- Socket server health: `GET /health`
- Internal fan-out:
  - `POST /internal/booking-created`
  - `POST /internal/booking-event`

### Mandatory backend environment values

- Core:
  - `NODE_ENV=production`
  - `DATABASE_URL=postgres://<user>:<pass>@<host>:5432/<db>`
  - `JWT_SECRET=<64+ char random>`
  - `INTERNAL_API_SECRET=<64+ char random>`
  - `ADMIN_API_KEY=<64+ char random>`
  - `CORS_ALLOWED_ORIGINS=https://admin.<domain>,https://<other-origin>`
- Service URLs:
  - `API_BASE_URL=https://api.<domain>`
  - `SOCKET_BASE_URL=https://socket.<domain>` (or internal service URL behind gateway)
- Optional provider toggles:
  - `SMS_PROVIDER=twilio|msg91|mock`
  - `MAPS_PROVIDER=googlemaps|mapbox|mock`
  - `PAYMENTS_PROVIDER=razorpay|stripe|mock`
  - `PUSH_PROVIDER=fcm|mock`
- Security flags:
  - `FLAG_DEMO_BYPASS=false` (mandatory)

Risk if not changed: service boot refusal in production (for specific guarded values), admin bypass risks, broken mobile/admin connectivity, or insecure defaults shipped.

---

## 5) Expo / EAS Setup

- `app.config.js` in both mobile apps constructs OTA URL as `https://u.expo.dev/<expoProjectId>`.
- `AndroidManifest.xml` in both apps injects `expo.modules.updates.EXPO_UPDATE_URL` from Gradle placeholder.
- Release Gradle tasks enforce non-empty UUID-like `expoProjectId`.

### How to get real Expo project IDs

1. In each app folder run `eas init` with the target Expo account/project.
2. Copy resulting project UUID into each `eas-project.json` (or set `USER_EAS_PROJECT_ID` / `DRIVER_EAS_PROJECT_ID` in CI).
3. Ensure `app.config.js` resolves the intended project ID per app.

### OTA update risks

- Wrong `expoProjectId` can deliver updates from a different Expo project.
- Empty/placeholder ID blocks release build.
- Cross-wired user/driver IDs can push wrong OTA bundle to wrong app audience.

---

## 6) Third-Party Services Checklist (Detected Integrations)

### Twilio (detected)

- Required secrets: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`
- Configure in: backend env used by `packages/config` and `services/api-server/src/sms.ts`
- Risk if missing: OTP falls back to console logging path (not real SMS delivery)

### MSG91 (detected)

- Required secrets: `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, optional `MSG91_SENDER`
- Configure in: backend env used by `packages/config` and `services/api-server/src/sms.ts`
- Risk if missing: fallback/non-delivery for OTP in production

### Google Maps / Mapbox (detected config hooks)

- Required keys:
  - `GOOGLE_MAPS_API_KEY` when `MAPS_PROVIDER=googlemaps`
  - `MAPBOX_ACCESS_TOKEN` when `MAPS_PROVIDER=mapbox`
- Configure in: backend env via `packages/config`
- Risk if missing: map/geocoding/location feature failures when provider enabled

### Razorpay / Stripe (detected config hooks)

- Required keys:
  - Razorpay: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`
  - Stripe: `STRIPE_SECRET`
- Configure in: backend env via `packages/config`
- Risk if missing: payment flow failure when payments are enabled

### FCM push (detected config hook)

- Required secret: `FCM_SERVER_KEY`
- Configure in: backend env via `packages/config`
- Risk if missing: push dispatch failure when `PUSH_PROVIDER=fcm`

### Not detected in runtime code

- Firebase mobile config files (`google-services.json` / `GoogleService-Info.plist`) are not present.
- No detected runtime code integrations for Sentry, OneSignal, Agora, OAuth providers in app/service code.

---

## 7) Android Release Configuration

- Signing is wired through `MYAPP_UPLOAD_*` values in each app `android/gradle.properties`.
- `allowBackup="false"` is already set in both main manifests (good).
- Debug manifests force `usesCleartextTraffic=true`, limited to debug build type.
- Release build types exist for both apps and attach release signing config.

### Required Play Store actions

- Rotate/recreate upload keystores and credentials (current values are weak and committed).
- Move key passwords to secure CI secrets, not tracked files.
- Ensure package names are final and owned in Play Console:
  - `com.jeevanrakshak.user`
  - `com.jeevanrakshak.driver`
- Increment `versionCode` for every Play upload.

---

## 8) Security Review (Actual Findings)

## CRITICAL

1. **Committed keystores** in both app folders.
   - Risk: compromise of signing identity and release channel trust.
   - Mandatory action: rotate keys, remove binaries from git, migrate to secret vault + secure release pipeline.

2. **Hardcoded weak keystore passwords** (`changeit123`) in both `gradle.properties`.
   - Risk: trivial credential compromise.
   - Mandatory action: generate strong secrets and remove from repository.

3. **Internal auth secret mismatch** between API and socket server.
   - API sends `x-internal: config.internalApiSecret`; socket validates against `config.jwtSecret`.
   - Risk: internal fan-out auth break or accidental secret coupling.
   - Mandatory action: socket validation must use `config.internalApiSecret`.

4. **Admin API key fallback default in admin web**.
   - Risk: unauthorized admin API access if defaults leak into deployment.
   - Mandatory action: set and rotate production `ADMIN_API_KEY` and `NEXT_PUBLIC_ADMIN_API_KEY`.

## IMPORTANT

1. Localhost fallbacks exist for dev in admin/mobile code paths.
2. `docker-compose.yml` has insecure/default production-profile fallbacks (dev DB credentials, `FLAG_DEMO_BYPASS` default true, mock providers).
3. Demo/investor preview indicators remain in admin UI text.

## OPTIONAL

1. Add explicit network security config for tighter transport policies (release already avoids debug cleartext in main manifest).
2. Add monitoring/error reporting integration (not currently wired in runtime code).

---

## 9) Deployment Flow (Production)

1. Prepare secure secrets (DB, JWT, internal secret, admin key, provider creds).
2. Rotate Android keystores and remove committed key materials.
3. Set mobile `.env.production` per app:
   - `EXPO_PUBLIC_API_BASE_URL=https://api.<domain>`
   - `EXPO_PUBLIC_SOCKET_BASE_URL=wss://socket.<domain>`
4. Verify `eas-project.json` values belong to correct Expo projects.
5. Install dependencies: `corepack enable && pnpm install`
6. Build AABs:
   - `pnpm run build:user:aab`
   - `pnpm run build:driver:aab`
7. Verify artifacts (signatures/hashes), then upload both AABs to Play internal track.
8. Run internal QA (OTP, booking lifecycle, realtime tracking, admin screens).
9. Promote to closed test and then phased production rollout.

---

## 10) Final Production Checklist

- [ ] Remove committed keystores and rotate all upload keys/passwords
- [ ] Fix socket internal auth to use `INTERNAL_API_SECRET`
- [ ] Set non-default `JWT_SECRET`, `INTERNAL_API_SECRET`, `ADMIN_API_KEY`
- [ ] Set strict `CORS_ALLOWED_ORIGINS` allowlist (no `*`)
- [ ] Set `FLAG_DEMO_BYPASS=false`
- [ ] Configure real API/socket URLs in both mobile `.env.production` files
- [ ] Configure `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_ADMIN_API_KEY` for admin web
- [ ] Confirm Expo `expoProjectId` ownership for both apps
- [ ] Increment `versionCode` and validate release signatures
- [ ] Complete Play Console internal test before production rollout

---

## 11) Phase 5 Validation Summary

### Coverage verification

- API endpoints: fully enumerated from `services/api-server/src/routes/*` and socket internal endpoints.
- Env vars: audited from `packages/config/src/index.ts`, app configs, admin web, Docker compose, and direct `process.env` usage.
- Expo/EAS: audited from `app.config.js`, `app.json`, `eas.json`, `eas-project.json`, Android manifest placeholders.
- Android release configs: audited manifests, build.gradle, gradle.properties, debug manifests.
- Placeholders/dev-only values: audited repo-wide (`localhost`, `example.com`, `dev-*`, `demo`, `mock`, `changeit`).

### Critical actions remaining

1. Rotate keystores/passwords and remove key material from repository.
2. Correct internal secret usage in socket server.
3. Set non-default production secrets (`JWT_SECRET`, `INTERNAL_API_SECRET`, `ADMIN_API_KEY`).
4. Lock down CORS and disable demo bypass.

### Deployment blockers

- Blocker: exposed signing credentials and committed keystores.
- Blocker: internal auth secret mismatch between services.
- Blocker: any deployment still using fallback dev/default secrets.

### Recommended immediate next steps

1. Execute security rotation/migration first (keys + secrets).
2. Patch socket internal auth check.
3. Validate production envs in staging with real URLs and provider creds.
4. Run internal-track release for both apps and verify end-to-end flows.

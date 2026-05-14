# QUICK_DEPLOYMENT_CHECKLIST

## Security First (Blockers)

- [ ] Remove `app-upload-key.keystore` from both app repos and rotate upload keys
- [ ] Replace `changeit123` keystore passwords with strong secrets in secure storage
- [ ] Set `JWT_SECRET`, `INTERNAL_API_SECRET`, `ADMIN_API_KEY` to strong production values
- [ ] Set `CORS_ALLOWED_ORIGINS` to explicit domains (no `*`)
- [ ] Set `FLAG_DEMO_BYPASS=false`
- [ ] Patch socket internal auth check to validate `INTERNAL_API_SECRET` (not JWT secret)

## Mobile App Config

- [ ] Verify `apps/user-app/eas-project.json` belongs to production Expo user app
- [ ] Verify `apps/driver-app/eas-project.json` belongs to production Expo driver app
- [ ] Set `apps/user-app/.env.production`:
  - [ ] `EXPO_PUBLIC_API_BASE_URL=https://api.<domain>`
  - [ ] `EXPO_PUBLIC_SOCKET_BASE_URL=wss://socket.<domain>`
- [ ] Set `apps/driver-app/.env.production`:
  - [ ] `EXPO_PUBLIC_API_BASE_URL=https://api.<domain>`
  - [ ] `EXPO_PUBLIC_SOCKET_BASE_URL=wss://socket.<domain>`
- [ ] Increment `versionCode` for both apps before release upload

## Admin Web Config

- [ ] Set `NEXT_PUBLIC_API_BASE_URL=https://api.<domain>`
- [ ] Set `NEXT_PUBLIC_ADMIN_API_KEY` to match backend `ADMIN_API_KEY`
- [ ] Replace demo branding text if launching publicly

## Build + Artifact Validation

- [ ] `corepack enable`
- [ ] `pnpm install`
- [ ] `pnpm run build:user:aab`
- [ ] `pnpm run build:driver:aab`
- [ ] Verify AAB signatures/hashes
- [ ] Upload to Play Internal Testing first

## Release Gate

- [ ] OTP flow works with real SMS provider
- [ ] Booking lifecycle works end-to-end
- [ ] Driver realtime location and booking events work over socket
- [ ] Admin dashboard works against production API with admin key
- [ ] Crash/ANR smoke test passed on physical devices
- [ ] Promote staged rollout: Internal -> Closed -> Production

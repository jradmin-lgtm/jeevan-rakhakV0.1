# Deployment Guide - Jeevan Rakshak

## A) Project Overview

- Monorepo root: `jeevan_rakshak`
- Mobile apps:
  - `apps/user-app` (Expo + React Native Android app)
  - `apps/driver-app` (Expo + React Native Android app)
- Shared packages:
  - `packages/ui`
  - `packages/config`
- Backend/services (for API + socket environments): `services/*`

### Android application IDs

- User app package: `com.jeevanrakshak.user`
- Driver app package: `com.jeevanrakshak.driver`

### Release artifacts

- User AAB output: `apps/user-app/android/app/build/outputs/bundle/release/app-release.aab`
- Driver AAB output: `apps/driver-app/android/app/build/outputs/bundle/release/app-release.aab`

---

## B) Environment Setup

### Required versions

- Node.js: `>=20` (recommend latest LTS)
- pnpm: `10.8.1` (via Corepack)
- Java/JDK: **JDK 22** (required in this repository to avoid Gradle/plugin failures seen with JDK 25)
- Android SDK:
  - Build tools `35.0.0`
  - Compile/target SDK `35`
- Android NDK: `27.1.12297006`

### Local prerequisites

- Android SDK installed and license accepted (`sdkmanager --licenses`)
- `local.properties` present in both apps:
  - `apps/user-app/android/local.properties`
  - `apps/driver-app/android/local.properties`
- Each should contain:
  - `sdk.dir=C:/Users/<your-user>/AppData/Local/Android/Sdk`

### Recommended Windows build path

To avoid CMake/Ninja path-length failures, build from a short path, for example:

- `C:\jrbuild\jrakshak`

Avoid building release bundles from very long nested paths under `Downloads`.

---

## C) Build Instructions

### 1) Install dependencies

From repo root:

```powershell
corepack enable
pnpm install
```

### 2) Build AABs

From repo root:

```powershell
pnpm run build:user:aab
pnpm run build:driver:aab
```

These scripts already enforce:

- `NODE_ENV=production`
- `EXPO_NO_METRO_WORKSPACE_ROOT=1`

### 3) Expected outputs

- User: `apps/user-app/android/app/build/outputs/bundle/release/app-release.aab`
- Driver: `apps/driver-app/android/app/build/outputs/bundle/release/app-release.aab`

---

## D) Expo / EAS Setup

### Why this matters

`expo-updates` OTA configuration depends on correct EAS project UUIDs.
Wrong IDs will route updates to the wrong project or break OTA.

### Files to update

- `apps/user-app/eas-project.json`
- `apps/driver-app/eas-project.json`

Each file contains:

```json
{
  "expoProjectId": "<UUID>"
}
```

### How to obtain real UUIDs

Option 1 (recommended):

1. `cd apps/user-app`
2. `npx eas-cli@latest login`
3. `npx eas-cli@latest init`
4. Copy project ID into `apps/user-app/eas-project.json`

Repeat for `apps/driver-app`.

Option 2:

- Open Expo dashboard project settings and copy the EAS project UUID directly.

### Runtime wiring already implemented

- `apps/*/app.config.js` reads env or `eas-project.json`
- Android release build injects `EXPO_UPDATE_URL` through manifest placeholders
- Release build fails early if project ID is missing/invalid

---

## E) Production Environment Setup

### Files

Use templates:

- `apps/user-app/.env.production.example`
- `apps/driver-app/.env.production.example`

Create real files per app:

- `apps/user-app/.env.production`
- `apps/driver-app/.env.production`

Required keys:

- `EXPO_PUBLIC_API_BASE_URL=https://<prod-api-host>`
- `EXPO_PUBLIC_SOCKET_BASE_URL=wss://<prod-socket-host>`

### Current behavior

- Release builds do **not** allow localhost fallbacks.
- Startup env checks (`src/env-check.ts`) throw in release if values look invalid.

---

## F) Keystore / Signing Setup

### Current setup

Both apps are configured with upload keystore properties in:

- `apps/user-app/android/gradle.properties`
- `apps/driver-app/android/gradle.properties`

Keys currently reference:

- `MYAPP_UPLOAD_STORE_FILE=app-upload-key.keystore`
- `MYAPP_UPLOAD_KEY_ALIAS=app-upload`

### Security recommendations (must-do before public launch)

- Rotate weak placeholder passwords.
- Move secrets from repo files into secure CI secrets / protected local secret manager.
- Keep a secure offline backup of upload keystores.

### Critical warning

If Play App Signing is not configured correctly and upload key material is lost, app update continuity may be blocked.

---

## G) Google Play Deployment Steps

1. Build final release AABs (with real project IDs + real env values).
2. Open Play Console for each application package:
   - `com.jeevanrakshak.user`
   - `com.jeevanrakshak.driver`
3. Upload AABs to **Internal testing** track first.
4. Validate install/update/critical paths with test accounts.
5. Promote to **Closed testing**.
6. Validate metrics, crashes, ANRs, and policy issues.
7. Roll out to **Production** in phased rollout (e.g., 5% -> 25% -> 100%).

---

## H) Validation / Testing Checklist

Run on physical Android devices (minimum 2 OS versions):

- [ ] Fresh install and app launch
- [ ] Login/OTP flow
- [ ] API connectivity for all major screens
- [ ] Socket/realtime behavior
- [ ] Notifications permission + delivery
- [ ] Location permissions + map/location-dependent actions
- [ ] Foreground/background transitions
- [ ] Upgrade from older build
- [ ] Crash smoke test and recovery behavior
- [ ] No debug UI/tools exposed in release

---

## I) Known Technical Notes and Risks

- OTA updates require correct Expo project UUIDs in `eas-project.json`.
- JDK 25 caused build/plugin failures in this project; use JDK 22.
- Driver app has `newArchEnabled=false` for release stability.
- Windows long paths can trigger CMake/Ninja errors (`build.ninja still dirty`); use short build root.
- Current signing passwords in repo are not production-grade; rotate before public release.

---

## J) Final Deployment Checklist

### Required files to verify before production

- `apps/user-app/eas-project.json` (real user UUID)
- `apps/driver-app/eas-project.json` (real driver UUID)
- `apps/user-app/.env.production` (real production endpoints)
- `apps/driver-app/.env.production` (real production endpoints)
- keystore files and secure credentials available to deployment engineer

### Required commands

```powershell
corepack enable
pnpm install
pnpm run build:user:aab
pnpm run build:driver:aab
```

### Final must-verify points

- [ ] AAB builds succeed with `NODE_ENV=production`
- [ ] `jarsigner -verify` passes for both AABs
- [ ] `bundletool build-apks --mode=universal` succeeds
- [ ] `apksigner verify` passes for universal APKs (v2/v3 true)
- [ ] Manifest shows `allowBackup="false"`
- [ ] No placeholder or localhost values remain
- [ ] Play internal test rollout passes before production

---

## Appendix: Useful verification commands

```powershell
# AAB signature verification
"C:\Program Files\Java\jdk-22\bin\jarsigner.exe" -verify -verbose -certs apps/user-app/android/app/build/outputs/bundle/release/app-release.aab
"C:\Program Files\Java\jdk-22\bin\jarsigner.exe" -verify -verbose -certs apps/driver-app/android/app/build/outputs/bundle/release/app-release.aab

# SHA256
Get-FileHash apps/user-app/android/app/build/outputs/bundle/release/app-release.aab -Algorithm SHA256
Get-FileHash apps/driver-app/android/app/build/outputs/bundle/release/app-release.aab -Algorithm SHA256
```

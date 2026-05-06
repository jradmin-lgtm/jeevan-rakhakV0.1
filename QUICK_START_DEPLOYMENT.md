# Quick Start Deployment

## 1) Prerequisites

- JDK 22
- Android SDK 35 + NDK 27.1.12297006
- Node 20+ and pnpm

## 2) Configure before build

Update real Expo project IDs:

- `apps/user-app/eas-project.json`
- `apps/driver-app/eas-project.json`

Create production env files from templates:

- `apps/user-app/.env.production.example` -> `apps/user-app/.env.production`
- `apps/driver-app/.env.production.example` -> `apps/driver-app/.env.production`

## 3) Build commands

```powershell
corepack enable
pnpm install
pnpm run build:user:aab
pnpm run build:driver:aab
```

## 4) AAB locations

- `apps/user-app/android/app/build/outputs/bundle/release/app-release.aab`
- `apps/driver-app/android/app/build/outputs/bundle/release/app-release.aab`

## 5) Verify quickly

```powershell
"C:\Program Files\Java\jdk-22\bin\jarsigner.exe" -verify apps/user-app/android/app/build/outputs/bundle/release/app-release.aab
"C:\Program Files\Java\jdk-22\bin\jarsigner.exe" -verify apps/driver-app/android/app/build/outputs/bundle/release/app-release.aab
```

## 6) Google Play upload

1. Upload both AABs to Internal testing
2. Validate smoke tests on physical devices
3. Promote to Closed testing
4. Roll out to Production in phases

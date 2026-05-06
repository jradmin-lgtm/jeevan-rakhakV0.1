# Deployment Readiness Guide

This project now has baseline deployment configs for:

- `apps/user-app` -> Android Play Store via Expo EAS
- `apps/driver-app` -> Android Play Store via Expo EAS
- `apps/admin-web` -> free hosting on Vercel

## 1) User App and Driver App (Play Store)

### Config added

- `app.json` with Android package ID, runtime version policy, permissions, and EAS project placeholders.
- `eas.json` with `preview` and `production` build profiles.
- package scripts:
  - `build:preview`
  - `build:production`
  - `submit:production`

### Required pre-deploy setup

1. Replace placeholder EAS project IDs in both app `app.json` files.
2. Replace placeholder API base URL in both app `app.json` files.
3. Generate production app icons, adaptive icon, splash image.
4. Configure Firebase and notifications for each app package.
5. Ensure backend production URL, SSL, and CORS are ready.
6. Create Play Console apps for both package IDs.

### Build and submit commands

Run from each app directory (`apps/user-app`, `apps/driver-app`):

- `npm run build:preview` -> internal APK testing
- `npm run build:production` -> AAB for Play Store
- `npm run submit:production` -> submit to internal track

## 2) Admin Web (Free hosting)

### Recommended free hosting

- Vercel Hobby plan

### Config added

- `apps/admin-web/vercel.json`

### Vercel project setup

1. Import Git repo in Vercel.
2. Set root directory to `apps/admin-web`.
3. Framework: Next.js (auto-detected).
4. Set environment variables in Vercel dashboard.
5. Deploy from `main` or selected branch.

## 3) Required Inputs From Founder/Team

These are mandatory to complete production deployment:

### Platform and accounts

- Expo account (owner access).
- Google Play Console owner access (for both apps).
- Vercel account/team access.

### App identifiers and branding

- Final app display names.
- Final Android package IDs (if different from current).
- App icons (512x512), adaptive icon layers, splash images, feature graphic.
- Privacy policy URL and support email.

### Backend and API

- Production API base URL.
- API auth token strategy and refresh policy confirmation.
- WebSocket production URL.
- Allowed CORS origins for admin and mobile.

### Auth, OTP, and communication

- OTP provider credentials (MSG91/Twilio/etc).
- Sender IDs/templates (India DLT compliant).
- Emergency support hotline number.

### Maps and location

- Google Maps API keys (Android SDK, Directions, Geocoding/Places as needed).
- Allowed package SHA-1/SHA-256 fingerprints for Android API key restrictions.

### Notifications

- Firebase project (or two separate projects) credentials.
- FCM server key / service account JSON for backend push dispatch.

### Payments

- Razorpay `KEY_ID` and `KEY_SECRET`.
- Webhook secret.
- Settlement bank account details and payout process owner.

### Compliance and legal

- Terms of service URL.
- Privacy policy URL.
- Data retention and deletion policy.
- KYC policy text for driver onboarding.

### Monitoring and analytics

- Sentry DSN and project names.
- Optional analytics provider keys.

## 4) Release Gate Checklist (must pass before production)

- Successful preview build install on at least 3 Android devices.
- OTP, booking, driver accept, live tracking, payment flow validated end-to-end.
- Crash-free smoke test run.
- Play Store listing assets uploaded and review questionnaire complete.
- Admin web deployment with HTTPS and env vars verified.

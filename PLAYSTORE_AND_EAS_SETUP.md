# Play Store + EAS Setup — Pilot launch checklist

This file is for the teammate who owns the **Play Store account and Expo (EAS) account** that will publish Jeevan Rakshak. Most of the per-app code is already wired; the items below are the credentials and accounts that have to be created or pasted in.

> Fill the `REPLACE_*` slots below as you go. **Do not commit your real values.** Use this file as a worksheet; the secrets go into Vercel / Render / EAS secret stores, not into git.

---

## A. Accounts you need

| Account | Owned by | Cost | Purpose |
|---|---|---|---|
| Google Play Console developer | TEAMMATE'S existing Play Store account | already paid | Hosts both app listings (com.jeevanrakshak.user + com.jeevanrakshak.driver) |
| Expo / EAS | TEAMMATE (or shared team account) | free tier | Builds the AAB; manages signing keystore + Play submission |
| GitHub | Already done — `jradmin-lgtm` | free | Code hosting |
| Vercel | New team account | free hobby tier | Hosts admin-web + the `/privacy` policy page |
| Render / Fly / Railway / Cloud Run | New team account | ~$5–15/mo per service | Hosts api-server + socket-server + worker-jobs |
| Managed Postgres (Neon / Supabase) | New team account | free for pilot | Persistent storage |

---

## B. Where each credential goes

### B.1 Expo Project IDs

After running `eas login` and `eas init` in each app, you get two Expo project IDs (UUIDs). Paste them here, then commit them:

- File: `apps/user-app/eas-project.json`
  ```json
  { "expoProjectId": "REPLACE_WITH_USER_APP_PROJECT_ID" }
  ```
- File: `apps/driver-app/eas-project.json`
  ```json
  { "expoProjectId": "REPLACE_WITH_DRIVER_APP_PROJECT_ID" }
  ```

The OTA-update URLs in `apps/*/app.json` (`updates.url`) currently reference `REPLACE_USER_EAS_PROJECT_ID` / `REPLACE_DRIVER_EAS_PROJECT_ID` — replace those with the same UUIDs after `eas init`.

> **Currently** `eas-project.json` for both apps contains a placeholder UUID committed to git. Overwrite it with the real one after `eas init`.

### B.2 Play Store signing keystore

You have two clean ways. Pick one and stick with it.

**Option 1 — EAS-managed keystore (recommended).** Expo generates and stores the upload keystore for you, encrypted at rest. Zero local-machine state.
```bash
cd apps/user-app
eas credentials
# choose: Android → set up an upload keystore → "Generate new keystore"
# repeat in apps/driver-app
```

**Option 2 — Reuse your teammate's existing keystore** (if they already publish other apps on Play). They export the keystore as a `.jks` file + give you the alias + passwords. You upload them via `eas credentials`:
```bash
cd apps/user-app
eas credentials
# choose: Android → upload keystore → point at the .jks file
```

⚠️ **The keystore is one-way.** Whichever you pick for the **first** Play Store upload becomes the only key allowed to sign updates forever. There is no rotation without filing a support ticket with Google.

### B.3 Play Console service account (for `eas submit`)

This lets `eas submit` upload AABs to Play Console automatically.

1. In Play Console → Setup → API access → Create a new Google service account in GCP → grant it "Release manager" on this Play Console developer profile.
2. Download the JSON key file from GCP IAM. Save it as `playstore-service-account.json` outside the repo (e.g. `~/.jr-secrets/`).
3. Upload to EAS once per app:
   ```bash
   cd apps/user-app
   eas credentials
   # choose: Android → submit → upload service-account JSON
   ```

Do not commit the JSON.

### B.4 Backend secrets

All listed in `.env.production.example` at the repo root. Paste the actual values into your hosting platform's secret manager — Render / Fly / Railway / Vercel — never into git. Required:

- `JWT_SECRET`, `INTERNAL_API_SECRET`, `ADMIN_API_KEY` — each `openssl rand -hex 48`
- `DATABASE_URL` — managed Postgres connection string
- `CORS_ALLOWED_ORIGINS` — the admin domain
- `FLAG_PILOT_BYPASS_OTP=true` for pilot staging; `false` in real production

### B.5 Mobile-app build-time env

`apps/user-app/.env.production` and `apps/driver-app/.env.production` (each copied from `.env.production.example`). Set:

- `EXPO_PUBLIC_API_BASE_URL=https://api.<your-domain>`
- `EXPO_PUBLIC_SOCKET_BASE_URL=wss://socket.<your-domain>`
- `EXPO_PUBLIC_PRIVACY_POLICY_URL=https://<admin-domain>/privacy`

These get baked into the AAB at build time — they cannot be changed without rebuilding.

---

## C. Build + ship the AAB

Two paths.

### Path 1 — EAS Build (cloud, simplest, no Android Studio)

```bash
cd apps/user-app
eas build --profile production --platform android       # → AAB URL emailed
eas submit  --profile production --platform android     # uploads to Play Console internal track

cd ../driver-app
eas build --profile production --platform android
eas submit  --profile production --platform android
```

The default `eas.json` already declares `"buildType": "app-bundle"` and `"track": "internal"` — submissions land on **Internal Testing** by default. Promote to Production via Play Console when you're ready.

### Path 2 — Local AAB (uses the Gradle build that was failing)

```bash
# From the repo root, cross-platform (works on macOS, Linux, Windows):
pnpm install
pnpm run build:user:aab          # → apps/user-app/android/app/build/outputs/bundle/release/app-release.aab
pnpm run build:driver:aab        # → apps/driver-app/android/app/build/outputs/bundle/release/app-release.aab
```

Then upload both AABs to Play Console manually.

> **About the "Cannot run program 'node'" error** that hit your teammate in Android Studio: the gradle files have been patched to auto-resolve node from `/opt/homebrew/bin/node`, `/usr/local/bin/node`, `/usr/bin/node`, `$NODE_BINARY`, and `gradle.properties → NODE_BINARY`. If your teammate is on Windows or has node installed in a non-standard path, they should set `NODE_BINARY=C:/path/to/node.exe` (or whatever) in `apps/*/android/gradle.properties` — instructions are at the bottom of that file.
>
> If they prefer to skip the gradle headache entirely, **use EAS Build (Path 1)** — Expo's cloud builders have a clean environment with node pre-installed.

---

## D. Play Store listing fields you still need to fill

These live in the Play Console listing for each app — they can't be set from code. Reuse the policy you wrote at `/privacy` and the icons in `apps/*/assets/`.

| Field | Source / placeholder |
|---|---|
| App name | "Jeevan Rakshak" (user) / "Jeevan Rakshak Driver" (driver) |
| Short description (80 char) | "REPLACE: 1-line about emergency ambulance booking" |
| Full description (4000 char) | "REPLACE: paragraph about the service" |
| App icon | `apps/user-app/assets/icon.png` (or upload a 512×512 export) |
| Feature graphic (1024×500) | TODO — designer to provide |
| Phone screenshots (≥ 2, ≥ 320 px) | TODO — capture from running APK |
| Privacy policy URL | The hosted `/privacy` URL (same as `EXPO_PUBLIC_PRIVACY_POLICY_URL`) |
| Content rating questionnaire | Answer in Play Console — categorise as Medical/Health |
| Data safety form | Declare what's listed in `/privacy` §2 (phone, location fg+bg, KYC docs, payment-method, emergency contacts) |
| App category | Medical |
| Contact email | REPLACE_WITH_TEAM_EMAIL |
| Pricing | Free |
| Target audience | Adults 18+ |

---

## E. First Play Store submission — go/no-go checklist

Before clicking **Submit for review** on Internal Testing:

- [ ] `eas-project.json` has real Expo project IDs (not placeholders)
- [ ] `app.json` `updates.url` references the real project IDs
- [ ] `apps/*/.env.production` filled with real backend URLs + privacy URL
- [ ] Backend secrets (JWT/admin/internal/DB) in host secret manager
- [ ] `FLAG_DEMO_BYPASS=false` in backend prod env
- [ ] `FLAG_PILOT_BYPASS_OTP` decided (true for closed pilot, false for public)
- [ ] Migrations run against prod DB (`pnpm --filter @jr/db migrate`)
- [ ] `/health` and `/health/db` return ok against the live api-server URL
- [ ] `/privacy` URL loads publicly (no admin gate)
- [ ] Both AABs built (Path 1 or Path 2)
- [ ] Play Console: privacy policy URL pasted, Data Safety form done, content rating done
- [ ] Internal testers added in Play Console (email addresses)

---

## F. After Internal Testing → Production

1. Pilot for 30 days on Internal Testing track.
2. Watch `admin.<your-domain>` for bookings + driver activity.
3. When ready: in Play Console, promote each release from Internal Testing → Production. Phased rollout 10% → 50% → 100% over a week.
4. Before that promotion, flip backend env: `FLAG_PILOT_BYPASS_OTP=false`, `FLAG_DEMO_BYPASS=false`, switch `SMS_PROVIDER` to `msg91` and paste the DLT-approved keys. No mobile rebuild needed — these are server-side switches.

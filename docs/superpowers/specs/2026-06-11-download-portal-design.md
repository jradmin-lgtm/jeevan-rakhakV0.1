# Jeevan Rakshak — public download portal + install analytics (2026-06-11)

## Goal
A public, motion-graphics landing page that lets people download the **user** or **driver** APK (sideload), **gated behind a mobile/email capture** (no anonymous downloads), with downloads + visits logged and surfaced in the **admin dashboard** ("App Installs" tab). Parallel distribution channel to Google Play.

## Architecture (reuses existing stack — no new host)
- **Page:** new PUBLIC route in admin-web → `GET /get` (added to `middleware.ts` PUBLIC_PATHS, like `/privacy`). Hosted on the same Vercel `jr-admin`. URL is shareable; a QR can be generated from it later (not built into the page now).
- **Backend:** api-server (Fastify, Render) gains a Drive module + public endpoints. APK bytes are streamed **through the server via the Drive SA** (files stay private = true gate).
- **Drive:** SA `jeevan-rakshak@jeevan-rakshak-d3f52` (key `release/drive-sa.json`; on Render = env `DRIVE_SA_JSON`). Folder (Shared Drive) `0AMCAe2CcITBfUk9PVA` = `PUBLIC APK`. Latest APK per app resolved by name prefix `jeevan-rakshak-{user,driver}-*.apk`, newest `modifiedTime`.

## Data flow (gated download)
1. Visitor opens `/get` → page POSTs `/api/v1/dl/visit {app?}` (fire-and-forget visit log).
2. Taps **User** or **Driver** → form: mobile **or** email (one required, validated).
3. Submit → `POST /api/v1/dl/:app {contact}` → insert `app_events` row (type `download`, status `requested`, app, contact, ip, ua, token=uuid) → returns `{token}`.
4. Page navigates to `GET /api/v1/dl/:app/file?token=<uuid>` → validates token (exists, <15 min, not consumed) → SA resolves latest APK → **streams** it (`Content-Disposition: attachment`) from Drive (`files.get?alt=media&supportsAllDrives=true`) → marks row `downloaded`.
   - Bad/expired/used token → 410. No token → can't download (no anonymous access; files are not public-link).

## DB — `app_events` (fail-loud migration in api-server `main.ts`, per §0-OPS)
`id uuid pk · type text ('visit'|'download') · app text|null · contact text|null · token text|null · status text|null ('requested'|'downloaded') · ip text|null · user_agent text|null · created_at timestamptz default now() · completed_at timestamptz|null`
Index on (type, created_at) and (token).

## Endpoints (api-server)
- `POST /api/v1/dl/visit` (public) — log a visit.
- `POST /api/v1/dl/:app` (public, app∈{user,driver}) — validate contact, log download-request, return token.
- `GET  /api/v1/dl/:app/file?token=` (public) — validate token, stream APK via SA, mark downloaded.
- `GET  /api/v1/admin/app-events` (admin-key) — aggregates: visits, downloads/app, recent downloads (contact+app+time), downloads→signup funnel (match contact to users.phone/email or drivers.phone/email).

## Admin "App Installs" tab (admin-web (admin) group)
New nav item → fetches `/admin/app-events` via `/api/proxy`. Shows: total visits, downloads per app, recent download log (contact · app · time · matched-signup?), and the funnel (downloads → matched signups).

## Page UX (motion-graphics, dark theme — frontend-design)
Hero ("Jeevan Rakshak — an ambulance, on demand"), two cards (User / Driver) each: app icon, one-liner, "Download" → opens the contact form inline → triggers the gated download. A short "sideload" note ("Android only · allow install from unknown sources") + "We use your number only to share the app + updates". No QR in the page.

## Security / privacy / risk
- Files are NOT public-link; only the SA reads them → download requires a server-issued token → no anonymous downloads.
- Contact is PII → covered by `/privacy`; add the one-line notice on the form.
- `DRIVE_SA_JSON` only in Render env + gitignored local file. Admin endpoint behind `x-admin-key` (existing pattern).
- Deploys to prod: Vercel (admin-web) + Render (api-server) + migration. Audit gate + ask before push. Render free-tier cold-start adds a few-seconds delay on first download (acceptable for pilot; persistent server, so the 60 MB stream completes).
- APKs served are debug-signed v2.0.x — fine for sideload; page states it.

## Non-goals (v1)
QR in-page (later), per-download cryptographic DRM, production-grade rate limiting beyond basic, multi-region CDN.

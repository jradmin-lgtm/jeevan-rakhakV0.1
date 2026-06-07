# Jeevan Rakshak — In-Ride Safety Alert (Panic) Feature — Design Spec

**Date:** 2026-06-07
**Version target:** v1.3.0 (new feature, not a patch)
**Author:** Design via brainstorming skill; approved by user ("yes make it")

---

## 1. Problem & Intent

Riders and drivers need a **safety net during an ongoing ride** for situations the existing
flows do not cover: a fight, harassment, an accident, a breakdown, or any threat. This is a
**panic / duress alert**, distinct from:

- the **patient SOS booking** (`bookings.isSos` + the cascade dispatch engine) — that is "I need
  an ambulance", a dispatch event; and
- the **helpdesk** (`support_tickets`) — that is asynchronous chat with ops.

A safety alert is a **time-critical, location-bearing "all hands near here" event**. On press it
must:

1. Raise a **high-priority alert to admin** (loud, impossible to miss).
2. **Ping nearby available drivers** with the raiser's live location so the nearest can rush to help.
3. **Not** notify the co-rider on the ride (the threat may be the other party).
4. Also surface **in-ride Help & Support** (call ops / gynae / email) one tap away.

### Locked UX decisions (from brainstorming)

- **Trigger:** tap the button → confirm dialog ("Send a safety alert now?" / [Cancel] [Send alert]) → send.
- **Reaches:** admin (top priority) + nearby *available* drivers with the raiser's live location.
  **Not** the co-rider.
- **Placement:** pinned at the **bottom of the live ride screen** in BOTH apps (user-app
  `LiveTrackingScreen`, driver-app `TripScreen`), visible only while the ride is active
  (`ACCEPTED` / `ARRIVED` / `PICKED_UP`). In-ride Help & Support sits next to it.
- **Priority:** treated as high priority by default everywhere.

---

## 2. Architecture (chosen approach)

**Dedicated `safety_alerts` entity + one-shot geo-broadcast.** A safety alert is purpose-built:
its own table, a **one-shot** push + socket fan-out to every available driver within a radius
(reusing the SOS engine's geo/eligibility logic but with **no cascade waves** — everyone nearby is
pinged at once), a loud dedicated admin surface, drivers can tap "I'm responding", and the raiser
can stand it down.

**Rejected alternatives:** (a) reusing `support_tickets` (conflates a real-time duress event with
async chat); (b) reusing the SOS cascade engine (one-driver-at-a-time hand-off is wrong for "alert
everyone nearby now"); (c) admin-only with no driver fan-out (drops the "nearest driver gets
signalled to help" requirement).

**Blast radius:** additive only.
- `socket-server`: **no change** — `/internal/emit-to-driver` already forwards arbitrary events.
- Admin realtime: **no new socket** — uses the existing tight-interval polling model (badge/banner
  poll a count endpoint; list/detail poll like the support pages).
- No existing flow (SOS, booking lifecycle, helpdesk) is touched.

---

## 3. Data Model (`packages/db/src/schema.ts`)

Mirror the `supportTickets` / `supportTicketMessages` definition style (text status columns,
`defaultRandom()` UUID PKs, `timestamp` defaults, FK `ON DELETE SET NULL` / `CASCADE`).

### `safetyAlerts` (table `safety_alerts`)

| column | type | notes |
|---|---|---|
| `id` | uuid PK `defaultRandom()` | |
| `bookingId` | uuid FK → bookings.id `ON DELETE SET NULL` | the active ride; required at insert |
| `displayId` | text | **snapshot** of the booking's `#1000xx` (locked id everywhere) |
| `raiserRole` | text NOT NULL | `'USER'` \| `'DRIVER'` |
| `raiserUserId` | uuid FK → users.id `ON DELETE SET NULL`, nullable | set when raiserRole = USER |
| `raiserDriverId` | uuid FK → drivers.id `ON DELETE SET NULL`, nullable | set when raiserRole = DRIVER |
| `lat` | doublePrecision NOT NULL | raiser's last-known location at raise |
| `lng` | doublePrecision NOT NULL | |
| `note` | text, nullable | optional; reserved (no text entry under duress in v1) |
| `notifiedDriverIds` | jsonb NOT NULL default `'[]'` | string[] of driver ids pinged on raise — used to clear their cards on resolve/cancel |
| `status` | text NOT NULL default `'ACTIVE'` | `'ACTIVE'` \| `'RESOLVED'` \| `'CANCELLED'` |
| `resolvedBy` | text, nullable | admin operator name who closed it |
| `resolvedAt` | timestamp, nullable | |
| `cancelledAt` | timestamp, nullable | set when raiser stands down |
| `createdAt` | timestamp NOT NULL default `now()` | |
| `updatedAt` | timestamp NOT NULL default `now()` | |

Indexes: `statusIdx` on `status`, `bookingIdx` on `booking_id`, `createdIdx` on `created_at`.

### `safetyAlertAcks` (table `safety_alert_acks`)

| column | type | notes |
|---|---|---|
| `id` | uuid PK `defaultRandom()` | |
| `alertId` | uuid FK → safety_alerts.id `ON DELETE CASCADE` NOT NULL | |
| `driverId` | uuid FK → drivers.id `ON DELETE CASCADE` NOT NULL | |
| `lat` | doublePrecision, nullable | responder's location at ack |
| `lng` | doublePrecision, nullable | |
| `respondedAt` | timestamp NOT NULL default `now()` | |

Indexes: `alertIdx` on `alert_id`; **UNIQUE(alert_id, driver_id)** (one ack row per driver; ack is idempotent via `onConflictDoUpdate`).

Export drizzle types `SafetyAlert` / `NewSafetyAlert`, `SafetyAlertAck`.

### DDL (`services/api-server/src/main.ts` bootstrap block)

Add `CREATE TABLE IF NOT EXISTS safety_alerts (...)` + `safety_alert_acks (...)` + the three
indexes, in the existing fail-loud try/catch (`process.exit(1)` on failure). Additive, idempotent.

---

## 4. Backend (`services/api-server`)

New route file `src/routes/safety.ts`, registered in `main.ts` via `registerSafetyRoutes(app)`
after the existing registrations. Reuse drizzle (`db`, `safetyAlerts`, `safetyAlertAcks`,
`bookings`, `drivers`), `config`, the push helpers, and the socket HTTP bridge.

### New env vars (read with the `?? default` idiom; set on Render at deploy)

- `SAFETY_NEARBY_RADIUS_KM` (default `5`)
- `SAFETY_MAX_RESPONDERS` (default `10`)

### Geo helper `getSafetyResponders(lat, lng, excludeDriverIds)`

New function (in `safety.ts`, or exported from `sos-cascade.ts` if it cleanly factors out — prefer
a local copy that calls the same eligibility query to avoid coupling). Logic mirrors
`getEligibleDrivers`:

1. Candidate drivers: `status = 'AVAILABLE'` AND `disabled = false` AND `kyc_verified = true`,
   LEFT JOIN `driver_heartbeats`.
2. Position: recent heartbeat (within `SOS_CASCADE_STALENESS_MIN`) else `drivers.lastLat/lastLng`
   if recent, else skip.
3. Haversine distance to `(lat, lng)`; exclude any id in `excludeDriverIds`.
4. Sort ascending. Take those within `SAFETY_NEARBY_RADIUS_KM`.
5. **Fail-open:** if zero within radius, widen to the nearest `SAFETY_MAX_RESPONDERS` available
   drivers regardless of radius (so help is never withheld). Cap result at `SAFETY_MAX_RESPONDERS`.

### Endpoints

**`POST /api/v1/safety/raise`** — `preHandler: authenticate`; role `user` OR `driver`.
- Zod body: `{ bookingId: uuid, lat: number, lng: number, note?: string }`.
- Load booking. Reject `404 booking_not_found` if missing.
- Reject `409 ride_not_active` unless `status ∈ {ACCEPTED, ARRIVED, PICKED_UP}`.
- Authz: reject `403 not_your_ride` unless (`role==user` && `booking.userId==sub`) or
  (`role==driver` && `booking.driverId==sub`).
- **Idempotency:** if an `ACTIVE` alert already exists for this `bookingId` + same raiser, return it
  (do not create a duplicate, do not re-fan-out).
- Insert alert: snapshot `displayId` from booking; set `raiserRole`/`raiserUserId`/`raiserDriverId`.
- Fan-out (one-shot): `excludeDriverIds = [booking.driverId, (raiser driver if any)]`;
  `responders = getSafetyResponders(lat, lng, excludeDriverIds)`. For each responder:
  - `pushToDriver(driverId, "🆘 Safety alert nearby", "Ride #<displayId> needs help nearby. Tap to assist.", { type: "safety", alertId, bookingId, lat: String(lat), lng: String(lng) })` (high priority via `sendPush`).
  - socket: emit `safety:alert` to that driver via the `/internal/emit-to-driver` bridge, payload
    `{ alertId, bookingId, displayId, lat, lng, distanceKm, createdAt }`.
  - Persist `notifiedDriverIds` = the responder id list on the alert row.
- Return `{ alert, notified: responders.length }`.

**`POST /api/v1/safety/:id/ack`** — `authenticate`; role `driver`.
- Body (optional): `{ lat?, lng? }`. Upsert into `safety_alert_acks` (UNIQUE alert+driver,
  `onConflictDoUpdate` the position + `respondedAt`). Reject `404` if alert missing,
  `409 alert_not_active` if not ACTIVE. Return `{ ok: true }`.

**`POST /api/v1/safety/:id/cancel`** — `authenticate`; role `user` OR `driver`.
- Authz: only the raiser may cancel (match `raiserUserId`/`raiserDriverId` to `sub`+role).
- Set `status='CANCELLED'`, `cancelledAt=now()`. Clear responder cards: for each id in
  `notifiedDriverIds`, emit `safety:cleared` (`{ alertId }`) via the bridge and
  `dismissPushToDriver(driverId, alertId)`. Return `{ ok: true }`.

**`GET /api/v1/driver/safety-active`** — `authenticate`; role `driver`. **Poll fallback** (socket
can miss; the SOS poll-fallback lesson). Returns `ACTIVE` alerts whose `notifiedDriverIds` contains
this driver and who have not acked-then-resolved, each with `{ id, bookingId, displayId, lat, lng,
createdAt, acked: bool }`. Driver app polls on its existing 8s tick.

**`GET /api/v1/admin/safety?status=active|all`** — `requireAdminKey`. Returns alerts newest-first,
each joined with: raiser display name (user or driver), `displayId`, `lat`/`lng`, `status`,
timestamps, `resolvedBy`, and the responder list (driver name + `respondedAt`) from
`safety_alert_acks`. Default `status=active`.

**`GET /api/v1/admin/safety/count`** — `requireAdminKey`. Returns `{ active: <int> }` for the
badge + banner. Lightweight.

**`POST /api/v1/admin/safety/:id/resolve`** — `requireAdminKey`. Body `{ resolvedBy: string }`.
Reject `400 resolver_name_required` if `resolvedBy.trim().length < 2`. Set `status='RESOLVED'`,
`resolvedBy`, `resolvedAt=now()`. Clear responder cards (same as cancel: `safety:cleared` +
`dismissPushToDriver` over `notifiedDriverIds`). Return `{ ok: true }`.

All error responses follow the `{ error: "snake_code" }` convention. No em-dash / no double-hyphen
in any string.

---

## 5. Shared UI (`packages/ui`)

**`EmergencyBar.tsx`** — presentational, pinned-bottom bar. Props:

```
type Props = {
  active: boolean;            // an alert is currently raised by this device
  busy?: boolean;            // request in flight
  onEmergency: () => void;   // screen wires confirm + raise
  onHelp: () => void;        // screen opens the Help & Support sheet
  onStandDown?: () => void;  // visible when active
};
```

- Idle: a row with `[🆘 Emergency]` (`Button variant="danger"`, prominent) + `[Help & Support]`
  (`variant="outline"`). Uses `colors.danger`, `space`, `radius` tokens; `Text` for labels.
- Active: shows "Safety alert active. Help is being notified." + a "I am safe (stand down)" action
  wired to `onStandDown`. (No em-dash / double-hyphen; "I am safe", not "I'm safe" is fine either way —
  just no `--`/`—`.)
- Export from `packages/ui` index.

Reuse existing `ContactSupport` (already mapped) for the Help sheet content — no change to it.

---

## 6. User App (`apps/user-app`)

- **API** (`src/api.ts`): add `safety = { raise(bookingId, lat, lng), cancel(alertId) }` following
  the existing `bookings.*` method style (the `api()` wrapper auto-attaches the bearer token).
- **`LiveTrackingScreen.tsx`**: render `<EmergencyBar />` pinned at the bottom, gated by
  `!finished` (active ride). Keep the existing "NEED HELP?" `ContactSupport` card.
  - `onEmergency`: `Alert.alert("Send a safety alert now?", "Your location will be shared with nearby drivers and our team so help can reach you.", [{text:"Cancel"}, {text:"Send alert", style:"destructive", onPress: raise}])`.
  - `raise`: capture GPS via `expo-location` `getCurrentPositionAsync` (fallback
    `getLastKnownPositionAsync`, final fallback `booking.pickupLat/pickupLng`); request permission
    if not granted; `POST safety.raise`; on success set `active=true` + store `alertId`; toast
    "Safety alert sent. Help is being notified."
  - `onStandDown`: `safety.cancel(alertId)` → `active=false`.
  - `onHelp`: open a modal/sheet containing `<ContactSupport variant="user" bookingId={booking.id} />`.
  - Listen for `safety:cleared` on the booking socket to reset `active` if admin resolves it.

- **`app.json` + `android/app/build.gradle`**: version `1.3.0`; `versionCode` = current + 1 (read
  actual current value at build; keep app.json and gradle in sync).

## 7. Driver App (`apps/driver-app`)

- **API** (`src/api.ts`): add `safety = { raise(bookingId, lat, lng), ack(alertId, lat?, lng?), cancel(alertId), active() }`.
- **`TripScreen.tsx`** (raiser side, same as user app): `<EmergencyBar />` pinned bottom, gated by
  `!finished`. `onEmergency` confirm + raise using `myPos` (the 5s GPS ticker already in this
  screen; fallback to a fresh `Location.getCurrentPositionAsync`). `onStandDown` cancels.
  `onHelp` opens `<ContactSupport variant="driver" />`. Keep existing help card.
- **`DashboardScreen.tsx`** (responder side):
  - State: `safetyAlerts` map (mirror the `requests` map pattern; never wholesale-replace).
  - Socket: subscribe to `safety:alert` (merge into map) and `safety:cleared` (remove by alertId),
    in the existing `available`-gated socket effect, with cleanup on unmount.
  - Poll fallback: on the existing 8s tick, call `safety.active()` and reconcile into the map
    **only on `res.ok`** (keep-last-good), honoring session dismissals.
  - Render `<SafetyAlertCard />` (new component, mirror `IncomingRequestList` row / `SosIncomingModal`
    styling, but a banner-style card, not a full-screen flash): "🆘 Safety alert nearby · ride
    #displayId" + distance + `[Open in Maps]` (Google Maps deep link to lat/lng) + `[I am responding]`
    (`safety.ack`) + a dismiss (session-local). On ack, show "Responding" state.
  - Foreground push: in `push.ts`, route `data.type === "safety"` to surface the card (do not treat
    as a `dismiss` message).
- **`app.json` + `android/app/build.gradle`**: version `1.3.0`; `versionCode` = current + 1.

## 8. Admin Web (`apps/admin-web`)

Mirror the support-ticket surface exactly (the explored patterns). All admin calls go through
`/api/proxy` (the admin key stays server-side; never in the client bundle). **Not** added to the
`(hospital)` group.

- **`(admin)/SafetyNavBadge.tsx`** — mirror `SupportNavBadge`: poll `/api/v1/admin/safety/count`
  every ~8s, `if (!res.ok) return;` keep-last-good, red `#DC2626` count pill. Nav label
  "Safety Alerts" → `/safety-alerts`.
- **`(admin)/layout.tsx`** — add the nav entry (after `/alerts`, before the support badge) and a
  **persistent red top banner** client component rendered inside `<main>` before `{children}`:
  polls the count every ~8s; when `active > 0` shows a sticky full-width `#DC2626` banner "N active
  safety alert(s) — open" linking to `/safety-alerts`. Hidden when zero. (Banner copy uses a
  hyphen/period, no em-dash.)
- **`(admin)/safety-alerts/page.tsx`** + **`SafetyAlertsClient.tsx`** — mirror `SupportTicketsList`:
  10s poll, `mutatingRef`, `loadError` flag, newest-first, status filter chips (Active / Resolved /
  Cancelled / All). Each row: `#displayId` (linked to the ride), raiser (name + role badge),
  status chip, responder count, age. Click → detail.
- **`(admin)/safety-alerts/[id]/page.tsx`** + **`SafetyAlertDetailLive.tsx`** — mirror
  `TicketDetailLive`: live poll (10s); show raiser, ride `#displayId`, a **map link**
  (`https://www.google.com/maps?q=<lat>,<lng>`), the responder list (driver name + responded time),
  timestamps; **Mark resolved** modal capturing the resolver name (default from `localStorage`
  operator key, min 2 chars, `resolver_name_required` handling) → `POST /admin/safety/:id/resolve`.

---

## 9. Build & Ship

- Ships as **v1.3.0**. Bump both apps' `app.json` (`version` 1.3.0, `versionCode` current+1) and
  `android/app/build.gradle` (`versionName`/`versionCode`) — keep them in sync; read actual current
  values first (monotonic upgrade).
- `pnpm --filter @jr/api-server typecheck && pnpm check` green.
- Backend: push `prod`, deploy api-server (verify Render commit == HEAD, force-redeploy if it lags),
  set `SAFETY_NEARBY_RADIUS_KM` / `SAFETY_MAX_RESPONDERS` env on Render (defaults are safe if unset).
- admin-web: Vercel deploy (re-point alias after `--prod`). **Ask before push/deploy.**
- Build both APKs locally, sequentially (`JAVA_HOME`/`ANDROID_HOME` as in CONTEXT.md), copy to
  `apks/jeevan-rakshak-{user,driver}-v1.3.0-YYYYMMDD-HHMM.apk`, append `VERSIONS.md` row.

## 10. Audit Gate (CONTEXT.md §0-OPS, run before commit)

1. **Security-leak:** no admin key / JWT / secret in any client bundle; admin calls only via
   `/api/proxy`; new endpoints 401/403 without the right credential.
2. **Full wiring:** every new endpoint, socket event, button, and screen wired end-to-end
   (raise → fan-out → driver card → ack → admin list → resolve → clear).
3. **No regression:** diff touches only safety-feature surfaces; SOS, booking lifecycle, helpdesk,
   hospital portal unchanged; `pnpm check` green; feature-parity preserved on any edited component.
4. **No stale process / timer leak:** every new `setInterval` / socket subscription has
   clear-on-unmount; no alert left `ACTIVE` with no path to resolve; idempotent raise prevents
   duplicate fan-out.

---

## 11. Verification (end-to-end)

1. Typecheck/build green.
2. **Raise (user):** during an active ride, tap Emergency → confirm → alert appears in admin list +
   red banner within ~8s; an available nearby driver gets a push + an in-app card with the ride
   `#displayId` and a working Maps link; the **co-rider is not notified**.
3. **Raise (driver):** same from `TripScreen` using `myPos`.
4. **Respond:** responder taps "I am responding" → admin detail shows the responder + time.
5. **Stand down:** raiser taps "I am safe" → alert CANCELLED; responder cards clear (socket + push).
6. **Admin resolve:** Mark resolved requires a name; alert leaves Active; banner clears at zero;
   responder cards clear.
7. **Poll fallback:** with the socket cold, the responder still gets the card via
   `/driver/safety-active` within ~8s.
8. **Gating:** the Emergency bar is absent on finished/no-ride screens; only active rides show it.
9. **Help & Support:** the in-ride Help button opens call/email options during the ride.
10. **No-regression smoke:** a normal booking and an SOS still work unchanged.

## 12. Open items / risks

- Admin realtime is poll-based (~8s) by design (no admin socket today); acceptable for the pilot and
  consistent with the existing dashboard. A future admin socket could make the banner instant.
- Killed-app push handling on the responder side is best-effort (Android data-message limitation),
  same as the existing dismiss path; the 8s poll heals foreground/warm cases.
- `expo-location` permission on the user app: if denied, the raise falls back to the booking pickup
  coordinates so the feature still works (location just less precise).

---

## Addendum (shipped scope, added during implementation)

Two items were folded into the v1.3.0 ship after the original design above, on user request mid-build:

**A. No-overlap dispatch fix.** A driver already on an active assigned ride (ACCEPTED / ARRIVED /
PICKED_UP) can no longer overlap: the accept handler rejects with `409 driver_on_active_ride`
(race-safe), and `getEligibleDrivers` excludes busy drivers from active SOS dispatch.

**B. Ola/Uber visibility (refinement of A).** A busy driver still SEES waiting requests for
awareness (a passive, read-only "Waiting requests" peek on the trip screen, accept deferred with
"Finish your current ride to accept"), but the full-screen SOS flash and safety responder cards are
suppressed while on a trip (`activeTrip` set optimistically on accept to close the poll-window race).
On completion the driver auto-rejoins the pool; still-open requests become acceptable and any taken
by another driver drop off via the keep-last-good poll. Backend visibility endpoints (`/driver/incoming`,
`/driver/sos-pending`, `/driver/safety-active`) intentionally do NOT exclude busy drivers, so the
authoritative no-overlap guarantee is the accept guard, not hiding visibility.

**Hardening applied from two adversarial-verify passes:** race-safe raise (partial unique index +
INSERT ON CONFLICT DO NOTHING), `safety:cleared` also delivered to the raiser, ride-end auto-resolve
of ACTIVE alerts, admin-resolve status guard, ack restricted to notified drivers, push tray-dismiss
keyed on alertId, and admin `GET /admin/safety` serialized snake_case to match the admin clients.

Shipped: backend `f14b0da` live on Render; admin-web live on Vercel; APKs user vc36 + driver vc38.

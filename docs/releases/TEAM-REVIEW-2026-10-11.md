# Team review release, 11 October 2026

Session started 15:28 IST. Target window ends 17:28 IST. Deployment is authorised, conditional on verification and two independent reviews. This is a candidate, not a live-release claim.

## Source review

Read the complete driver document (4 requests, 5 embedded screenshots) and user document (6 requests, 9 screenshots). Extracted reference material is in the local jr-team-review-20261011/documents evidence folder.

| Ticket | Requirement | Candidate status | Verification |
|---|---|---|---|
| DA-1 | Online indicator and clear availability, retain dark Go online | Implemented | Native availability states and dark Go online verified |
| DA-2 | Driver readability, status colours, icons, request details and actions | Implemented on dashboard, incoming, modal and trip | Native dashboard, request, trip, profile, history and support checked; final modal and accepted-trip overlay retests passed |
| DA-3 | Preserve and recover pending GPS | Owner queues, legacy migration, historical assignment validation, rejected-ride isolation | Queue tests 6/6; historical GPS, deduplication and permission-return checks passed |
| DA-4 | Normal bookings use nearest-driver waves | Persisted timing, offer enforcement, restart and redispatch clock | 20 targeted integration checks, four council race tests, 50 real-ranking creates/offers/accepts passed |
| UA-1 | Circular pulsing home SOS and section hierarchy | Implemented | Native Home and reduced-motion behavior checked; true cold-start large-text pass repeated |
| UA-2 | Red SOS screen and white warning card | Implemented, support call and explicit category retained | Native red SOS, warning, category, back and cancel checked |
| UA-3 | Vertical tinted request cards, distinct icons | Implemented | EN/HI selection and cold-start 320 dp at 130% checked |
| UA-4 | Breathing/Cardiac Emergency card | Implemented, explicit subtype choice approved by user | Subtype choice, routine-selection clearing and disabled confirmation verified |
| UA-5 | Assigned driver phone replaces rating display | Implemented; post-trip rating retained | Phone and dialer handoff checked; finished-ride contact hidden, rating still submits |
| UA-6 | Three boxed Quick actions | Implemented | All three native destinations opened |
| TRACK-1 | Better click tracking | Authenticated allowlisted events, bounded owner queue and deduplication | Three queue tests plus API authentication, shape, role, batch and dedup checks passed |
| VERIFY-1 | Regression, 50 simultaneous rides, upgrade build, two reviewers | In progress | 47 unit tests, 31 lifecycle tests, 50-ride load passed; backend89/100; UI SHIP 87/100 |

## Decisions preserved

Free hosting, existing backend 1,000 km coverage and 100 km display copy, current ops login, stable printed QR, compatible signing identity. Existing Maps key exposure remains an explicitly accepted unresolved risk. Physical Infinix hardware is unavailable. Emulator results cannot prove every vendor's background behaviour.

## Independent review council

Backend reviewer: initial and mid-pass audits identified assignment history, queue deletion, wave enforcement, timestamp migration, late SOS recovery and delivery races. Corrections verified. Final independent verdict: SHIP 89/100.

UI reviewer: both documents and all 14 images reviewed independently. Final independent verdict: SHIP 87/100. Visual quality 8/10. All five native findings corrected and retested.

## Tracking schema

New ui_events stores random event ID, authenticated actor ID and role, allowlisted action name, capture time and server receipt time. No arbitrary properties, text inputs, phone, GPS, medical details or credentials. Batch cap 50, local queue cap 250, authenticated rate limit 30 requests/minute. Dispatch does not wait for analytics. Duplicate retries use the event ID as primary key. Events older than 30 days are acknowledged without ingestion. Retention runs at startup and daily; independent source review passed.

## Publication

Not published. Candidate changes are in codex/jr-apps-221 and copied into the main build checkout only after detecting concurrent edits. APK identity, native journeys, API behaviour, load test, review verdicts and public download hashes must be recorded before marking this release live.

## Additional defects found and fixed during native review

- Emergency expansion clears a previously selected routine category, preventing an OPD request from being confirmed as the wrong visible choice.
- Background location waits for the app to resume after Android Settings; native permission-return test passed.
- OTP now has a full-size accessible input; numeric entry and ride-start control verified.
- Large-text incoming SOS popup gets explicit screen-height bounds and a scrollable detail area with fixed actions. Final native retest passed.
- Accepted-trip navigation immediately records the active ride and prevents hidden-dashboard popups from covering it. Final native retest passed.

## Load evidence

50 active rides and100 sockets over608 seconds:12,100 HTTP 200 responses,6,000 GPS deliveries, no cross-ride data, duplicate rows or reconnect failures.25 reconnects and1,000 offline points passed. HTTP p95 was 1,758ms; GPS delivery p95 was 260ms.

50 distinct Google routes with50 persistent clients all returned ETA,mapconfiguration and landmarks in2,048 ms.50 simultaneous normal booking requests used real Google dispatch ranking and produced50 offers to50 distinctdrivers, with50 successful accepts in5,595 ms. This is isolated local capacity evidence, not a free-host uptime guarantee. An unbounded150fresh-TCP-connection harness hit local resets and is not recorded as passing.

## Migration evidence

Actual isolated PostgreSQL test passed fresh schema without cancellation history, legacy redispatch backfill, repeated migration idempotence and click-table insertion. No production data was used.

Final exact-APK verification: both 2.2.3/build57 artifacts pass signature, runtime, four-architecture, production-endpoint and known-private-secret checks. Android11 replacement installs from56to57 retained a private file marker. Android15 replacement installs reached login. Original Android15 system-app ANR events were retained separately; repeated final startup captures were clear. Authenticated production-session migration and physical Infinix remain unverified.

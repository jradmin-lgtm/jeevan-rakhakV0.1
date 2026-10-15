# October 13 feedback implementation status

Session: 15 October 2026 IST. Source: project JR CHANGES/New_App_Updates requests.docx. Seven requests and eight embedded images reviewed. Current implementation is not published.

## Confirmed decisions

- Admin End trip cancels with a recorded reason. It does not complete the trip or invent payment/refund.
- Reuse existing JR_BOOKING_DELETE_PASSWORD for protected administrative operations, separate from the shared ops login.
- Patient map follows the authenticated ambulance position after verified pickup, labelled Ambulance · patient on board. The original pickup is not labelled as independent live patient GPS. This follows the documented driver-telemetry pattern from Uber guest rides and Ola live cab tracking.
- Free hosting remains pending an explicit new billing decision. User revoked the proposed older-booking deletion: retain all production data. No billing changes or deletion performed.

## Current implementation and evidence

- CR-5: map uses latest snapshot on renderer reload and provider fallback; heartbeat checks, AppState recovery and online event handling added. Existing five map tests plus three recovery/isolation/connectivity tests pass. Native fault testing pending. Physical pilot root cause not yet reproduced.
- CR-7: optional per-point acknowledgement lets valid points sync while retaining rejected fixes; original non-partial contract remains. Sixteen queue tests pass, including malformed partial acknowledgement rejection. API integration verifies partial acknowledgement and assignment enforcement.
- CR-4: duplicate pickup navigation removed after pickup, drop navigation retained.
- CR-6: original pickup marker hidden after pickup when vehicle location exists; shared vehicle marker follows actual driver GPS. Original pickup remains in details/history. Labels added in English/Hindi.
- CR-2: per-driver Accepted/Rejected history uses actor-scoped booking events with durable attempt/legacy assignment fallback, separate from ride outcome.
- CR-3: password-protected operations, strict input, rate limit, idempotency hash, transaction audit, account email confirmation and persistent offline hold implemented. Old user-profile mutation cannot bypass the password gate. Force offline rejects drivers with an active ride until it is resolved explicitly.
- CR-1: native looping playback service and data-only FCM path under versioned capability implemented. Existing app registrations retain original notification delivery. Native Kotlin release compilation passed. Injected service-start failure fallback passed a JVM test with Android stubs; physical audio, background/lock-screen and emulator journey verification remain pending.
- New targeted API integration suite: 38 checks passed locally. Three scheduler tests pass, including idle startup without recurring database queries and recovery of persisted pending expiry.
- New database schema: additive drivers.admin_offline, drivers.push_alert_protocol and durable admin_actions audit table. Migration executed in isolated local clone, not production.

## Live blocker and data inventory

Live deployed commit still dd242cc. Direct connection using current Render DATABASE_URL returns PostgreSQL code 53000: account or project quota exceeded. HTTP health timed out during initial check. Subsequent user dashboard screenshot confirms monthly network transfer exhaustion: 5.54 GB transferred, 64.46 MB storage, 16.45 CU-hours. Reset time remains unverified. No automatic paid-plan change or database replacement is authorized.

A confirmed deployed API code path queried booking expiry every 30 seconds. Replaced locally with persisted-work recovery and scheduled timers that do not query when no normal ride needs expiry. This may reduce idle compute usage, but does not replenish already-consumed quota and is not yet deployed. Socket access checks and legitimate app/portal polling still use the database while clients are connected.

Latest readable production backup: 15 October, 12:03 PM IST. 234 bookings, 4318 GPS points, 12 users, 19 drivers, 129 driver documents. JSON backup 38.47 MB; document binary bytes 27.14 MB. User dashboard subsequently reports 64.46 MB database storage. No explicit demo/test classification found in production snapshot; manual pilot records require team identification. Local isolated database contains 4845 bookings and 124227 GPS points; does not count toward Neon. Private Drive has 342 backups totaling 8.68 GB, separate from Neon storage. Detailed aggregate-only inventory is in JR CHANGES/2026-10-13-New-App-Updates/DATA-INVENTORY-2026-10-15.md.

## Remaining verification

Native Android audio/notification/upgrade checks; map renderer crash, offline/reconnect and OTP phase transitions; portal control interaction; full lifecycle/concurrency regression; independent review; exact production candidate signing/secret scan; final deployment and public download identity checks after live DB access is restored.

All code is in managed worktree /Users/kumar.sh/.codex/worktrees/jr-ended-ride-privacy/jr-prod, branch codex/jr-apps-221. Primary checkout is mirrored only for these application files with backups and keeps unrelated dirty work. Task-local scripts and private runtime configuration are in /tmp/jr-oct15-*. No credentials are embedded here.

## RCA and launch update, 15 October evening IST

The earlier compute-exhaustion hypothesis is superseded by dashboard evidence of network-transfer exhaustion. Read-only Render service API additionally reports jr-api and jr-socket suspended with billing suspender; API updated at 5:43 PM IST. Exact Render allowance exhausted remains unverified. Both providers must recover before hosted testing or live publication.

Drive metadata contains 103 successful October UTC snapshots, 3.52 GB JSON. The October IST boundary counts 105, 3.58 GB; do not combine them. Three content samples and an actual local synthetic network experiment confirm binary text-hex expansion. Approximate full-backup transfer model is 5.2 GB; exact billed attribution is not available. Retained system_events contain 71 API starts over seven days, with each deployed startup triggering full backup. Render log API calls timed out; no fabricated log attribution.

Detailed evidence, uncertainty, provider comparison and monthly scenario budget: JR CHANGES/2026-10-13-New-App-Updates/NEON-RCA-AND-MONTHLY-BUDGET-2026-10-15.md. Backup transfer reuse, source-matched durable cooldown and adaptive six-hour scheduler are implementing/testing locally. Do not claim deployed savings.

Independent review fixes now include standalone feedback migration, held/offline legacy offer visibility, decision-history deduplication, honest unknown decision timestamps, expiry scheduling before fallible audit insertion, safe partial GPS acknowledgements, native one-shot fallback, and offer-validation race protection. Driver UI labels saved GPS/ETA after thirty seconds and uses phase-aware headings in EN/HI. Native QA candidate assembly and headless Android11/15 checks are in progress. Hosted fifty-ride runner preparation is in progress, not executed against suspended production.

Provisional API/socket/database budget: about USD18/month at current measured compute pace; about USD34 at continuous0.25CU or USD54 at continuous0.5CU in a31-day month. This excludes Maps, portal subscriptions, tax and extras. Instance capacity remains subject to hosted load test. No paid-plan authorization inferred.


## Approved migration cutoff

On 15 October 2026, the user explicitly approved the existing 12:03 PM IST production snapshot as the final recovery cutoff for the alternate Neon and Render migration. Changes after this snapshot are excluded from the approved recovery state. A fresh source export is therefore no longer a prerequisite for this migration. The original source must remain intact.

Preserve the existing admin portal public URL and login flow, while changing its backend destination after restored data and permissions are verified. Verify all snapshot table counts, identifiers, document binary integrity and relational consistency before cutover. Hosted 50-ride testing, final APK configuration and live publication verification remain required and are not established by this approval.


## Final candidate checks after cutoff approval

Root verification: `npm run build` passed all 7 configured build tasks when PATH selected the project's pinned pnpm 10.8.1. An initial attempt selected ambient pnpm 11 and failed before compilation on the shared worktree dependency directory; no dependency reinstall was performed. `npm run check` passed all 10 configured workspace typechecks. Next production build skips its own type/lint stage by existing configuration; separate workspace typechecks provide the type evidence.

51 focused queue, incoming-alert, map, ETA, pending-timer, push-recipient, hosted-runner guard and restore-helper checks passed with zero skips. A separate backup suite passed 7/7, zero skips, including actual PostgreSQL binary snapshot/reuse/change/restore checks on the isolated local clone. This is not a hosted load result. Candidate-file scan found zero literal matches for available private credential values across 70 selected source/document files. Configured loud/supplied build-gate seams passed 2/2; observed is disabled in the existing gate configuration and these passes do not prove deployment.

Independent review identified stale existing-marker labels after pickup. The native owner implemented in-place label updates and phase-transition tests for both map renderers, plus stationary Google route refresh. Re-review and final native bundles remain pending at this entry.


## Restored cutoff and isolated hosted readiness

Approved snapshot restored atomically into the alternate Neon project: 21 source tables, 6,894 rows, 129 binary documents totaling 27,142,474 bytes. All typed row checksums and binary checksums matched. All 27 foreign-key relationships checked with zero orphan rows. Failure injection proved rollback, and a second restore correctly refused the populated target. Original source untouched. The reusable restore helper now requires explicit TLS and exact expected source hash/cutoff; the completed restore already supplied those values. Six restore guard tests pass.

Both new free Ohio Render services serve d8c084af843b800f473b98581d398aea2df9af8b against the isolated hosted load database, with fresh test auth keys and external provider credentials absent. Health and database readiness were observed. This is not a load-test result and production portal/APKs remain unswitched.

Additional backup hardening compares canonical complete table data, excluding only snapshot time. Verified identical contents update only Drive metadata, keeping original snapshot time separate from the new verification time. Changed contents retain full format-2 backups. Independent backend review found no material blocker; all 13 backup tests passed, including actual PostgreSQL, with zero skips. Active table changes still require full uploads, and simultaneous independent API writers retain a bounded duplicate race.

Native QA found Gradle did not invalidate its JavaScript bundle after shared UI changes. Final QA and production APK builds must force JavaScript bundle regeneration and verify the changed marker label is present in the actual bundled artifact. Source/harness tests alone do not establish APK contents.

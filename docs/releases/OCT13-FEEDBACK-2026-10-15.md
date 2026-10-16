<!-- JR_LOCAL_CLEANUP_BEGIN -->
## Current local handoff: 16 October 2026, 11:29 AM IST

Current release: 2.2.4 build 59, controlled team pilot. Live API/realtime source last observed before cleanup is 563cbd9; portal source is 950ed84. Local diagnostic source is 6ea8f2a. No deployment or runtime change is included in this cleanup.

[Current local index](</Applications/VsCode Works/12. Jeevan App/INDEX.md>) | [Source and evidence index](</Users/kumar.sh/.codex/worktrees/jr-ended-ride-privacy/jr-prod/docs/INDEX.md>) | [Cleanup and recovery record](</Users/kumar.sh/.codex/worktrees/jr-ended-ride-privacy/jr-prod/docs/releases/OCT16-LOCAL-CLEANUP.md>).

Latest retained full database backup: **16/10/2026, 06:54:47 IST**, 22 tables, 129 driver documents, independently hash-verified. Current signed APK pair, plaintext owner-only credentials and all feedback originals have indexed locations. Older edit copies and previous database backups are recoverable from the private archive. Existing uncommitted application source remains unchanged.

The hosted 10-ride client-recovery result passed, while raw realtime delivery remained 3,667/3,670 FAIL. Exact attribution of the original three is unproved; 50 rides, physical Infinix and physical alert behavior remain unverified. Provider readings in dated reports remain dated, not current usage. No hosted load was run for cleanup. See the latest ledgers for scope and accepted/open risks.

The material below is historical unless explicitly supported by a newer dated verification. Older instructions do not supersede this index.
<!-- JR_LOCAL_CLEANUP_END -->

## Realtime investigation update: 16 October 2026, 09:43 AM IST

Local reproduction confirmed the reconnect timing failure mechanism: the test's 1.1-second probe can occur before automatic user reconnection. A real source-bound local socket run delivered all 60 steady probes. Across six forced reconnect rounds it missed 15/120 probes, all while the intended user was disconnected and absent from the booking room; no missing event had its recipient present. No duplicate/cross-ride event occurred. Seven attribution/scope regression cases passed locally and are added to CI configuration; the new GitHub workflow has not been run. No production source, schema, APK, deployment or provider usage changed.

The original hosted 3,667/3,670 raw realtime FAIL remains unchanged. The saved aggregate lacks per-event timing, so exact attribution of those three historical events remains unproved. Original GPS persistence and client-recovery PASS are separate. [Detailed realtime investigation](OCT16-REALTIME-RCA.md).

# October 13 feedback implementation status

<!-- JR_V4_CURRENT_BEGIN -->
## Verified V4 completion and live release: 16 October 2026, 03:19 AM IST

**LIVE CONTROLLED TEAM PILOT: Jeevan Rakshak 2.2.4 build 59.** API and realtime source 563cbd9 are observed live with preserved production environments. Portal 950ed84 and both APK 59 files are unchanged. The full isolated 10-ride, 30-minute application-client resilience test passed; this is not 50-ride capacity, an SLA or a monthly free-service guarantee.

[Same printed QR / app updates](https://jr-admin.vercel.app/qr) · [Downloads](https://jr-admin.vercel.app/download-apk) · [Admin](https://jr-admin.vercel.app/admin-login). No QR reprint is needed. APK bytes were not downloaded again for this ledger update.

### Full hosted result and exact live identities

[GitHub-hosted V4 run 38806877311](https://github.com/jradmin-lgtm/jeevan-rakhakV0.1/actions/runs/38806877311) completed the unchanged 10-ride / 20-socket, 1,800-second workload, 1,800 queue checks, all arrival/pickup/completion/test-payment requests, final five-user automatic reconnect, 200-point offline replay and 1,412 unique stored GPS rows with zero duplicate rows. All ten views stayed within the reviewed 30-second freshness bound and socket recovery within 20 seconds. booking-poll p95 401.60ms, booking-poll-driver p95 313.50ms, live-gps-batch p95 712.80ms; GPS delivery p95 91.40ms. Realtime 3667/3670, missing 3, deadline misses 3. Maximum observed view age: 11.229 seconds. Three misses are consistent with controlled reconnects, but their exact cause is unproved. Raw HTTP: **PASS**; raw realtime: **FAIL**; raw sockets: **PASS**. Raw failures remain recorded even when bounded client recovery passes.

Runtime/API/socket source `563cbd9eeb859b914f1874b6d2086de11b115f3e`; harness `38414608c9bb701b269b8f9ceb6464fa9e046e51`; wrapper `121f36091f589a25f0311666491f55c314c13b40`. Production CI run 38812169503 passed before release. API deployment `dep-db8kjak9v7es73eju760`; realtime deployment `dep-db8kj9tg1s2s73ais4cg`. Both exact builds and environments were observed live, including DB health. Portal remains source 950ed84. Existing production records, signing identity and accepted Maps configuration were retained.

Public user59 SHA256 `bb439b8920d50b6945b42e38c0ba90bde19e8e257fcc054cd3841a8a5cb75b53`; driver59 `4f7a70833f1bd8544544954f68ca162a68b3f9e23811de348df989432d86efa4`. Their existing full public-download proof is reused, not presented as a new download. Four actual 58-to-59 same-signer upgrades/offline launches passed Android 11/15. Prior exact58 Google map/phase/pan/recenter evidence carries through identical JavaScript; no fresh 59 full Google ride or new screenshots were produced here.

### Cleanup, bounded quota and remaining limits

Final exact-run cleanup verified all owned fixtures inactive, drivers offline through the cleanup proof, both test services suspended, runner role dropped and both temporary GitHub secrets absent. Production was not mutated by test cleanup. Aggregate SHA256 `238d89971c902206bc1d1308cbb729eeacf8e1583baf30e7eadb7e4233b412f3`; final cleanup SHA256 `1a4c0a8abd3e72bd2720da11fb2acf9219e180bf5193102fd27a3eb5b9b02ce2`.

The test counted 9,314,181 decoded HTTP request/response application bytes. Its conservative wire model was 24,628,362 bytes, below 30,000,000, including 6,000,000 non-HTTP reserve and 2x decoded multiplier. It did not stop at the budget. Invoice bytes were not measured. The preflight kept a 50 MB safety reserve; user-approved ceiling is 15% TOTAL of each monthly allowance, not 15% additional per run.

Latest authenticated meter fetch: 16 October 03:19:24 AM IST. Provider data may lag; Neon metrics can lag up to an hour, Render latest hour may be partial and current-resource estimates can omit deleted resources. Fetch time is not provider-data freshness. Render service-age hours include sleep and are a ceiling, not billed hours. Remaining values are relative to readings, not guaranteed balances.

| Meter | Used / assumed allowance | Used | Remaining relative to delayed reading |
| --- | --- | --- | --- |
| neon-transfer, reported | 0.17 / 5 GB | 3.34% | 4.83 GB |
| neon-compute, estimate | 1.94 / 100 CU-hours | 1.94% | 98.06 CU-hours |
| render-bandwidth, estimate | 0.43 / 5 GB | 8.64% | 4.57 GB |
| render-hours, estimate | 25.99 / 750 hours | 3.47% | 724.01 hours |


### Preserved failures and actual hardening

All earlier failed/interrupted results remain failures. V3 setup run 38805334658 stopped before ride fixtures because a test-only compatibility pin still expected the old API build; no ride workload ran, and temporary secrets were removed. V4 added real cross-module plan validation before Docker traffic and corrected only the harness compatibility metadata. Earlier V2 run 38787766251 failed at 1,430/1,800 checks on a 39.901-second Cloudflare 520; its upstream cause remains unproved. A later successful run does not erase it. Earlier strict 10/50 failures, 348 missing events in38776443618 and interrupted Render generator evidence remain retained.

Confirmed runtime hardening sets both API/realtime HTTP keep-alive and header timers to 120 seconds, longer than the documented upstream connection-reuse window. This addresses the verified idle-timeout mismatch class; it does not prove the original 520 was caused by idle reuse. The app retains failed GPS uploads and bounded recovery is now exercised through the full approved 10-ride workload. Maps providers were disabled during capacity testing; booking creation, nearest-driver dispatch selection and a real-payment gateway were outside this seeded workload; Maps renderers/Google quotas, provider login, real push/FCM, physical Infinix/XOS and physical silent/DND audibility were not certified.

### Budget and launch scope

Retain existing pricing sources and model assumptions: 1.448 MB application JSON per active ride-hour, 63.9 MB/APK, 38.47 MB per changed full backup. Four changed backups/day over 31 days is about 4.77 GB; 100 APK downloads about 6.39 GB; combined 11.16 GB before other traffic. At the existing $0.15/GB paid outbound assumption, traffic above 5 GB in that example is about $0.92 bandwidth-only, excluding instances/Maps/other services/tax. No paid plan or card change is approved. Two always-on services need 1,488 hours in 31 days against 750 shared free hours; a successful 30-minute run cannot guarantee a free month.

The six-hour source-specific backup cooldown and verified document-byte reuse suppress redundant complete uploads. Real data changes still create full backups. This is not a distributed multi-writer lease or an exactly-once backup guarantee. Shared public Maps-key exposure and legacy signing custody remain accepted/open risks. Cached active ride/route/area and queued GPS recovery are implemented; downloadable offline map packs beyond 20 km remain a proposal. Backend coverage remains 1,000 km with 100 km display. No universal Android or zero-regression guarantee is claimed.
<!-- JR_V4_CURRENT_END -->

## Historical evidence retained below

The current verified summary above supersedes dated status statements below. Earlier failures and their evidence remain unchanged.


## Latest verified status: 16 October 2026, 1:38 AM IST

User-authorised controlled team pilot is live with both 2.2.4 build 59 APKs. Complete public QR/contact-gated downloads matched the reviewed SHA-256, retained signer, code 59 and runtime 2.2.4. API 950ed84 and realtime 0be6a34 are verified live against the approved restored production data. Existing admin login and protected actions are preserved. See [OCT16-PILOT-RELEASE.md](OCT16-PILOT-RELEASE.md) for current sources, verification and remaining risks.

[Hosted standard CI 38798456932](https://github.com/jradmin-lgtm/jeevan-rakhakV0.1/actions/runs/38798456932) passed every step after native metadata and empty-SOS wake corrections. This functional CI is distinct from hosted capacity testing. The ten-ride load run 38787766251 remains FAIL: 1,430/1,800 checks and one 39.901-second GPS HTTP520. Partial realtime delivered 2,910/2,910 updates without missing/cross-ride events. Ten-ride and fifty-ride capacity, physical Infinix, remote FCM and physical silent/DND audibility remain unverified. No further full load test was run against production.

## Historical candidate notes

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


## Independent final source and native checks

Second independent council: PASS 91/100 for backup/scheduler and hosted-runner/restore safety in the intended single-writer isolated scope. Mandatory restore TLS/hash/cutoff guards present; 11 combined runner/restore tests passed. First source council remains SHIP89/100 with the marker-phase correction independently verified. These are source reviews, not hosted capacity certification.

Android15 local end-to-end requests exercised actual create/cascade and native service handling: normal incoming request used looping device ringtone on the alarm stream, SOS used looping bundled buzzer, accept stopped the alert service and released its player, and normal incoming alert remained foreground after backgrounding the app. This did not exercise remote FCM delivery or establish physical OEM/silent-mode audibility.

Both Gradle applications now declare shared workspace source and Expo environment files as bundle-task inputs, excluding dependency/build/backup directories. Final production builds force initial bundle regeneration, then inspect new hosted endpoints and corrected marker code in the actual APK. Existing signing identity and upgrade compatibility remain required.


## Hosted measurements and portal verification, 15 October evening IST

Candidate commit 0be6a348f78266f44cafb3e022ddb8577ed15f1f is serving on both alternate free Render services against the isolated load database. Production data is restored separately and has not been bound to these services. The public portal and APK downloads remain unswitched.

The first 50-ride hosted attempt, with API pool 5, stopped after one HTTP 502. Booking-poll p95 was 3,411 ms; GPS-upload p95 was 2,853 ms. All 2,950 expected realtime GPS deliveries arrived, with zero cross-ride deliveries or duplicates. The second attempt with API pool 20 stopped on one GPS-upload transport timeout. Booking-poll p95 was about 2,897 ms; GPS-upload p95 about 2,900 ms. All 4,000 expected realtime deliveries arrived. Neither attempt met the 2,000 ms HTTP budget or completed the 30-minute test. The origin of the isolated transport failures remains unverified.

A bounded diagnostic confirmed persistent HTTP connection reuse but still missed the client latency budget: booking-poll p95 2,879 ms and GPS-upload p95 3,079 ms. The corresponding sampled server-side response-time p95 was 911 ms. This establishes a measurement gap between server response time and the Mac client path, not proof that either side alone caused the delay. A remote guarded generator is being prepared to separate those paths. No threshold was relaxed. Hosted 50-ride capacity remains unapproved.

A separate actual hosted booking creation, nearest-driver cascade, incoming request, acceptance and cancellation check passed. The Bhojipura landmark was retained. This check did not use push/SMS or Google credentials. Full hosted Google proxy testing is still pending.

Root drove the actual admin portal against the isolated local clone: login, wrong action-password rejection, driver offline hold and release, active-ride offline rejection, legacy driver disable and re-enable, registered-email mismatch rejection, user restriction and restoration, and administrative cancellation. Database postconditions verified exactly one audit entry per protected action, cancelled outcome without a new payment, restored user access and restored driver availability. No production account was mutated. Screenshot and aggregate evidence are saved under jr-oct15-portal-qa and /tmp/jr-oct15-portal-ui-evidence.json.

Both final 2.2.4 build 58 APK candidates are built, signed with the existing identity and inspected for new endpoints and all four supported ABIs. Expanded scans across 24 available private values found zero matches. Android 11 upgrade checks preserved authentication/profile state and queued GPS. Android 15 local journeys verified marker phase changes and normal/SOS native alert service handling. Remote FCM, physical Infinix startup and OEM silent/DND audibility were not run. Candidates remain unpublished pending hosted release checks.


A one-time native PostgreSQL 18 schema-and-data archive was written locally alongside the original JSON backup. Archive size 28,997,932 bytes; SHA-256 c5ce3c9c7ce8e1622d072a3d104909fff35ba2043e973f9c8b9c98c2b4aae571. Actual restore into a temporary local PostgreSQL 18 instance passed for all 21 source tables and 6,894 rows. The verification instance was removed. The archive is private, outside Git, and adds no recurring backup schedule. Its private manifest is LOCAL DATABASE BACKUPS/2026-10-15/NATIVE-ARCHIVE-MANIFEST.json.


## Remote generator result and next targeted fix

The independently reviewed temporary free Render generator (source 19e8bd0a046b4ba17c7ea8c1ccf4fec170bfdc80) ran against unchanged API/socket candidate 0be6. The full intended 30-minute run stopped after 39 seconds of steady work: 399 successful booking polls plus one 502, and 399 successful GPS batches plus one 502. Poll p95 3,649 ms, upload p95 3,943 ms. All 450 realtime deliveries arrived; zero cross-ride deliveries, duplicates and socket errors. The generator report was preserved and the generator suspended. No production cutover occurred.

A 60-second basic-health isolation check returned 1,200/1,200 HTTP 200. No-socket comparison returned poll-only 150/150 HTTP 200 at p95 2,860 ms; batch-only 150/150 at 1,751 ms; combined 300/300 at 3,336 ms. The exact origin of the earlier 502 responses remains unverified. These results support reducing the booking-read query path; they do not approve capacity. A narrow joined query is being tested against the original response and authorization contract before another hosted attempt.


## Joined read verification and measured CPU bursts

The joined booking read passed 27 real HTTP/database checks on the original handler, the same 27 after the change, and an independent 27-check rerun. Response shape, role redaction, hospital revocation, missing profile fields, zero coordinates and ended-position privacy remained intact. API TypeScript passed. API-only deployment 55f87b7 was observed before diagnostic instrumentation.

Runtime capture build da50ecb on the free isolated API completed every lifecycle stage without HTTP errors. All 675 expected realtime deliveries arrived with no cross-ride events or duplicates. It still failed the HTTP p95 budget: booking polls 2,665 ms, GPS uploads 3,095 ms. Twenty-three bounded runtime samples measured process CPU maximum 0.148746 cores, about 99.2% of the observed 0.15-core allowance. Event-loop p95 maximum about 302 ms and maximum delay about 608 ms. Minute-averaged provider CPU charts had missed these short saturation episodes. Cgroup throttling counters were explicitly unavailable because unrelated kernel fields failed the parser; no zero-throttling claim is supported. A narrow required-field parser correction is under independent review.

Seven actual load reports are preserved by runId and content hash, with an aggregate manifest at /tmp/jr-oct15-load-evidence-manifest.json. No full 30-minute capacity pass exists. The proposed US$7/month API Starter comparison requires a new billing approval because the user previously required free hosting. No paid change has occurred. Independent functional Google and exact production APK checks are preparing while capacity remains unresolved.

The team hosting budget draft and separate Maps budget draft are saved in the parent feedback folder. Maps uses JavaScript WebView rendering and traffic-aware legacy routes, so native SDK free-map pricing is not applicable. Both billing eligibility and remaining Google free allowances are unverified; modeled Maps costs are separate from hosting estimates. No refresh frequency or provider was changed by that budget review.


## User-approved launch scope revision

The user declined paid API comparison and explicitly required all hosting to remain free. The user then requested testing and launch readiness for 10 simultaneous rides. The new runner accepts explicit 10 or 50, derives socket/replay/reconnect/request counts, and preserves the original 50-ride checks unchanged. For 10 rides it plans 20 sockets, five reconnects, 200 offline points, 20 replay requests and 7,200 steady HTTP requests over 30 minutes. HTTP p95 remains 2,000 ms and realtime p95 1,500 ms. Independent review passed 33 tests across the revised guards, functional Google helper and parser correction. No 10-ride run has yet passed at this entry.

The separate Google functional helper targets 10 owned rides and 20 proxy calls, with strict source identity, marker, inactive-state, real-provider payload validation and cleanup guards. It can use a failed-capacity report only as identity inventory and cannot output capacity certification. This reduces unnecessary provider traffic for the revised launch scope. Native exact-production APK Google checks remain separate.

A new admin monthly allowance view was requested, including estimated used percentages and remaining allowance from ride/data-flow models where provider meters are delayed/unavailable. The estimate must state its source/freshness and exclude restored pre-cutover history from new-account usage. A 30-second keepalive was also requested; its existing implementation and free-hours impact are under review. No paid action or new database-polling schedule was enabled.

## Revised 10-ride check and usage feature, 15 October 2026, 9:45 PM IST

The strict hosted 10-ride run failed before 30 minutes on one HTTP GPS batch 502. Read p95 466.8 ms, upload p95 698.3 ms and independent live socket p95 89.2 ms describe the completed portion, not approval. No deployment event matched the failure; precise platform cause remains unproven. Failed data persistence and retry recovery are being checked separately. All test fixtures were made inactive and the generator suspended. Public portal/APK cutover has not happened. See CURRENT-STATE for the current recovery/capacity status.

The new authenticated usage dashboard includes delayed reported readings, explicit estimates, remaining allowances, periods and an editable additional-demand model for ride-hours, APK downloads and changed backups. Neon counter normalization is supported by official provider documentation. Twenty focused tests, root production build/typecheck, two independent reviewers and actual narrow/wide browser interactions passed. The 30-second keep-warm runs only while the usage page is mounted and never uses database health. Private staged APKs match the exact candidate bytes and remain absent from the live filename resolver; existing published files were retained. Details: OCT15-USAGE-TRACKER.md.

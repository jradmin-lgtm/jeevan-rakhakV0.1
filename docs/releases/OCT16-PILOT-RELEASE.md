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

# Jeevan Rakshak controlled team pilot

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


Verified live: 16 October 2026, 1:38 AM IST. This is the user-approved controlled team pilot. Functional release checks passed; the hosted ten-ride capacity result remains FAIL and fifty rides are not certified.

The temporary rollout hold is closed after correcting native runtime metadata, fixing an empty-SOS dispatch wake gap, passing hosted standard CI, observing the API build live and verifying both public build 59 downloads. This is not a new capacity-test pass.

## Live release

- User and driver APKs: 2.2.4, Android version code 59. Both were downloaded completely through the public contact-gated flow and their byte counts, SHA-256 hashes and signing certificate verified.
- Printed QR remains https://jr-admin.vercel.app/qr and redirects to https://jr-admin.vercel.app/download-apk. No QR reprint is required.
- Operations portal: https://jr-admin.vercel.app. Existing ops password, signed-session settings and protected-action password retained. Actual browser login, usage refresh, forecast, keep-warm disclosure and driver decision-history rendering checked. No real driver or booking was modified for this verification.
- Portal/application source: 950ed84a6ba9244ac654adab5d32d77ada7eaf7b. Vercel production deployment dpl_C9b6xmkK1hcgX69LJLt8pxk89azR is READY with the existing public domain.
- API source: 950ed84a6ba9244ac654adab5d32d77ada7eaf7b. Realtime source: 0be6a348f78266f44cafb3e022ddb8577ed15f1f. Both exact builds observed live. Only the API SOS runner changed in the final hotfix. Realtime and app JavaScript behavior are unchanged under their respective paths.
- Both services use restored production database jr_restore_oct15_v1. Approved cutoff: 15 October 2026, 12:03:01 PM IST. Later original-account changes were intentionally excluded by approval; the original source remains untouched.

## Changes and verification scope

| Area | Released change | Evidence and limit |
| --- | --- | --- |
| User and driver UI | Compact proportions, clearer request choices and ride-stage information, English/Hindi, wrapped driver GPS caption | All four final build 59 upgrades and offline cached launches passed on Android 11/15; JavaScript is byte-identical to public build 58, whose Google/UI checks remain historical |
| Area and landmark | Area-first suggestions with optional recognisable meeting-point input, retained for driver details and ride recovery | Functional checks and 10 parallel landmark requests; not a guarantee that five useful areas always exist |
| Maps | Google renderer with existing key, OSM fallback, manual-pan recenter, recovered renderer state and phase-aware vehicle labels | Actual emulator Google rendering/recenter checks; production config returns expected Google key and fallback URL |
| Ride progression | After verified pickup, ambulance represents patient on board; old pickup marker/navigation removed where appropriate, drop navigation retained | Native/local phase-transition checks; not independent patient-phone GPS |
| Poor connectivity | Cached active ride/route/landmark, owner-scoped GPS queue, partial acknowledgement and duplicate-safe replay | Local/native queue checks and short hosted reconnect proof; full 200-point hosted offline stage was not reached in the failed load run |
| SOS availability recovery | An SOS with no current offer wakes immediately when a driver comes online, while active offers keep their 20-second deadline | Seven focused timer/concurrency/failure tests, fresh local integration and hosted standard CI passed |
| Driver alerts | Bundled SOS buzzer, booking ringtone, native continuous-alert path and priority settings | Source/native/local checks; remote FCM and physical OEM silent/DND audibility were not run |
| Admin actions | Protected operations with reason/audit, persistent offline hold, admin cancellation rather than invented completion/payment | 38 local feedback integration checks and actual isolated portal interactions; live controls/rendering checked without mutating real records |
| Driver history | Actor-scoped Accepted/Rejected decision separate from final trip status | Local integration checks and actual live Accept/Reject table/Accepted-row rendering |
| Usage dashboard | Four allowance meters, clearly labelled estimates, scenario planner and page-only 30-second health checks | Actual live login, provider readings, forecast and no horizontal overflow at tested 505 CSS-pixel viewport |
| Backup | Six-hour source-matched cooldown, document-byte reuse and unchanged-content upload avoidance | One new-source backup observed and directly verified; multi-writer deployments still need a distributed lease |

## Data and backup

Live counts: 12 users, 19 drivers, 2 hospitals, 234 bookings and 129 documents totalling 27,142,474 binary bytes. All restored identifiers and document bytes had already passed the restore verification. One recorded active trip remains from the approved cutoff; no operator decision was invented to cancel or complete it.

One source-matched pilot startup backup was verified directly from Drive and saved locally. It has 22 tables: the original 21 plus empty additive admin_actions. All 129 document identities and bytes match the approved restore. JSON size 38,475,320 bytes; SHA-256 8540993b0a5ce437a28a5624dc3887eb2ae7d5eac04818fd65ac1baa8e4c1ef2. Source snapshot logs showed zero binary bytes fetched and 27,142,474 reused bytes. The replacement API instance recognised the source-matched six-hour cooldown. No duplicate source backup was observed in this check; this is not an exactly-once guarantee for simultaneous independent writers.

## Hosted test remains failed

[GitHub run 38787766251](https://github.com/jradmin-lgtm/jeevan-rakhakV0.1/actions/runs/38787766251) completed only 1,430 of 1,800 steady checks, approximately 23 minutes 50 seconds. One GPS upload returned Cloudflare 520 after 39.901 seconds. The exact origin of that provider response remains unproved; no matching deployment/restart or high resource saturation was observed in the sampled window.

All 2,910 expected realtime updates arrived, with zero missing, duplicate or cross-ride events. Maximum observed UI fix age was 5.002 seconds. Observed p95: user poll 448.1 ms, driver poll 460.2 ms, GPS upload 850 ms, delivered realtime fix 101.7 ms. These are partial-run measurements, not full capacity certification. Ten concurrent initial accept calls had p95 about 4.36 seconds.

The harness incorrectly classified observed 520 as non-transient while the unchanged app queue retains that failed upload for retry. A test-only correction and 10 focused tests demonstrate simulated recovery at 45 seconds with the raw error retained. This does not prove the actual hosted 520 recovered. Full offline replay, forced reconnect and complete/end/payment stages were not reached in this run. Earlier failed runs remain failed. No replacement full hosted run was started after the pilot decision.

All ten synthetic rides were cancelled and their drivers made offline in the isolated test database. Both temporary GitHub test secrets were deleted and the task database role dropped. Production now uses the separate restored database. Further load testing must not use these production endpoints or real records.

## Latest usage reading

At 16 October 2026, 1:36 AM IST, the authenticated live portal returned no provider-reading errors. Neon reported 0.166649 GB transfer, 3.33% of 5 GB. Estimated compute was 1.69778 CU-hours, 1.70% of 100. Render's current-service hourly aggregate estimated 0.296380 GB, 5.93% of 5 GB; its current-resource age model estimated up to 18.5309 of 750 hours, 2.47%. These delayed readings are not a live balance or invoice. The final build 59 download pair added 127,841,432 application bytes afterward. No paid service change was made.

## Remaining limits for the team

- Pilot use is authorised; ten-ride and fifty-ride capacity are unverified. Capture any visible error with time, app version and ride reference.
- Physical Infinix startup, remote FCM delivery and physical silent/DND audibility were not run.
- Existing shared public Google renderer/server key exposure remains accepted by the user. It is not fixed by a private-value scan. Separate restrictions still need Google Cloud access.
- Signing compatibility is retained. The legacy signing key in repository history remains a risk requiring a reviewed migration.
- Free service sleep, shared running-hour and transfer limits remain. No paid plan or card change was made. Opening Monthly usage runs health checks; it is not a 24/7 uptime service.
- Current delayed readings must not be treated as live balance. The two build 58 and two build 59 public verification downloads transferred 255,682,868 application bytes altogether. The last pair transferred 127,841,432 bytes after the final usage snapshot and may not yet be reflected in provider totals. These are actual application bytes, not provider invoice totals.

## Release file identities

| App | Bytes | SHA-256 |
| --- | ---: | --- |
| User | 63,873,517 | bb439b8920d50b6945b42e38c0ba90bde19e8e257fcc054cd3841a8a5cb75b53 |
| Driver | 63,967,915 | 4f7a70833f1bd8544544954f68ca162a68b3f9e23811de348df989432d86efa4 |

Both actual public downloads verify with retained signer SHA-256 fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c. Prior published APK files remain for rollback.

## CI failures and corrections

The original hosted load run 38787766251 remains failed for its observed GPS HTTP520. Separate standard CI runs 38793591540 and 38796332381 also remain historically failed. The first exposed native runtime 2.2.3 alongside app 2.2.4. Both compiled APKs now carry runtime 2.2.4/code 59; actual active expo-updates module execution was not established. The second exposed an SOS availability scenario, which led to a real empty-first-wave wake fix without shortening any existing offer deadline.

The independent review also caught and closed a lost-retry failure path. Stale integration fixtures were corrected to create durable driver offers, respect both legitimate acceptance/offline race outcomes, and retain original offline GPS timestamps without rewinding live location. No production permissions were weakened. [Hosted standard CI run 38798456932](https://github.com/jradmin-lgtm/jeevan-rakhakV0.1/actions/runs/38798456932) passed every step for source 950ed84, including ten isolated booking/permissions/admin suites. This GitHub-hosted functional check is distinct from a Render capacity load test.

Build 59 upgraded published build 58 without uninstall on both Android 11 and 15 for each app and rendered cached synthetic profiles/rides offline. Android 11 private storage was byte-identical immediately across upgrade; Android 15 private-byte equality was inaccessible. A scoped decompressed-APK scan found no matches for 19 private credential values or PEM private-key markers. The accepted public Google renderer key remains exposed by design and was excluded. No fresh build 59 full Google ride was run; earlier build 58 Google evidence is carried because both app JavaScript bundles are identical.

## Evidence

The local review folder jr-pilot-release-20261016 contains aggregate-only public-download, backend, failed-test, cleanup and backup evidence. Full private database exports remain separately permission-restricted under LOCAL DATABASE BACKUPS. Review boards and the launch/usage one-pager retain historical evidence with a current pilot-status banner.

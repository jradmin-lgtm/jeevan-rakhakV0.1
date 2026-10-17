## Live cost release: 18 October 2026, 12:41 AM IST

API **9dfa945** is observed live with direct APK delivery and incremental mode. Both live download handoffs passed; no duplicate backup occurred at startup. First scheduled increment is due around 18 October 2:22 AM IST and remains pending observation. Realtime/portal/APK59 are unchanged. [Authoritative rollout record](releases/OCT18-COST-FIXES-LIVE.md). Older pending-review statements below are historical.

<!-- HISTORICAL_CONTENT -->
## Local cost-fix candidate: 18 October 2026, 12:20 AM IST

[Local download preview](http://127.0.0.1:3101/download-apk) and [implementation/verification](releases/OCT18-COST-FIXES-LOCAL.md) are ready for owner review. Drive direct delivery and incremental backups passed 46 focused local tests, real PostgreSQL restore/lease checks and bounded memory testing. Only the two current APKs were made link-readable as approved. No production backend deployment, new APK build or hosted load was performed. Live backend rollout remains pending this review; older live-state evidence below stays dated.

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

The original hosted 3,667/3,670 raw realtime FAIL remains unchanged. The saved aggregate lacks per-event timing, so exact attribution of those three historical events remains unproved. Original GPS persistence and client-recovery PASS are separate. [Detailed realtime investigation](releases/OCT16-REALTIME-RCA.md).

# Jeevan Rakshak: current state

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


Updated 16 October 2026, 1:42 AM IST. This entry supersedes previous current-status text; dated evidence and failed runs remain preserved.

**LIVE CONTROLLED TEAM PILOT: Jeevan Rakshak 2.2.4, Android build 59.** Both public APKs and the admin/API/realtime services are verified. The temporary native-metadata and SOS dispatch release holds are closed. **Capacity remains unapproved:** the hosted 10-ride run failed, and 50 simultaneous rides are not certified.

[Existing printed QR](https://jr-admin.vercel.app/qr) · [User and driver downloads](https://jr-admin.vercel.app/download-apk) · [Admin login](https://jr-admin.vercel.app/admin-login). The QR still returns307 to the same download page; no reprint is required.

[Verified pilot release and limitations](/Users/kumar.sh/.codex/worktrees/jr-ended-ride-privacy/jr-prod/docs/releases/OCT16-PILOT-RELEASE.md).

## Exact live identities and proof

- Public user APK:2.2.4 /59,63,873,517 bytes; SHA256 `bb439b8920d50b6945b42e38c0ba90bde19e8e257fcc054cd3841a8a5cb75b53`.
- Public driver APK:2.2.4 /59,63,967,915 bytes; SHA256 `4f7a70833f1bd8544544954f68ca162a68b3f9e23811de348df989432d86efa4`.
- Both complete contact-gated public HTTP downloads were verified for exact bytes/hash, compiled package/versionCode59/versionName2.2.4/runtime2.2.4 and retained signer `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`. Neither reused a previously downloaded local file. Public proof began16 October1:36:50AM IST; SHA256 `33c97a240a4a7950e67e2064d16754bd61585270ba673ee7e52a39b8f93d76c3`.
- APK native source:`67851f2a85d95f1ad32c682e0ea3a94ecf7b2f31`. API and portal source:`950ed84a6ba9244ac654adab5d32d77ada7eaf7b`. Realtime source:`0be6a348f78266f44cafb3e022ddb8577ed15f1f`.
- API deployment:`dep-db8j32tg1s2s73e1d92g`. Portal deployment:`dpl_C9b6xmkK1hcgX69LJLt8pxk89azR`, READY on the unchanged public domain. Socket deployment remains`dep-db8ie1u89jmc73dsip8g`.
- Read-only production proof at1:34:44AM IST passed exact builds, application/DB health, authorized dashboard, unauthorized dashboard401 and un-tokened APK403, plus Google map configuration with the existing renderer key and OSM fallback. Proof SHA256:`984c0280db60febd727a25fa7b02d47e0d98af53e3d31194f74ab8f1cabd02d0`.
- Preserved admin password login, Secure/HttpOnly/SameSite=Lax cookie, logout, unauthorized usage redirect, all four usage meters without provider errors and two responding health checks passed. Actual public browser checks at505 CSS pixels showed495px document width without overflow, the usage values and both download cards. Earlier live checks exercised Refresh,100-APK forecast, disclosure, protected driver controls and Accepted/Rejected history without modifying business records.

## Closed release-consistency findings

Build58's compiled native runtime was2.2.3 while app version was2.2.4; CI38793591540 caught the real metadata mismatch. Update flags were present, but no expo-updates dependency/autolink or UpdatesController/UpdatesPackage classes were found. Active OTA execution, loading older OTA code and an OTA-caused functional failure were not established. Both apps were rebuilt as59 with matching2.2.4 runtime; compiled public binaries now prove the correction. Both JavaScript bundles are byte-identical to58; no UI or map behavior was rewritten for this metadata fix. Build58 public-download proof remains historical, not proof of59.

The integration run then exposed a real SOS gap: if no driver had been eligible, a newly online driver could wait for the20-second idle timer. The API fix wakes only waiting SOS runners with no current-cycle offer, coalesces concurrent work, cancels stale timers and retries failed wakes. Existing active offers keep their persisted20-second deadline. Independent review caught and fixed the initially missing retry-on-error path; all7 focused tests passed. Integration fixtures were corrected to establish durable offers/availability, test both legitimate serialized accept/offline outcomes and verify25-hour GPS history without rewinding live location. These were test preconditions, not relaxed application authorization.

[standard CI run 38798456932](https://github.com/jradmin-lgtm/jeevan-rakhakV0.1/actions/runs/38798456932) completed successfully for source950ed84: typecheck, ops session security, native release configuration, route progression, offline queue, SOS wake and isolated booking/permissions regression all passed. This is GitHub-hosted functional regression using isolated PostgreSQL, **not Render capacity certification**. The API code-only hotfix preserved production environment, free plan, socket, authentication and restored data. Restart logs recognized the source-specific backup cooldown; no extra snapshot was observed in that check.

## Native, maps and offline evidence scope

All four actual58-to59 same-signer upgrades and cached offline launches passed on Android11/15. Android11 private storage bytes matched before/after; Android15 private byte equality was unavailable. Both59 APKs contain four ABIs, minSdk24/targetSdk35, corrected runtime and identical JavaScript bundles. The final59 native manifest binds9 current evidence files and prior58 Google evidence; SHA256`e5b450030eef910952e0433bf33fdcc9215c087bce0b6e4b29baf86f2040c646`. No fresh59 Google full ride was run.

Prior exact58 evidence remains scoped: user04a627 on Android11/15 rendered local Google through pickup, live GPS, manual pan and recenter without restart. Driver2477ec Android11 Hindi Google smoke showed onboard marker, complete caption, ETA, drop footer, pan and recenter without restart; separate offline Hindi100%/130% checks passed. The smoke used a prepared synthetic onboard ride, not a fresh provider login/UI OTP. These Google checks carry forward by identical JS and metadata-only native changes; they are not relabeled as a new59 full ride.

Map sourcefc7e171 uses latest target geometry, coalesced phase/layout fitting, explicit recenter with fresh props, and cancellation of stale animations. A10km discontinuity resets only the visual trail; stored GPS/cache/coverage are unchanged. Manual pan persists until recenter. Independent22-map/39-UI tests and typechecks passed. Bounded hosted Google area/ETA checks passed10+10 calls, not30 minutes of sustained Google requests or50 renderers. Earlier driver fallback after network restoration sometimes required process restart to return to Google; that remains an improvement item.

Approved rural scope is cached active ride/route/area/meeting point and owner-scoped queued GPS replay on reconnect. Fully downloadable offline maps beyond20km from SRMS remain a proposal. No new position can reach another phone without connectivity.

## Hosted load history, unchanged

[hosted V2 run 38787766251](https://github.com/jradmin-lgtm/jeevan-rakhakV0.1/actions/runs/38787766251) remains **FAIL**. It completed1,430/1,800 steady checks in23m50s, then one GPS upload returned Cloudflare520 after39.901s. Raw HTTP and client-resilience verdicts failed. Underlying provider cause remains unproved; no actual hosted retry recovery from that520 was established.

During the completed scope,2,910/2,910 realtime points arrived with zero missing/duplicate/cross-ride events and no natural disconnects. Maximum true UI fix age was5.002s. Partial-run p95:user448.1ms, driver460.2ms, GPS850ms and realtime101.7ms. The separate controlled502 check recovered in15.224s with exactly one stored row. **Final forced reconnect,200-point offline replay, exact1,412-row persistence and complete/end/payment stages were not reached.** All10 isolated rides were cancelled/inactive, drivers offline, and two temporary secrets plus the test role removed.

The test classifier excluded520 although the app queue preserves failed uploads. A narrow test-only correction passed10 focused tests and simulated recovery after45s with all1,211 synthetic rows retained and raw520 recorded. This is not a successful repeat of the actual failed hosted run. No new full run followed the explicit pilot decision.

Earlier evidence is retained separately:

- Strict10-ride run failed after13m47s on one GPS502;1,659/1,660 GPS rows persisted. It remains FAIL.
- Bounded unchanged-queue recovery proof passed across restart, ACK945ms, duplicate313ms, realtime258ms and exactly one row. It is not capacity or physical-device proof.
- Render generator was replaced after about9 minutes without a source deploy; last snapshot had no raw errors, sampled CPU19.3%/memory26.4%. Exact replacement cause is unknown; run INTERRUPTED, generator suspended and fixtures cleaned up.
- GHA38776443618 failed:3,262/3,610 realtime points arrived,348 missing. Five test sockets disconnected; that harness had reconnection disabled while actual apps reconnect. The mismatch does not retroactively pass the run.
- The81-second one-ride recovery proof passed: user/driver fresh socket recovery5,203/4,939ms, authorized snapshot2,498/4,994ms. One of14 raw events was missing, so raw realtime FAIL remains.5 sampled points persisted; own fixture inactive.
- Earlier hosted50 attempts failed their budgets. Neither10 nor50 parallel rides nor a monthly ride allowance is certified.

## Restored data and backup

The user approved15 October12:03:01PM IST as cutoff. Restored database`jr_restore_oct15_v1` verifies12 users,19 drivers,2 hospitals,234 bookings and129 documents totaling27,142,474 binary bytes. Original source is intact. The approved21-table export,6,894 rows, all row/document checksums and27 relationships passed restore checks; private JSON and PostgreSQL18 archives remain under LOCAL DATABASE BACKUPS. One original active trip remains from the approved cutoff; no completion/cancellation was invented.

Pilot startup backup verification found one source-matched complete format2 snapshot,22 tables including empty additive admin_actions, all129 document identities/bytes matching restore,38,475,320 JSON bytes. A direct bounded Drive download and local copy were verified. Subsequent API950 restart recognized its durable six-hour cooldown. Document-byte reuse and metadata-only verification suppress unchanged complete uploads; real table changes still trigger full snapshots. Simultaneous independent writers still need a distributed lease; no exactly-once guarantee is claimed.

Original service suspension was transfer, not storage or hours: Neon5.54GB transfer/64.46MB storage/16.45CUh; Render5.76GB against5GB,98.83/750hours. Recorded103 October UTC backups totaled3.517GB JSON. These support the RCA, not an exact per-request invoice.

## Latest usage and remaining limits

| Meter | Used / assumed monthly allowance | Approximate remaining |
| --- | --- | --- |
| Neon transfer, reported | 166.65 MB / 5 GB, **3.33%** | 4.8334 GB / 96.67% |
| Neon compute, normalized estimate | 1.6978 / 100 CU-hours, **1.70%** | 98.3022 CU-hours / 98.30% |
| Render bandwidth, hourly estimate | 296.38 MB / 5 GB, **5.93%** | 4.7036 GB / 94.07% |
| Render current-service age ceiling | 18.5309 / 750 shared hours, **2.47%** | 731.4691 modeled hours / 97.53% |

Authenticated tracker fetched16 October1:36:52AM IST, with a15-minute cache. Provider data may lag and do not supply exact freshness. Render hourly totals cover current services, may omit deleted resources and may contain a partial latest hour; service age includes sleep and is an upper model, not billed hours. These are not invoices or guaranteed balances. The build59 verification pair transferred127,841,432 application bytes after this reading; the earlier build58 pair transferred127,841,436 bytes, totaling255,682,868 bytes across four checks. Do not add all four downloads to a reading that may already include some of them.

The planner uses1.448MB application JSON per active ride-hour,63.9MB/APK and38.47MB/changed full backup. These are visible assumptions, not wire traffic or complete bills. Four changed backups/day for31days is about4.77GB;100 APKs about6.39GB, before other traffic. Two always-on services need1,488hours in31days against750 shared free hours. Do not infer Neon traffic from APK/Render bytes or promise free monthly operation by ride count alone.

The usage model passed20 tests, build/typecheck and peer review; prior505/1,280px local checks had no overflow. Eight checked private values were absent from67 generated client files. Usage readings refresh separately from30-second API/socket liveness while the usage page is open. The liveness calls do not query the database; closing/sleeping the page stops or delays them, and they consume Render free hours. This is not24/7 monitoring.

Keep free hosting,1,000km backend coverage/100km display, shared ops login, existing signing compatibility, existing Maps key and printed QR. No paid plan/card change is approved. Shared public Google key exposure remains accepted and unremediated; separate restrictions require Cloud access. Legacy signing material in repository history remains a migration risk. Physical Infinix/XOS startup, remote FCM, physical silent/DND audibility and real login-provider journeys remain unverified. No universal Android or zero-regression guarantee is supported.

## Next work and workspace discipline

Collect controlled-team/device feedback for booking, area/meeting point, acceptance, pickup, tracking, completion, alerts and upgrades. Diagnose the520 separately; any future full load must use isolated data and endpoints, never restored production. Preserve failed results and require a complete reviewed test before capacity claims.

Authoritative worktree:`/Users/kumar.sh/.codex/worktrees/jr-ended-ride-privacy/jr-prod`. Primary retains other dirty work; do not reset or stage wholesale. Credentials, full records, backups and signing files stay outside Git/shared reports. Current-state mirrors, usage/budget handoff and historical-review banners reflect59; historical build57 data and58 evidence are retained with their dates.

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

# Monthly usage tracker candidate

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

15 October 2026. Candidate verified locally by root in the authenticated admin browser, not yet publicly deployed.

## Behaviour

Admin-only `/usage` and `/api/usage`, plus `/api/keepalive`. Sidebar has one new Monthly usage link. The signed admin session is checked inside both API routes, independently of middleware. Provider credentials stay in server environment variables; responses contain only selected aggregate values, fixed explanatory text and sanitized error categories. No provider error body, account token or arbitrary URL is returned. No schema changes or database queries were added.

Four separate bars show Neon transfer (delayed provider reading), Neon compute (monthly weighted CPU counter divided by 3,600, with endpoint age times configured maximum CU as fallback), Render bandwidth (hourly provider totals for current services) and Render free hours (current free service ages including sleep). The fallback compute model and Render hour model are high-side planning estimates for current resources, not authoritative bounds on total bills: deleted resources, prior sizing and plan changes are unknown. All allowances assume the configured accounts remain on the stated Free/Hobby plans. Percentage text can exceed 100; visual bars cap at 100. Missing/invalid data remains unknown, never zero. Restored historical bookings are not used to infer new-account traffic.

Neon project transfer was still 17,117,741 bytes at inspection, with no provider measurement timestamp. A successful API fetch is not presented as fresh metering. Render aggregate bandwidth API returned unit `mb`; decimal conversion is explicitly an estimate, and the latest hourly bucket may be partial. Only the aggregate endpoint is summed, never totals plus traffic-source components. Each metric states its period, method, scope, confidence and last hourly point where available.

Provider calls are on demand, cached for 15 minutes per server instance, single-flight within that instance, with 10-second timeouts and redirects disabled. Serverless replicas can make separate calls. No scheduled job was added. Cache resets on restart. Reading failures produce unavailable metrics, not invented fallback values.

The usage page checks API and realtime `/health` every 30 seconds while mounted. The server combines concurrent checks and caches for 20 seconds per instance; each upstream call has a 5-second timeout. No `/health/db` calls. Unmount aborts the browser request and removes the timer. Browser background throttling, sleep and closure prevent an always-on guarantee. Existing portal shell polling is unchanged and can still query application data; the new tracker/keepalive does not query the DB.

## Server configuration

- `JR_USAGE_NEON_API_KEY`: server only; use the narrowest supported read scope.
- `JR_USAGE_NEON_PROJECT_ID`: selected project, not an account-wide total.
- `JR_USAGE_RENDER_API_KEY`: server only; this credential may permit account mutations even though this code only performs GETs. Existing shared admin access increases the importance of keeping it server-side.
- `JR_USAGE_RENDER_OWNER_ID`: explicit workspace filter. Unexpected workspace or potentially truncated service pages fail closed.
- `JR_API_BASE_URL` (existing `NEXT_PUBLIC_API_BASE_URL` fallback) and `JR_SOCKET_BASE_URL` (canonical `NEXT_PUBLIC_SOCKET_BASE_URL`, then legacy `NEXT_PUBLIC_SOCKET_URL` fallback) provide health origins.
- `JR_ADMIN_SESSION_SECRET`: existing signed-session verification.

No environment values were deployed by this reviewer. Root must coordinate provider credentials and scope before release; never use NEXT_PUBLIC names for provider keys. No paid services or external keepalive schedules were authorized by this change.

## Existing ping audit

No dedicated JR keepalive script or running matching script was found in the inspected project/workflows, current crontab, matching local process-script paths or LaunchAgents. The existing JR Codex release automation is paused. This is a scoped local inspection, not proof that no external monitor exists. Socket.IO has a 25-second connection heartbeat. The legacy worker-jobs source has a 30-second DB-reaping heartbeat, which is not an HTTP keepalive and is not among the three current alternate-account Render services. Portal counts already poll while open.

Render free hours are shared: two continuously running services use 1,488 hours in a 31-day month, three use 2,232, versus 750 included. Thirty-second health checks can prevent sleep while this tab runs but cannot increase the allowance.

## Verification and remaining review

20/20 usage and session tests pass after the counter refinement; admin TypeScript check passes. Tests cover missing versus genuine zero, expired periods, true over-limit percentages, duplicate/missing/out-of-period bandwidth, current-resource age models, route auth before provider execution, health-only targets, single-flight caches and secret-free results. Independent source review and narrow-screen interaction checks subsequently passed as recorded below. Desktop-width resizing and public verification remain pending.

Official references: [Render bandwidth API](https://api-docs.render.com/reference/get-bandwidth), [Render free limits](https://render.com/docs/free), [Neon project API](https://api-docs.neon.tech/reference/getproject), [Neon metering API scope](https://api-docs.neon.tech/reference/getconsumptionhistoryperprojectv2), [Neon allowances](https://neon.com/pricing).


## Additional traffic planner

The new calculator is local to the browser, with no persistence or database calls. Inputs are additional active ride-hours, complete APK downloads and changed complete backup uploads before the current month resets. Initial values (10 ride-hours, 10 downloads, 4 uploads) are explicitly examples. They are not demand predictions. It adds only future scenario traffic to the latest current-service Render baseline; the baseline and scenario are visibly separate. Missing baseline leaves the total unknown while preserving the useful scenario subtotal. Restored historical booking totals never enter this model.

Visible coefficients are 1.448 MB decoded application JSON per active ride-hour, 63.9 MB per APK and 38.47 MB per changed full backup. The ride observation comes from the prior 5-second poll/GPS run that failed the latency gate; traffic size is not capacity proof. It includes JSON request/response sizes and excludes wire overhead, compression, socket/provider traffic, most portal traffic and future growth, so it is not an authoritative outbound bill. No Neon usage is inferred from Render traffic. All amounts use decimal MB/GB. Over-limit percentage text remains visible; the bar caps at 100%.

Review fixes: provider non-success bodies are cancelled before returning sanitized errors; usage copy now distinguishes database-free metering from the health checks above it; keepalive resolves the existing canonical socket URL environment name.

## Root browser and build verification, 15 October 2026, 9:15 PM IST

Admin production build succeeded. Independent root run passed all 15 tests, comprising 13 usage tests plus 2 signed-session tests. Admin typecheck passed. Expanded client-static scan found none of 8 actual private values across 67 generated files. Independent backend peer found no material auth, scope, estimate or health-query issue.

The actual authenticated local page returned selected alternate-account provider readings. Neon transfer displayed 0.34% with delayed-reading caveat; Render current-resource hourly aggregate displayed approximately 1.87%. Refresh retained the shared cached reading. The 30-second health status advanced and reported both local services responding. Three editable inputs were driven, including blank-invalid, all-zero and 100-APK scenarios. The over-limit scenario displayed approximately 133.04% and zero modelled remaining; no text clipping at 100%. Expanding the assumptions exposed coefficients and exclusions. At the actual narrow browser viewport of 505 CSS pixels, document width was 495 pixels, with no horizontal overflow. Saved screenshot: jr-oct15-portal-qa/usage/monthly-usage-default.png in the local review artifact folder. A wider browser check and subsequent compact presentation are recorded below. Public deployment and exact production-origin health checks remain pending.


## Neon counter refinement, 15 October 2026

The official [Neon consumption limits documentation](https://neon.com/docs/guides/consumption-limits) defines the project counter as cumulative usage within the monthly billing period and weights compute seconds by compute size (0.25 CU consumes 0.25 compute seconds per second). Therefore a valid `compute_time_seconds` counter divided by 3,600 is now the preferred estimated CU-hour value. A sample counter of 2,828 gives approximately 0.786 CU-hours, or 0.786% of the assumed 100 CU-hour Free allowance. This includes deleted project computes as documented and is more informative than the current-endpoint maximum-age model.

The UI labels this a counter estimate with possible lag, not an exact invoice or live credit balance. The documented reporting delay can reach one hour; fetched-at time is still not a measurement timestamp. Missing or invalid counters fall back to the explicitly named high-side current-resource model only when its period and endpoint inputs are valid. An expired/future billing period gives unknown instead of a carried-forward monthly value. Genuine zero is retained. The response now carries a `method` field so the UI shows “Up to” only for the high-side fallback or Render age model, not all Neon compute readings.

Five additional tests cover positive conversion/precedence, genuine zero, negative/malformed values, fallback source/method and out-of-date periods. Combined suite: 20 tests (18 usage plus 2 session), all passing. Typecheck passes. Production rebuild, independent delta review and browser verification of the new counter label remain with the release owner.

## Refined counter and compact presentation, 15 October 2026, 9:45 PM IST

Official Neon consumption-limits documentation confirms compute_time_seconds is weighted by compute size. A current valid monthly counter divided by 3,600 now provides the preferred CU-hour estimate, including the documented project-wide scope. A missing or invalid counter falls back to the visibly labelled current-resource ceiling. This remains an estimate with delayed measurement and no invoice claim. Two independent reviewers passed the final model and presentation; root ran all 20 tests, rebuilt production Next, passed typecheck and repeated the eight-private-value scan across 67 client files.

Actual browser checks passed at 505 and 1,280 CSS-pixel widths, including sidebar collapse/expand, the new keep-warm explanation disclosure and unchanged forecast controls. No horizontal overflow occurred. The first wide-view meter starts around 284 pixels from the top. The current counter displayed approximately 0.79 CU-hours, 0.79% of the assumed 100 CU-hour allowance; the earlier maximum-size model remains a separate fallback rather than the default. Final captures: monthly-usage-wide-compact.png and monthly-usage-narrow-compact.png in jr-oct15-portal-qa/usage. Both usage tabs were navigated away afterward, ending their page-scoped health checks. Public deployment remains pending the separately failed hosted 10-ride review.

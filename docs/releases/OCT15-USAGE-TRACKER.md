# Monthly usage tracker candidate

## Latest verified status: 16 October 2026, 1:03 AM IST

User-authorised controlled team pilot is live. Both 2.2.4 build58 APKs were downloaded through the existing public QR/contact gate, matched to the reviewed hashes and signing certificate, and the updated portal login/usage/history rendering verified. API and realtime exact sources are live on the approved restored database. See [OCT16-PILOT-RELEASE.md](OCT16-PILOT-RELEASE.md) for the release scope, evidence and unresolved risks.

The hosted ten-ride run remains FAIL: 1,430/1,800 checks, one 39.901-second GPS HTTP520. Partial realtime delivered 2,910/2,910 updates with no missing/cross-ride events. This is not ten-ride or fifty-ride certification. Physical Infinix, remote FCM and physical silent/DND checks remain unverified. All test fixtures and temporary credentials were cleaned up. No new full hosted test was started against production.

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

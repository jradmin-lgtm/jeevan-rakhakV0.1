# Monthly usage tracker candidate

15 October 2026. Candidate verified locally by root in the authenticated admin browser, not yet publicly deployed.

## Behaviour

Admin-only `/usage` and `/api/usage`, plus `/api/keepalive`. Sidebar has one new Monthly usage link. The signed admin session is checked inside both API routes, independently of middleware. Provider credentials stay in server environment variables; responses contain only selected aggregate values, fixed explanatory text and sanitized error categories. No provider error body, account token or arbitrary URL is returned. No schema changes or database queries were added.

Four separate bars show Neon transfer (delayed provider reading), Neon compute (endpoint age times configured maximum CU), Render bandwidth (hourly provider totals for current services) and Render free hours (current free service ages including sleep). The two compute/hour models are high-side planning estimates for current resources, not authoritative bounds on total bills: deleted resources, prior sizing and plan changes are unknown. All allowances assume the configured accounts remain on the stated Free/Hobby plans. Percentage text can exceed 100; visual bars cap at 100. Missing/invalid data remains unknown, never zero. Restored historical bookings are not used to infer new-account traffic.

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

15/15 usage and session tests pass; admin TypeScript check passes. Tests cover missing versus genuine zero, expired periods, true over-limit percentages, duplicate/missing/out-of-period bandwidth, current-resource age models, route auth before provider execution, health-only targets, single-flight caches and secret-free results. Independent source review and narrow-screen interaction checks subsequently passed as recorded below. Desktop-width resizing and public verification remain pending.

Official references: [Render bandwidth API](https://api-docs.render.com/reference/get-bandwidth), [Render free limits](https://render.com/docs/free), [Neon project API](https://api-docs.neon.tech/reference/getproject), [Neon metering API scope](https://api-docs.neon.tech/reference/getconsumptionhistoryperprojectv2), [Neon allowances](https://neon.com/pricing).


## Additional traffic planner

The new calculator is local to the browser, with no persistence or database calls. Inputs are additional active ride-hours, complete APK downloads and changed complete backup uploads before the current month resets. Initial values (10 ride-hours, 10 downloads, 4 uploads) are explicitly examples. They are not demand predictions. It adds only future scenario traffic to the latest current-service Render baseline; the baseline and scenario are visibly separate. Missing baseline leaves the total unknown while preserving the useful scenario subtotal. Restored historical booking totals never enter this model.

Visible coefficients are 1.448 MB decoded application JSON per active ride-hour, 63.9 MB per APK and 38.47 MB per changed full backup. The ride observation comes from the prior 5-second poll/GPS run that failed the latency gate; traffic size is not capacity proof. It includes JSON request/response sizes and excludes wire overhead, compression, socket/provider traffic, most portal traffic and future growth, so it is not an authoritative outbound bill. No Neon usage is inferred from Render traffic. All amounts use decimal MB/GB. Over-limit percentage text remains visible; the bar caps at 100%.

Review fixes: provider non-success bodies are cancelled before returning sanitized errors; usage copy now distinguishes database-free metering from the health checks above it; keepalive resolves the existing canonical socket URL environment name.

## Root browser and build verification, 15 October 2026, 9:15 PM IST

Admin production build succeeded. Independent root run passed all 15 tests, comprising 13 usage tests plus 2 signed-session tests. Admin typecheck passed. Expanded client-static scan found none of 8 actual private values across 67 generated files. Independent backend peer found no material auth, scope, estimate or health-query issue.

The actual authenticated local page returned selected alternate-account provider readings. Neon transfer displayed 0.34% with delayed-reading caveat; Render current-resource hourly aggregate displayed approximately 1.87%. Refresh retained the shared cached reading. The 30-second health status advanced and reported both local services responding. Three editable inputs were driven, including blank-invalid, all-zero and 100-APK scenarios. The over-limit scenario displayed approximately 133.04% and zero modelled remaining; no text clipping at 100%. Expanding the assumptions exposed coefficients and exclusions. At the actual narrow browser viewport of 505 CSS pixels, document width was 495 pixels, with no horizontal overflow. Saved screenshot: jr-oct15-portal-qa/usage/monthly-usage-default.png in the local review artifact folder. Desktop-width resizing, public deployment and exact production-origin health checks remain pending.

# Hosted 50-ride verification

Prepared 15 October 2026. **Not run against hosted services.** This is executable test preparation, not a hosted capacity result. The earlier local result is not reused as hosted evidence.

## Earlier evidence and why this runner is separate

The prior runner is `services/api-server/test/load.integration.cjs`. Its local-only database and endpoint guards remain unchanged. The retained result is:

`/Users/kumar.sh/.codex/visualizations/2026/10/09/01a1206d-0b1b-7873-b5a1-7923185ff9c2/jr-team-review-20261011/evidence/jr-team-load-results.json`

It reports 50 local rides, 100 sockets, 608.4 seconds, 12,100 HTTP200 responses, 6,000 GPS events, HTTP p95 1,757.6ms and GPS p95 260ms. Its environment explicitly says isolated local PostgreSQL/API/Socket.IO. Free hosting, provider limits, mobile renderers, push delivery and dispatch selection are excluded.

The separate hosted runner is `scripts/hosted-load/run.cjs`. Run-specific fixture IDs, hosted origins, build identity, endpoint latency/status summaries, realtime delivery, rejected-point checks, cleanup state and exclusions are written to a new JSON report. Failures retain a report too, once runtime starts. Configuration guard failures stop before any database mutation.

## Current external blockers

- The October15 release ledger records production PostgreSQL error53000, account/project quota exceeded. A usable hosted test database with verified remaining compute/storage/connection quota is required. The user dashboard confirms Neon network transfer exhaustion at5.54GB; reset time remains unverified. An additional branch on an exhausted project does not establish fresh quota.
- Hosted Render API/realtime test services must exist and be deployable. The parent task verified API/socket billing suspension through the Render API. A later user screenshot confirms5.76/5GB bandwidth, with only98.83/750freehours consumed. Provisioning/restoration remains pending. This preparation performs no subscription/billing action. Paid plans are not assumed authorized.
- Keep the earlier decision to retain free hosting unless the user changes it. If the available account cannot provision isolated free services, stop and report the blocker; do not substitute a local result or aim this runner at production.
- If a new hosted test deployment uses different regions, service plans, instance counts or DB pool limits from production, record those differences. A passing result applies to that tested topology, not automatically to production.

## Exact prerequisites

1. Provision a **separate hosted API, realtime service and PostgreSQL test database**, using the reviewed candidate build. No production database, copied patient/driver data, production push tokens or shared credential files. Use a dedicated database name beginning `jr_load_`, for example `jr_load_oct15_a`; the runner rejects `neondb` and local aliases.
2. Apply the candidate's normal schema/migrations to that database. Leave users/drivers/bookings empty on the first run. Previously retained records are allowed only when they are load-prefixed demo identities with no push tokens and no active rides. A seed-only default hospital is acceptable only with no real contact or portal access.
3. Use fresh test-only JWT/internal/admin secrets. API and realtime must use the same test JWT secret and same isolated database. The API internal realtime URL/secret must target the isolated realtime service. Do not disable ordinary rate limits or turn on demo/OTP bypass to make the test pass.
4. Disable outbound FCM, SMS, email, backup/export integrations and any production webhooks on both test services. Unset their credentials. The runner never registers a device token and requires all users/drivers to have null push tokens. The database marker below is an operator attestation, not remote proof of environment variables; deployment configuration review remains necessary.
5. Set deployed build metadata so both `/health` endpoints report the **same exact 40-character candidate commit SHA**. `/health/db` must succeed. Secure admin credentials are not needed by this runner. Keep HTTP endpoints and DB connection on TLS, with valid certificates.
6. Record service region, plan, CPU/memory, instance count, maximum DB pool/connections, database compute/storage usage, deployment SHA and test-client region. Synchronize client/API/socket clocks; GPS validation uses timestamps. Record provider console usage before and after the optional map phase.
7. Confirm hosted test authorization and available resource budget. No production record deletion or billed upgrade is part of this preparation. Define the acceptable latency thresholds before running; the example uses HTTP p95<=2,000ms and realtime delivery p95<=1,500ms. These are proposed test criteria, not measured guarantees or contractual SLA.

An operator provisions this marker **only inside the verified isolated test DB**. Replace all three identifiers with the approved manifest values. Do not create this marker in a production DB to bypass the guard.

```sql
CREATE TABLE jr_load_environment (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  environment_id text NOT NULL,
  api_origin text NOT NULL,
  socket_origin text NOT NULL,
  outbound_notifications_disabled boolean NOT NULL CHECK (outbound_notifications_disabled)
);
INSERT INTO jr_load_environment
  (environment_id, api_origin, socket_origin, outbound_notifications_disabled)
VALUES
  ('jr-load-oct15-a', 'https://YOUR-ISOLATED-API', 'https://YOUR-ISOLATED-SOCKET', true);
```

## Workload and measurement

| Phase | Exercise and assertion |
|---|---|
| Guard/readiness | Match HTTPS origins, build SHA, DB name and marker; reject non-load accounts, push tokens and prior active rides. Health latency is reported separately and is not silently removed from the report. |
| Fixtures | Create exactly50 users,50 drivers,50 REQUESTED rides and matching eligible-offer audit rows in one DB transaction. All have a unique run namespace and is_demo=true. Read a unique fixture through API before proceeding to prove DB binding. |
| Acceptance | Real hosted HTTP accepts all50 offers; assert each assigned driver and state. **Nearest-driver ranking and booking creation are bypassed by fixture provisioning and are not covered.** |
| Realtime setup | Connect50 user and50 driver sockets. Subscribe users to their own ride and attempt the next ride. Send50 probes; require delivery to each owner with no cross-ride event. Cross-user HTTP reads must return403. |
| Steady traffic | Default120 five-second cycles:50 concurrent booking polls and50 GPS uploads per cycle, plus50 socket GPS emissions. Exactly12,000 steady HTTP calls and6,000 steady GPS emissions. Record overrun cycles instead of hiding a slowed workload. |
| Reconnect | Disconnect/reconnect25 users, resubscribe on connect, send25 fresh probes and verify actual event delivery. A connected flag alone is not counted as recovery. |
| Buffered GPS | Replay1,000 previously unsent points, twice concurrently per driver. Assert exact acknowledgements, no duplicate persisted rows, and expected total row count. Mixed own/other-ride batch must acknowledge only the owned point and explicitly retain the rejected point in the test's accounting. This is server-protocol verification, not an Android AsyncStorage test. |
| Pickup | Drive all50 through ARRIVED and verified OTP to PICKED_UP; assert the saved drop coordinates. |
| Optional provider phase | Fresh GPS,50 distinct-coordinate landmark queries and50 live-ETA calls, capped at100 client map HTTP requests. Require landmarks to report Google and live ETA to report available Google route geometry. HTTP200 with available=false is a failed provider phase. |
| Completion | Complete all50 via HTTP and settle zero-value PILOT100 receipts; assert final state and amount. No real payment provider is called. |
| Cleanup | Disconnect all sockets; cancel only this run's unfinished demo rides and set only this run's drivers OFFLINE. Retain rows for evidence. No deletion. Cleanup failure makes the entire result FAIL. |

Default steady traffic plus100 buffered replay requests reproduces the earlier12,100-request subworkload. The hosted report's **total is larger** because guards, acceptance, isolation, pickup, completion, receipts and optional maps are measured too. The GPS total includes50 initial and25 reconnect probes in addition to6,000 steady updates.

The runner samples latency from the same external client clock. GPS delivery latency uses a monotonic timer keyed by rideID/timestamp; it does not subtract the hosted server clock. It detects missing, duplicate, unexpected and wrong-ride events. Timeouts, unexpected HTTP status, socket errors, wrong content, latency-budget breaches or cleanup errors fail the run. Repeated socket packet loss also trips a bounded backlog guard.

## Optional Maps budget

Default `mapsEnabled` is false. It must remain false until real-provider quota/budget is checked. For the provider phase set `mapsEnabled:true`, `maxMapHttpCalls:100`, `providerQuotaBudgetConfirmed:true` together. The cap is **100 calls to our proxy, not100 guaranteed billable upstream operations**: caching, fallback/retries, reverse geocoding and provider implementation may fan out. Review current Google project quotas, selected APIs, key restrictions and cost budget separately, without printing keys. Do not assert the phase is free based on old pricing assumptions.

This is a short50-user provider burst, not continuous50-user route polling for the full soak. Distinct nearby coordinates reduce obvious shared-point cache reuse but do not guarantee cache misses. Actual upstream request count must come from provider telemetry. Failure/degradation and observed key/quota errors must remain in the report.

No HTTP test proves50 simultaneous WebView/Google map renderers. Native two-ride renderer crash, repeated signal loss, OTP transition and actual phone checks remain separate release evidence.

## Commands after prerequisites are met

Copy `scripts/hosted-load/config.example.json` to an ignored, task-local manifest. Fill the real isolated origins/database/build. The example intentionally has isolation confirmations false so it cannot run unchanged. Flip those booleans only after inspecting the isolated deployment. Keep secrets out of this manifest.

```sh
node --test scripts/hosted-load/guards.test.cjs
node --check scripts/hosted-load/run.cjs
node scripts/hosted-load/run.cjs --plan /absolute/path/isolated-hosted-load.json
```

The plan command reads no credential environment variables and makes no network/database calls. It prints only the intended scope and hosts.

For the actual run, the operator's secure environment must provide:

- `JR_HOSTED_LOAD_DATABASE_URL`: dedicated hosted test DB URL, matching the manifest database name, with `sslmode=require`.
- `JR_HOSTED_LOAD_JWT_SECRET`: dedicated JWT signing secret shared by the isolated API/realtime services, at least32 characters.
- `JR_HOSTED_LOAD_CONFIRM`: exact manifest environmentId, for example `jr-load-oct15-a`.

```sh
node scripts/hosted-load/run.cjs --run /absolute/path/isolated-hosted-load.json /absolute/path/new-hosted-load-report.json
```

Never place secret values directly in shell command arguments or share the environment file. The runner does not accept production admin credentials. Reports are mode0600, contain synthetic fixture IDs but no JWT/DB credentials, and refuse to overwrite previous evidence. Review a report before sharing it.

For a30-minute soak use360 cycles. For an initial one-minute smoke use12 cycles; do not present that as the full10/30-minute result. Do not run multiple copies concurrently against the same test database. Repeated runs retain their rows and need sufficient disk quota.

## Interpreting results honestly

- `PASS` applies only to the exact recorded hosted topology and scoped workload. It does not certify physical phones, foreground/background audio, map rendering, user login, true create-to-dispatch selection, automatic failover, free-host uptime or future quota headroom.
- A new replica/isolated service result is not a production load result. Describe it as a hosted staging capacity test unless production is tested separately under an explicitly reviewed safe plan.
- For sleeping free services, run a separate verified cold-start check after the documented provider idle interval, then run the normal soak. The first `/health` latency is retained, but this runner does not guarantee the instance was asleep beforehand.
- Observe hosted provider logs, memory/CPU, DB connections/compute and429/5xx counts alongside this report. Do not relax thresholds or remove failing periods to manufacture a pass.
- This code was syntax/guard-tested during preparation. No hosted services, database credentials or live quotas were accessed by the author. Full runtime execution is pending provisioning and the current quota/billing access blockers.

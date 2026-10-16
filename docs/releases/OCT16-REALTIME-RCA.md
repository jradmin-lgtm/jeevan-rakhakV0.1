# Realtime reconnect investigation

Recorded 16 October 2026, 09:43 AM IST. Scope: investigate the three missing realtime events in hosted run 38806877311. No hosted load, production restart, runtime change, APK rebuild, billing change or provider call was performed for this investigation.

## Finding

A reconnect timing failure mechanism is reproduced locally. The hosted test closes five user connections, then emits its first probe only 1.1 seconds later. The unchanged app uses automatic reconnection with a one-second base delay and jitter. Booking subscription also requires a server-side ownership lookup before joining. Therefore a probe may be broadcast before the intended user is connected and subscribed. The server broadcasts current points without replaying earlier websocket events.

This is a confirmed local mechanism, not conclusive historical attribution. The hosted wrapper retained aggregate counters but omitted per-event send/receive/room timing and removed its temporary raw report. The original hosted result remains **3,667/3,670, raw realtime FAIL**. Its three exact missing events cannot be retrospectively classified from the saved aggregate. Do not relabel them as expected, recovered or passed.

## Observed reproduction

Exact socket-server source from commit `563cbd9`, with its configuration and database module checked against the same commit, ran against a new disposable local PostgreSQL 16 database. Source-hash-pinned app socket code and actual user-screen subscribe/receive handlers ran in separate device contexts. A local snapshot adapter replaced the HTTP boundary. A diagnostic observer recorded actual Socket.IO room membership at each broadcast without changing join/broadcast return values. Auxiliary TypeScript loader workers were excluded from observation.

| Measurement | Observed |
| --- | --- |
| User/driver connections | 20 across 10 synthetic rides |
| Normal tracking | 60/60, zero missing |
| Controlled reconnect rounds | 6, five user closures per round |
| Controlled-window delivery | 105/120 |
| Missing while intended user absent | 15, all controlled windows and all clients still disconnected at emit |
| Missing while intended user present | 0 |
| Missing with unknown broadcast membership | 0 |
| Duplicate/cross-ride events | 0/0 |
| Natural disconnects/connect errors | 0/0 |
| Exact broadcasts recorded | 180 |
| Duration | 47.097 seconds |
| Hosted test requests | 0 |
| Cleanup | Child server exited; only owned disposable local database dropped |

The normal phase and the controlled phase are different measurements. The combined raw result remains FAIL because dropped events remain dropped. The original hosted test separately verified 1,412 expected unique persisted GPS rows and zero unexpected GPS HTTP errors. Realtime websocket delivery and durable GPS upload are separate paths. This local run did not retest HTTP persistence, Maps, push, Android UI or hosted capacity.

## What changed

Added a local-only reproducible diagnostic, a room-membership observer and seven attribution/scope regression cases. CI is configured to run the pure regression cases. The new CI configuration has not been run on GitHub. No application, server handler, database schema, key, permission or app flow changed.

Local diagnostic usage on this machine:

```sh
node scripts/hosted-load/realtime-reconnect-diagnostics.cjs --local-only /tmp/jr-realtime-new-private-result.json
```

The diagnostic refuses a reused evidence filename and any database outside its generated loopback-only namespace. It uses the existing `jr-release-audit-20261009` local container on port 5449, creates its own database, uses temporary synthetic credentials, then removes that database after stopping its own child server. It cannot target Render or Neon.

## Preserved failed diagnostic attempts

Attempts 1 and 2 stopped before socket traffic because the observer initially assumed IPC was available in the TypeScript loader worker. Attempt 3 reproduced nine disconnected-recipient misses but failed its normal phase because the first post-reconnect probe ran 300ms after the previous probe, inside the unchanged server's one-second rate limit. The diagnostic now checks the rate boundary before emitting and waits across that phase boundary. Attempt 4 is the successful result above. All four private evidence files and hashes are retained at `/Applications/VsCode Works/12. Jeevan App/LOCAL TEST EVIDENCE/2026-10-16-realtime-rca`. Earlier failures are not overwritten.

## Four-point audit and review

1. Security: only a generated local database and temporary synthetic identities are used; provider secrets are not read or passed. Tests reject nonlocal hosts, wrong ports and the production database name before loading the observer. Child errors are redacted before private evidence is written.
2. Wiring: observer events feed exact point-key matching; missing observer records fail classification rather than becoming assumed offline misses. CI configuration references the new classifier/scope tests; that workflow change has not been run on GitHub. The real socket server and source-bound app subscribe logic ran.
3. Regression: 26 focused tests cover actual app socket/subscription behavior, warmup/freshness, controlled/natural disconnects, raw loss retention, malformed/unknown/duplicate/cross-ride events and local scope guards. No production source changed. The new local integration verifies 60 steady events and 120 controlled-window probes.
4. Cleanup: all four disposable databases and child processes were cleaned up. No live fixtures, provider secrets or scheduled services were created. Unrelated worktree edits are retained.

Seven review classes: empty input and missing observer evidence, rate/phase boundaries, 20 concurrent sockets and 30 controlled closures, setup and missing-delivery failures, malformed/unknown point identities, ten-ride local scale and unsafe target rejection. Hosted 50-ride scale, physical-device behavior and exact attribution of the old three events were not reached.

Scoped investigation review: 86/100, correctness 36/40, completeness 16/20, craft 17/20, verification 8/10, rule adherence 9/10. This clears the reproducible diagnostic and finding, not lossless-delivery or universal production sign-off. No second hosted 30-minute run is justified solely to erase the old counter.

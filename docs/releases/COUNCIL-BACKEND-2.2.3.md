# Independent backend council review

Reviewed 2026-10-11 16:17:35 IST. Reviewer: independent backend reviewer. Baseline commit: 46dba9e4f3998ce30c39d4b8a1b94de41d65c4b5. Scope is the current candidate source, bound to council-backend-source-hashes.json. This is approval to release the reviewed backend candidate for testing, subject to the separate native UI review and post-deployment verification. It is not a claim that production is live.

## Verdict

**SHIP: 89/100. No remaining release-blocking defect found in the reviewed backend scope.**

| Dimension | Score |
| --- | ---: |
| Correctness | 36/40 |
| Completeness | 18/20 |
| Craft | 18/20 |
| Verification | 7/10 |
| Rule adherence | 10/10 |

Earlier material findings were corrected: released-ride GPS no longer blocks other rides; unsynchronised data survives authentication expiry; historical assignment windows restrict released-driver uploads; normal bookings use targeted dispatch without becoming SOS; accept/reject is serialised; cycle filters protect legacy polling; normal expiry honours the wave window and redispatch epoch; old pending SOS can recover on availability; startup migration preserves historical epochs; startup retention executes on sleeping-host deployments.

## Independently executed

- 47 unit tests passed, 0 failed: driver background tracking and location queues; shared cache, maps, analytics queue and control tests; backend map concurrency and landmark tests. Output: council-backend-tests.log.
- Four controlled tests executed the actual cascade module with dependency barriers. Stopping during socket delivery suppresses push. Stopping during push compensates with dismissal. A superseded cycle before emission suppresses emission. A superseded cycle during push compensates with dismissal. Output: council-backend-race-results.json.
- Executed both fresh-schema and legacy-history migration branches with a controlled SQL adapter. Fresh branch does not reference a missing cancellation table. Legacy branch preserves the latest redispatch epoch. **I did not run the migration against a fresh PostgreSQL database.**
- Reviewed analytics authentication, server-derived identity, strict role/event allowlist, size/rate bounds, retry identifiers, duplicate acknowledgement, 30-day cleanup and account-deletion cleanup. No arbitrary typed properties enter analytics.
- Reviewed map single-flight and short cache keys across all four coordinates, eight active-provider slots, bounded waiting queue and failure eviction. Unit tests confirm 50 distinct route isolation and eight-slot limit. Failure returns no fabricated route and existing caller fallback remains responsible for display.

## Parent-produced evidence inspected, not rerun by this reviewer

- /tmp/jr-team-load-results.json: isolated local 50 rides, 100 sockets, 608.4 seconds; 12,100 HTTP requests returned 200; 6,000/6,000 GPS deliveries; zero cross-ride deliveries, duplicate rows or reconnect failures. HTTP p95 1,757.6 ms; GPS delivery p95 260 ms. This excludes public maps, FCM and sleeping hosting.
- /tmp/jr-team-maps50-distinct-results.json: 50 distinct real Google route pairs with 50 persistent client connections; all ETA, map configuration and landmark requests succeeded in 2,048 ms. Landmark area was shared. This is not 50 physical map renderers.
- /tmp/jr-team-dispatch50-results.json: 50 normal booking creations, 50 initial offers to 50 distinct drivers, and 50 successful acceptances in 5,595 ms, with real Google dispatch ranking and 20-second wave configuration, against isolated API4460.

## Edge classes

| Class | Coverage |
| --- | --- |
| Empty/null | Queue emptiness and missing assignment handled in source and unit paths; migration branch without cancellation history executed with SQL adapter. |
| Boundary | Queue/ack limits, account isolation, dispatch epoch and eight-provider concurrency checked; parent integration covers older-than-24-hour GPS and forbidden post-release samples. |
| Concurrency | Four controlled delivery races executed; 50-route isolation tests executed; parent load and 50-create evidence inspected. |
| Failure | Offline queue retention, provider failure, bad acknowledgement and retry recovery executed in unit suite. |
| Malformed | Landmark/map invalid data and analytics queue checks executed; strict API validation reviewed and parent integration evidence inspected. |
| Scale | Parent local 50-ride, real-provider map burst and dispatch-create results inspected. Free-host production capacity is not established by these local tests. |
| Permission | Queue ownership and route ownership paths reviewed; parent forbidden accept, historical GPS and analytics-role tests inspected. Physical Android permissions and real FCM receipt are outside this review. |

## Release conditions and known limitations

Deploy and verify the backend before publishing the new APKs, because the previous backend can acknowledge older-than-24-hour GPS as expired. Native UI council and exact APK upgrade checks remain separate release conditions. Confirm live build identity and public APK hashes after publication.

Accepted pre-existing free-host sleeping, shared Maps renderer/server credential exposure and legacy signing risks remain. This review does not resolve them or claim production uptime, zero future regressions, physical Infinix compatibility, delivery to 50 physical phones, or real FCM/DND behaviour. No live data or credentials were read by this reviewer. No application source files were edited.

# Hosted production-client resilience check

This is a separate scenario, `PRODUCTION_CLIENT_RESILIENCE`. Earlier strict 10-ride and 50-ride failures remain unchanged. A resilience result is not a strict capacity certification or a free-hosting uptime guarantee.

## Fixed scope

- Ten synthetic users, ten synthetic drivers, ten rides, twenty sockets on the isolated hosted database. Existing marker, source-build, ownership, notification-disabled and cleanup guards apply.
- API build is pinned to `5252631d2bac20e4a4a805137dd6692ec3cbfb46`; socket build remains `0be6a348f78266f44cafb3e022ddb8577ed15f1f`. Generator source identity is reported separately.
- Thirty minutes: user booking reads every five seconds, driver reads every twelve seconds, socket GPS every five seconds. The unchanged production queue saves the first fix and then every third fix, with foreground flush checks every fifteen seconds.
- Nominal steady work: 3,600 user reads, 1,500 driver reads and 1,210 sampled GPS points. GPS batch request count varies with queue recovery. The prior strict workload uploaded GPS every five seconds and omitted driver polling; it was not uniformly three times the whole app workload.
- Production HTTP request timeout is explicitly forty-five seconds, replacing the strict harness's fifteen-second transport timeout only in this scenario. The measured HTTP p95 target stays two seconds. Realtime GPS p95 stays 1.5 seconds; delivery observation stays fifteen seconds.

## Queue and fault proof

The generator packages the unchanged driver `locationQueue.ts`, verifies its exact SHA-256 against the reviewed companion app source, strips types with Node 24, and checks its exact import/export shape before providing private file storage and the hosted HTTP adapter. This is a file-backed test adapter across fresh JavaScript runtimes; it does not claim physical Android storage verification.

A separate controlled stage injects exactly one immediate 502 without sending it upstream. It must retain the point across a fresh queue runtime, retry after the next fifteen-second sync, receive its real ACK within the unchanged two-second HTTP target, and persist exactly one row after duplicate replay. The injected fault is labeled separately from naturally observed network errors.

During steady work, each original network error remains in HTTP status counters and bounded response metadata. Recoverable network failures do not discard queue points. Authentication, ownership, malformed ACK and response-contract failures are fatal. Queue points or failed client operations unresolved for more than sixty seconds fail the scenario. The request timeout and retry cadence do not promise a universal seventeen-second recovery time; that bound applies only to the controlled immediate-502/healthy-next-request test.

## Results and cleanup

- `rawTransportVerdict` describes actual HTTP transport attempts, excluding the explicitly simulated fault. A natural 502 remains a raw failure even when the client recovers.
- `resilienceVerdict` can pass only when the complete workload, lifecycle, offline replay, duplicate checks, access isolation and unchanged latency targets pass with no unresolved points.
- `CLIENT_RESILIENCE_PASS` is deliberately distinct from strict baseline `PASS`. Failed historical reports are preserved by run ID and content hash.
- Every seeded ride is cancelled if still active and its driver placed offline. Queue files and reports contain only isolated synthetic fixture data. No production rows or real provider notifications are used.

One full thirty-minute attempt is authorized after independent source review and native QA cleanup. Further full attempts require a new actionable finding. Provider usage snapshots are taken before and after; delayed provider readings are not exact per-test invoices.

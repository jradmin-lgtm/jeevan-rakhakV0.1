# Explicit production-client realtime resilience V2

This scenario does not replace the failed original raw-capacity measurements or the first client-scenario GitHub result. It is not a 50-ride capacity certificate.

Targets remain the exact isolated API 5252631 and socket 0be6. Only the server-side measurement source changes. App source is unchanged. Actual socket.ts, LiveTrackingScreen refresh/subscription/receive handlers and newerFix execute under SHA256 guards in separate device contexts. Actual locationQueue.ts executes unchanged with a persistent file adapter.

Before the complete 1,800 one-second steady checks, a separate 20-second warmup must obtain a true fresh fix for each of ten users. Warmup stale-age readings are reported separately and never restart on a reconnect. During the entire subsequent 30 minutes, each effective UI fix timestamp must increase and remain at most 30 seconds old. The timestamp comes from the original GPS event or authorized booking.driverPosition.lastSeenAt, never the receipt time.

User reads run at five seconds, driver reads at twelve seconds, socket fixes at five seconds, durable GPS samples/foreground flushes at fifteen seconds. The app's 45-second HTTP timeout and 60-second unresolved HTTP/queue bound remain explicit. HTTP p95 remains at most 2 seconds, received realtime p95 at most 1.5 seconds. Auth, ownership, malformed response/ACK, cross-ride events and duplicate WS events are fatal.

Sockets use the actual app's infinite 1 to 15 second reconnection policy. The actual user connect handler resubscribes to the same ride and refreshes its authorized snapshot. Each disconnected role must regain a fresh own socket point within 20 seconds. Same-fix HTTP and socket observations are not counted as duplicate WS messages. Controlled closures consume one marker only; extra natural closures remain visible.

Raw expected/received/missing events, natural and controlled disconnects and each recovery duration remain in the report. The original 15-second raw drain is retained. Missing raw events produce RAW_REALTIME_FAIL; they do not skip the mandatory offline, ownership and lifecycle checks if actual UI freshness and recovery remain within the separately approved bounds. Raw transport, raw realtime, raw socket and application resilience verdicts are separate.

A socket-only five-second tail continues while final HTTP requests settle after all 1,800 steady checks. It adds no HTTP GPS samples. Raw drain captures its entry set and only declares pending points at least 15 seconds old as deadline misses. A successful recovery closes the UI observation window before awaiting late authorized HTTP responses; later disconnects are counted separately and any late authorization or protocol error remains fatal.

After steady state, five actual user engines close and automatically rejoin before fresh delivery is checked. The realtime observation window then closes intentionally. The test must still replay all 200 offline points twice, retain the rejected foreign-owner point, persist exactly 1,412 unique HTTP GPS rows, complete arrival and verified pickup for ten rides, complete ten rides and settle all ten zero-price pilot receipts. Fixture cleanup is scoped to the exact owned synthetic run.

The bounded one-ride proof ran 15 October, 11:48:14 PM to 11:49:35 PM IST: both forced connections regained fresh WS points in about five seconds, authorized post-reconnect snapshots succeeded, and cleanup was independently checked. One raw event remained missing and is explicitly retained as raw FAIL. This functional proof does not certify the full 30-minute scenario. The full V2 run requires separate source/aggregate review and a new run identity before its single authorized execution.

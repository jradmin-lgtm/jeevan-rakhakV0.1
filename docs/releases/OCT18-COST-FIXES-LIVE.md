# Live release: direct APK delivery and incremental backups

Updated 18 October 2026, 12:41 AM IST. Owner authorization: "lets go live". This record supersedes the local-review-only status dated 18 October 12:20 AM IST. The unchanged 2.2.4 build 59 apps remain a controlled team pilot, with earlier limitations retained.

## Observed live

- API source **9dfa945c6e2b40545115242d0c6c7c543594b2ed**, Render deployment **dep-db9sen6q1p3s739ea8ag**, completed 18 October 2026 at 12:38:06 AM IST. Health and database health passed. [API health](https://jr-api-v1-20261015.onrender.com/health).
- Realtime source remains **563cbd9eeb859b914f1874b6d2086de11b115f3e**, observed healthy. No socket deployment, portal deployment, APK build, database migration of patient data, paid-plan change or hosted load test was performed.
- Only API environment changes: APK_DOWNLOAD_MODE=drive and DB_BACKUP_MODE=incremental. All other API environment values match the frozen pre-release snapshot. Render remains free with autodeploy disabled.
- [Production CI run 39060909736](https://github.com/jradmin-lgtm/jeevan-rakhakV0.1/actions/runs/39060909736) passed on this exact source, including typecheck, backup/Drive regressions, isolated PostgreSQL increment recovery, booking/permissions, SOS, location, offline and realtime regression steps.

## Downloads

The printed [QR link](https://jr-admin.vercel.app/qr) still opens the existing contact/download page. Actual patient and driver browser journeys reached Download started and stayed on the portal. Independent live endpoint checks verified a 303 to the fixed Google file host, anonymous APK ZIP bytes, attachment filename, expected complete-file length and rejection of reused one-time tokens. Only bounded prefixes were read in these live HTTP checks. Full signed-out files had already been downloaded locally and matched published SHA256 values before deployment. The browser's final download-manager completion and physical Android installation were not observed in this release check.

Both current APKs remain 2.2.4 build 59 with the same signing certificate. No app update is required to benefit from this server-side cost fix. Link access was approved for only the two release APK files; no folder, backup or credential permissions were changed. Copied public APK links can bypass contact collection as previously accepted. Normal browser/Android install protections still apply.

## Backup status

Incremental mode is live. Startup logged a source-matched backup inside the six-hour cooldown and scheduled the next due time rather than exporting again. Source-matched Drive metadata before and after deployment is identical: **no duplicate backup was created at startup**. The retained full backup is 38,634,987 bytes, taken 17 October 2026 at 8:22:30 PM IST.

The first new scheduled run is due around **18 October 2026, 2:22 AM IST**, provided the free service is running; provider sleep or a retry can delay it. Its upload and production recovery remain **pending observation**, not reported as passed. No backup was forced for rollout. New increments capture insertions, edits and deletions, reuse verified existing documents, and are applied locally for checksum validation before upload. A database writer lease prevents overlapping current-code writers. Earlier chain files must remain available. After 28 increments, a changed snapshot creates a full baseline.

The 46 focused local tests passed, including real PostgreSQL recovery and 12 concurrent lease contenders with one winner. A small-change, 22-table rehearsal used a 2,733-byte increment versus a 38,479,719-byte full snapshot. That is a sample, not a guaranteed future increment size or measured live savings. New document content still needs upload.

## Cost and scope

Future approved direct APK downloads send their large file payload from Drive, bypassing Render. Regular increments avoid repeatedly uploading unchanged document bytes; periodic full baselines and genuine new data remain. Past quota consumption cannot be recovered. The last audit on 17 October read approximately 32.7% Render bandwidth and 4.7% Neon transfer, subject to provider lag/estimate qualifications; this release did not fetch a new billing reading. Earlier legacy full-copy/APK-proxy monthly examples are historical and should not be reused as this release's forecast. Free hosting still has sleep, running-hour and bandwidth limits. No 50-ride certification or monthly free-capacity promise is made.

Shared Maps-key/signing custody, physical Infinix/alert validation and the prior raw realtime-delivery gap remain in the existing pilot ledger. No change here closes those separate risks.

## Rollback and evidence

The pre-release source is 563cbd9 and the pre-release API deployment is dep-db8kjak9v7es73eju760. Before any v3 increment exists, an older source still reads the retained v2 full backup. After a v3 chain exists, create and verify a complete v2 baseline with the new code's explicit full mode before rolling source back. Do not point old backup code at a v3 head without that step. Keep database/credentials/accounts and chain parents intact.

[Implementation and local tests](OCT18-COST-FIXES-LOCAL.md) | [Private release evidence](</Applications/VsCode Works/12. Jeevan App/LOCAL TEST EVIDENCE/2026-10-18-cost-fix-release>) | [Live download handoff](</Applications/VsCode Works/12. Jeevan App/LOCAL TEST EVIDENCE/2026-10-18-cost-fix-release/live-download-portal.png>).

The private evidence includes exact environment binding, deployment journal, successful CI, live download prefix checks, startup cooldown logs and unchanged backup metadata. Source mirrors preserve unrelated primary work. No new production ride or load fixtures were created; only labelled download-event checks were recorded.

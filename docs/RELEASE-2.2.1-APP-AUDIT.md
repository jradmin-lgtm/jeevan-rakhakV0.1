# Release 2.2.1 app and portal audit

Reviewed 10 October 2026, 09:39 AM IST. Prepared for the authorised controlled testing release, not universal launch acceptance.

## 1. Security

Known configured private credential values and signatures: zero findings in both final production APKs and scanned Git blobs. Public runtime Maps key remains shared with the server, explicitly retained by the user until Google Cloud access returns. Two legacy signing keys remain in history. The same signing certificate is deliberately retained for upgrades. Nine residual dependency advisories remain documented; no clean-audit claim. No new paid service or permission expansion.

## 2. Controls and integration

Derived source audit: 402 controls across 201 files, zero missing-handler or syntax findings. This is not 402 executed interactions. The final UI repeat exercised booking/service selection, map zoom/recenter, nearby-place scrolling, manual directions, SOS address/landmark display, dismiss and driver availability. Portal cancel, disable/re-enable, edit cancellation and KYC missing-document rejection were exercised on isolated fixtures.

## 3. Regression evidence

User, driver and portal typechecks pass. Portal production build passes. Existing evidence includes 31 targeted tests, ten integration suites, access isolation and 50-ride soaks. Backend files are byte-identical to verified-live c968ea5. The UI-only refinement does not invalidate the unchanged backend load evidence, whose free-host, FCM and 50-renderer exclusions still apply.

Both exact final production APKs passed signature, version 2.2.1/code 55, runtime, HTTPS endpoint, non-debuggable and four-ABI checks. Android 11 installed each over real 2.2.0/code 54 and retained an app-private marker, then cold-started. This does not establish authenticated-session migration or physical Infinix compatibility.

## 4. Release hygiene and scope

Release uses an isolated checkout with 36 explicitly selected UI, portal and documentation files, based on c968ea5. Backups, generated build outputs, old APKs, unrelated ignore-file edits and local credentials are excluded. New lines contain no em dash or obvious private-token signatures. Existing flows, themes, API coverage, ops login, maps provider and signing identity are preserved.

The review board has 66 entries, 51 images and 16 paired comparisons. Missing states remain labelled. Full visual acceptance, physical sound delivery, Infinix failure reproduction, free-host availability and the old emulator ANR root cause remain unverified.

Publish only after exact live commit and APK download-hash verification. Printed /qr URL stays unchanged.

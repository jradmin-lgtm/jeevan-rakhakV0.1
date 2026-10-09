# Universal print QR verification

The actual file `../QR Universal/qr-jr-universal-hq.png` was decoded using macOS Vision on 9 October 2026. Its payload is exactly:

https://jr-admin.vercel.app/qr

`apps/admin-web/app/qr/route.ts` reads `QR_REDIRECT_TARGET` and otherwise redirects to `https://jr-admin.vercel.app/download-apk`. The existing print image can remain unchanged when the destination changes behind this route. Keep the host and `/qr` route available. Do not print a direct Drive APK URL in its place.

New APK upload and exact download-byte verification are pending the final release gate. The source and current redirect check alone do not prove that the new APKs are already available.

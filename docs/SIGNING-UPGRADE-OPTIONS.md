# Android upgrade compatibility and signing options

Decision confirmed by Kumar on 10 October 2026: retain the existing signing certificate for this release. No certificate rotation or reinstall migration is authorised.

## Current release

Both package names remain unchanged: `com.jeevanrakshak.user` and `com.jeevanrakshak.driver`. The production candidates use version 2.2.1, code 55, following 2.2.0, code 54. Their signer SHA-256 is `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`.

Users should download through the same printed QR and install over the existing app. They should not uninstall first. Android must accept the same package and certificate with the higher version code. Storage pressure, installer permissions, a differently signed prior installation or unsupported Android versions can still block an installation. Authentication continuity must be checked independently of installer compatibility.

The old signing key exists in repository history. Continuing to sign with it preserves upgrades but does not close that security finding. Removing a file from the working tree does not revoke existing copies. The release should be described as a supervised testing release with this risk explicitly recorded.

## Migration options for review

| Option | Upgrade impact | Security effect | Recommendation |
|---|---|---|---|
| Retain current certificate | Existing supported installations can update in place when package/version checks pass | Legacy signing-key exposure remains | Selected for this release |
| Use proof-of-rotation and a new protected key | Android 9+ supports rotation lineage; apksigner can retain the original signing key for older platform versions. Exact Android 9, 11, 12L, 13 and 15 upgrade paths need testing | Modern devices can trust the new key; keeping old signatures for legacy devices retains some old-key risk | Prepare separately after account access is restored |
| New key without a valid upgrade path, or a new package | Existing users can need reinstall or a separate app installation | Separates the new app identity, but creates migration and session risks | Does not match the current instruction |

Before rotation, register the replacement certificate with Google authentication, Firebase and any certificate-restricted Maps integrations. Test actual signed APK upgrades with stored preferences and authenticated sessions. Protect the private key outside the repository and restrict release signing access. No new key was created or activated in this review.

Sources: [Android app signing](https://developer.android.com/studio/publish/app-signing), [apksigner rotation options](https://developer.android.com/tools/apksigner), [APK Signature Scheme v3](https://source.android.com/docs/security/features/apksigning/v3).

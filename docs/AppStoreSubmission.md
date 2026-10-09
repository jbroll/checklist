# App Store Submission

Combined status and steps for shipping the Capacitor mobile apps. Detail for Play listing copy, privacy, and signing lives in `docs/GooglePlayStore.md`; asset dimensions live in `playstore/README.md` and `appstore/README.md`.

App identity: bundle id `com.kjekit.app` (`capacitor.config.ts`, `android/app/build.gradle`, Xcode `PRODUCT_BUNDLE_IDENTIFIER`), app name `kjekit`. Android is at `versionCode 1` / `versionName "1.0"`.

## Current status (verified 2026-10-03)

| Item | Status | Location |
|------|--------|----------|
| App icon (Play 512x512) | Present | `playstore/icon-512x512.png` |
| Feature graphic (1024x500) | Present | `playstore/feature-graphic-1024x500.png` |
| Play screenshots | Missing (folder holds only README) | `playstore/screenshots/` needs 2-8 |
| App icon (Apple 1024x1024) | Present | `appstore/icon-1024x1024.png` |
| iPhone 6.5" screenshots | Missing (folder holds only README) | `appstore/screenshots/iphone-6.5/` needs 2-10 at 1284x2778 |
| iPhone 6.7" screenshots | Missing (folder holds only README) | `appstore/screenshots/iphone-6.7/` needs 2-10 at 1290x2796 |
| Short description (79 chars) | Ready | `short-description.md` |
| Full description (~770 chars) | Ready | `full-description.md` |
| Privacy policy source | Ready (`privacy.md`; `build-legal.js` generates the HTML) | `website/privacy.md` |
| Play developer account + signing key | Missing | see `docs/GooglePlayStore.md` |
| Release AAB | Missing | build steps below |
| Web bundles (`cap sync` output) | Fresh (rebuilt 2026-10-03) | `android/.../public/`, `ios/App/App/public/` (gitignored) |

## Shared prerequisites

- Prod backend live at the URL the mobile build talks to (`capacitor.config.ts` `server.url`, default `https://checklist.rkroll.com`, overridable via `CAPACITOR_SERVER_URL`).
- Production OAuth redirect URIs registered (Google console, Apple return URLs) for the prod domain.
- Privacy policy hosted at a public URL and referenced in both listings.
- Listing copy: `short-description.md` and `full-description.md` are the source of truth; verify the feature list matches the shipped build before submitting.

## Google Play

1. Create a Play developer account and complete identity verification.
2. Generate a release keystore, keep it out of git, and wire `signingConfigs release` in `android/app/build.gradle`. Prefer Play App Signing.
3. Capture 2-8 phone screenshots into `playstore/screenshots/` (recommended: folder tree, list items, shopping session, autocomplete, share dialog, shared-list indicator). Spec in `playstore/README.md`.
4. Build the release artifact:
   ```bash
   npm run build
   npx cap sync android
   cd android && ./gradlew bundleRelease
   # android/app/build/outputs/bundle/release/app-release.aab
   ```
   Increment `versionCode` per upload; bump `versionName` for user-visible releases.
5. Pre-release test on a physical device: OAuth against prod URLs, offline use, invite deep links.
6. Play Console: create the app, fill store listing (icon, feature graphic, screenshots, descriptions, privacy URL), complete content rating, target audience, Data Safety, and ads declarations.
7. Upload the AAB to an internal testing track first, then promote through testing to production. See `docs/GooglePlayStore.md` for the full checklist.

## Apple App Store

1. Enroll in the Apple Developer Program; create the App Store Connect record for `com.kjekit.app` with signing certificates and provisioning profiles.
2. Capture screenshots: 2-10 per size into `appstore/screenshots/iphone-6.5/` (1284x2778) and `appstore/screenshots/iphone-6.7/` (1290x2796). Spec in `appstore/README.md`.
3. Build and archive:
   ```bash
   npm run build
   npx cap sync ios
   npx cap open ios
   # Archive in Xcode and upload to App Store Connect
   ```
4. Fill the App Store listing (icon, screenshots, descriptions, privacy URL), age rating, and privacy nutrition labels; submit for review.

## Quick commands

```bash
npm run build                 # web build (cap:build also runs cap sync for all platforms)
npx cap sync android          # copy web assets + update android project
npx cap sync ios              # copy web assets + update ios project
npx cap open android          # open in Android Studio
npx cap open ios              # open in Xcode
cd android && ./gradlew assembleDebug    # debug APK for device testing
cd android && ./gradlew bundleRelease    # release AAB for Play Store
```

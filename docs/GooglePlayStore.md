# Google Play Store Submission Checklist

Guide for publishing kjekit/CheckList to the Google Play Store.

*Created: December 2025*

---

## Prerequisites

### Developer Account
- [ ] Create Google Play Developer account at https://play.google.com/console
- [ ] Pay $25 one-time registration fee
- [ ] Complete identity verification (can take 24-48 hours)

### App Signing
- [ ] Generate release keystore:
  ```bash
  keytool -genkey -v -keystore kjekit-release.keystore \
    -alias kjekit -keyalg RSA -keysize 2048 -validity 10000
  ```
- [ ] Store keystore securely (NEVER commit to git)
- [ ] Configure `android/app/build.gradle` for release signing:
  ```gradle
  android {
      signingConfigs {
          release {
              storeFile file("kjekit-release.keystore")
              storePassword System.getenv("KEYSTORE_PASSWORD")
              keyAlias "kjekit"
              keyPassword System.getenv("KEY_PASSWORD")
          }
      }
      buildTypes {
          release {
              signingConfig signingConfigs.release
          }
      }
  }
  ```
- [ ] Consider using Google Play App Signing (recommended)

---

## Store Listing Assets

### Required Graphics

| Asset | Size | Status | Notes |
|-------|------|--------|-------|
| App icon | 512x512 PNG | VERIFY | Check `resources/icon.png` |
| Feature graphic | 1024x500 PNG/JPG | MISSING | Banner shown at top of listing |
| Phone screenshots | 1080x1920 (min 2) | MISSING | 2-8 screenshots required |
| Tablet screenshots | 1920x1200 (optional) | SKIP | Can add later |

### Screenshot Recommendations

Capture these key screens:
1. **Main dashboard** - Folder tree with templates
2. **Template editor** - Showing nested categories
3. **Shopping session** - Items being checked off
4. **Share dialog** - Collaboration feature
5. **Dark mode** - Show theme support
6. **Profile/settings** - Account management

Tools:
- Android emulator screenshot: `adb exec-out screencap -p > screenshot.png`
- Add device frame: https://deviceframes.com or Android Studio

### Feature Graphic

Create 1024x500 banner with:
- App name/logo
- Key value proposition
- Brand colors (#76daDA for kjekit, #22c55e for CheckList)
- Optional: device mockup showing app

---

## Store Listing Content

### App Details

| Field | Limit | Current | Status |
|-------|-------|---------|--------|
| App name | 30 chars | "kjekit" | OK |
| Short description | 80 chars | 79 chars | OK |
| Full description | 4000 chars | ~770 chars | OK |

### Short Description

Current (79 chars):
> Organize lists in folders. Real-time sync, offline support, encrypted. No ads.

### Full Description

Current content in `full-description.md` is ready:
- [x] Updated branding to "CheckList"
- [ ] Verify feature list matches current functionality
- [ ] Consider adding category-specific keywords for discoverability

### Categorization

- **Category**: Productivity (primary) or Shopping (if available)
- **Content rating**: Complete IARC questionnaire (likely "Everyone")
- **Target audience**: 13+ (no child-directed content)

---

## Privacy & Compliance

### Privacy Policy
- [x] Create privacy policy page (`website/privacy.html`)
- [x] Host at public URL: `https://kjekit.com/privacy` or `https://checklist.rkroll.com/privacy`
- [ ] Include required disclosures:
  - Data collected (email for auth)
  - Data usage (authentication, sync)
  - Third parties (Jazz.tools sync, OAuth providers)
  - Data retention
  - User rights (deletion)
  - Contact information

### Data Safety Form

Complete in Play Console. Based on current app:

| Question | Answer |
|----------|--------|
| Data collected | Email address (for authentication) |
| Data shared | No (not shared with third parties) |
| Data encrypted | Yes (Jazz.tools encryption) |
| Data deletion | Yes (account deletion available) |
| Security practices | HTTPS, encrypted sync |

### Declarations
- [ ] App does not target children
- [ ] App does not contain ads
- [ ] App does not require special permissions
- [ ] App complies with Developer Program Policies

---

## Build & Release

### Build Release AAB

```bash
# Ensure web build is current
npm run build

# Sync to Android
npx cap sync android

# Build release bundle
cd android
./gradlew bundleRelease

# Output: android/app/build/outputs/bundle/release/app-release.aab
```

### Version Management

Update before each release:
- `android/app/build.gradle`:
  - `versionCode` - Increment for each upload (1, 2, 3...)
  - `versionName` - User-visible version ("1.0", "1.1", "2.0")
- `capacitor.config.ts` - Keep in sync if version shown in app

### Pre-Release Testing
- [ ] Test release build on physical device
- [ ] Verify OAuth flows work with production URLs
- [ ] Test offline functionality
- [ ] Verify deep links work (invite URLs)

---

## Play Console Submission

### Initial Setup
1. [ ] Create new app in Play Console
2. [ ] Select "App" (not game)
3. [ ] Choose "Free" or "Paid" (recommend Free with IAP for premium)
4. [ ] Complete app access instructions (if login required for review)

### Store Listing
1. [ ] Upload app icon
2. [ ] Upload feature graphic
3. [ ] Upload screenshots (phone)
4. [ ] Enter short description
5. [ ] Enter full description
6. [ ] Add privacy policy URL

### App Content
1. [ ] Complete content rating questionnaire
2. [ ] Complete target audience declaration
3. [ ] Complete data safety form
4. [ ] Complete ads declaration (no ads)

### Release
1. [ ] Create internal testing track first
2. [ ] Upload signed AAB
3. [ ] Add release notes
4. [ ] Test with internal testers
5. [ ] Promote to closed/open testing (optional)
6. [ ] Submit for production review

---

## Post-Launch

### Monitoring
- [ ] Set up crash reporting (Firebase Crashlytics)
- [ ] Monitor Play Console reviews
- [ ] Track install/uninstall metrics

### Updates
- [ ] Increment versionCode for each update
- [ ] Write release notes
- [ ] Consider staged rollout for major changes

---

## Current Status Summary

| Category | Status |
|----------|--------|
| Developer account | MISSING |
| Signing key | MISSING |
| App icons | OK |
| Feature graphic | MISSING |
| Screenshots | MISSING |
| Short description | OK |
| Full description | OK |
| Privacy policy | OK |
| Release build | MISSING |
| Play Console setup | MISSING |

---

## Resources

- [Play Console Help](https://support.google.com/googleplay/android-developer)
- [App Content Guidelines](https://play.google.com/about/developer-content-policy/)
- [Data Safety Form Guide](https://support.google.com/googleplay/android-developer/answer/10787469)
- [Capacitor Android Docs](https://capacitorjs.com/docs/android)
- [App Signing by Google Play](https://developer.android.com/studio/publish/app-signing)

---

## Quick Commands

```bash
# Build web app
npm run build

# Sync to Android
npx cap sync android

# Open in Android Studio
npx cap open android

# Build debug APK (for testing)
cd android && ./gradlew assembleDebug

# Build release AAB (for Play Store)
cd android && ./gradlew bundleRelease

# Install debug on device
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

# Security Remediation Plan

Generated: 2025-12-31
Last Updated: 2025-12-31

This document tracks security issues identified during code review and their remediation status.

---

## Critical Issues

### 1. Vulnerable `better-auth` dependency
- **Location:** `package.json:74`
- **Risk:** CVSS 8.6 - Rate limit bypass, path normalization issues (GHSA-x732-6j76-qmhm)
- **Fix:** Upgrade to `>=1.4.5`
- **Command:** `npm update better-auth`
- **Status:** [x] COMPLETED - Upgraded to 1.4.9

### 2. Vulnerable `express` dependency
- **Location:** `backend/package.json:20`
- **Risk:** CVSS 7.5 - DoS via memory exhaustion in `qs` (GHSA-6rw7-vpxm-498p)
- **Fix:** Upgrade to `>=4.21.3`
- **Command:** `cd backend && npm update express`
- **Status:** [x] COMPLETED - Upgraded to 4.22.1

### 3. Android backup enabled
- **Location:** `android/app/src/main/AndroidManifest.xml:4`
- **Risk:** Sensitive data (Jazz DB, auth state, IndexedDB) extractable via ADB backup
- **Fix:** Set `android:allowBackup="false"`
- **Status:** [x] COMPLETED - Also added networkSecurityConfig reference

### 4. Jazz API key in client bundle
- **Location:** `src/lib/jazz.tsx:7-12`
- **Risk:** API key embedded in mobile bundle, extractable via reverse engineering
- **Status:** [x] RESOLVED - By design, not a vulnerability
- **Analysis:** Jazz is a local-first database with end-to-end encryption:
  - Data is encrypted on the client before being sent to sync servers
  - The API key is used for **billing/rate limiting**, not data security
  - Security comes from E2E encryption + user authentication, not the API key
  - This is similar to Firebase/Supabase "anon" keys designed for client use
  - The key can be domain-restricted in Jazz Cloud dashboard if needed
- **Recommendation:** Consider domain restriction in Jazz Cloud settings

### 5. Overly permissive Android file provider paths
- **Location:** `android/app/src/main/res/xml/file_paths.xml:3-4`
- **Risk:** `path="."` grants access to entire external storage and cache
- **Fix:** Restrict to specific subdirectories
- **Status:** [x] COMPLETED - Restricted to Pictures/ and images/

---

## High Priority Issues

### 6. Wildcard network access in Cordova config
- **Location:** `android/app/src/main/res/xml/config.xml:3`
- **Risk:** `<access origin="*" />` allows WebView to access any domain
- **Fix:** Replace with explicit allowlist
- **Status:** [x] COMPLETED - Restricted to checklist.rkroll.com, cloud.jazz.tools, api.stripe.com, googleapis.com, accounts.google.com, appleid.apple.com

### 7. Missing Android network security config
- **Location:** `android/app/src/main/res/xml/` (missing file)
- **Risk:** No certificate pinning, no cleartext traffic restrictions
- **Fix:** Create `network_security_config.xml` and reference in AndroidManifest.xml
- **Status:** [x] COMPLETED - Created with cleartextTrafficPermitted=false

### 8. ProGuard disabled for release builds
- **Location:** `android/app/build.gradle:21`
- **Risk:** Code not obfuscated, easier reverse engineering
- **Fix:** Set `minifyEnabled true` and add ProGuard rules for Jazz, BetterAuth, Capacitor
- **Status:** [x] COMPLETED - Enabled with shrinkResources and Capacitor keep rules

### 9. User PII in backend logs
- **Locations:**
  - `backend/src/index.ts:208` - user email in deletion log
  - `backend/src/verified-emails.ts:182` - email in verification log
  - `backend/src/agent.ts:99` - Jazz account ID in access log
- **Risk:** PII exposure in logs, compliance concerns
- **Fix:** Implement log masking or use hashed identifiers
- **Status:** [x] COMPLETED - All emails masked (jo***@example.com), IDs truncated

### 10. Console logging in production frontend
- **Locations:** Multiple files in `src/components/` and `src/lib/jazz.tsx`
- **Risk:** Information leakage, performance overhead
- **Fix:** Remove debug logs or make conditional on `import.meta.env.DEV`
- **Status:** [x] COMPLETED - All debug logs guarded with import.meta.env.DEV

---

## Moderate Priority Issues

### 11. Localhost origins in production auth config
- **Location:** `backend/src/auth.ts:107-109`
- **Risk:** Development origins included in production config
- **Fix:** Use environment-based configuration to exclude localhost in production
- **Status:** [x] COMPLETED - Localhost origins only included when NODE_ENV !== 'production'

### 12. Hardcoded server URL in Capacitor config
- **Location:** `capacitor.config.ts:8`
- **Risk:** Difficult environment switching, potential misconfiguration
- **Fix:** Use environment variable: `process.env.CAPACITOR_SERVER_URL || 'https://checklist.rkroll.com'`
- **Status:** [ ] DEFERRED - Low risk since production URL is correct; Capacitor config runs at build time

### 13. Client-provided request ID accepted without validation
- **Location:** `backend/src/index.ts:138`
- **Risk:** Log injection with malformed request IDs
- **Fix:** Validate format of client-provided IDs or always generate server-side
- **Status:** [x] COMPLETED - UUID format validation added

### 14. API key potentially logged
- **Location:** `backend/src/agent.ts:45`
- **Risk:** Jazz API key in URL may be logged
- **Fix:** Log only peer URL without key parameter
- **Status:** [x] COMPLETED - Now logs jazzPeer without API key

---

## Low Priority / Optional Improvements

### 15. MIME type validation for file uploads (frontend)
- **Location:** `src/components/ui/file-upload-dialog.tsx:84-110`
- **Current:** Extension-based validation only
- **Improvement:** Add magic number validation for actual file type verification
- **Status:** [ ] Not started

### 16. Screenshot protection for Android
- **Location:** `android/app/src/main/java/com/kjekit/app/MainActivity.java`
- **Improvement:** Add `FLAG_SECURE` for sensitive screens
- **Status:** [ ] Not started
- **Notes:** May not be appropriate for all use cases

### 17. Style CSP improvement
- **Location:** `index.html:27`
- **Current:** `style-src 'self' 'unsafe-inline'`
- **Improvement:** Migrate to nonce-based CSP (lower priority, works fine with Tailwind)
- **Status:** [ ] Not started

### 18. Empty ProGuard rules file
- **Location:** `android/app/proguard-rules.pro`
- **Improvement:** Add keep rules for Jazz, BetterAuth, Capacitor when ProGuard enabled
- **Status:** [x] COMPLETED - Added comprehensive Capacitor/AndroidX keep rules

---

## Verification Steps

After completing fixes, verify with:

1. **Dependency audit:**
   ```bash
   npm audit
   cd backend && npm audit
   ```

2. **Android security:**
   - Test ADB backup fails: `adb backup -f backup.ab com.kjekit.app`
   - Verify network security config applied
   - Check ProGuard obfuscation in release APK

3. **Log review:**
   - Search logs for email addresses, should find none
   - Verify console.log removed from production bundle

4. **API key removal:**
   - Decompile mobile app, search for Jazz API key
   - Verify key not in client JavaScript bundle

---

## Progress Tracking

| Priority | Total | Done | Remaining |
|----------|-------|------|-----------|
| Critical | 5 | 5 | 0 |
| High | 5 | 5 | 0 |
| Moderate | 4 | 3 | 1 |
| Low | 4 | 1 | 3 |
| **Total** | **18** | **14** | **4** |

### Deferred Items

1. **Moderate #12 (Capacitor URL):** Low risk since production URL is hardcoded correctly. Environment variable approach would require build-time configuration.

### Resolved by Design

1. **Critical #4 (Jazz API key):** Jazz is a local-first E2E encrypted database. The API key is used for billing/rate limiting, not data security. This is the intended architecture, similar to Firebase/Supabase client keys.

---

## References

- OWASP Mobile Security Testing Guide: https://owasp.org/www-project-mobile-security-testing-guide/
- Android Network Security Config: https://developer.android.com/privacy-and-security/security-config
- better-auth security advisories: https://github.com/advisories?query=better-auth

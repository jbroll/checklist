# Key Rotation Guide

This document describes how to rotate secrets for the CheckList backend.

## Quick Reference

```bash
cd backend

# Show status of all secrets
npm run rotate list

# Test rotation procedures (validates without making changes)
npm run rotate test

# Rotate BETTER_AUTH_SECRET (dry-run first)
npm run rotate -- better-auth --dry-run
npm run rotate better-auth

# Generate new Apple client secret
npm run rotate -- apple --key ~/AuthKey.p8
```

## Secrets Overview

| Secret | Purpose | Data Impact | Rotation Complexity |
|--------|---------|-------------|---------------------|
| `BETTER_AUTH_SECRET` | Encrypts legacy `encryptedCredentials`/`accountID` columns (dead weight left over from the pre-rowboat/Jazz era; no current code path reads them) | **LOW for live data** (list/item data lives in rowboat's server-side SQLite, unencrypted, and is untouched by this secret) — **but requires re-encryption of the legacy columns**, or any still-populated rows become permanently undecryptable garbage | Low-Medium |
| `GOOGLE_CLIENT_SECRET` | Google OAuth | None - only affects new logins | Low |
| `APPLE_CLIENT_SECRET` | Apple OAuth | None - only affects new logins | Low |
| `STRIPE_SECRET_KEY` | Stripe API | None - subscriptions unaffected | Low |
| `STRIPE_WEBHOOK_SECRET` | Webhook verification | None - may miss webhooks briefly | Low |
| `SMTP_PASS` | Email sending | None - emails fail until deployed | Low |

## Understanding Data Impact

CheckList runs on **rowboat** (a local-first sync engine — SQLite server + IndexedDB client), not
Jazz.tools. List/item data lives as ordinary rows in the backend's SQLite database, in **plaintext**
— there is no client-side or server-side encryption of list content, and no key derived from
`BETTER_AUTH_SECRET` (or any other secret) gates access to it. Access control is enforced by rowboat's
authorization layer at sync time (scoped pull / gated push), not by encryption. Rotating any secret in
this document — including `BETTER_AUTH_SECRET` — **has no effect on list/item data**.

`BETTER_AUTH_SECRET` does still encrypt one thing: the `user.encryptedCredentials` /
`user.accountID` columns, a legacy pair kept in the `user` table from when this app stored Jazz
account keys there (see `backend/src/migrate-auth.ts`). No current code path writes or reads these
columns for anything user-facing — they are inert — but rows created before the rowboat port may
still carry real encrypted values, and `npm run rotate test` can find and decrypt them. Rotating
`BETTER_AUTH_SECRET` **without** running the `better-auth` re-encryption step will leave any such
legacy rows permanently undecryptable. That is harmless in practice (nothing reads them), but the
rotation tooling still treats it as a re-encryption step, so follow the procedure below rather than
hand-editing the secret.

```
user.encryptedCredentials / user.accountID (legacy, unused columns in auth.db)
    ↓ encrypted with
BETTER_AUTH_SECRET  ← the ONLY secret that affects any stored value, and only this dead column pair
```

**Key insight:** OAuth secrets (Google, Apple) are only used during the login handshake. They never touch stored data or existing sessions. List/item data is not encrypted by anything and is unaffected by any secret rotation.

---

## BETTER_AUTH_SECRET Rotation

`BETTER_AUTH_SECRET` is better-auth's own signing/session secret, so rotating it invalidates existing
session tokens regardless of anything else. It also happens to encrypt the legacy
`encryptedCredentials`/`accountID` columns described above — dead columns no code currently reads,
but which may still hold real values for accounts created before the rowboat port.

### Impact

| What | Effect |
|------|--------|
| Existing sessions | ✗ **Broken** (better-auth signs sessions with this secret) |
| List/item data (rowboat) | ✓ Unaffected — not encrypted by this or any secret |
| Legacy `encryptedCredentials`/`accountID` (if populated) | ✗ Undecryptable unless re-encrypted first |
| Users currently logged in | ✗ Must re-authenticate |
| New logins | ✓ Work with new secret |

**This is the only secret where rotation affects sessions and the legacy credential columns.**

### Rotation Steps

```bash
cd backend

# 1. Test with dry-run first
npm run rotate -- better-auth --dry-run

# 2. Run actual rotation (generates new secret, re-encrypts all users)
npm run rotate better-auth

# 3. Redeploy
./deploy-full.sh prod

# 4. Test OAuth login
```

### Options

```
--dry-run       Preview changes without modifying database
--old-secret    Current secret (reads from secrets.env if not provided)
--new-secret    New secret (generates random if not provided)
--db            Path to auth.db (defaults to ./data/auth.db)
```

### Emergency: Secret Compromised

If the old secret is compromised and you must rotate immediately:
- Users will need to re-authenticate
- Their list/item data is NOT at risk — it is unencrypted rowboat-managed data, not gated by this
  secret in any way
- Any still-populated legacy `encryptedCredentials`/`accountID` values become permanently
  undecryptable (this only matters if something someday reads them again; nothing does today)

```bash
# Force rotation - clears all encrypted credentials (users must re-auth)
sqlite3 /path/to/auth.db "UPDATE user SET encryptedCredentials = NULL, accountID = NULL;"
```

---

## APPLE_CLIENT_SECRET Rotation

The Apple client secret is a JWT that expires every 6 months (max). Current expiration: **2026-06-30**

### Impact

| What | Effect |
|------|--------|
| Existing sessions | ✓ **Unaffected** - sessions don't use OAuth secret |
| List/item data (rowboat) | ✓ **Unaffected** - not encrypted by any secret |
| Users currently logged in | ✓ **Unaffected** - no re-auth needed |
| New Apple logins | ✗ Fail until new secret deployed |

OAuth secrets are only used during the token exchange handshake. Once a user is authenticated, their session and data are completely independent of OAuth secrets.

### Regenerate

```bash
cd backend

# Generate new JWT (requires .p8 private key from Apple Developer Console)
npm run rotate -- apple --key ~/path/to/AuthKey_67VV567DZ8.p8

# With all options:
npm run rotate -- apple \
  --key ~/AuthKey.p8 \
  --key-id 67VV567DZ8 \
  --team-id 6QN29TYW92 \
  --client-id com.rkroll.checklist.sa \
  --expires 180
```

### Options

```
--key           Path to .p8 private key file (required)
--key-id        Key ID from Apple Developer (default: 67VV567DZ8)
--team-id       Team ID from Apple Developer (default: 6QN29TYW92)
--client-id     Service ID / Client ID (default: com.rkroll.checklist.sa)
--expires       Expiration in days, max 180 (default: 180)
```

The Apple private key (.p8 file) should be stored securely and NOT committed to git.

---

## GOOGLE_CLIENT_SECRET Rotation

### Impact

| What | Effect |
|------|--------|
| Existing sessions | ✓ **Unaffected** |
| List/item data (rowboat) | ✓ **Unaffected** |
| Users currently logged in | ✓ **Unaffected** |
| New Google logins | ✗ Fail until new secret deployed |

Same as Apple - OAuth secrets are only used during login handshake.

### Rotation Steps

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Select the OAuth 2.0 Client
3. Click "Add Secret" or regenerate
4. Update `backend/secrets.env`
5. Redeploy: `./deploy-full.sh prod`

No database changes required.

---

## STRIPE_SECRET_KEY Rotation

### Impact

| What | Effect |
|------|--------|
| Existing sessions | ✓ **Unaffected** |
| List/item data (rowboat) | ✓ **Unaffected** |
| Existing subscriptions | ✓ **Unaffected** - stored in Stripe, not locally |
| Billing operations | ⚠ Fail during rotation window |

Stripe keys are API credentials only. Subscription data lives in Stripe's servers.

### Rotation Steps

1. Go to [Stripe Dashboard > API Keys](https://dashboard.stripe.com/apikeys)
2. Click "Roll key" on the secret key (keeps old key working for 24h)
3. Copy the new secret key
4. Update `backend/secrets.env`
5. Redeploy: `./deploy-full.sh prod`
6. After confirming the new key works, expire the old key in Stripe Dashboard

Stripe's key rolling gives 24-hour overlap for safe transition.

---

## STRIPE_WEBHOOK_SECRET Rotation

### Impact

| What | Effect |
|------|--------|
| Existing sessions | ✓ **Unaffected** |
| List/item data (rowboat) | ✓ **Unaffected** |
| Subscription sync | ⚠ Webhooks rejected during rotation |
| Missed webhooks | Can be replayed from Stripe Dashboard |

### Rotation Steps

1. Go to [Stripe Dashboard > Webhooks](https://dashboard.stripe.com/webhooks)
2. Select the webhook endpoint for your domain
3. Click "Reveal" on the signing secret and copy it, OR delete and recreate the endpoint
4. Update `backend/secrets.env`
5. Redeploy: `./deploy-full.sh prod`

**Required webhook events:**
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

---

## SMTP_PASS Rotation

### Impact

| What | Effect |
|------|--------|
| Existing sessions | ✓ **Unaffected** |
| List/item data (rowboat) | ✓ **Unaffected** |
| Email sending | ✗ Fails until new password deployed |
| Share invites | ⚠ Invites created but emails not sent |

### Rotation Steps

1. Log in to [Purelymail](https://purelymail.com)
2. Change the password for `invite@checklist.rkroll.com`
3. Update `backend/secrets.env` (quote if it contains special characters)
4. Redeploy: `./deploy-full.sh prod`
5. Test by creating a share invite and verifying email is received

---

## Secrets File Locations

| Environment | File | Deployed To |
|-------------|------|-------------|
| Development | `backend/.env` | Local only |
| Test | `backend/secrets-test.env` | `/var/lib/checklist-api-test.env` |
| Production | `backend/secrets.env` | `/var/lib/checklist-api.env` |

## Testing Rotation Procedures

```bash
# 1. Fetch production database for testing
scp checklist-app.rkroll.com:/var/lib/checklist-api-data/auth.db test-data/auth-prod.db

# 2. Run full test suite
cd backend
npm run rotate test

# 3. Test BETTER_AUTH_SECRET with production data
npm run rotate -- better-auth --dry-run --db ../test-data/auth-prod.db
```

## Post-Rotation Checklist

After rotating any secret:

1. [ ] Update all secrets files (`.env`, `secrets.env`, `secrets-test.env`)
2. [ ] Deploy to test environment
3. [ ] Test OAuth login (Google and Apple)
4. [ ] Deploy to production
5. [ ] Test OAuth login on production
6. [ ] Verify existing sessions still work
7. [ ] Monitor logs for errors

## Scheduled Rotation Reminders

| Secret | Expiration | Action |
|--------|------------|--------|
| `APPLE_CLIENT_SECRET` | Every 6 months (current: 2026-06-30) | `npm run rotate apple` |
| `BETTER_AUTH_SECRET` | Never (rotate periodically) | `npm run rotate better-auth` |
| `STRIPE_SECRET_KEY` | Never | Rotate annually or after compromise |
| Others | Never | Rotate after suspected compromise |

## Emergency Procedures

### Secret Compromise Detected

1. **Immediately rotate** the compromised secret using procedures above
2. If `BETTER_AUTH_SECRET` is compromised:
   - List/item data is unaffected — it is unencrypted rowboat-managed data, never gated by this secret
   - Force re-authentication: `sqlite3 auth.db "UPDATE user SET encryptedCredentials = NULL;"`
3. If `STRIPE_SECRET_KEY` is compromised:
   - Roll the key in Stripe Dashboard immediately
   - Review recent transactions for anomalies
4. Monitor logs for 24-48 hours after rotation

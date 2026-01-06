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

# Rotate Jazz agent
npm run rotate -- jazz-agent --new-id co_xxx --new-secret "sealerSecret_.../signerSecret_..."

# Generate new Apple client secret
npm run rotate -- apple --key ~/AuthKey.p8
```

## Secrets Overview

| Secret | Purpose | Data Impact | Rotation Complexity |
|--------|---------|-------------|---------------------|
| `BETTER_AUTH_SECRET` | Encrypts Jazz credentials | **HIGH** - requires re-encryption | High |
| `JAZZ_AGENT_SECRET` | Manages shared folders | Medium - sharing may break | Medium |
| `VITE_JAZZ_API_KEY` | Jazz cloud authentication | None - user data unaffected | Low |
| `GOOGLE_CLIENT_SECRET` | Google OAuth | None - only affects new logins | Low |
| `APPLE_CLIENT_SECRET` | Apple OAuth | None - only affects new logins | Low |
| `STRIPE_SECRET_KEY` | Stripe API | None - subscriptions unaffected | Low |
| `STRIPE_WEBHOOK_SECRET` | Webhook verification | None - may miss webhooks briefly | Low |
| `SMTP_PASS` | Email sending | None - emails fail until deployed | Low |

## Understanding Data Impact

```
User's Jazz Data (lists, items, sessions)
    ↓ encrypted with
User's Jazz Keys (accountID + accountSecret)  ← stored per-user, never leaves device
    ↓ stored encrypted in
user.encryptedCredentials (in auth.db)
    ↓ encrypted with
BETTER_AUTH_SECRET  ← the ONLY secret that affects stored credentials
```

**Key insight:** OAuth secrets (Google, Apple) are only used during the login handshake. They never touch stored data or existing sessions.

---

## BETTER_AUTH_SECRET Rotation

The `BETTER_AUTH_SECRET` encrypts the `encryptedCredentials` column in the `user` table, containing Jazz cryptographic keys for each user.

### Impact

| What | Effect |
|------|--------|
| Existing sessions | ✗ **Broken** without re-encryption |
| Local Jazz data | ✓ Safe (encrypted with user's own keys) |
| Users currently logged in | ✗ Must re-authenticate if not re-encrypted |
| New logins | ✓ Work with new secret |

**This is the only secret where rotation affects user data access.**

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
- Their Jazz data is NOT lost (encrypted with their own keys, not the server secret)
- Only the link between BetterAuth user and Jazz account is lost

```bash
# Force rotation - clears all encrypted credentials (users must re-auth)
sqlite3 /path/to/auth.db "UPDATE user SET encryptedCredentials = NULL, accountID = NULL;"
```

---

## JAZZ_AGENT_SECRET Rotation

The Jazz agent manages folder group memberships for the sharing feature.

### Impact

| What | Effect |
|------|--------|
| Existing sessions | ✓ Unaffected |
| Local Jazz data | ✓ Unaffected |
| Accepted shares | ✓ Unaffected - recipients have direct access |
| Pending share invites | ⚠ Must migrate groups first |
| New share invites | ✓ Work after rotation |

The agent secret is only used server-side to manage group memberships. User data and sessions are completely independent.

### When is migration needed?

The agent is **only** needed to process share invite acceptances. Once a share is accepted, the recipient has direct access to the folder and the agent is no longer needed.

| Share Status | Agent Needed? | Migration Required? |
|--------------|---------------|---------------------|
| Pending (not accepted, not expired) | Yes | Yes |
| Accepted | No | No |
| Expired | No | No |

**In practice**, rotation is often trivial:
- If there are no pending invites, rotation requires no migration
- The rotation script automatically detects pending invites and only migrates those groups

### Safe Rotation Procedure

The rotation script has three commands for a safe, verified rotation:

```bash
cd backend

# Step 1: Create new agent at https://dashboard.jazz.tools
#         Copy the new JAZZ_AGENT_ACCOUNT_ID and JAZZ_AGENT_SECRET

# Step 2: Dry-run migration (preview without changes)
npx tsx scripts/rotate-agent.ts migrate --dry-run \
  --new-id co_new_agent_id \
  --new-secret "sealerSecret_.../signerSecret_..."

# Step 3: Run actual migration (old agent adds new agent to groups with pending invites)
npx tsx scripts/rotate-agent.ts migrate \
  --new-id co_new_agent_id \
  --new-secret "sealerSecret_.../signerSecret_..."

# Step 4: Update secrets.env with new credentials
#   JAZZ_AGENT_ACCOUNT_ID=co_new_agent_id
#   JAZZ_AGENT_SECRET=sealerSecret_.../signerSecret_...

# Step 5: Redeploy
./deploy-full.sh prod

# Step 6: Verify new agent can access folders with pending invites
npx tsx scripts/rotate-agent.ts verify

# Step 7: (Optional) Remove old agent from groups for security
npx tsx scripts/rotate-agent.ts cleanup \
  --old-id co_old_agent_id \
  --old-secret "sealerSecret_.../signerSecret_..."
```

### Rollback

If verification fails after updating secrets:

1. Revert `secrets.env` to old credentials
2. Redeploy
3. Investigate why migration failed
4. Re-run migration

Since the old agent was never removed (until cleanup), rollback is safe.

### Secret Format

The secret is two parts separated by `/`:
- `sealerSecret_...` - For encrypting data
- `signerSecret_...` - For signing/authentication

---

## APPLE_CLIENT_SECRET Rotation

The Apple client secret is a JWT that expires every 6 months (max). Current expiration: **2026-06-30**

### Impact

| What | Effect |
|------|--------|
| Existing sessions | ✓ **Unaffected** - sessions don't use OAuth secret |
| Local Jazz data | ✓ **Unaffected** - encrypted with user keys, not OAuth secret |
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
| Local Jazz data | ✓ **Unaffected** |
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

## VITE_JAZZ_API_KEY Rotation

The Jazz API key authenticates with Jazz cloud sync servers.

### Impact

| What | Effect |
|------|--------|
| Existing sessions | ✓ **Unaffected** - users have their own Jazz credentials |
| Local Jazz data | ✓ **Unaffected** - encrypted with user keys |
| Sync during rotation | ⚠ Brief interruption during deploy |
| After rotation | ✓ All users sync normally |

The API key is for the *application* to connect to Jazz cloud. Each user has their own Jazz credentials stored in `encryptedCredentials`, which are unaffected.

### Rotation Steps

1. Go to [Jazz Dashboard](https://dashboard.jazz.tools)
2. Generate a new API key
3. Update `.env` and `.env.production`:
   ```bash
   sed -i "s/VITE_JAZZ_API_KEY=.*/VITE_JAZZ_API_KEY=new_key_here/" .env
   sed -i "s/VITE_JAZZ_API_KEY=.*/VITE_JAZZ_API_KEY=new_key_here/" .env.production
   ```
4. Rebuild and redeploy: `./deploy-full.sh prod`

The old key can be revoked immediately after deployment.

---

## STRIPE_SECRET_KEY Rotation

### Impact

| What | Effect |
|------|--------|
| Existing sessions | ✓ **Unaffected** |
| Local Jazz data | ✓ **Unaffected** |
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
| Local Jazz data | ✓ **Unaffected** |
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
| Local Jazz data | ✓ **Unaffected** |
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
   - User Jazz data is safe (encrypted with user keys, not server secret)
   - Force re-authentication: `sqlite3 auth.db "UPDATE user SET encryptedCredentials = NULL;"`
3. If `STRIPE_SECRET_KEY` is compromised:
   - Roll the key in Stripe Dashboard immediately
   - Review recent transactions for anomalies
4. Monitor logs for 24-48 hours after rotation

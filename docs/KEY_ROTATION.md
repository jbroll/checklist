# Key Rotation Guide

This document describes how to rotate secrets for the CheckList backend.

## Overview

The backend uses several secrets that may need rotation:

| Secret | Purpose | Rotation Complexity |
|--------|---------|---------------------|
| `BETTER_AUTH_SECRET` | Encrypts Jazz credentials in user table | High - requires DB re-encryption |
| `JAZZ_AGENT_SECRET` | Jazz agent for managing shared folders | Medium - requires folder access migration |
| `GOOGLE_CLIENT_SECRET` | Google OAuth | Low - just update and redeploy |
| `APPLE_CLIENT_SECRET` | Apple OAuth (JWT, expires every 6 months) | Low - regenerate with script |

## BETTER_AUTH_SECRET Rotation

The `BETTER_AUTH_SECRET` is used to encrypt the `encryptedCredentials` column in the `user` table. This contains Jazz cryptographic keys for each user.

### Rotation Script

Run from the backend directory:

```bash
npm run rotate-better-auth-secret
```

The script will:
1. Generate a new secret using `openssl rand -base64 32`
2. Read all users with `encryptedCredentials` from the database
3. Decrypt each user's credentials with the OLD secret
4. Re-encrypt with the NEW secret
5. Update the database
6. Write the new secret to the secrets file

### Manual Rotation Steps

If the script fails, you can rotate manually:

```bash
# 1. Generate new secret
NEW_SECRET=$(openssl rand -base64 32)
echo "New secret: $NEW_SECRET"

# 2. Run rotation with both secrets
OLD_SECRET="..." NEW_SECRET="$NEW_SECRET" npm run rotate-better-auth-secret

# 3. Update secrets.env and secrets-test.env
sed -i "s/BETTER_AUTH_SECRET=.*/BETTER_AUTH_SECRET=$NEW_SECRET/" backend/secrets.env
sed -i "s/BETTER_AUTH_SECRET=.*/BETTER_AUTH_SECRET=$NEW_SECRET/" backend/secrets-test.env

# 4. Redeploy
./deploy-full.sh prod
```

### Emergency: Secret Compromised Before Rotation

If the old secret is compromised and you must rotate immediately:
- Users will need to re-authenticate
- Their Jazz data is NOT lost (encrypted with their own keys, not the server secret)
- Only the link between BetterAuth user and Jazz account is lost

To force rotation without re-encryption:
```bash
# Clear all encrypted credentials (users must re-auth)
sqlite3 /path/to/auth.db "UPDATE user SET encryptedCredentials = NULL, accountID = NULL;"
```

## JAZZ_AGENT_SECRET Rotation

The Jazz agent manages folder group memberships for the sharing feature. The secret is a Jazz account's cryptographic keypair.

### Rotation Script

```bash
# 1. Create new Jazz agent account (via Jazz dashboard or CLI)
# Get the new JAZZ_AGENT_ACCOUNT_ID and JAZZ_AGENT_SECRET

# 2. Run migration script with both old and new credentials
OLD_JAZZ_AGENT_ACCOUNT_ID="co_old..." \
OLD_JAZZ_AGENT_SECRET="sealerSecret_.../signerSecret_..." \
NEW_JAZZ_AGENT_ACCOUNT_ID="co_new..." \
NEW_JAZZ_AGENT_SECRET="sealerSecret_.../signerSecret_..." \
npx tsx backend/scripts/rotate-agent.ts

# 3. Update secrets files with new credentials
# 4. Redeploy
```

The script:
1. Connects as the OLD agent
2. Queries `share_invites` table for all folder IDs
3. Adds the NEW agent to each folder's group
4. Logs success/failure for each folder

### What the Jazz Agent Secret Contains

The secret is two parts separated by `/`:
- `sealerSecret_...` - For encrypting data
- `signerSecret_...` - For signing/authentication

These are base64-encoded cryptographic keys tied to a specific Jazz account ID.

## GOOGLE_CLIENT_SECRET Rotation

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Select the OAuth 2.0 Client
3. Click "Add Secret" or regenerate
4. Update `backend/secrets.env` and `backend/secrets-test.env`
5. Redeploy

No database changes required - users just re-authenticate.

## APPLE_CLIENT_SECRET Rotation

The Apple client secret is a JWT that expires every 6 months (max).

### Regenerate Script

```bash
# Requires the .p8 private key from Apple Developer Console
node scripts/generate-apple-secret.mjs \
  --key ~/path/to/AuthKey_XXXXXX.p8 \
  --team-id YOUR_TEAM_ID \
  --key-id YOUR_KEY_ID \
  --client-id com.rkroll.checklist.sa
```

Output includes the new `APPLE_CLIENT_SECRET` to add to secrets files.

### Key File Location

The Apple private key (.p8 file) should be stored securely and NOT committed to git. Current key ID: `67VV567DZ8`

## Secrets File Locations

| Environment | File | Deployed To |
|-------------|------|-------------|
| Development | `backend/.env` | Local only |
| Test | `backend/secrets-test.env` | `/var/lib/checklist-api-test.env` |
| Production | `backend/secrets.env` | `/var/lib/checklist-api.env` |

## Post-Rotation Checklist

After rotating any secret:

1. [ ] Update all secrets files (`.env`, `secrets.env`, `secrets-test.env`)
2. [ ] Deploy to test environment
3. [ ] Test OAuth login (Google and Apple)
4. [ ] Deploy to production
5. [ ] Test OAuth login on production
6. [ ] Verify existing sessions still work
7. [ ] Monitor logs for errors

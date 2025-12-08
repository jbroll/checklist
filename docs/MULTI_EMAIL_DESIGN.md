# Multi-Email Account Design

Allow users to link multiple email addresses to a single Kjekit account for receiving shares and collaboration.

## Database Model

### Existing `user` Table (unchanged)
```sql
id | email (unique) | accountID | encryptedCredentials | ...
```

### New `verified_email` Table
```sql
CREATE TABLE verified_email (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  verified_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_verified_email_user_id ON verified_email(user_id);
CREATE INDEX idx_verified_email_email ON verified_email(email);
```

### Stateless Verification Tokens
Instead of storing pending verifications in a database table, we use HMAC-signed tokens:
- Token format: `base64url(payload).base64url(signature)`
- Payload: `{ userId, email, expiresAt }`
- Signed with `BETTER_AUTH_SECRET`
- 24-hour expiry encoded in token

## Core Flows

### Flow 1: Add Verified Email from Profile

1. User logged in as `alice@gmail.com` (user row exists with `accountID=co_abc`)
2. User clicks "Add Email" in profile, enters `alice@work.com`
3. Backend checks `alice@work.com` not in `user` table or `verified_email` table
4. Backend creates `email_verification_request` row: `{token, user_id, email, expires_at}`
5. Backend sends verification email to `alice@work.com` with link containing token
6. User clicks link, frontend calls confirm endpoint with token
7. Backend verifies: token valid, not expired, user still logged in
8. Backend creates `verified_email` row linking to user
9. User can now receive shares at either email address

### Flow 2: Share Link Email Mismatch

1. Share sent to `bob@work.com`
2. User clicks share link while logged in as `bob@gmail.com`
3. Backend detects mismatch: share recipient != logged-in email AND not in verified_email
4. Frontend shows: "This share was sent to bob@work.com. Verify you control this email to accept."
5. User clicks verify button, proceeds as Flow 1 steps 4-9
6. After verification, share acceptance proceeds

## API Endpoints

### `POST /api/verified-emails/request`
- Auth: Required
- Body: `{ email: string }`
- Validates:
  - Email not same as user's primary email
  - Email not already registered as primary user
  - Email not already verified for any user
  - Rate limit: max 3 requests per user per hour
- Creates verification token (24h expiry)
- Sends verification email
- Returns: `{ success: true }`

### `POST /api/verified-emails/confirm`
- Auth: Required
- Body: `{ token: string }`
- Validates token, expiry, and user match
- Creates `verified_email` row
- Deletes verification request
- Returns: `{ success: true, email: string }`

### `GET /api/verified-emails`
- Auth: Required
- Returns: `{ emails: [{ id, email, verifiedAt }] }`

### `DELETE /api/verified-emails/:id`
- Auth: Required
- Validates user owns the verified email
- Deletes the verified email
- Returns: `{ success: true }`

## Share Matching Logic

Current share logic checks: `recipient_email == logged_in_user.email`

Updated logic:
```sql
-- Check if logged-in user can access share sent to recipient_email
SELECT 1 FROM user u
LEFT JOIN verified_email ve ON ve.user_id = u.id
WHERE u.id = :logged_in_user_id
AND (u.email = :recipient_email OR ve.email = :recipient_email)
```

If match found, user can access the share regardless of which email it was sent to.

## Security Considerations

1. **Rate limiting**: Max 3 verification requests per user per hour
2. **Token security**: 32-byte random tokens, single use, 24h expiry
3. **No email enumeration**: Same response whether email exists or not
4. **Verification required**: Cannot link email without clicking verification link
5. **User ownership**: Only the requesting user can complete verification
6. **Cascade delete**: Verified emails deleted when user is deleted

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Email already user's primary | Error: "This is already your primary email" |
| Email is another user's primary | Error: "This email is already registered" |
| Email already verified for this user | Error: "This email is already linked" |
| Email verified for different user | Error: "This email is already registered" |
| Token expired | Error: "Link expired", allow re-request |
| Token used while logged out | Error: "Please sign in to verify" |
| User deletes account | All verified_email rows cascade deleted |

## UI Touchpoints

1. **Profile/Settings**: "Linked Emails" section
   - List of verified emails with remove button
   - "Add Email" button opens verification flow
2. **Share mismatch page**: "Verify email to accept" option
3. **Verification email**: Simple link with clear instructions

## Implementation Order

1. Database tables (`verified_email`, `email_verification_request`)
2. API endpoints (request, confirm, list, delete)
3. Profile UI for managing linked emails
4. Update share matching logic
5. Share mismatch UI flow

## Future Considerations (v2)

- **Account merging**: When verified email already has its own Kjekit account with data
- **Primary email change**: Allow changing which email is the "primary" one
- **Email notifications**: Choose which emails receive notifications

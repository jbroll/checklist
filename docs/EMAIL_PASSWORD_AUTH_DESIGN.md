# Email/Password Authentication Design

Add email/password as a third authentication method alongside Google and Apple OAuth.

## Decisions

- **Email provider:** Purelymail
- **Display name:** Collect on signup, editable in profile
- **Account linking:** Auto-link when same email used across providers
- **OAuth + password:** OAuth users can add password via "reset password" flow
- **UI layout:** Stacked (email form above OAuth buttons)

## Current State

- OAuth only: Google + Apple
- No email sending capability
- Auth client connects to BetterAuth backend with Jazz plugin

## Required Components

### 1. Email Service Integration

**Provider:** Purelymail

Purelymail is a privacy-focused email service. Integration via SMTP or their API.

**Environment variables needed:**
- `SMTP_HOST` - Purelymail SMTP server
- `SMTP_PORT` - SMTP port (587 for TLS)
- `SMTP_USER` - SMTP username
- `SMTP_PASS` - SMTP password
- `EMAIL_FROM` - Sender address (e.g., "Bubblelist <noreply@bubblelist.app>")

**Emails to send:**
1. Email verification (on signup)
2. Password reset (also used by OAuth users to add password)
3. (Future) Multi-email verification (from MULTI_EMAIL_DESIGN.md)

### 2. Backend Configuration

Add to `backend/src/auth.ts`:

```
emailAndPassword: {
  enabled: true,
  requireEmailVerification: true,
  minPasswordLength: 8,
  maxPasswordLength: 128,
  sendVerificationEmail: async ({ user, url }) => { ... },
  sendResetPassword: async ({ user, url }) => { ... },
}
```

### 3. Database Changes

None required - BetterAuth stores email/password credentials in the existing `account` table with `providerId = "credential"`.

Existing schema already supports this:
```
account.password TEXT  -- already exists, stores hashed password
```

### 4. Account Linking

BetterAuth supports automatic account linking when the same email is used across providers.

**Scenario:** User signs up with email/password as `alice@example.com`, later clicks "Sign in with Google" using the same email.

**Behavior:** BetterAuth links the Google OAuth account to the existing user record. User can now sign in with either method.

**Configuration:** Enable `accountLinking` in BetterAuth config:
```
accountLinking: {
  enabled: true,
  trustedProviders: ["google", "apple"]
}
```

### 5. Frontend: Auth UI Changes

**Layout:** Stacked - email/password form at top, OAuth buttons below with "or" divider.

```
+----------------------------------+
|  Display Name: [_______________] |
|  Email:        [_______________] |
|  Password:     [_______________] |
|                                  |
|  [ Create Account ]              |
|                                  |
|  Already have an account? Sign in|
|                                  |
|  ──────────── or ────────────    |
|                                  |
|  [ Continue with Google ]        |
|  [ Continue with Apple  ]        |
+----------------------------------+
```

#### Sign Up Flow
1. User enters display name, email, password
2. Frontend calls `authClient.signUp.email({ name, email, password })`
3. BetterAuth creates user, sends verification email
4. User sees "Check your email to verify"
5. User clicks verification link
6. User redirected back, now verified and logged in

#### Sign In Flow
1. User enters email + password
2. Frontend calls `authClient.signIn.email({ email, password })`
3. If not verified: show "Please verify your email first" with resend option
4. If verified: logged in, Jazz account loaded

#### Password Reset Flow (also "Add Password" for OAuth users)
1. User clicks "Forgot password?" (or "Add password" in profile for OAuth users)
2. Enter email address
3. Frontend calls `authClient.forgetPassword({ email, redirectTo: "/reset-password" })`
4. User receives email with reset link
5. User clicks link, lands on `/reset-password?token=xxx`
6. User enters new password
7. Frontend calls `authClient.resetPassword({ token, newPassword })`
8. Success - password now set/updated

For OAuth-only users, this creates a `credential` account entry, enabling password login.

#### Profile: Edit Display Name
1. User opens profile dialog
2. Display name field is editable
3. On save, update `user.name` via BetterAuth API or direct DB update

#### Profile: Add/Change Password
1. Show current auth methods (Google, Apple, Password)
2. If no password: show "Add Password" button → triggers password reset email
3. If has password: show "Change Password" → requires current password

### 6. UI Components Needed

**New pages/routes:**
- `/reset-password` - Password reset form (receives token from email)
- `/verify-email` - Email verification landing (may auto-verify via URL)

**New components:**
- `AuthForm` - Combined signup/signin form with display name field
- `ForgotPasswordDialog` - Modal for password reset request
- `ResetPasswordForm` - New password entry after clicking email link
- `ProfileDialog` updates:
  - Editable display name field
  - Auth methods section showing linked providers
  - Add/change password option

**Modified components:**
- `LoginDialog` or `AuthPage` - Stacked layout with email form + OAuth buttons

### 7. Email Templates

Simple, plain text emails:

**Verification Email:**
```
Subject: Verify your Bubblelist email

Hi {name},

Click to verify your email: {url}

This link expires in 24 hours.

- Bubblelist
```

**Password Reset Email:**
```
Subject: Reset your Bubblelist password

Hi {name},

Click to reset your password: {url}

This link expires in 1 hour.
If you didn't request this, you can ignore this email.

- Bubblelist
```

### 8. Security Considerations

1. **Rate limiting:** Limit password reset requests (3/hour per email)
2. **Timing attacks:** Don't await email sending in request handler
3. **Password requirements:** Min 8 chars (BetterAuth default)
4. **Verification required:** Block login until email verified
5. **Token expiry:** Verification 24h, password reset 1h

### 9. Jazz Integration

The Jazz plugin should work identically for email/password users:
- On signup: Jazz account created, keys stored with user
- On signin: Jazz keys retrieved, account loaded
- Same `accountID` and `encryptedCredentials` flow as OAuth

**To verify:** Does the Jazz BetterAuth plugin handle email/password signup? Need to test that it creates Jazz credentials on email signup, not just OAuth callbacks.

## Connection to Multi-Email Feature

The email infrastructure built here powers the multi-email linking feature:
- Same SMTP/email service
- Similar verification email template
- Shared email sending utility

## Implementation Order

1. **Email service setup**
   - Configure Purelymail SMTP credentials
   - Add env vars to backend
   - Create email sending utility (nodemailer or similar)

2. **Backend: Enable email/password**
   - Add `emailAndPassword` config to auth.ts
   - Add `accountLinking` config
   - Implement `sendVerificationEmail` callback
   - Implement `sendResetPassword` callback
   - Test with curl/Postman

3. **Frontend: Auth form redesign**
   - Create stacked layout with email form + OAuth
   - Add display name field to signup
   - Handle signup/signin toggle

4. **Frontend: Password reset flow**
   - Add `/reset-password` route
   - Add forgot password link/dialog
   - Test full cycle

5. **Frontend: Profile updates**
   - Add editable display name
   - Add auth methods display
   - Add "Add Password" / "Change Password" option

6. **Testing & Polish**
   - E2E tests for all flows
   - Test account linking scenarios
   - Email deliverability testing

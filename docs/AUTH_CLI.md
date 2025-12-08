# Auth CLI

Command-line tool for managing the BetterAuth SQLite database during development and testing.

## Location

```
backend/scripts/auth-cli.ts
```

## Usage

From project root:

```bash
npx tsx backend/scripts/auth-cli.ts <command> [arguments]
```

Or from `backend/` directory:

```bash
cd backend
npx tsx scripts/auth-cli.ts <command> [arguments]
```

## Commands

### `list`

List all users with their verification status and auth providers.

```bash
npx tsx scripts/auth-cli.ts list
```

Output:
```
Users:

  ✓ john@example.com
    Name: John
    Providers: credential
    Created: 2025-12-08T01:51:49.422Z

  ✓ jane@gmail.com
    Name: Jane Doe
    Providers: google
    Created: 2025-12-02T18:21:43.395Z
```

- `✓` = email verified
- `✗` = email not verified

### `verify <email>`

Mark a user's email as verified.

```bash
npx tsx scripts/auth-cli.ts verify john@example.com
```

### `unverify <email>`

Mark a user's email as unverified. Useful for testing the verification flow.

```bash
npx tsx scripts/auth-cli.ts unverify john@example.com
```

### `delete <email>`

Completely delete a user and all related records (sessions, accounts, verification tokens).

```bash
npx tsx scripts/auth-cli.ts delete john@example.com
```

## Testing Workflows

### Test email verification flow

1. Unverify an existing account:
   ```bash
   npx tsx scripts/auth-cli.ts unverify john@example.com
   ```

2. Try to sign in via the UI - you should see the "verify your email" error

3. Click "Resend verification email" and check your inbox

4. Click the verification link to complete the flow

### Test fresh signup

1. Delete the test account:
   ```bash
   npx tsx scripts/auth-cli.ts delete test@example.com
   ```

2. Sign up with that email via the UI

3. Complete the verification flow

## Database Location

The CLI uses the same database as the backend:
- Development: `backend/auth.db`
- Can be overridden with `AUTH_DB_PATH` environment variable

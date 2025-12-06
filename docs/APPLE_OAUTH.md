# Apple OAuth Setup Guide

This guide explains how to set up Apple Sign In for BubbleList using BetterAuth.

## Prerequisites

- **Apple Developer Program membership** ($99/year) - Required to access Sign In with Apple
- A production domain with HTTPS (Apple does not support localhost)

## Setup Steps

### Step 1: Create an App ID

1. Go to [Apple Developer Portal - Identifiers](https://developer.apple.com/account/resources/identifiers/list)
2. Click the **+** button to create a new identifier
3. Select **App IDs** and click Continue
4. Select **App** as the type and click Continue
5. Fill in:
   - **Description**: BubbleList
   - **Bundle ID**: `com.rkroll.bubblelist` (use reverse domain naming)
6. Scroll down to **Capabilities** and enable **Sign In with Apple**
7. Click Continue, then Register

### Step 2: Create a Service ID

1. Go back to [Identifiers](https://developer.apple.com/account/resources/identifiers/list)
2. Click the **+** button
3. Select **Services IDs** and click Continue
4. Fill in:
   - **Description**: BubbleList Web
   - **Identifier**: `com.rkroll.bubblelist.si` (this becomes your `APPLE_CLIENT_ID`)
5. Click Continue, then Register

### Step 3: Configure the Service ID

1. Click on your newly created Service ID
2. Enable **Sign In with Apple**
3. Click **Configure** next to Sign In with Apple
4. Configure:
   - **Primary App ID**: Select your App ID from Step 1
   - **Domains**: `bubblelist-app.rkroll.com`
   - **Return URLs**: `https://bubblelist-app.rkroll.com/api/auth/callback/apple`
5. Click Next, then Done, then Continue, then Save

### Step 4: Create a Key

1. Go to [Keys](https://developer.apple.com/account/resources/authkeys/list)
2. Click the **+** button to create a new key
3. Fill in:
   - **Key Name**: BubbleList Sign In Key
4. Enable **Sign In with Apple**
5. Click **Configure** and select your App ID
6. Click Save, then Continue, then Register
7. **IMPORTANT**: Download the `.p8` file immediately - you can only download it once!
8. Note your **Key ID** (shown on the key details page)
9. Note your **Team ID** (found in [Account - Membership](https://developer.apple.com/account/#/membership))

### Step 5: Generate the Client Secret (JWT)

Apple requires a JWT token as the client secret. This JWT must be regenerated every 6 months.

#### Option A: Use BetterAuth's Generator

BetterAuth includes a built-in generator. Check their documentation for the latest method.

#### Option B: Generate Manually with Node.js

Create a script `generate-apple-secret.js`:

```javascript
const jwt = require('jsonwebtoken');
const fs = require('fs');

const privateKey = fs.readFileSync('./AuthKey_XXXXXXXXXX.p8'); // Your .p8 file
const teamId = 'YOUR_TEAM_ID';
const keyId = 'YOUR_KEY_ID';
const clientId = 'com.rkroll.bubblelist.si'; // Your Service ID

const token = jwt.sign({}, privateKey, {
  algorithm: 'ES256',
  expiresIn: '180d', // Max 6 months
  audience: 'https://appleid.apple.com',
  issuer: teamId,
  subject: clientId,
  keyid: keyId,
});

console.log('APPLE_CLIENT_SECRET=' + token);
```

Run with: `node generate-apple-secret.js`

### Step 6: Configure Environment Variables

Add to `backend/.env`:

```env
APPLE_CLIENT_ID=com.rkroll.bubblelist.si
APPLE_CLIENT_SECRET=eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IlhYWFhYWFhYWFgifQ...
```

### Step 7: Update Backend Configuration

In `backend/src/auth.ts`, add Apple to the socialProviders:

```typescript
socialProviders: {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    prompt: "select_account",
    scope: ["openid", "email"],
    disableDefaultScopes: true,
  },
  apple: {
    clientId: process.env.APPLE_CLIENT_ID!,
    clientSecret: process.env.APPLE_CLIENT_SECRET!,
  },
},
```

Also add Apple's domain to trustedOrigins:

```typescript
trustedOrigins: [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  "https://appleid.apple.com",
],
```

### Step 8: Add UI Button

Add an Apple Sign In button to your login UI that calls:

```typescript
authClient.signIn.social({ provider: "apple" });
```

## Important Notes

### No Localhost Support

Apple Sign In does **not** work with:
- `http://localhost`
- Non-HTTPS URLs
- IP addresses

You can only test Apple Sign In on a deployed production site with HTTPS.

### JWT Expiration

The client secret JWT expires after a maximum of 6 months (180 days). You must:
1. Set a reminder to regenerate it before expiration
2. Update `APPLE_CLIENT_SECRET` in your environment
3. Redeploy the backend

### Privacy

Apple allows users to hide their email address. When a user chooses "Hide My Email", Apple provides a relay email address (e.g., `abc123@privaterelay.appleid.com`). Your app should handle this gracefully.

### First-Time Sign In

On the first sign-in, Apple shows a consent screen where users can:
- Share or hide their email
- Share or hide their name

Apple only sends the user's name on the **first** authorization. If you need it, capture it immediately.

## Troubleshooting

### "invalid_client" error
- Verify your Service ID matches `APPLE_CLIENT_ID`
- Ensure the JWT was generated with the correct Team ID and Key ID
- Check that the JWT hasn't expired

### "redirect_uri_mismatch" error
- Verify the Return URL in Apple Developer Portal matches exactly:
  `https://bubblelist-app.rkroll.com/api/auth/callback/apple`
- Check for trailing slashes

### JWT generation fails
- Ensure the `.p8` file is valid and hasn't been modified
- Verify you're using the ES256 algorithm
- Check that the Key ID matches the downloaded key

## References

- [Apple Sign In Documentation](https://developer.apple.com/sign-in-with-apple/)
- [BetterAuth Apple Provider](https://www.better-auth.com/docs/authentication/apple)
- [Apple Developer Portal](https://developer.apple.com/account)

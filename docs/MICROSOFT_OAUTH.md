# Microsoft OAuth Setup Guide

This guide explains how to set up Microsoft Sign In for BubbleList using BetterAuth and Microsoft Entra ID (formerly Azure AD).

## Prerequisites

- A Microsoft account (personal or work/school)
- Access to [Microsoft Entra admin center](https://entra.microsoft.com/) or [Azure Portal](https://portal.azure.com/)

## Setup Steps

### Step 1: Register an Application

1. Go to [Microsoft Entra admin center](https://entra.microsoft.com/)
2. Navigate to **Identity** > **Applications** > **App registrations**
3. Click **New registration**
4. Fill in:
   - **Name**: BubbleList
   - **Supported account types**: Choose based on your needs (see [Account Types](#account-types) below)
   - **Redirect URI**:
     - Platform: **Web**
     - URL: `https://bubblelist-app.rkroll.com/api/auth/callback/microsoft`
5. Click **Register**

### Step 2: Note Your Client ID

After registration, you'll see the **Overview** page:
- Copy the **Application (client) ID** - this is your `MICROSOFT_CLIENT_ID`
- Copy the **Directory (tenant) ID** if you're restricting to a specific organization

### Step 3: Create a Client Secret

1. In your app registration, go to **Certificates & secrets**
2. Click **New client secret**
3. Fill in:
   - **Description**: BubbleList Production
   - **Expires**: Choose an expiration (recommend 24 months max)
4. Click **Add**
5. **IMPORTANT**: Copy the **Value** immediately - it won't be shown again!
   - This is your `MICROSOFT_CLIENT_SECRET`

### Step 4: Configure API Permissions (Optional)

By default, Microsoft provides basic profile info. To customize:

1. Go to **API permissions**
2. Click **Add a permission**
3. Select **Microsoft Graph** > **Delegated permissions**
4. Add permissions as needed:
   - `openid` - Required for sign-in
   - `email` - User's email address
   - `profile` - Basic profile info (name, etc.)
5. Click **Add permissions**

For privacy-focused apps, you can limit to just `openid` and `email`.

### Step 5: Configure Environment Variables

Add to `backend/.env`:

```env
# Microsoft OAuth
MICROSOFT_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MICROSOFT_CLIENT_SECRET=your-client-secret-value
# Optional: Restrict to specific tenant (default: 'common' allows all)
# MICROSOFT_TENANT_ID=your-tenant-id
```

Add to `backend/.env.example`:

```env
# Microsoft OAuth
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret
# MICROSOFT_TENANT_ID=your-tenant-id
```

### Step 6: Update Backend Configuration

In `backend/src/auth.ts`, add Microsoft to the socialProviders:

```typescript
socialProviders: {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    prompt: "select_account",
    scope: ["openid", "email"],
    disableDefaultScopes: true,
  },
  microsoft: {
    clientId: process.env.MICROSOFT_CLIENT_ID!,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
    // Optional: Restrict to specific tenant
    // tenantId: process.env.MICROSOFT_TENANT_ID,
    // Force account selection on each sign-in
    prompt: "select_account",
  },
},
```

### Step 7: Add UI Button

Add a Microsoft Sign In button to your login UI that calls:

```typescript
authClient.signIn.social({ provider: "microsoft" });
```

## Account Types

When registering your app, you choose who can sign in:

| Option | Description | Use Case |
|--------|-------------|----------|
| **Single tenant** | Only users in your organization | Internal enterprise apps |
| **Multitenant** | Users in any organization | B2B apps |
| **Multitenant + personal** | Any org + personal Microsoft accounts | Consumer apps (recommended for BubbleList) |
| **Personal accounts only** | Only personal Microsoft accounts (Outlook.com, Xbox, etc.) | Consumer-only apps |

For a consumer app like BubbleList, choose **"Accounts in any organizational directory and personal Microsoft accounts"**.

## Tenant Configuration

The `tenantId` option controls which accounts can sign in:

| Value | Who Can Sign In |
|-------|-----------------|
| `common` (default) | Any Microsoft account (work, school, or personal) |
| `organizations` | Only work/school accounts from any Azure AD tenant |
| `consumers` | Only personal Microsoft accounts |
| `{tenant-id}` | Only users from a specific organization |

Example for restricting to a specific organization:

```typescript
microsoft: {
  clientId: process.env.MICROSOFT_CLIENT_ID!,
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
  tenantId: "contoso.onmicrosoft.com", // or the tenant GUID
},
```

## CIAM (Customer Identity Access Management)

For B2C scenarios using Microsoft Entra External ID (CIAM):

```typescript
microsoft: {
  clientId: process.env.MICROSOFT_CLIENT_ID!,
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
  authority: "https://your-tenant.ciamlogin.com",
},
```

## Development vs Production

### Local Development

For local testing, add an additional redirect URI:

1. Go to your app registration > **Authentication**
2. Click **Add URI** under Web
3. Add: `http://localhost:3001/api/auth/callback/microsoft`
4. Click **Save**

Note: Microsoft allows localhost for development (unlike Apple).

### Production

Ensure your production redirect URI is registered:
- `https://bubblelist-app.rkroll.com/api/auth/callback/microsoft`

## Important Notes

### Client Secret Expiration

Microsoft client secrets expire (max 24 months). You must:
1. Set a reminder before expiration
2. Generate a new secret in Azure Portal
3. Update `MICROSOFT_CLIENT_SECRET` in your environment
4. Redeploy the backend

You can have multiple active secrets to enable rotation without downtime.

### Email Verification

Microsoft accounts are verified by Microsoft. However, work/school accounts may have different verification policies. Consider this when handling user data.

### Profile Data

Microsoft may provide:
- Email address
- Display name
- Profile photo URL
- Unique identifier (sub)

The exact data depends on the account type and permissions granted.

## Troubleshooting

### "AADSTS50011: Reply URL does not match"

The redirect URI in your request doesn't match any registered URIs:
1. Go to Azure Portal > App registrations > Your app > Authentication
2. Verify the redirect URI matches exactly: `https://bubblelist-app.rkroll.com/api/auth/callback/microsoft`
3. Check for trailing slashes or http vs https mismatches

### "AADSTS7000215: Invalid client secret"

- The client secret may have expired
- You may have copied the secret ID instead of the secret value
- Generate a new secret and update your environment

### "AADSTS700016: Application not found"

- Verify `MICROSOFT_CLIENT_ID` is correct
- Ensure the app registration hasn't been deleted
- Check you're using the right tenant

### "AADSTS50020: User account from external identity provider does not exist"

This happens when `tenantId` is set to a specific organization but the user is from a different tenant:
- Use `common` for multi-tenant support
- Or ensure users are from the correct organization

### Users see consent prompt every time

Add `prompt: "select_account"` to show account picker without re-requesting consent:

```typescript
microsoft: {
  clientId: process.env.MICROSOFT_CLIENT_ID!,
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
  prompt: "select_account",
},
```

## References

- [Microsoft identity platform documentation](https://learn.microsoft.com/en-us/azure/active-directory/develop/)
- [Register an application](https://learn.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app)
- [BetterAuth Microsoft Provider](https://www.better-auth.com/docs/authentication/microsoft)
- [Microsoft Entra admin center](https://entra.microsoft.com/)

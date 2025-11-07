# Pre-Deployment Checklist for bubblelist.rkroll.com

Complete these steps before running your first deployment.

## 1. Server Preparation

- [ ] Server is accessible via SSH
- [ ] User has sudo privileges
- [ ] SSH keys are configured for passwordless access
- [ ] DNS A record for `bubblelist.rkroll.com` points to server IP

## 2. Update Deploy Configurations

### Frontend (deploy.conf)

```bash
vi deploy.conf
```

Update:
- [ ] `REMOTE_HOST` - Your server hostname or IP
- [ ] `REMOTE_USER` - SSH user with sudo access
- [ ] `LETSENCRYPT_EMAIL` - Valid email for SSL certificate notifications

### Backend (backend/deploy.conf)

```bash
vi backend/deploy.conf
```

Update:
- [ ] `REMOTE_HOST` - Same as frontend
- [ ] `REMOTE_USER` - Same as frontend

## 3. Set Up OAuth Credentials

### Google OAuth (Required)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URIs:
   - `https://bubblelist.rkroll.com/api/auth/callback/google`
   - `http://localhost:5173/api/auth/callback/google` (for local dev)
6. Copy Client ID and Client Secret

### Apple OAuth (Optional)

1. Go to [Apple Developer](https://developer.apple.com/)
2. Create a Services ID
3. Configure Sign in with Apple
4. Add redirect URI: `https://bubblelist.rkroll.com/api/auth/callback/apple`
5. Copy Client ID and generate Client Secret

## 4. Update Backend Environment Variables

```bash
vi backend/.env.production
```

Replace these values:
- [ ] `BETTER_AUTH_SECRET` - Generate with: `openssl rand -base64 32`
- [ ] `GOOGLE_CLIENT_ID` - From Google Cloud Console
- [ ] `GOOGLE_CLIENT_SECRET` - From Google Cloud Console
- [ ] Optional: `APPLE_CLIENT_ID` and `APPLE_CLIENT_SECRET`

Example:
```bash
# Generate a secure secret
openssl rand -base64 32

# Update the file
BETTER_AUTH_SECRET=your-generated-secret-here
GOOGLE_CLIENT_ID=123456789.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-secret
```

## 5. Test Configuration Locally (Optional but Recommended)

```bash
# Install dependencies
npm install
cd backend && npm install && cd ..

# Build both frontend and backend
npm run build
npm run build:backend

# Verify builds succeeded
ls -la dist/        # Should contain index.html, assets/, etc.
ls -la backend/dist/  # Should contain index.js, auth.js, etc.
```

## 6. Verify deploy.sh is Available

```bash
ls -la ../deploy.sh/deploy.sh
```

Should show the deploy.sh script is executable.

## 7. Ready to Deploy!

Once all checklist items are complete:

```bash
# Initial deployment (sets up everything)
./deploy-full.sh init

# Follow the on-screen instructions to:
# 1. SSH to server
# 2. Create /etc/bubblelist-api/.env with production secrets
# 3. Restart the backend service
```

## Post-Deployment

After deployment completes:

- [ ] Visit https://bubblelist.rkroll.com - should load the app
- [ ] Try signing in with Google
- [ ] Create a test grocery list
- [ ] Verify data syncs (open in multiple tabs)

## Troubleshooting

If anything fails, see `DEPLOY.md` for troubleshooting steps.

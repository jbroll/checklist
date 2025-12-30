# CheckList Deployment Guide

This guide covers deploying CheckList to production.

## Prerequisites

1. **Server Access**:
   - SSH access to your deployment server
   - User with sudo privileges
   - SSH keys configured for passwordless access

2. **Environment Variables**:
   - Update `backend/.env.production` with:
     - `BETTER_AUTH_SECRET` (generate with: `openssl rand -base64 32`)
     - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
     - `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
     - Optional: Apple OAuth credentials
   - Frontend `.env.production` is already configured

3. **DNS Configuration**:
   - Primary: `checklist-app.rkroll.com` A record pointing to server IP
   - Optional: `app.kjekit.com` as alias (for kjekit brand)

4. **deploy.sh installed**:
   - The deploy.sh tool should be available at `../deploy.sh/`

## Deployment Architecture

The app is deployed in two parts:

1. **Frontend**: React SPA served by Apache (static files)
2. **Backend**: Express/BetterAuth/Stripe API service (systemd service on port 3001)
3. **Apache**: Proxies `/api/*` requests to backend

## Quick Deployment (Recommended)

Use `deploy-full.sh` to deploy both frontend and backend in one command:

### Initial Deployment (First Time)

```bash
# From project root
./deploy-full.sh init

# This will:
# 1. Build and deploy frontend (React app → Apache)
#    - Set up SSL certificates (Let's Encrypt)
#    - Configure Apache in hybrid mode (static + proxy)
#    - Deploy to /var/www/checklist-app
# 2. Build and deploy backend (Express API → systemd service)
#    - Create checklist system user
#    - Deploy to /var/lib/checklist-api
#    - Create systemd service on port 3001
```

### Subsequent Updates

```bash
# Update both frontend and backend
./deploy-full.sh update

# Or just:
./deploy-full.sh
```

### Post-Deployment: Create Backend Secrets File

The backend needs production secrets that aren't in the repo:

```bash
# SSH to server and create secrets file
ssh user@checklist-app.rkroll.com

# Create production secrets
sudo nano /var/lib/checklist-api.env

# Add contents from backend/.env.production with real values:
# - BETTER_AUTH_SECRET
# - GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
# - STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET

# Save and restart service
sudo systemctl restart checklist-api
```

## Advanced: Deploy Frontend or Backend Separately

If you need to deploy only one component, use the individual deploy configs:

**Frontend only:**
```bash
../deploy.sh/deploy.sh update
```

**Backend only:**
```bash
cd backend
../../deploy.sh/deploy.sh update
cd ..
```

Note: Each component has its own `deploy.conf` file with module-specific configuration.

## Verification

After deployment, verify everything is working:

```bash
# Check Apache is running
ssh user@checklist-app.rkroll.com "sudo systemctl status apache2"

# Check backend service
ssh user@checklist-app.rkroll.com "sudo systemctl status checklist-api"

# Check SSL certificate
curl -I https://checklist-app.rkroll.com

# Check API endpoint
curl https://checklist-app.rkroll.com/api/auth/get-session

# Check logs
ssh user@checklist-app.rkroll.com "sudo journalctl -u checklist-api -f"
```

## Troubleshooting

### Backend not starting

```bash
# Check service logs
ssh user@checklist-app.rkroll.com "sudo journalctl -u checklist-api -n 50"

# Check environment file
ssh user@checklist-app.rkroll.com "sudo cat /var/lib/checklist-api.env"

# Restart service
ssh user@checklist-app.rkroll.com "sudo systemctl restart checklist-api"
```

### Frontend not loading

```bash
# Check Apache logs
ssh user@checklist-app.rkroll.com "sudo tail -f /var/log/apache2/checklist-app_error.log"

# Check Apache config
ssh user@checklist-app.rkroll.com "sudo apache2ctl configtest"

# Reload Apache
ssh user@checklist-app.rkroll.com "sudo systemctl reload apache2"
```

### SSL issues

```bash
# Check certificate
ssh user@checklist-app.rkroll.com "sudo certbot certificates"

# Renew certificate
ssh user@checklist-app.rkroll.com "sudo certbot renew"
```

### Stripe webhook issues

```bash
# Check webhook logs
ssh user@checklist-app.rkroll.com "sudo journalctl -u checklist-api | grep -i stripe"

# Verify webhook endpoint
curl -X POST https://checklist-app.rkroll.com/api/billing/webhook
```

## Configuration Files

- `deploy-full.sh` - **Main deployment script** (orchestrates both frontend and backend)
- `deploy.conf` - Frontend deployment configuration (Apache + static files)
- `backend/deploy.conf` - Backend deployment configuration (Express systemd service)
- `.env.production` - Frontend environment variables (built into JS)
- `backend/.env.production` - Backend environment template (not deployed directly)

## Multi-Domain Setup

CheckList supports white-label branding with multiple domains:

1. **CheckList** (default): `checklist-app.rkroll.com`
2. **kjekit**: `app.kjekit.com`

Both domains can point to the same deployment. Brand detection happens at runtime based on the hostname.

For multi-domain OAuth:
- Add all domains to Google OAuth console redirect URIs
- Add all domains to Apple OAuth return URLs

## Security Notes

1. **Never commit secrets** - Keep OAuth credentials, BETTER_AUTH_SECRET, and Stripe keys out of git
2. **Use strong secrets** - Generate BETTER_AUTH_SECRET with `openssl rand -base64 32`
3. **Update OAuth redirect URIs** - Add production domains to Google/Apple OAuth consoles
4. **Configure Stripe webhooks** - Set webhook endpoint in Stripe dashboard
5. **Keep dependencies updated** - Regularly run `npm audit fix`

# Deployment Guide for bubblelist.rkroll.com

This guide covers deploying the Groceries Jazz app (bubblelist) to production.

## Prerequisites

1. **Server Access**:
   - SSH access to bubblelist.rkroll.com
   - User with sudo privileges
   - SSH keys configured for passwordless access

2. **Environment Variables**:
   - Update `backend/.env.production` with:
     - `BETTER_AUTH_SECRET` (generate with: `openssl rand -base64 32`)
     - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
     - Optional: Apple OAuth credentials
   - Frontend `.env.production` is already configured

3. **DNS Configuration**:
   - `bubblelist.rkroll.com` A record pointing to server IP

4. **deploy.sh installed**:
   - The deploy.sh tool should be available at `../deploy.sh/`

## Deployment Architecture

The app is deployed in two parts:

1. **Frontend**: React SPA served by Apache (static files)
2. **Backend**: Express/BetterAuth API service (systemd service on port 3001)
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
#    - Deploy to /var/www/bubblelist
# 2. Build and deploy backend (Express API → systemd service)
#    - Create bubblelist system user
#    - Deploy to /var/www/bubblelist-api
#    - Create systemd service on port 3001
```

### Subsequent Updates

```bash
# Update both frontend and backend
./deploy-full.sh update
```

### Post-Deployment: Create Backend Secrets File

The backend needs production secrets that aren't in the repo:

```bash
# SSH to server and create secrets file
ssh john@bubblelist.rkroll.com

# Create production secrets
sudo nano /etc/bubblelist-api/.env

# Add contents from backend/.env.production with real values
# Save and restart service
sudo systemctl restart bubblelist-api
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
ssh john@bubblelist.rkroll.com "sudo systemctl status apache2"

# Check backend service
ssh john@bubblelist.rkroll.com "sudo systemctl status bubblelist-api"

# Check SSL certificate
curl -I https://bubblelist.rkroll.com

# Check API endpoint
curl https://bubblelist.rkroll.com/api/auth/get-session

# Check logs
ssh john@bubblelist.rkroll.com "sudo journalctl -u bubblelist-api -f"
```

## Troubleshooting

### Backend not starting

```bash
# Check service logs
ssh john@bubblelist.rkroll.com "sudo journalctl -u bubblelist-api -n 50"

# Check environment file
ssh john@bubblelist.rkroll.com "sudo cat /etc/bubblelist-api/.env"

# Restart service
ssh john@bubblelist.rkroll.com "sudo systemctl restart bubblelist-api"
```

### Frontend not loading

```bash
# Check Apache logs
ssh john@bubblelist.rkroll.com "sudo tail -f /var/log/apache2/bubblelist_error.log"

# Check Apache config
ssh john@bubblelist.rkroll.com "sudo apache2ctl configtest"

# Reload Apache
ssh john@bubblelist.rkroll.com "sudo systemctl reload apache2"
```

### SSL issues

```bash
# Check certificate
ssh john@bubblelist.rkroll.com "sudo certbot certificates"

# Renew certificate
ssh john@bubblelist.rkroll.com "sudo certbot renew"
```

## Configuration Files

- `deploy-full.sh` - **Main deployment script** (orchestrates both frontend and backend)
- `deploy.conf` - Frontend deployment configuration (Apache + static files)
- `backend/deploy.conf` - Backend deployment configuration (Express systemd service)
- `.env.production` - Frontend environment variables (built into JS)
- `backend/.env.production` - Backend environment template (not deployed directly)

## Security Notes

1. **Never commit secrets** - Keep OAuth credentials and BETTER_AUTH_SECRET out of git
2. **Use strong secrets** - Generate BETTER_AUTH_SECRET with `openssl rand -base64 32`
3. **Update OAuth redirect URIs** - Add `https://bubblelist.rkroll.com` to Google OAuth console
4. **Keep dependencies updated** - Regularly run `npm audit fix`

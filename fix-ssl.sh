#!/bin/bash
# SSL Certificate Fix Script for checklist.rkroll.com
# Run this on the remote server to fix SSL certificate issues

set -e

DOMAIN="checklist.rkroll.com"
EMAIL="${LETSENCRYPT_EMAIL:-admin@rkroll.com}"

echo "=== Fixing SSL Certificate for $DOMAIN ==="
echo ""

# Step 1: Check if certificate already exists
if sudo ls /etc/letsencrypt/live/$DOMAIN 2>/dev/null; then
    echo "Certificate already exists for $DOMAIN"
    echo "Listing certificate details:"
    sudo certbot certificates -d $DOMAIN
else
    echo "Certificate does not exist. Creating new certificate..."

    # Make sure web root exists
    sudo mkdir -p /var/www/html/.well-known/acme-challenge
    sudo chown -R www-data:www-data /var/www/html/.well-known

    # Request certificate
    sudo certbot certonly \
        --webroot \
        -w /var/www/html \
        -d $DOMAIN \
        --non-interactive \
        --agree-tos \
        -m $EMAIL

    echo "✓ Certificate created successfully"
fi

echo ""

# Step 2: Check Apache configuration
echo "Checking Apache configuration..."

if [ ! -f /etc/apache2/sites-available/checklist.conf ]; then
    echo "ERROR: /etc/apache2/sites-available/checklist.conf not found"
    echo "You need to deploy the Apache configuration first"
    exit 1
fi

# Step 3: Enable the site
echo "Enabling checklist site..."
sudo a2ensite checklist

# Step 4: Test Apache configuration
echo "Testing Apache configuration..."
sudo apache2ctl configtest

# Step 5: Reload Apache
echo "Reloading Apache..."
sudo systemctl reload apache2

echo ""
echo "=== SSL Fix Complete ==="
echo ""
echo "Testing SSL certificate:"
curl -I https://$DOMAIN 2>&1 | head -5

echo ""
echo "If you still see certificate errors, check:"
echo "1. DNS is pointing to this server"
echo "2. Firewall allows port 443"
echo "3. Apache is listening on 443: sudo netstat -tlnp | grep :443"

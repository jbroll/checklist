#!/bin/bash
# SSL Certificate Diagnostic Script for checklist.rkroll.com
# Run this on the remote server to diagnose the SSL issue

echo "=== SSL Certificate Diagnostics ==="
echo ""

# Check what certificates exist
echo "1. Checking Let's Encrypt certificates..."
sudo certbot certificates
echo ""

# Check if checklist.rkroll.com certificate exists
if sudo ls /etc/letsencrypt/live/checklist.rkroll.com 2>/dev/null; then
    echo "✓ Certificate directory exists for checklist.rkroll.com"
    sudo ls -la /etc/letsencrypt/live/checklist.rkroll.com/
else
    echo "✗ No certificate found for checklist.rkroll.com"
fi
echo ""

# Check Apache virtual hosts
echo "2. Checking Apache virtual hosts..."
sudo apache2ctl -S
echo ""

# Check which sites are enabled
echo "3. Enabled Apache sites:"
ls -la /etc/apache2/sites-enabled/
echo ""

# Check checklist Apache config
echo "4. Checking checklist Apache configuration..."
if [ -f /etc/apache2/sites-available/checklist.conf ]; then
    echo "✓ Config file exists"
    echo "Certificate paths in config:"
    grep -i "SSLCertificate" /etc/apache2/sites-available/checklist.conf || echo "No SSL configuration found"
else
    echo "✗ /etc/apache2/sites-available/checklist.conf not found"
fi
echo ""

# Check if site is enabled
if [ -L /etc/apache2/sites-enabled/checklist.conf ]; then
    echo "✓ checklist site is enabled"
else
    echo "✗ checklist site is NOT enabled"
fi
echo ""

# Check Apache syntax
echo "5. Apache configuration test:"
sudo apache2ctl configtest
echo ""

echo "=== Recommended Actions ==="
echo ""

# Provide recommendations based on findings
if ! sudo ls /etc/letsencrypt/live/checklist.rkroll.com 2>/dev/null >/dev/null; then
    echo "ISSUE: Certificate for checklist.rkroll.com doesn't exist"
    echo ""
    echo "FIX: Run certbot to create the certificate:"
    echo "  sudo certbot certonly --webroot -w /var/www/html -d checklist.rkroll.com --non-interactive --agree-tos -m admin@rkroll.com"
    echo ""
fi

if [ ! -L /etc/apache2/sites-enabled/checklist.conf ]; then
    echo "ISSUE: checklist site is not enabled"
    echo ""
    echo "FIX: Enable the site:"
    echo "  sudo a2ensite checklist"
    echo "  sudo systemctl reload apache2"
    echo ""
fi

echo "To test SSL after fixes:"
echo "  curl -I https://checklist.rkroll.com"
echo ""

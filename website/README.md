# BubbleList Marketing Website

This directory contains the static marketing website for BubbleList, including the homepage, legal documentation, and product information.

## Contents

- **index.html** - Main landing page with features, FAQ, and CTAs
- **privacy.html** - Privacy Policy (required for OAuth)
- **terms.html** - Terms of Service

## Design

- Clean, modern design using Tailwind CSS via CDN
- Responsive layout for desktop and mobile
- Privacy-focused messaging aligned with GTM plan
- Professional legal documentation

## Deployment

This is a static website that can be deployed to any web server or static hosting service:

### Option 1: Apache/Nginx

```bash
# Copy files to web root
cp -r website/* /var/www/html/

# Or symlink
ln -s /path/to/bubblelist/website /var/www/html/bubblelist-site
```

### Option 2: GitHub Pages

```bash
# Push website directory to gh-pages branch
git subtree push --prefix website origin gh-pages
```

### Option 3: Netlify/Vercel

Simply point the service to the `website/` directory and deploy.

### Option 4: Static Hosting Services

Upload the contents of `website/` directory to:
- AWS S3 + CloudFront
- Cloudflare Pages
- Render Static Sites
- Firebase Hosting

## Customization

### Update Links

Before deploying, update these placeholder links in `index.html`:

1. **CTA buttons** - Replace `href="#"` with actual app URL
2. **Navigation links** - Update if hosting on subdomain

### Update Contact Information

Update email addresses in legal pages:
- Privacy page: `privacy@bubblelist.com`
- Terms page: `legal@bubblelist.com`

### Add Analytics (Optional)

Add privacy-friendly analytics by inserting tracking code before `</body>`:

```html
<!-- Example: Plausible Analytics -->
<script defer data-domain="bubblelist.com" src="https://plausible.io/js/script.js"></script>
```

## Testing Locally

Open `index.html` directly in a browser, or use a local server:

```bash
# Python 3
python -m http.server 8000

# Node.js (http-server)
npx http-server -p 8000

# PHP
php -S localhost:8000
```

Then visit: http://localhost:8000

## Content Based On

This website content is based on:
- `GO_TO_MARKET_PLAN.md` - Messaging, positioning, and value propositions
- Key features and privacy focus from project documentation

## Next Steps

1. Update CTA button links to point to production app
2. Configure domain (bubblelist.com)
3. Set up SSL certificate
4. Add contact email addresses
5. Deploy to hosting service
6. Test on multiple devices/browsers
7. Add analytics (privacy-friendly)
8. Submit domain to search engines

## Notes

- All HTML files use Tailwind CSS CDN for easy deployment
- No build process required - pure static HTML
- Legal pages meet OAuth provider requirements
- Mobile-responsive design
- Accessible navigation and content structure

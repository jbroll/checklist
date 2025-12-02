# BubbleList Marketing Website

This directory contains the static marketing website for BubbleList.

## Contents

- **index.html** - Main landing page with features, FAQ, and CTAs
- **legal.md** - Privacy Policy and Terms of Service (source)
- **legal.html** - Generated from legal.md
- **bubblelist.svg** - App icon
- **build-legal.js** - Script to generate legal.html from legal.md

## Development

### Preview locally

When running the main app dev server (`npm run dev`), the website is available at:

```
http://localhost:8765/website
```

### Editing legal content

1. Edit `website/legal.md` (the markdown source)
2. Run `node website/build-legal.js` to regenerate legal.html
3. Refresh browser to see changes

## Deployment

This is a static website. Deploy all files except `*.md` and `build-legal.js`:

```bash
# Files to deploy:
# - index.html
# - legal.html
# - bubblelist.svg
```

### Hosting options

- Apache/Nginx - copy to web root
- GitHub Pages - `git subtree push --prefix website origin gh-pages`
- Netlify/Vercel - point to `website/` directory
- AWS S3, Cloudflare Pages, Firebase Hosting, etc.

## Design

- Tailwind CSS via CDN (no build step)
- Responsive layout
- Green color scheme matching app branding
- Accessible navigation

## Customization

### Update CTA links

Update the app URL in `index.html`:
- CTA buttons point to `https://bubblelist-app.rkroll.com`

### Update contact info

Edit `legal.md` and regenerate:
- Email: `legal@bubblelist.com`

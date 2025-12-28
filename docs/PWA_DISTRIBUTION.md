# PWA Distribution Options

CheckList is a Progressive Web App (PWA) that can be distributed through various channels beyond traditional app stores.

## Confirmed Active PWA Directories

These directories were verified as active in December 2025:

### Primary Recommendations

| Directory | URL | Status | Notes |
|-----------|-----|--------|-------|
| **Store.app** | https://store.app/ | Active | Premier PWA discovery platform. Features user authentication, ratings, search. Lists major apps (ChatGPT, Notion, etc.). Built with Next.js. |
| **PWA.com** | https://www.pwa.com/ | Active | Shows 2025 copyright. Curated collection with categories (AI, Crypto, Productivity, Social, Travel, Games, Health, Developer Tools, Education, Entertainment). Has "Submit Your App" feature. |
| **findPWA** | https://www.findpwa.com/ | Active | Runs automated Lighthouse audits on listed PWAs. Highlights apps with best audit scores. Only includes true installable PWAs. |

### Inactive/Abandoned

| Directory | URL | Status | Notes |
|-----------|-----|--------|-------|
| vielspas/pwastore | https://vielspas.github.io/pwastore/ | Abandoned | Last commit ~2020, 0 stars, 0 forks |
| foss-pwa/app-store | https://github.com/foss-pwa/app-store | Abandoned | Created July 2020, minimal activity since |
| Appscope | https://appsco.pe/ | Down | Returned 503 error |
| pwa-directory.appspot.com | https://pwa-directory.appspot.com/ | Dead | 404 error |
| pwainside.com | https://pwainside.com/ | Dead | Connection refused |
| progressivewebapp.store | https://progressivewebapp.store/ | Unclear | Site loads but content is JS-rendered |
| outweb.mariusclaret.com | https://outweb.mariusclaret.com/ | Unclear | Requires JavaScript, couldn't verify |
| pwa-store.web.app | https://pwa-store.web.app/ | Unclear | Template only, no visible content |

## Traditional App Store Options

### Microsoft Store
- **Accepts PWAs**: Yes, with minimal restrictions
- **Process**: Use PWABuilder or submit directly
- **Documentation**: https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/microsoft-store

### Google Play Store
- **Accepts PWAs**: Yes, via Trusted Web Activity (TWA)
- **Process**: Use Bubblewrap or PWABuilder to create TWA wrapper
- **Documentation**: https://developers.google.com/codelabs/pwa-in-play

### Apple App Store
- **Accepts PWAs**: No (must be native app)
- **Workaround**: Wrap in native shell (not recommended for PWA-first apps)

## Submission Checklist for PWA Directories

Before submitting to PWA directories, ensure:

- [ ] Valid web app manifest (`manifest.json`)
- [ ] Service worker registered and functional
- [ ] HTTPS enabled
- [ ] Responsive design (mobile + desktop)
- [ ] Offline functionality works
- [ ] Good Lighthouse PWA score (aim for 90+)
- [ ] Clear app icon (512x512 recommended)
- [ ] App description and screenshots ready

## CheckList PWA Assets

- **App URL**: https://checklist-app.rkroll.com
- **Marketing Site**: https://checklist.rkroll.com
- **Icon**: 512x512 PNG available at `/icon-512.png`
- **Manifest**: `/manifest.json`

## Resources

- [PWABuilder](https://www.pwabuilder.com/) - Tool for packaging PWAs for app stores
- [web.dev PWA Guide](https://web.dev/articles/pwas-in-app-stores) - Google's guide to PWAs in app stores
- [Lighthouse](https://developers.google.com/web/tools/lighthouse) - Audit tool for PWA compliance

---

*Last updated: December 2025*

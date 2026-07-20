# [CheckList](https://checklist.rkroll.com)

Shared Checklists - built with rowboat and BetterAuth.

## Features

- Real-time sync across all devices
- Offline-first (works without internet)
- Local-first data sync, self-hosted (rowboat)
- Multi-provider OAuth (Google + Apple)
- Hierarchical template organization
- Session-based shopping tracking
- Folder sharing and collaboration
- Freemium subscription tiers with Stripe billing
- White-label branding support (CheckList, kjekit)
- Mobile apps via Capacitor (Android/iOS)

## Getting Started

### Prerequisites

- Node.js 18+
- Google and/or Apple OAuth credentials

### Installation

```bash
npm install
cd backend && npm install && cd ..
cp .env.example .env
cp backend/.env.example backend/.env
# Edit both .env files with your OAuth credentials
npm run dev  # Runs both frontend and backend
```

Visit http://localhost:5173

**Available dev commands**:
- `npm run dev` - Run both frontend (port 5173) and backend (port 3001)
- `npm run dev:frontend` - Run only frontend
- `npm run dev:backend` - Run only backend

### OAuth Setup

**Google OAuth**: https://console.cloud.google.com/
**Apple OAuth**: https://developer.apple.com/

Add redirect URIs:
- Development: `http://localhost:5173/api/auth/callback/{provider}`
- Production: `https://yourdomain.com/api/auth/callback/{provider}`

### Environment Variables

```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
APPLE_CLIENT_ID=your_apple_client_id
APPLE_CLIENT_SECRET=your_apple_client_secret
VITE_API_URL=http://localhost:3001
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
```

## How It Works

**Templates** are reusable checklists organized in folders.

**Sessions** are created when you "use" a template - they track what's in your cart and what you've purchased without modifying the template.

**rowboat** provides:
- Real-time sync
- Offline support
- Conflict resolution (per-column, HLC-ordered last-write-wins)

**BetterAuth** provides:
- OAuth authentication
- Session management
- Account key storage

**Stripe** provides:
- Subscription billing
- Customer portal
- Webhook event handling

## Subscription Tiers

- **Starter** (Free): Up to 3 lists, 7-day session history
- **Plus** ($9.99/yr): Up to 30 lists, 30-day session history
- **Premium** ($19.99/yr): Unlimited lists, unlimited history

## Development

```bash
npm run dev          # Start dev server (frontend + backend)
npm run build        # Build for production
npm run lint         # Run linter
npm run type-check   # Check TypeScript
npm run test:run     # Run unit tests
npm run test:e2e     # Run E2E tests
npm run check        # Run type-check + lint + tests
```

## Project Structure

See `ARCHITECTURE.md` for system overview and code locations.

## Documentation

**Getting Started**:
- `QUICKSTART.md` - Get started in 5 minutes
- `README.md` - This file

**Architecture & Development**:
- `ARCHITECTURE.md` - System architecture and code organization
- `CLAUDE.md` - Development guide and rowboat patterns
- `docs/DESIGN_SYSTEM.md` - UI/UX design patterns
- `docs/INDENTED_LIST_FORMAT.md` - Hierarchical text import/export format

**Deployment**:
- `DEPLOY.md` - Deployment instructions

**Product**:
- `docs/ROADMAP.md` - Product roadmap and feature priorities
- `docs/MARKET_COMPARISON.md` - Competitive analysis
- `docs/GooglePlayStore.md` - App store submission checklist

## White-Label Branding

The app supports multiple brands via runtime domain detection:
- **CheckList** (default): checklist-app.rkroll.com
- **kjekit**: app.kjekit.com

Brand configuration is in `src/lib/brand.ts`. Set `VITE_BRAND` env var to override.

## Deployment

See `DEPLOY.md` for detailed deployment instructions.

**Quick start:**
```bash
./deploy-full.sh init    # Initial deployment (frontend + backend)
./deploy-full.sh update  # Subsequent updates
```

The app deploys in two parts:
- **Frontend**: React SPA served by Apache (static files + SSL)
- **Backend**: Express/BetterAuth API service (systemd service on port 3001)

## Tech Stack

- React 18 + TypeScript + Vite
- rowboat (self-hosted sync engine)
- BetterAuth (authentication)
- Stripe (billing)
- Tailwind CSS + Radix UI
- Framer Motion
- Capacitor (mobile apps)

## License

[PolyForm Noncommercial 1.0.0](LICENSE.md) - Free for non-commercial use.

## Resources

- BetterAuth: https://better-auth.com/
- Stripe: https://stripe.com/

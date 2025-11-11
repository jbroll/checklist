# BubbleList

A real-time collaborative list app built with Jazz.tools and BetterAuth.

## Features

- Real-time sync across all devices
- Offline-first (works without internet)
- End-to-end encrypted
- Multi-provider OAuth (Google + Apple)
- Hierarchical template organization
- Session-based shopping tracking

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
VITE_API_URL=http://localhost:3000
VITE_JAZZ_PEER=wss://cloud.jazz.tools
```

## How It Works

**Templates** are reusable shopping lists organized in folders.

**Sessions** are created when you "use" a template - they track what's in your cart and what you've purchased without modifying the template.

**Jazz.tools** provides:
- Real-time sync
- Offline support
- End-to-end encryption
- Conflict resolution

**BetterAuth** provides:
- OAuth authentication
- Session management
- Account key storage

## Development

```bash
npm run dev          # Start dev server
npm run build        # Build for production
npm run lint         # Run linter
npm run type-check   # Check TypeScript
npm run test:run     # Run unit tests
npm run test:e2e     # Run E2E tests
```

## Project Structure

See `ARCHITECTURE.md` for system overview and code locations.

## Documentation

- `QUICKSTART.md` - Get started in 5 minutes
- `ARCHITECTURE.md` - System architecture and code organization
- `CLAUDE.md` - Development guide and Jazz patterns
- `AUTONOMOUS_EXECUTION_PLAN.md` - Quality gates and workflow
- `TYPESCRIPT_FIXES.md` - Troubleshooting reference

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
- Jazz.tools (distributed database)
- BetterAuth (authentication)
- Tailwind CSS + Radix UI
- Framer Motion

## License

MIT

## Resources

- Jazz.tools: https://jazz.tools/
- BetterAuth: https://better-auth.com/

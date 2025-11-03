# Groceries - Collaborative Shopping Lists

A real-time collaborative grocery list app built with Jazz.tools and BetterAuth.

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
cp .env.example .env
# Edit .env with your OAuth credentials
npm run dev
```

Visit http://localhost:5173

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

**Frontend**: Deploy `dist/` folder to Vercel, Netlify, or static hosting.

**Backend**: BetterAuth server needs separate deployment (serverless functions or Node.js app).

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

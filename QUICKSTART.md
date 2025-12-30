# Quick Start

Get running in 5 minutes.

## 1. Install

```bash
npm install
cd backend && npm install && cd ..
cp .env.example .env
cp backend/.env.example backend/.env
```

## 2. Run

```bash
npm run dev
```

This starts both frontend (port 5173) and backend (port 3001).

Open http://localhost:5173

## 3. Explore

**Key Files**:
- `src/schemas/` - Data models
- `src/components/tree/` - Tree view (folders and items)
- `src/components/session/` - Shopping interface

**Documentation**:
- `ARCHITECTURE.md` - System overview
- `CLAUDE.md` - Development guide
- `README.md` - Full setup instructions

## Common Commands

```bash
npm run dev          # Start frontend and backend
npm run build        # Production build
npm run lint         # Check code quality
npm run type-check   # TypeScript validation
npm run test:run     # Unit tests
npm run test:e2e     # E2E tests
```

## Next Steps

1. Add OAuth credentials to both `.env` files (see `README.md`)
2. Read `ARCHITECTURE.md` to understand the system
3. Check `src/schemas/tree.ts` to see the data model
4. Start building!

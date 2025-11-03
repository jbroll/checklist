# Quick Start

Get running in 5 minutes.

## 1. Install

```bash
npm install
cp .env.example .env
```

## 2. Run

```bash
npm run dev
```

Open http://localhost:5173

## 3. Explore

**Key Files**:
- `src/schemas/` - Data models
- `src/components/tree/` - Folder navigation
- `src/components/editor/` - Template editing
- `src/components/session/` - Shopping interface

**Documentation**:
- `ARCHITECTURE.md` - System overview
- `CLAUDE.md` - Development guide
- `README.md` - Full setup instructions

## Common Commands

```bash
npm run dev          # Development server
npm run build        # Production build
npm run lint         # Check code quality
npm run type-check   # TypeScript validation
npm run test:run     # Unit tests
npm run test:e2e     # E2E tests
```

## Next Steps

1. Add OAuth credentials to `.env` (see `README.md`)
2. Read `ARCHITECTURE.md` to understand the system
3. Check `src/schemas/tree.ts` to see the data model
4. Start building!

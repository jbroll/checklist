# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A collaborative grocery list application built with Jazz.tools and BetterAuth.

**Key Features**:
- Hierarchical template organization
- Session-based shopping tracking
- Real-time sync across devices
- Offline-first with automatic sync
- End-to-end encryption
- Multi-provider OAuth (Google + Apple)

## Technology Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Database**: Jazz.tools (distributed, real-time, offline-first)
- **Authentication**: BetterAuth with Jazz plugin
  - OAuth Providers: Google + Apple
- **UI**: Tailwind CSS + Radix UI + Framer Motion
- **Build Tool**: Vite

## Development Commands

```bash
npm install              # Install dependencies
npm run dev             # Start BOTH frontend (5173) and backend (3001)
npm run dev:frontend    # Start frontend only
npm run dev:backend     # Start backend only
npm run build           # Build for production
npm run preview         # Preview production build
npm run lint            # Run Biome linting
npm run type-check      # Run TypeScript type checking
npm run test:run        # Run unit tests (Vitest)
npm run test:e2e        # Run E2E tests (Playwright)
npm run check           # Run type-check + lint + tests
```

**IMPORTANT**: The app requires BOTH frontend and backend to be running for authentication and data persistence to work. Always use `npm run dev` to start both servers.

## Git Commit Rules

**Pre-commit**: Runs type-check, lint, unit tests, E2E tests (6-10 min).
    ALL HOOK CHECKS MUST PASS
    YOU MAY NOT BYPASS THE COMMIT HOOKS

    Non-code changes do not run the commit checking hooks

**DO NOT write verbose commit messages**. Subject line only + Co-Authored-By.

**YOU MUST FOLLOW THIS Commit message format**:
- Subject: 10-72 characters
- Body: ONLY `Co-Authored-By: Claude <noreply@anthropic.com>` allowed
- ASCII only (no emoji)
- Example: `fix: improve dialog clarity and add branding`

## Project Structure

```
groceries-jazz/
├── src/
│   ├── schemas/
│   │   ├── index.ts       # Account and root schemas
│   │   └── tree.ts        # FolderNode, TemplateItem, ShoppingSession
│   ├── lib/
│   │   ├── auth-client.ts # BetterAuth client with Jazz plugin
│   │   ├── jazz.tsx       # Jazz provider setup
│   │   └── utils.ts       # Helper functions
│   ├── components/
│   │   ├── Dashboard.tsx  # Main dashboard with auth UI
│   │   ├── tree/          # Folder tree navigation
│   │   ├── editor/        # Template editing
│   │   ├── session/       # Shopping session interface
│   │   ├── import/        # Import dialogs
│   │   ├── export/        # Export dialogs
│   │   └── ui/            # Base UI components (Radix UI)
│   ├── services/
│   │   ├── folderService.ts  # Folder operations
│   │   ├── import/           # Import logic
│   │   └── export/           # Export logic
│   ├── App.tsx            # Root component
│   └── main.tsx           # Entry point
├── public/                # Static assets
├── ARCHITECTURE.md        # System overview
├── README.md              # Getting started
├── QUICKSTART.md          # Quick setup
└── CLAUDE.md              # This file
```

## Jazz.tools Integration

Jazz is a distributed database that syncs across devices in real-time with offline support and end-to-end encryption.

**Key Concepts**:
- **CoValues**: Collaborative values (CoMap, CoList, etc.) that sync automatically
- **Accounts**: User identities with cryptographic keys
- **Real-time Sync**: Automatic via Jazz cloud or self-hosted sync server

### Data Model

See `ARCHITECTURE.md` for system overview.

**Schemas are defined in**:
- `src/schemas/index.ts` - Account and root
- `src/schemas/tree.ts` - FolderNode, TemplateItem, ShoppingSession, ItemState

**Key schema types**:
- `FolderNode` - Organizational folder or template folder (discriminated union)
- `TemplateItem` - Hierarchical category or item node
- `ShoppingSession` - Shopping trip state tracker
- `ItemState` - Per-item shopping state
- `GroceriesAccount` - User account

### Jazz Schema Syntax (v0.18.x)

Schemas use function-based syntax with `co.map()`:

```typescript
import { co, z } from 'jazz-tools';

export const MySchema = co.map({
  name: z.string(),
  optional: z.optional(z.string()),
  list: co.list(OtherSchema),
  get reference() { return AnotherSchema; },
  createdAt: z.date(),
});
```

**Key patterns**:
- Use `z` (Zod) for primitives: `z.string()`, `z.boolean()`, `z.date()`
- Use `z.optional()` for optional primitives
- Use `co.optional()` for optional CoValue references
- Use getters for forward references
- Use `co.list()` for lists of CoValues

## BetterAuth Integration

BetterAuth provides authentication with Jazz integration via the `jazz-tools/better-auth/auth` plugin.

**Authentication Flow**:
1. User authenticates through BetterAuth (Google/Apple OAuth)
2. Jazz account keys are stored with BetterAuth user
3. On login, Jazz retrieves keys and enables full offline functionality

**Files**:
- `src/lib/auth-client.ts` - BetterAuth client with Jazz plugin
- `src/lib/jazz.tsx` - JazzProvider wrapper component

## Environment Variables

Required variables (see `.env.example`):

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
APPLE_CLIENT_ID=...
APPLE_CLIENT_SECRET=...
VITE_API_URL=http://localhost:3000
VITE_JAZZ_PEER=wss://cloud.jazz.tools
```

## Common Development Patterns

### Working with Jazz CoValues

Jazz CoValues are reactive - they sync automatically when mutated:

```typescript
// Read data (reactive)
const { me } = useAccount(GroceriesAccount);

// Update data (automatic sync)
folder.name = "New Name";
folder.items.push(newItem);

// Soft delete
item.archived = true;
```

**Important**: Don't use `useState` with CoValues - they're already reactive.

### Creating Data

All creation happens client-side with automatic sync:

```typescript
const newFolder = FolderNode.create({
  name: "My Folder",
  type: "template-folder",
  path: "my-folder",
  expanded: false,
  archived: false,
  items: [],
  sessions: [],
  currentSessionId: "",
  owner: me,
  createdAt: new Date(),
  updatedAt: new Date(),
}, { owner: me });

me.root.nodes.push(newFolder);
```

## Key Implementation Notes

### Hierarchical Organization

- **Templates** are organized in a folder tree
- **Path-based hierarchy**: "grocery-stores/wegmans/weekly"
- **Discriminated unions**: FolderNode has `type: "folder" | "template-folder"`
- **TemplateItems** have `type: "category" | "item"` for internal hierarchy

### Shopping Sessions

- Sessions track shopping state **separately** from templates
- Templates stay clean (no shopping state pollution)
- ItemState maps itemId → shopping state (inCart, purchased)
- Multiple sessions can reference the same template

### Soft Deletes

Always use `archived: true` instead of hard deletion:

```typescript
// Never do this:
folder.items.splice(index, 1);  // ❌

// Always do this:
item.archived = true;  // ✅
item.updatedAt = new Date();
```

## Testing & Building

```bash
npm run type-check   # TypeScript validation
npm run lint         # Code linting
npm run test:run     # Unit tests
npm run test:e2e     # E2E tests
npm run build        # Production build
npm run preview      # Test production build
```

## Troubleshooting

See `TYPESCRIPT_FIXES.md` for common TypeScript issues with Jazz.

**Build errors**:
- Clear `node_modules` and reinstall
- Check TypeScript errors: `npx tsc --noEmit`

**OAuth not working**:
- Check credentials in `.env`
- Verify redirect URIs in OAuth console

**Data not syncing**:
- Check Jazz sync server connection (browser console)
- Check network tab for WebSocket connection

## Important Notes for AI Assistants

- **Jazz CoValues are reactive** - don't use `useState` with them
- **Mutations are automatic** - directly modify CoValue properties, no setState
- **Real-time sync is automatic** - no manual API calls needed
- **Offline support is built-in** - data works without connection
- **Schema syntax is v0.18.x** - use `co.map()` not class-based syntax
- **Always soft delete** - use `archived: true`, never splice/remove
- **Templates stay clean** - session state tracked separately in ShoppingSession

## Documentation

- **README.md** - Getting started and setup
- **QUICKSTART.md** - Quick setup guide
- **ARCHITECTURE.md** - System architecture overview
- **AUTONOMOUS_EXECUTION_PLAN.md** - Quality gates workflow
- **TYPESCRIPT_FIXES.md** - TypeScript troubleshooting
- **Jazz Docs**: https://jazz.tools/docs
- **BetterAuth Docs**: https://better-auth.com/docs

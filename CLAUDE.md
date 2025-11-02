# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A collaborative grocery list application built with Jazz.tools and BetterAuth.

**Key Features**:
- Real-time sync across devices
- Offline-first with automatic sync
- End-to-end encryption
- Multi-provider OAuth (Google + Apple)
- Smart item categorization

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
npm run dev             # Start development server (http://localhost:5173)
npm run build           # Build for production
npm run preview         # Preview production build
npm run lint            # Run Biome linting
npm run type-check      # Run TypeScript type checking
npm run test:run        # Run unit tests (Vitest)
npm run test:e2e        # Run E2E tests (Playwright)
npm run check           # Run type-check + lint + tests
```

## Git Hooks

**IMPORTANT**: This project has strict git hooks that run before every commit.

- **Pre-commit hook**: Runs type-check, lint, unit tests, and E2E tests (~6-10 minutes)
- **Commit-msg hook**: Enforces subject (10-72 chars) and body (max 10 lines) limits

See [GIT_HOOKS.md](./GIT_HOOKS.md) for complete documentation and examples.

**All checks must pass before committing** - there is no bypass option.

## Project Structure

```
groceries-jazz/
├── src/
│   ├── schemas/
│   │   └── index.ts              # Jazz CoValue schemas
│   ├── lib/
│   │   ├── auth.ts               # BetterAuth server config (reference)
│   │   ├── auth-client.ts        # BetterAuth client with Jazz plugin
│   │   ├── jazz.tsx              # Jazz provider setup
│   │   └── utils.ts              # Helper functions
│   ├── components/
│   │   ├── Dashboard.tsx         # Main dashboard with auth UI
│   │   ├── ui/                   # Base UI components (Radix UI)
│   │   ├── lists/                # List management components
│   │   ├── items/                # Item management components
│   │   ├── categories/           # Category components
│   │   └── layout/               # Layout components
│   ├── hooks/                    # Custom React hooks
│   ├── App.tsx                   # Root component
│   └── main.tsx                  # Entry point
├── public/                       # Static assets
├── .env.example                  # Environment variable template
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

## Jazz.tools Integration

Jazz is a distributed database that syncs across devices in real-time with offline support and end-to-end encryption.

**Key Concepts**:
- **CoValues**: Collaborative values (CoMap, CoList, etc.) that sync automatically
- **Accounts**: User identities with cryptographic keys
- **Groups**: Access control for shared data
- **Real-time Sync**: Automatic via Jazz cloud or self-hosted sync server

### Jazz Schemas

Located in `src/schemas/index.ts`:

**GroceryItem**:
- name, quantity, notes
- category (produce, dairy, meat, pantry, frozen, household, bakery, beverages, other)
- checked, archived status
- addedBy, checkedBy (Account references)
- createdAt, updatedAt timestamps

**GroceryList**:
- name
- items (list of GroceryItem references)
- owner (Account reference)
- archived status
- createdAt, updatedAt timestamps

**ListsRoot**:
- myLists (lists owned by user)
- sharedLists (lists shared with user)

**GroceriesAccount**:
- profile
- root (ListsRoot)

### Jazz Schema Syntax (v0.18.x)

Schemas use function-based syntax with `co.map()`:

```typescript
import { co, z } from 'jazz-tools';

export const GroceryItem = co.map({
  name: z.string(),
  quantity: z.optional(z.string()),
  category: z.literal([...] as const).default('other'),
  checked: z.boolean(),
  get addedBy() { return GroceriesAccount; },
  createdAt: z.date(),
});
```

**Key patterns**:
- Use `z` (Zod) for primitive types: `z.string()`, `z.boolean()`, `z.date()`
- Use `z.optional()` for optional primitives
- Use `co.optional()` for optional CoValue references
- Use getters for forward references to other schemas
- Use `co.list()` for lists of items

## BetterAuth Integration

BetterAuth provides authentication with Jazz integration via the `jazz-tools/better-auth/auth` plugin.

**Authentication Flow**:
1. User authenticates through BetterAuth (Google/Apple OAuth)
2. Jazz account keys are stored with BetterAuth user
3. On login, Jazz retrieves keys and enables full offline functionality

**Files**:
- `src/lib/auth.ts` - Server config reference (not used in client build)
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

## Design System

**Colors**:
- Primary: Green (#22c55e) - Fresh, grocery-themed
- Category colors: Each category has distinct color (see `tailwind.config.js`)
- Semantic: success, warning, error, info

**Components**:
- Base components from Radix UI (accessible, unstyled)
- Custom styling with Tailwind
- Animations with Framer Motion

**Responsive**:
- Mobile-first approach
- Touch targets minimum 44x44px
- Optimized for shopping on-the-go

## Common Development Patterns

### Working with Jazz CoValues

Jazz CoValues are reactive - they sync automatically when mutated:

```typescript
// Read data (reactive)
const { me } = useAccount(GroceriesAccount);
const list = useCoState(GroceryList, listId);

// Update data (automatic sync)
list.name = "New Name";
list.items.push(newItem);

// Soft delete
list.archived = true;
```

**Important**: Don't use `useState` with CoValues - they're already reactive.

### Creating Data

All creation happens client-side with automatic sync:

```typescript
const newList = GroceryList.create({
  name: "Weekly Shopping",
  items: co.list([]),
  owner: me,
  archived: false,
  createdAt: new Date(),
  updatedAt: new Date(),
}, { owner: me });
```

### Sharing Lists

Use Groups for access control:

```typescript
const group = Group.create();
await group.addMember(otherAccount, "writer");

const list = GroceryList.create({...}, { owner: group });
```

## Adding New Features

### Add a New Category

1. Update `Category` type in `src/schemas/index.ts`
2. Add to `CATEGORIES` object with name, icon, color
3. Update `autoCategorize()` function with keywords

### Add a New Field to Items

1. Add field to `GroceryItem` schema in `src/schemas/index.ts`
2. Update creation logic in components
3. Update UI to display/edit new field

### Create a New Component

1. Create file in appropriate `src/components/` subfolder
2. Use Jazz hooks: `useAccount()`, `useCoState()`
3. Mutations happen directly on CoValues (no setState needed)

## Testing & Building

```bash
# Type checking
npx tsc --noEmit

# Linting
npm run lint

# Build for production
npm run build

# Preview production build
npm run preview
```

## Deployment

**Frontend** (Vite build):
- Deploy to Vercel, Netlify, or static hosting
- Run `npm run build`, upload `dist/` folder
- Set environment variables on hosting platform

**Backend** (BetterAuth):
- Required for OAuth callbacks
- Deploy as serverless functions or Node.js app
- Options: Vercel Functions, Netlify Functions, Express server

## Troubleshooting

**Build errors**:
- Clear `node_modules` and reinstall
- Check TypeScript errors: `npx tsc --noEmit`
- Verify all imports are correct

**OAuth not working**:
- Check credentials in `.env`
- Verify redirect URIs in OAuth console
- Ensure BetterAuth backend API is running

**Data not syncing**:
- Check Jazz sync server connection (browser console)
- Verify account permissions
- Check network tab for WebSocket connection

## Important Notes for AI Assistants

- **Jazz CoValues are reactive** - don't use `useState` with them
- **Mutations are automatic** - directly modify CoValue properties, no setState
- **BetterAuth integration** is via `jazz-tools/better-auth/auth` package
- **Real-time sync is automatic** - no manual API calls needed
- **Offline support is built-in** - data works without connection
- **Schema syntax is v0.18.x** - use `co.map()` not class-based syntax
- **Reference file**: ~/Downloads/llms-full.txt contains complete Jazz documentation

## Documentation

- **README.md** - Full project documentation
- **QUICKSTART.md** - Get started in 5 minutes
- **PROJECT_STATUS.md** - Current implementation status
- **Jazz Docs**: https://jazz.tools/docs
- **BetterAuth Docs**: https://better-auth.com/docs
- **Jazz Reference**: ~/Downloads/llms-full.txt

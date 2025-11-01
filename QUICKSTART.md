# Quick Start Guide

## Get Up and Running in 5 Minutes

### 1. Install Dependencies

```bash
cd groceries-jazz
npm install
```

### 2. Set Up Environment

```bash
cp .env.example .env
```

For now, you can start without OAuth credentials. The app will work with email/password auth if configured.

### 3. Start Development Server

```bash
npm run dev
```

Open http://localhost:5173

### 4. What You'll See

- **Sign-in page** with Google and Apple OAuth buttons
- Modern, clean UI with green grocery theme
- Real-time collaborative features (once logged in)

## Next Steps

### Set Up OAuth (Optional for MVP)

#### Google OAuth
1. Visit https://console.cloud.google.com/
2. Create OAuth credentials
3. Add to `.env`:
   ```
   GOOGLE_CLIENT_ID=your_id
   GOOGLE_CLIENT_SECRET=your_secret
   ```

#### Apple OAuth
1. Visit https://developer.apple.com/
2. Set up Sign in with Apple
3. Add to `.env`:
   ```
   APPLE_CLIENT_ID=your_id
   APPLE_CLIENT_SECRET=your_secret
   ```

### Understanding the Architecture

**Jazz.tools** handles:
- ✅ Database (no backend needed!)
- ✅ Real-time sync
- ✅ Offline support
- ✅ End-to-end encryption
- ✅ Conflict resolution

**BetterAuth** handles:
- ✅ OAuth (Google, Apple)
- ✅ User sessions
- ✅ Account management

**Your React app** just focuses on UI!

### Key Files to Explore

1. **`src/schemas/index.ts`** - Data models (GroceryList, GroceryItem)
2. **`src/components/Dashboard.tsx`** - Main UI with auth
3. **`src/lib/jazz.tsx`** - Jazz + BetterAuth integration
4. **`tailwind.config.js`** - Design system colors

### Making Changes

#### Add a New Item Field

1. Edit `src/schemas/index.ts`:
   ```typescript
   export class GroceryItem extends CoMap {
     // ... existing fields
     price = co.optional.number; // Add this
   }
   ```

2. Update components to display/edit the new field

#### Add a New Category

1. Edit `src/schemas/index.ts`:
   ```typescript
   export type Category =
     | 'produce'
     | 'dairy'
     // ... existing
     | 'snacks'; // Add this
   ```

2. Add to `CATEGORIES` object with icon and color

3. Update `autoCategorize()` function

### Common Commands

```bash
npm run dev      # Start dev server
npm run build    # Build for production
npm run preview  # Test production build
npm run lint     # Check code quality
```

### Troubleshooting

**Port 5173 already in use?**
```bash
# Kill the process
lsof -ti:5173 | xargs kill -9
```

**TypeScript errors?**
```bash
# Check what's wrong
npx tsc --noEmit
```

**Dependencies issues?**
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
```

## What's Next?

The current implementation has:
- ✅ Project structure
- ✅ Jazz schemas
- ✅ BetterAuth integration
- ✅ Authentication UI
- ✅ Design system

**To complete MVP**, you need to implement:
- [ ] List management UI (create, view, edit lists)
- [ ] Item management UI (add, check, delete items)
- [ ] Category filtering and display
- [ ] Sharing functionality
- [ ] Shopping mode

See `README.md` for full documentation and `CLAUDE.md` for AI assistant guidance.

---

**Happy coding! 🎷**

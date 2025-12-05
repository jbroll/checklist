# Bubblelist Roadmap

Product positioning, competitive analysis, and development priorities.

*Last updated: December 2025*

---

## Market Position

### Unique Differentiators (Verified)

These features are implemented and genuinely differentiate Bubblelist:

| Feature | Status | Competitors |
|---------|:------:|:-----------:|
| **Template-session separation** | **Unique** | None have this |
| **Hierarchical folder organization** | Rare | AnyList (premium only) |
| **Nested categories within templates** | **Unique** | None |
| **Encrypted sync (Jazz.tools)** | Rare | Most store plaintext |
| **True offline-first** | Rare | Most are cache-only |
| **No ads, no tracking** | Rare | Most are ad-supported |
| **Folder sharing with invites** | Common | Most have sharing |
| **Auto-categorization (4,622 items)** | Common | AnyList, Bring! have similar |
| **Multi-domain autocomplete** | Rare | Most grocery-only |

### Key Competitors

| App | Strength | Weakness vs Bubblelist |
|-----|----------|------------------------|
| **AnyList** | Market leader, 4.9 rating, recipes | No template separation, proprietary |
| **OurGroceries** | Simple, established | No hierarchy, dated UI |
| **Bring!** | Visual icons, modern | No template separation |
| **Todoist** | Powerful task manager | Overkill for shopping |
| **Google Keep** | Free, Google ecosystem | No hierarchy, basic |

### Target Users

1. **Organization enthusiasts** - Want hierarchical templates, clean separation
2. **Privacy-aware users** - Prefer encrypted sync over plaintext
3. **Multi-store shoppers** - Maintain different templates per store
4. **Power users** - Frustrated with flat list limitations

---

## Implemented Features

### Core (Complete)
- Real-time sync across devices
- True offline-first with CRDT conflict resolution
- Hierarchical folders and templates
- Template-session separation
- Encrypted storage and sync (Jazz.tools)
- Google + Apple OAuth
- Multi-format import/export (JSON, CSV, TXT)

### Polish Sprint (December 2025)
- [x] Dark mode with system preference detection
- [x] PWA install prompt with platform instructions
- [x] Item notes (template + session level)
- [x] Template duplication
- [x] Item count on template folders
- [x] Account deletion with crypto-shredding
- [x] Privacy-focused OAuth (email-only scope)

### Auto-Categorization (December 2025)
- [x] Grocery dictionary: 2,276 items, 18 categories
- [x] Hardware dictionary: 1,362 items, 16 categories
- [x] Outdoor dictionary: 984 items, 26 categories
- [x] Fuzzy matching with quantity parsing
- [x] Per-template domain selection
- [x] LRU-cached multi-domain search

### Sharing (November 2025)
- [x] Email-based folder invitations
- [x] Permission levels (view/edit/admin)
- [x] Collaborator management
- [x] Real-time collaborative sync

---

## Outstanding Work

### High Priority (Competitive Parity)

| Feature | Effort | Notes |
|---------|--------|-------|
| **Search/filter** | 4-6h | Filter items by name in session/template |
| **Custom session names** | 2-3h | Optional name instead of date |
| **Keyboard shortcuts** | 2-3h | Enter, Escape, arrow navigation |

### Medium Priority (Nice to Have)

| Feature | Effort | Notes |
|---------|--------|-------|
| Expose timestamps in UI | 2-3h | Show "completed in X min" stats |
| Quick inline notes | 2-3h | Edit notes without modal |
| Session comparison | 4-6h | Compare items across sessions |

### Future Consideration

| Feature | Effort | Notes |
|---------|--------|-------|
| Labels/tags | 6-8h | May be unnecessary given hierarchy |
| Recurring sessions | 8-12h | Auto-create on schedule |
| Undo/redo | 6-8h | Action history |
| Item photos | 6-8h | Attach images to items |

### Explicitly Not Planned

These add complexity without proportional value:
- Barcode scanning
- Voice assistant integrations
- Price tracking
- Recipe import/meal planning
- Kanban/calendar views
- Gamification (streaks, points)

---

## Value Proposition

> Bubblelist separates your shopping templates from your shopping sessions - so you can reuse your carefully organized lists week after week without resetting anything. Combined with real-time collaboration, encrypted sync, and true offline support, it's the list app for people who take organization seriously.

### Key Messages

1. **Templates**: "Create once, shop forever. Your templates stay clean while sessions track your progress."

2. **Organization**: "Nested folders, nested categories. Organize your shopping the way your brain works."

3. **Reliability**: "Works in airplane mode, underground, or anywhere with spotty reception."

4. **Collaboration**: "Share folders with family. See updates instantly. No one buys duplicates."

5. **Privacy**: "Your data is encrypted in transit and at rest. No ads, no tracking."

---

## Technical Notes

### Architecture Strengths
- Jazz.tools CRDT sync (automatic conflict resolution)
- Offline-first with full CRUD without network
- Type-safe schemas with Zod validation
- 146+ automated tests (unit + E2E)
- Service layer abstraction (100% coverage)

### Known Limitations
- Jazz account keys stored server-side (convenient but not perfect E2E)
- Mobile experience good but not native app quality
- Single sync server (Jazz Cloud) - no self-hosting option yet

---

## References

- [MARKET_COMPARISON.md](./MARKET_COMPARISON.md) - Full competitive analysis
- [ARCHITECTURE.md](../ARCHITECTURE.md) - Technical architecture
- [autocomplete/](./autocomplete/) - Dictionary documentation

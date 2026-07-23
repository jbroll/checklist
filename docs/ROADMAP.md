# CheckList Roadmap

Development priorities and product positioning.

*Last updated: April 2026*

---

## Market Position

### Differentiators

| Feature | Status | Competitors |
|---------|:------:|:-----------:|
| **Template-session separation** | **Unique** | None have this |
| **Nested categories within templates** | **Unique** | None |
| **Hierarchical folder organization** | Rare | AnyList (premium only) |
| **Self-hosted sync (rowboat)** | Rare | Most use third-party clouds |
| **True offline-first** | Rare | Most are cache-only |
| **No ads, no tracking** | Rare | Most are ad-supported |
| **Multi-domain autocomplete** | Rare | Most grocery-only |
| **Inline search + toggle from autocomplete** | Rare | Most have separate search |

### Key Competitors

| App | Strength | Weakness vs CheckList |
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

## Outstanding Work

Feature and engineering backlog — including what's explicitly *not* planned — lives in the single
project backlog: [BACKLOG.md](./BACKLOG.md).

---

## Value Proposition

> CheckList separates your shopping templates from your shopping sessions - so you can reuse your carefully organized lists week after week without resetting anything. Combined with real-time collaboration, encrypted sync, and true offline support, it's the list app for people who take organization seriously.

### Key Messages

1. **Templates**: "Create once, shop forever. Your templates stay clean while sessions track your progress."
2. **Organization**: "Nested folders, nested categories. Organize your shopping the way your brain works."
3. **Reliability**: "Works in airplane mode, underground, or anywhere with spotty reception."
4. **Collaboration**: "Share folders with family. See updates instantly. No one buys duplicates."
5. **Privacy**: "Your data is encrypted in transit and at rest. No ads, no tracking."

---

## Technical Notes

### Architecture Strengths
- rowboat sync — relational, offline-first, automatic HLC conflict resolution
- Offline-first with full CRUD without network
- Type-safe schemas with Zod validation
- 1550 automated tests (unit + E2E)
- Service layer abstraction
- Self-hosted sync/storage on rowboat (`@jbroll/rowboat-*`)

### Known Limitations
- List data is stored server-side in plaintext (no end-to-end encryption);
  protected by TLS in transit and scope-group RBAC, not client-side crypto
- Mobile experience good but not native app quality
- Single hosted sync server (no multi-region failover yet)

---

## References

- [MARKET_COMPARISON.md](./MARKET_COMPARISON.md) - Full competitive analysis
- [ARCHITECTURE.md](../ARCHITECTURE.md) - Technical architecture
- [autocomplete/](./autocomplete/) - Dictionary documentation

# Google Play Store Assets

## Required Files

| File | Dimensions | Format | Notes |
|------|------------|--------|-------|
| `icon-512x512.png` | 512x512 | PNG | 32-bit, no transparency |
| `feature-graphic-1024x500.png` | 1024x500 | PNG/JPG | Banner at top of listing |

## Screenshots

Place in `screenshots/` folder.

- **Dimensions**: 1080x1920 (portrait) or 1920x1080 (landscape)
- **Format**: PNG or JPG
- **Required**: Minimum 2, maximum 8
- **Naming**: Use numbered prefixes for ordering (01-, 02-, etc.)

### Recommended Screenshots

1. `01-dashboard.png` - Main folder tree with templates
2. `02-editor.png` - Template editor with nested categories
3. `03-shopping.png` - Shopping session with items checked
4. `04-sharing.png` - Share/collaboration dialog
5. `05-dark-mode.png` - Dark theme view
6. `06-profile.png` - Account/settings screen

## Capture Commands

```bash
# From connected device/emulator
adb exec-out screencap -p > screenshots/01-dashboard.png
```

## Brand Colors

- CheckList green: #22c55e
- kjekit teal: #76daDA

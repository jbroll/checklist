# Post-Deployment Smoke Testing

## Overview

Playwright-based smoke tests that run against deployed test/prod environments without authentication, using local-only mode (anonymous Jazz accounts).

## URLs

| Environment | URL |
|-------------|-----|
| Local | `http://localhost:5173` |
| Test | `https://checklist-test.rkroll.com` |
| Production | `https://app.kjekit.com` |

## Running Smoke Tests

```bash
# Test against local dev server (must be running)
npm run test:smoke:local

# Test against test environment
npm run test:smoke:test

# Test against production
npm run test:smoke:prod
```

Or using Make:

```bash
make smoke-local
make smoke-test
make smoke-prod
```

## What Gets Tested

Tests run without authentication using anonymous Jazz accounts:

1. **Page Load** - Homepage loads, core UI visible
2. **Create Folder** - Can create a new folder
3. **Create Template** - Can create a template in a folder
4. **Add Items** - Can add items to a template
5. **Shopping Session** - Can open template and toggle items
6. **Export/Import UI** - Export and import dialogs open
7. **Navigation** - Browser back/forward works

## How It Works

- `SMOKE_TEST=true` env var disables local dev server and mock OAuth
- `BASE_URL` env var points to the target environment
- Tests use fresh browser context (no cookies/storage from previous runs)
- Anonymous Jazz accounts are created per test run
- No backend auth required - uses local-only mode

## Implementation Details

### Files

| File | Purpose |
|------|---------|
| `playwright.config.ts` | Configured to support SMOKE_TEST mode |
| `e2e/deploy-smoke.spec.ts` | Deployment smoke test suite |
| `package.json` | NPM scripts for smoke tests |
| `Makefile` | Make targets for smoke tests |

### Config Changes

When `SMOKE_TEST=true`:
- `webServer` is disabled (no local dev server started)
- `globalSetup` is disabled (no mock OAuth server)
- `baseURL` uses the `BASE_URL` env var

## Future Enhancements

- Add authenticated smoke tests with test accounts
- Integrate with CI/CD for post-deploy verification
- Add health check endpoint validation

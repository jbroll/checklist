# Git Hooks Documentation

This project uses git hooks to enforce code quality and commit message standards.

## Pre-Commit Hook

Located at: `.git/hooks/pre-commit`

### What it does
Runs automatically before each commit to validate code quality. **No bypass option** - all checks must pass.

### Checks performed (in order)

1. **TypeScript Type Checking** (`npm run type-check`)
   - Ensures no TypeScript compilation errors
   - Must have 0 errors to proceed

2. **Biome Linting** (`npm run lint`)
   - Enforces code style and catches common issues
   - Must have 0 errors to proceed

3. **Unit Tests** (`npm run test:run`)
   - Runs complete Vitest test suite
   - All tests must pass

4. **E2E Tests** (`npm run test:e2e`)
   - Runs complete Playwright test suite
   - Takes 5-10 minutes
   - All tests must pass

### Expected runtime
- First 3 checks: ~30 seconds
- E2E tests: 5-10 minutes
- **Total: ~6-10 minutes per commit**

## Commit Message Hook

Located at: `.git/hooks/commit-msg`

### What it does
Validates commit message format and enforces conciseness.

### Requirements

1. **Subject line**: 10-72 characters
   - First non-empty line of commit message
   - Must be descriptive but concise

2. **Body**: Maximum 10 lines
   - Excludes comment lines (starting with `#`)
   - Excludes blank lines
   - Count includes all content lines

3. **Auto-cleanup**
   - Automatically removes "Generated with...Claude Code" lines
   - Preserves "Co-Authored-By" lines

4. **Exceptions**
   - Merge commits (starting with "Merge")
   - Revert commits (starting with "Revert")

### Recommended Format

```
Short descriptive subject (10-72 chars)

- Bullet point describing change
- Another key change
- Test coverage info
- Any breaking changes

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Example (compliant)

```
Add JSON export/import with full test coverage

- Export/import folders and items as JSON files
- Browser-based upload/download (no server needed)
- Conflict resolution for duplicate folders
- Export & Import dialogs with validation
- 81 unit tests + 20 E2E tests, all passing
- Type-safe Jazz CoValue handling

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Character count**: Subject = 48 chars, Body = 7 lines ✅

### Example (non-compliant)

❌ **Too short subject**
```
Add export

- Added export feature
```
Subject is only 10 chars (needs to be descriptive)

❌ **Subject too long**
```
Add comprehensive JSON export and import functionality with full test coverage and validation
```
Subject is 95 chars (max 72)

❌ **Body too long**
```
Add export feature

This commit adds:
- Export functionality for all folders
- Export functionality for single folders
- Import functionality with validation
- Conflict resolution
- Browser-based file handling
- Export dialog component
- Import dialog component
- 81 unit tests
- 20 E2E tests
- Full type safety
```
Body is 11 lines (max 10)

## Tips for Claude Code

When creating commits:

1. **Run checks manually first**
   ```bash
   npm run type-check
   npm run lint
   npm run test:run
   npm run test:e2e
   ```

2. **Keep commits focused**
   - One logical change per commit
   - Makes rollbacks easier
   - Easier to review

3. **Write concise commit messages**
   - Use bullet points for clarity
   - Focus on "what" and "why", not "how"
   - Subject should summarize the entire commit

4. **Be patient**
   - Pre-commit hooks take 6-10 minutes
   - This ensures code quality
   - Prevents broken commits in history

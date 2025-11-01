# Autonomous Execution Plan

**Purpose**: Top-level workflow for autonomous task execution with quality gates

**Last Updated**: 2025-11-01

---

## 🎯 Execution Philosophy

**Core Principle**: Work autonomously following sprint documentation (e.g., MOBILE_SPRINT.md), with mandatory quality gates at each step.

**Quality First**: Every task must pass all quality gates before moving to the next task. No shortcuts.

**Fail Fast**: Run checks early and often. Fix issues immediately.

---

## 📋 Standard Task Execution Workflow

### Phase 1: Implementation

1. **Read Task Documentation**
   - Review task description in sprint doc
   - Understand acceptance criteria
   - Identify files to create/modify
   - Note dependencies on other tasks

2. **Implement Code**
   - Follow step-by-step instructions in sprint doc
   - Maintain existing code style and patterns
   - Follow CLAUDE.md guidelines (no `any` types, etc.)

3. **Write Tests**
   - Unit tests for new hooks/utilities
   - E2E tests for user-facing features
   - Update existing tests if behavior changed
   - Follow docs/UI_TESTING_GUIDE.md standards

---

### Phase 2: Quality Gates

**Run these checks in sequence. Each must pass before proceeding.**

#### Gate 1: Type Checking ✅
```bash
npm run type-check
```
Fix all type errors. Re-run until zero errors.

#### Gate 2: Linting ✅
```bash
npm run lint
```
Run `npm run lint:fix` for auto-fixes. Re-run until zero errors/warnings.

#### Gate 3: Unit Tests ✅
```bash
npm run test:run
```
Fix failing tests. Re-run until all passing.

#### Gate 4: E2E Tests ✅
```bash
npm run test:e2e
```
Fix failing E2E tests. Re-run until all passing.

#### Gate 5: Desktop Regression ✅
```bash
npm run test:regression
```
Ensure desktop functionality not broken. Re-run until all passing.

---

### Phase 3: Commit

#### Pre-Commit Checklist

- [ ] ✅ Type checking passes
- [ ] ✅ Linting passes
- [ ] ✅ Unit tests pass
- [ ] ✅ E2E tests pass
- [ ] ✅ Desktop regression passes
- [ ] ✅ New tests written for new functionality
- [ ] ✅ No `console.log` statements (unless intentional)
- [ ] ✅ No `any` types
- [ ] ✅ JSDoc comments on exported functions
- [ ] ✅ All acceptance criteria from sprint doc met

#### Commit Message Format

```bash
git commit -m "$(cat <<'EOF'
<type>: <short summary>

<detailed description>
<list of files changed>
<acceptance criteria met>

Type checking, linting, and all tests pass.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

**Commit Types**: `feat`, `fix`, `refactor`, `test`, `docs`, `style`, `perf`, `chore`

---

### Phase 4: Iteration

1. **Update Sprint Doc**
   - Mark completed task as ✅ VERIFIED with file references
   - Update progress percentage

2. **Review Next Task**
   - Check dependencies
   - Read task description and acceptance criteria
   - Start Phase 1 (Implementation)

---

## 🚨 Handling Failures

### If Quality Gate Fails

**DO**:
- ✅ Read error messages carefully
- ✅ Fix issues one at a time
- ✅ Re-run checks after each fix
- ✅ Check documentation (CLAUDE.md, UI_TESTING_GUIDE.md)

**DON'T**:
- ❌ Skip quality gates
- ❌ Commit with failing tests
- ❌ Use `@ts-ignore` or `any` to bypass errors
- ❌ Comment out failing tests

### If Stuck on Issue

1. **Self-Debug** (10-15 min): Read errors, check related code, review docs
2. **Ask User**: Explain what you tried, show errors, propose solutions
3. **Alternative Approach**: Document why original didn't work, get approval

---

## 📚 Reference Documents

For detailed implementation instructions, code examples, and testing patterns, see:

- **MOBILE_SPRINT.md** (or current sprint doc) - Detailed task execution plans with code snippets
- **CLAUDE.md** - Project-specific coding standards
- **docs/UI_TESTING_GUIDE.md** - UI testing standards
- **docs/TESTING_IMPLEMENTATION.md** - Testing framework details
- **docs/JAZZ_DOCUMENTATION.md** - Jazz framework specifics

---

## ✅ Success Metrics

- **Quality Gates**: 5/5 passing ✅
- **Type Safety**: Zero `any` types
- **Lint Issues**: Zero errors, zero warnings
- **Commit Quality**: Descriptive messages with acceptance criteria

**Remember**: Quality over speed. Take time to get it right rather than create technical debt.

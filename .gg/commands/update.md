---
name: update
description: Update dependencies, fix deprecations and warnings
---

## Step 1: Check for Updates

```bash
pnpm outdated
```

## Step 2: Update Dependencies

```bash
# Update all dependencies to latest
pnpm update --latest

# Then run security audit
pnpm audit
```

## Step 3: Check for Deprecations & Warnings

Run a clean install and read ALL output carefully:

```bash
rm -rf node_modules packages/*/node_modules
pnpm install
```

Look for:
- Deprecation warnings
- Security vulnerabilities
- Peer dependency warnings
- Breaking changes

## Step 4: Fix Issues

For each warning/deprecation:
1. Research the recommended replacement or fix
2. Update code/dependencies accordingly
3. Re-run installation
4. Verify no warnings remain

## Step 5: Run Quality Checks

```bash
pnpm build
pnpm check
pnpm lint
pnpm format:check
```

Fix all errors before completing.

## Step 6: Verify Clean Install

```bash
rm -rf node_modules packages/*/node_modules
pnpm install
pnpm build
pnpm check
pnpm lint
pnpm format:check
```

Verify ZERO warnings/errors.
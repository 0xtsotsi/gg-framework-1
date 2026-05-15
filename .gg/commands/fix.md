---
name: fix
description: Run typechecking and linting, then spawn parallel agents to fix all issues
---

Run all linting and typechecking tools, collect errors, group them by domain, and use the subagent tool to spawn parallel sub-agents to fix them.

## Step 1: Run Checks

```bash
pnpm check    # tsc --noEmit across all packages
pnpm lint     # eslint packages/*/src/
pnpm format:check  # prettier --check packages/*/src/
```

## Step 2: Collect and Group Errors

Parse the output. Group errors by domain:
- **Type errors** (from `pnpm check`): TypeScript errors in any package
- **Lint errors** (from `pnpm lint`): ESLint violations — identify which package(s) have issues
- **Format errors** (from `pnpm format:check`): Prettier formatting issues

Exclude gg-twenty from checks until its pre-existing errors are fixed — add `--filter '@kenkaiiii/gg-ai' --filter '@kenkaiiii/gg-agent' --filter '@kenkaiiii/ggcoder'` to filter selectors.

## Step 3: Spawn Parallel Agents

For each domain with issues, use the subagent tool to spawn a sub-agent to fix all errors in that domain:

- **Type errors**: Spawn a sub-agent targeting `packages/gg-ai/` and `packages/gg-agent/` and `packages/ggcoder/` with the full tsc output
- **Lint errors**: Spawn a sub-agent targeting the package(s) with ESLint issues, running `pnpm lint:fix` then reviewing remaining issues
- **Format errors**: Run `pnpm format` then verify with `pnpm format:check`

## Step 4: Verify

After all agents complete, re-run:
```bash
pnpm check && pnpm lint && pnpm format:check
```
Confirm all pass (exit code 0). Report any remaining issues.
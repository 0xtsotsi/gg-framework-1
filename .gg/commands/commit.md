---
name: commit
description: Run checks, commit with AI message, and push
---

1. Run quality checks:
pnpm build && pnpm check && pnpm lint && pnpm format:check && pnpm test
Fix ALL errors before continuing. Use pnpm lint:fix, pnpm format for auto-fix.

2. Review changes: run git status and git diff --staged and git diff

3. Stage relevant files with git add (specific files, not -A)

4. Generate a commit message:
   - Start with verb (Add/Update/Fix/Remove/Refactor)
   - Be specific and concise, one line preferred

5. Commit and push:
git commit -m "$(cat <<'EOF'
your generated message
EOF
)"
git push
---
name: pr-review
description: Check GitHub PR reviews, auto-resolve mechanical issues, report merge readiness
---

1. Run the pr-review skill to:
   - Detect PR for current branch
   - Fetch review comments (CodeRabbit/Codex)
   - Classify each issue (mechanical vs. needs-human)
   - Auto-apply unambiguous fixes and push with --amend
   - Resolve review comments
   - Report merge readiness summary

2. If no PR exists for the current branch:
   - Create one against main with gh pr create
   - Use the branch name as title if unsure
   - Report PR URL

3. Never auto-merge — report ready status and wait for user approval.
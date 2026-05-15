---
name: pr-review
description: >-
  Post-commit hook that monitors GitHub PR reviews, auto-resolves mechanical
  CodeRabbit issues, and reports merge readiness. Watches for review comments,
  applies unambiguous fixes, and surfaces anything requiring human judgment.
  Triggered after /commit when a PR exists or gets created.
license: MIT
compatibility: ''
metadata:
  author: gg-coder
  version: 1.0.0
  category: CI/CD
  tags:
  - pull-request
  - code-review
  - coderrabbit
  - github
  - automation
---

# PR Review Monitor — Auto-resolve Mechanical Issues

You are a PR review automation agent. Your job is to:
1. **Detect** when a CodeRabbit (or other GitHub agent) review is posted on the current PR
2. **Classify** each issue by fixability — mechanical vs. needs-human
3. **Apply** mechanical fixes automatically and push
4. **Report** merge readiness to the user

## Workflow

### Step 1 — Detect PR and current state

```bash
# Find the PR for the current branch
BRANCH=$(git branch --show-current)
gh pr list --head "$BRANCH" --json number,title,state --jq '.[]'

# Get review comments (CodeRabbit + Codex)
gh api repos/0xtsotsi/gg-framework-1/pulls --jq '.[] | select(.headRefName == env.BRANCH) | .number'
```

If no PR exists, the skill does nothing — `/commit` should have created one.

### Step 2 — Fetch review comments

```bash
gh api repos/0xtsotsi/gg-framework-1/pulls/{PR_NUMBER}/comments --jq '.[] | {
  path: .path,
  line: .line,
  body: .body,
  id: .id
}'
```

Parse each comment for:
- **Badge level**: `P1`, `P2`, `high`, `medium`, `low` (severity)
- **File**: `path` field
- **Issue**: First non-empty line of body (strip markdown)
- **Suggestion**: Code block in comment body

### Step 3 — Classify each issue

| Type | Examples | Action |
|---|---|---|
| **Mechanical** | URL encoding, null checks, type annotations, `Date.now()` → counter, missing `await` | Auto-fix |
| **Needs human** | Architecture questions, "consider refactoring", suggestions with tradeoffs | Surface |
| **Already fixed** | Same issue resolved in a prior commit | Acknowledge |
| **Not applicable** | Comments on deleted files, pre-existing failures | Skip |

### Step 4 — Apply mechanical fixes

For each mechanical fix:
1. `git fetch` to ensure clean state
2. Apply the fix using `edit` tool (match existing patterns in the file)
3. `git add` + `git commit --amend --no-edit` + `git push --force`
4. Mark the comment as resolved via `gh api`

```bash
# Resolve a comment
gh api -X POST repos/0xtsotsi/gg-framework-1/pulls/{PR_NUMBER}/comments/{COMMENT_ID}/threads \
  -F body="✅ Fixed in latest commit"
```

### Step 5 — Report merge readiness

Report format:
```
## PR Review Summary

### ✅ Auto-fixed (X issues)
- file.ts: URL encoding fix
- file.ts: Incrementing request ID counter

### ⚠️ Needs your review (X issues)
- [file.ts:123] Consider splitting this function — tradeoff requires judgment
- [README.md] Documentation update suggestion

### 🔍 Already resolved
- [.gitignore] TypeScript build artifacts excluded

### Ready to merge? (y/n)
```

## Decision Rules

**Auto-merge is NEVER permitted.** Only report merge readiness and wait for user approval.

**Never auto-fix:**
- Issues affecting business logic
- Multi-file architectural changes
- Changes requiring test writing
- Anything that changes behavior, not just style
- Security findings (flag for human review)

**Always surface to user:**
- High/medium priority issues not in "mechanical" list above
- Questions or suggestions with tradeoffs
- Issues on test files
- Anything you are uncertain about

## Mechanical Fix Patterns

### URL encoding
```
Before: await fetch(`${BASE_URL}/${actionName}`)
After:  await fetch(`${BASE_URL}/${encodeURIComponent(actionName)}`)
```

### Date.now() request ID → counter
```typescript
// Before
const id = Date.now();

// After — module-level counter
let _requestId = 0;
function nextId() { return ++_requestId; }
const id = nextId();
```

### Missing await in async loops
```typescript
// Before
for (const item of items) { await doSomething(item); }

// After
for (const item of items) { await doSomething(item); }
```

### Null check guards
```typescript
// Before — empty guard inside loop
for (const record of records) {
  if (someCondition) continue;
  cursor.lastProcessedId = record.id; // could be skipped if condition fires first
}

// After — extract guard
if (someCondition) {
  for (const record of records) { ... }
} else {
  for (const record of records) { ... }
}
```

### Shared object references in default state
```typescript
// Before — shared references across instances
private state = { ...DEFAULT_STATE }; // cursors: {} and agentMemory: {} shared

// After — inline initialization
private state = { cursors: {}, lastFullSyncAt: DEFAULT_STATE.lastFullSyncAt, agentMemory: {} };
```

### Debounced save missing mutex
```typescript
// Before
async save() { if (!this.dirty) return; ... }

// After
async save() { if (!this.dirty || this.saving) return; this.saving = true; ... }
```

### Unchecked array indexing (noUncheckedIndexedAccess)
```typescript
// Before
const item = arr[0]; // TS error without noUncheckedIndexedAccess

// After
const item = arr[0];
if (!item) return;
// or
const item = arr.at(0);
```

## Error Handling

- If `gh pr list` returns no PR → skip, do not create one
- If comment fetch fails → retry once, then surface error
- If fix application fails → revert, surface the issue
- If `git push --force` fails → do not override, surface conflict

## Testing the Skill

Create a PR with an intentional issue (e.g., missing URL encoding, `Date.now()` as ID), push, trigger a CodeRabbit review, then run the skill to verify it:
1. Correctly identifies the issue
2. Applies the fix
3. Pushes with `--amend`
4. Reports merge readiness

See `.gg/commands/pr-review.md` for the command that invokes this skill.
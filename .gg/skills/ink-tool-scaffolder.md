---
name: ink-tool-scaffolder
description: >-
  Scaffold a new AgentTool for ggcoder's CLI. Follow this pattern for any new tool
  added to `packages/ggcoder/src/tools/`. Covers the Zod schema, factory signature,
  safety layers (symlink, read-tracking, plan-mode), and co-located test setup with tmpDir.
triggers:
  - "add a new tool"
  - "create a tool"
  - "new agent tool"
  - "write a bash tool"
  - "write a read tool"
---

# Ink Tool Scaffolder

Every tool in `packages/ggcoder/src/tools/` follows this exact shape. Copy this pattern — do not improvise.

## File structure

```
tools/
  ├── mytool.ts          # Main tool
  └── mytool.test.ts     # Co-located tests
```

## 1. The Zod schema (at the top of the file)

```typescript
import { z } from "zod";

// Params schema — every field described for the LLM
const MyToolParams = z.object({
  target: z.string().describe("File or path to operate on"),
  recursive: z.boolean().optional().default(false).describe("Walk subdirectories"),
});
```

## 2. The factory function

```typescript
import type { AgentTool } from "@kenkaiiii/gg-agent";
import { resolvePath, rejectSymlink } from "./path-utils.js";
import { localOperations, type ToolOperations } from "./operations.js";

export function createMyTool(
  cwd: string,
  readFiles?: Set<string>,   // Track which files have been read (for write/edit safety)
  ops: ToolOperations = localOperations,
): AgentTool<typeof MyToolParams> {
  return {
    name: "mytool",                          // kebab-case, unique
    description: "Does something useful.",   // LLM-facing description

    async execute(params, context) {
      // 1. Resolve and validate path
      const target = resolvePath(cwd, params.target);
      await rejectSymlink(target, ops);        // Block symlink attacks

      // 2. Optional: enforce read-tracking (user must read file before writing it)
      if (readFiles && !readFiles.has(target)) {
        return {
          content: [{ type: "text", text: `Error: file not yet read — "${params.target}". Read it first with the read tool.` }],
          details: { skipped: true },
        };
      }

      // 3. Optional: plan mode guard — restrict write operations in plan mode
      if (context.planMode) {
        return {
          content: [{ type: "text", text: "Error: mytool is not available in plan mode." }],
          details: { skipped: true, reason: "plan_mode" },
        };
      }

      // 4. Core logic here...

      // 5. Return structured result
      return {
        content: [{ type: "text", text: "Done." }],
        details: { target, changed: true },
      };
    },
  };
}
```

## 3. Register in tools/index.ts

```typescript
import { createMyTool } from "./mytool.js";

export function createTools(params: CreateToolsParams): AgentTool[] {
  return [
    createReadTool(params.cwd, params.readFiles, params.ops),
    createWriteTool(params.cwd, params.readFiles, params.ops),
    createMyTool(params.cwd, params.readFiles, params.ops),  // ← add here
    // ...
  ];
}
```

## 4. Co-located tests

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { createMyTool } from "./mytool.js";

const ctx = () => ({ signal: new AbortController().signal });  // AbortSignal helper

let tmpDir: string;
beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mytool-test-"));
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("createMyTool", () => {
  it("returns structured result", async () => {
    const tool = createMyTool(tmpDir, new Set(), {
      readFile: fs.readFile,
      writeFile: fs.writeFile,
      // ...other ops
    });

    const result = await tool.execute({ target: "test.txt" }, ctx());

    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
  });

  it("rejects symlinks", async () => {
    const linkPath = path.join(tmpDir, "link.txt");
    await fs.symlink("/etc/passwd", linkPath).catch(() => {});  // skip on permission error

    const tool = createMyTool(tmpDir, new Set(), /* ops */);
    const result = await tool.execute({ target: "link.txt" }, ctx());

    expect(result.content[0].text).toContain("symlink");
  });
});
```

## Safety layers checklist

Every tool must implement ALL of these:

| Layer | How | Why |
|---|---|---|
| **Path resolution** | `resolvePath(cwd, userInput)` | Prevent `../../` escapes |
| **Symlink rejection** | `await rejectSymlink(resolved, ops)` | Block symlink attacks |
| **Read-tracking** | Check `readFiles.has(target)` before write | Enforce read-before-write |
| **Plan-mode guard** | Check `context.planMode` before write ops | Protect in plan mode |
| **Result shape** | Always return `{ content: ContentBlock[], details?: object }` | Type-safe LLM output |

## Common mistakes

- **Missing `execute`**: The factory returns `AgentTool<typeof Schema>` — make sure `execute` is on the returned object, not the factory itself.
- **Returning raw strings**: Wrap in `content: [{ type: "text", text: "..." }]` — never return a bare string.
- **Forgetting ops parameter**: `localOperations` is the default. In tests, pass a minimal mock.
- **No `describe` on Zod fields**: The LLM uses these to decide when to call the tool. Vague descriptions cause wrong tool selection.
---
name: ink-slash-command-scaffolder
description: >-
  Add a new slash command to ggcoder. There are two kinds: UI-handled (direct React state
  in App.tsx) and registry-based (in slash-commands.ts with SlashCommandContext). This skill
  helps choose the right approach and wire it correctly.
triggers:
  - "add a slash command"
  - "new command"
  - "slash command"
  - "/commit"
  - "/help"
---

# Ink Slash Command Scaffolder

There are two places a slash command can live. Choose the right one before writing anything.

## Decision tree

```
Does the command need to READ or WRITE React state (history, liveItems, tokenCount)?
├── YES → UI-handled (App.tsx)
└── NO → Registry (slash-commands.ts)
```

Common examples:
- **`/model`, `/compact`, `/quit`, `/clear`** → UI-handled (reset state, switch model, manipulate history)
- **`/help`, `/settings`, `/session`, `/new`, `/commit`** → Registry (display info, no React state mutation)

## Approach 1: UI-handled (App.tsx)

Used when the command needs direct access to React state.

### File: `packages/ggcoder/src/ui/App.tsx`

Find `handleSubmit` and add a condition before the `slashCommands.execute()` call:

```tsx
const handleSubmit = async (input: string) => {
  const trimmed = input.trim();

  // ── UI-handled commands (short-circuit before registry) ──
  if (trimmed === "/mycommand") {
    setLiveItems([...liveItems, { kind: "info", text: "Done.", id: getId() }]);
    agentLoop.reset();  // if you need to reset token state
    return;
  }

  if (trimmed === "/quit" || trimmed === "/q" || trimmed === "/exit") {
    // ... existing quit logic
    return;
  }

  // ── Fall through to registry commands ──
  const result = await slashCommands.execute(trimmed, context);
  if (result) {
    setLiveItems([...liveItems, { kind: "info", text: result, id: getId() }]);
  }
};
```

**Rules for UI-handled commands:**
- Run BEFORE `slashCommands.execute()` — they short-circuit the registry.
- Use `setLiveItems(...)` to add output to the terminal.
- Call `agentLoop.reset()` if you need to reset token/message state.
- No return value — the command handles its own output.

## Approach 2: Registry (slash-commands.ts)

Used when the command only needs to display info or call session methods.

### Step 1: Add to SlashCommandContext interface

**File: `packages/ggcoder/src/core/slash-commands.ts`**

```typescript
export interface SlashCommandContext {
  // ... existing methods ...
  myAction: () => Promise<string>;  // ← add your method here
}
```

### Step 2: Wire it in AgentSession

**File: `packages/ggcoder/src/core/session.ts`** — find `createSlashCommandContext()`:

```typescript
createSlashCommandContext(): SlashCommandContext {
  return {
    // ... existing methods ...
    myAction: async () => {
      // Implement here — usually calls into session or settings
      return "Action completed.";
    },
  };
}
```

### Step 3: Register the command

**File: `packages/ggcoder/src/core/slash-commands.ts`** — find `createBuiltinCommands()`:

```typescript
{
  name: "mycommand",
  aliases: ["mc"],
  description: "Does something useful.",
  usage: "/mycommand [args]",
  execute(args, ctx) {
    return ctx.myAction();
  },
},
```

## Quick reference: SlashCommandContext available methods

| Method | Used by | What it does |
|---|---|---|
| `switchModel(provider, model)` | `/model` | Change LLM provider/model |
| `compact()` | `/compact` | Trigger context compaction |
| `newSession()` | `/new` | Start a new session |
| `listSessions()` | `/session` | List saved sessions |
| `getSettings()` | `/settings` | Read current settings |
| `setSetting(key, value)` | `/settings` | Write a setting |
| `getModelList()` | `/model` | List available models |
| `quit()` | `/quit` | Exit the CLI |
| `branch(steps?)` | `/branch` | Create a session branch |
| `listBranches()` | `/branch` | List session branches |

## Common mistakes

- **Wrong location**: If a registry command accidentally mutates React state, the state won't update (you're outside the React component tree). Move to UI-handled.
- **Missing `ctx` method**: If you add a new `SlashCommandContext` method, you MUST wire it in `AgentSession.createSlashCommandContext()`. Forgetting causes runtime errors.
- **Alias collision**: `/q` is already `quit`. Check existing aliases before adding new ones.
- **No alias for single-char commands**: `/h` for `/help`, `/c` for `/compact` — always provide a short alias.
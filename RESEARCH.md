# RESEARCH: LLM Streaming CLI Agent Framework
Generated: 15 May 2025
Stack: TypeScript 6 + pnpm + Ink 7.x + Vitest

## Project Inventory

| Package | Version | Purpose | Build |
|---------|---------|---------|-------|
| `@kenkaiiii/gg-ai` | 4.2.69 | Unified LLM streaming API | tsup |
| `@kenkaiiii/gg-agent` | 4.2.69 | Agent loop with tools | tsup |
| `@kenkaiiii/ggcoder` | 4.2.69 | CLI coding agent | tsc |
| `@kenkaiiii/gg-twenty` | 0.1.0 | Twenty CRM bridge | tsc |

**Current stack is optimal for this project.** No framework changes needed.

---

## INSTALL

```bash
# Core runtime
npm i -g pnpm@11.1.2

# Per-package dependencies (after migrating)
pnpm add zod @anthropic-ai/sdk openai
pnpm add @kenkaiiii/gg-ai @kenkaiiii/gg-agent zod
pnpm add @kenkaiiii/gg-agent @kenkaiiii/gg-ai @modelcontextprotocol/sdk chalk marked marked-terminal ink react

# Dev dependencies
pnpm add -D typescript@6.0.3 vitest@4.1.6 tsup@8.5.1
pnpm add -D eslint@10.4.0 prettier@3.8.3 @typescript-eslint/parser@8.59.3
pnpm add -D @eslint/js@10.0.1
```

---

## DEPENDENCIES

| Package | Version | Purpose |
|---------|---------|---------|
| `@anthropic-ai/sdk` | ^0.96.0 | Anthropic API streaming |
| `openai` | ^6.37.0 | OpenAI API streaming |
| `zod` | ^4.4.3 | Schema validation |
| `@modelcontextprotocol/sdk` | ^1.29.0 | MCP protocol |
| `oauth4webapi` | ^3.8.6 | OAuth PKCE flows |
| `chalk` | ^5.6.2 | ANSI colors |
| `marked` | ^18.0.3 | Markdown parsing |
| `marked-terminal` | ^7.3.0 | Terminal markdown |
| `ink` | ^7.0.3 | React CLI UI |
| `react` | ^19.2.6 | React 19 for Ink |
| `zx` | ^8.8.5 | Shell scripting |
| `chokidar` | ^5.0.0 | File watching |
| `cli-table3` | ^0.6.5 | Table rendering |
| `diff` | ^7.0.0 | Diff generation |
| `fast-glob` | ^4.0.0 | File globbing |
| `ignore` | ^5.3.0 | Gitignore parsing |
| `string-width` | ^8.2.0 | Terminal width |
| `wrap-ansi` | ^9.0.0 | ANSI wrapping |
| `sharp` | ^0.34.5 | Image processing |
| `ogg-opus-decoder` | ^3.1.0 | Audio decoding |
| `@huggingface/transformers` | ^4.2.0 | ML inference |
| `cron-scheduler` | ^1.2.0 | Cron scheduling |

---

## DEV DEPENDENCIES

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^6.0.3 | Type checker |
| `vitest` | ^4.1.6 | Test runner |
| `tsup` | ^8.5.1 | Build tool |
| `eslint` | ^10.4.0 | Linter |
| `prettier` | ^3.8.3 | Formatter |
| `@eslint/js` | ^10.0.1 | ESLint base |
| `typescript-eslint` | ^8.59.3 | TS ESLint |
| `@types/node` | ^25.8.0 | Node types |
| `@types/react` | ^19.0.0 | React types |
| `@vitejs/plugin-react` | ^4.3.0 | Vite React |
| `lefthook` | ^2.1.6 | Git hooks |

---

## CONFIG FILES TO CREATE

### tsconfig.base.json

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "display": "Default",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "moduleDetection": "force",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "composite": false,
    "strict": true,
    "skipLibCheck": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "isolatedDeclarations": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}
```

### tsconfig.json (root)

```json
{
  "extends": "./tsconfig.base.json",
  "files": [],
  "references": [
    { "path": "./packages/gg-ai" },
    { "path": "./packages/gg-agent" },
    { "path": "./packages/ggcoder" },
    { "path": "./packages/gg-twenty" }
  ]
}
```

### packages/*/tsconfig.json (each package)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "noEmit": false,
    "allowImportingTsExtensions": false
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

### eslint.config.js

```js
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import perfectionist from 'eslint-plugin-perfectionist';
import unusedImports from 'eslint-plugin-unused-imports';
import vitest from 'eslint-plugin-vitest';

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 'latest',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      perfectionist,
      'unused-imports': unusedImports,
      vitest,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...unusedImports.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports',
        fixStyle: 'inline-type-imports',
      }],
      'no-unused-vars': 'off',
      'perfectionist/sort-named-imports': 'warn',
      'perfectionist/sort-imports': ['warn', {
        type: 'natural',
        partitionByComment: true,
      }],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
    },
  },
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.pnpm/**',
      '**/coverage/**',
      '**/*.d.ts',
      '**/*.d.cts',
      '**/*.d.mts',
    ],
  },
];
```

### .prettierrc

```json
{
  "$schema": "https://json.schemastore.org/prettierrc",
  "semi": true,
  "singleQuote": true,
  "quoteProps": "as-needed",
  "trailingComma": "all",
  "bracketSpacing": true,
  "bracketSameLine": false,
  "arrowParens": "always",
  "endOfLine": "lf",
  "tabWidth": 2,
  "printWidth": 100
}
```

### .prettierignore

```text
node_modules/
dist/
build/
.turbo/
pnpm-lock.yaml
coverage/
.git/
.vscode/
.idea/
*.min.js
vitest-unit-report.json
vitest-e2e-report.json
```

### .npmrc

```ini
linkWorkspacePackages=true
sharedWorkspaceLockfile=true
saveWorkspaceProtocol=rolling
enable-pre-post-scripts=true
virtual-store-dir=.pnpm/virtual-store
```

### vitest.workspace.js

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    poolOptions: {
      forks: {
        maxConcurrency: Math.max(1, (os.cpus().length ?? 1) - 1),
      },
    },
  },
  projects: [
    'packages/gg-ai',
    'packages/gg-agent',
    'packages/ggcoder',
    'packages/gg-twenty',
  ],
});
```

### .github/workflows/ci.yml

```yaml
name: CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: '22'
  PNPM_VERSION: '11'

jobs:
  check:
    name: Type Check
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}
      - run: pnpm install --frozen-lockfile
      - run: pnpm check

  lint:
    name: Lint
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm format:check

  test:
    name: Test
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}
      - run: pnpm install --frozen-lockfile
      - run: pnpm test

  build:
    name: Build
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
```

### lefthook.yml (optional migration from husky)

```yaml
git:
  staged_files: ['**/*.{ts,tsx}']

pre-commit:
  parallel: true
  commands:
    - run: pnpm check
      stage_fixed: true
    - run: pnpm lint
      stage_fixed: true
    - run: pnpm format:check
      stage_fixed: true
```

---

## PROJECT STRUCTURE

```
packages/
├── gg-ai/                    # Unified LLM streaming API
│   ├── src/
│   │   ├── index.ts          # Main barrel export
│   │   ├── types.ts          # Core types
│   │   ├── errors.ts         # Error classes
│   │   ├── stream.ts         # Main entry point
│   │   ├── providers/        # Provider implementations
│   │   │   ├── index.ts      # Provider registry
│   │   │   ├── anthropic.ts
│   │   │   ├── openai.ts
│   │   │   └── types.ts
│   │   └── utils/            # Shared utilities
│   │       ├── event-stream.ts
│   │       └── zod-to-schema.ts
│   ├── package.json
│   └── tsconfig.json
│
├── gg-agent/                 # Agent loop with tools
│   ├── src/
│   │   ├── index.ts          # Main barrel export
│   │   ├── types.ts          # AgentTool, AgentEvent, AgentOptions
│   │   ├── agent.ts          # Agent class + AgentStream
│   │   └── agent-loop.ts     # Pure async generator loop
│   ├── package.json
│   └── tsconfig.json
│
├── ggcoder/                  # CLI coding agent
│   ├── src/
│   │   ├── cli.ts            # CLI entry point
│   │   ├── config.ts         # Configuration constants
│   │   ├── session.ts        # Session management
│   │   ├── system-prompt.ts  # System prompt generation
│   │   ├── core/             # Core infrastructure
│   │   │   ├── auth.ts
│   │   │   ├── logger.ts
│   │   │   ├── settings.ts
│   │   │   ├── compaction.ts
│   │   │   ├── mcp/
│   │   │   ├── oauth/
│   │   │   └── extensions/
│   │   ├── tools/             # Agent tools (one file each)
│   │   │   ├── index.ts
│   │   │   ├── bash.ts
│   │   │   ├── read.ts
│   │   │   ├── write.ts
│   │   │   ├── edit.ts
│   │   │   ├── grep.ts
│   │   │   ├── find.ts
│   │   │   ├── ls.ts
│   │   │   ├── web-fetch.ts
│   │   │   └── subagent.ts
│   │   ├── ui/               # Terminal UI
│   │   │   ├── App.tsx
│   │   │   ├── components/   # One file per component
│   │   │   ├── hooks/        # One file per hook
│   │   │   └── theme/
│   │   ├── modes/            # Execution modes
│   │   └── utils/
│   ├── package.json
│   └── tsconfig.json
│
└── gg-twenty/                # Twenty CRM bridge
    ├── src/
    │   ├── index.ts
    │   ├── agent/            # Event handlers
    │   ├── twenty/           # MCP client
    │   └── sync/             # State sync
    ├── package.json
    └── tsconfig.json
```

---

## SETUP STEPS

1. **Install pnpm** globally: `npm i -g pnpm@11.1.2`

2. **Upgrade dependencies** to latest versions:
   ```bash
   pnpm add zod@latest @anthropic-ai/sdk@latest openai@latest
   pnpm add oauth4webapi@latest marked@latest marked-terminal@latest ink@latest react@latest
   pnpm add -D typescript@latest vitest@latest tsup@latest
   ```

3. **Migrate all packages to tsup** (replace tsc builds):
   ```bash
   pnpm add -D tsup@latest
   # Update each package.json build script to use tsup
   ```

4. **Create shared configs** at root (see Config Files section above)

5. **Update each package** to extend `../../tsconfig.base.json`

6. **Verify build order** with `pnpm check`

7. **Add Git hooks** (optional):
   ```bash
   pnpm add -D lefthook@latest
   lefthook install
   ```

---

## KEY PATTERNS

1. **Streaming**: Native `for await...of` over async iterables — no RxJS needed
2. **Type exports**: Always `import type` for type-only imports
3. **Co-located tests**: `*.test.ts` next to `*.ts` files
4. **Barrel exports**: `index.ts` per feature directory
5. **Error handling**: Discriminated unions (`Result<T, E>`) not exceptions
6. **Tool definitions**: Zod schemas for all tool parameters
7. **OAuth**: Use `oauth4webapi` not custom PKCE implementation
8. **CLI UI**: Ink/React component model maps directly to streaming state

---

## MIGRATION PRIORITIES

| Priority | Change | Impact |
|----------|--------|--------|
| HIGH | Replace custom PKCE with `oauth4webapi` | Security fix |
| HIGH | Upgrade `marked` 15 → 18 | Performance + features |
| MEDIUM | Migrate tsc builds to `tsup` | Consistent ESM/CJS builds |
| LOW | Add `lefthook` for git hooks | Faster pre-commit |

---

## SOURCES

- [Ink 7.0 React 19 compatibility](https://github.com/vadimdemedes/ink/releases)
- [Zod v4 release](https://github.com/colinhacks/zod)
- [oauth4webapi documentation](https://github.com/panva/oauth4webapi)
- [tsup documentation](https://github.com/egoist/tsup)
- [Vitest workspace config](https://vitest.dev/guide/workspace)
- [pnpm workspace docs](https://pnpm.io/workspaces)
- [TypeScript 6.0 release notes](https://devblogs.microsoft.com/typescript/)
- [Ink vs Blessed comparison benchmarks](https://github.com/vadimdemedes/ink)
- [Vercel AI SDK architecture](https://github.com/vercel/ai)
- [Anthropic SDK structure](https://github.com/anthropics/anthropic-sdk-typescript)
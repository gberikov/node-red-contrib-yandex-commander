# For Developers

This page describes the architecture and tooling used in the project.

## Stack

| Layer | Tool |
|-------|------|
| Language | TypeScript (strict) |
| Runtime | Node.js ≥ 18.5 |
| Bundler | esbuild |
| Linter/formatter | Biome |
| Tests | Vitest |
| Package manager | pnpm |

History of the JavaScript-to-TypeScript migration lives in [CHANGELOG.md](https://github.com/gberikov/node-red-contrib-yandex-commander/blob/master/CHANGELOG.md).

## TypeScript

### Why

- Static typing catches mistakes at write-time instead of at Node-RED runtime
- IDE autocomplete for the Node-RED (`@types/node-red`), WebSocket (`@types/ws`), and Node.js (`@types/node`) APIs
- Explicit interfaces for node configuration, devices, and WebSocket messages (see `src/lib/types.ts`)

### Configuration (`tsconfig.json`)

| Option | Value | Notes |
|--------|-------|-------|
| `target` | ES2022 | Node-RED 4.x runs on Node.js ≥ 18.5, full ES2022 coverage |
| `module` | NodeNext | Modern module resolution; emit format is CommonJS because `package.json` declares `"type": "commonjs"` |
| `moduleResolution` | NodeNext | Supports the `exports` field in dependency `package.json`; not deprecated in TS 6+ |
| `strict` | true | All strict-mode checks enabled |
| `noUncheckedIndexedAccess` | true | `arr[i]` is typed as `T \| undefined` — forces explicit handling of out-of-bounds |
| `isolatedModules` | true | Ensures every file compiles independently (required by esbuild) |
| `paths` | `@/*` → `src/*` | Aliases to avoid `../../../lib/types` |

The `editor.ts` files (client-side scripts) are **excluded** from `tsconfig.json` — they are bundled by esbuild separately as IIFE bundles for the browser.

### Two TypeScript worlds

The project has two distinct execution contexts:

| | Runtime (server) | Editor (client) |
|---|---|---|
| **Where it runs** | Node.js (inside Node-RED) | Browser (Node-RED editor) |
| **Module format** | CommonJS (`require`) | IIFE (global variables) |
| **Target** | ES2022 | ES2020 |
| **API** | Node-RED runtime, `ws`, `axios`, `node-dns-sd` | `RED` (Node-RED editor global), DOM |
| **Files** | `src/nodes/{name}/{name}.ts` | `src/nodes/{name}/html/editor.ts` |

## Config-node decomposition

The `yandex-commander-connect` config node used to be a god-object (~540 lines). In 0.2.0 (see CHANGELOG) it was split into pure modules:

| Module | File | Responsibility |
|--------|------|----------------|
| `DeviceRegistry` | `src/nodes/connect/registry.ts` | Single `Map<id, RuntimeDevice>` with `ready()` and `active()` projections. Replaces four parallel lists. |
| `TtsStateMachine` | `src/nodes/connect/ttsStateMachine.ts` | Post-TTS logic: `armStopListening`, `armPlayAfterTTS`, `armVolumeRestore`. `handleStateUpdate()` returns an action list on the LISTENING transition. Pure — does not touch a WebSocket. |
| `GlagolClient` | `src/nodes/connect/glagolClient.ts` | Typed EventEmitter over WebSocket. Owns the watchdog timers (connect — 10s, frame — 10s) and the ping interval (1.5s). Does not reconnect — the reconnect policy lives outside. |
| `nextBackoffMs` | `src/nodes/connect/backoff.ts` | Exponential backoff 5 → 10 → 20 → 40 → 60 sec with full-jitter ±25%. Protects against the thundering herd. |
| `wsPayload` | `src/nodes/connect/wsPayload.ts` | Builds the WS payload for every MessageType (command/voice/tts/homekit/raw/stopListening). Pure function. |
| `cloudRoute` | `src/nodes/connect/cloudRoute.ts` | "Local path or cloud" decision for TTS — accounts for the fallback checkbox, `msg.cloud`, and WebSocket state. Pure function. |
| `QuasarCloud` | `src/lib/quasarCloud.ts` | HTTP client for cloud TTS on top of the Quasar API: finds/creates the `ЯC <hex_id>` scenario and triggers it. |
| `discovery` | `src/nodes/connect/discovery.ts` | mDNS discovery + cloud `networkInfo` fallback. |
| `scheduler` | `src/nodes/connect/scheduler.ts` | Quiet-hours check from station parameters. Pure function. |

`connect.ts` itself is now an orchestrator: it wires Registry + GlagolClient + TtsStateMachine, runs the reconnect policy, and emits events to other nodes (`statusUpdate_${id}`, `message_${id}`).

## Tests

The pure modules are covered by [Vitest](https://vitest.dev/) — 88 cases, runs in ~300 ms.

```
tests/
├── stationHelper.test.ts   # status/homekit formats
├── scheduler.test.ts       # day-of-week bounds
├── backoff.test.ts         # exponential + jitter
├── ttsStateMachine.test.ts # arm/flush/reset
├── registry.test.ts        # upsert/ready/active
├── wsPayload.test.ts       # all MessageType + edge cases
├── cloudRoute.test.ts      # local-vs-cloud TTS routing
└── quasarCloud.test.ts     # Quasar API: TTS scenarios
```

Config — `vitest.config.ts` at the root. The `@/*` alias is configured via `resolve.alias` (Vite reads tsconfig paths automatically).

Commands:

```bash
pnpm test         # single run
pnpm test:watch   # watch mode
```

When adding a new pure function/class, add a corresponding test in `tests/`. For `GlagolClient` and `connect.ts`, an integration test with a mock WS server is useful (see the TODO notes).

## esbuild

### How the build works (`esbuild.mjs`)

#### 1. Runtime build

Every `.ts` file under `src/` (except `editor.ts`) is transpiled to CommonJS:

```
src/nodes/connect/connect.ts  →  build/nodes/connect/connect.js
src/lib/api.ts                →  build/lib/api.js
```

Parameters: `platform: 'node'`, `format: 'cjs'`, `target: 'es2022'`, `conditions: ['node']`. Sourcemap is `inline` in dev, disabled in `--prod`.

#### 2. Editor build (per node)

Each `editor.ts` is bundled as an **IIFE** (Immediately Invoked Function Expression), wrapped in a `<script>` tag, and concatenated with HTML templates:

```
src/nodes/connect/html/editor.ts   ─┐
src/nodes/connect/html/editor.html  ─┤→  build/nodes/connect/connect.html
                                     │   <script>..bundled JS..</script>
                                     │   ..HTML templates..
```

Target: `ES2020` — supported by every modern browser. Minification only in `--prod`.

#### 3. Static file copy

Icons and locale files (`locales/`) are copied into `build/` unchanged.

### The `@/` alias

In source you can write:
```typescript
import { QuasarApi } from '@/lib/api';
```
instead of:
```typescript
import { QuasarApi } from '../../../lib/api';
```

esbuild reads `paths` from `tsconfig.json` natively (option `tsconfig: './tsconfig.json'`). No custom alias plugin is needed.

### Commands

```bash
pnpm build           # dev build with inline sourcemap
pnpm build:prod      # production: no sourcemap, minified editor
pnpm build:watch     # esbuild watch — rebuilds runtime on .ts change
pnpm typecheck       # tsc --noEmit
```

## Biome

[Biome](https://biomejs.dev/) replaces ESLint + Prettier. Config — `biome.json`:

**Formatting:**
- Indent: 2 spaces
- Single quotes, semicolons, trailing commas `all`
- Line width: 120
- Line ending: `lf` (cross-platform friendly)

**Linter:**
- Recommended rules enabled
- `noUnusedVariables` — `warn` (does not block development)
- `noExplicitAny` — `warn` (gradual cleanup of legacy `any`)
- `noUnsafeDeclarationMerging` — `off` (for the typed EventEmitter in `GlagolClient`)

**Scope:** `src/**/*.ts`, `src/**/*.js`, `tests/**/*.ts`.

### Commands

```bash
pnpm lint        # check without writing
pnpm lint:fix    # auto-fix formatting and safe rules
pnpm format      # format only
```

## Project structure

```
├── esbuild.mjs                  # Build script
├── biome.json                   # Biome config
├── tsconfig.json                # TypeScript config (IDE + type-check)
├── vitest.config.ts             # Vitest config
├── package.json                 # scripts, dependencies, engines, node-red.version
├── src/
│   ├── lib/
│   │   ├── api.ts               # QuasarApi — HTTP calls to Yandex Quasar API
│   │   ├── api/device.ts        # Device types
│   │   ├── auth.ts              # YandexAuth — QR OAuth via passport
│   │   ├── quasarCloud.ts       # Cloud TTS via Quasar scenarios
│   │   ├── stationHelper.ts     # Payload formatting (status/homekit)
│   │   └── types.ts             # Shared interfaces
│   ├── types/
│   │   └── node-dns-sd.d.ts     # Ambient types for node-dns-sd (no upstream typings)
│   └── nodes/
│       ├── connect/             # Config node
│       │   ├── connect.ts       # Lifecycle orchestrator
│       │   ├── registry.ts      # DeviceRegistry
│       │   ├── ttsStateMachine.ts
│       │   ├── glagolClient.ts  # Typed WS client
│       │   ├── backoff.ts       # Exponential backoff + jitter
│       │   ├── wsPayload.ts     # WS payload builder
│       │   ├── cloudRoute.ts    # Local/cloud routing for TTS
│       │   ├── discovery.ts     # mDNS + cloud fallback
│       │   ├── scheduler.ts     # Quiet-hours check
│       │   ├── types.ts         # Re-exported types
│       │   ├── html/
│       │   │   ├── editor.ts
│       │   │   └── editor.html
│       │   └── locales/         # i18n (9 locales)
│       ├── station/             # Same structure (+ locales/)
│       ├── in/
│       ├── get/
│       └── out/
├── tests/                       # Vitest cases
└── build/                       # Build output (gitignored)
```

## Dependencies

### Runtime
| Package | Purpose |
|---------|---------|
| `axios` | HTTP calls to the Yandex Quasar API |
| `ws` | WebSocket connection to stations |
| `node-dns-sd` | mDNS/DNS-SD for automatic station discovery |

### Dev
| Package | Purpose |
|---------|---------|
| `typescript` | TypeScript compiler (type-check) |
| `esbuild` | Transpilation and bundling |
| `@biomejs/biome` | Lint + format |
| `vitest` | Unit tests |
| `node-red-node-test-helper` | Integration tests for Node-RED nodes |
| `@types/node-red`, `@types/ws`, `@types/node` | Type definitions |
| `node-red` | Peer dependency for tests |

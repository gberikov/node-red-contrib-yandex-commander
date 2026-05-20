# Building from source

The project is written in TypeScript and uses esbuild as the bundler. Package manager — pnpm. Minimum Node.js version — 18.5.

## Install dependencies

```bash
pnpm install
```

## Build

```bash
pnpm build           # dev build with inline sourcemap
pnpm build:prod      # production: no sourcemap, minified editor
pnpm build:watch     # auto-rebuild runtime on file changes
```

## Quality checks

```bash
pnpm typecheck       # tsc --noEmit
pnpm lint            # biome check
pnpm lint:fix        # biome check --write (format + safe fixes)
pnpm format          # format only
pnpm test            # vitest run (59 unit tests)
pnpm test:watch      # vitest watch
```

For a detailed description of the architecture and tooling, see [For Developers](For-Developers).

## Project structure (short)

```
src/
├── lib/
│   ├── api.ts            # QuasarApi
│   ├── api/device.ts     # Device types
│   ├── auth.ts           # QR OAuth flow
│   ├── stationHelper.ts  # Payload formatting
│   └── types.ts          # Shared types
├── types/
│   └── node-dns-sd.d.ts  # Ambient types
└── nodes/
    ├── connect/          # Config node (8 modules)
    ├── station/
    ├── in/
    ├── get/
    └── out/
tests/                    # Vitest cases
```

Each node contains:
- `{name}.ts` — server-side logic (runtime)
- `html/editor.ts` — client-side script (editor)
- `html/editor.html` — HTML template for the Node-RED editor

## Build output

```
build/nodes/
├── connect/connect.js, connect.html
├── station/station.js, station.html
├── in/in.js, in.html
├── get/get.js, get.html
├── out/out.js, out.html, locales/
└── icons/
```

Before publishing to npm, run `pnpm build:prod`. The `files` field in `package.json` ensures the published tarball contains only `build/`, `README.md`, `LICENSE`, and `CHANGELOG.md`.

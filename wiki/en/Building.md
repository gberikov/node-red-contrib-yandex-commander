# Building from source

The project is written in TypeScript and uses esbuild for bundling. Package manager — pnpm.

## Install dependencies

```bash
pnpm install
```

## Build

```bash
pnpm build
```

## Development mode

Auto-rebuild on file changes:

```bash
pnpm build:watch
```

## Linting & formatting

The project uses [Biome](https://biomejs.dev/) for linting and formatting.

```bash
# Check
pnpm lint

# Check with auto-fix
pnpm lint:fix

# Format
pnpm format
```

## Project structure

```
src/
├── lib/
│   ├── api.ts            # QuasarApi — device discovery and tokens
│   ├── api/device.ts     # Device definitions
│   ├── stationHelper.ts  # Payload formatting (status/homekit)
│   └── types.ts          # Shared types
├── nodes/
│   ├── connect/          # Config node (OAuth, mDNS, WebSocket)
│   ├── station/          # Station node
│   ├── in/               # IN node
│   ├── get/              # GET node
│   └── out/              # OUT node
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

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-05-20

Large architectural refactor. External `msg.payload` contracts for the
`station`, `get`, `in`, and `out` nodes are unchanged; internal structures
have been reworked and are now covered by unit tests.

### Added

- `engines.node: ">=18.5"` and `node-red.version: ">=4.0.0"` in `package.json`.
- Unit tests (vitest, 59 cases) for the pure modules: `stationHelper`,
  `wsPayload`, `scheduler`, `ttsStateMachine`, `backoff`, `registry`.
- `DeviceRegistry` (`src/nodes/connect/registry.ts`) — single source of
  truth for the device list.
- `TtsStateMachine` (`src/nodes/connect/ttsStateMachine.ts`) — post-TTS
  logic extracted from the WebSocket frame handler.
- `GlagolClient` (`src/nodes/connect/glagolClient.ts`) — typed EventEmitter
  over WebSocket, encapsulating watchdog, ping, and cleanup.
- `nextBackoffMs` (`src/nodes/connect/backoff.ts`) — exponential backoff
  with full-jitter for reconnects.
- `files` whitelist in `package.json` — only `build/`, README, LICENSE,
  and CHANGELOG are published to npm.
- Scripts `test`, `test:watch`, `typecheck`, `build:prod`.

### Changed

- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`,
  `isolatedModules: true`. All strict-mode errors have been resolved.
- The `connect` config node is decomposed: four parallel device lists
  (`deviceList`, `readyList`, `activeStationList`, `registrationBuffer`)
  are replaced with `DeviceRegistry` plus a closure-local buffer.
- Reconnect: the fixed 60-second delay is replaced with exponential
  backoff (5 → 10 → 20 → 40 → 60 seconds) with ±25% jitter.
- The connect watchdog has been tightened from 60 to 10 seconds.
- esbuild: editor target `es2015 → es2020`, runtime `es2021 → es2022`;
  the custom alias plugin has been removed (esbuild reads `paths` from
  `tsconfig.json` directly).
- Biome: `lineEnding: lf` (cross-platform friendly), `trailingCommas: all`
  (modern default), `lineWidth: 120`.
- HTTP routes `/yandex-commander/*` were already protected by
  `RED.auth.needsPermission('yandex-commander-connect.read')` and are
  left unchanged.

### Removed

- Fields `deviceList`, `readyList`, `activeStationList`,
  `registrationBuffer`, `interval` from the public `ConnectNode`
  interface (they are used only inside the config node).
- Fields `ws`, `watchDog`, `watchDogConn`, `timer`, `pingInterval`,
  `waitForListening`, `playAfterTTS`, `waitForIdle`, `savedVolumeLevel`,
  `schedulerFlag` from `RuntimeDevice` — they moved into `GlagolClient`
  and `TtsStateMachine`.

### Fixed

- `noUncheckedIndexedAccess` surfaced potential `undefined` accesses in
  `auth.ts` (regex matches, `split('=')`) and `discovery.ts` (mDNS
  SRV record). Explicit guards have been added.
- Added an ambient `.d.ts` for `node-dns-sd` — fixes `TS7016`.

## [0.1.0] — initial

- Fork of `node-red-contrib-yandex-station-management`, migrated to
  TypeScript.
- Local control via the Glagol WebSocket protocol.
- QR-code authorization via passport.yandex.ru.
- mDNS discovery plus cloud `networkInfo` fallback.

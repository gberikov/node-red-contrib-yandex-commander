# Cloud TTS fallback — design

**Date:** 2026-05-20
**Branch:** `feature/cloud-quasar`
**Target version:** 0.3.0 (Added entry alongside `playMusic`)

## Problem

TTS in `node-red-contrib-yandex-commander` works only when Node-RED is on
the same LAN as the Yandex Station — speech goes over the local Glagol
WebSocket. When the station is unreachable locally (different network,
mDNS blocked, manual disconnect), TTS fails with `Device offline`.

`AlexxIT/YandexStation` solves this by creating an empty cloud scenario
per station, then overwriting and triggering the scenario each time TTS
must be spoken via the Yandex Quasar cloud. We adopt the same approach
in parallel to the local path — cloud is only used when local is
unavailable, or when the user explicitly forces it.

## Goals

- Cloud TTS works when local WebSocket is closed.
- Opt-in by default. Existing flows must behave exactly as before.
- Per-message override via `msg.cloud`.
- No changes to `msg.payload` contract.
- No additional dependencies; no re-authentication for existing users.
- Compatible with AlexxIT-created scenarios on the same account (we
  adopt them by name rather than duplicating).

## Non-goals

- Cloud equivalents for `command`, `voice`, `homekit`, `raw`,
  `stopListening`, `playMusic` — TTS only.
- SSML support over the cloud path (Yandex's scenario TTS step accepts
  plain text only).
- Persistent local cache of scenario ids — adopted lazily from Yandex
  per Node-RED process.
- Multi-user / per-station OAuth credentials.

## Architecture

A new `QuasarCloud` class lives alongside `QuasarApi`. It targets a
different base URL (`https://iot.quasar.yandex.ru`) and a different
auth model (OAuth bearer **plus** a CSRF token fetched from
`/csrf_token`). The connect node holds a single lazy-initialised
instance built from the same OAuth token already used for the local
device list.

Routing decision moves into a pure helper, `decideCloudRoute`. The
connect node's `sendMessage` becomes async and consults that helper
on every call:

```
type !== 'tts'                   → local           (unchanged)
msg.cloud === true               → cloud           (force)
local WebSocket open             → local
msg.cloud === false              → offline         (explicit opt-out)
OUT-node "Cloud TTS fallback" on → cloud
else                             → offline
```

```
   OUT node                      connect node                  QuasarCloud
 ────────────                  ────────────────              ───────────────
                                                              CSRF cache
   tts input ──────►   await sendMessage(...)
                       │
                       ├─ decideCloudRoute(...)
                       │
                       ├─ local? ────────────────►  buildWsPayload + glagol.send
                       │
                       └─ cloud? ────────────────►  sendCloudTts(deviceId, text)
                                                       │
                                                       ├─ stripSsml + length check
                                                       ├─ getOrCreateScenarioId
                                                       ├─ PUT  /scenarios/<id>
                                                       └─ POST /scenarios/<id>/actions
```

### Why `decideCloudRoute` is its own module

Pure, table-driven, side-effect-free. Tested in isolation — no axios,
no mocks. Keeps `connect.ts` (already large) from accumulating more
branchy in-line logic.

### Why `QuasarCloud` is separate from `QuasarApi`

Different base URL, different headers (CSRF), different lifecycle
(scenario cache). Mixing the two would muddle concerns and double the
mock surface for tests.

### Lazy init

`QuasarCloud` is created only on first cloud-TTS request. Users who
never opt in pay zero startup cost. CSRF is fetched lazily on first
mutation, refreshed on 401/403 with exactly one retry.

## `QuasarCloud` API

```ts
export class QuasarCloud {
  constructor(token: string, debug?: (msg: string) => void);

  /** PUT scenario with TTS step, then POST actions to trigger. */
  sendCloudTts(deviceId: string, text: string): Promise<void>;

  /** Drops the scenarioId cache for one device (mostly for tests). */
  invalidateScenario(deviceId: string): void;
}
```

Internals (documented as the contract surface for tests):

- `fetchCsrf()` — GET `https://iot.quasar.yandex.ru/csrf_token`.
- `listScenarios()` — GET `/m/v3/user/scenarios`.
- `createScenario(deviceId)` — POST `/m/v3/user/scenarios`. Body uses
  `encodeDeviceId(deviceId)` as the scenario `name`, a single stub TTS
  step with `value: "ping"`.
- `updateScenarioTts(scenarioId, deviceId, text)` — PUT
  `/m/v3/user/scenarios/<scenarioId>`. Body shape matches AlexxIT's
  `scenario_speaker_tts`:
  ```json
  {
    "name": "ЯC <encoded>",
    "icon": "home",
    "triggers": [],
    "steps": [{
      "type": "scenarios.steps.actions.v2",
      "parameters": {
        "items": [{
          "id": "<deviceId>",
          "type": "devices.types.smart_speaker",
          "value": { "instance": "phrase_action", "value": "<text>" }
        }]
      }
    }]
  }
  ```
- `runScenario(scenarioId)` — POST `/m/v3/user/scenarios/<id>/actions`.
- `getOrCreateScenarioId(deviceId)` — cache → list → adopt-or-create.
- `encodeDeviceId(deviceId)` — Cyrillic masquerade, mirrors AlexxIT.

### `encodeDeviceId` mapping

```
hex:    0 1 2 3 4 5 6 7 8 9 a b c d e f
cyr:    о а б в г д е ж з и й к л м н п
prefix: "ЯC "
```

E.g. `device_id = "abc123"` → `"ЯC йклабв"` (hex digit-by-digit).
Locked by unit tests so we don't desync from AlexxIT-created scenarios.

### `stripSsml` rules

- Remove all `<speaker ...>` opening tags (voice, effect, whisper,
  audio).
- Remove `sil <[NNN]>` pause markers.
- Remove `+` stress marks (preserves the syllable).
- Collapse repeated whitespace.
- Truncate to 100 chars, logging via the debug callback.
- Throw `'Cloud TTS: text too short (min 2 chars)'` if the post-strip
  length is less than 2.

### Error model

- All HTTP errors throw `Error('Cloud TTS: <reason>')`.
- `connect.sendMessage` catches once and routes to `node.error`.
- CSRF retry happens exactly once per call; further failures propagate.

## `connect.sendMessage` refactor

Signature changes from synchronous to `Promise<string | undefined>`.
Return values:

| Value             | Meaning                                          |
|-------------------|--------------------------------------------------|
| `'ok'`            | Local path completed (payload sent on WebSocket) |
| `'ok-cloud'`      | Cloud path completed (scenario triggered)        |
| `'Device offline'`| No path available — neither local nor cloud      |
| `undefined`       | Internal error (logged via `node.debug`)         |

Internal callers (`dispatchTtsAction`, `applyScheduler`) are local-only
by construction — they're triggered by WebSocket frames, so the local
client is always open at the time of the call. They become
`void sendMessage.call(...)` (fire-and-forget). They never trigger
cloud because `cloud` and `cloudFallback` are undefined and the local
client is open.

`OutMessage` gains two optional fields:

```ts
interface OutMessage {
  // ...existing...
  /** User per-message override. */
  cloud?: boolean;
  /** OUT-node "Cloud TTS fallback" checkbox value. Not on msg. */
  cloudFallback?: boolean;
}
```

These are read by `decideCloudRoute` and never serialised onto the
WebSocket payload.

## OUT-node changes

- New `cloudFallback` field on `OutNodeConfig` (boolean, defaults
  `false`).
- Editor: checkbox inside `.command_options-tts`, locale strings
  `tts.cloudFallback` and `tts.cloudFallbackHint`.
- Runtime: read `this.cloudFallback`; in the TTS branch, set
  `data.cloudFallback = true` when set, and `data.cloud = !!input.cloud`
  when `'cloud' in input`. Handler becomes `async`, wrapping the
  `sendMessage` await in `try/catch` → `this.error()`.

Other modes (`command`, `voice`, `homekit`, `raw`, `stopListening`,
`playMusic`) are untouched — `decideCloudRoute` short-circuits to
local for any non-TTS type.

## Tests

`tests/quasarCloud.test.ts` — `vi.mock('axios')`. Covers:

1. `encodeDeviceId` — 3-4 fixed device-ids → expected encodings.
2. `stripSsml` — 5-6 cases (voice tag, audio tag, sil marker, stress
   mark, truncation, empty input).
3. `sendCloudTts` happy path (uncached) — GET csrf, GET list, POST
   create, PUT scenario, POST actions; assert URLs, methods, headers,
   body.
4. `sendCloudTts` cached scenario — second call skips list+create.
5. `sendCloudTts` adopts existing scenario — list returns matching
   name; skip create.
6. `sendCloudTts` CSRF retry — first PUT 403 → refetch csrf → retry
   succeeds. Exactly one retry, no loop.
7. `sendCloudTts` length validation — `< 2` throws; `> 100` truncates
   and proceeds.

`tests/cloudRoute.test.ts` — pure decision table. Six cases covering
every branch.

Existing 59 tests untouched. Total ≈ 74.

## Acceptance

- `pnpm test` — all green.
- `pnpm lint` — clean.
- `pnpm typecheck` — clean.
- `pnpm build` — produces `build/nodes/connect/connect.js` (with
  `quasarCloud` bundled via esbuild's import graph) and unchanged
  output for other nodes.
- `msg.payload` contract unchanged. Only `msg.cloud` is new.
- Local TTS path identical to current behaviour.

## File-by-file change list

**New**

- `src/lib/quasarCloud.ts`
- `src/nodes/connect/cloudRoute.ts`
- `tests/quasarCloud.test.ts`
- `tests/cloudRoute.test.ts`
- `wiki/ru/Cloud-TTS.md`

**Modified**

- `src/lib/types.ts` — `OutMessage` (+`cloud?`, `+cloudFallback?`),
  `OutNodeConfig` (+`cloudFallback`), `ConnectNode.sendMessage` return
  type → `Promise<string | undefined>`.
- `src/nodes/connect/connect.ts` — async `sendMessage`, lazy
  `QuasarCloud` instance, `decideCloudRoute` integration, `void`
  wrappers on internal callers, cleanup in `onClose`.
- `src/nodes/out/out.ts` — read `cloudFallback`, thread onto
  `OutMessage`, `async` handler with `try/catch`.
- `src/nodes/out/html/editor.ts` — `cloudFallback: { value: false }`.
- `src/nodes/out/html/editor.html` — checkbox + label.
- `src/nodes/out/locales/{en-US,ru,de,fr,ja,ko,pt-BR,zh-CN,zh-TW}/out.json`
  — `tts.cloudFallback`, `tts.cloudFallbackHint`.
- `wiki/ru/OUT-Node.md` — paragraph + table row.
- `CHANGELOG.md` — append `Added` bullet under existing `[0.3.0]`.

**Not touched**

- `src/lib/auth.ts` — OAuth-only auth model.
- `src/lib/api.ts` — `QuasarApi` stays focused on `/glagol`.
- `src/nodes/connect/{glagolClient,ttsStateMachine,wsPayload,
  scheduler,backoff,registry,discovery}.ts` — local path untouched.
- `src/nodes/{station,get,in}/*` — not callers of `sendMessage`.
- `esbuild.mjs` — bundle is import-driven; new file picked up
  automatically via the `connect.ts` import chain. To be verified
  during impl.
- `package.json` — axios is already a runtime dep; no new deps.

## Open implementation questions (verify during impl)

- Confirm `esbuild.mjs` bundles `src/lib/quasarCloud.ts` into the
  connect runtime output (expected: yes, since it's import-driven).
- Confirm the exact JSON shape Quasar requires on PUT
  `/m/v3/user/scenarios/<id>` against AlexxIT's current
  `scenario_speaker_tts`. Locked by reading the source during impl.
- Confirm 100-char truncation matches Yandex's actual scenario phrase
  limit. AlexxIT uses 100; we follow.

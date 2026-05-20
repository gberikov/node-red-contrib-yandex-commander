# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-05-20

Большой архитектурный рефактор. Внешние контракты `msg.payload` для нод
`station`, `get`, `in`, `out` не изменились; внутренние структуры переработаны
и теперь покрыты юнит-тестами.

### Added

- `engines.node: ">=18.5"` и `node-red.version: ">=4.0.0"` в `package.json`.
- Юнит-тесты (vitest, 59 кейсов) для чистых модулей: `stationHelper`,
  `wsPayload`, `scheduler`, `ttsStateMachine`, `backoff`, `registry`.
- `DeviceRegistry` (`src/nodes/connect/registry.ts`) — единый источник
  правды по списку устройств.
- `TtsStateMachine` (`src/nodes/connect/ttsStateMachine.ts`) — вынесена
  post-TTS логика из обработчика WS-сообщений.
- `GlagolClient` (`src/nodes/connect/glagolClient.ts`) — типизированный
  EventEmitter поверх WebSocket, инкапсулирует watchdog/ping/cleanup.
- `nextBackoffMs` (`src/nodes/connect/backoff.ts`) — экспоненциальный
  backoff с full-jitter для reconnect.
- `files` whitelist в `package.json` — публикуется только `build/`, README,
  LICENSE, CHANGELOG.
- Scripts `test`, `test:watch`, `typecheck`, `build:prod`.

### Changed

- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`,
  `isolatedModules: true`. Все ошибки strict устранены.
- Конфиг-нода `connect` декомпозирована: четыре параллельных списка
  устройств (`deviceList`, `readyList`, `activeStationList`,
  `registrationBuffer`) заменены на `DeviceRegistry` + closure-локальный
  буфер.
- Reconnect: фиксированные 60 секунд заменены на экспоненциальный backoff
  5 → 10 → 20 → 40 → 60 сек с ±25% jitter.
- Watchdog на установление соединения уменьшен с 60 до 10 секунд.
- esbuild: editor target `es2015 → es2020`, runtime `es2021 → es2022`;
  убран самопальный alias-plugin (esbuild читает `paths` из tsconfig
  напрямую).
- Biome: `lineEnding: lf` (кроссплатформенно), `trailingCommas: all`
  (современный default), `lineWidth: 120`.
- HTTP-маршруты `/yandex-commander/*` уже были защищены через
  `RED.auth.needsPermission('yandex-commander-connect.read')` — оставлено
  без изменений.

### Removed

- Поля `deviceList`, `readyList`, `activeStationList`,
  `registrationBuffer`, `interval` из публичного интерфейса `ConnectNode`
  (используются только внутри config-ноды).
- Поля `ws`, `watchDog`, `watchDogConn`, `timer`, `pingInterval`,
  `waitForListening`, `playAfterTTS`, `waitForIdle`, `savedVolumeLevel`,
  `schedulerFlag` из `RuntimeDevice` — переехали в `GlagolClient` и
  `TtsStateMachine`.

### Fixed

- `noUncheckedIndexedAccess` поднял потенциальные `undefined`-обращения
  в `auth.ts` (regex matches, `split('=')`) и `discovery.ts`
  (mDNS SRV-record). Добавлены явные проверки.
- Добавлен ambient `.d.ts` для `node-dns-sd` — устраняет `TS7016`.

## [0.1.0] — initial

- Форк `node-red-contrib-yandex-station-management`, миграция на TypeScript.
- Локальное управление через Glagol WebSocket-протокол.
- QR-авторизация через passport.yandex.ru.
- mDNS discovery + cloud networkInfo fallback.

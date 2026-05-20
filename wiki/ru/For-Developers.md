# Для разработчиков

Эта страница описывает архитектуру и инструменты, используемые в проекте.

## Стек

| Слой | Инструмент |
|------|-----------|
| Язык | TypeScript (strict) |
| Рантайм | Node.js ≥ 18.5 |
| Сборка | esbuild |
| Линтер/форматтер | Biome |
| Тесты | Vitest |
| Пакетный менеджер | pnpm |

История миграции с JavaScript на TypeScript описана в [CHANGELOG.md](https://github.com/gberikov/node-red-contrib-yandex-commander/blob/master/CHANGELOG.md).

## TypeScript

### Зачем

- Статическая типизация ловит ошибки на этапе написания кода
- Автодополнение для API Node-RED (`@types/node-red`), WebSocket (`@types/ws`), Node.js (`@types/node`)
- Явные интерфейсы для конфигурации нод, устройств и WebSocket-сообщений (см. `src/lib/types.ts`)

### Конфигурация (`tsconfig.json`)

| Параметр | Значение | Пояснение |
|----------|----------|-----------|
| `target` | ES2022 | Node-RED 4.x работает на Node.js ≥ 18.5, ES2022 покрывается полностью |
| `module` | NodeNext | Современная резолюция модулей; emit в CommonJS определяется полем `"type": "commonjs"` в `package.json` |
| `moduleResolution` | NodeNext | Поддержка поля `exports` в package.json зависимостей; не deprecated в TS 6+ |
| `strict` | true | Все strict-проверки включены |
| `noUncheckedIndexedAccess` | true | `arr[i]` имеет тип `T \| undefined` — заставляет явно обрабатывать out-of-bounds |
| `isolatedModules` | true | Гарантирует, что каждый файл компилируется независимо (требование esbuild) |
| `paths` | `@/*` → `src/*` | Алиасы, чтобы не писать `../../../lib/types` |

Файлы `editor.ts` (клиентские скрипты) **исключены** из `tsconfig.json` — они собираются esbuild отдельно как IIFE-бандлы для браузера.

### Два мира TypeScript в проекте

В проекте сосуществуют два разных контекста исполнения:

| | Runtime (серверная часть) | Editor (клиентская часть) |
|---|---|---|
| **Где работает** | Node.js (внутри Node-RED) | Браузер (редактор Node-RED) |
| **Формат модуля** | CommonJS (`require`) | IIFE (глобальные переменные) |
| **Target** | ES2022 | ES2020 |
| **API** | Node-RED runtime, `ws`, `axios`, `node-dns-sd` | `RED` (глобальный объект Node-RED editor), DOM |
| **Файлы** | `src/nodes/{name}/{name}.ts` | `src/nodes/{name}/html/editor.ts` |

## Декомпозиция config-ноды

Config-нода `yandex-commander-connect` исторически была god-object на ~540 строк. В рамках 0.2.0 (см. CHANGELOG) она разделена на чистые модули:

| Модуль | Файл | Ответственность |
|--------|------|-----------------|
| `DeviceRegistry` | `src/nodes/connect/registry.ts` | Единый `Map<id, RuntimeDevice>` с проекциями `ready()` и `active()`. Заменяет четыре параллельных списка. |
| `TtsStateMachine` | `src/nodes/connect/ttsStateMachine.ts` | Пост-TTS логика: `armStopListening`, `armPlayAfterTTS`, `armVolumeRestore`. `handleStateUpdate()` возвращает массив действий при переходе в LISTENING. Чистая функция — без WebSocket. |
| `GlagolClient` | `src/nodes/connect/glagolClient.ts` | Типизированный EventEmitter над WebSocket. Владеет watchdog-таймерами (connect — 10s, frame — 10s) и ping-интервалом (1.5s). Сам не реконнектится — политика reconnect снаружи. |
| `nextBackoffMs` | `src/nodes/connect/backoff.ts` | Экспоненциальный backoff 5 → 10 → 20 → 40 → 60 сек с full-jitter ±25%. Защищает от thundering herd. |
| `wsPayload` | `src/nodes/connect/wsPayload.ts` | Конструктор полезной нагрузки для всех MessageType (command/voice/tts/homekit/raw/stopListening). Чистая функция. |
| `cloudRoute` | `src/nodes/connect/cloudRoute.ts` | Решение «местный путь или облако» для TTS: учитывает чекбокс fallback, `msg.cloud`, состояние WebSocket. Чистая функция. |
| `QuasarCloud` | `src/lib/quasarCloud.ts` | HTTP-клиент облачного TTS поверх Quasar API: поиск/создание сценария `ЯC <hex_id>` и его запуск. |
| `discovery` | `src/nodes/connect/discovery.ts` | mDNS-обнаружение + cloud `networkInfo` fallback. |
| `scheduler` | `src/nodes/connect/scheduler.ts` | Проверка «тихих часов» из настроек станции. Чистая функция. |

Сама `connect.ts` теперь — оркестратор: связывает Registry + GlagolClient + TtsStateMachine, прокручивает reconnect-политику и эмитит события для других нод (`statusUpdate_${id}`, `message_${id}`).

## Тесты

Чистые модули покрыты юнит-тестами через [Vitest](https://vitest.dev/) — 88 кейсов, прогон ~300 мс.

```
tests/
├── stationHelper.test.ts   # status/homekit форматы
├── scheduler.test.ts       # границы дня недели
├── backoff.test.ts         # экспоненциал + jitter
├── ttsStateMachine.test.ts # arm/flush/reset
├── registry.test.ts        # upsert/ready/active
├── wsPayload.test.ts       # все MessageType + edge-cases
├── cloudRoute.test.ts      # выбор local/cloud для TTS
└── quasarCloud.test.ts     # Quasar API: сценарии TTS
```

Конфиг — `vitest.config.ts` в корне. Алиас `@/*` настроен через `resolve.alias` (Vite reads tsconfig paths automatically).

Команды:

```bash
pnpm test         # один прогон
pnpm test:watch   # watch-режим
```

При добавлении новой чистой функции/класса — обязательно добавляй тест в `tests/`. Для GlagolClient/connect.ts полезен integration-тест с mock WS-сервером (см. NOTE-ы в TODO).

## esbuild

### Как работает сборка (`esbuild.mjs`)

#### 1. Runtime build

Все `.ts` файлы из `src/` (кроме `editor.ts`) транспилируются в CommonJS:

```
src/nodes/connect/connect.ts  →  build/nodes/connect/connect.js
src/lib/api.ts                →  build/lib/api.js
```

Параметры: `platform: 'node'`, `format: 'cjs'`, `target: 'es2022'`, `conditions: ['node']`. Sourcemap в dev — `inline`, в `--prod` — отключён.

#### 2. Editor build (для каждой ноды)

Каждый `editor.ts` бандлится в **IIFE** (Immediately Invoked Function Expression), затем оборачивается в `<script>`-тег и конкатенируется с HTML-шаблонами:

```
src/nodes/connect/html/editor.ts   ─┐
src/nodes/connect/html/editor.html  ─┤→  build/nodes/connect/connect.html
                                     │   <script>..bundled JS..</script>
                                     │   ..HTML templates..
```

Target: `ES2020` — поддерживают все актуальные браузеры. Минификация — только в `--prod`.

#### 3. Копирование статических файлов

Иконки и файлы локализации (`locales/`) копируются в `build/` без изменений.

### Алиас `@/`

В исходном коде можно писать:
```typescript
import { QuasarApi } from '@/lib/api';
```
вместо:
```typescript
import { QuasarApi } from '../../../lib/api';
```

esbuild читает `paths` из `tsconfig.json` нативно (опция `tsconfig: './tsconfig.json'`). Никакого самопального alias-plugin не требуется.

### Команды

```bash
pnpm build           # dev-сборка с inline sourcemap
pnpm build:prod      # production: без sourcemap, с минификацией editor
pnpm build:watch     # esbuild watch — пересборка runtime при изменении .ts
pnpm typecheck       # tsc --noEmit
```

## Biome

[Biome](https://biomejs.dev/) заменяет ESLint + Prettier. Конфигурация — `biome.json`:

**Форматирование:**
- Отступы: пробелы, 2 символа
- Одинарные кавычки, точки с запятой, trailing commas `all`
- Line width: 120
- Line ending: `lf` (кроссплатформенно)

**Линтер:**
- Включены рекомендуемые правила
- `noUnusedVariables` — `warn` (не блокирует разработку)
- `noExplicitAny` — `warn` (постепенная очистка унаследованного `any`)
- `noUnsafeDeclarationMerging` — `off` (для типизированного EventEmitter в `GlagolClient`)

**Область действия:** `src/**/*.ts`, `src/**/*.js`, `tests/**/*.ts`.

### Команды

```bash
pnpm lint        # проверка без правок
pnpm lint:fix    # auto-fix форматирования и safe-rules
pnpm format      # только форматирование
```

## Структура проекта

```
├── esbuild.mjs                  # Скрипт сборки
├── biome.json                   # Конфигурация Biome
├── tsconfig.json                # Конфигурация TypeScript (IDE + type-check)
├── vitest.config.ts             # Конфигурация Vitest
├── package.json                 # Скрипты, зависимости, engines, node-red.version
├── src/
│   ├── lib/
│   │   ├── api.ts               # QuasarApi — HTTP-запросы к Yandex Quasar API
│   │   ├── api/device.ts        # Типы устройств
│   │   ├── auth.ts              # YandexAuth — QR-флоу OAuth через passport
│   │   ├── quasarCloud.ts       # Облачный TTS через Quasar-сценарии
│   │   ├── stationHelper.ts     # Форматирование payload (status/homekit)
│   │   └── types.ts             # Общие интерфейсы
│   ├── types/
│   │   └── node-dns-sd.d.ts     # Ambient типы для node-dns-sd (нет официальных)
│   └── nodes/
│       ├── connect/             # Config-нода
│       │   ├── connect.ts       # Оркестратор lifecycle
│       │   ├── registry.ts      # DeviceRegistry
│       │   ├── ttsStateMachine.ts
│       │   ├── glagolClient.ts  # Типизированный WS-клиент
│       │   ├── backoff.ts       # Экспоненциальный backoff + jitter
│       │   ├── wsPayload.ts     # Конструктор WS-команд
│       │   ├── cloudRoute.ts    # Решение local/cloud для TTS
│       │   ├── discovery.ts     # mDNS + cloud fallback
│       │   ├── scheduler.ts     # Проверка «тихих часов»
│       │   ├── types.ts         # Re-export типов
│       │   ├── html/
│       │   │   ├── editor.ts
│       │   │   └── editor.html
│       │   └── locales/         # i18n (9 локалей)
│       ├── station/             # Аналогичная структура (+ locales/)
│       ├── in/
│       ├── get/
│       └── out/
├── tests/                       # Vitest-кейсы
└── build/                       # Результат сборки (gitignored)
```

## Зависимости

### Runtime
| Пакет | Назначение |
|-------|------------|
| `axios` | HTTP-запросы к Yandex Quasar API |
| `ws` | WebSocket-подключение к станциям |
| `node-dns-sd` | mDNS/DNS-SD для автоматического обнаружения станций в сети |

### Dev
| Пакет | Назначение |
|-------|------------|
| `typescript` | Компилятор TypeScript (type-check) |
| `esbuild` | Транспиляция и бандлинг |
| `@biomejs/biome` | Линтинг и форматирование |
| `vitest` | Юнит-тесты |
| `node-red-node-test-helper` | Integration-тесты для нод (peer-зависимости Node-RED) |
| `@types/node-red`, `@types/ws`, `@types/node` | Типы |
| `node-red` | Peer dependency для тестов |

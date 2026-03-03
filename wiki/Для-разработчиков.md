# Для разработчиков

Этот раздел описывает технические решения, принятые при миграции проекта с JavaScript на TypeScript, и инструменты, используемые в процессе разработки.

## Что было сделано

Оригинальный проект [node-red-contrib-yandex-station-management](https://github.com/nicediverofficial/node-red-contrib-yandex-station-management) был написан на чистом JavaScript без системы сборки — файлы `.js` и `.html` напрямую регистрировались в Node-RED.

В ходе миграции:
- Весь код переведён на **TypeScript** — серверная логика и клиентские скрипты редактора
- Система сборки заменена с **Rollup** на **esbuild**
- Добавлен линтер и форматтер **Biome** вместо ESLint/Prettier
- Пакетный менеджер переведён на **pnpm**
- Введены алиасы путей (`@/` → `src/`) для удобной навигации по проекту

## TypeScript

### Зачем

- Статическая типизация: ошибки ловятся на этапе написания кода, а не в рантайме Node-RED
- Автодополнение и подсказки в IDE для API Node-RED (`@types/node-red`), WebSocket (`@types/ws`) и Node.js (`@types/node`)
- Явные интерфейсы для конфигурации нод, устройств и WebSocket-сообщений (см. `src/lib/types.ts`)

### Конфигурация (`tsconfig.json`)

| Параметр | Значение | Пояснение |
|----------|----------|-----------|
| `target` | ES2021 | Node-RED 3+ работает на Node.js 14+, ES2021 покрывает все нужные фичи |
| `module` | CommonJS | Node-RED загружает runtime-модули через `require()` |
| `strict` | false | Мягкий режим для совместимости с унаследованными паттернами кода |
| `paths` | `@/*` → `src/*` | Алиасы, чтобы не писать `../../../lib/types` |

Файлы `editor.ts` (клиентские скрипты) **исключены** из `tsconfig.json` — они собираются esbuild отдельно как IIFE-бандлы для браузера.

### Два мира TypeScript в проекте

В проекте сосуществуют два разных контекста исполнения:

| | Runtime (серверная часть) | Editor (клиентская часть) |
|---|---|---|
| **Где работает** | Node.js (внутри Node-RED) | Браузер (редактор Node-RED) |
| **Формат модуля** | CommonJS (`require`) | IIFE (глобальные переменные) |
| **Target** | ES2021 | ES2015 |
| **API** | Node-RED runtime, `ws`, `axios`, `node-dns-sd` | `RED` (глобальный объект Node-RED editor), DOM |
| **Файлы** | `src/nodes/{name}/{name}.ts` | `src/nodes/{name}/html/editor.ts` |

## esbuild

### Зачем

- **Скорость** — esbuild на порядки быстрее Rollup/Webpack, полная сборка проекта за доли секунды
- **Простота** — весь конфигурационный файл (`esbuild.mjs`) занимает ~130 строк и делает всё необходимое
- **Единый инструмент** — и для runtime-транспиляции, и для editor-бандлинга

### Как работает сборка (`esbuild.mjs`)

Скрипт `esbuild.mjs` выполняет три задачи:

#### 1. Runtime build

Все `.ts` файлы из `src/` (кроме `editor.ts`) транспилируются в CommonJS:

```
src/nodes/connect/connect.ts  →  build/nodes/connect/connect.js
src/lib/api.ts                →  build/lib/api.js
```

Параметры: `platform: 'node'`, `format: 'cjs'`, `target: 'es2021'`, sourcemaps включены.

#### 2. Editor build (для каждой ноды)

Каждый `editor.ts` бандлится в **IIFE** (Immediately Invoked Function Expression), затем оборачивается в `<script>` тег и конкатенируется с HTML-шаблонами:

```
src/nodes/connect/html/editor.ts   ─┐
src/nodes/connect/html/editor.html  ─┤→  build/nodes/connect/connect.html
                                     │   <script>..bundled JS..</script>
                                     │   ..HTML templates..
```

Target: `ES2015` — для совместимости с браузерами, в которых открывается редактор Node-RED.

#### 3. Копирование статических файлов

Иконки (`nodes/icons/`) и файлы локализации (`locales/`) копируются в `build/` без изменений.

### Алиас `@/`

В исходном коде можно писать:
```typescript
import { QuasarApi } from '@/lib/api';
```
вместо:
```typescript
import { QuasarApi } from '../../../lib/api';
```

Плагин `aliasPlugin` в esbuild перезаписывает `@/` на правильные относительные пути перед компиляцией. В `tsconfig.json` тот же алиас настроен через `paths` для поддержки IDE.

### Watch-режим

```bash
pnpm build:watch
```

Запускает esbuild в режиме наблюдения — при изменении любого `.ts` файла runtime пересобирается автоматически. Удобно для разработки: Node-RED подхватывает изменения после перезапуска.

## Biome

### Зачем

[Biome](https://biomejs.dev/) заменяет сразу два инструмента — **ESLint** (линтер) и **Prettier** (форматтер). Преимущества:

- **Скорость** — написан на Rust, работает в десятки раз быстрее ESLint
- **Один инструмент** — не нужно синхронизировать конфигурации ESLint + Prettier
- **Минимум конфигурации** — разумные defaults из коробки

### Конфигурация (`biome.json`)

**Форматирование:**
- Отступы: пробелы, 2 символа
- Одинарные кавычки
- Точки с запятой обязательны
- Без trailing commas
- Максимальная длина строки: 200 символов

**Линтер:**
- Включены рекомендуемые правила
- `noUnusedVariables` — предупреждение (не ошибка), чтобы не мешать в процессе разработки
- `noExplicitAny` — выключено, так как проект мигрирован с JS и `any` пока используется в унаследованном коде

**Область действия:** только файлы `.ts` и `.js` в `src/`.

### Команды

```bash
# Проверить линтером (без изменения файлов)
pnpm lint

# Проверить и автоматически исправить
pnpm lint:fix

# Отформатировать код
pnpm format
```

## Структура проекта

```
├── esbuild.mjs               # Скрипт сборки
├── biome.json                 # Конфигурация Biome
├── tsconfig.json              # Конфигурация TypeScript (IDE + type-checking)
├── package.json               # pnpm, скрипты, зависимости
├── src/
│   ├── lib/
│   │   ├── api.ts             # QuasarApi — HTTP-запросы к Yandex API
│   │   ├── api/device.ts      # Описание моделей устройств
│   │   ├── stationHelper.ts   # Форматирование payload (status/homekit)
│   │   └── types.ts           # Общие интерфейсы и типы
│   └── nodes/
│       ├── connect/           # Config-нода (OAuth, mDNS, WebSocket)
│       │   ├── connect.ts
│       │   ├── types.ts
│       │   └── html/
│       │       ├── editor.ts
│       │       └── editor.html
│       ├── station/           # Аналогичная структура
│       ├── in/
│       ├── get/
│       └── out/
│           └── locales/       # i18n файлы (en-US, ru-RU)
├── build/                     # Результат сборки (gitignored)
└── nodes/                     # Оригинальные JS-файлы (для справки)
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
| `typescript` | Компилятор TypeScript (используется только для проверки типов в IDE) |
| `esbuild` | Транспиляция и бандлинг |
| `@biomejs/biome` | Линтинг и форматирование |
| `@types/node-red` | Типы Node-RED runtime и editor API |
| `@types/ws` | Типы для WebSocket |
| `@types/node` | Типы Node.js |
| `node-red` | Для тестирования (peer dependency) |

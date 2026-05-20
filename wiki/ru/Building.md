# Сборка из исходников

Проект написан на TypeScript и использует esbuild для сборки. Пакетный менеджер — pnpm. Минимальная версия Node.js — 18.5.

## Установка зависимостей

```bash
pnpm install
```

## Сборка

```bash
pnpm build           # dev-сборка с inline sourcemap
pnpm build:prod      # production: без sourcemap, с минификацией editor
pnpm build:watch     # автоматическая пересборка runtime при изменении файлов
```

## Проверки

```bash
pnpm typecheck       # tsc --noEmit
pnpm lint            # biome check
pnpm lint:fix        # biome check --write (форматирование + safe fixes)
pnpm format          # только форматирование
pnpm test            # vitest run (59 юнит-тестов)
pnpm test:watch      # vitest watch
```

Подробное описание инструментов и архитектуры — в [Для разработчиков](For-Developers).

## Структура проекта (кратко)

```
src/
├── lib/
│   ├── api.ts            # QuasarApi
│   ├── api/device.ts     # Типы устройств
│   ├── auth.ts           # QR OAuth-флоу
│   ├── stationHelper.ts  # Форматирование payload
│   └── types.ts          # Общие типы
├── types/
│   └── node-dns-sd.d.ts  # Ambient-типы
└── nodes/
    ├── connect/          # Config-нода (8 модулей)
    ├── station/
    ├── in/
    ├── get/
    └── out/
tests/                    # Vitest-кейсы
```

Каждая нода содержит:
- `{name}.ts` — серверная логика (runtime)
- `html/editor.ts` — клиентский скрипт (editor)
- `html/editor.html` — HTML-шаблон для Node-RED editor

## Результат сборки

```
build/nodes/
├── connect/connect.js, connect.html
├── station/station.js, station.html
├── in/in.js, in.html
├── get/get.js, get.html
├── out/out.js, out.html, locales/
└── icons/
```

Перед публикацией в npm выполняется `pnpm build:prod`. Поле `files` в `package.json` гарантирует, что в пакет попадают только `build/`, `README.md`, `LICENSE`, `CHANGELOG.md`.

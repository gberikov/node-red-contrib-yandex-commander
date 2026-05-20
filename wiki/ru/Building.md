# Сборка из исходников

Проект написан на TypeScript и использует esbuild для сборки. Пакетный менеджер — pnpm.

## Установка зависимостей

```bash
pnpm install
```

## Сборка

```bash
pnpm build
```

## Режим разработки

Автоматическая пересборка при изменении файлов:

```bash
pnpm build:watch
```

## Линтинг и форматирование

Проект использует [Biome](https://biomejs.dev/) для линтинга и форматирования.

```bash
# Проверка
pnpm lint

# Проверка с автоисправлением
pnpm lint:fix

# Форматирование
pnpm format
```

## Структура проекта

```
src/
├── lib/
│   ├── api.ts            # QuasarApi — получение устройств и токенов
│   ├── api/device.ts     # Описание устройств
│   ├── stationHelper.ts  # Форматирование payload (status/homekit)
│   └── types.ts          # Общие типы
├── nodes/
│   ├── connect/          # Config-нода (OAuth, mDNS, WebSocket)
│   ├── station/          # Нода Station
│   ├── in/               # Нода IN
│   ├── get/              # Нода GET
│   └── out/              # Нода OUT
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

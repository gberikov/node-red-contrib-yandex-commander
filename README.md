# node-red-contrib-yandex-commander

[![CI](https://github.com/gberikov/node-red-contrib-yandex-commander/actions/workflows/ci.yml/badge.svg)](https://github.com/gberikov/node-red-contrib-yandex-commander/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/node-red-contrib-yandex-commander.svg)](https://www.npmjs.com/package/node-red-contrib-yandex-commander)
[![node-red](https://img.shields.io/badge/node--red-%3E%3D4.0-red.svg)](https://nodered.org/)
[![node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org/)
[![license](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)

Управление Яндекс Станциями в Node-RED через локальный WebSocket-протокол Glagol.

> Форк [node-red-contrib-yandex-station-management](https://github.com/nicediverofficial/node-red-contrib-yandex-station-management), переписанный на TypeScript, с полным покрытием юнит-тестами критичных модулей и архитектурой, ориентированной на расширение.

## Поддерживаемые устройства

- Яндекс Станция / Мини / Мини 2 / Лайт / Макс
- Яндекс Модуль / Модуль 2
- JBL Link Music / JBL Link Portable

## Установка

```sh
npm i node-red-contrib-yandex-commander
```

Или через Manage Palette в Node-RED.

## Ноды

| Нода | Назначение |
|------|------------|
| `yandex-commander-connect` | Config-нода: OAuth-токен, обнаружение устройств (cloud + mDNS), пул WebSocket-соединений |
| `yandex-commander-station` | Регистрирует конкретную станцию: расписание тишины, сетевой режим (auto/manual) |
| `yandex-commander-get` | По входящему сообщению возвращает текущее состояние (status / homekit) |
| `yandex-commander-in` | Стримит состояние станции (с дедупликатором для homekit) |
| `yandex-commander-out` | Отправляет команды: tts, command, voice, homekit, raw |

## Документация

Полная документация в [Wiki](../../wiki):

**Русский** ([Home](../../wiki/ru/Home))
- [Установка и получение токена](../../wiki/ru/Installation)
- [Первоначальная настройка](../../wiki/ru/Initial-Setup)
- Ноды: [Station](../../wiki/ru/Station-Node) · [IN](../../wiki/ru/IN-Node) · [GET](../../wiki/ru/GET-Node) · [OUT](../../wiki/ru/OUT-Node)
- [RAW-команды](../../wiki/ru/RAW-Commands)
- [Примеры использования](../../wiki/ru/Examples)
- [FAQ](../../wiki/ru/FAQ)
- [Для разработчиков](../../wiki/ru/For-Developers)
- [Сборка из исходников](../../wiki/ru/Building)

**English** ([Home](../../wiki/en/Home))
- [Installation](../../wiki/en/Installation)
- [Initial Setup](../../wiki/en/Initial-Setup)
- [Building from source](../../wiki/en/Building)

A Node-RED contrib package for controlling Yandex smart speakers through the local Glagol WebSocket protocol. Provides five nodes: a config node that owns the OAuth token and the device pool, a station node per device, plus IN / GET / OUT nodes for receiving state and sending commands (TTS, raw commands, HomeKit-style mappings).

## Разработка

```sh
pnpm install
pnpm run build           # сборка
pnpm run build:watch     # watch-режим
pnpm run typecheck       # tsc --noEmit
pnpm run lint            # biome check
pnpm run test            # vitest
```

См. [CHANGELOG.md](CHANGELOG.md).

## Лицензия

[ISC](LICENSE)

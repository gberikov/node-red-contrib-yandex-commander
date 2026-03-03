# node-red-contrib-yandex-commander

Control Yandex smart speakers and devices through local API via Node-RED using WebSocket connections.

Supported devices:
- Yandex Station (tested)
- Yandex Station Mini (tested)
- Yandex Station Mini 2 with display (tested)
- Yandex Station Lite (tested)
- Yandex Station Max (tested)
- Yandex Module (tested)
- Yandex Module 2 (tested)
- JBL Link Music (not tested)
- JBL Link Portable (tested)

Requirements — devices must be:
- connected to a Yandex account
- on the same local network as the Node-RED server

> This project is a fork of [node-red-contrib-yandex-station-management](https://github.com/nicediverofficial/node-red-contrib-yandex-station-management), rewritten in TypeScript with esbuild as the build tool.

Multiple devices (tested) and multiple accounts (tested) are supported.

## Contents

- [Installation](EN-Installation)
- [Building from source](EN-Building)

## Nodes

The plugin consists of 4 nodes:

| Node      | Description                                             |
|-----------|---------------------------------------------------------|
| **IN**    | Automatically sends device status updates (raw & HomeKit) |
| **GET**   | Returns the latest device status on any incoming message |
| **OUT**   | Sends commands to the device (player, voice, TTS, RAW)  |
| **Station** | Optional per-device settings (connection, network, kid control) |

You need a Yandex Music token to work. Token can be obtained through:
- Built-in OAuth in the module (experimental)
- [Bot service](https://music-yandex-bot.ru) — see [Installation](EN-Installation) for details
- [Yandex Music API method](https://github.com/MarshalX/yandex-music-api/discussions/513#discussioncomment-2729781)

### Русская документация

- [Главная (RU)](Home)

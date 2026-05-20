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

- [Installation](Installation)
- [Initial Setup](Initial-Setup)
- **Nodes:**
  - [Station](Station-Node)
  - [IN](IN-Node)
  - [GET](GET-Node)
  - [OUT](OUT-Node)
- [RAW commands](RAW-Commands)
- [Usage examples](Examples)
- [FAQ](FAQ)
- **Development:**
  - [For Developers](For-Developers) — architecture, TypeScript, esbuild, Biome, tests
  - [Building from source](Building)

## Nodes

The plugin consists of 5 nodes (1 config + 4 flow nodes):

| Node          | Description                                                 |
|---------------|-------------------------------------------------------------|
| **Connect**   | Config node — OAuth token, device discovery, WebSocket pool |
| **Station**   | Optional per-device settings (connection, network, kid control) |
| **IN**        | Automatically sends device status updates (raw & HomeKit)   |
| **GET**       | Returns the latest device status on any incoming message    |
| **OUT**       | Sends commands to the device (player, voice, TTS, RAW)      |

You need a Yandex Music token to work. Token can be obtained through:
- Built-in OAuth in the module (experimental)
- [Bot service](https://music-yandex-bot.ru) — see [Installation](Installation) for details
- [Yandex Music API method](https://github.com/MarshalX/yandex-music-api/discussions/513#discussioncomment-2729781)

---

🌐 **[Русская версия](../ru/Home)**

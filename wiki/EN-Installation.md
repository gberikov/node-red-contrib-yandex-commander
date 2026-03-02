# Installation

Install via the Manage Palette section in Node-RED or using npm.

Run the following command in your Node-RED user directory (typically `~/.node-red`):

```
npm i node-red-contrib-yandex-commander
```

## Getting a token

A Yandex Music token is required.

### Option 1: Built-in OAuth (experimental)

The module can obtain the token from your login and password. If it doesn't work, try toggling two-factor authentication in your Yandex settings. [Source](https://github.com/AlexxIT/YandexStation/issues/103)

### Option 2: Via bot

Go to https://music-yandex-bot.ru:
1. Enter your login and password
2. A "Go to bot" button will appear — **don't click it**, copy the link instead
3. The token is all the characters after `&start=` in the link

### Option 3: Via Yandex Music API

Described [here](https://github.com/MarshalX/yandex-music-api/discussions/513#discussioncomment-2729781).

## Initial setup

1. Add any node from the `yandex-commander` set
2. Enter the token in the Login section
3. Save and click **Deploy** (required!)

After deploying, available stations should appear in the **Station** field in node settings.

If the station doesn't appear, wait a couple of minutes or restart Node-RED.

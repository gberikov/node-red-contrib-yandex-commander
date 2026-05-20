# Cloud TTS

`node-red-contrib-yandex-commander` supports two ways of delivering TTS to a station: locally via the Glagol WebSocket protocol, and through the cloud via Yandex Quasar scenarios.

## When local TTS works

- Node-RED and the station are on the same LAN.
- The station is discoverable via mDNS (or its address is set manually in the Station node).
- The WebSocket is active (`connected` status on the node).

The local path supports full SSML: `<speaker voice='alyss'>`, `<speaker effect='megaphone'>`, `<speaker is_whisper='true'>`, `<speaker audio="...">`, `sil <[500]>`, and `+` stress marks. Latency: ~50–150 ms.

## When cloud TTS works

- The Connect node holds a valid OAuth token.
- The station is connected to the internet and to your Yandex account (visible in the Yandex app).
- The OUT node has **"Cloud TTS fallback"** enabled, or the message explicitly sets `msg.cloud = true`.

The cloud path is used only when:

- the local WebSocket is unavailable (station not on LAN, not responding), **or**
- the message sets `msg.cloud === true` (forced).

`msg.cloud === false` disables the cloud path even if the checkbox is on. Use this when you want a specific message to fail with an explicit `'Device offline'` instead of silently going through the cloud.

## How to enable

1. Open the OUT node.
2. Set **Action** to `Synthesize speech from text`.
3. Check **Cloud TTS fallback**.
4. (Optional) Set `msg.cloud = true/false` per message to override.

## Cloud TTS limitations

- **Plain text only.** SSML is stripped: `<speaker …>`, `sil <[…]>`, and `+` are removed before sending. Voice/effect/whisper settings are ignored.
- **Length 2–100 characters.** Shorter than 2 → error; longer than 100 → truncated with a debug-log warning.
- **`msg.volume`, `msg.whisper`, `msg.voice`, `msg.effect`, `msg.prevent_listening`, `msg.pause_music`** are not applied on the cloud path — the Quasar scenario only supports the phrase text.
- **Latency ~500–1500 ms** — noticeably higher than local.
- **A scenario is created in the Quasar account.** Named `ЯC <encoded_device_id>`. Visible in the Yandex app under scenarios. The same scenario is reused for every TTS call (no duplicates).

## Compatibility with AlexxIT/YandexStation

The scenario name follows the `AlexxIT/YandexStation` scheme (Cyrillic hex-encoding). If such a scenario already exists in your account thanks to AlexxIT's integration, we reuse it and don't create a duplicate.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `Cloud TTS: text too short` | After stripping SSML the text was < 2 characters. |
| `Cloud TTS failed for <id>: ...` | Error from the Quasar API. Verify the OAuth token and that the station is visible in the Yandex app. |
| Silence (no errors) | The scenario fired, but the station is offline in the cloud. |

Logs are in the Node-RED debug panel — look for `Cloud TTS` lines from the connect node.

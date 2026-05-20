# IN Node

Placed at the start of a flow. Automatically emits the device's current status in both the raw format and a HomeKit-friendly format.

## Full status Message (raw format)

Returns the data without transformation, exactly as received from the device. Message structure:

```json
{
    "aliceState": "IDLE",
    "canStop": false,
    "hdmi": {
        "capable": true,
        "present": false
    },
    "playerState": {
        "duration": 180.91,
        "extra": {
            "coverURI": "avatars.yandex.net/get-music-content/2383988/de45408f.a.9039208-1/%%",
            "stateType": "music"
        },
        "hasNext": true,
        "hasPause": false,
        "hasPlay": false,
        "hasPrev": true,
        "hasProgressBar": true,
        "liveStreamText": "",
        "progress": 20,
        "showPlayer": true,
        "subtitle": "Крематорий",
        "title": "Мусорный ветер"
    },
    "playing": false,
    "timeSinceLastVoiceActivity": 30454,
    "volume": 0
}
```

The device can emit several messages per second, so consider placing the built-in **RBE** node downstream to filter duplicates by content (track title `payload.playerState.title`, artist `payload.playerState.subtitle`).

## HomeKit formatted

Internally converts the output to a HomeKit-ready shape, so this node can be wired directly to a HomeKit node — significantly simplifying the flow. Use cases are available in [Examples](Examples).

For the HomeKit-formatted output there are options:
- **Unique messages** — emit only unique messages, skipping duplicates.
- **Homekit format** — choose between Smart Speaker and Television. Scenarios are described in [Examples](Examples).

### Message structure — Smart Speaker:

```json
{"CurrentMediaState": 0, "ConfiguredName": "International String Trio - Tarantella"}
```

### Message structure — Television:

```json
{"Active": 1}
```

Using the Television device type unlocks the iOS Remote control.

# OUT Node

Placed at the end of a flow. Used to send messages to devices. Multiple OUT nodes targeting the same device are allowed — their data is delivered over a single shared connection to that device.

## Player command

Controls station playback. The node expects `payload` to be a string with one of the following commands:

| Command    | Description           |
|------------|-----------------------|
| play       | Start playback        |
| stop       | Stop playback         |
| next       | Next track            |
| prev       | Previous track        |
| forward    | Seek 10 seconds ahead |
| backward   | Seek 10 seconds back  |
| volumeup   | Increase volume       |
| volumedown | Decrease volume       |

## Voice command

Sends a command as if you said it to the station out loud: "Turn on the lights", "Play music", "Play my playlist", "Turn off in 15 minutes", etc.

## TTS (Text to Speech)

Plays the supplied phrases out loud. No character limit.

TTS parameters can be configured in the node settings, and some of them can also be overridden per message.

### Parameters

- **Text** — what to say and where it comes from:
    - from the incoming message (`msg.payload` by default)
    - a fixed string
    - a variable from flow or global context
    - JSON: pick a phrase at random from an array like `["one", "two", "three"]`
- **Voice** — voice for speech synthesis. Override via `msg.voice`
- **Effect** — voice effect. Override via `msg.effect`

### Options

| Option             | Description                                                                                                  | Override                |
|--------------------|--------------------------------------------------------------------------------------------------------------|-------------------------|
| Volume             | Speaks at the given volume. After the phrase, the volume returns to its previous level                       | `msg.volume`            |
| Whisper            | Speaks in a whisper                                                                                          | `msg.whisper`           |
| Prevent listening  | The station does not listen for a reply after the phrase                                                     | `msg.prevent_listening` |
| Pause while TTS    | Pauses the player while speaking. Resumes only if something was playing when the command was issued          | `msg.pause_music`       |

All options can be combined.

### Cloud TTS fallback

If the station is unreachable on the local network, TTS can be delivered through the Yandex cloud. Only available in TTS mode.

| Option             | Description                                                                  | Override        |
|--------------------|------------------------------------------------------------------------------|-----------------|
| Cloud TTS fallback | When the local WebSocket is unavailable, deliver TTS via the cloud           | `msg.cloud`     |

Details and limitations: [Cloud-TTS](Cloud-TTS).

### Adding life and color to the voice

#### Mark stressed syllables
Mark stressed vowels with `+` when needed:

    остр+ота
    м+ука

#### Split words
Long words can be broken into shorter ones with stresses applied to each:

    мн+ого пр+офильный
    с+еми пал+атинск

#### Spell words phonetically
Some words can be written the way they sound:

    «ненастный» — нен+асный
    «пожалуйста» — пож+алуста

#### Add pauses
Syntax: `sil <[ milliseconds ]>`

    смелость sil <[500]> город+а берёт

Each space-separated punctuation mark adds a 50–100 ms pause.

#### Add [sounds from the library](https://yandex.ru/dev/dialogs/alice/doc/sounds-docpage/)

    <speaker audio="alice-sounds-game-win-1.opus"> У вас получилось!

## Homekit Formatted

Receives output from HomeKit SmartSpeaker (on/off) and Television (on/off + remote) devices of the [NRCHB](https://github.com/NRCHKB/node-red-contrib-homekit-bridged) module.

A built-in `hap.context` check prevents loops. Wires directly to a HomeKit node.

The **"Default command"** option specifies which voice command to issue when nothing is currently playing but the user expects playback to start. For example, "Play my music" or "Play kids' songs".

## Stop listening

Forcibly interrupts Alice's "listening" state on any incoming message. Equivalent to command 16 in the [RAW commands](RAW-Commands) section.

## Play Music

Plays Yandex Music content by ID without needing RAW mode. Equivalent to RAW commands 6–8 in the [RAW commands](RAW-Commands) section.

### Parameters

- **Music ID** — content identifier (e.g. `44731403` for a track, `44731403:1234556` for a playlist, `detskoe` for a radio station). Override via `msg.id`.
- **Music type** — content type: `track`, `artist`, `album`, `playlist`, `radio`. Override via `msg.type`.

The payload sent to the station:

```json
{ "command": "playMusic", "id": "<id>", "type": "<type>" }
```

## RAW Command

Receives a JSON message inside `payload` and forwards it to the station without modification. Multiple messages can be sent in one payload as an array.

The full command list is in the [RAW commands](RAW-Commands) section.

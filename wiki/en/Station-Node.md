# Station Node

Additional settings for a specific station. This node is optional — everything works without it, but it adds extra features. The node is placed outside of any flow and has no inputs or outputs.

## Connection to device

Controls the connection to the station. If for some reason you need to disable the connection, set this to **Disabled**.

## Network

In **Manual** mode you can specify the station address and port manually. Recommended when running inside Docker, HomeAssistant, or other setups where automatic network discovery does not work.

## Kid Control

Lets you restrict playback time for songs, radio, and fairy tales — handy for keeping young night-story lovers from staying up too long.

Configured per day of the week. If **Active** is not checked, no restrictions apply for that day.

**Phrase to say** — the phrase Alice will say instead of playing music :) Skills, alarms, weather, news and so on continue to work.

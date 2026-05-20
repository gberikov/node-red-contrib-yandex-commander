# Initial Setup

After [installing the plugin](Installation) and obtaining a token:

1. Add any node from the `yandex-commander` set to your flow
2. Enter the token in the Login section of the config node
3. Save and click **Deploy** (required!)

After deploying, available stations should appear in the **Station** field in node settings.

If the station doesn't appear, wait a couple of minutes or restart Node-RED. The mDNS-based discovery is not always reliable — a retry after a delay usually picks up missing devices.

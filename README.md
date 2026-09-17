# Token Speed

A panel extension that shows the current OpenChamber session and its turn
history on the context rail. It asks for no extension capabilities.

## Install from GitHub

1. Open OpenChamber → **Settings → Extensions**.
2. In **Folder, ZIP, or URL**, paste this repository's public link:
   `https://github.com/adeerkhan/openchamber-tps.git`
3. Press **add**. No capability approval is needed.
4. Open the **Token Speed** panel from the context rail.

To update later, bump `version` in `package.json` and use **check for
updates** in Settings → Extensions.

## Try it

1. Open any session and watch the panel follow its title, model, and
   working/idle state.
2. Send a prompt. Each turn appends a started/completed line to the log.
3. The Tokens section explains where live throughput lives: SDK v1 does not
   expose per-message token counts to extensions, so live tok/s is shown by
   the native status-bar indicator, not here.

## Make it yours

`panel/main.ts` is the whole panel: `connectHost`, one `onReady`, one
`onSession`, one `onSessionLifecycle` subscription, plain DOM. The checked-in
`panel/main.js` is its built bundle — installation never builds source.

Rebuild after editing the panel:

```sh
npm install
npm run build
```

`openchamber-token-speed.md` next to it is the native indicator spec for
core-UI work; this extension does not depend on it.

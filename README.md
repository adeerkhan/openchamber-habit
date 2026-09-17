# Token Speed

A panel extension that shows the current OpenChamber session, whether it is
working, and how long its turns take. It asks for no extension capabilities.

## Features

- **Live session status** — follows the open session's title, model, and
  working/idle state without any approval prompts. Green dot idle, pulsing
  amber dot working.
- **Turn timing** — each finished turn reports its duration and outcome in
  green/red, borrowing pi-token-speed's speed-tier palette.
- **Zero capabilities** — context pushes only, so install shows no approval
  screen and nothing leaves the sandbox.

## Install from GitHub

1. Open OpenChamber → **Settings → Extensions**.
2. In **Folder, ZIP, or URL**, paste this repository's public link:
   `https://github.com/adeerkhan/openchamber-tps.git`
3. Press **add**, then open the **Token Speed** panel from the context rail.

To update later, bump `version` in `package.json` and use **check for
updates** in Settings → Extensions.

## Try it

1. Open any session. The panel shows its title, model, and state.
2. Send a prompt. The panel flips to working, then reports the turn time.
3. The Tokens section is honest about the platform limit: SDK v1 does not
   expose per-message token counts to extensions, so live tok/s lives in the
   native status-bar indicator, not here.

## How it works

1. **Panel opens** — `connectHost` says hello; `onReady` paints the theme,
   directory, and current session.
2. **Session changes** — `onSession` repaints the card for the newly
   selected session.
3. **Turn runs** — the host posts `session-lifecycle` phases; `started`
   begins the clock, `completed`/`failure` stops it and records the outcome.
4. **Tokens stay out** — throughput needs streamed deltas plus authoritative
   provider counts, neither of which the guest sandbox receives. The design
   (rolling estimate snapped to authoritative totals) is specified in
   `openchamber-token-speed.md` for the native indicator.

## Make it yours

`panel/main.ts` is the whole panel: three subscriptions, plain DOM, no
framework. The checked-in `panel/main.js` is its built bundle — installation
never builds source. Rebuild after editing:

```sh
npm install
npm run build
```

## Acknowledgments

Throughput design learned from
[pi-token-speed](https://github.com/gsanhueza/pi-token-speed): estimate over
a rolling window, snap totals to authoritative counts at turn end, and treat
buffered flushes as stalls rather than miracles. Its TTFT and end-of-stream
average ideas are recorded in the spec as follow-ups.

# Habit

Keep what your agent should remember. A panel extension that captures project
and global habits, curates them, and inserts them back into the draft. It
asks for no extension capabilities.

## Install from GitHub

1. Open OpenChamber → **Settings → Extensions**.
2. In **Folder, ZIP, or URL**, paste this repository's public link:
   `https://github.com/adeerkhan/openchamber-habit.git`
3. Press **add**, then open the **Habit** panel from the context rail.

To update later, bump `version` in `package.json` and use **check for
updates** in Settings → Extensions.

## Try it

1. In any session, run the message action **Remember as habit** on something
   worth keeping. The panel opens with the form prefilled — add a title.
2. Or type `/remember tabs, not spaces | enforced by .editorconfig` in the
   composer.
3. Back in the panel, press **Insert** on a habit to append it to your draft.
4. `/habits` counts what is kept here; `/forget <title>` drops one.

Habit redacts recognized secret patterns in titles and details before saving
and reports when it does. This is best-effort, not a guarantee: review what
you save and do not use Habit to store credentials.

## How it works

1. **Capture** — session/message actions, `/remember`, or the panel form.
   Every memory carries its source session so provenance never gets lost.
2. **Store** — host namespaced storage, keyed by a short hash of the project
   directory plus per-memory ids. Globals show everywhere; project habits
   show only in their project. Nothing leaves the machine.
3. **Recall** — the panel lists what applies here; Insert composes it into
   the draft, Copy takes it to the clipboard. Edit and Forget curate.

## Make it yours

`panel/habits.ts` is the pure memory logic (keys, redaction, matching,
formatting) with `panel/habits.test.ts` beside it (`bun test panel`).
`panel/main.ts` is the whole panel. The checked-in `panel/main.js` is its
built bundle — installation never builds source. Rebuild after editing:

```sh
npm install
npm run build
```

[The archived Token Speed specification](docs/openchamber-token-speed.md)
is kept as a design record; this extension does not depend on it.

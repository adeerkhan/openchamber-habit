# Habit

Keep what your agent should remember. A panel extension that captures project
and global habits, curates them, and inserts them back into the draft.
Requires OpenChamber 1.24.0 or newer. The session action requests conversation
access; the manifest also requests model and project-file access. Updating an
existing installation requires approval of those additional permissions.
Habit does not use git.

Habit can also propose habits from a session and write approved project habits
into the project's `AGENTS.md`. It never runs automatically: every model call
and every file write follows a click, and every write is previewed first.

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
2. Or run the session action **Remember session as habit**. Habit reads the
   turns since your last click on that session and stages suggestions for
   review. **Nothing is kept until you press Keep.**
3. Or type `/remember tabs, not spaces | enforced by .editorconfig` in the
   composer.
4. If you run Vitruvius, run `/habit` there, then `/habit-import
   outputs/.habits/<slug>.json` here — or paste the ledger into the panel's
   **Import from Vitruvius** box.
5. Back in the panel, press **Insert** on a habit to append it to your draft,
   or **Apply to AGENTS.md** to write this project's habits into the file.
6. `/habits` counts what is kept here; `/forget <title>` drops one.

Habit redacts recognized secret patterns in titles and details before saving
and reports when it does. This is best-effort, not a guarantee: review what
you save and do not use Habit to store credentials.

## How it works

1. **Capture** — session/message actions, `/remember`, or the panel form.
   Every memory carries its source session so provenance never gets lost.
2. **Suggest** — the session action **Remember session as habit** sends only
   the turns since your last click on that session to the configured Small
   Model, then validates that every suggestion cites a user message from that
   exact slice. Validated suggestions wait in a review queue — nothing is kept
   until you press **Keep**. Zero suggestions is the normal result for a
   session with no durable preferences. Re-clicking with nothing new makes no
   model call. The rail badge counts completed turns since you last reviewed;
   a failed turn does not count.
3. **Import** — a harness subagent (the `habit` role in
   [Vitruvius](https://github.com/adeerkhan/vitruvius)) reads a live session
   from inside the agent and writes a *ledger* under `outputs/.habits/`. Run
   `/habit-import <path>` or paste the ledger into the panel. Habit validates
   every candidate against the transcript window embedded in the ledger before
   review. Re-importing the same ledger is a no-op. The extension itself never
   reads a conversation without a click.
4. **Store** — host namespaced storage, keyed by a short hash of the project
   directory plus per-memory ids. Globals show everywhere; project habits
   show only in their project. Memories live on the connected OpenChamber
   server, which may be remote.
5. **Apply** — **Apply to AGENTS.md** writes this project's habits into the
   project `AGENTS.md` inside `<!-- habit:start -->` / `<!-- habit:end -->`,
   after showing the exact block. Everything outside the markers is kept
   byte-for-byte. If the file changed outside the block since the last write,
   Habit stops and asks before replacing. A running session must be restarted
   for the model to load the change. Deleting a habit does not edit the file;
   re-apply to update it.
6. **Recall** — the panel lists what applies here; Insert composes it into
   the draft, Copy takes it to the clipboard. Edit and Forget curate.

## Feedback counts

**Confirm** and **Contradict** record explicit feedback.
The panel shows counts (for example, “1 confirmation · 0 contradictions”),
not percentages or estimated preference strength. Insert and Copy never add
feedback. Editing the habit text resets feedback measured against the old text.

Existing counts remain in OpenChamber's extension storage on the connected
server; older memories start at zero. Repeated deliberate clicks count as
separate actions, not independent transcript evidence. An extracted suggestion
stores only its short text plus the id of a user message it cited — never the
transcript. The unused standalone engine has been removed. Habit does not write
a project `habits.json` file.

## Privacy

Analysis sends the selected new turns to the configured Small Model; a
pointer-only record does not stop provider retention. Captured text is checked
for recognized secret patterns before it is saved, staged, or written, and the
preview shows the sanitized block. That check is best-effort, not a guarantee:
review what you keep, and do not use Habit to store credentials. Project files
may be committed or synced.

## Make it yours

`panel/habits.ts` is the pure memory logic (keys, redaction, matching,
formatting). `panel/extraction.ts` is the pure extraction/validation logic,
`panel/import-ledger.ts` parses and validates Vitruvius ledgers, and
`panel/apply.ts` is the pure AGENTS.md block/diff logic. Each has a test beside
it (`bun test panel`). `panel/main.ts` is the whole panel. The checked-in
`panel/main.js` is its built bundle — installation never builds source. Rebuild
after editing:

```sh
npm install
npm run build
```

[The archived Token Speed specification](docs/openchamber-token-speed.md)
is kept as a design record; this extension does not depend on it.

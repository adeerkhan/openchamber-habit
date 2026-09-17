# Habit architecture

> Direction and commitments. Where something is unverified it says so once (§3) and is assigned a spike.
>
> Written 2026-09-17. Supersedes the same-day concept draft.
> **Revision 2 (2026-09-17):** No git tracking, no instruction-file writing in the core loop. Habits live in **one project JSON file with a per-habit confidence score**, updated on every attributed observation. See §4a.

## 1. The bet

Habit is an OpenChamber extension that turns repeated corrections into durable, agent-readable preferences.

The bet: a user corrects the same thing several times before they bother to write it down by hand — and often never writes it down at all. Habit notices the repetition and makes the write-down one click.

**The null hypothesis Habit must beat:** the user typing one line into their agent instruction file. That takes ten seconds. Habit only wins where the user wouldn't have bothered: preferences that are real, repeated, and below the threshold of being worth documenting.

**The metric: repeat-correction rate** — how often the user issues an instruction that a currently-active habit already covers. It goes down or the project failed. (How to detect a repeat is itself an open problem; see Spike 2.)

**Scope of v1:** a single developer on their own machine. No team sharing, no sync, no studio.

## 2. Prior art

Command Code's Taste is the incumbent. Its published surface is categorized markdown at `.commandcode/taste/<category>/taste.md` per project and `~/.commandcode/taste/` globally, with numeric confidence and push/pull merging against a remote studio. Its internals (`taste-1`, "meta neuro-symbolic", "continuous RL") are undocumented and its performance claims are unsourced. What matters is the artifact, not the engine: preferences are markdown files the agent reads. Habit adopts that shape.

[Reflexion](https://arxiv.org/abs/2303.11366) is the honest name for the mechanism: improvement through linguistic feedback and external memory, no weight updates. ([Reflexion](https://arxiv.org/abs/2303.11366); [neuro-symbolic overview](https://gregrobison.medium.com/neuro-symbolic-ai-a-foundational-analysis-of-the-third-waves-hybrid-core-cc95bc69d6fa) and [AlphaGeometry](https://deepmind.google/discover/blog/alphageometry-an-olympiad-level-ai-system-for-geometry/) are background, not load-bearing.)

Habit does not claim a model, a training loop, or a knowledge graph.

## 3. Platform constraints (verified 2026-09-17)

Checked against the [OpenChamber Host API](https://docs.openchamber.dev/sdk/host/) and [OpenCode V2 instructions guide](https://opencode.ai/v2/docs/instructions) on 2026-09-17, cross-checked against the installed `@openchamber/sdk@1.24.0` contract. Docs are unversioned; re-verify against the installed host.

| Constraint | Value | Design consequence |
| --- | --- | --- |
| `generate` prompt | ≤ 64,000 chars | Long sessions must be selected/truncated before analysis. Not optional. |
| `generate` system | ≤ 8,000 chars | Extraction prompt must be terse. One job per call. |
| `generate` output | ≤ 4,000 tokens, 90s timeout | Candidates only, never long-form. |
| Model choice | User's Small Model; extension cannot pick it | Assume a weak, cheap model. Design prompts accordingly. Provider disclosure is impossible beyond "your Small Model". |
| Storage | ≤ 64 KiB per value; namespace ≤ 2 MiB / 2,000 keys | Evidence is stored as pointers (session id + message id), never as text. |
| `writeFile` | Atomic, creates parents, ≤ 2,000,000 chars | Viable as the application mechanism. |
| File permissions | Project paths need the `files` capability; `~/` paths need `contributes.filesystem` patterns (e.g. `~/.config/opencode/AGENTS.md`), shown in the install approval dialog | Writing the global file is a bigger ask than writing the project file. Consider project-only writes in v1 and require explicit setup for global. |
| Conversation content | Only via a session action with `payload: ["messages"]`, user-triggered, `conversation` capability | No passive transcript observation. Analysis is always user-initiated. |
| Session events | `onSessionLifecycle` (`started`/`completed`/`failure`); `onSessions` snapshots carry `activity` and `outcome` | Timing without content. Enough to prompt analysis, not to perform it. |
| Panel lifetime | Subscriptions capped at 32/frame, cleared on unmount, pause, removal, server switch | The panel is not a worker. Events (and the badge) exist only while a frame is alive. |
| Durable process | Only `contributes.service`: unsandboxed, full user access, alarming approval dialog | Not in v1. The permission cost exceeds the value. |

**Application mechanism.** OpenCode V2 loads project and global `AGENTS.md` files into every session, re-reads upward-discovered files as the agent explores, and detects edits to instruction files before the next model request. The V2 `instructions` config field is accepted but **not** loaded — only `AGENTS.md` carries instructions. So the injection path is a file the agent already reads; no hook and no host enhancement is required. Whether the installed OpenChamber/OpenCode pair behaves exactly so in a live session is Spike 0.

## 4a. Persistence: one project JSON file (revision 2)

No git integration, no instruction-file writing, no review-queue file format. Habit tracks what the user does, learns from it, and saves a **single JSON file in the OpenChamber project**:

```json
{
  "version": 2,
  "habits": {
    "h_k3x9": {
      "id": "h_k3x9",
      "text": "Prefer native APIs over new dependencies.",
      "scope": "project",
      "category": "dependencies",
      "status": "active",
      "from": { "sessionId": "ses_8812", "messageId": "msg_44" },
      "createdAt": 1760000000000,
      "updatedAt": 1760086400000,
      "supporting": 3,
      "contradicting": 1,
      "confidence": 0.67,
      "observations": {
        "ses_8812#msg_44": "support",
        "ses_8812#msg_120": "note"
      }
    }
  }
}
```

**Confidence:** `(1 + supporting) / (2 + supporting + contradicting)`, rounded to 2 decimals. Starts at 0.5; every attributed event moves it immediately. Confidence is **always derived from the counts** — a stored `confidence` value is never trusted.

| Event | Source | Effect on confidence |
| --- | --- | --- |
| instruction, correction, confirmation | user | +1 supporting |
| violation (user overrides an active habit) | user | +1 contradicting |
| applied, or any assistant/system observation | assistant/system | recorded as `"note"`, weight 0 |
| anything on an `off` habit | any | recorded, weight 0 |

The weight-0 rule is the one correctness invariant: if applied-events raised confidence, a habit would confirm itself and the score would be meaningless. An assistant violating a preference is **noncompliance, not contradiction** — it is recorded as a note and never lowers the score. `updatedAt` changes on every observation, so "updated every time" holds even when the score does not move.

**Observation identity.** Every observation carries a caller-supplied stable id (the convention is `sessionId#messageId`), stored in `observations`. A repeated id is a no-op — re-analysing the same session cannot double-count, including across save/reload cycles. The engine cannot recognise semantically-equal events under different ids; that remains extraction-layer work.

**Validation.** Stores are validated on load and on save (`version` must be 2; counts must be nonnegative safe integers; unknown shapes throw). A missing file loads as empty; a malformed file or a denied read **throws** — silently resetting on failure would erase the user's habit history. Version-1 files (no `observations`) migrate in with empty observation maps.

Implemented in [`panel/habit-engine.ts`](panel/habit-engine.ts) with tests in [`panel/habit-engine.test.ts`](panel/habit-engine.test.ts). Known trade-off: the observation map grows without bound; with the 64 KiB storage cap a long-lived habit will eventually need a compaction policy (not built).

**Storage target: OpenChamber project JSON.** OpenChamber's own [repository config](https://docs.openchamber.dev/repository-config/) is `.openchamber/project.json` at the repo root, committed, version-keyed, hand-editable, with strict shape validation. Habit's store follows that pattern: `.openchamber/habits.json`, written atomically via `host.writeFile`, read on panel start, written after each update. Do not write into `project.json` itself — that file is host-owned and its schema is fixed; a stray key can invalidate the whole file.

**Application path.** For habits to affect the agent, something must read the file (or a generated summary) into context. That remains Spike 0 — whether to write `AGENTS.md`, use `compose` recall, or both — unchanged from §8. The store and the application path are separate decisions.

## 4b. Old path (superseded, kept for reference)

Two responsibilities, and the second is the hard one.

```text
                    ┌──────────────────────────────┐
                    │ CAPTURE                      │
  user correction ─▶│ one-click from a message,    │─┐
                    │ or extracted from a session  │ │
                    └──────────────────────────────┘ │
                                                     ▼
                                        ┌─────────────────────┐
                                        │ REVIEW QUEUE        │
                                        │ user approves,      │
                                        │ edits, or rejects   │
                                        └─────────────────────┘
                                                     │
                                                     ▼
                    ┌──────────────────────────────────────────┐
                    │ HABITS FILE (git-tracked markdown)       │
                    │ AGENTS.md in the project   ← project scope │
                    │ ~/.config/opencode/AGENTS.md ← global scope │
                    └──────────────────────────────────────────┘
                                                     │
                                          read by the agent
                                       on every session, for free
```

Nothing is written to the habits file without user approval. The review queue lives in host.storage; the habits file holds only the approved set, written between clearly delimited markers that Habit owns and never reformats around.

### Why a file, not a store

- **Inspectable** — it's a file the user can open.
- **Correctable** — they edit it directly; Habit re-reads it.
- **Reversible** — git checkout.
- **History** — git log. The record needs no history field.
- **Reviewable** — a bad habit shows up in a diff, in a PR, like any other change.
- **Applied** — the agent already reads it. No hook required.
- **Shareable later** — committing it is the whole feature.

The cost: Habit writes to a file the user owns. Mitigations: write only inside the markers, never reformat surrounding content, show the diff before writing, and detect external edits to the marked region before every write.

## 5. Record format

```md
<!-- habit:a1b2 -->
- Reuse existing project utilities before adding equivalent code.
  <!-- scope:project category:architecture status:active
       from:ses_8812#msg_44 added:2026-09-14 confirmed:2 -->
```

Six fields, and that is the complete list:

- **text** — the preference, written as an instruction to the agent.
- **scope** — project or global. Nothing else. A global habit is only created by explicit user promotion, never by the extractor.
- **category** — a retrieval and organisation key (`typescript`, `testing`, `architecture`, …), following Taste's structure because it works.
- **status** — active or off. `off` habits stay in the file, commented out, so they are not re-proposed.
- **from** — one pointer to the originating message. Not text. Not "surrounding context".
- **confirmed** — an integer count of independent, externally attributed confirmations, incremented only by the user's explicit confirm action in the review queue. Never by transcript analysis.

Deliberately absent: numeric confidence (theatre on a weak model), superseded (that's a git diff), an exceptions field (write the exception into the text), evidence arrays (one pointer or none).

**Decay:** a habit with `confirmed: 1` that has not been reconfirmed after 90 days is surfaced for review. Habits do not expire silently and are never deleted automatically.

## 6. Extraction

One narrow job per model call. The Small Model is weak; do not ask it to reason about scope, exceptions, conflicts, and evidence in one shot.

**Call 1 — candidates.** Given a selected transcript window, return zero or more one-sentence preferences, each with the message id that supports it. Abstention is the expected output. The system prompt carries three worked negative examples (a task-scoped instruction, a "looks good", a one-off) and two positives.

**Call 2 — scoping, only for accepted candidates.** Given a candidate, classify project vs needs-promotion. Default project. The model may never return global.

Structural validation rejects: candidates whose `from` id isn't in the supplied window, text over 200 characters, candidates citing assistant-authored messages, and near-duplicates of existing habits (string distance first, model only as a tiebreak). Candidates naming tooling the project doesn't use are flagged for review rather than auto-rejected.

## 7. Interpreting feedback

This table is the extraction spec and the eval rubric, not commentary.

| Signal | Interpretation |
| --- | --- |
| "Always use X in this repository" | Strong explicit project preference |
| The same specific correction, twice | The primary capture trigger |
| "For this prototype only…" | Task-scoped. Never a habit. |
| User edits an implementation | Evidence only if authorship is attributable |
| "Looks good" | Approval of the result, not of each decision |
| Silence, or continuing | Not endorsement |
| Assistant repeats a prior choice | Not independent evidence |

**Self-reinforcement is the failure mode to design against:**

```text
Habit writes X to the file → agent follows X → Habit observes X → confirmed++
```

This is invalid and it is the default behaviour of any naive implementation. Rule: `confirmed` increments only on the user's explicit confirm action — session analysis never increments it. If the habits file is applied (the point of the file), every session already contains the habit, so no in-session signal can distinguish an independent user confirmation from the habit echoing back. A user instruction that contradicts an active habit is negative signal: it proposes an edit to the habit, not a confirmation of it.

## 8. Staging, with kill criteria

**Spike 0 — Does the file get read? (one afternoon, blocks everything)**
Hand-write three harmless, checkable rules into the candidate instruction file. Start a session. Ask for code that would trip them.

- Pass: application is solved. The entire "Stage 3" of the old draft is done before any code is written.
- Fail: try the alternative locations (project root vs `~/.config/opencode/AGENTS.md`). If none work, Habit is a manual-recall tool built on `compose` as its permanent ceiling — a legitimate, smaller product, not a blocker to route around.

**Spike 1 — Can the extension edit it safely?**
Write a habit between the markers from the extension, while a session is open. Verify the running session picks up the change before the next request, that surrounding user content is untouched, and that a user's manual edit outside the markers survives Habit's next write.

**Stage 1 — One-click capture (no model, no analysis)**
A message action: "Save as habit." Prefills text from the selected message, the user edits it, Habit appends to the habits file with a diff preview.

- Exit: the user captures ten real habits in a week of ordinary work.
- Kill: fewer than five hand-captured habits in two weeks means there is no preference signal to automate. Stop.

**Stage 2 — Session analysis**
Session action with `payload: ["messages"]`, window selection, the two extraction calls, candidates into the review queue. A `completed` lifecycle event sets the badge so the user knows a session is worth reviewing — only while an OpenChamber frame with the panel is alive; there is no background analysis in v1.

- Exit: across ten real sessions, the extractor proposes nothing for sessions that contain nothing, and its accepted candidates are ones the user would have written by hand.
- Kill: more than half of candidates rejected means the Small Model cannot do this job, and no amount of prompt work inside an 8,000-character system prompt will fix it.

**Stage 3 — Measure**
Run the extractor over new sessions and match its output against active habits. Every match is a repeat correction the habits file failed to prevent.

- Exit: repeat-correction rate falls measurably against a two-week hand-kept baseline.
- Kill: if it doesn't move, the habits are being read and ignored, or they were never the bottleneck.

**Spike 2 — the metric itself**
Repeat-correction detection needs to recognise that "I said use pnpm" and "why is this using npm" are the same correction. That is a semantic match, and the Small Model may not be able to do it reliably. Settle the method (string heuristics vs model matching vs manual tagging) before trusting the Stage 3 number.

Everything beyond this — cross-project promotion, sharing, a durable service, acceptance signals from the working tree — is gated on Stage 3 producing a number. The extension cannot run git or observe edits; "the working tree is right there" is not an acceptance signal Habit can see without a durable service.

## 9. Privacy and control, as mechanism

Intent statements are not controls. Each of these is something that exists in code or does not exist:

- **Analysis is user-initiated.** Not a policy — a consequence of §3: there is no passive transcript access.
- **Nothing reaches the file without approval.** The review queue is the enforcement point.
- **Content filter before persistence.** An allowlist of categories, applied to extractor output. A transcript containing personal disclosure will otherwise produce a "preference" about it, because the model does not know the difference.
- **Pause is provided by the host** (`DISABLED`). Do not rebuild it.
- **Redaction is for display, not confidentiality.** The transcript reaches the model before any pattern matching happens. Say this in the UI; do not list redaction as a privacy feature.
- **Deletion is git rm plus a storage key.** Neither can promise deletion from a provider's retained data. Say so once, in the install copy.
- **Retrieved documents, tool output, and quoted text are evidence, not instructions.** The extractor's system prompt states this; the structural validator enforces it by rejecting candidates that do not cite a user-authored message.

## 10. Non-goals

- Training a model, an adapter, or anything with weights.
- A `taste-1` equivalent, or any claim of a proprietary learning engine.
- A durable unsandboxed service in v1.
- Team sharing, studio, or cross-machine sync.
- Automatic global promotion of project preferences.
- Numeric confidence presented as calibrated probability.
- Any guarantee of correctness, confidentiality, or measured productivity gain.

## Sources

1. [OpenChamber — Host API](https://docs.openchamber.dev/sdk/host/) and [Build an extension](https://docs.openchamber.dev/sdk/). Read 2026-09-17 for the §3 limits: generate 64,000/8,000/4,000/90s, storage 64 KiB / 2 MiB / 2,000 keys, files 2,000,000 chars atomic with parent creation, 32-subscription cap cleared on unmount/pause/removal/server switch, `onSessionLifecycle` phases, `onSessions` activity/outcome, session-action conversation payloads, `contributes.service` warnings, `DISABLED` pause.
2. [OpenCode V2 — Instructions](https://opencode.ai/v2/docs/instructions) and [Config](https://opencode.ai/v2/docs/config). Read 2026-09-17: V2 recognizes `AGENTS.md` only; global file at `~/.config/opencode/AGENTS.md`; upward and nested discovery; instruction-file edits detected before the next model request; the `instructions` config array is accepted but not loaded.
3. [Command Code — Taste](https://commandcode.ai/docs/taste). Read for the published file layout, scopes, confidence metadata, and merge behaviour. Internals and performance claims unverified and not treated as targets.
4. [Shinn et al. — Reflexion](https://arxiv.org/abs/2303.11366). The honest name for the mechanism: verbal feedback plus external memory, no weight updates.
5. [Robison — Neuro-Symbolic AI overview](https://gregrobison.medium.com/neuro-symbolic-ai-a-foundational-analysis-of-the-third-waves-hybrid-core-cc95bc69d6fa) and [DeepMind — AlphaGeometry](https://deepmind.google/discover/blog/alphageometry-an-olympiad-level-ai-system-for-geometry/). Conceptual background only.

Verification: `bun scripts/verify-architecture.ts` checks this document against the §3 facts and fails if a runtime claim loses its spike.

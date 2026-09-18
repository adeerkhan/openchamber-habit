# Habit subagent — implementation guide for Vitruvius

**Status:** guide only. Nothing in this document is implemented in Vitruvius yet.
Written 2026-09-18 against Vitruvius `0.1.0` (repo: `adeerkhan/vitruvius`).
The prompt/style below is modelled on the Caveman reference in
`openchamber-habit/ref/caveman` (`agents/cavecrew-*.md`, `rewriter/prompt.go`,
`skills/caveman-compress/SKILL.md`). Text is original; structure is borrowed.

## 0. What you will add

| Action | Path |
| --- | --- |
| Add | `agents/habit.md` — canonical read-only role |
| Add | `.opencode/agent/habit.md` — thin OpenCode adapter |
| Add | `skills/habit/SKILL.md` — invocation surface + validation |
| Add | `tests/habit/test-habit.mjs` — structural contract test |
| Edit | `scripts/command-contract.mjs` — register `/habit`, then regenerate adapters |
| Edit | `tests/agents/test-agents.mjs` — add `habit` to `ROLES` (and judge bounds) |
| Edit | `package.json` — add `test:habit` and include it in `test` |
| Edit | `AGENTS.md` — add `habit` to the research-subagents list |
| Edit | `README.md` — add the skill row; bump the "24 skills" count |
| Bump | `skills/habit/SKILL.md` `metadata.version`, and `package.json` + `.claude-plugin/plugin.json` versions together |

Nothing here writes `AGENTS.md` automatically. The role proposes; a human
reviews; the lead applies. That boundary is the point of the whole design.

## 1. F1 feature-scope justification (do this first)

Vitruvius' `AGENTS.md` says every new capability must fight for its life. The
honest case for `habit`:

1. **Core research job:** *"Improving provenance, verification, or reliability
   of the research loop."* Durable capture of how a team wants research done
   (evidence thresholds, citation form, units, review rigor) reduces repeated
   corrections and makes runs more reproducible.
2. **Can an existing skill do it with a parameter change?** No. No current
   skill reads a run for standing preferences.
3. **All disciplines or domain-specific?** Discipline-neutral; applies to
   mechanical, software, civil, electrical, architectural equally.
4. **Maintenance cost:** one role, one skill, one test, one README row.
5. **Testable?** Yes — a structural contract test (Section 8).

If a reviewer rejects (1) as too indirect, the correct outcome is to reject the
proposal, not to argue. Do not merge this on the strength of the prompt alone.

## 2. Architecture

```mermaid
flowchart LR
    Lead["Lead agent (research run)"] -->|brief: transcript window + ids + SHA-256| Habit["agents/habit.md (read-only)"]
    Habit -->|{"c":[...]} compact candidates| Lead
    Lead --> Review["User review"]
    Review -->|approved| Ledger["outputs/.habits/&lt;slug&gt;.json"]
    Ledger -->|import| Ext["Habit extension (OpenChamber)"]
    Ext -->|preview + approve| AgentsMd["project AGENTS.md habit block"]
    AgentsMd --> Lead
```

Key properties, copied from Caveman's subagent design:

- The subagent runs **inside the harness**, so it already has the conversation
  and tools. That is why this works and why a sandboxed OpenChamber extension
  cannot do it alone.
- The subagent is **read-only**. It never edits `AGENTS.md`, never writes the
  Habit store, never auto-applies. Application stays behind Habit's preview and
  approval gate.
- Output is **compact** and uses the same schema the Habit extension already
  parses, so the bridge is an import, not a translation.

## 3. Canonical role — `agents/habit.md`

Paste this file. It follows Vitruvius' agent contract (INVALID-DISPATCH,
terminal, read-only bounds) and the Caveman register (Job → Input → Drop →
Output → Abstain).

````markdown
---
name: habit
role: Durable research-preference extraction (read-only, abstention-first)
tools: [Read, Grep, Glob, Bash]
tool-restrictions: NO Write, NO Edit — the habit role proposes; it never edits AGENTS.md or any store
reports-to: lead agent
---

# Habit Role

Caveman-ultra. Findings only. Drop articles, filler, hedging. Code, units,
standard numbers, identifiers exact. No preamble, no narration.

## Job

Read one research-run window. Extract durable user preferences about HOW
research is done here — rules the user wants applied to future, unrelated runs.
Do not research. Do not advise. Do not edit.

## Dispatch contract

- You receive ONLY: the run transcript window (each user turn tagged with a
  stable id) and the declared scope. Not the author's reasoning.
- **Activation:** act only on a brief. Approached without one → reply
  `INVALID-DISPATCH` and stop.
- **Mission pointer:** a file brief identifies the transcript by path + SHA-256
  + byte length; verify with `sha256sum <path>` and `wc -c <path>` (you have
  Bash). Mismatch or missing pointer → reply `INVALID-BRIEF` and stop.
- **Terminal:** no subagents; never re-dispatch.
- Return the machine block below, ≤120 words of prose.

## Input

Turns oldest to newest, each `[id: <id>] <role>:`. Only user turns are
evidence. Assistant turns are context, never evidence.

## Drop — never propose

- task-scoped instruction: "check AISC J3", "use the 2022 edition for this run"
- engineering facts, values, or code provisions the user states — data, not
  preference
- praise, acknowledgement, silence: "thanks", "looks good"
- the assistant's own choices, suggestions, summaries
- secrets, tokens, credentials, personal data, verbatim quotes
- implied rules; require an explicit user statement
- a preference already proposed in this same answer

## Keep — durable research preferences

- evidence thresholds and rigor: "require two independent sources", "no vendor
  docs as Tier 1"
- citation, notation, units: "cite section numbers", "SI units, mm and kN"
- output structure: "always a provenance sidecar", "dossier before chat summary"
- review and verification expectations: "blind verify before delivery"
- tooling and source conventions: "use OpenAlex, not Scholar"
- communication style expected of research outputs

## Output — JSON only, no prose, no fences

{"c":[{"t":"<imperative rule, <=200 chars>","d":"<specifics, <=400 chars, else empty>","e":["<user-turn id>"]}]}

- `e`: 1–3 user-turn ids from the window, copied exactly. Never invent an id.
  Never cite an assistant turn.
- One strong candidate beats three weak. Fewer is better.

## Abstain

Most windows hold no durable preference. Then output exactly {"c":[]}. Empty is
the correct, common, final answer. A guessed or padded list is wrong. A
preference stated once is enough. If the user reversed a rule later, emit only
the final form, or nothing when unclear.

## Refusals (terminal lines)

No brief → `INVALID-DISPATCH.`
Brief pointer mismatch → `INVALID-BRIEF.`
Asked to edit or apply → `Read-only. Lead applies after user review.`
Asked to research → `Not a researcher. Spawn researcher.`

## Auto-clarity

Security warning or destructive path → plain English first sentence, then
resume caveman.
````

## 4. OpenCode adapter — `.opencode/agent/habit.md`

Thin copy, matching the existing adapters. The contract test requires it to
contain the literal `agents/habit.md`.

````markdown
---
description: Vitruvius habit role (durable research-preference extraction). Canonical definition: agents/habit.md - Read it and follow it exactly.
mode: subagent
tools:
---

1. Read the file `agents/habit.md` from the repo root and follow it exactly.
2. If that file is missing, refuse the task and report BLOCKED: role definition agents/habit.md not found - do not improvise the role.
````

## 5. Skill — `skills/habit/SKILL.md`

The skill is the invocation surface. It builds the brief, dispatches the
read-only role, validates candidates, and presents them for review. It never
applies anything.

````markdown
---
name: habit
description: >
  Extract durable user research preferences from a run and propose compact
  habit candidates for review. Use when the user invokes /habit, asks "what
  should you remember about how I work", or asks to capture standing research
  conventions. Dispatches the read-only habit subagent. Do NOT use for domain
  facts, task-scoped instructions, or producing research output.
argument-hint: "[--scope <discipline>] [--window <n>]"
allowed-tools: Read Write Bash
license: MIT
metadata:
  version: "0.1.0"
---

# Habit

Capture standing research preferences. Propose; never apply.

## Workflow

```mermaid
flowchart LR
    Window["Run window"] --> Brief["Brief: ids + path + SHA-256"]
    Brief --> Habit["agents/habit.md"]
    Habit --> Validate["Validate candidates"]
    Validate --> Review["User review"]
    Review --> Ledger["outputs/.habits/&lt;slug&gt;.json"]
```

## Invocation

```
/habit [--scope <discipline>] [--window <n>]
```

- **--scope**: discipline label for the candidates' provenance. Optional.
- **--window**: how many recent user turns to include. Default 40.

## Method (execute this)

1. Build the brief: the selected transcript window, each user turn tagged with
   a stable id, plus `path`, `SHA-256`, and byte length of the brief file.
   Write it under `outputs/.habits/<slug>-brief.md`.
2. Dispatch `agents/habit.md` with the brief. File-based handoff; do not paste
   the transcript into the parent context.
3. Validate every candidate against the window:
   - shape: `{c:[{t,d,e}]}`
   - `t` 1–200 chars, `d` ≤400 chars
   - every `e` id exists **in the supplied window** and is a **user** turn
   - reject the candidate otherwise; reject duplicates
   - redact recognized secret patterns
4. Present one line per candidate: `- <t> — <d> [e: id, id]`.
5. On user approval, write a ledger to `outputs/.habits/<slug>.json` with a
   provenance sidecar. The ledger MUST embed the analyzed transcript window so
   Habit can validate evidence; see the Ledger format section. Do **not** write
   AGENTS.md here.

## Ledger format

```json
{
  "version": 1,
  "run": "<slug>",
  "scope": "<discipline>",
  "window": [
    { "id": "u1", "role": "user", "text": "…", "createdAt": 0 },
    { "id": "a1", "role": "assistant", "text": "…", "createdAt": 0 }
  ],
  "c": [{ "t": "…", "d": "…", "e": ["u1"] }]
}
```

`version` must be `1`; Habit rejects unknown versions. `window` must contain
every turn the `e` ids reference. A ledger without a window is rejected.

## Quality gate (mandatory before returning)

1. Zero candidates is a valid, expected result. Do not pad.
2. Any candidate citing an id outside the window → rejected, not repaired.
3. No assistant turn is ever evidence.
4. Approved output is a ledger file, never an AGENTS.md write.

## Scope and boundaries

- Research-only, not for final engineering sign-off.
- Read-only dispatch: the habit role proposes, a human reviews, the lead applies.
- Never fabricate a preference; abstain instead. See
  `references/evidence-quality-tiers.md` for source-tiering vocabulary.
- Fail-closed: a malformed brief or an unreadable transcript is reported, not
  guessed at.
````

## 6. Register the command

Add to `scripts/command-contract.mjs` under the `workflow` category:

```js
{
  name: "habit",
  description: "Capture durable research preferences from a run (read-only, review-gated)",
  argumentHint: "[--scope <discipline>] [--window <n>]",
  category: "workflow",
},
```

Then regenerate host adapters:

```sh
node scripts/generate-adapters.mjs
```

This writes `.opencode/command/habit.md`, `.cursor/commands/habit.md`,
`.claude/commands/habit.md`, `.codex/commands/habit.md`, and updates
`.commandcode/mods/vitruvius.ts`. Commit the generated files.

## 7. Wire into the research loop

In `skills/engineering-research/SKILL.md`, the loop ends at **Step 7: Deliver**
with its mandatory GOAL-CHECK gate. Add an **optional** `Step 7.5 — Capture`
after that gate:

> **Step 7.5 — Capture (optional, `--capture`)**: dispatch `agents/habit.md`
> over the run window to propose standing research preferences. Review-gated;
> no auto-apply. Skip when the flag is absent so the default loop stays lean.

Do not run habit on every turn. The cost is real and most turns carry no
durable preference; run it at the end of a run, or on explicit `/habit`.

## 8. Tests

### 8a. `tests/habit/test-habit.mjs`

Structure-plus-contract test, modelled on `tests/agents/test-agents.mjs`. Assert:

- `agents/habit.md` exists and contains `INVALID-DISPATCH`, `INVALID-BRIEF`,
  `/terminal/i` + `/do not spawn|never re-dispatch/i`, and `NO Write, NO Edit`.
- The role declares the compact schema `"c"`, `"t"`, `"d"`, `"e"` and the exact
  abstention literal `{"c":[]}`.
- The drop list names the assistant-as-evidence exclusion and task-scoped
  instructions.
- `.opencode/agent/habit.md` exists and includes `agents/habit.md`.
- `skills/habit/SKILL.md` has `name: habit` and `metadata.version`.
- Exit 1 on any failure; print a `PASS`/`FAIL` line per check.

### 8b. Mandatory edit — `tests/agents/test-agents.mjs`

The adapter check is exact: `foundAdapters` must equal
`ROLES.map(r => r + ".md")`. If you add `agents/habit.md` without adding
`habit` to `ROLES`, `npm test` **fails** with an adapter-set mismatch.

```js
const ROLES = ["researcher", "writer", "verifier", "reviewer", "arbiter", "goal-checker", "habit"];
```

Because the role is read-only, also add it to `judgeToolBounds` (which requires
the SHA-256 mission pointer and `INVALID-BRIEF`, both already in the role):

```js
const judgeToolBounds = {
  verifier: /NO Write, NO Edit/i,
  reviewer: /NO Write, NO Edit/i,
  arbiter: /NO Write, NO Edit/i,
  "goal-checker": /NO Write, NO Edit/i,
  habit: /NO Write, NO Edit/i,
};
```

### 8c. package.json

Add the script and include it in the chain:

```json
"test:habit": "node tests/habit/test-habit.mjs",
```

Append `&& node tests/habit/test-habit.mjs` to the `test` script.

## 9. Docs and version sync

- `AGENTS.md`: add `- habit - durable research-preference extraction` to the
  **Research subagents** list, and include `agents/habit.md` in the
  "source of truth" sentence.
- `README.md`: add a row to the **Research Workflow Skills** table. Update the
  header badge and the "24 skills" strings to **25**.
- Bump `metadata.version` in `skills/habit/SKILL.md` on any later behavioral
  change (AGENTS.md N7).
- `package.json` `version` and `.claude-plugin/plugin.json` `version` must match
  (`validate-contract.mjs` fails the build if they drift). Bump both together.

## 10. The bridge to the Habit extension

The compact schema and the embedded window are not incidental. Habit's import
path reads the ledger, validates every candidate against the ledger's own
`window` (id exists in it, role is `user`), and stages the survivors in a
project-scoped review queue. Two ways to connect, both shipped in Habit 0.2:

1. **`/habit-import <relative path>`** — reads the ledger from the open project
   (the existing `files` capability; no new permission).
2. **Paste** — the panel has an "Import from Vitruvius" box for a ledger from
   elsewhere.

Re-importing the same ledger text is a no-op (content fingerprint), and a
candidate whose title already matches a staged or kept habit is skipped.

What **not** to do: have the Vitruvius role write `AGENTS.md` directly. That
bypasses Habit's review and secret checks and reintroduces exactly the silent
auto-apply the Habit architecture forbids.

## 11. Token/compression contract

Why the prompt is shaped this way (from the Caveman reference):

- **Job → Input → Drop → Output → Abstain.** Rules beat prose; the model
  follows a checklist more reliably than a paragraph. The `rewriter/prompt.go`
  four-part framing is the same pattern.
- **Compact wire keys `c/t/d/e`.** Cuts output tokens roughly in half versus
  `candidates/title/detail/evidence`, with no loss of meaning.
- **Explicit empty answer `{"c":[]}`.** Abstention must be a first-class,
  expected outcome, or the model pads the list to look useful. This mirrors
  Caveman's "when nothing can be safely condensed, return it unchanged. That is
  a correct answer."
- **Terse register, fragments, no preamble.** Drop articles, filler, and
  hedging; keep technical terms, units, standard numbers, and identifiers
  exact. Never invent abbreviations: a tokenizer splits `cfg` the same as
  `config`, so the abbreviation saves nothing and reads worse.
- **Preserve, never mangle, what matters.** Citation ids, section numbers,
  units, and symbols are copied character-for-character. A lossy rewrite of an
  identifier is worse than a longer prompt.

## 12. Acceptance checklist

Before you call it done:

- [ ] `npm run test:contract` passes (skill frontmatter, ≤500 lines, links resolve).
- [ ] `npm run test:habit` passes.
- [ ] `node tests/agents/test-agents.mjs` passes (adapter set matches `ROLES`).
- [ ] `npm test` passes end to end.
- [ ] `node scripts/generate-adapters.mjs` output committed.
- [ ] `README.md` count and table updated; `AGENTS.md` role list updated.
- [ ] `package.json` and `.claude-plugin/plugin.json` versions match.
- [ ] A dry run on a real run window: task-scoped and domain-fact turns produce
      `{"c":[]}`; one real standing preference produces one candidate citing a
      user turn.
- [ ] No path in this feature writes `AGENTS.md`.

## 13. Non-goals and risks

- **Not automatic.** The role runs when dispatched, not on every turn. Running
  it on every turn would burn tokens and mostly abstain.
- **Not an applier.** It must never write `AGENTS.md`. Application is Habit's
  preview-and-approve path.
- **Not a researcher.** It reads the run; it does not add engineering evidence.
- **Miss risk.** A conservative role can miss unusually phrased preferences.
  Record misses and false positives the way the Habit architecture requires
  before trusting it.
- **Evidence integrity.** A user-role pointer alone does not prove a quoted
  string is the user's own preference. Quotations and tool output are data.

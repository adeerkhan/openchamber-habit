# Habit architecture

Reconciled 2026-09-17 against local HEAD and the remote branch: both are `725a7e19af541e1d1b44e34405f848a8f901b8d8` (`fix(habit): align permissions and remove dead engine`). `git ls-remote origin refs/heads/master` confirmed the remote hash. That pushed commit fixes the manifest and deletes the standalone engine, its tests, and the prose verifier; these are not merely intended changes. Existing installations still need to update and approve new permissions.

At this reconciliation, `git status --short` showed only this document modified and `outputs/` untracked. The architecture edits below remain local until separately committed/pushed. Planned features and experimental results are not implied by the pushed code.

## 1. Product goal and next decision

Habit should reduce repeated user corrections by retaining preferences **and making them available to the agent when needed**. Reliable storage alone does not establish product value.

The working capture-curate-insert slice is useful as manual memory. The next task is **Spike 0: test instruction application on a live OpenChamber/OpenCode pair**, before expanding extraction or migrating storage. If application cannot be demonstrated, keep Habit explicitly positioned as manual recall rather than claiming an automatic preference learner.

Learning here means updating external memory from attributable user evidence. There is no weight training, reinforcement-learning service, or always-running agent.

## 2. Implemented today versus target

| Area | Current working tree | Remaining work |
| --- | --- | --- |
| Capture | Form, `/remember`, message/session action prefill with source metadata | Reviewed session extraction |
| Storage | One `HabitMemory` shape in host extension storage for both project and global habits | Project JSON only after the application gate and explicit migration |
| Feedback | Confirmation/contradiction counts; no percentages, ranking score, or probability | Stable transcript evidence identities in the actual update path |
| Recall | Insert/Copy; user supplies the preference to the draft | Prove instruction loading, then implement an approved application path |
| Model/file calls | Permissions declared; no extraction or project-file calls | Runtime approval/error handling and end-to-end integration |
| Standalone engine | Removed with its tests | Do not recreate an isolated store with no user-facing caller |

`panel/main.ts` owns the panel and host interactions. `panel/habits.ts` owns the memory shape, parsing, keys, redaction, scope filtering, and formatting. `panel/main.js` is the checked-in installation bundle.

The deleted engine's deduplication and persistence checks are **requirements for future integration**, not current features. Its v1/v2 schema was never the panel's store and is not a migration contract. `scripts/verify-architecture.ts` was removed: matching words in prose did not verify permissions, runtime behavior, or experimental results.

## 3. Manifest is an executable prerequisite

Full `package.json`, copied directly from the file at pushed commit `725a7e1` (not a hand-written excerpt):

```json
{
  "name": "openchamber-habit",
  "version": "0.1.0",
  "private": true,
  "description": "Habit: keep what your agent should remember. Project and global memory for OpenChamber sessions.",
  "openchamber": {
    "apiVersion": 1,
    "engines": {
      "openchamber": ">=1.24.0"
    },
    "contributes": {
      "capabilities": ["model", "files"],
      "panel": {
        "id": "habit",
        "name": "Habit",
        "icon": "icon.svg",
        "entry": "panel/index.html"
      },
      "commands": [
        {
          "name": "remember",
          "description": "Keep this as a habit: /remember title | optional detail"
        },
        {
          "name": "forget",
          "description": "Forget a habit by id prefix or title"
        },
        {
          "name": "habits",
          "description": "Count the habits kept here"
        }
      ],
      "actions": [
        {
          "id": "remember-message",
          "label": "Remember as habit",
          "icon": "icon.svg",
          "where": "message"
        },
        {
          "id": "remember-session",
          "label": "Remember session as habit",
          "icon": "icon.svg",
          "where": "session",
          "payload": [
            "messages"
          ]
        }
      ]
    }
  },
  "scripts": {
    "build": "openchamber-guest-bundle panel/main.ts panel/main.js"
  },
  "dependencies": {
    "@openchamber/sdk": "1.24.0"
  }
}
```

This is a dated snapshot, not a second source of truth; `package.json` and its SDK-schema test remain authoritative.

- `model` permits `host.generate` after approval.
- `files` permits project-file reads/writes after approval.
- The session action's `payload: ["messages"]` requests conversation access.
- Existing installations must approve the additional permissions when updated. Declaration is not approval: denied or revoked access can still produce `NOT_GRANTED`.
- No `contributes.filesystem` patterns are declared. The extension is **not permitted to write global instruction files** merely because it has `files`.

`manifest.test.ts` validates the actual package through the installed SDK schema and asserts the permission list, host floor, SDK pin, and session payload. This is a local contract check, not proof that an installed host granted access. Raising the floor is an explicit support policy; matching SDK and host version numbers alone does not prove compatibility.

### Recorded SDK constraints

Earlier readings and installed SDK documentation recorded these limits; re-check them when integrating runtime calls:

| API boundary | Limit / behavior | Consequence |
| --- | --- | --- |
| `generate` | Prompt ≤ 64,000 chars; system ≤ 8,000 chars; output ≤ 4,000 tokens; 90s timeout | Bound the complete request and disclose omitted transcript content. |
| Model selection | User's configured Small Model | Do not assume quality or provider; handle unavailable-model and provider failures. |
| Host storage | ≤ 64 KiB/value; namespace ≤ 2 MiB / 2,000 keys | Evidence pointers rather than raw transcript retention; capacity is finite. |
| Project file writes | Atomic replacement, ≤ 2,000,000 chars | Atomic writes prevent partial replacement, not lost concurrent updates. |
| Session events | Timing/activity without passive transcript access | Analysis must be user-initiated. |
| Panel | Subscriptions limited to 32/frame, cleared across lifecycle boundaries | Not a durable worker. |

## 4. Spike 0 — prove application before expansion

**Status: not run.** The previous desktop-browser connection was unavailable. A headless browser with a simulated host proved panel behavior only. Neither that result nor a paragraph about instruction loading is a substitute for this experiment.

Use a disposable project and real model sessions. Record host/OpenCode versions, model, paths, prompts, outputs, and outcomes. Do not repeat the rules in the task prompt: that would test prompt-following rather than file loading.

1. Run a baseline task without test rules.
2. Place three harmless, mechanically checkable rules in the test project's `AGENTS.md`—for example, use a distinctive function name, a specified string-literal style, and a required test-case name. Use a task where all three apply.
3. Run the same task in fresh sessions. Record compliance with each rule, not just an overall impression.
4. Separately test `~/.config/opencode/AGENTS.md` with no project test rules present, preserving any existing content. This is an operator-controlled experiment, **not an extension write enabled by the current manifest**. Limit its duration and avoid unrelated concurrent sessions.
5. Change one rule before a subsequent request to distinguish fresh-session loading from edit detection. Use a fresh-session comparison if prior conversation context could explain the result.
6. Restore original files byte-for-byte; remove only files created by the experiment. If someone edited a file during the test, preserve that work and reconcile rather than blindly restoring a backup.

**Scoring fixed before execution:** freeze the task prompt, three rules, and exact checks before viewing outputs. Score each rule 0 or 1. A session passes only at **3/3**; 0/3, 1/3, and 2/3 are failures, not partial passes. Run three fresh sessions per tested location; fresh-loading passes only if all three sessions score 3/3. Run three separate mid-session edit trials; edit detection passes only if every trial follows the changed rule plus both unchanged rules (3/3). Report project/global and fresh-loading/edit-detection outcomes separately; do not average away a failed condition or retry until green.

Run three baseline sessions without the test rules. A rule followed in all baselines cannot demonstrate an instruction-file effect: mark that comparison inconclusive and redesign a separately recorded experiment, without relabeling the original. Infrastructure failures are blocked/inconclusive, never passes. A pass establishes feasibility for the tested configuration, not universal obedience.

**Fail or inconclusive:** retain manual recall; investigate the actual loader/model behavior before building an automatic-learning promise on it. Global success alone does not authorize shipping global writes. Prefer project-only application if it works.

Earlier OpenCode V2 readings reported `AGENTS.md` instruction loading and an `instructions` config field accepted but not loaded. Those are reasons to run this experiment, not reasons to skip it.

## 5. Feedback and evidence rules

The panel displays, for example, **1 confirmation · 0 contradictions**. An explicit instruction is not “67% likely” to be a preference. Counts do not gate retrieval, ordering, or validity, and repeated button clicks are not independent evidence of stronger belief.

Existing stored counts remain intact. Insert/Copy never add feedback. Text edits reset counts conservatively because the feedback referred to the previous text; the UI reports the reset.

For future session extraction, retain these semantics in the real update path:

| Attributed observation | Effect |
| --- | --- |
| User explicitly states or confirms a preference | Supporting evidence once per stable identity |
| User corrects assistant noncompliance while reaffirming the habit | Supporting evidence, not contradiction |
| User explicitly reverses or overrides the preference | Contradicting evidence; review interpretation |
| Assistant follows, repeats, or violates a preference | Weight 0; not independent user evidence |
| Duplicate observation identity | Complete no-op, including timestamps |
| Evidence about a disabled habit, if disabling is introduced | No reinforcement while disabled |

Changing a classification on replay must not make the same message new evidence. Assign identities in code, preserve them across reloads, and match existing habits before creating new ids. Do not count approval of imported evidence again as another independent confirmation. Historical manual-click counts cannot be retroactively mapped to transcript messages.

## 6. After Spike 0: one user-facing learning and application slice

The intended loop, conditional on proving a usable application path, is:

```text
User requests session analysis → selected window → Small Model
  → candidates citing user messages → validation → user review
  → existing memory/update path → approved preferences
  → tested application path → subsequent task behavior
```

Requirements:

- Default extracted candidates to project scope; no model-driven global promotion or second scoping call.
- Validate candidate shape, length, cited message existence, and the cited role from the supplied snapshot—not from the model's assertion.
- Treat quotations, tool results, and transcripts as data. A user-role pointer alone does not prove quoted text is the user's preference.
- Allow zero candidates. Task-scoped requests, generic praise, silence, and assistant choices are not automatically durable preferences.
- Review before persistence or instruction application. Rejection, malformed output, missing permission, timeout, and provider failure leave approved habits unchanged.
- Add evidence dedup and non-destructive IO checks where a real user action invokes them, not in a parallel engine.

Before the extension writes instruction files (**Spike 1**), require a preview and approval, preserve surrounding user content, detect external edits, and verify the next intended model request receives the change. Persisting a habit and applying it are separate outcomes; never report “applied” when only storage succeeded.

Instruction-file application is a bounded, approved integration after Spike 0—not a background writer. Insert/Copy remains available, but is not enough to pass the automatic-application acceptance gate.

## 7. Storage: one schema, explicit ownership

**Now:** host storage is authoritative for both scopes; `HabitMemory` is the only runtime shape. There is no JSON-file migration or dual-writing loop today.

**Later:** `.openchamber/habits.json` remains the intended project-file destination, but its schema and migration are implemented only with a caller. Never put Habit's records in host-owned `.openchamber/project.json`.

If project files are introduced while globals remain in host storage, that is explicitly **two physical backends**, with different limits and failure modes. It is acceptable only as a deliberate scope partition: one shared record schema/update contract and exactly one authoritative location for each habit. It is not a claim of having one physical store. Do not copy globals into every project or independently edit imported project records in both backends.

Migration must preserve ids, title/detail, full project identity, scope, source metadata, timestamps, and feedback counts. Validate both source and destination, show the import, write and read back before switching authority, and make repeated import idempotent. Retained legacy records are recovery copies, excluded from active reads/writes after cutover—not a second authoritative dataset.

Malformed files and denied reads must block writes rather than become empty stores. Validate counts and records at persistence boundaries. Dedup identities must not be silently pruned to fit capacity. The current panel lock is local to one frame; neither host storage nor atomic file replacement gives cross-frame compare-and-swap. Do not claim concurrent updates are solved.

## 8. Acceptance: usefulness and integrity

The learning/application milestone is not complete merely because data survives reload.

### Product gates

1. **Application:** an approved preference affects a subsequent applicable live task without manually pasting it. Record the configuration and result; loading a file alone is not sufficient.
2. **Abstention:** curated sessions with no durable preferences—including one-off requests, generic praise, and assistant-only choices—produce **zero candidates before human rejection**. Run this against the configured Small Model, not only a mocked JSON response. Record all runs and false positives.
3. **Positive extraction:** curated explicit preferences are proposed with valid user evidence; evaluate misses as well as false positives. An extractor that always returns nothing cannot pass.
4. **User benefit:** compare repeated corrections on comparable tasks before/after applying habits, starting with manual labels rather than a speculative semantic metric service. Record denominators, errors, and extra review effort. Do not infer productivity gains from passing fixtures.

### Integrity gates

- Approved habits survive reload; rejected suggestions and runtime failures do not change approved data.
- Re-analysis creates neither duplicate habits nor repeated evidence; independent supporting messages count once each.
- Assistant behavior never reinforces or contradicts the user's preference.
- Existing project/global memories retain all fields through any explicit migration.
- Manual feedback and imported observations use the same mutation path, preserving the source project across context switches.
- Missing files, corrupt stores, denied access, and stale external edits have distinct, non-destructive outcomes.

**Stop expanding** if application is unproven, negative sessions generate preferences, or review effort outweighs saved corrections. Diagnose the failing gate rather than reporting storage tests as product success.

## 9. Privacy and non-goals

No passive transcript analysis, durable unsandboxed service, git integration, model training, automatic global promotion, or team sync. No confidence percentages or claims of calibrated preference strength.

Analysis sends the selected content to the configured model. Pointer-only local evidence does not prevent provider retention. Capture's recognized-secret redaction is best-effort, not a confidentiality guarantee; users review text before saving. Avoid extracting sensitive personal traits as preferences.

**Before any project-file or instruction-file write, including Spike 1:** manual capture, extracted candidates, edits, and imports must share a final write-boundary secret check. Redact recognized secrets before truncation and serialization; show the sanitized text for approval, and invalidate approval if the text changes afterward. Do not write raw candidates/transcripts or secrets into JSON, generated instruction blocks, temporary files, diagnostic logs, or newly created recovery copies. Evidence remains pointers, not verbatim quotes. Block writes on validation failure; test the actual write path with synthetic secret fixtures and assert the secret bytes are absent from output. This control is required but not implemented for future file writes. Pattern matching cannot detect every secret: warn that project files may be synced or committed, and never claim redaction guarantees confidentiality.

Deletion currently removes a host-storage record. If file-backed habits or generated instruction blocks are introduced, deletion must clearly report whether the applied instruction was removed too. Neither local deletion nor uninstall promises removal from backups or provider-retained data.

## 10. Evidence and verification status

Most recent implementation check: **15 tests passed**, strict TypeScript passed, bundle rebuilt, and the simulated-host Edge harness passed. The reduction from 57 tests reflects removing 43 unused-engine tests and adding a manifest test; it is not equivalent coverage of an integrated learner.

- `manifest.test.ts` checks actual package declarations through the SDK schema.
- `panel/habits.test.ts` and `panel/main.test.ts` cover current memory/panel behavior.
- No live instruction-application, extraction-abstention, project-migration, or reduced-correction result has been established.
- The lexical architecture verifier has been deleted; there is no replacement prose gate.
- `outputs/.plans/habit-continuous-learning.md` still has an incomplete verification ledger. `habit-rewrite-audit.md` is an audit brief, not findings. Neither establishes Taste internals or runtime behavior.

Prior references, not newly verified by this documentation update: [OpenChamber Host API](https://docs.openchamber.dev/sdk/host/), installed SDK 1.24.0 documentation/schema, [OpenCode V2 instructions](https://opencode.ai/v2/docs/instructions), and [config](https://opencode.ai/v2/docs/config). [Taste](https://commandcode.ai/docs/taste) is observable product prior art; its private implementation is not a target. [Reflexion](https://arxiv.org/abs/2303.11366) is conceptual background for external-memory feedback, not proof of Habit's method or performance.

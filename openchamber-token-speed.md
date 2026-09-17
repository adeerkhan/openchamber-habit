# OpenChamber Token Speed Status Bar

## Goal

Add a very small token-usage indicator to the existing OpenChamber status bar:

```text
⚡ 48.7 tok/s     ↑ 128.4K     ↓ 4.8K
```

Where (Phase 1 locked semantics — last-assistant-message model):

- `48.7 tok/s` = live output throughput while OpenCode is generating
- `↑ 128.4K` = `tokens.input` of the **last assistant message** (context size at that call)
- `↓ 4.8K` = `tokens.output + tokens.reasoning` of the **last assistant message** (generated tokens this response)

Verified precedent: `packages/ui/src/stores/contextStore.ts` already derives its context reading from the last assistant message
(`extractTokensFromMessage(lastAssistantMessage)`, keyed by `lastMessageId`), and the context sidebar has a "Last Assistant Message"
section. Last-message semantics keeps every displayed number provider-accurate per call: summing `input` across the agent-loop steps of a
turn would double-count re-sent context, while per-message `output`/`reasoning` are always additive-safe to read (and summed for `↓`,
matching OpenCode's own `stats.ts` convention of `output + reasoning`). Cache `read`/`write` are stored but not shown in v1.

The UI should remain compact and behave like a native OpenChamber status-bar item. Do not add a right-rail panel for this feature.

---

## Verification status (2026-09-17, against `openchamber/openchamber@main` and `anomalyco/opencode@dev`)

Verified against the real repos via code search. Findings are inline below marked with `Verified:`.

- ✅ `AssistantMessage.tokens` shape, `message.part.delta` schema, `message.updated` payload — all match this doc exactly.
- ✅ Single-SSE pipeline (`packages/ui/src/lib/openchamberEvents.ts` → dispatch → `packages/ui/src/sync/event-reducer.ts`) and ephemeral-only `session-ui-store.ts` — both match.
- ⚠️ **No app-global status bar exists.** `StatusRow.tsx` is a floating assistant chip that must not be reused; `ComposerStatusBar.tsx` is the composer's own bar. Placement is a Step-1 decision, not a given.
- ⚠️ The reducer **silently drops `message.part.delta` when no parts array exists** for the message, and dedupes overlapping deltas. The TPS sampler must tap the raw event at dispatch level.
- ⚠️ Session IDs are **not unique across runtimes/directories** — scope keys must include directory/runtime, not just `sessionID + messageID`.
- ✅ Phase 1 locked: `contextStore.ts` already uses last-assistant-message semantics (`lastMessageId`-keyed); `↓ = output + reasoning` matches OpenCode `stats.ts`;
  `formatCompactNumber` + `—` + `tabular-nums` is the established formatting convention (`ModelControls`, `ContextUsageDisplay`, `SessionGoalDialog`).
  No parallel token accounting or formatter may be introduced.
- ✅ Phase 2 hardened: locked constants (`TPS_WINDOW_MS` 2000 / tick 150 / stale 500 / cap 1000), staleness decay, publish-on-change,
  primitive-only selectors, estimator/ingest NaN-Infinity guards; store trimmed to the single timestamp it needs (`lastTokenAt`).
- ✅ Phase 3 mapped: exact `packages/ui` gates (`type-check`, `lint`, `test`, `build` via bun 1.4.2), colocated `token-speed.test.ts` (bun:test,
  isolated runner), and an acceptance→test coverage map. Every acceptance bullet traces to a test case except the architectural ones,
  which are review-verified.
- ✅ Implemented (openchamber@0667e73, shallow clone at `../openchamber`): `lib/token-speed.ts` + 11 tests, `stores/token-speed-store.ts` + 15 tests
  (26 green), one `ingest()` call in `handleEvent`, `<TokenSpeedItem>` left slot in `ComposerStatusBar`. `type-check` + `eslint` green;
  full `packages/ui` suite result pending. No i18n changes (`tok/s` hardcoded as a unit, `arrow-up/down` + `⚡` glyphs, 12-locale parity untouched).

---

## Important architectural finding

OpenCode already exposes the data needed for the feature, but not as one precomputed `tokensPerSecond` value.

### Authoritative token counts

OpenCode `AssistantMessage` contains:

```ts
{
  role: "assistant",
  tokens: {
    input: number,
    output: number,
    reasoning: number,
    cache: {
      read: number,
      write: number,
    },
  },
}
```

The current OpenCode SDK-generated types expose these fields on assistant messages.

### Live streaming events

OpenCode emits streaming events including:

```text
message.updated
message.part.updated
message.part.delta
session.status
```

`message.part.delta` contains the incremental streamed text:

```ts
{
  type: "message.part.delta",
  properties: {
    sessionID: string,
    messageID: string,
    partID: string,
    field: string,
    delta: string,
  },
}
```

Therefore:

- input/output counts should come from OpenCode's authoritative `AssistantMessage.tokens`
- live TPS must be derived from the stream timing and deltas
- do not read the OpenCode SQLite database
- do not spawn an OpenCode plugin or separate process for this feature
- do not duplicate token accounting in the UI

OpenChamber already consumes the relevant OpenCode events in its sync/event pipeline.

---

## Important OpenChamber SDK limitation

The current public OpenChamber extension SDK is designed around sandboxed rail/page extensions. Its documented capabilities cover sessions, prompts, files, models, integrations, services, conversation payloads, etc.; it does not currently document a `statusBar` contribution point or a token-stream subscription.

Therefore this feature should be implemented in the OpenChamber core UI/status-bar layer first.

Do **not** try to build this as a normal right-rail SDK extension and then inject DOM into the status bar. That would be brittle and contrary to the extension architecture.

If a reusable extension API is desired later, expose a small status-bar contribution API from OpenChamber. That is a separate API-design task and should not be required for the initial implementation.

---

# Recommended implementation

## 1. Reuse the existing OpenChamber event pipeline

Verified: OpenChamber's `packages/ui/src/sync` layer already receives and reduces OpenCode session/message/part events.
The single SSE connection lives in `packages/ui/src/lib/openchamberEvents.ts` (`EventSource` to `/api/openchamber/events`, with reconnect);
directory events flow through the exported `handleEvent(rawDirectory, payload, …)` in `packages/ui/src/sync/sync-context.tsx`, which resolves
the directory and then calls `applyDirectoryEvent` from `packages/ui/src/sync/event-reducer.ts`.

As-built: the token sampler is fed by one `useTokenSpeedStore.getState().ingest(directory, payload)` call at the top of `handleEvent`,
after directory resolution and before reduction.

The current sync documentation identifies:

```text
session.status
message.updated
message.part.updated/removed/delta
```

as part of the session event pipeline.

The implementation should hook token metrics into this existing pipeline rather than creating a second SSE/WebSocket connection.

### Rule

There must be exactly one OpenCode event connection for this data path.

```text
OpenCode SSE/event stream (/api/openchamber/events, openchamberEvents.ts)
        |
        v
OpenChamber sync/event reducer (sync/event-reducer.ts, fed via handleEvent in sync-context.tsx)
        |
        +---- existing stores/UI
        |
        +---- token metrics store (ingest() call in handleEvent, see §4)
                    |
                    v
              Status Bar (placement TBD, see §9/§14)
```

---

## 2. Add a small token metrics store

Create a dedicated store because token data changes at streaming frequency and should not be added to unrelated session/UI state.

Suggested shape:

```ts
interface TokenMetrics {
  sessionId: string | null
  messageId: string | null
  lastUserMessageId: string | null

  inputTokens: number
  outputTokens: number
  reasoningTokens: number

  cacheReadTokens: number
  cacheWriteTokens: number

  tokensPerSecond: number

  isStreaming: boolean

  lastTokenAt: number | null // drives TPS_STALE_MS decay (§5); the only timestamp the store needs
}
```

`lastUserMessageId` marks the turn boundary: a `message.updated` with `role: "user"` and a new id in the tracked session resets
the live TPS samples and re-anchors the tracked assistant message (see §3, §10).

Suggested defaults:

```ts
const EMPTY_TOKEN_METRICS: TokenMetrics = {
  sessionId: null,
  messageId: null,
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  tokensPerSecond: 0,
  isStreaming: false,
  lastTokenAt: null,
  lastUserMessageId: null,
}
```

Do not put this into `session-ui-store`.

Verified: `packages/ui/src/sync/session-ui-store.ts` declares itself "ephemeral UI state only" (selection, drafts, viewport anchors, preferences) and
states that domain data "lives in sync child stores". The sync architecture doc (`packages/ui/src/sync/DOCUMENTATION.md`) further directs consumers to
"subscribe to the selected session's records rather than broad message/part containers". A dedicated token store follows both rules: streaming-frequency
state with its own narrow subscriber set, separate from UI state and from the per-directory message/part buckets.

---

# 3. Track the active assistant message

On `message.updated`:

Verified: the event carries `properties.info: Message` (`UserMessage | AssistantMessage`) with `id`, `sessionID`, and — on assistant messages —
`tokens` exactly as used below (`packages/sdk/js/src/gen/types.gen.ts`, `AssistantMessage`).

```ts
if (info.role !== "assistant") return
```

Use the message as the authoritative source of token counts:

```ts
const tokens = info.tokens

set({
  sessionId: info.sessionID,
  messageId: info.id,
  inputTokens: tokens.input,
  outputTokens: tokens.output,
  reasoningTokens: tokens.reasoning,
  cacheReadTokens: tokens.cache.read,
  cacheWriteTokens: tokens.cache.write,
})
```

Important:

The message may be updated multiple times during generation. Always replace the displayed token totals with the newest authoritative values rather than incrementing them manually.
Clamp negative values to 0 at ingest (defensive; provider counts are never negative) and let NaN render as `—` per the §9 convention —
no ingest path may publish NaN or Infinity into the store.

This avoids double-counting when OpenCode sends repeated `message.updated` snapshots.

Turn boundary: on `message.updated` with `info.role === "user"` in the tracked session, record `lastUserMessageId = info.id`,
clear the rolling TPS samples, and drop the tracked assistant message (totals stay visible until the next assistant message arrives).
A new turn's first assistant message then re-anchors tracking. Within a turn, each newer assistant message replaces the tracked one —
this mirrors the existing `contextStore` convention (`lastMessageId`-keyed, last-assistant-message reading), so the two displays can never disagree.

---

# 4. Detect live generation from streaming events

On `message.part.delta`:

1. Make sure the event belongs to the current assistant message/session.
2. Ignore irrelevant fields.
3. Only use text-generating parts for the throughput calculation.

Count these part types:

```text
text
reasoning
```

Do not count:

```text
tool
patch
snapshot
file
subtask
agent
retry
compaction
stepstart
stepfinish
```

A delta is a chunk of text, not necessarily one token. Therefore **do not increment TPS by `+1` for every delta**.

Verified tap point: consume the raw `message.part.delta` event at dispatch level (`handleEvent` in `sync-context.tsx`, before `event-reducer.ts`).
The reducer silently drops a delta when no parts array exists yet for the message (`sync/debug.ts`: "silently dropped"), and applies overlapping deltas
with dedupe (`appendNonOverlappingDelta` in `event-reducer.ts`). Sampling reduced state would therefore lose early-stream deltas.

As-built part-type rule (strict): a `partID → type` map is fed from `message.part.updated` (which carries the full `Part` including `type`).
A delta is sampled only when its part type is known and is `text` or `reasoning`, and its `field` is `"text"` (the streamed field on both
`TextPart` and `ReasoningPart`; tool/file/patch parts never stream a `text` field). Deltas for unknown part types are skipped — correctness
(no inflation) over completeness for a display metric. In live streaming the `part.updated` creation always precedes token flow, so the skip
path only triggers on reconnect/bootstrap races.

---

# 5. Calculate live TPS

OpenCode does not currently provide a ready-made `tokensPerSecond` field.

Use a small rolling-window estimator in OpenChamber.

Locked constants (do not make these configurable in v1):

```ts
const TPS_WINDOW_MS = 2000        // rolling estimation window
const UI_UPDATE_INTERVAL_MS = 150 // display tick (§17)
const TPS_STALE_MS = 500          // no sample within this long → decay display to idle
const TPS_MAX_SAMPLES = 1000      // hard bound; a 2s window never legitimately holds this many
```

Store samples such as:

```ts
interface TpsSample {
  timestamp: number
  estimatedTokens: number
}
```

When a delta arrives:

```ts
const estimatedTokens = estimateTokens(delta)

samples.push({
  timestamp: performance.now(),
  estimatedTokens,
})
```

Drop samples older than the rolling window.

Then calculate:

```ts
const tokenCount = recent.reduce(
  (sum, sample) => sum + sample.estimatedTokens,
  0,
)

const elapsedSeconds =
  (recent[recent.length - 1].timestamp - recent[0].timestamp) / 1000

const tps = elapsedSeconds > 0
  ? tokenCount / elapsedSeconds
  : 0
```

Round for display:

```ts
const displayTps = Math.max(0, tps).toFixed(1)
```

Staleness decay: on each UI tick, if `now - lastTokenAt > TPS_STALE_MS`, treat TPS as 0 and render the idle `—` state (§10)
even before the completion events arrive. A stalled stream must never freeze a stale number on screen.

Publish-on-change: recompute the three display strings (`rate`, `input`, `output`) on tick and publish to the store only when at
least one differs from the current values. Combined with primitive selectors (§17), this is what keeps the status bar out of the
streaming hot path. Prune the sample buffer on every insert (drop older than `TPS_WINDOW_MS`) and enforce `TPS_MAX_SAMPLES` by
dropping oldest first — the buffer stays tiny and bounded by construction.

### Follow-ups, explicitly not in v1 (learned from pi-token-speed)

- **Buffered-flush bursts.** When a provider flushes many tokens under one timestamp, the current estimator reports 0 (no measurable span).
  A later revision may extend the span backward across the stall gap (with a 100ms minimum span clamp) so the reading reflects real
  throughput instead of a miracle spike or a zero.
- **Time-to-first-token.** Needs the user-message timestamp (turn start) plus first-sample time. The store deliberately dropped both
  timestamps in v1; reintroduce them only with a TTFT display to justify the state.
- **End-of-stream average.** v1 snaps to idle `—` on completion. An alternative keeps the turn's overall average
  (total estimated tokens / total elapsed) visible until the next turn starts.

---

# 6. Token estimation

Because a streaming delta is arbitrary text, it cannot be treated as one token.

For the initial implementation, keep the estimator lightweight:

```ts
function estimateTokens(text: unknown): number {
  if (typeof text !== "string" || text.length === 0) return 0
  if (!Number.isFinite(text.length)) return 0
  return Math.max(1, Math.round(text.length / 4))
}
```

Guards are locked: non-string and empty input yield 0 (never NaN), output is always a finite integer ≥ 0 for string input.
The estimator stays pure and dependency-free so `token-speed.ts` is unit-testable without React, Zustand, or the event pipeline.

This is only for **live TPS**.

The displayed input/output totals must continue to use OpenCode's authoritative `message.updated -> tokens` values.

Do not introduce a heavyweight tokenizer dependency for the first version.

The implementation should isolate the estimator behind a function so a model-specific tokenizer can be introduced later without changing the metrics/UI architecture.

---

# 7. Do not confuse TPS with final output token count

There are two separate metrics:

### Authoritative token totals

From OpenCode:

```text
inputTokens
outputTokens
reasoningTokens
cacheReadTokens
cacheWriteTokens
```

### Live throughput

Derived locally:

```text
estimated streamed tokens / elapsed streaming time
```

This distinction is important because the first is provider/API accounting while the second is a display metric.

---

# 8. What should `TPS` include?

For coding models, include both streamed text and reasoning parts in the live throughput estimate.

Conceptually:

```text
TPS = text generation + reasoning generation
```

The authoritative message totals already expose `output` and `reasoning` separately, so the UI can eventually show them in a tooltip if needed.

For the requested compact status bar, do not show reasoning separately yet.

### Displayed totals (locked)

- `↑` = `tokens.input` of the last assistant message.
- `↓` = `tokens.output + tokens.reasoning` of the last assistant message ("generated tokens").
- Cache `read`/`write` are stored in the metrics store but not rendered in v1; a later tooltip (styled after `ContextUsageDisplay`'s
  used/limit/cost tooltip) can break out reasoning vs output vs cache.

Verified precedent for combining: OpenCode's own `stats.ts` aggregates `(output || 0) + (reasoning || 0)` per message, and
`session-context-metrics.ts` totals `input + output + reasoning + cache.read + cache.write`. The status bar follows the same arithmetic,
scoped to the last message instead of the session.

---

# 9. Status bar display

Verified placement situation: OpenChamber has **no app-global status bar**. The similarly-named components are not it:
`packages/ui/src/components/chat/StatusRow.tsx` is a floating assistant-status chip that explicitly must not be shared,
and `packages/ui/src/components/chat/ComposerStatusBar.tsx` is the composer's own bar (pending changes, todos).
As-built placement (confirmed): left slot of the `ComposerStatusBar` row (`packages/ui/src/components/chat/ComposerStatusBar.tsx`),
rendered before the todos dropdown with `mr-auto`. `hasContent` now includes token tracking, so the bar appears for tokens alone —
previously it returned null without todos. Never injected DOM, never a reuse of `StatusRow`.

The final display should be exactly this style:

```text
⚡ 48.7 tok/s     ↑ 128.4K     ↓ 4.8K
```

Formatting convention (reuse, do not reinvent):

Verified: the codebase already formats token counts with a shared `formatCompactNumber` (`Intl.NumberFormat`, compact/short, max 1 fraction digit,
trailing `.0` stripped) plus `—` (U+2014) for unknown/NaN and `tabular-nums` for layout stability — see `ModelControls.tsx`,
`MobileSessionMetadata.tsx`, `ContextUsageDisplay.tsx` (`UNKNOWN_VALUE`), and `SessionGoalDialog.tsx` (`typography-meta ... tabular-nums`).
The token-speed item must reuse that exact pattern (import the shared helper if exported, otherwise follow the same lines) so `128400` renders
identically everywhere. Do NOT create a parallel K/M formatter with different rounding. Equivalent behavior reference:

```ts
function formatTokens(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`
  }

  return String(value)
}
```

Examples:

```text
0           -> 0
820         -> 820
4_812       -> 4.8K
128_400     -> 128.4K
1_240_000   -> 1.2M
```

---

# 10. Streaming state behavior

### While idle

Do not display stale live TPS as if generation were active.

Locked (matches the existing `ContextUsageDisplay` `UNKNOWN_VALUE = '—'` convention, so unknown reads identically across surfaces):

```text
⚡ — tok/s     ↑ 128.4K     ↓ 4.8K
```

or, if the existing status bar design favors a less visible inactive state, hide the TPS item when there is no active turn.

### While generating

```text
⚡ 48.7 tok/s     ↑ 128.4K     ↓ 4.8K
```

### Immediately after completion

Keep the final token counts:

```text
⚡ — tok/s     ↑ 128.4K     ↓ 4.8K
```

Do not continue increasing TPS after `session.status = idle` / completed message state.

### New assistant turn

Reset the live TPS samples when a new assistant response starts.

Do not carry the previous turn's samples into the new turn.

---

# 11. Current-session scoping

The status bar must show metrics for the **currently selected session**, not whichever session last emitted an OpenCode event.

This matters because OpenChamber can have multiple active sessions.

When the selected session changes:

```text
reset/display metrics for selected session
```

When an event arrives from another session:

```text
update its internal metrics if needed,
but do not change the visible status bar unless it is the selected session
```

Do not create a global "last event wins" implementation.

Verified: session IDs alone are not globally unique across runtimes or directories — the sync layer keys request/commit identity by
runtime + normalized directory + session ID (`packages/ui/src/sync/DOCUMENTATION.md`, "Session message loading"). Key the token store the same way
(directory + sessionID + messageID), and resolve "currently selected" from `session-ui-store.ts` selection state, so equal session IDs in different
worktrees cannot share metrics.

---

# 12. Multiple assistant messages / steps

OpenCode may produce multiple assistant-message updates during an agent turn.

The token store should identify the active assistant message using:

```text
directory + sessionID + messageID
```

When `message.updated` provides a newer assistant message for the active session, switch the tracked message identity and replace its authoritative token totals.
This is the same last-message-wins rule `contextStore` already applies (`lastMessageId`), so a turn with N assistant steps always shows step N's
authoritative counts — never a sum (which would double-count re-sent input context) and never a stale step.

The rolling TPS samples should represent the current streaming response, not accumulated samples from unrelated previous responses.

---

# 13. Avoid `session.status` as the token source

OpenCode's `SessionStatus` is only about lifecycle state:

```ts
{ type: "idle" }
{ type: "busy" }
{ type: "retry", ... }
```

It does not contain token counts.

Use it only for streaming/lifecycle state, not for accounting.

Also be careful with `busy -> idle` transitions. OpenChamber already has logic around live status and internal turns; do not assume every idle event means that the overall user request has fully completed.

The token tracker should rely on the assistant message's completion information plus the existing session event pipeline rather than introducing a second interpretation of OpenCode lifecycle semantics.

Verified: the concrete completion signal is `time.completed` stamped on the trailing assistant `message.updated` — the sync layer treats a completed stamp as
authoritative end of that message's lifecycle even while the session stays busy for the next agent-loop step, and schedules one deferred (~750ms) status
re-check to narrow the stuck-spinner window (`packages/ui/src/sync/DOCUMENTATION.md`, streaming lifecycle derivation). Stop TPS sampling on
`time.completed` for the tracked message; use `session.status = idle` only as the backstop that ends the turn.

---

# 14. Recommended file organization

As-built (all paths real, implemented):

```text
packages/ui/src/

  lib/
    openchamberEvents.ts        # single SSE connection (untouched)
    token-speed.ts              # pure estimateTokens()/calculateTps()/pruneSamples() + locked constants
    token-speed.test.ts         # 11 tests, bun:test
  sync/
    sync-context.tsx            # handleEvent() calls ingest(directory, payload) after directory resolution
    event-reducer.ts            # untouched
    session-ui-store.ts         # untouched; selection read via currentSessionId/getDirectoryForSession
    DOCUMENTATION.md            # sync architecture + store update rules (authoritative)

  stores/
    token-speed-store.ts        # zustand store: display state + ingest()/tick()/reset(); samples in a module-side map
    token-speed-store.test.ts   # 15 tests, bun:test

  components/
    chat/ComposerStatusBar.tsx  # hosts <TokenSpeedItem> left of the todos dropdown
    chat/TokenSpeedItem.tsx     # the `⚡ … ↑ … ↓ …` item: primitive selectors + 150ms tick + local compact formatter
```

The exact filenames should be determined from the current repository. Do not rename or reorganize unrelated status-bar code merely to add this feature.

---

# 15. Keep the implementation small

This feature does **not** need:

- a new server endpoint
- a database query
- a new OpenCode plugin
- a separate Node process
- a right-rail extension panel
- an IPC service
- a new WebSocket/SSE connection
- a heavyweight tokenizer
- persistent storage
- historical analytics

The ideal implementation is a thin projection of data OpenChamber already receives.

```text
existing OpenCode events
        ↓
small token metrics store
        ↓
existing status bar
```

---

# 16. Tests

Add unit tests for the metric layer.

## Token formatting

```text
0        -> 0
999      -> 999
1000     -> 1.0K
128400   -> 128.4K
1000000  -> 1.0M
```

## TPS

Test that:

1. a single delta produces no divide-by-zero/NaN
2. multiple deltas produce the expected rolling TPS
3. old samples leave the window
4. empty deltas do not affect TPS
5. text and reasoning are counted
6. tool/file/patch/etc. parts are ignored
7. starting a new assistant message resets the rolling samples
8. switching sessions prevents one session's TPS from appearing in another
9. a newer assistant message in the same turn replaces (never adds to) the displayed totals
10. a user message with a new id resets TPS samples and re-anchors tracking; stale assistant totals stay visible until the next assistant message
11. displayed `↓` equals `output + reasoning` of the last assistant message; `↑` equals its `input`; cache values are stored but not rendered

## Authoritative usage

Given:

```ts
message.updated -> tokens: {
  input: 128400,
  output: 4800,
  reasoning: 2100,
  cache: { read: 0, write: 0 },
}
```

assert:

```text
↑ 128.4K
↓ 6.9K     # 4800 output + 2100 reasoning, per §8
```

Do not derive those values from the streamed text.

## Lifecycle

Verify:

```text
busy -> deltas -> updated token totals -> idle
```

results in:

```text
live TPS while streaming
final input/output after completion
no continued TPS updates after completion
```

---

# 17. Performance requirements

The status bar must not re-render on every raw OpenCode event if no displayed value changed.

Throttle TPS UI updates to approximately 100–250 ms.

For example:

```ts
const UI_UPDATE_INTERVAL_MS = 150
```

The underlying sample collection can remain event-driven, while the displayed TPS is updated on a small timer.

Use selectors so unrelated application state does not cause the status-bar token component to re-render.

Verified sync-doc constraints the implementation inherits (`packages/ui/src/sync/DOCUMENTATION.md`):
part-only events must update the affected streaming record directly and "must not rescan all busy sessions", and
"unrelated streaming events such as message.part.delta must not trigger global session/status scans".
So the TPS sampler subscribes narrowly (tracked directory + session + message only), publishes at most once per UI tick,
and never walks the message/part buckets of other sessions.

Selector rule: the status-bar component selects primitives only — `tokensPerSecond`, `inputTokens`, `outputTokens`, `isStreaming` —
via individual zustand selectors, never the whole store object. Publish-on-change (§5) guarantees the selected values are referentially
stable between ticks unless the rendered text actually changes, so unrelated application state and unrelated sessions cannot re-render the item.

Keep the sample buffer bounded. A rolling 2-second window should normally be tiny, but still prune aggressively.

---

# 18. UI/UX requirements

The status item should:

- fit in one line
- use the existing OpenChamber typography and colors
- align visually with other status-bar items
- have no panel or modal
- have no configuration UI in v1
- have no click behavior in v1
- not change the status-bar height
- not cause layout jumping when the number changes

Use the existing `tabular-nums` convention (verified: `SessionGoalDialog.tsx` uses `typography-meta text-muted-foreground tabular-nums` for token/turn counts), so:

```text
48.7
51.2
102.4
```

do not cause the surrounding status bar to visibly move.

Suggested semantic structure:

```tsx
<span className="token-speed">
  <span className="token-speed__rate">⚡ 48.7 tok/s</span>
  <span className="token-speed__input">↑ 128.4K</span>
  <span className="token-speed__output">↓ 4.8K</span>
</span>
```

Adapt this to the existing OpenChamber component system rather than introducing raw styling if equivalent primitives already exist.

---

# 19. Implementation sequence

### Step 1 — Inspect and decide placement

The reducer and connection are already verified (§1): `packages/ui/src/lib/openchamberEvents.ts` → `packages/ui/src/sync/event-reducer.ts`.
What remains is the placement decision from §9: confirm `ComposerStatusBar.tsx` as host or choose the footer element, and confirm
`session-ui-store.ts` selection state as the selected-session source for §11 scoping.

Search for:

```text
message.updated
message.part.updated
message.part.delta
session.status
ComposerStatusBar
StatusRow (do NOT reuse)
SidebarFooter
```

### Step 2 — Trace token flow

Confirm where `message.updated` assistant messages are written to the existing stores and whether token fields are already available to the selected chat/session.

Do not create a new OpenCode client if the existing data path already contains the events.

### Step 3 — Add token-speed calculation

Create a small pure module for:

```text
estimateTokens()
calculateTPS()
formatTokens()
```

Keep this module independent of React/Zustand where practical.

### Step 4 — Add token metrics store

Track:

```text
selected session
active assistant message
authoritative usage
live TPS samples
streaming state
```

### Step 5 — Connect existing event pipeline

Feed the store from existing OpenChamber event handling.

Do not subscribe to OpenCode independently.

### Step 6 — Add status-bar item

Render:

```text
⚡ 48.7 tok/s     ↑ 128.4K     ↓ 4.8K
```

using the existing status-bar composition/layout.

### Step 7 — Add regression tests

Colocate `packages/ui/src/lib/token-speed.test.ts` (bun:test, auto-discovered per Step 8) and cover formatting, TPS rolling-window behavior,
multiple sessions, new turns, completion, and token snapshot replacement.

### Step 8 — Verify

Verified repo toolchain: bun monorepo (`packageManager: bun@1.4.2`, openchamber 1.24.0). Run the `packages/ui`-scoped gates:

```sh
bun run --cwd packages/ui type-check   # tsc --noEmit
bun run --cwd packages/ui lint         # eslint ./src/**/*
bun run --cwd packages/ui test         # isolated per-file runner over packages/ui/src
bun run --cwd packages/ui build        # tsc --noEmit
```

Test placement: colocate `packages/ui/src/lib/token-speed.test.ts` next to the module under test. The runner
(`scripts/run-isolated-tests.mjs`) auto-discovers `*.(test|spec).(ts|tsx)` under `src`, runs each file in its own process
(TypeScript files go through `bun test` even when importing `node:test`), and fails on files importing neither runner —
so import `bun:test` explicitly. Full-repo gate is `bun run test` from the root; the `packages/ui test` scope is the
required minimum for this feature.

Then manually test with:

1. a short response
2. a long streaming response
3. a reasoning-heavy model
4. two simultaneously active sessions
5. session switching while generation is active
6. a response with tool calls

---

# 20. Do not implement a fake "official TPS"

The UI should not imply that the provider supplied the exact live TPS number.

The label can remain:

```text
48.7 tok/s
```

but the implementation should document internally that it is a locally derived live throughput estimate based on streamed deltas.

The input/output counters are different: those should be the authoritative OpenCode token counts.

---

# 21. Future extension API (optional, not part of v1)

A future OpenChamber SDK could expose something like:

```ts
host.statusBar.register({
  id: "token-speed",
  priority: 100,
  render: () => ..., 
})
```

and a token stream:

```ts
host.onTokenUsage((event) => {
  ...
})
```

However, do not build this abstraction just for the first implementation unless the OpenChamber maintainers explicitly want a public extension API for status-bar contributions.

For v1, native OpenChamber UI is simpler, smaller, and more reliable.

---

# Acceptance criteria

The feature is complete when all of the following are true:

- [ ] OpenChamber shows the token indicator in its existing status bar.
- [ ] The display format is approximately/exactly:
  `⚡ 48.7 tok/s     ↑ 128.4K     ↓ 4.8K`
- [ ] `↑` shows `AssistantMessage.tokens.input` of the last assistant message.
- [ ] `↓` shows `tokens.output + tokens.reasoning` of the last assistant message.
- [ ] A newer assistant message in the same turn replaces totals; a new user message resets live TPS and re-anchors tracking.
- [ ] Token counts reuse the existing `formatCompactNumber`-based formatting convention; no parallel formatter is introduced.
- [ ] Live TPS is calculated from OpenCode streaming deltas.
- [ ] TPS includes text and reasoning streams only.
- [ ] Tool/file/patch/etc. events do not inflate TPS.
- [ ] TPS resets for a new assistant response.
- [ ] Switching sessions cannot display another session's TPS.
- [ ] Completed sessions stop the live TPS calculation.
- [ ] No second OpenCode connection is introduced.
- [ ] No OpenCode database access is introduced.
- [ ] No right-rail extension panel is introduced.
- [ ] Status-bar layout remains stable and compact.
- [ ] Unit tests cover metric calculation and lifecycle behavior.
- [ ] Typecheck/lint/test/build pass.

### Coverage map (acceptance → §16 test)

| Acceptance criterion | Covered by |
|---|---|
| Display format `⚡ … ↑ … ↓ …` | Formatting cases, §9 behavior reference |
| `↑` = last message `input`; `↓` = last message `output + reasoning` | Authoritative-usage case (§16: `↑ 128.4K` / `↓ 6.9K`), cases 9, 11 |
| Live TPS from streaming deltas; text+reasoning only; tool/file/patch/etc. ignored | TPS cases 2, 5, 6 |
| No divide-by-zero/NaN; empty deltas inert; ingest clamps | TPS cases 1, 4; §3 ingest guards |
| TPS resets per response; totals replaced per message; user message re-anchors turn | TPS cases 7, 9, 10 |
| Session isolation (directory + session scoping) | TPS case 8, lifecycle case |
| Completion stops TPS (`time.completed`, then idle backstop); staleness decay | Lifecycle case, §5 decay, §10 states |
| Single connection; no DB; no rail panel; stable compact layout | Architecture (verify in review, not unit-testable) |
| Gates green | Step 8 commands |

---

# Sources / verification

OpenChamber extension documentation:

- https://docs.openchamber.dev/sdk/

OpenChamber sync architecture (verified 2026-09-17, all exist at these paths on `main`):

- https://github.com/openchamber/openchamber/blob/main/packages/ui/src/sync/DOCUMENTATION.md
- `packages/ui/src/lib/openchamberEvents.ts` — single SSE `EventSource`, `dispatchFromEnvelope`
- `packages/ui/src/sync/event-reducer.ts` (~line 480: `message.part.delta` handling with `appendNonOverlappingDelta`; drops deltas with no parts array)
- `packages/ui/src/sync/session-ui-store.ts` — "ephemeral UI state only", owns selection
- `packages/ui/src/components/chat/ComposerStatusBar.tsx` — candidate TPS host
- `packages/ui/src/components/chat/StatusRow.tsx` — floating chip, do NOT reuse

OpenCode generated SDK types, including `AssistantMessage.tokens` and message-part events (verified: `AssistantMessage` at `types.gen.ts:112`, `tokens` exactly `{input, output, reasoning, cache:{read, write}}`; `EventMessageUpdated.properties.info: Message`):

- https://github.com/anomalyco/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts

OpenCode event schema for `message.part.delta` (verified: `PartDelta` at `v1/session.ts:632`, exactly `{sessionID, messageID, partID, field, delta}`; part union includes `StepStartPart`/`StepFinishPart` alongside text/reasoning/tool/patch/snapshot/file/subtask/agent/retry/compaction):

- https://github.com/anomalyco/opencode/blob/dev/packages/schema/src/v1/session.ts

OpenCode issue documenting the event stream and `message.part.updated` delta behavior:

- https://github.com/anomalyco/opencode/issues/11616

Reference implementation for live OpenCode TPS calculation:

- https://github.com/ChiR24/opencode-tps-meter

Reference Pi implementation that motivated the requested compact token-speed display:

- https://github.com/gsanhueza/pi-token-speed

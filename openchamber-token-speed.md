# OpenChamber Token Speed Status Bar

## Goal

Add a very small token-usage indicator to the existing OpenChamber status bar:

```text
⚡ 48.7 tok/s     ↑ 128.4K     ↓ 4.8K
```

Where:

- `48.7 tok/s` = live output throughput while OpenCode is generating
- `↑ 128.4K` = input tokens for the current assistant response/turn
- `↓ 4.8K` = output tokens for the current assistant response/turn

The UI should remain compact and behave like a native OpenChamber status-bar item. Do not add a right-rail panel for this feature.

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

OpenChamber's `packages/ui/src/sync` layer already receives and reduces OpenCode session/message/part events.

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
OpenCode SSE/event stream
        |
        v
OpenChamber sync/event reducer
        |
        +---- existing stores/UI
        |
        +---- token metrics store
                    |
                    v
              Status Bar
```

---

## 2. Add a small token metrics store

Create a dedicated store because token data changes at streaming frequency and should not be added to unrelated session/UI state.

Suggested shape:

```ts
interface TokenMetrics {
  sessionId: string | null
  messageId: string | null

  inputTokens: number
  outputTokens: number
  reasoningTokens: number

  cacheReadTokens: number
  cacheWriteTokens: number

  tokensPerSecond: number

  isStreaming: boolean

  startedAt: number | null
  firstTokenAt: number | null
  lastTokenAt: number | null
}
```

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
  startedAt: null,
  firstTokenAt: null,
  lastTokenAt: null,
}
```

Do not put this into `session-ui-store`.

The OpenChamber sync documentation explicitly recommends grouping state by change frequency and subscriber set, and recommends a dedicated store when the state has different subscribers/change frequency.

---

# 3. Track the active assistant message

On `message.updated`:

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

This avoids double-counting when OpenCode sends repeated `message.updated` snapshots.

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
```

A delta is a chunk of text, not necessarily one token. Therefore **do not increment TPS by `+1` for every delta**.

---

# 5. Calculate live TPS

OpenCode does not currently provide a ready-made `tokensPerSecond` field.

Use a small rolling-window estimator in OpenChamber.

Recommended window:

```ts
const TPS_WINDOW_MS = 2000
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

---

# 6. Token estimation

Because a streaming delta is arbitrary text, it cannot be treated as one token.

For the initial implementation, keep the estimator lightweight:

```ts
function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.max(1, Math.round(text.length / 4))
}
```

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

---

# 9. Status bar display

The final display should be exactly this style:

```text
⚡ 48.7 tok/s     ↑ 128.4K     ↓ 4.8K
```

Recommended formatting helper:

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

Recommended:

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

---

# 12. Multiple assistant messages / steps

OpenCode may produce multiple assistant-message updates during an agent turn.

The token store should identify the active assistant message using:

```text
sessionID + messageID
```

When `message.updated` provides a newer assistant message for the active session, switch the tracked message identity and replace its authoritative token totals.

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

---

# 14. Recommended file organization

Follow the existing OpenChamber structure and first locate the current status-bar implementation instead of inventing a parallel UI location.

Likely responsibilities:

```text
packages/ui/src/

  sync/
    existing OpenCode event handling

  stores/
    token-speed-store.ts

  lib/
    token-speed.ts
    token-format.ts

  components/
    existing status-bar component
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
↓ 4.8K
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

Use tabular/monospace numerals if the existing design system supports them, so:

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

### Step 1 — Inspect

Find the current OpenChamber status-bar component and the existing sync/event reducer.

Search for:

```text
message.updated
message.part.updated
message.part.delta
session.status
status bar
Footer
StatusBar
```

Confirm the actual current paths before editing.

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

Cover formatting, TPS rolling-window behavior, multiple sessions, new turns, completion, and token snapshot replacement.

### Step 8 — Verify

Run the repository's normal typecheck, lint, test, and build commands.

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
- [ ] Input tokens come from OpenCode `AssistantMessage.tokens.input`.
- [ ] Output tokens come from OpenCode `AssistantMessage.tokens.output`.
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

---

# Sources / verification

OpenChamber extension documentation:

- https://docs.openchamber.dev/sdk/

OpenChamber sync architecture:

- https://github.com/openchamber/openchamber/blob/main/packages/ui/src/sync/DOCUMENTATION.md

OpenCode generated SDK types, including `AssistantMessage.tokens` and message-part events:

- https://github.com/anomalyco/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts

OpenCode event schema for `message.part.delta`:

- https://github.com/anomalyco/opencode/blob/dev/packages/schema/src/v1/session.ts

OpenCode issue documenting the event stream and `message.part.updated` delta behavior:

- https://github.com/anomalyco/opencode/issues/11616

Reference implementation for live OpenCode TPS calculation:

- https://github.com/ChiR24/opencode-tps-meter

Reference Pi implementation that motivated the requested compact token-speed display:

- https://github.com/gsanhueza/pi-token-speed

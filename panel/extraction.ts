/**
 * Session extraction logic — pure and host-agnostic.
 *
 * Step 2 of the next-steps plan: one user click on the session action sends
 * only the *new* messages since the previous click to the configured Small
 * Model, validates what comes back against the supplied window, and stages
 * reviewed candidates in host storage. Nothing here persists habits; candidates
 * are only proposed.
 *
 * The model is untrusted input. Every candidate is checked against the window
 * it was given: shape, length, and — the part a naive check misses — that each
 * cited id exists *in that window* and belongs to a user message.
 */

import { hashText, redactSecrets } from './habits';

export interface AnalysisMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: number;
}

export interface AnalyzeCursor {
  lastMessageId: string;
  /** Fallback ordering when the stored id is no longer in a truncated window. */
  lastMessageAt: number;
}

export interface CandidateEvidence {
  messageId: string;
  role: 'user';
}

export interface HabitCandidate {
  id: string;
  title: string;
  detail: string;
  evidence: CandidateEvidence[];
}

export interface StoredReviewQueue {
  candidates: HabitCandidate[];
  sessionTitle: string;
  directory: string | null;
  analyzedAt: number;
  omitted: number;
  truncated: boolean;
}

export interface AnalysisHost {
  storage: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
  generate: (request: { prompt: string; system?: string; maxOutputTokens?: number }) => Promise<{ text: string }>;
}

export interface AnalyzeInput {
  sessionId: string;
  sessionTitle: string;
  directory: string | null;
  messages: ReadonlyArray<AnalysisMessage> | undefined;
  truncated?: boolean;
  now?: number;
}

export type AnalyzeOutcome =
  | { status: 'no-messages' }
  | { status: 'empty' }
  | { status: 'invalid' }
  | { status: 'ok'; queue: StoredReviewQueue };

export const EXTRACTION_SYSTEM_PROMPT = [
  'You extract durable working preferences from a transcript between a developer ("user") and a coding assistant.',
  '',
  'A durable preference is a rule the user wants followed in future, unrelated tasks: coding style, naming, formatting, tooling, workflow, or communication. It is a general expectation the user states or insists on.',
  '',
  'Never propose:',
  '- one-off task instructions, such as "rename this", "fix the failing test", or "use X for this file"',
  '- requests scoped to the current step, file, or repository state',
  '- generic praise or acknowledgement, such as "thanks", "looks good", or "perfect"',
  "- the assistant's own choices, suggestions, corrections, or summaries",
  '- facts about the code or project, even when the user stated them',
  '- credentials, tokens, keys, personal data, or verbatim quotations',
  '- anything the user only implied; require an explicit user statement',
  '- a preference already proposed earlier in this same answer',
  '',
  'Only the user messages are evidence. Assistant messages are context and are never evidence.',
  '',
  'Return JSON only, exactly this shape:',
  '{"candidates":[{"title":"...","detail":"...","evidence":["<message id>"]}]}',
  '',
  'Field rules:',
  '- title: imperative and short, at most 200 characters, for example "Use tabs for indentation".',
  '- detail: optional specifics, at most 400 characters, or "".',
  '- evidence: 1 to 3 ids of user messages that state the preference. Ids appear as [id: ...] in the transcript. Never invent an id and never cite an assistant message.',
  '',
  'Calibration:',
  '- Most transcripts contain no durable preference. Then return {"candidates":[]}. An empty list is correct, common, and preferred over a guess.',
  '- A preference stated once is enough; do not require repetition.',
  '- Prefer fewer, higher-confidence candidates. Never pad the list.',
  '- If the user reversed a preference later, propose only the final version, or nothing when it is unclear.',
  '',
  'Do not explain. Output only the JSON object.',
].join('\n');

/** Prompt cap from the SDK; the window is trimmed to fit. */
export const PROMPT_MAX_CHARS = 64_000;
/** One message's contribution to the prompt before it is clipped. */
export const MESSAGE_TEXT_MAX = 6_000;
export const TITLE_MAX = 200;
export const DETAIL_MAX = 4_000;
export const MAX_EVIDENCE = 3;

export const LAST_ANALYZED_PREFIX = 'analysis:last:';
export const REVIEW_QUEUE_PREFIX = 'analysis:queue:';

const storageId = (sessionId: string): string =>
  sessionId.length <= 100 ? sessionId : `h${hashText(sessionId)}`;

export function lastAnalyzedKey(sessionId: string): string {
  return `${LAST_ANALYZED_PREFIX}${storageId(sessionId)}`;
}

export function reviewQueueKey(sessionId: string): string {
  return `${REVIEW_QUEUE_PREFIX}${storageId(sessionId)}`;
}

let candidateCounter = 0;

export function newCandidateId(): string {
  candidateCounter += 1;
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.floor(Math.random() * 0xffffffff).toString(36);
  return `c_${Date.now().toString(36)}_${candidateCounter.toString(36)}_${random}`;
}

export function readCursor(value: unknown): AnalyzeCursor | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record['lastMessageId'] !== 'string') return null;
  return {
    lastMessageId: record['lastMessageId'],
    lastMessageAt: typeof record['lastMessageAt'] === 'number' ? record['lastMessageAt'] : 0,
  };
}

/**
 * Messages after the stored cursor. Prefer the stored id's position; fall back
 * to `createdAt` when the id is absent (a truncated session item drops the
 * oldest messages). "After" is a suffix, never a re-scan of the whole session.
 */
export function messagesSince(
  messages: ReadonlyArray<AnalysisMessage>,
  cursor: AnalyzeCursor | null,
): AnalysisMessage[] {
  if (!cursor) return [...messages];
  const index = messages.findIndex((message) => message.id === cursor.lastMessageId);
  if (index >= 0) return messages.slice(index + 1);
  if (Number.isFinite(cursor.lastMessageAt) && cursor.lastMessageAt > 0) {
    // GEqual timestamps count as new: several messages can share one
    // `createdAt`, and the stored id is absent from this window by definition.
    return messages.filter(
      (message) => message.id !== cursor.lastMessageId && message.createdAt >= cursor.lastMessageAt,
    );
  }
  return [...messages];
}

export interface RenderedWindow {
  text: string;
  omitted: number;
  included: number;
}

const clipText = (text: string): string =>
  text.length <= MESSAGE_TEXT_MAX ? text : `${text.slice(0, MESSAGE_TEXT_MAX)}\n…[message truncated]`;

/**
 * Render the window as `[id] role:` blocks, dropping the oldest messages until
 * the prompt fits `maxChars`. When anything is dropped the omission is stated
 * in the prompt, so the model is not told it saw the whole session.
 */
export function renderWindow(
  messages: ReadonlyArray<AnalysisMessage>,
  maxChars = PROMPT_MAX_CHARS,
): RenderedWindow {
  const rendered = messages.map((message) => `[id: ${message.id}] ${message.role}:\n${clipText(message.text)}`);
  const separator = '\n\n---\n\n';
  // Lengths with separators precomputed, so finding the cutoff is one pass
  // instead of rebuilding the string per dropped message.
  const lengths = rendered.map((block) => block.length);
  const suffixLength: number[] = new Array(rendered.length + 1).fill(0);
  for (let i = rendered.length - 1; i >= 0; i -= 1) {
    suffixLength[i] = lengths[i] + (i + 1 < rendered.length ? separator.length : 0) + suffixLength[i + 1];
  }
  const headerFor = (omitted: number): string =>
    omitted > 0
      ? `(${omitted} older message${omitted === 1 ? '' : 's'} omitted to fit the limit. Only the newest messages are shown.)\n\n`
      : '';
  let omitted = 0;
  while (rendered.length - omitted > 1) {
    const header = headerFor(omitted);
    if (header.length + suffixLength[omitted] <= maxChars) break;
    omitted += 1;
  }
  const text = headerFor(omitted) + rendered.slice(omitted).join(separator);
  return { text, omitted, included: rendered.length - omitted };
}

/** Pull a JSON object out of a model answer that may fence it in markdown. */
export function parseCandidatesJson(text: string): { value: unknown } | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1].trim() : trimmed;
  // A bare object or array first; otherwise pull the outermost braces out of
  // surrounding prose. Trying the whole body first keeps `[{...}]` an array.
  try {
    return { value: JSON.parse(body) };
  } catch {
    // fall through to brace extraction
  }
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return { value: JSON.parse(body.slice(start, end + 1)) };
    } catch {
      return null;
    }
  }
  return null;
}

const candidateList = (parsed: unknown): unknown[] | null => {
  if (Array.isArray(parsed)) return parsed;
  if (parsed !== null && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>)['candidates'])) {
    return (parsed as Record<string, unknown>)['candidates'] as unknown[];
  }
  return null;
};

const normalizeTitle = (title: string): string => redactSecrets(title.replace(/\s+/g, ' ').trim()).text;

const readCandidate = (
  raw: unknown,
  windowById: ReadonlyMap<string, AnalysisMessage>,
  seenTitles: ReadonlySet<string>,
): HabitCandidate | null => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (typeof record['title'] !== 'string') return null;

  const title = normalizeTitle(record['title']);
  if (title.length === 0 || title.length > TITLE_MAX) return null;
  if (seenTitles.has(title.toLowerCase())) return null;

  const rawDetail = typeof record['detail'] === 'string' ? record['detail'] : '';
  if (rawDetail.length > DETAIL_MAX) return null;
  const detail = redactSecrets(rawDetail.trim()).text;

  if (!Array.isArray(record['evidence']) || record['evidence'].length === 0) return null;
  const evidence: CandidateEvidence[] = [];
  for (const entry of record['evidence']) {
    if (typeof entry !== 'string') return null;
    const cited = windowById.get(entry);
    // Existence *and* role are checked against the supplied window: a citation
    // to a real-but-unseen message, or to an assistant message, is invalid.
    if (!cited || cited.role !== 'user') return null;
    if (!evidence.some((item) => item.messageId === entry)) evidence.push({ messageId: entry, role: 'user' });
  }
  if (evidence.length === 0) return null;

  return { id: newCandidateId(), title, detail, evidence: evidence.slice(0, MAX_EVIDENCE) };
};

export interface ExtractionResult {
  /** False when the answer was not the declared JSON shape at all. */
  ok: boolean;
  candidates: HabitCandidate[];
  rejected: number;
}

/**
 * Validate a model answer against the exact window it was given. A candidate
 * that cites an id outside that window is rejected here, before it can reach
 * the review queue, even if that id exists elsewhere in the transcript.
 */
export function extractCandidates(
  text: string,
  window: ReadonlyArray<AnalysisMessage>,
): ExtractionResult {
  const parsed = parseCandidatesJson(text);
  if (!parsed) return { ok: false, candidates: [], rejected: 0 };
  const list = candidateList(parsed.value);
  if (!list) return { ok: false, candidates: [], rejected: 0 };

  const windowById = new Map(window.map((message) => [message.id, message]));
  const seenTitles = new Set<string>();
  const candidates: HabitCandidate[] = [];
  let rejected = 0;
  for (const raw of list) {
    const candidate = readCandidate(raw, windowById, seenTitles);
    if (!candidate) {
      rejected += 1;
      continue;
    }
    seenTitles.add(candidate.title.toLowerCase());
    candidates.push(candidate);
  }
  return { ok: true, candidates, rejected };
}

const readStoredCandidate = (value: unknown): HabitCandidate | null => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record['id'] !== 'string' || typeof record['title'] !== 'string') return null;
  if (!Array.isArray(record['evidence']) || record['evidence'].length === 0) return null;
  const evidence: CandidateEvidence[] = [];
  for (const entry of record['evidence']) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const item = entry as Record<string, unknown>;
    if (typeof item['messageId'] !== 'string' || item['role'] !== 'user') return null;
    evidence.push({ messageId: item['messageId'], role: 'user' });
  }
  return {
    id: record['id'],
    title: record['title'],
    detail: typeof record['detail'] === 'string' ? record['detail'] : '',
    evidence,
  };
};

export function readStoredReviewQueue(value: unknown): StoredReviewQueue | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record['candidates'])) return null;
  const candidates = record['candidates']
    .map(readStoredCandidate)
    .filter((candidate): candidate is HabitCandidate => candidate !== null);
  return {
    candidates,
    sessionTitle: typeof record['sessionTitle'] === 'string' ? record['sessionTitle'] : '',
    directory: typeof record['directory'] === 'string' ? record['directory'] : null,
    analyzedAt: typeof record['analyzedAt'] === 'number' ? record['analyzedAt'] : 0,
    omitted: typeof record['omitted'] === 'number' ? record['omitted'] : 0,
    truncated: record['truncated'] === true,
  };
}

/**
 * Run one incremental analysis pass. Reads the cursor, sends only the new
 * window to `generate`, validates the answer, then persists the reviewed
 * queue and advances the cursor. A `generate` failure is thrown to the caller
 * so nothing is saved; an unreadable answer returns `invalid` and the cursor
 * stays put, so the click can be retried.
 */
export async function analyzeSession(input: AnalyzeInput, host: AnalysisHost): Promise<AnalyzeOutcome> {
  const messages = input.messages;
  if (!messages || messages.length === 0) return { status: 'no-messages' };

  const cursor = readCursor(await host.storage.get(lastAnalyzedKey(input.sessionId)));
  const window = messagesSince(messages, cursor);
  if (window.length === 0) return { status: 'empty' };

  const rendered = renderWindow(window);
  const { text } = await host.generate({
    system: EXTRACTION_SYSTEM_PROMPT,
    prompt: rendered.text,
    maxOutputTokens: 4_000,
  });

  const extracted = extractCandidates(text, window);
  if (!extracted.ok) return { status: 'invalid' };

  const last = window[window.length - 1];
  const queue: StoredReviewQueue = {
    candidates: extracted.candidates,
    sessionTitle: input.sessionTitle,
    directory: input.directory,
    analyzedAt: input.now ?? Date.now(),
    omitted: rendered.omitted,
    truncated: input.truncated === true,
  };
  // Zero candidates is a valid abstention, not a queue to show. Drop any stale
  // queue for this session rather than persisting an empty one.
  if (queue.candidates.length === 0) {
    await host.storage.delete(reviewQueueKey(input.sessionId));
  } else {
    await host.storage.set(reviewQueueKey(input.sessionId), queue);
  }
  await host.storage.set(lastAnalyzedKey(input.sessionId), {
    lastMessageId: last.id,
    lastMessageAt: last.createdAt,
  } satisfies AnalyzeCursor);
  return { status: 'ok', queue };
}

export async function clearReviewQueue(sessionId: string, host: AnalysisHost): Promise<void> {
  await host.storage.delete(reviewQueueKey(sessionId));
}

import { describe, expect, test } from 'bun:test';
import {
  analyzeSession,
  EXTRACTION_SYSTEM_PROMPT,
  extractCandidates,
  lastAnalyzedKey,
  messagesSince,
  parseCandidatesJson,
  readCursor,
  readStoredReviewQueue,
  renderWindow,
  reviewQueueKey,
  type AnalysisHost,
  type AnalysisMessage,
} from './extraction';

const msg = (id: string, role: 'user' | 'assistant', text: string, createdAt: number): AnalysisMessage => ({
  id, role, text, createdAt,
});

interface FakeHost extends AnalysisHost {
  stored: Map<string, unknown>;
  calls: Array<{ prompt: string; system?: string; maxOutputTokens?: number }>;
}

const makeHost = (
  stored = new Map<string, unknown>(),
  answer: (request: { prompt: string }) => string = () => '{"candidates":[]}',
): FakeHost => {
  const calls: FakeHost['calls'] = [];
  return {
    stored,
    calls,
    storage: {
      get: async (key) => stored.get(key),
      set: async (key, value) => { stored.set(key, value); },
      delete: async (key) => { stored.delete(key); },
    },
    generate: async (request) => {
      calls.push({ prompt: request.prompt, system: request.system, maxOutputTokens: request.maxOutputTokens });
      return { text: answer(request) };
    },
  };
};

describe('the extraction prompt', () => {
  test('fits the SDK system-prompt cap and demands an empty answer by default', () => {
    expect(EXTRACTION_SYSTEM_PROMPT.length).toBeLessThanOrEqual(8_000);
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('{"candidates":[]}');
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('Assistant messages are context and are never evidence');
  });
});

describe('messagesSince', () => {
  const all = [msg('m1', 'user', 'a', 10), msg('m2', 'assistant', 'b', 20), msg('m3', 'user', 'c', 30)];

  test('no cursor means everything', () => {
    expect(messagesSince(all, null)).toEqual(all);
  });

  test('a located id yields only the suffix after it', () => {
    expect(messagesSince(all, { lastMessageId: 'm1', lastMessageAt: 10 }).map((m) => m.id)).toEqual(['m2', 'm3']);
    expect(messagesSince(all, { lastMessageId: 'm3', lastMessageAt: 30 })).toEqual([]);
  });

  test('a truncated-away id falls back to createdAt ordering, inclusive', () => {
    expect(messagesSince(all, { lastMessageId: 'gone', lastMessageAt: 20 }).map((m) => m.id)).toEqual(['m2', 'm3']);
    expect(messagesSince(all, { lastMessageId: 'gone', lastMessageAt: 0 }).map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
  });
});

describe('renderWindow', () => {
  test('renders ids and roles when everything fits', () => {
    const rendered = renderWindow([msg('m1', 'user', 'use tabs', 1), msg('m2', 'assistant', 'ok', 2)], 64_000);
    expect(rendered.omitted).toBe(0);
    expect(rendered.included).toBe(2);
    expect(rendered.text).toContain('[id: m1] user:');
    expect(rendered.text).toContain('use tabs');
    expect(rendered.text).not.toContain('omitted');
  });

  test('drops the oldest messages and says so when the window is too big', () => {
    const messages = [
      msg('old', 'user', 'x'.repeat(500), 1),
      msg('mid', 'user', 'y'.repeat(500), 2),
      msg('new', 'user', 'z'.repeat(500), 3),
    ];
    const rendered = renderWindow(messages, 900);
    expect(rendered.omitted).toBeGreaterThan(0);
    expect(rendered.text.length).toBeLessThanOrEqual(900);
    expect(rendered.text).toContain('[id: new]');
    expect(rendered.text).not.toContain('[id: old]');
    expect(rendered.text).toContain('omitted to fit the limit');
  });

  test('clips one oversized message instead of losing it', () => {
    const rendered = renderWindow([msg('m1', 'user', 'x'.repeat(20_000), 1)], 64_000);
    expect(rendered.included).toBe(1);
    expect(rendered.text).toContain('message truncated');
  });
});

describe('parseCandidatesJson', () => {
  test('reads plain, fenced, and prose-wrapped JSON', () => {
    expect(parseCandidatesJson('{"candidates":[]}')).toEqual({ value: { candidates: [] } });
    expect(parseCandidatesJson('```json\n{"candidates":[]}\n```')).toEqual({ value: { candidates: [] } });
    expect(parseCandidatesJson('Here you go: {"candidates":[]} done')).toEqual({ value: { candidates: [] } });
    expect(parseCandidatesJson('[{"title":"x"}]')).toEqual({ value: [{ title: 'x' }] });
  });

  test('rejects junk and empty answers', () => {
    expect(parseCandidatesJson('')).toBeNull();
    expect(parseCandidatesJson('not json at all')).toBeNull();
    expect(parseCandidatesJson('{ broken')).toBeNull();
  });
});

describe('extractCandidates', () => {
  const window = [msg('u1', 'user', 'Always use tabs', 1), msg('a1', 'assistant', 'sure', 2)];

  const candidateJson = (over: Record<string, unknown> = {}): string =>
    JSON.stringify({ candidates: [{ title: 'Use tabs', detail: '', evidence: ['u1'], ...over }] });

  test('accepts a user-cited candidate', () => {
    const result = extractCandidates(candidateJson(), window);
    expect(result.ok).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].title).toBe('Use tabs');
    expect(result.candidates[0].evidence).toEqual([{ messageId: 'u1', role: 'user' }]);
  });

  test('rejects an id outside the supplied window even if it is a valid user message elsewhere', () => {
    const result = extractCandidates(candidateJson({ evidence: ['elsewhere'] }), window);
    expect(result.ok).toBe(true);
    expect(result.candidates).toHaveLength(0);
    expect(result.rejected).toBe(1);
  });

  test('rejects an assistant message as evidence', () => {
    const result = extractCandidates(candidateJson({ evidence: ['a1'] }), window);
    expect(result.candidates).toHaveLength(0);
    expect(result.rejected).toBe(1);
  });

  test('rejects empty evidence, over-long titles, over-long details, and bad shapes', () => {
    expect(extractCandidates(candidateJson({ evidence: [] }), window).candidates).toHaveLength(0);
    expect(extractCandidates(candidateJson({ title: 'x'.repeat(201) }), window).candidates).toHaveLength(0);
    expect(extractCandidates(candidateJson({ detail: 'x'.repeat(4001) }), window).candidates).toHaveLength(0);
    expect(extractCandidates(candidateJson({ title: 42 }), window).candidates).toHaveLength(0);
  });

  test('dedupes repeated titles within one answer', () => {
    const json = JSON.stringify({ candidates: [
      { title: 'Use tabs', detail: '', evidence: ['u1'] },
      { title: 'use tabs ', detail: 'again', evidence: ['u1'] },
    ] });
    const result = extractCandidates(json, window);
    expect(result.candidates).toHaveLength(1);
    expect(result.rejected).toBe(1);
  });

  test('redacts recognized secrets before anything is staged', () => {
    const result = extractCandidates(candidateJson({ detail: 'token ghp_abcdefghijklmnopqrstuvwx' }), window);
    expect(result.candidates[0].detail).not.toContain('ghp_');
    expect(result.candidates[0].detail).toContain('[redacted]');
  });

  test('a valid empty list is not an invalid answer', () => {
    const result = extractCandidates('{"candidates":[]}', window);
    expect(result).toEqual({ ok: true, candidates: [], rejected: 0 });
    expect(extractCandidates('{}', window).ok).toBe(false);
  });
});

describe('analyzeSession', () => {
  const window = [msg('m1', 'user', 'Always use tabs', 1), msg('m2', 'assistant', 'ok', 2)];

  test('returns no-messages without calling the model when the action carried none', async () => {
    const host = makeHost();
    const result = await analyzeSession({ sessionId: 's', sessionTitle: 'S', directory: '/p', messages: undefined }, host);
    expect(result).toEqual({ status: 'no-messages' });
    expect(host.calls).toHaveLength(0);
  });

  test('returns empty and does not call the model when the cursor is already at the end', async () => {
    const stored = new Map<string, unknown>([[lastAnalyzedKey('s'), { lastMessageId: 'm2', lastMessageAt: 2 }]]);
    const host = makeHost(stored);
    const result = await analyzeSession({ sessionId: 's', sessionTitle: 'S', directory: '/p', messages: window }, host);
    expect(result).toEqual({ status: 'empty' });
    expect(host.calls).toHaveLength(0);
  });

  test('sends only the new window and persists the reviewed queue plus cursor', async () => {
    const messages = [msg('m1', 'user', 'old request', 1), msg('m2', 'assistant', 'ok', 2), msg('m3', 'user', 'Always use tabs', 3)];
    const candidate = JSON.stringify({ candidates: [{ title: 'Use tabs', detail: '', evidence: ['m3'] }] });
    const stored = new Map<string, unknown>([[lastAnalyzedKey('s'), { lastMessageId: 'm1', lastMessageAt: 1 }]]);
    const host = makeHost(stored, () => candidate);
    const result = await analyzeSession({ sessionId: 's', sessionTitle: 'S', directory: '/p', messages, now: 99 }, host);
    expect(result.status).toBe('ok');
    expect(host.calls).toHaveLength(1);
    expect(host.calls[0].system).toBe(EXTRACTION_SYSTEM_PROMPT);
    expect(host.calls[0].maxOutputTokens).toBe(4_000);
    expect(host.calls[0].prompt).toContain('[id: m3]');
    expect(host.calls[0].prompt).not.toContain('[id: m1]');

    const queue = readStoredReviewQueue(stored.get(reviewQueueKey('s')));
    expect(queue?.candidates).toHaveLength(1);
    expect(queue?.directory).toBe('/p');
    expect(queue?.analyzedAt).toBe(99);
    expect(readCursor(stored.get(lastAnalyzedKey('s')))).toEqual({ lastMessageId: 'm3', lastMessageAt: 3 });
  });

  test('a valid empty answer clears a stale queue but still advances the cursor', async () => {
    const stale = {
      candidates: [{ id: 'c1', title: 'Old', detail: '', evidence: [{ messageId: 'm1', role: 'user' }] }],
      sessionTitle: 'S', directory: '/p', analyzedAt: 1, omitted: 0, truncated: false,
    };
    const stored = new Map<string, unknown>([[reviewQueueKey('s'), stale]]);
    const host = makeHost(stored, () => '{"candidates":[]}');
    const result = await analyzeSession({ sessionId: 's', sessionTitle: 'S', directory: '/p', messages: window }, host);
    expect(result.status).toBe('ok');
    expect(stored.has(reviewQueueKey('s'))).toBe(false);
    expect(readCursor(stored.get(lastAnalyzedKey('s')))).not.toBeNull();
  });

  test('an unreadable answer is invalid and leaves the cursor put for a retry', async () => {
    const stored = new Map<string, unknown>();
    const host = makeHost(stored, () => 'I think you should use tabs.');
    const result = await analyzeSession({ sessionId: 's', sessionTitle: 'S', directory: '/p', messages: window }, host);
    expect(result).toEqual({ status: 'invalid' });
    expect(stored.has(lastAnalyzedKey('s'))).toBe(false);
    expect(stored.has(reviewQueueKey('s'))).toBe(false);
  });

  test('a model failure propagates and writes nothing', async () => {
    const stored = new Map<string, unknown>();
    const host = makeHost(stored);
    host.generate = async () => { throw new Error('MODEL_FAILED'); };
    await expect(
      analyzeSession({ sessionId: 's', sessionTitle: 'S', directory: '/p', messages: window }, host),
    ).rejects.toThrow('MODEL_FAILED');
    expect(stored.size).toBe(0);
  });
});

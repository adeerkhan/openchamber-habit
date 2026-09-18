import { describe, expect, test } from 'bun:test';
import {
  IMPORT_TITLE_PREFIX,
  importQueueKey,
  importedLedgerKey,
  isDuplicateTitle,
  mergeCandidates,
  parseLedger,
} from './import-ledger';
import { hashDirectory } from './habits';

const window = [
  { id: 'u1', role: 'user', text: 'I always want SI units', createdAt: 1 },
  { id: 'a1', role: 'assistant', text: 'ok', createdAt: 2 },
];

const ledger = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({
    version: 1,
    run: 'run-1',
    scope: 'civil',
    window,
    c: [{ t: 'Use SI units', d: '', e: ['u1'] }],
    ...over,
  });

describe('parseLedger', () => {
  test('accepts a versioned ledger and validates candidates against its window', () => {
    const result = parseLedger(ledger());
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.rejected).toBe(0);
    expect(result.ledger.run).toBe('run-1');
    expect(result.ledger.window).toHaveLength(2);
    expect(result.ledger.candidates).toHaveLength(1);
    expect(result.ledger.candidates[0].title).toBe('Use SI units');
    expect(result.ledger.candidates[0].evidence).toEqual([{ messageId: 'u1', role: 'user' }]);
  });

  test('rejects unknown or missing versions instead of guessing', () => {
    expect(parseLedger(ledger({ version: 2 })).status).toBe('invalid');
    expect(parseLedger(ledger({ version: undefined })).status).toBe('invalid');
  });

  test('accepts the version as a numeric string', () => {
    const result = parseLedger(ledger({ version: '1' }));
    expect(result.status).toBe('ok');
  });

  test('rejects a ledger with no usable window', () => {
    expect(parseLedger(ledger({ window: undefined })).status).toBe('invalid');
    expect(parseLedger(ledger({ window: [] })).status).toBe('invalid');
    expect(parseLedger(ledger({ window: [{ id: 'u1', role: 'system' }] })).status).toBe('invalid');
    expect(parseLedger(ledger({ window: [{ role: 'user' }] })).status).toBe('invalid');
  });

  test('rejects duplicate window ids: evidence would be ambiguous', () => {
    const dup = [{ id: 'u1', role: 'user', text: 'a' }, { id: 'u1', role: 'user', text: 'b' }];
    expect(parseLedger(ledger({ window: dup })).status).toBe('invalid');
  });

  test('rejects a ledger with no candidate list', () => {
    expect(parseLedger(ledger({ c: undefined, candidates: undefined })).status).toBe('invalid');
  });

  test('rejects junk text', () => {
    expect(parseLedger('not json').status).toBe('invalid');
    expect(parseLedger('').status).toBe('invalid');
  });

  test('drops a candidate citing an id outside the window', () => {
    const result = parseLedger(ledger({ c: [{ t: 'Rule', d: '', e: ['gone'] }] }));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.ledger.candidates).toHaveLength(0);
    expect(result.rejected).toBe(1);
  });

  test('drops a candidate citing an assistant turn', () => {
    const result = parseLedger(ledger({ c: [{ t: 'Rule', d: '', e: ['a1'] }] }));
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.ledger.candidates).toHaveLength(0);
    expect(result.rejected).toBe(1);
  });

  test('accepts an honest empty candidate list', () => {
    const result = parseLedger(ledger({ c: [] }));
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.ledger.candidates).toHaveLength(0);
    expect(result.rejected).toBe(0);
  });

  test('redacts secrets in imported text before staging', () => {
    const result = parseLedger(ledger({ c: [{ t: 'Rule', d: 'token ghp_abcdefghijklmnopqrstuvwx', e: ['u1'] }] }));
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.ledger.candidates[0].detail).not.toContain('ghp_');
    expect(result.ledger.candidates[0].detail).toContain('[redacted]');
  });
});

describe('storage keys', () => {
  test('import queue is scoped to the project directory', () => {
    const a = importQueueKey('/a/project');
    expect(a).toBe(importQueueKey('/a/project'));
    expect(a).not.toBe(importQueueKey('/b/project'));
    expect(a).toContain(hashDirectory('/a/project'));
    expect(a.length).toBeLessThan(40);
  });

  test('the imported marker key carries the project and the fingerprint', () => {
    const a = importedLedgerKey('/a/project', 'abc123');
    expect(a).toContain('abc123');
    expect(a).toContain(hashDirectory('/a/project'));
    expect(a).not.toBe(importedLedgerKey('/b/project', 'abc123'));
    expect(a).toBe(importedLedgerKey('/a/project', 'abc123'));
  });

  test('the import title prefix is a shared constant', () => {
    expect(IMPORT_TITLE_PREFIX).toBe('Imported · ');
  });
});

describe('isDuplicateTitle', () => {
  test('matches case- and whitespace-insensitively', () => {
    const existing = [{ title: 'Use  SI   Units' }];
    expect(isDuplicateTitle('use si units', existing)).toBe(true);
    expect(isDuplicateTitle('Use tabs', existing)).toBe(false);
  });
});

describe('mergeCandidates', () => {
  const cand = (id: string, title: string) => ({ id, title, detail: '', evidence: [] });
  test('merges by id, first-seen order, no duplicates', () => {
    const merged = mergeCandidates([cand('a', 'A')], [cand('b', 'B'), cand('a', 'A2')], [cand('c', 'C')]);
    expect(merged.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(merged[0].title).toBe('A');
  });
});

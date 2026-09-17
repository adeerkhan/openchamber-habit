import { describe, expect, test } from 'bun:test';
import {
  addHabit, confidenceOf, deserialise, emptyStore, loadStore, migrateStore,
  recordEvent, saveStore, serialise, validateStore,
  type HabitObservation, type HabitStore,
} from './habit-engine';

const seed = (): HabitStore =>
  addHabit(emptyStore(), {
    id: 'h1', text: 'Prefer native APIs.', scope: 'project', category: 'dependencies',
    status: 'active', from: null, createdAt: 0, updatedAt: 0, supporting: 0, contradicting: 0,
  });

const obs = (id: string, kind: HabitObservation['kind'], source: HabitObservation['source']): HabitObservation => ({ id, kind, source });

describe('confidence', () => {
  test('calculates confidence from explicit memory counts', () => {
    const memory = { supporting: 3, contradicting: 1 };
    expect(confidenceOf(memory.supporting, memory.contradicting)).toBe(0.67);
  });
  test('Laplace smoothing: 0.5 start, 0.8 at 3-0, 0.2 at 0-3', () => {
    expect(confidenceOf(0, 0)).toBe(0.5);
    expect(confidenceOf(3, 0)).toBe(0.8);
    expect(confidenceOf(0, 3)).toBe(0.2);
  });

  test('updates on every user event, up and down', () => {
    let s = seed();
    expect(s.habits['h1']!.confidence).toBe(0.5);
    s = recordEvent(s, 'h1', obs('o1', 'correction', 'user'));
    expect(s.habits['h1']!.confidence).toBe(0.67);
    s = recordEvent(s, 'h1', obs('o2', 'violation', 'user'));
    expect(s.habits['h1']!.confidence).toBe(0.5);
  });

  test('applied/assistant events update nothing — a habit cannot confirm itself', () => {
    let s = seed();
    for (let i = 0; i < 10; i++) s = recordEvent(s, 'h1', obs(`o${i}`, 'applied', 'assistant'));
    expect(s.habits['h1']!.confidence).toBe(0.5);
    expect(s.habits['h1']!.supporting).toBe(0);
  });
});

describe('recordEvent: observation identity', () => {
  test('requires an explicit observation: no silent user default, valid id/kind/source', () => {
    expect(() => recordEvent(seed(), 'h1', obs('', 'correction', 'user'))).toThrow(); // empty id
    expect(() => recordEvent(seed(), 'h1', { id: 'o1', kind: 'nonsense' as never, source: 'user' })).toThrow();
    expect(() => recordEvent(seed(), 'h1', { id: 'o1', kind: 'correction', source: 'alien' as never })).toThrow();
  });

  test('a repeated id is a no-op, even when the kind differs', () => {
    let s = recordEvent(seed(), 'h1', obs('o1', 'correction', 'user'));
    const afterFirst = s.habits['h1']!;
    s = recordEvent(s, 'h1', obs('o1', 'violation', 'user'));
    expect(s.habits['h1']!).toBe(afterFirst); // same record object: nothing re-counted
    expect(s.habits['h1']!.supporting).toBe(1);
    expect(s.habits['h1']!.contradicting).toBe(0);
    expect(s.habits['h1']!.observations).toEqual({ o1: 'support' });
  });

  test('the same id recorded again after save/reload does not double count', () => {
    const recorded = recordEvent(seed(), 'h1', obs('o1', 'confirmation', 'user'));
    const reloaded = deserialise(serialise(recorded));
    const again = recordEvent(reloaded, 'h1', obs('o1', 'confirmation', 'user'));
    expect(again.habits['h1']!).toBe(reloaded.habits['h1']);
    expect(again.habits['h1']!.supporting).toBe(1);
  });

  test('distinct observation ids each count', () => {
    let s = recordEvent(seed(), 'h1', obs('o1', 'instruction', 'user'));
    s = recordEvent(s, 'h1', obs('o2', 'confirmation', 'user'));
    expect(s.habits['h1']!.supporting).toBe(2);
  });

  test('user violation contradicts; assistant violation is noncompliance, weight 0', () => {
    const user = recordEvent(seed(), 'h1', obs('o1', 'violation', 'user'));
    expect(user.habits['h1']!.contradicting).toBe(1);
    expect(user.habits['h1']!.observations['o1']).toBe('contradict');

    const assistant = recordEvent(seed(), 'h1', obs('o1', 'violation', 'assistant'));
    expect(assistant.habits['h1']!.contradicting).toBe(0);
    expect(assistant.habits['h1']!.observations['o1']).toBe('note');
    expect(assistant.habits['h1']!.updatedAt).toBeGreaterThan(0); // recorded, not counted
  });

  test('off habits are never reinforced or contradicted; observations are still recorded', () => {
    const off = addHabit(emptyStore(), {
      id: 'h2', text: 'Switched off habit.', scope: 'project', category: 'style',
      status: 'off', from: null, createdAt: 0, updatedAt: 0, supporting: 0, contradicting: 0,
    });
    let s = recordEvent(off, 'h2', obs('o1', 'correction', 'user'));
    expect(s.habits['h2']!.supporting).toBe(0);
    expect(s.habits['h2']!.observations['o1']).toBe('note');
    s = recordEvent(s, 'h2', obs('o2', 'violation', 'user'));
    expect(s.habits['h2']!.contradicting).toBe(0);
    expect(s.habits['h2']!.observations['o2']).toBe('note');
    expect(s.habits['h2']!.updatedAt).toBeGreaterThan(0);
  });

  test('unknown habit id returns the same store untouched', () => {
    const s = seed();
    expect(recordEvent(s, 'missing', obs('o1', 'correction', 'user'))).toBe(s);
  });
});

describe('persisted store validation', () => {
  test('store version must be exactly 2', () => {
    expect(validateStore({ version: 2, habits: {} })).not.toBeNull();
    for (const bad of [
      { version: 1, habits: {} }, { version: 3, habits: {} }, { version: '2', habits: {} },
      { habits: {} }, { version: 2 }, null, 'store', [], { version: 2, habits: [] },
    ]) {
      expect(validateStore(bad)).toBeNull();
    }
  });

  test('malformed input throws instead of returning a silent empty store', () => {
    expect(() => deserialise('garbage')).toThrow();
    expect(() => deserialise('')).toThrow();
    expect(() => deserialise('null')).toThrow();
    expect(() => deserialise('{"version":9,"habits":{}}')).toThrow();
  });

  const invalidMutations: Array<[string, (record: Record<string, unknown>) => void]> = [
    ['empty text', (r) => { r.text = ''; }],
    ['non-string text', (r) => { r.text = 42; }],
    ['negative supporting count', (r) => { r.supporting = -1; }],
    ['fractional supporting count', (r) => { r.supporting = 1.5; }],
    ['non-safe supporting count', (r) => { r.supporting = Number.MAX_SAFE_INTEGER + 1; }],
    ['non-numeric contradicting count', (r) => { r.contradicting = '3'; }],
    ['unknown scope', (r) => { r.scope = 'workspace'; }],
    ['unknown status', (r) => { r.status = 'maybe'; }],
    ['id not matching its key', (r) => { r.id = 'other'; }],
    ['malformed from pointer', (r) => { r.from = { sessionId: 7, messageId: 'm' }; }],
    ['non-numeric createdAt', (r) => { r.createdAt = 'yesterday'; }],
    ['infinite updatedAt', (r) => { r.updatedAt = Number.POSITIVE_INFINITY; }],
    ['observations not an object', (r) => { r.observations = 'none'; }],
    ['unknown observation effect', (r) => { r.observations = { o1: 'supportive' }; }],
    ['__proto__ observation key', (r) => { Object.defineProperty(r.observations, '__proto__', { value: 'support', enumerable: true, writable: true, configurable: true }); }],
    ['non-numeric confidence', (r) => { r.confidence = '0.9'; }],
    ['NaN confidence', (r) => { r.confidence = Number.NaN; }],
  ];
  for (const [name, mutate] of invalidMutations) {
    test(`rejects record with ${name}`, () => {
      const raw: Record<string, unknown> = JSON.parse(serialise(recordEvent(seed(), 'h1', obs('o1', 'correction', 'user'))));
      mutate(raw.habits.h1 as Record<string, unknown>);
      expect(validateStore(raw)).toBeNull();
      expect(() => deserialise(JSON.stringify(raw))).toThrow();
    });
  }

  test('stored confidence is ignored — always derived from counts', () => {
    const raw: Record<string, unknown> = JSON.parse(
      serialise(recordEvent(recordEvent(seed(), 'h1', obs('o1', 'correction', 'user')), 'h1', obs('o2', 'confirmation', 'user'))),
    );
    (raw.habits.h1 as Record<string, unknown>).confidence = 0.99;
    const loaded = deserialise(JSON.stringify(raw));
    expect(loaded.habits['h1']!.confidence).toBe(confidenceOf(2, 0));
  });

  test('a missing confidence field is fine — it is derived', () => {
    const raw: Record<string, unknown> = JSON.parse(serialise(recordEvent(seed(), 'h1', obs('o1', 'correction', 'user'))));
    delete (raw.habits.h1 as Record<string, unknown>).confidence;
    const loaded = deserialise(JSON.stringify(raw));
    expect(loaded.habits['h1']!.confidence).toBe(confidenceOf(1, 0));
  });

  test('serialise refuses an invalid store', () => {
    const tampered = {
      version: 2,
      habits: { h1: { ...seed().habits['h1']!, supporting: -2 } },
    } as unknown as HabitStore;
    expect(() => serialise(tampered)).toThrow();
    expect(() => serialise(emptyStore())).not.toThrow();
  });
});

describe('version 1 migration', () => {
  const v1Raw = {
    version: 1,
    habits: {
      h_old: {
        id: 'h_old', text: 'Use pnpm.', scope: 'project', category: 'tooling', status: 'active',
        from: { sessionId: 'ses_1', messageId: 'msg_2' }, createdAt: 1, updatedAt: 2,
        supporting: 3, contradicting: 1, confidence: 0.67,
      },
    },
  };

  test('valid v1 records load as v2 with an empty observation map and derived confidence', () => {
    const loaded = deserialise(JSON.stringify(v1Raw));
    expect(loaded.version).toBe(2);
    const habit = loaded.habits['h_old']!;
    expect(habit.observations).toEqual({});
    expect(habit.supporting).toBe(3);
    expect(habit.contradicting).toBe(1);
    expect(habit.confidence).toBe(confidenceOf(3, 1));
  });

  test('migrateStore is the explicit seam and rejects non-v1 input', () => {
    expect(migrateStore(v1Raw)?.habits['h_old']!.observations).toEqual({});
    expect(migrateStore({ version: 2, habits: {} })).toBeNull();
    expect(migrateStore({ version: 1 })).toBeNull();
    expect(migrateStore(null)).toBeNull();
  });

  test('v1 records that already carry observations are rejected, not guessed at', () => {
    const tampered = { ...v1Raw, habits: { h_old: { ...v1Raw.habits.h_old, observations: { o1: 'support' } } } };
    expect(migrateStore(tampered)).toBeNull();
    expect(() => deserialise(JSON.stringify(tampered))).toThrow();
  });

  test('invalid v1 counts do not load', () => {
    const bad = { ...v1Raw, habits: { h_old: { ...v1Raw.habits.h_old, supporting: -1 } } };
    expect(() => deserialise(JSON.stringify(bad))).toThrow();
  });
});

describe('store IO', () => {
  const memoryIO = () => {
    const files = new Map<string, string>();
    const io = {
      readFile: async (p: string): Promise<string> => {
        if (!files.has(p)) throw notFound();
        return files.get(p)!;
      },
      writeFile: async (p: string, c: string): Promise<void> => { files.set(p, c); },
    };
    return { files, io };
  };
  const notFound = (): Error & { code: string } => Object.assign(new Error('nope'), { code: 'ENOENT' });

  test('missing file loads empty; denied or other read errors throw', async () => {
    const { io } = memoryIO();
    expect(await loadStore(io, 'missing.json')).toEqual(emptyStore());

    const denied = {
      readFile: async (): Promise<string> => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); },
      writeFile: async (): Promise<void> => {},
    };
    await expect(loadStore(denied, 'x.json')).rejects.toThrow('denied');

    const broken = {
      readFile: async (): Promise<string> => { throw new Error('disk on fire'); },
      writeFile: async (): Promise<void> => {},
    };
    await expect(loadStore(broken, 'x.json')).rejects.toThrow('disk on fire');
  });

  test('a corrupt persisted file throws on load instead of silently resetting', async () => {
    const { io, files } = memoryIO();
    files.set('bad.json', 'not json');
    await expect(loadStore(io, 'bad.json')).rejects.toThrow();
    files.set('badver.json', JSON.stringify({ version: 99, habits: {} }));
    await expect(loadStore(io, 'badver.json')).rejects.toThrow();
  });

  test('saveStore validates first: an invalid store throws before any write', async () => {
    const { io, files } = memoryIO();
    let writes = 0;
    const counting = {
      readFile: io.readFile,
      writeFile: async (p: string, c: string): Promise<void> => { writes++; await io.writeFile(p, c); },
    };
    const bad = { version: 2, habits: { h1: { ...seed().habits['h1']!, contradicting: -2 } } } as unknown as HabitStore;
    await expect(saveStore(counting, 'p.json', bad)).rejects.toThrow();
    expect(writes).toBe(0);
    expect(files.size).toBe(0);
    await expect(saveStore(io, 'p.json', seed())).resolves.toBeUndefined();
    expect(JSON.parse(files.get('p.json')!).version).toBe(2);
  });

  test('a failing write propagates', async () => {
    const io = { readFile: async (): Promise<string> => '', writeFile: async (): Promise<void> => { throw new Error('read-only fs'); } };
    await expect(saveStore(io, 'p.json', seed())).rejects.toThrow('read-only fs');
  });

  test('round trip preserves counts, confidence and observations', () => {
    const store = recordEvent(recordEvent(seed(), 'h1', obs('o1', 'correction', 'user')), 'h1', obs('o2', 'applied', 'assistant'));
    expect(deserialise(serialise(store))).toEqual(store);
  });

  test('end-to-end: save to a real file in the approved temp root, load it back, idempotent replay', async () => {
    const fs = await import('node:fs/promises');
    const { join } = await import('node:path');
    const io = {
      readFile: (p: string) => fs.readFile(p, 'utf8'),
      writeFile: (p: string, c: string) => fs.writeFile(p, c, 'utf8'),
    };
    const dir = await fs.mkdtemp('C:\\Users\\adeer\\AppData\\Local\\Temp\\opencode\\habit-engine-');
    try {
      const path = join(dir, 'habits.json');
      await saveStore(io, path, recordEvent(recordEvent(seed(), 'h1', obs('o1', 'correction', 'user')), 'h1', obs('o2', 'applied', 'assistant')));
      const loaded = await loadStore(io, path);
      expect(loaded.habits['h1']!.confidence).toBe(0.67);
      expect(loaded.habits['h1']!.supporting).toBe(1);
      expect(loaded.habits['h1']!.observations).toEqual({ o1: 'support', o2: 'note' });

      // replay after reload: same observation ids change nothing
      const replayed = recordEvent(recordEvent(loaded, 'h1', obs('o1', 'correction', 'user')), 'h1', obs('o2', 'applied', 'assistant'));
      expect(replayed.habits['h1']!).toBe(loaded.habits['h1']);

      // missing file → empty store; a non-missing but unreadable path → throws (EISDIR, not not-found)
      expect(await loadStore(io, join(dir, 'missing.json'))).toEqual(emptyStore());
      await expect(loadStore(io, dir)).rejects.toThrow();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

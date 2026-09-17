import { describe, expect, test } from 'bun:test';
import { addHabit, confidenceOf, deserialise, emptyStore, loadStore, recordEvent, saveStore, serialise, type HabitStore } from './habit-engine';

const seed = (): HabitStore =>
  addHabit(emptyStore(), {
    id: 'h1', text: 'Prefer native APIs.', scope: 'project', category: 'dependencies',
    status: 'active', from: null, createdAt: 0, updatedAt: 0, supporting: 0, contradicting: 0,
  });

describe('confidence', () => {
  test('Laplace smoothing: 0.5 start, 0.8 at 3-0, 0.2 at 0-3', () => {
    expect(confidenceOf(0, 0)).toBe(0.5);
    expect(confidenceOf(3, 0)).toBe(0.8);
    expect(confidenceOf(0, 3)).toBe(0.2);
  });

  test('updates on every user event, up and down', () => {
    let s = seed();
    expect(s.habits['h1']!.confidence).toBe(0.5);
    s = recordEvent(s, 'h1', 'correction');
    expect(s.habits['h1']!.confidence).toBe(0.67);
    s = recordEvent(s, 'h1', 'violation');
    expect(s.habits['h1']!.confidence).toBe(0.5);
  });

  test('applied/assistant events update nothing — a habit cannot confirm itself', () => {
    let s = seed();
    for (let i = 0; i < 10; i++) s = recordEvent(s, 'h1', 'applied', 'assistant');
    expect(s.habits['h1']!.confidence).toBe(0.5);
    expect(s.habits['h1']!.supporting).toBe(0);
  });
});

describe('persistence', () => {
  test('round trip preserves counts and confidence', () => {
    const store = recordEvent(recordEvent(seed(), 'h1', 'correction'), 'h1', 'confirmation');
    expect(deserialise(serialise(store))).toEqual(store);
  });

  test('malformed file → empty store, missing habit → unchanged', () => {
    expect(deserialise('garbage')).toEqual(emptyStore());
    expect(recordEvent(seed(), 'missing', 'correction').habits['h1']).toEqual(seed().habits['h1']); // no-op for unknown ids
  });

  test('end-to-end: save to a real file, load it back, confidence survives', async () => {
    const fs = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const io = {
      readFile: (p: string) => fs.readFile(p, 'utf8'),
      writeFile: (p: string, c: string) => fs.writeFile(p, c, 'utf8'),
    };
    const dir = await fs.mkdtemp(join(tmpdir(), 'habit-'));
    try {
      const path = join(dir, 'habits.json');
      await saveStore(io, path, recordEvent(seed(), 'h1', 'correction'));
      const loaded = await loadStore(io, path);
      expect(loaded.habits['h1']!.confidence).toBe(0.67);
      expect(loaded.habits['h1']!.supporting).toBe(1);
      expect(await loadStore(io, join(dir, 'missing.json'))).toEqual(emptyStore());
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

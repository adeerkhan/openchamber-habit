/**
 * Habit tracker — one JSON file in the project, one confidence per habit.
 *
 * confidence = (1 + supporting) / (2 + supporting + contradicting), rounded to 2dp.
 * Starts at 0.5. Only user-attributed events move it; 'applied' (the agent
 * followed the habit) has weight 0 — a habit cannot confirm itself.
 *
 * ponytail: no event log, no dedup — re-analysing the same session can
 * double-count. Add event storage when that actually bites.
 */

export type HabitEventKind = 'instruction' | 'correction' | 'confirmation' | 'violation' | 'applied';

export interface HabitRecord {
  id: string;
  text: string;
  scope: 'project' | 'global';
  category: string;
  status: 'active' | 'off';
  /** One pointer to where the habit came from. Never quoted text. */
  from: { sessionId: string; messageId: string } | null;
  createdAt: number;
  updatedAt: number;
  supporting: number;
  contradicting: number;
  confidence: number;
}

export interface HabitStore {
  version: 1;
  habits: Record<string, HabitRecord>;
}

export const emptyStore = (): HabitStore => ({ version: 1, habits: {} });

export const confidenceOf = (supporting: number, contradicting: number): number =>
  Math.round(((1 + supporting) / (2 + supporting + contradicting)) * 100) / 100;

/** Record one observation. Assistant/system events are stored as history but move nothing. */
export function recordEvent(
  store: HabitStore,
  habitId: string,
  kind: HabitEventKind,
  source: 'user' | 'assistant' | 'system' = 'user',
): HabitStore {
  const habit = store.habits[habitId];
  if (!habit) return store;
  const supporting = habit.supporting + (eventSupports(kind, source) ? 1 : 0);
  const contradicting = habit.contradicting + (eventContradicts(kind, source) ? 1 : 0);
  if (supporting === habit.supporting && contradicting === habit.contradicting) return store;
  const next: HabitRecord = { ...habit, supporting, contradicting, confidence: confidenceOf(supporting, contradicting), updatedAt: Date.now() };
  return { ...store, habits: { ...store.habits, [habitId]: next } };
}

const eventSupports = (kind: HabitEventKind, source: string): boolean =>
  source === 'user' && (kind === 'instruction' || kind === 'correction' || kind === 'confirmation');

const eventContradicts = (kind: HabitEventKind, source: string): boolean =>
  source === 'user' && kind === 'violation';

export function addHabit(store: HabitStore, habit: Omit<HabitRecord, 'confidence'>): HabitStore {
  return { ...store, habits: { ...store.habits, [habit.id]: { ...habit, confidence: confidenceOf(habit.supporting, habit.contradicting) } } };
}

/** For host.storage (≤ 64 KiB per value) or a project JSON file. */
export const serialise = (store: HabitStore): string => JSON.stringify(store, null, 2);

/** Malformed files come back empty, never crash the panel. */
export function deserialise(raw: string): HabitStore {
  try {
    const parsed = JSON.parse(raw) as { habits?: Record<string, unknown> } | null;
    const habits: Record<string, HabitRecord> = {};
    for (const [id, value] of Object.entries(parsed?.habits ?? {})) {
      const r = value as Partial<HabitRecord> | null;
      if (!r || typeof r !== 'object' || typeof r.text !== 'string') continue;
      const supporting = typeof r.supporting === 'number' ? r.supporting : 0;
      const contradicting = typeof r.contradicting === 'number' ? r.contradicting : 0;
      habits[id] = { ...(r as HabitRecord), id, supporting, contradicting, confidence: r.confidence ?? confidenceOf(supporting, contradicting) };
    }
    return { version: 1, habits };
  } catch {
    return emptyStore();
  }
}

/** Disk seam. The panel passes host.readFile/host.writeFile; tests pass node:fs. */
export interface StoreIO {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
}

/** Persist the store to the project file. */
export async function saveStore(io: StoreIO, path: string, store: HabitStore): Promise<void> {
  await io.writeFile(path, serialise(store));
}

/** Load the store; a missing or unreadable file is an empty store. */
export async function loadStore(io: StoreIO, path: string): Promise<HabitStore> {
  try {
    return deserialise(await io.readFile(path));
  } catch {
    return emptyStore();
  }
}

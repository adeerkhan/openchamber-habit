/**
 * Habit tracker — one JSON file in the project, one confidence per habit.
 *
 * confidence = (1 + supporting) / (2 + supporting + contradicting), rounded to 2dp.
 * Starts at 0.5. Only user-attributed support/contradiction moves it; 'applied'
 * (the agent followed the habit) and any assistant/system observation are
 * recorded with weight 0 — a habit cannot confirm itself, and assistant
 * violations are noncompliance notes, not user contradictions.
 *
 * Every observation carries a caller-supplied stable id (e.g. sessionId#messageId),
 * stored on the record; a repeated id is a no-op, so re-analysis of the same
 * session cannot double-count, across save/reload cycles too.
 *
 * Persisted stores are validated on load and on save: an unknown version or a
 * malformed record throws instead of being silently reset or cast into shape.
 * Version-1 files without observation ids are migrated in (empty observation map,
 * stored confidence replaced by the derived one).
 */

export type HabitEventKind = 'instruction' | 'correction' | 'confirmation' | 'violation' | 'applied';

/** One externally attributed observation. `id` must be stable for the same fact (e.g. `${sessionId}#${messageId}`). */
export interface HabitObservation {
  id: string;
  kind: HabitEventKind;
  source: 'user' | 'assistant' | 'system';
}

export type ObservationEffect = 'support' | 'contradict' | 'note';

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
  /** Derived from counts on every load and update; never trusted from storage. */
  confidence: number;
  /** observation id → effect it had (weight-0 observations are recorded as 'note'). */
  observations: Record<string, ObservationEffect>;
}

export interface HabitStore {
  version: 2;
  habits: Record<string, HabitRecord>;
}

export const emptyStore = (): HabitStore => ({ version: 2, habits: {} });

export const confidenceOf = (supporting: number, contradicting: number): number =>
  Math.round(((1 + supporting) / (2 + supporting + contradicting)) * 100) / 100;

const HABIT_EVENT_KINDS: ReadonlySet<string> = new Set(['instruction', 'correction', 'confirmation', 'violation', 'applied']);
const SOURCES: ReadonlySet<string> = new Set(['user', 'assistant', 'system']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Nonnegative safe integer: the only kind of count a store may hold. */
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const isFiniteInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value);

/**
 * Validate one habit record against its map key. Returns a fully-shaped record
 * with derived confidence, or null if any field is malformed.
 */
const parseHabitRecord = (id: string, value: unknown): HabitRecord | null => {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || value.id !== id) return null;
  if (typeof value.text !== 'string' || value.text.length === 0) return null;
  if (value.scope !== 'project' && value.scope !== 'global') return null;
  if (value.status !== 'active' && value.status !== 'off') return null;
  if (typeof value.category !== 'string') return null;
  if (!isFiniteInt(value.createdAt) || !isFiniteInt(value.updatedAt)) return null;
  if (!isCount(value.supporting) || !isCount(value.contradicting)) return null;
  if (value.confidence !== undefined && (typeof value.confidence !== 'number' || !Number.isFinite(value.confidence))) return null;

  const from = value.from;
  let origin: HabitRecord['from'] = null;
  if (from !== null && from !== undefined) {
    if (!isRecord(from) || typeof from.sessionId !== 'string' || typeof from.messageId !== 'string') return null;
    origin = { sessionId: from.sessionId, messageId: from.messageId };
  }

  const observations: Record<string, ObservationEffect> = {};
  if (value.observations !== undefined) {
    if (!isRecord(value.observations)) return null;
    for (const [obsId, effect] of Object.entries(value.observations)) {
      if (obsId === '__proto__' || obsId === 'constructor' || obsId === 'prototype') return null;
      if (effect !== 'support' && effect !== 'contradict' && effect !== 'note') return null;
      observations[obsId] = effect;
    }
  }

  return {
    id, text: value.text, scope: value.scope, category: value.category, status: value.status,
    from: origin, createdAt: value.createdAt, updatedAt: value.updatedAt,
    supporting: value.supporting, contradicting: value.contradicting,
    confidence: confidenceOf(value.supporting, value.contradicting), observations,
  };
};

/**
 * Structural validation of an untrusted store shape. Returns a validated store
 * (confidence recomputed) or null when the shape is not a valid version-2 store.
 */
export function validateStore(value: unknown): HabitStore | null {
  if (!isRecord(value) || value.version !== 2 || !isRecord(value.habits)) return null;
  const habits: Record<string, HabitRecord> = {};
  for (const [id, record] of Object.entries(value.habits)) {
    const parsed = parseHabitRecord(id, record);
    if (parsed === null) return null;
    habits[id] = parsed;
  }
  return { version: 2, habits };
}

/**
 * Backwards-compatible migration from a version-1 store (pre-observation-id
 * records). Valid old records keep their counts; they get an empty observation
 * map and a recomputed confidence. Returns null for anything that is not a
 * valid v1 store. Records that already carry observation fields are rejected:
 * they are not v1 and guessing their identity would fabricate history.
 */
export function migrateStore(value: unknown): HabitStore | null {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.habits)) return null;
  const habits: Record<string, HabitRecord> = {};
  for (const [id, record] of Object.entries(value.habits)) {
    if (!isRecord(record)) return null;
    if (record.observations !== undefined) return null;
    const parsed = parseHabitRecord(id, record);
    if (parsed === null) return null;
    habits[id] = parsed;
  }
  return { version: 2, habits };
}

/** Parse a raw JSON document: v1 is migrated, v2 is validated, anything else throws. */
function parseStore(raw: string): HabitStore {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Malformed habits file: ${error instanceof Error ? error.message : String(error)}`);
  }
  const asV2 = validateStore(parsed);
  if (asV2 !== null) return asV2;
  const asV1 = migrateStore(parsed);
  if (asV1 !== null) return asV1;
  throw new Error('Habits file has an unsupported version or a malformed record.');
}

/** Parse a serialised store in memory. Malformed input throws. */
export const deserialise = (raw: string): HabitStore => parseStore(raw);

/** Record one observation. Assistant/system events are stored as history but move nothing. */
export function recordEvent(
  store: HabitStore,
  habitId: string,
  observation: HabitObservation,
): HabitStore {
  if (typeof observation?.id !== 'string' || observation.id.length === 0) {
    throw new Error('recordEvent requires a non-empty observation id');
  }
  if (!HABIT_EVENT_KINDS.has(observation.kind)) {
    throw new Error(`recordEvent requires a known event kind, got: ${String(observation.kind)}`);
  }
  if (!SOURCES.has(observation.source)) {
    throw new Error(`recordEvent requires an explicit source ('user' | 'assistant' | 'system'), got: ${String(observation.source)}`);
  }
  const habit = store.habits[habitId];
  if (!habit) return store;

  const existing = habit.observations[observation.id];
  if (existing !== undefined) return store; // already recorded this exact observation

  const kind = observation.kind;
  const source = observation.source;
  const effect: ObservationEffect =
    source === 'user' && habit.status === 'active'
      ? kind === 'violation' ? 'contradict'
        : kind === 'instruction' || kind === 'correction' || kind === 'confirmation' ? 'support'
          : 'note'
      : 'note';

  const supporting = habit.supporting + (effect === 'support' ? 1 : 0);
  const contradicting = habit.contradicting + (effect === 'contradict' ? 1 : 0);
  const next: HabitRecord = {
    ...habit,
    supporting,
    contradicting,
    confidence: confidenceOf(supporting, contradicting),
    updatedAt: Date.now(),
    observations: { ...habit.observations, [observation.id]: effect },
  };
  return { ...store, habits: { ...store.habits, [habitId]: next } };
}

export function addHabit(store: HabitStore, habit: Omit<HabitRecord, 'confidence'>): HabitStore {
  return {
    ...store,
    habits: {
      ...store.habits,
      [habit.id]: {
        ...habit,
        observations: habit.observations ?? {},
        confidence: confidenceOf(habit.supporting, habit.contradicting),
      },
    },
  };
}

/** For host.storage (≤ 64 KiB per value) or a project JSON file. Refuses an invalid store. */
export const serialise = (store: HabitStore): string => {
  if (validateStore(store) === null) throw new Error('Refusing to serialise an invalid habits store');
  return JSON.stringify(store, null, 2);
};

/** Disk seam. The panel passes host.readFile/host.writeFile; tests pass node:fs. */
export interface StoreIO {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
}

const NOT_FOUND_CODES = new Set(['ENOENT', 'NOT_FOUND']);

const isNotFound = (error: unknown): boolean => {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code !== 'string') return false;
  if (NOT_FOUND_CODES.has(code)) return true;
  // Windows fs errors don't always carry a code; fall back to message matching.
  const message = error instanceof Error ? error.message : String(error);
  return code === 'UNKNOWN' && /ENOENT|no such file/i.test(message);
};

/** Validate then persist. An invalid store throws before any write happens. */
export async function saveStore(io: StoreIO, path: string, store: HabitStore): Promise<void> {
  if (validateStore(store) === null) throw new Error('Refusing to save an invalid habits store');
  await io.writeFile(path, serialise(store));
}

/**
 * Load the store. A missing file is an empty store; a malformed file or any
 * other read failure throws — silently resetting on denial or corruption would
 * erase the user's habit history.
 */
export async function loadStore(io: StoreIO, path: string): Promise<HabitStore> {
  let raw: string;
  try {
    raw = await io.readFile(path);
  } catch (error) {
    if (isNotFound(error)) return emptyStore();
    throw error;
  }
  return parseStore(raw);
}

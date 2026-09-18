/**
 * Vitruvius ledger import — pure and host-agnostic.
 *
 * A ledger is the transport format for habits produced inside a harness
 * subagent (Vitruvius `agents/habit.md`), where the extension could not read
 * the conversation itself. It carries BOTH the candidates and the exact
 * transcript window they were derived from, so import runs the same validation
 * as live extraction: a cited id must exist in that window and be a user turn.
 *
 * A ledger without a window is rejected, not trusted. Fail closed.
 */

import {
  candidatesFrom,
  parseCandidatesJson,
  validateCandidateList,
  type AnalysisMessage,
  type HabitCandidate,
} from './extraction';
import { hashDirectory } from './habits';

export const LEDGER_VERSION = 1;

export const IMPORT_QUEUE_PREFIX = 'analysis:import:';
export const IMPORTED_LEDGER_PREFIX = 'analysis:imported:';
/** Title prefix marking a queue as imported; single source for paint + import. */
export const IMPORT_TITLE_PREFIX = 'Imported · ';

/** Review queue for imported candidates, scoped to the open project. */
export function importQueueKey(directory: string): string {
  return `${IMPORT_QUEUE_PREFIX}${hashDirectory(directory)}`;
}

/**
 * Idempotency marker: importing the same ledger text twice is a no-op.
 * Scoped to the project — the same ledger may legitimately feed two projects.
 */
export function importedLedgerKey(directory: string, fingerprint: string): string {
  return `${IMPORTED_LEDGER_PREFIX}${hashDirectory(directory)}:${fingerprint}`;
}

export interface ImportLedger {
  version: number;
  run: string;
  scope: string;
  window: AnalysisMessage[];
  candidates: HabitCandidate[];
}

export type ImportOutcome =
  | { status: 'ok'; ledger: ImportLedger; rejected: number }
  | { status: 'invalid'; reason: string };

const readWindow = (value: unknown): AnalysisMessage[] | null => {
  if (!Array.isArray(value) || value.length === 0) return null;
  const window: AnalysisMessage[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const record = entry as Record<string, unknown>;
    const id = record['id'];
    const role = record['role'];
    if (typeof id !== 'string' || id.length === 0) return null;
    if (role !== 'user' && role !== 'assistant') return null;
    if (seen.has(id)) return null; // duplicate ids make evidence ambiguous
    seen.add(id);
    window.push({
      id,
      role,
      text: typeof record['text'] === 'string' ? record['text'] : '',
      createdAt: typeof record['createdAt'] === 'number' ? record['createdAt'] : 0,
    });
  }
  return window;
};

/**
 * Parse and validate a ledger. Unknown versions are rejected rather than
 * guessed at, and the candidate list is checked against the embedded window.
 */
export function parseLedger(text: string): ImportOutcome {
  const parsed = parseCandidatesJson(text);
  if (!parsed || parsed.value === null || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
    return { status: 'invalid', reason: 'Not a JSON ledger object.' };
  }
  const record = parsed.value as Record<string, unknown>;

  // Accept 1 and "1": JSON has no integer/string distinction worth failing over.
  const rawVersion = record['version'];
  const version = typeof rawVersion === 'string' && rawVersion.trim().length > 0
    ? Number(rawVersion)
    : rawVersion;
  if (version !== LEDGER_VERSION) {
    return {
      status: 'invalid',
      reason: `Unsupported ledger version (expected ${LEDGER_VERSION}).`,
    };
  }

  const window = readWindow(record['window']);
  if (!window) {
    return { status: 'invalid', reason: 'Ledger has no usable transcript window.' };
  }

  const list = candidatesFrom(record);
  if (!list) {
    return { status: 'invalid', reason: 'Ledger has no candidate list.' };
  }

  const validated = validateCandidateList(list, window);
  if (!validated.ok) {
    return { status: 'invalid', reason: 'Ledger candidate list is malformed.' };
  }

  return {
    status: 'ok',
    rejected: validated.rejected,
    ledger: {
      version: LEDGER_VERSION,
      run: typeof record['run'] === 'string' ? record['run'] : '',
      scope: typeof record['scope'] === 'string' ? record['scope'] : '',
      window,
      candidates: validated.candidates,
    },
  };
}

/** Candidates already staged or kept are not proposed again on re-import. */
export function isDuplicateTitle(title: string, existing: ReadonlyArray<{ title: string }>): boolean {
  const normalized = title.replace(/\s+/g, ' ').trim().toLowerCase();
  return existing.some((item) => item.title.replace(/\s+/g, ' ').trim().toLowerCase() === normalized);
}

/** Merge candidate lists by id, preserving first-seen order. */
export function mergeCandidates(
  ...lists: ReadonlyArray<ReadonlyArray<HabitCandidate>>
): HabitCandidate[] {
  const merged: HabitCandidate[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const candidate of list) {
      if (seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      merged.push(candidate);
    }
  }
  return merged;
}

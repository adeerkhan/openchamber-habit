/**
 * Instruction-file application — pure and host-agnostic.
 *
 * Step 3 of the next-steps plan. Habits are written into the open project's
 * `AGENTS.md` inside a delimited block. Everything outside the markers is
 * preserved exactly; the only bytes this module ever changes are between
 * `MARKER_START` and `MARKER_END` (plus a separator when the block is new).
 *
 * A stored fingerprint of the content *outside* the markers detects edits made
 * elsewhere in the file since the last write. A mismatch stops the plan and
 * asks the user rather than writing.
 */

import { hashDirectory, hashText, redactSecrets } from './habits';

export const MARKER_START = '<!-- habit:start -->';
export const MARKER_END = '<!-- habit:end -->';
export const APPLIED_PREFIX = 'analysis:applied:';

export interface ApplyHabit {
  title: string;
  detail: string;
}

export interface DiffLine {
  kind: 'add' | 'remove';
  text: string;
}

export interface ApplyPlan {
  status: 'ready';
  /** The complete next file content. */
  next: string;
  /** The exact block that will be written between the markers. */
  block: string;
  diff: DiffLine[];
  addedLines: number;
  removedLines: number;
  hadBlock: boolean;
  redacted: boolean;
  /** Fingerprint of everything outside the markers. */
  outsideHash: string;
  habitCount: number;
}

export interface ApplyConflict {
  status: 'conflict';
  storedOutsideHash: string;
  currentOutsideHash: string;
  hadBlock: boolean;
}

export interface AppliedRecord {
  outsideHash: string;
  appliedAt: number;
  habitCount: number;
}

export function appliedRecordKey(directory: string): string {
  return `${APPLIED_PREFIX}${hashDirectory(directory)}`;
}

const cleanLine = (text: string): { text: string; redacted: boolean } =>
  redactSecrets(text.replace(/\s+/g, ' ').trim());

/** Build the block from habit text. Returns an empty block for no habits. */
export function buildHabitBlock(habits: ReadonlyArray<ApplyHabit>): { block: string; lines: string[]; redacted: boolean } {
  let redacted = false;
  const lines: string[] = [];
  for (const habit of habits) {
    const title = cleanLine(habit.title);
    if (title.redacted) redacted = true;
    if (title.text.length === 0) continue;
    const detail = cleanLine(habit.detail);
    if (detail.redacted) redacted = true;
    lines.push(detail.text.length > 0 ? `- ${title.text} — ${detail.text}` : `- ${title.text}`);
  }
  if (lines.length === 0) return { block: '', lines, redacted };
  return { block: [MARKER_START, ...lines, MARKER_END].join('\n'), lines, redacted };
}

export interface ExtractedBlock {
  before: string;
  block: string;
  after: string;
  hasBlock: boolean;
  /** Lines between the markers, without the markers themselves. */
  inner: string[];
}

export function extractHabitBlock(content: string): ExtractedBlock {
  const start = content.indexOf(MARKER_START);
  const end = content.indexOf(MARKER_END);
  if (start === -1 || end === -1 || end < start) {
    return { before: content, block: '', after: '', hasBlock: false, inner: [] };
  }
  const block = content.slice(start, end + MARKER_END.length);
  const parts = block.split('\n');
  const inner = parts.length > 2 ? parts.slice(1, -1) : [];
  return {
    before: content.slice(0, start),
    block,
    after: content.slice(end + MARKER_END.length),
    hasBlock: true,
    inner,
  };
}

/** Preserve the file exactly; only add the separator the new block needs. */
const appendBlock = (content: string, block: string): string => {
  const separator = content.length === 0 || content.endsWith('\n\n') ? '' : content.endsWith('\n') ? '\n' : '\n\n';
  return `${content}${separator}${block}\n`;
};

export function outsideHashOf(content: string): string {
  const extracted = extractHabitBlock(content);
  return hashText(`${extracted.before}${extracted.after}`);
}

/**
 * Plan a write. `storedOutsideHash` is the fingerprint recorded after the last
 * write, or `null` when there has never been one. A mismatch returns a
 * conflict; the caller must show it and ask before retrying with `null`.
 */
export function planApply(
  content: string,
  habits: ReadonlyArray<ApplyHabit>,
  storedOutsideHash: string | null,
): ApplyPlan | ApplyConflict {
  const extracted = extractHabitBlock(content);
  const currentOutsideHash = hashText(`${extracted.before}${extracted.after}`);
  if (storedOutsideHash !== null && storedOutsideHash !== currentOutsideHash) {
    return { status: 'conflict', storedOutsideHash, currentOutsideHash, hadBlock: extracted.hasBlock };
  }

  const built = buildHabitBlock(habits);
  let next: string;
  if (built.block.length === 0) {
    // Byte-pure removal: the blank lines around the block stay exactly as
    // they were, so the outside fingerprint stays consistent for the next
    // preview. (Unreachable from the panel, which refuses empty applies.)
    next = extracted.hasBlock ? `${extracted.before}${extracted.after}` : content;
  } else if (extracted.hasBlock) {
    next = `${extracted.before}${built.block}${extracted.after}`;
  } else {
    next = appendBlock(content, built.block);
  }

  const diff: DiffLine[] = [
    ...extracted.inner.map((text): DiffLine => ({ kind: 'remove', text })),
    ...built.lines.map((text): DiffLine => ({ kind: 'add', text })),
  ];

  return {
    status: 'ready',
    next,
    block: built.block,
    diff,
    addedLines: built.lines.length,
    removedLines: extracted.inner.length,
    hadBlock: extracted.hasBlock,
    redacted: built.redacted,
    outsideHash: currentOutsideHash,
    habitCount: built.lines.length,
  };
}

export function readAppliedRecord(value: unknown): AppliedRecord | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record['outsideHash'] !== 'string') return null;
  return {
    outsideHash: record['outsideHash'],
    appliedAt: typeof record['appliedAt'] === 'number' ? record['appliedAt'] : 0,
    habitCount: typeof record['habitCount'] === 'number' ? record['habitCount'] : 0,
  };
}

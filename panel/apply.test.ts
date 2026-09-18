import { describe, expect, test } from 'bun:test';
import {
  appliedRecordKey,
  buildHabitBlock,
  extractHabitBlock,
  MARKER_END,
  MARKER_START,
  outsideHashOf,
  planApply,
  readAppliedRecord,
} from './apply';
import { hashDirectory } from './habits';

const habits = [{ title: 'Use tabs', detail: '' }, { title: 'Named exports', detail: 'avoid default' }];

describe('buildHabitBlock', () => {
  test('writes one bullet per habit inside the markers', () => {
    const built = buildHabitBlock(habits);
    expect(built.lines).toEqual(['- Use tabs', '- Named exports — avoid default']);
    expect(built.block).toBe(`${MARKER_START}\n- Use tabs\n- Named exports — avoid default\n${MARKER_END}`);
  });

  test('redacts secrets and collapses whitespace', () => {
    const built = buildHabitBlock([{ title: 'Token  ghp_abcdefghijklmnopqrstuvwx', detail: 'a\n b' }]);
    expect(built.redacted).toBe(true);
    expect(built.block).not.toContain('ghp_');
    expect(built.lines[0]).toBe('- Token [redacted] — a b');
  });

  test('no habits means no block', () => {
    expect(buildHabitBlock([])).toEqual({ block: '', lines: [], redacted: false });
  });
});

describe('extractHabitBlock', () => {
  test('splits before, block, and after and keeps the inner lines', () => {
    const content = `# Title\n\nintro\n\n${MARKER_START}\n- A\n- B\n${MARKER_END}\n\noutro\n`;
    const extracted = extractHabitBlock(content);
    expect(extracted.hasBlock).toBe(true);
    expect(extracted.before).toContain('# Title');
    expect(extracted.after).toContain('outro');
    expect(extracted.inner).toEqual(['- A', '- B']);
  });

  test('content without a block is left whole', () => {
    const extracted = extractHabitBlock('just text');
    expect(extracted.hasBlock).toBe(false);
    expect(extracted.before).toBe('just text');
    expect(extracted.after).toBe('');
    expect(extracted.inner).toEqual([]);
  });
});

describe('outsideHashOf', () => {
  test('ignores the block but changes with the surrounding text', () => {
    const base = `${MARKER_START}\n- A\n${MARKER_END}`;
    expect(outsideHashOf(`one\n${base}`)).toBe(outsideHashOf(`one\n${MARKER_START}\n- B\n${MARKER_END}`));
    expect(outsideHashOf(`one\n${base}`)).not.toBe(outsideHashOf(`two\n${base}`));
  });
});

describe('planApply', () => {
  test('appends a new block without touching the existing content', () => {
    const content = '# Project rules\n\nSome prose.\n';
    const plan = planApply(content, habits, null);
    if (plan.status !== 'ready') throw new Error('expected ready');
    expect(plan.hadBlock).toBe(false);
    expect(plan.next.startsWith(content)).toBe(true);
    expect(plan.next).toContain(MARKER_START);
    expect(plan.addedLines).toBe(2);
    expect(plan.diff.every((line) => line.kind === 'add')).toBe(true);
  });

  test('replaces only the marked block and preserves text before and after byte-for-byte', () => {
    const content = `keep-before\n\n${MARKER_START}\n- Old\n${MARKER_END}\n\nkeep-after\n`;
    const plan = planApply(content, habits, null);
    if (plan.status !== 'ready') throw new Error('expected ready');
    expect(plan.hadBlock).toBe(true);
    expect(plan.next).toBe(`keep-before\n\n${MARKER_START}\n- Use tabs\n- Named exports — avoid default\n${MARKER_END}\n\nkeep-after\n`);
    expect(plan.removedLines).toBe(1);
    expect(plan.diff).toContainEqual({ kind: 'remove', text: '- Old' });
    expect(plan.diff).toContainEqual({ kind: 'add', text: '- Use tabs' });
  });

  test('a changed outside fingerprint stops the plan', () => {
    const content = `changed\n\n${MARKER_START}\n- Old\n${MARKER_END}`;
    const plan = planApply(content, habits, 'stalehash');
    expect(plan.status).toBe('conflict');
    if (plan.status !== 'conflict') throw new Error('expected conflict');
    expect(plan.hadBlock).toBe(true);
    expect(plan.currentOutsideHash).not.toBe('stalehash');
  });

  test('a matching outside fingerprint proceeds', () => {
    const content = `same\n\n${MARKER_START}\n- Old\n${MARKER_END}`;
    const plan = planApply(content, habits, outsideHashOf(content));
    expect(plan.status).toBe('ready');
  });

  test('empty habits remove an existing block and are a no-op otherwise', () => {
    const content = `before\n\n${MARKER_START}\n- Old\n${MARKER_END}\nafter`;
    const removed = planApply(content, [], null);
    if (removed.status !== 'ready') throw new Error('expected ready');
    // Both sides keep their exact bytes, so the removed block leaves its blank lines.
    expect(removed.next).toBe('before\n\n\nafter');
    const untouched = planApply('before\nafter', [], null);
    if (untouched.status !== 'ready') throw new Error('expected ready');
    expect(untouched.next).toBe('before\nafter');
  });

  test('an empty file receives the block cleanly', () => {
    const plan = planApply('', habits, null);
    if (plan.status !== 'ready') throw new Error('expected ready');
    expect(plan.next).toBe(`${MARKER_START}\n- Use tabs\n- Named exports — avoid default\n${MARKER_END}\n`);
  });
});

describe('applied records', () => {
  test('round-trips a stored fingerprint and ignores junk', () => {
    expect(readAppliedRecord({ outsideHash: 'abc', appliedAt: 5, habitCount: 2 })).toEqual({
      outsideHash: 'abc', appliedAt: 5, habitCount: 2,
    });
    expect(readAppliedRecord(null)).toBeNull();
    expect(readAppliedRecord({ appliedAt: 5 })).toBeNull();
  });

  test('the storage key is short and project-specific', () => {
    const key = appliedRecordKey('/a/very/long/project/path');
    expect(key.length).toBeLessThan(40);
    expect(key).toBe(appliedRecordKey('/a/very/long/project/path'));
    expect(key).not.toBe(appliedRecordKey('/a/other/project'));
    expect(key).toContain(hashDirectory('/a/very/long/project/path'));
  });
});

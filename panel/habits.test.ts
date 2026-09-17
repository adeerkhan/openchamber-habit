import { describe, expect, test } from 'bun:test';
import {
  cleanMemoryInput,
  readMemory,
  formatForCompose,
  HABIT_KEY_PREFIX,
  hashDirectory,
  isHabitKey,
  keyForMemory,
  parseRememberArgs,
  redactSecrets,
  visibleForDirectory,
  type HabitMemory,
} from './habits';

const mem = (over: Partial<HabitMemory> = {}): HabitMemory => ({
  id: 'h_1',
  title: 't',
  detail: '',
  scope: 'global',
  directory: null,
  directoryHash: null,
  source: { sessionId: null, sessionTitle: '', messageId: null, role: null },
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

describe('stored memories', () => {
  test('source metadata survives a storage round trip', () => {
    const memory = mem({ source: { sessionId: 's', sessionTitle: 'Fix', messageId: 'm', role: 'assistant' } });
    expect(readMemory(JSON.parse(JSON.stringify(memory)))).toEqual(memory);
  });

  test('invalid scopes and incomplete project identities are rejected', () => {
    for (const scope of [undefined, null, 'invalid']) expect(readMemory({ ...mem(), scope })).toBeNull();
    expect(readMemory(mem({ scope: 'project' }))).toBeNull();
  });

  test('missing or malformed sources have safe defaults', () => {
    for (const source of [undefined, null, [], 'invalid', { sessionId: 12, role: 'system' }]) {
      expect(readMemory({ id: 'h_1', title: 'Tabs', scope: 'global', source })?.source).toEqual(mem().source);
    }
    for (const value of [null, [], 'invalid', {}, { id: 1, title: 'Tabs' }]) {
      expect(readMemory(value)).toBeNull();
    }
  });
});

describe('cleanMemoryInput', () => {
  test('trims titles and limits details for both save paths', () => {
    expect(cleanMemoryInput('  Tabs  ', 'x'.repeat(4001))).toEqual({
      title: 'Tabs', detail: 'x'.repeat(4000), redacted: false,
    });
    expect(cleanMemoryInput('   ', '').title).toBe('');
  });

  test('redacts before truncating, including long private key blocks', () => {
    const detail = '-----BEGIN RSA PRIVATE KEY-----\n' + 'x'.repeat(4100) + '\n-----END RSA PRIVATE KEY-----';
    expect(cleanMemoryInput('ghp_abcdefghijklmnopqrstuvwx', detail)).toEqual({
      title: '[redacted]', detail: '[redacted]', redacted: true,
    });
  });
});

describe('keys', () => {
  test('directory hash is short, stable, hex', () => {
    const a = hashDirectory('C:\\proj\\x');
    const b = hashDirectory('C:\\proj\\x');
    expect(a).toBe(b);
    expect(a.length).toBe(8);
    expect(hashDirectory('C:\\proj\\y')).not.toBe(a);
  });

  test('keys stay far under the 128-char cap and carry the prefix', () => {
    const key = keyForMemory(mem({ id: 'h_abc', scope: 'project', directoryHash: 'deadbeef' }));
    expect(key.length).toBeLessThan(40);
    expect(isHabitKey(key)).toBe(true);
    expect(isHabitKey('other:1')).toBe(false);
    expect(HABIT_KEY_PREFIX).toBe('habit:');
  });
});

describe('redactSecrets', () => {
  test('clean text passes through untouched', () => {
    expect(redactSecrets('use tabs, not spaces')).toEqual({ text: 'use tabs, not spaces', redacted: false });
  });

  test('github tokens, api keys, private keys, basic-auth passwords go', () => {
    const input = 'key ghp_abcdefghijklmnopqrstuvwx and sk-ant-1234567890 plus https://u:p@host/x';
    const out = redactSecrets(input);
    expect(out.redacted).toBe(true);
    expect(out.text).not.toContain('ghp_');
    expect(out.text).not.toContain('sk-ant-');
    expect(out.text).not.toContain(':p@');
    expect(out.text).toContain('[redacted]');
  });

  test('private key blocks go whole', () => {
    const out = redactSecrets('a\n-----BEGIN RSA PRIVATE KEY-----\nzzz\n-----END RSA PRIVATE KEY-----\nb');
    expect(out.redacted).toBe(true);
    expect(out.text).not.toContain('zzz');
  });
});

describe('visibleForDirectory', () => {
  test('globals plus own directory, newest first', () => {
    const list = [
      mem({ id: 'g', scope: 'global', updatedAt: 1 }),
      mem({ id: 'mine', scope: 'project', directory: '/a', directoryHash: hashDirectory('/a'), updatedAt: 3 }),
      mem({ id: 'theirs', scope: 'project', directory: '/b', directoryHash: hashDirectory('/b'), updatedAt: 5 }),
      mem({ id: 'collision', scope: 'project', directory: '/other', directoryHash: hashDirectory('/a'), updatedAt: 6 }),
    ];
    expect(visibleForDirectory(list, '/a').map((m) => m.id)).toEqual(['mine', 'g']);
    expect(visibleForDirectory(list, null).map((m) => m.id)).toEqual(['g']);
  });
});

describe('formatForCompose', () => {
  test('title, detail, source in order; empty detail skipped', () => {
    expect(formatForCompose(mem({ title: 'Tabs', detail: '', source: { sessionId: null, sessionTitle: '', messageId: null, role: null } }))).toBe(
      '[habit] Tabs',
    );
    const full = formatForCompose(
      mem({ title: 'Tabs', detail: 'use them', source: { sessionId: 's', sessionTitle: 'Fix', messageId: null, role: null } }),
    );
    expect(full).toContain('[habit] Tabs');
    expect(full).toContain('use them');
    expect(full).toContain('(kept from "Fix")');
  });
});

describe('parseRememberArgs', () => {
  test('pipe splits title and detail; plain text is title-only', () => {
    expect(parseRememberArgs('tabs | use them always')).toEqual({ title: 'tabs', detail: 'use them always' });
    expect(parseRememberArgs('  tabs  ')).toEqual({ title: 'tabs', detail: '' });
    expect(parseRememberArgs('')).toEqual({ title: '', detail: '' });
  });
});

/**
 * Habit memory logic — pure, dependency-free.
 *
 * Memories live in host `storage` under short hashed keys (keys cap at 128
 * chars, so project directories are hashed, never embedded). Recall needs no
 * model: the panel matches by directory and inserts via `compose`.
 */

export type HabitScope = 'project' | 'global';

export interface HabitSource {
  sessionId: string | null;
  sessionTitle: string;
  messageId: string | null;
  role: 'user' | 'assistant' | null;
}

export interface HabitMemory {
  id: string;
  title: string;
  detail: string;
  scope: HabitScope;
  /** Full project identity; the hash only shortens storage keys. */
  directory: string | null;
  directoryHash: string | null;
  source: HabitSource;
  createdAt: number;
  updatedAt: number;
  /** Explicit feedback counts; absent on older memories. */
  supporting?: number;
  contradicting?: number;
}

export function readMemory(value: unknown): HabitMemory | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  if (typeof r['id'] !== 'string' || typeof r['title'] !== 'string') return null;
  const scope: HabitScope | null = r['scope'] === 'project' || r['scope'] === 'global' ? (r['scope'] as HabitScope) : null;
  if (scope === null) return null;
  if (scope === 'project' && (typeof r['directory'] !== 'string' || typeof r['directoryHash'] !== 'string')) return null;
  const directory = typeof r['directory'] === 'string' ? r['directory'] : null;
  const directoryHash = typeof r['directoryHash'] === 'string' ? r['directoryHash'] : null;
  const source = r['source'] !== null && typeof r['source'] === 'object' && !Array.isArray(r['source'])
    ? (r['source'] as Record<string, unknown>)
    : {};
  const role = source['role'];
  return {
    id: r['id'],
    title: r['title'],
    detail: typeof r['detail'] === 'string' ? r['detail'] : '',
    scope,
    directory,
    directoryHash,
    source: {
      sessionId: typeof source['sessionId'] === 'string' ? source['sessionId'] : null,
      sessionTitle: typeof source['sessionTitle'] === 'string' ? source['sessionTitle'] : '',
      messageId: typeof source['messageId'] === 'string' ? source['messageId'] : null,
      role: role === 'user' || role === 'assistant' ? role : null,
    },
    createdAt: typeof r['createdAt'] === 'number' ? r['createdAt'] : 0,
    updatedAt: typeof r['updatedAt'] === 'number' ? r['updatedAt'] : 0,
    ...(Number.isSafeInteger(r['supporting']) && (r['supporting'] as number) >= 0 ? { supporting: r['supporting'] as number } : {}),
    ...(Number.isSafeInteger(r['contradicting']) && (r['contradicting'] as number) >= 0 ? { contradicting: r['contradicting'] as number } : {}),
  };
}

/** Shared preparation for create and edit. Redaction is best-effort. */
export function cleanMemoryInput(title: string, detail: string): { title: string; detail: string; redacted: boolean } {
  const cleanedTitle = redactSecrets(title.trim());
  const cleanedDetail = redactSecrets(detail);
  return { title: cleanedTitle.text, detail: cleanedDetail.text.slice(0, 4000), redacted: cleanedTitle.redacted || cleanedDetail.redacted };
}

export const HABIT_KEY_PREFIX = 'habit:';

/** Short stable hash for directory namespacing (storage keys cap at 128 chars). */
export function hashDirectory(directory: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < directory.length; i += 1) {
    hash ^= directory.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function keyForMemory(memory: Pick<HabitMemory, 'id' | 'scope' | 'directoryHash'>): string {
  return memory.scope === 'global'
    ? `${HABIT_KEY_PREFIX}global:${memory.id}`
    : `${HABIT_KEY_PREFIX}p:${memory.directoryHash ?? 'none'}:${memory.id}`;
}

export function isHabitKey(key: string): boolean {
  return key.startsWith(HABIT_KEY_PREFIX);
}

export function newMemoryId(): string {
  return `h_${Date.now().toString(36)}_${Math.floor(Math.random() * 0xffff).toString(36)}`;
}

const SECRET_PATTERNS: Array<RegExp> = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
  /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{10,}\b/g,
  /\bsk-[A-Za-z0-9]{16,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /\b[Bb]earer [A-Za-z0-9._~+/-]{10,}={0,2}\b/g,
  /:\/\/[^/\s:]+:[^/\s@]+@/g,
];

/**
 * Strip secrets before anything reaches storage. Returns the cleaned text
 * and whether anything was removed (the UI must say so out loud).
 */
export function redactSecrets(text: string): { text: string; redacted: boolean } {
  let redacted = false;
  let next = text;
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(next)) {
      redacted = true;
      pattern.lastIndex = 0;
      next = next.replace(pattern, '[redacted]');
    }
  }
  return { text: next, redacted };
}

/** Memories visible for a directory: globals plus that directory's own. */
export function visibleForDirectory(
  memories: ReadonlyArray<HabitMemory>,
  directory: string | null,
): Array<HabitMemory> {
  return memories
    .filter((m) => m.scope === 'global' || (directory !== null && m.directory === directory))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Text inserted into the draft on recall. Source stays attached. */
export function formatForCompose(memory: HabitMemory): string {
  const lines = [`[habit] ${memory.title}`];
  if (memory.detail.trim().length > 0) lines.push(memory.detail.trim());
  if (memory.source.sessionTitle.length > 0) lines.push(`(kept from "${memory.source.sessionTitle}")`);
  return lines.join('\n');
}

/** Parse `/remember` args: `title | detail` or plain text as title. */
export function parseRememberArgs(args: string): { title: string; detail: string } {
  const pipe = args.indexOf('|');
  if (pipe === -1) return { title: args.trim(), detail: '' };
  return { title: args.slice(0, pipe).trim(), detail: args.slice(pipe + 1).trim() };
}

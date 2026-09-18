import { connectHost } from '@openchamber/sdk';
import { applyHostReady } from '@openchamber/sdk/ui';
import type { SessionSnapshot } from '@openchamber/sdk';
import {
  formatForCompose,
  hashDirectory,
  hashText,
  isHabitKey,
  keyForMemory,
  newMemoryId,
  parseRememberArgs,
  readMemory,
  cleanMemoryInput,
  visibleForDirectory,
  type HabitMemory,
  type HabitScope,
} from './habits';
import {
  analyzeSession,
  readStoredReviewQueue,
  reviewQueueKey,
  type StoredReviewQueue,
} from './extraction';
import {
  IMPORT_TITLE_PREFIX,
  importQueueKey,
  importedLedgerKey,
  isDuplicateTitle,
  mergeCandidates,
  parseLedger,
} from './import-ledger';
import {
  appliedRecordKey,
  extractHabitBlock,
  outsideHashOf,
  planApply,
  readAppliedRecord,
  type ApplyConflict,
  type ApplyPlan,
} from './apply';

const host = connectHost();
const root = document.querySelector('#root');
if (!root) throw new Error('Missing root');

root.innerHTML =
  '<main class="habit-main">' +
  '<p class="habit-counts" data-view="counts" role="status"></p>' +
  '<section class="card" aria-label="Keep a habit"><section data-view="capture"></section></section>' +
  '<section data-view="review" aria-label="Suggested habits"></section>' +
  '<section class="card" data-view="import" aria-label="Import from Vitruvius"></section>' +
  '<section data-view="list"></section>' +
  '<section class="card" data-view="apply" aria-label="Use in future sessions"></section>' +
  '<p class="notice" data-view="notice" role="status" aria-live="polite"></p>' +
  '</main>';

const esc = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const countsView = root.querySelector('[data-view="counts"]') as HTMLElement;
const captureView = root.querySelector('[data-view="capture"]') as HTMLElement;
const reviewView = root.querySelector('[data-view="review"]') as HTMLElement;
const importView = root.querySelector('[data-view="import"]') as HTMLElement;
const listView = root.querySelector('[data-view="list"]') as HTMLElement;
const applyView = root.querySelector('[data-view="apply"]') as HTMLElement;
const noticeView = root.querySelector('[data-view="notice"]') as HTMLElement;

// The capture form renders once: repainting it would wipe typed input on
// every session switch, refresh, and action prefill.
captureView.innerHTML =
  '<h2 class="habit-section-title">Keep a habit</h2>' +
  '<div class="capture-grid">' +
  '<label class="field-label" for="habit-title">Title</label>' +
  '<input id="habit-title" data-field="title" placeholder="Title — e.g. tabs, not spaces" style="width:100%;box-sizing:border-box;" />' +
  '<label class="field-label" for="habit-detail">Detail</label>' +
  '<textarea id="habit-detail" data-field="detail" rows="2" placeholder="Detail (optional)" style="width:100%;box-sizing:border-box;"></textarea>' +
  '<div class="capture-row">' +
  '<label class="field-label" for="habit-scope">Scope</label>' +
  '<select id="habit-scope" data-field="scope"><option value="project">This project</option><option value="global">Everywhere</option></select>' +
  '<button data-action="save" type="button" class="primary">Remember</button>' +
  '</div></div>';

// The import form also renders once so a pasted ledger survives repaints.
importView.innerHTML =
  '<h2 class="habit-section-title">Import from Vitruvius</h2>' +
  '<p class="habit-meta">Paste a ledger from a Vitruvius run, or run <code>/habit-import &lt;path&gt;</code>. ' +
  'Candidates are validated against the window inside the ledger before review.</p>' +
  '<textarea data-field="ledger" rows="3" placeholder="Paste ledger JSON" style="width:100%;box-sizing:border-box;" aria-label="Ledger JSON"></textarea>' +
  '<div class="actions"><button data-import-action="import" type="button" class="sm">Import ledger</button></div>';

let directory: string | null = null;
let session: SessionSnapshot | null = null;
let memories: Array<HabitMemory> = [];
let editingKey: string | null = null;
/** Live edit input plus the text the editor opened against, per storage key. */
const editDrafts = new Map<string, { title: string; detail: string; baselineTitle: string; baselineDetail: string }>();
/** Provenance of the item this surface was opened for (action draft). */
let actionDraft: { directory: string | null; source: HabitMemory['source'] } | null = null;
let lastItemSignature: string | null = null;
let lastSessionSignature: string | null = null;
let lastSessionHandledAt = 0;
let loaded = false;
let refreshEpoch = 0;
let refreshFailed = false;
let queueDepth = 0;

/** Completed turns since the user last reviewed. A nudge, not a ledger. */
let unseenTurns = 0;
/**
 * The SDK derives a lifecycle event from the session on every `ready`, so an
 * idle snapshot looks like a completed turn. The derived event arrives in the
 * same synchronous dispatch right after our `onReady` runs; a real turn's
 * lifecycle arrives without a fresh `ready`. Timestamp comparison covers both
 * the sync case and a host that batches the push asynchronously.
 */
const READY_LIFECYCLE_WINDOW_MS = 750;
let lastReadyAt = 0;
/** Staged candidates for the session they were extracted from. */
let reviewQueue: StoredReviewQueue | null = null;
let reviewSessionId: string | null = null;
let reviewEpoch = 0;
/** Staged candidates imported from a Vitruvius ledger; scoped to the project. */
let importQueue: StoredReviewQueue | null = null;
let importEpoch = 0;
let analyzing = false;
let applyPlan: ApplyPlan | null = null;
let applyConflict: ApplyConflict | null = null;
let applyBusy = false;
/**
 * The applied record as it was when the preview was built, serialized for
 * comparison. A second panel writing the same file between preview and
 * confirm must stop this write, even when the outside content is unchanged.
 */
let applyRecordBaseline: string | null = null;

/** A session action item, as the host hands it over. */
interface SessionItemLike {
  kind: 'session';
  sessionId: string;
  sessionTitle: string;
  directory: string | null;
  messages?: Array<{ id: string; role: 'user' | 'assistant'; text: string; createdAt: number }>;
  truncated?: boolean;
}

/**
 * The host re-delivers the same item on every `ready`, so a repeated `ready`
 * for an already-handled session item must not re-toast. A user click within
 * this window after handling is treated as the same delivery.
 */
const SESSION_REPLAY_WINDOW_MS = 1_500;

const analysisHost = {
  storage: {
    get: (key: string): Promise<unknown> => host.storage.get(key),
    set: async (key: string, value: unknown): Promise<void> => {
      await host.storage.set(key, JSON.parse(JSON.stringify(value)));
    },
    delete: (key: string): Promise<void> => host.storage.delete(key),
  },
  generate: (request: { prompt: string; system?: string; maxOutputTokens?: number }): Promise<{ text: string }> =>
    host.generate(request),
};

const say = (text: string): void => {
  noticeView.textContent = text;
};

/** A succeeded write must not bury a failed refresh: say both. */
const sayAfterRefresh = (ok: string, failed: string): void => {
  say(refreshFailed ? failed : ok);
};

/**
 * Step 1 nudge. Zero clears rather than showing "0"; the host also clears the
 * badge when the panel opens, so this is repressed on the next completed turn.
 * A badge failure is said once, not on every turn.
 */
let badgeFailed = false;
const paintBadge = (): void => {
  void host.setBadge(unseenTurns > 0 ? unseenTurns : null).then(
    () => {
      badgeFailed = false;
    },
    () => {
      if (!badgeFailed) {
        badgeFailed = true;
        say('Could not update the turn badge.');
      }
    },
  );
};

/** One storage mutation at a time; competing actions are refused, not queued. */
const runExclusive = async <T>(task: () => Promise<T>): Promise<T | undefined> => {
  if (queueDepth > 0) {
    say('Another action is still saving — try again.');
    return undefined;
  }
  queueDepth += 1;
  try {
    return await task();
  } finally {
    queueDepth -= 1;
  }
};

const refresh = async (): Promise<void> => {
  const epoch = ++refreshEpoch;
  try {
    const keys = await host.storage.keys();
    const found: Array<HabitMemory> = [];
    for (const key of keys.filter(isHabitKey)) {
      const value = await host.storage.get(key);
      if (value !== undefined) {
        const memory = readMemory(value);
        if (memory) found.push(memory);
      }
    }
    if (epoch !== refreshEpoch) return; // a newer refresh completed; drop this stale snapshot
    memories = found.sort((a, b) => b.updatedAt - a.updatedAt);
    loaded = true;
  } catch {
    if (epoch !== refreshEpoch) return;
    say('Storage read failed.');
    refreshFailed = true;
    paint();
    return;
  }
  refreshFailed = false;
  paint();
};

const saveMemory = async (input: {
  title: string;
  detail: string;
  scope: HabitScope;
  directory: string | null;
  source: HabitMemory['source'];
}): Promise<boolean> => {
  const result = await runExclusive(async () => {
    const cleaned = cleanMemoryInput(input.title, input.detail);
    if (cleaned.title.length === 0) {
      say('Give the habit a title first.');
      return false;
    }
    const dirHash = input.scope === 'project' && input.directory !== null ? hashDirectory(input.directory) : null;
    if (input.scope === 'project' && dirHash === null) {
      say('No project open; save as global instead.');
      return false;
    }
    const now = Date.now();
    const memory: HabitMemory = {
      id: newMemoryId(),
      title: cleaned.title,
      detail: cleaned.detail,
      scope: input.scope,
      directory: input.scope === 'project' ? input.directory : null,
      directoryHash: dirHash,
      source: input.source,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await host.storage.set(keyForMemory(memory), JSON.parse(JSON.stringify(memory)));
    } catch {
      say('Save failed.');
      return false;
    }
    await refresh();
    sayAfterRefresh(
      cleaned.redacted ? 'Kept with recognized secrets redacted.' : 'Kept.',
      'Kept, but refreshing the list failed.',
    );
    return true;
  });
  return result ?? false;
};

type QueueOrigin = 'session' | 'import';

const reviewSources = (): Array<{ origin: QueueOrigin; queue: StoredReviewQueue }> => {
  const sources: Array<{ origin: QueueOrigin; queue: StoredReviewQueue }> = [];
  if (reviewQueue && reviewQueue.candidates.length > 0) sources.push({ origin: 'session', queue: reviewQueue });
  if (importQueue && importQueue.candidates.length > 0) sources.push({ origin: 'import', queue: importQueue });
  return sources;
};

const queueForCandidate = (candidateId: string): { origin: QueueOrigin; queue: StoredReviewQueue } | null =>
  reviewSources().find((source) => source.queue.candidates.some((candidate) => candidate.id === candidateId)) ?? null;

const paintReview = (): void => {
  const sources = reviewSources();
  if (sources.length === 0) {
    reviewView.innerHTML = '';
    return;
  }
  const cards = sources
    .flatMap(({ origin, queue }) =>
      queue.candidates.map((candidate) => {
        const alreadyKept = memories.some(
          (m) => m.title.trim().toLowerCase() === candidate.title.trim().toLowerCase(),
        );
        const evidence = candidate.evidence.length;
        const originBadge = origin === 'import'
          ? '<span class="badge">imported · Vitruvius</span>'
          : queue.directory === null
            ? '<span class="badge">suggested · global</span>'
            : '<span class="badge project">suggested · this project</span>';
        return (
          `<article class="card" data-candidate="${esc(candidate.id)}">` +
          `<div class="habit-meta">${originBadge}` +
          `<span>${evidence} user message${evidence === 1 ? '' : 's'}</span>` +
          (alreadyKept ? '<span>already kept</span>' : '') +
          '</div>' +
          `<h3 class="habit-title">${esc(candidate.title)}</h3>` +
          (candidate.detail.trim().length > 0 ? `<p class="habit-detail">${esc(candidate.detail)}</p>` : '') +
          '<div class="actions">' +
          '<button data-candidate-action="keep" type="button" class="primary sm">Keep</button>' +
          '<button data-candidate-action="dismiss" type="button" class="ghost sm">Dismiss</button>' +
          '</div></article>'
        );
      }),
    )
    .join('');
  const total = sources.reduce((sum, source) => sum + source.queue.candidates.length, 0);
  const fromParts = sources.map(({ origin, queue }) => origin === 'import'
    ? `imported${outcomeLabel(queue) ? ` from ${esc(outcomeLabel(queue))}` : ''}`
    : `from “${esc(queue.sessionTitle || 'this session')}”`);
  const from = fromParts.length > 2 ? `${fromParts.slice(0, 2).join(' · ')} · …` : fromParts.join(' · ');
  const omitted = sources.some(({ queue }) => queue.omitted > 0 || queue.truncated)
    ? '<p class="habit-meta">Some older messages were left out.</p>'
    : '';
  reviewView.innerHTML =
    '<h2 class="habit-section-title">Suggested habits</h2>' +
    `<p class="habit-meta">${from} — review before keeping.</p>` +
    omitted +
    `<div class="habit-list">${cards}</div>` +
    (total > 1
      ? '<div class="actions subtle"><button data-candidate-action="dismiss-all" type="button" class="ghost sm">Dismiss all</button></div>'
      : '');
};

/** `<run>` from an `Imported · <run>` queue title; empty when absent. */
const outcomeLabel = (queue: StoredReviewQueue): string =>
  queue.sessionTitle.startsWith(IMPORT_TITLE_PREFIX)
    ? queue.sessionTitle.slice(IMPORT_TITLE_PREFIX.length)
    : '';

const loadReviewQueue = async (sessionId: string | null): Promise<void> => {
  const epoch = ++reviewEpoch;
  if (sessionId === null) {
    reviewSessionId = null;
    reviewQueue = null;
    paintReview();
    return;
  }
  try {
    const stored = await host.storage.get(reviewQueueKey(sessionId));
    if (epoch !== reviewEpoch) return;
    const queue = readStoredReviewQueue(stored);
    reviewSessionId = sessionId;
    reviewQueue = queue && queue.candidates.length > 0 ? queue : null;
  } catch {
    if (epoch !== reviewEpoch) return;
    reviewSessionId = sessionId;
    reviewQueue = null;
  }
  paintReview();
};

const persistReviewQueue = async (): Promise<boolean> => {
  if (reviewSessionId === null) return true;
  try {
    if (!reviewQueue || reviewQueue.candidates.length === 0) {
      await host.storage.delete(reviewQueueKey(reviewSessionId));
    } else {
      await host.storage.set(reviewQueueKey(reviewSessionId), JSON.parse(JSON.stringify(reviewQueue)));
    }
    return true;
  } catch {
    say('Could not update the review queue.');
    return false;
  }
};

const loadImportQueue = async (dir: string | null): Promise<void> => {
  const epoch = ++importEpoch;
  if (dir === null) {
    importQueue = null;
    paintReview();
    return;
  }
  try {
    const stored = await host.storage.get(importQueueKey(dir));
    if (epoch !== importEpoch) return;
    const queue = readStoredReviewQueue(stored);
    importQueue = queue && queue.candidates.length > 0 ? queue : null;
  } catch {
    if (epoch !== importEpoch) return;
    importQueue = null;
  }
  paintReview();
};

const persistImportQueue = async (): Promise<boolean> => {
  if (directory === null) return true;
  try {
    if (!importQueue || importQueue.candidates.length === 0) {
      await host.storage.delete(importQueueKey(directory));
    } else {
      await host.storage.set(importQueueKey(directory), JSON.parse(JSON.stringify(importQueue)));
    }
    return true;
  } catch {
    say('Could not update the imported queue.');
    return false;
  }
};

const setQueue = (origin: QueueOrigin, queue: StoredReviewQueue | null): void => {
  if (origin === 'session') reviewQueue = queue;
  else importQueue = queue;
};

const keepCandidate = async (candidateId: string): Promise<void> => {
  const found = queueForCandidate(candidateId);
  if (!found) return;
  const { origin, queue } = found;
  const candidate = queue.candidates.find((item) => item.id === candidateId);
  if (!candidate) return;
  // Pin scope to the queue's recorded project. Session queues carry their own
  // directory (null means a global session); import queues are always project
  // scoped. Never fall back to the current directory — that misattributes a
  // suggestion after a project switch.
  const targetDirectory = queue.directory;
  const scope: HabitScope = targetDirectory !== null ? 'project' : 'global';
  const evidence = candidate.evidence[0];
  // Imported evidence ids point at Vitruvius turn ids, not host messages, so
  // they are dangling pointers here. Provenance is the queue title
  // ("Imported · <run>"), which names the ledger file to re-open — not an id
  // Habit cannot resolve.
  const imported = origin === 'import';
  const ok = await saveMemory({
    title: candidate.title,
    detail: candidate.detail,
    scope,
    directory: targetDirectory,
    source: {
      sessionId: origin === 'session' ? reviewSessionId : null,
      sessionTitle: queue.sessionTitle,
      messageId: imported ? null : (evidence?.messageId ?? null),
      role: imported ? null : (evidence ? 'user' : null),
    },
  });
  if (!ok) return;
  const next = queue.candidates.filter((item) => item.id !== candidateId);
  setQueue(origin, next.length > 0 ? { ...queue, candidates: next } : null);
  const saved = origin === 'session' ? await persistReviewQueue() : await persistImportQueue();
  if (!saved) {
    setQueue(origin, queue);
    paint();
    return;
  }
  paint();
};

const dismissCandidate = async (candidateId: string): Promise<void> => {
  const found = queueForCandidate(candidateId);
  if (!found) return;
  const { origin, queue } = found;
  const next = queue.candidates.filter((item) => item.id !== candidateId);
  setQueue(origin, next.length > 0 ? { ...queue, candidates: next } : null);
  const saved = origin === 'session' ? await persistReviewQueue() : await persistImportQueue();
  if (!saved) {
    setQueue(origin, queue);
    paint();
    return;
  }
  paint();
};

const dismissAllCandidates = async (): Promise<void> => {
  const prevSession = reviewQueue;
  const prevImport = importQueue;
  if (!prevSession && !prevImport) return;
  reviewQueue = null;
  importQueue = null;
  const sessionSaved = await persistReviewQueue();
  const importSaved = await persistImportQueue();
  if (!sessionSaved || !importSaved) {
    reviewQueue = prevSession;
    importQueue = prevImport;
    paint();
    return;
  }
  say('Suggestions dismissed.');
  paint();
};

/**
 * Stage a Vitruvius ledger into the project's import queue. Validation runs
 * against the window embedded in the ledger — the same contract as live
 * extraction. Re-importing the same text is a no-op.
 */
const runLedgerImport = async (text: string, sourceLabel: string): Promise<void> => {
  if (directory === null) {
    say('Open a project before importing.');
    return;
  }
  const outcome = parseLedger(text);
  if (outcome.status === 'invalid') {
    say(`Import failed: ${outcome.reason}`);
    return;
  }

  // Length plus two salted 32-bit hashes: a bare FNV id collides across
  // ledgers often enough to silently swallow a real import.
  const fingerprint = `${text.length}:${hashText(text)}:${hashText(`${text.length}:${text}`)}`;
  const markerKey = importedLedgerKey(directory, fingerprint);
  try {
    if ((await host.storage.get(markerKey)) !== undefined) {
      say('That ledger was already imported.');
      return;
    }
  } catch {
    // An unreadable marker only means the exact-reimport guard is unavailable;
    // the title dedupe below still prevents duplicates.
  }

  // Only habits visible here block an import: a same-titled habit in another
  // project is a different scope, not a duplicate.
  const existing: Array<{ title: string }> = [
    ...(reviewQueue?.candidates ?? []),
    ...(importQueue?.candidates ?? []),
    ...visibleForDirectory(memories, directory),
  ];
  const fresh = outcome.ledger.candidates.filter((candidate) => !isDuplicateTitle(candidate.title, existing));

  if (fresh.length > 0) {
    // Re-read the stored queue: a load that started before this import must
    // not have its candidates clobbered by our in-memory base.
    let stored: StoredReviewQueue | null = null;
    try {
      stored = readStoredReviewQueue(await host.storage.get(importQueueKey(directory)));
    } catch {
      stored = null;
    }
    importEpoch += 1;
    importQueue = {
      candidates: mergeCandidates(stored?.candidates ?? [], importQueue?.candidates ?? [], fresh),
      sessionTitle: importQueue?.sessionTitle
        ?? stored?.sessionTitle
        ?? `${IMPORT_TITLE_PREFIX}${outcome.ledger.run || sourceLabel}`,
      directory,
      analyzedAt: Date.now(),
      omitted: 0,
      truncated: false,
    };
    const saved = await persistImportQueue();
    if (!saved) return;
  }

  // Mark exact re-imports only when something staged: an all-duplicate import
  // must stay retryable after the blocking habit is deleted.
  if (fresh.length > 0) {
    try {
      await host.storage.set(
        markerKey,
        JSON.parse(JSON.stringify({ at: Date.now(), source: sourceLabel, staged: fresh.length })),
      );
    } catch {
      // Best-effort marker; not worth failing an otherwise-good import.
    }
  }

  if (fresh.length === 0) {
    say(outcome.ledger.candidates.length === 0
      ? 'That ledger has no candidates.'
      : 'Nothing new in that ledger; every candidate is already staged or kept.');
  } else {
    const rejected = outcome.rejected > 0 ? ` (${outcome.rejected} rejected.)` : '';
    say(`${fresh.length} imported candidate${fresh.length === 1 ? '' : 's'} ready to review.${rejected}`);
  }
  paint();
};

const prefillSessionFallback = (item: SessionItemLike): void => {
  actionDraft = {
    directory: item.directory,
    source: { sessionId: item.sessionId, sessionTitle: item.sessionTitle, messageId: null, role: null },
  };
  const titleEl = captureView.querySelector('[data-field="title"]') as HTMLInputElement | null;
  const detailEl = captureView.querySelector('[data-field="detail"]') as HTMLTextAreaElement | null;
  if (titleEl) titleEl.value = item.sessionTitle;
  if (detailEl) detailEl.focus();
  say('Session attached — add a title and Remember. Conversation access is off, so Habit cannot suggest habits.');
};

const analysisErrorText = (code: string | undefined): string => {
  switch (code) {
    case 'NO_MODEL':
      return 'No Small Model is configured, so Habit cannot analyze this session.';
    case 'MODEL_FAILED':
      return 'The Small Model call failed; nothing was saved.';
    case 'NOT_GRANTED':
      return 'Model access was not approved for Habit.';
    case 'HOST_TIMEOUT':
      return 'The Small Model took too long; nothing was saved.';
    case 'DISABLED':
      return 'Habit is paused in Settings.';
    default:
      return 'Session analysis failed; nothing was saved.';
  }
};

const runSessionAnalysis = async (item: SessionItemLike): Promise<void> => {
  if (analyzing) {
    say('Already analyzing a session — one moment.');
    return;
  }
  analyzing = true;
  // The user has acted on the nudge, so it is cleared now — not on a timer.
  unseenTurns = 0;
  paintBadge();
  say('Reading the new turns…');
  paint();
  try {
    const messages = Array.isArray(item.messages)
      ? item.messages.map((message) => ({
          id: message.id,
          role: message.role,
          text: message.text,
          createdAt: message.createdAt,
        }))
      : undefined;
    if (!messages || messages.length === 0) {
      prefillSessionFallback(item);
      return;
    }

    const result = await analyzeSession(
      {
        sessionId: item.sessionId,
        sessionTitle: item.sessionTitle,
        directory: item.directory,
        messages,
        truncated: item.truncated === true,
      },
      analysisHost,
    );

    if (result.status === 'no-messages') {
      prefillSessionFallback(item);
      return;
    }
    if (result.status === 'empty') {
      say('Nothing new to review since last time.');
      void host.toast({ kind: 'info', message: 'Nothing new to review since last time.' });
      return;
    }
    if (result.status === 'invalid') {
      say('The model’s answer could not be read, so nothing was saved. Try again.');
      void host.toast({ kind: 'error', message: 'Habit could not read the model’s answer; nothing was saved.' });
      return;
    }

    // status === 'ok'
    reviewEpoch += 1;
    reviewSessionId = item.sessionId;
    reviewQueue = result.queue.candidates.length > 0 ? result.queue : null;
    paint();
    const count = result.queue.candidates.length;
    const omittedNote = result.queue.omitted > 0 || result.queue.truncated ? ' Some older messages were left out.' : '';
    if (count === 0) {
      say(`No durable habits found in the new turns.${omittedNote}`);
      void host.toast({ kind: 'info', message: 'No durable habits found.' });
    } else {
      say(`${count} suggestion${count === 1 ? '' : 's'} ready to review.${omittedNote}`);
      void host.toast({ kind: 'success', message: `${count} habit suggestion${count === 1 ? '' : 's'} ready to review.` });
    }
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    const text = analysisErrorText(typeof code === 'string' ? code : undefined);
    say(text);
    void host.toast({ kind: 'error', message: text });
  } finally {
    analyzing = false;
    paint();
  }
};

const projectHabitsForApply = (): Array<HabitMemory> =>
  directory === null ? [] : visibleForDirectory(memories, directory).filter((memory) => memory.scope === 'project');

const readAgentsFile = async (): Promise<string> => {
  try {
    const { content } = await host.readFile('AGENTS.md');
    return content;
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === 'NOT_FOUND') return '';
    throw error;
  }
};

const fileErrorText = (error: unknown): string => {
  switch ((error as { code?: unknown } | null)?.code) {
    case 'NOT_GRANTED':
      return 'File access was not approved for Habit.';
    case 'NO_DIRECTORY':
      return 'No project is open.';
    case 'BAD_PATH':
      return 'That file path is not allowed.';
    case 'FILE_TOO_LARGE':
      return 'AGENTS.md is too large to rewrite safely.';
    case 'DENIED':
      return 'The system refused access to AGENTS.md.';
    default:
      return 'Could not read or write AGENTS.md.';
  }
};

const beginApply = async (override: boolean): Promise<void> => {
  if (directory === null) {
    say('No project open to apply habits to.');
    return;
  }
  const habits = projectHabitsForApply();
  if (habits.length === 0) {
    say('No project habits to apply yet.');
    return;
  }
  applyBusy = true;
  paintApply();
  try {
    const content = await readAgentsFile();
    const record = readAppliedRecord(await host.storage.get(appliedRecordKey(directory)));
    applyRecordBaseline = JSON.stringify(record);
    const plan = planApply(
      content,
      habits.map((memory) => ({ title: memory.title, detail: memory.detail })),
      override ? null : (record?.outsideHash ?? null),
    );
    if (plan.status === 'conflict') {
      applyConflict = plan;
      applyPlan = null;
    } else {
      applyPlan = plan;
      applyConflict = null;
    }
  } catch (error) {
    say(fileErrorText(error));
  } finally {
    applyBusy = false;
    paintApply();
  }
};

const confirmApply = async (): Promise<void> => {
  const plan = applyPlan;
  if (!plan || directory === null) return;
  applyBusy = true;
  paintApply();
  try {
    // Re-read: an edit between the preview and this click must not be written over.
    const content = await readAgentsFile();
    const record = readAppliedRecord(await host.storage.get(appliedRecordKey(directory)));
    if (JSON.stringify(record) !== applyRecordBaseline) {
      applyPlan = null;
      applyConflict = {
        status: 'conflict',
        storedOutsideHash: record?.outsideHash ?? '',
        currentOutsideHash: outsideHashOf(content),
        hadBlock: extractHabitBlock(content).hasBlock,
      };
      say('AGENTS.md or its apply record changed while you were reviewing — nothing was written. Preview again.');
      return;
    }
    const currentOutsideHash = outsideHashOf(content);
    if (currentOutsideHash !== plan.outsideHash) {
      applyPlan = null;
      const record = readAppliedRecord(await host.storage.get(appliedRecordKey(directory)));
      applyConflict = {
        status: 'conflict',
        storedOutsideHash: record?.outsideHash ?? '',
        currentOutsideHash,
        hadBlock: extractHabitBlock(content).hasBlock,
      };
      say('AGENTS.md changed while you were reviewing — nothing was written. Preview again.');
      return;
    }
    await host.writeFile('AGENTS.md', plan.next);
    const readBack = await readAgentsFile();
    if (!plan.block || !readBack.includes(plan.block)) {
      say('The write was reported but the Habit block was not found on read-back; treat this as not applied.');
      return;
    }
    await host.storage.set(
      appliedRecordKey(directory),
      JSON.parse(JSON.stringify({ outsideHash: plan.outsideHash, appliedAt: Date.now(), habitCount: plan.habitCount })),
    );
    applyPlan = null;
    applyRecordBaseline = null;
    say('Wrote the Habit block to AGENTS.md. Start a fresh session for it to load.');
  } catch (error) {
    say(fileErrorText(error));
  } finally {
    applyBusy = false;
    paintApply();
  }
};

const paintApply = (): void => {
  const projectHabits = projectHabitsForApply();
  if (applyConflict) {
    applyView.innerHTML =
      '<h2 class="habit-section-title">AGENTS.md changed outside Habit’s block</h2>' +
      '<p class="habit-detail">Habit only rewrites the text between its markers and keeps everything else, but the file changed since the last apply. Review it, then preview the replacement.</p>' +
      '<div class="actions">' +
      '<button data-apply-action="override" type="button" class="primary sm">Preview replacement</button>' +
      '<button data-apply-action="cancel" type="button" class="ghost sm">Cancel</button>' +
      '</div>';
    return;
  }
  if (applyPlan) {
    const diff = applyPlan.diff
      .map((line) => `<div class="diff-line ${line.kind}">${line.kind === 'add' ? '+' : '−'} ${esc(line.text)}</div>`)
      .join('');
    applyView.innerHTML =
      `<h2 class="habit-section-title">${applyPlan.hadBlock ? 'Replace' : 'Add'} the Habit block in AGENTS.md</h2>` +
      `<p class="habit-meta">${applyPlan.addedLines} line${applyPlan.addedLines === 1 ? '' : 's'} added` +
      `${applyPlan.hadBlock ? `, ${applyPlan.removedLines} replaced` : ''}. Nothing outside the markers changes.` +
      `${applyPlan.redacted ? ' Recognized secrets were redacted.' : ''}</p>` +
      `<pre class="diff" aria-label="Proposed change">${diff}</pre>` +
      '<div class="actions">' +
      `<button data-apply-action="confirm" type="button" class="primary sm"${applyBusy ? ' disabled' : ''}>Write AGENTS.md</button>` +
      '<button data-apply-action="cancel" type="button" class="ghost sm">Cancel</button>' +
      '</div>' +
      '<p class="habit-meta">No silent writes. A running session must be restarted for the model to load the change.</p>';
    return;
  }
  const disabled = projectHabits.length === 0 || directory === null || applyBusy;
  applyView.innerHTML =
    '<h2 class="habit-section-title">Use in future sessions</h2>' +
    '<p class="habit-meta">Write this project’s habits into AGENTS.md so the agent loads them next session. ' +
    (projectHabits.length === 0
      ? 'Keep a project habit first.'
      : `${projectHabits.length} project habit${projectHabits.length === 1 ? '' : 's'} ready.`) +
    '</p>' +
    '<div class="actions">' +
    `<button data-apply-action="preview" type="button" class="sm"${disabled ? ' disabled' : ''}>Apply to AGENTS.md</button>` +
    '</div>' +
    '<p class="habit-meta">Forgetting a habit does not remove it from AGENTS.md; re-apply to update the file.</p>';
};

const paint = (): void => {
  const visible = visibleForDirectory(memories, directory);
  const projectCount = visible.filter((m) => m.scope === 'project').length;
  const globalCount = visible.filter((m) => m.scope === 'global').length;
  countsView.innerHTML = esc(`${visible.length} habits here · ${projectCount} this project · ${globalCount} global`);

  const rows = visible
    .map((m) => {
      const key = keyForMemory(m);
      const draft = editingKey === key ? editDrafts.get(key) : undefined;
      if (editingKey === key) {
        return (
          `<article class="card" data-key="${esc(key)}" data-editing="true">` +
          `<div class="capture-grid">` +
          `<label class="field-label">Title</label>` +
          `<input data-field="edit-title" value="${esc(draft?.title ?? m.title)}" style="width:100%;box-sizing:border-box;" aria-label="Edit title" />` +
          `<label class="field-label">Detail</label>` +
          `<textarea data-field="edit-detail" rows="2" style="width:100%;box-sizing:border-box;" aria-label="Edit detail">${esc(draft?.detail ?? m.detail)}</textarea>` +
          '<div class="actions"><button data-action="edit-save" type="button" class="primary sm">Save</button>' +
          '<button data-action="edit-cancel" type="button" class="ghost sm">Cancel</button></div></div></article>'
        );
      }
      const source = m.source.sessionTitle.length > 0 ? `<div class="habit-meta">kept from “${esc(m.source.sessionTitle)}”</div>` : '';
      const badge = m.scope === 'project'
        ? '<span class="badge project">this project</span>'
        : '<span class="badge">global</span>';
      return (
        `<article class="card" data-key="${esc(key)}">` +
        `<div class="habit-meta">${badge}<span>${m.supporting ?? 0} confirmation${m.supporting === 1 ? '' : 's'} · ${m.contradicting ?? 0} contradiction${m.contradicting === 1 ? '' : 's'}</span></div>` +
        `<h3 class="habit-title">${esc(m.title)}</h3>` +
        (m.detail.trim().length > 0 ? `<p class="habit-detail">${esc(m.detail)}</p>` : '') +
        source +
        '<div class="actions">' +
        '<button data-action="insert" type="button" class="primary sm">Insert</button>' +
        '<button data-action="confirm" type="button" class="sm">Confirm</button>' +
        '<button data-action="contradict" type="button" class="sm">Contradict</button></div>' +
        '<div class="actions subtle">' +
        '<button data-action="copy" type="button" class="ghost sm">Copy</button>' +
        '<button data-action="edit" type="button" class="ghost sm">Edit</button>' +
        '<button data-action="delete" type="button" class="danger-ghost sm">Forget</button></div></article>'
      );
    })
    .join('');
  listView.innerHTML =
    '<h2 class="habit-section-title">Habits</h2><div class="habit-list">' +
    (rows === '' ? '<p class="empty">Nothing kept yet.</p>' : rows) + '</div>';
  paintReview();
  paintApply();
};

const readCapture = (): { title: string; detail: string; scope: HabitScope } => {
  const title = (captureView.querySelector('[data-field="title"]') as HTMLInputElement | null)?.value ?? '';
  const detail = (captureView.querySelector('[data-field="detail"]') as HTMLTextAreaElement | null)?.value ?? '';
  const scope = ((captureView.querySelector('[data-field="scope"]') as HTMLSelectElement | null)?.value === 'global'
    ? 'global'
    : 'project') as HabitScope;
  return { title, detail, scope };
};

// A stale "give the habit a title first" must not haunt the panel: typing
// clears the transient notice. (Nothing else auto-clears notices.)
captureView.addEventListener('input', (event) => {
  const field = event.target as HTMLElement | null;
  if (field?.getAttribute('data-field') === 'title') noticeView.textContent = '';
});

captureView.addEventListener('click', (event) => {
  const target = event.target as HTMLElement | null;
  if (target?.getAttribute('data-action') !== 'save') return;
  const { title, detail, scope } = readCapture();
  const draft = actionDraft;
  void saveMemory({
    title,
    detail,
    scope,
    directory: draft?.directory ?? directory,
    source: draft?.source ?? { sessionId: session?.id ?? null, sessionTitle: session?.title ?? '', messageId: null, role: null },
  });
});

listView.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement | null)?.closest('[data-action]') as HTMLElement | null;
  if (!button) return;
  const row = button.closest('[data-key]') as HTMLElement | null;
  if (!row) return;
  const key = row.getAttribute('data-key') ?? '';
  const memory = memories.find((m) => keyForMemory(m) === key);
  if (!memory) return;
  const action = button.getAttribute('data-action');
  void (async () => {
    if (action === 'confirm' || action === 'contradict') {
      await runExclusive(async () => {
        const latest = readMemory(await host.storage.get(key));
        if (!latest) throw new Error('Habit no longer exists.');
        const next: HabitMemory = {
          ...latest,
          supporting: (latest.supporting ?? 0) + (action === 'confirm' ? 1 : 0),
          contradicting: (latest.contradicting ?? 0) + (action === 'contradict' ? 1 : 0),
          updatedAt: Date.now(),
        };
        await host.storage.set(key, JSON.parse(JSON.stringify(next)));
        await refresh();
        sayAfterRefresh('Feedback saved.', 'Feedback saved, but refreshing the list failed.');
      });
    } else if (action === 'insert') {
      await host.compose({ text: formatForCompose(memory), mode: 'append' });
      say('Inserted into the draft.');
    } else if (action === 'copy') {
      await host.writeClipboard(formatForCompose(memory));
      say('Copied.');
    } else if (action === 'delete') {
      await runExclusive(async () => {
        await host.storage.delete(key);
        await refresh();
        sayAfterRefresh(
          'Forgotten. AGENTS.md was not changed — re-apply if this habit was written there.',
          'Forgotten, but refreshing the list failed.',
        );
      });
    } else if (action === 'edit') {
      editingKey = key;
      if (!editDrafts.has(key)) {
        editDrafts.set(key, { title: memory.title, detail: memory.detail, baselineTitle: memory.title, baselineDetail: memory.detail });
      }
      paint();
    } else if (action === 'edit-cancel') {
      editingKey = null;
      editDrafts.delete(key);
      paint();
    } else if (action === 'edit-save') {
      const draftTitle = (row.querySelector('[data-field="edit-title"]') as HTMLInputElement | null)?.value ?? '';
      const draftDetail = (row.querySelector('[data-field="edit-detail"]') as HTMLTextAreaElement | null)?.value ?? '';
      const draft = editDrafts.get(key);
      const baselineTitle = draft?.baselineTitle ?? draftTitle;
      const baselineDetail = draft?.baselineDetail ?? draftDetail;
      await runExclusive(async () => {
        // Latest read before mutating; refuse when the habit changed underneath
        // the editor (storage has no compare-and-swap, so this is best-effort).
        const latest = readMemory(await host.storage.get(key));
        if (!latest) {
          editDrafts.delete(key);
          editingKey = null;
          paint();
          say('That habit is already gone.');
          return;
        }
        if (latest.title !== baselineTitle || latest.detail !== baselineDetail) {
          say('The habit changed since you started editing — the form was not saved. Reopen it and try again.');
          return;
        }
        const cleaned = cleanMemoryInput(draftTitle, draftDetail);
        if (cleaned.title.length === 0) {
          say('A habit needs a title.');
          return;
        }
        const meaningChanged = cleaned.title !== latest.title || cleaned.detail !== latest.detail;
        const next: HabitMemory = {
          ...latest,
          title: cleaned.title,
          detail: cleaned.detail,
          updatedAt: Date.now(),
        };
        if (meaningChanged) {
          // Feedback measured the old text; the new text starts from neutral.
          next.supporting = 0;
          next.contradicting = 0;
        }
        try {
          await host.storage.set(key, JSON.parse(JSON.stringify(next)));
        } catch {
          say('Save failed.');
          return;
        }
        editDrafts.delete(key);
        editingKey = null;
        await refresh();
        const reset = meaningChanged ? ' (edit changed the habit\'s meaning — feedback counts reset)' : '';
        sayAfterRefresh(
          cleaned.redacted ? `Saved with secrets redacted${reset}.` : `Saved${reset}.`,
          'Saved, but refreshing the list failed.',
        );
      });
    }
  })().catch(() => say('That failed.'));
});

listView.addEventListener('input', (event) => {
  const row = (event.target as HTMLElement | null)?.closest('[data-key]') as HTMLElement | null;
  if (!row) return;
  const key = row.getAttribute('data-key') ?? '';
  const field = event.target as HTMLInputElement | HTMLTextAreaElement | null;
  if (!field) return;
  const draft = editDrafts.get(key);
  if (!draft) return;
  if (field.getAttribute('data-field') === 'edit-detail') draft.detail = field.value;
  else draft.title = field.value;
});

reviewView.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement | null)?.closest('[data-candidate-action]') as HTMLElement | null;
  if (!button) return;
  const action = button.getAttribute('data-candidate-action');
  const row = button.closest('[data-candidate]') as HTMLElement | null;
  const candidateId = row?.getAttribute('data-candidate') ?? '';
  void (async () => {
    if (action === 'keep') await keepCandidate(candidateId);
    else if (action === 'dismiss') await dismissCandidate(candidateId);
    else if (action === 'dismiss-all') await dismissAllCandidates();
  })().catch(() => say('That failed.'));
});

importView.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement | null)?.closest('[data-import-action]') as HTMLElement | null;
  if (!button) return;
  const text = (importView.querySelector('[data-field="ledger"]') as HTMLTextAreaElement | null)?.value ?? '';
  if (text.trim().length === 0) {
    say('Paste a ledger first.');
    return;
  }
  void runLedgerImport(text, 'pasted').catch(() => say('Import failed.'));
});

applyView.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement | null)?.closest('[data-apply-action]') as HTMLElement | null;
  if (!button || button.hasAttribute('disabled')) return;
  const action = button.getAttribute('data-apply-action');
  void (async () => {
    if (action === 'preview') await beginApply(false);
    else if (action === 'override') await beginApply(true);
    else if (action === 'confirm') await confirmApply();
    else if (action === 'cancel') {
      applyPlan = null;
      applyConflict = null;
      applyRecordBaseline = null;
      paintApply();
    }
  })().catch(() => say('That failed.'));
});

const messageSignature = (record: Record<string, unknown>): string =>
  `message:${typeof record['sessionId'] === 'string' ? record['sessionId'] : ''}:${typeof record['messageId'] === 'string' ? record['messageId'] : ''}`;

const sessionSignature = (item: SessionItemLike): string => {
  const messages = item.messages ?? [];
  const last = messages.length > 0 ? messages[messages.length - 1].id : 'none';
  const first = messages.length > 0 ? messages[0].id : 'none';
  return `session:${item.sessionId}:${messages.length}:${first}:${last}:${item.truncated === true ? 'trunc' : 'full'}`;
};

const prefillFromItem = (item: unknown, via: 'ready' | 'item'): void => {
  const record = item !== null && typeof item === 'object' ? (item as Record<string, unknown>) : null;
  if (!record) return;

  if (record['kind'] === 'session') {
    const sessionItem = record as unknown as SessionItemLike;
    const signature = sessionSignature(sessionItem);
    // A genuine click always runs, so a click with no new turns can say so.
    // A repeated `ready` for the item already handled must stay quiet.
    const replay = signature === lastSessionSignature
      && (via === 'ready' || Date.now() - lastSessionHandledAt < SESSION_REPLAY_WINDOW_MS);
    if (replay) return;
    lastSessionSignature = signature;
    lastSessionHandledAt = Date.now();
    void runSessionAnalysis(sessionItem);
    return;
  }

  if (record['kind'] !== 'message') return;
  const signature = messageSignature(record);
  if (signature === lastItemSignature) return;
  lastItemSignature = signature;
  actionDraft = {
    directory: typeof record['directory'] === 'string' ? record['directory'] : null,
    source: {
      sessionId: typeof record['sessionId'] === 'string' ? record['sessionId'] : null,
      sessionTitle: typeof record['sessionTitle'] === 'string' ? record['sessionTitle'] : '',
      messageId: typeof record['messageId'] === 'string' ? record['messageId'] : null,
      role: record['role'] === 'user' || record['role'] === 'assistant' ? record['role'] : null,
    },
  };
  const titleEl = captureView.querySelector('[data-field="title"]') as HTMLInputElement | null;
  const detailEl = captureView.querySelector('[data-field="detail"]') as HTMLTextAreaElement | null;
  if (detailEl && typeof record['text'] === 'string') detailEl.value = record['text'] as string;
  if (titleEl) titleEl.focus();
  say('Message attached — add a title and Remember.');
};

host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  directory = context.directory;
  session = context.session;
  // Drop the lifecycle event the SDK derives from this same snapshot.
  lastReadyAt = Date.now();
  if (context.item !== null && context.item !== undefined) prefillFromItem(context.item, 'ready');
  void refresh();
  void loadReviewQueue(context.session?.id ?? null);
  void loadImportQueue(context.directory);
});

host.onItem((item) => {
  if (item === null) return;
  prefillFromItem(item, 'item');
});

// Step 1: the timing signal, with no capability and no content. Count completed
// turns only; a failed turn is not evidence and leaves the count untouched.
host.onSessionLifecycle((event) => {
  if (Date.now() - lastReadyAt < READY_LIFECYCLE_WINDOW_MS) return;
  if (event.phase !== 'completed') return;
  unseenTurns += 1;
  paintBadge();
});

host.onDirectory((next) => {
  directory = next;
  paint();
  void loadImportQueue(next);
});

host.onSession((next) => {
  session = next;
  paint();
  void loadReviewQueue(next?.id ?? null);
});

host.onResolve((request) => {
  const command = request.command;
  const args = request.args.trim();
  if (command === 'remember') {
    const { title, detail } = parseRememberArgs(args);
    if (title.length === 0) throw new Error('Usage: /remember title | optional detail');
    const draft = actionDraft;
    return saveMemory({
      title,
      detail,
      scope: directory !== null ? 'project' : 'global',
      directory: draft?.directory ?? directory,
      source: draft?.source ?? { sessionId: session?.id ?? null, sessionTitle: session?.title ?? '', messageId: null, role: null },
    }).then((ok) => {
      if (!ok) throw new Error('Could not keep that.');
      return null;
    });
  }
  if (command === 'forget') {
    // Capture the invocation directory now; a context switch mid-load must not
    // move or widen the deletion. Wait for a fresh load before matching.
    const scopeDirectory = directory;
    return (runExclusive(async () => {
      await refresh();
      const match = visibleForDirectory(memories, scopeDirectory).filter((m) => m.id.startsWith(args) || m.title.toLowerCase().includes(args.toLowerCase()));
      if (args.length === 0 || match.length !== 1) {
        throw new Error(match.length === 0 ? 'No habit matches that.' : 'That matches several — refine it in the panel.');
      }
      const memory = match[0];
      await host.storage.delete(keyForMemory(memory));
      await refresh();
      sayAfterRefresh(
        `Forgot “${memory.title}”. AGENTS.md was not changed — re-apply if it was written there.`,
        'Forgot, but refreshing the list failed.',
      );
    }) ?? Promise.resolve()).then(() => null);
  }
  if (command === 'habits') {
    const visible = visibleForDirectory(memories, directory);
    void host.toast({
      kind: 'info',
      message: visible.length === 0 ? 'No habits here yet.' : `${visible.length} habit(s): ${visible.slice(0, 3).map((m) => m.title).join(', ')}${visible.length > 3 ? '…' : ''}`,
    });
    return Promise.resolve(null);
  }
  if (command === 'habit-import') {
    if (directory === null) throw new Error('Open a project before importing.');
    if (args.length === 0) throw new Error('Usage: /habit-import <relative path to ledger>');
    return host.readFile(args)
      .then(({ content }) => runLedgerImport(content, args))
      .then(() => null, (error) => {
        throw new Error(fileErrorText(error));
      });
  }
  throw new Error(`Unknown command: ${command}`);
});

paint();

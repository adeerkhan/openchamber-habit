import { connectHost } from '@openchamber/sdk';
import { applyHostReady } from '@openchamber/sdk/ui';
import type { SessionSnapshot } from '@openchamber/sdk';
import {
  formatForCompose,
  hashDirectory,
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

const host = connectHost();
const root = document.querySelector('#root');
if (!root) throw new Error('Missing root');

root.innerHTML =
  '<main class="habit-main">' +
  '<p class="habit-counts" data-view="counts" role="status"></p>' +
  '<section class="card" aria-label="Keep a habit"><section data-view="capture"></section></section>' +
  '<section data-view="list"></section>' +
  '<p class="notice" data-view="notice" role="status" aria-live="polite"></p>' +
  '</main>';

const esc = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const countsView = root.querySelector('[data-view="counts"]') as HTMLElement;
const captureView = root.querySelector('[data-view="capture"]') as HTMLElement;
const listView = root.querySelector('[data-view="list"]') as HTMLElement;
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

let directory: string | null = null;
let session: SessionSnapshot | null = null;
let memories: Array<HabitMemory> = [];
let editingKey: string | null = null;
/** Live edit input plus the text the editor opened against, per storage key. */
const editDrafts = new Map<string, { title: string; detail: string; baselineTitle: string; baselineDetail: string }>();
/** Provenance of the item this surface was opened for (action draft). */
let actionDraft: { directory: string | null; source: HabitMemory['source'] } | null = null;
let lastItemSignature: string | null = null;
let loaded = false;
let refreshEpoch = 0;
let refreshFailed = false;
let queueDepth = 0;

const say = (text: string): void => {
  noticeView.textContent = text;
};

/** A succeeded write must not bury a failed refresh: say both. */
const sayAfterRefresh = (ok: string, failed: string): void => {
  say(refreshFailed ? failed : ok);
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
        sayAfterRefresh('Forgotten.', 'Forgotten, but refreshing the list failed.');
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

const prefillFromItem = (item: unknown): void => {
  const record = item !== null && typeof item === 'object' ? (item as Record<string, unknown>) : null;
  if (!record || (record['kind'] !== 'message' && record['kind'] !== 'session')) return;
  // The host replays the same item on every onReady; prefill only once per item.
  const signature = JSON.stringify(record);
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
  if (record['kind'] === 'message') {
    if (detailEl && typeof record['text'] === 'string') detailEl.value = record['text'] as string;
    if (titleEl) titleEl.focus();
  } else {
    if (titleEl && typeof record['sessionTitle'] === 'string') titleEl.value = record['sessionTitle'] as string;
    if (detailEl) detailEl.focus();
  }
  say(record['kind'] === 'message' ? 'Message attached — add a title and Remember.' : 'Session attached — add a title and Remember.');
};

host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  directory = context.directory;
  session = context.session;
  if (context.item !== null && context.item !== undefined) prefillFromItem(context.item);
  void refresh();
});

host.onItem((item) => {
  if (item === null) return;
  prefillFromItem(item);
});

host.onDirectory((next) => {
  directory = next;
  paint();
});

host.onSession((next) => {
  session = next;
  paint();
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
      sayAfterRefresh(`Forgot “${memory.title}”.`, 'Forgot, but refreshing the list failed.');
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
  throw new Error(`Unknown command: ${command}`);
});

paint();

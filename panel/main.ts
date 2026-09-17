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
  '<main style="padding:12px;display:grid;gap:12px;max-width:100%;box-sizing:border-box;">' +
  '<section data-view="counts"></section>' +
  '<section data-view="capture"></section>' +
  '<section data-view="list"></section>' +
  '<p data-view="notice" style="margin:0;min-height:1.2em;opacity:0.8;"></p>' +
  '</main>';

const esc = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const countsView = root.querySelector('[data-view="counts"]') as HTMLElement;
const captureView = root.querySelector('[data-view="capture"]') as HTMLElement;
const listView = root.querySelector('[data-view="list"]') as HTMLElement;
const noticeView = root.querySelector('[data-view="notice"]') as HTMLElement;

// The capture form renders once: repainting it would wipe typed input on
// every session switch, refresh, and action prefill.
captureView.innerHTML =
  '<h2 style="font-size:13px;margin:0 0 4px;">Keep a habit</h2>' +
  '<div style="display:grid;gap:6px;">' +
  '<input data-field="title" placeholder="Title — e.g. tabs, not spaces" style="width:100%;box-sizing:border-box;" />' +
  '<textarea data-field="detail" rows="2" placeholder="Detail (optional)" style="width:100%;box-sizing:border-box;"></textarea>' +
  '<div style="display:flex;gap:6px;">' +
  '<select data-field="scope"><option value="project">This project</option><option value="global">Everywhere</option></select>' +
  '<button data-action="save" type="button">Remember</button>' +
  '</div></div>';

let directory: string | null = null;
let session: SessionSnapshot | null = null;
let memories: Array<HabitMemory> = [];
let editingId: string | null = null;

const say = (text: string): void => {
  noticeView.textContent = text;
};

const refresh = async (): Promise<void> => {
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
    memories = found.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    say('Storage read failed.');
  }
  paint();
};

const saveMemory = async (input: {
  title: string;
  detail: string;
  scope: HabitScope;
  source: HabitMemory['source'];
}): Promise<boolean> => {
  const cleaned = cleanMemoryInput(input.title, input.detail);
  if (cleaned.title.length === 0) {
    say('Give the habit a title first.');
    return false;
  }
  const dirHash = input.scope === 'project' && directory !== null ? hashDirectory(directory) : null;
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
    directory: input.scope === 'project' ? directory : null,
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
  say(cleaned.redacted ? 'Kept with recognized secrets redacted.' : 'Kept.');
  return true;
};

const paint = (): void => {
  const visible = visibleForDirectory(memories, directory);
  const projectCount = visible.filter((m) => m.scope === 'project').length;
  const globalCount = visible.filter((m) => m.scope === 'global').length;
  countsView.innerHTML =
    `<p style="margin:0;">${visible.length} habits here · ${projectCount} this project · ${globalCount} global</p>`;

  const rows = visible
    .map((m) => {
      if (editingId === m.id) {
        return (
          `<div data-id="${esc(m.id)}" style="border-top:1px solid currentColor;padding:6px 0;opacity:0.9;display:grid;gap:6px;">` +
          `<input data-field="edit-title" value="${esc(m.title)}" style="width:100%;box-sizing:border-box;" />` +
          `<textarea data-field="edit-detail" rows="2" style="width:100%;box-sizing:border-box;">${esc(m.detail)}</textarea>` +
          '<div style="display:flex;gap:6px;"><button data-action="edit-save" type="button">Save</button>' +
          '<button data-action="edit-cancel" type="button">Cancel</button></div></div>'
        );
      }
      const source = m.source.sessionTitle.length > 0 ? `<div style="opacity:0.65;">kept from “${esc(m.source.sessionTitle)}”</div>` : '';
      const badge = m.scope === 'project' ? ' · this project' : ' · global';
      return (
        `<div data-id="${esc(m.id)}" style="border-top:1px solid currentColor;padding:6px 0;opacity:0.9;">` +
        `<div><strong>${esc(m.title)}</strong><span style="opacity:0.65;">${badge}</span></div>` +
        (m.detail.trim().length > 0 ? `<div>${esc(m.detail)}</div>` : '') +
        source +
        '<div style="display:flex;gap:6px;margin-top:4px;">' +
        '<button data-action="insert" type="button">Insert</button>' +
        '<button data-action="copy" type="button">Copy</button>' +
        '<button data-action="edit" type="button">Edit</button>' +
        '<button data-action="delete" type="button">Forget</button></div></div>'
      );
    })
    .join('');
  listView.innerHTML =
    '<h2 style="font-size:13px;margin:0 0 4px;">Habits</h2>' +
    (rows === '' ? '<p style="margin:0;">Nothing kept yet.</p>' : rows);
};

const readCapture = (): { title: string; detail: string; scope: HabitScope } => {
  const title = (captureView.querySelector('[data-field="title"]') as HTMLInputElement | null)?.value ?? '';
  const detail = (captureView.querySelector('[data-field="detail"]') as HTMLTextAreaElement | null)?.value ?? '';
  const scope = ((captureView.querySelector('[data-field="scope"]') as HTMLSelectElement | null)?.value === 'global'
    ? 'global'
    : 'project') as HabitScope;
  return { title, detail, scope };
};

captureView.addEventListener('click', (event) => {
  const target = event.target as HTMLElement | null;
  if (target?.getAttribute('data-action') !== 'save') return;
  const { title, detail, scope } = readCapture();
  void (async () => {
    await saveMemory({
      title,
      detail,
      scope,
      source: { sessionId: session?.id ?? null, sessionTitle: session?.title ?? '', messageId: null, role: null },
    });
  })();
});

listView.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement | null)?.closest('[data-action]') as HTMLElement | null;
  if (!button) return;
  const row = button.closest('[data-id]') as HTMLElement | null;
  if (!row) return;
  const id = row.getAttribute('data-id') ?? '';
  const memory = memories.find((m) => m.id === id);
  if (!memory) return;
  const action = button.getAttribute('data-action');
  void (async () => {
    if (action === 'insert') {
      await host.compose({ text: formatForCompose(memory), mode: 'append' });
      say('Inserted into the draft.');
    } else if (action === 'copy') {
      await host.writeClipboard(formatForCompose(memory));
      say('Copied.');
    } else if (action === 'delete') {
      await host.storage.delete(keyForMemory(memory));
      await refresh();
      say('Forgotten.');
    } else if (action === 'edit') {
      editingId = id;
      paint();
    } else if (action === 'edit-cancel') {
      editingId = null;
      paint();
    } else if (action === 'edit-save') {
      const cleaned = cleanMemoryInput(
        (row.querySelector('[data-field="edit-title"]') as HTMLInputElement | null)?.value ?? '',
        (row.querySelector('[data-field="edit-detail"]') as HTMLTextAreaElement | null)?.value ?? '',
      );
      if (cleaned.title.length === 0) {
        say('A habit needs a title.');
        return;
      }
      const next: HabitMemory = {
        ...memory,
        title: cleaned.title,
        detail: cleaned.detail,
        updatedAt: Date.now(),
      };
      await host.storage.set(keyForMemory(next), JSON.parse(JSON.stringify(next)));
      editingId = null;
      await refresh();
      say(cleaned.redacted ? 'Saved with secrets redacted.' : 'Saved.');
    }
  })().catch(() => say('That failed.'));
});

const prefillFromItem = (item: unknown): void => {
  const record = item !== null && typeof item === 'object' ? (item as Record<string, unknown>) : null;
  if (!record || (record['kind'] !== 'message' && record['kind'] !== 'session')) return;
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
    return saveMemory({
      title,
      detail,
      scope: directory !== null ? 'project' : 'global',
      source: { sessionId: session?.id ?? null, sessionTitle: session?.title ?? '', messageId: null, role: null },
    }).then((ok) => {
      if (!ok) throw new Error('Could not keep that.');
      return null;
    });
  }
  if (command === 'forget') {
    const match = memories.filter((m) => m.id.startsWith(args) || m.title.toLowerCase().includes(args.toLowerCase()));
    if (args.length === 0 || match.length !== 1) {
      throw new Error(match.length === 0 ? 'No habit matches that.' : 'That matches several — refine it in the panel.');
    }
    const memory = match[0];
    return host.storage.delete(keyForMemory(memory)).then(() => refresh()).then(() => {
      say(`Forgot “${memory.title}”.`);
      return null;
    });
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

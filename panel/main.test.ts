import { expect, mock, test } from 'bun:test';
import { hashDirectory } from './habits';

// Minimal host/DOM boundary: test lifecycle callbacks without a browser dependency.
test('capture inputs survive ready refresh and context repaints', async () => {
  const callbacks: Record<string, (value: any) => any> = {};
  const fields = new Map<string, { value: string; focus(): void }>();
  let captureRenders = 0;
  const stored = new Map<string, any>([['habit:global:h1', {
    id: 'h1', title: 'Native APIs', detail: '', scope: 'global', directory: null,
    directoryHash: null, source: { sessionId: null, sessionTitle: '', messageId: null, role: null },
    createdAt: 0, updatedAt: 0,
  }]]);
  let listClick: (event: any) => void;
  let listInput: (event: any) => void;
  let captureClick: (event: any) => void;
  let listHtml = '';
  const editFields = new Map<string, { value: string }>();
  let failKeys = false;
  let holdGet: ((key: string, value: any) => Promise<any>) | null = null;
  let holdSet: (() => Promise<void>) | null = null;
  let composeCalls = 0;
  let clipboardCalls = 0;
  const view = (capture = false) => ({
    set innerHTML(_html: string) {
      if (capture) {
        captureRenders += 1;
        fields.clear();
      }
    },
    textContent: '',
    querySelector(selector: string) {
      if (!fields.has(selector)) fields.set(selector, { value: '', focus() {} });
      return fields.get(selector)!;
    },
    addEventListener() {},
  });
  const capture = view(true);
  const views = new Map([
    ['[data-view="capture"]', capture],
    ['[data-view="counts"]', view()],
    ['[data-view="list"]', view()],
    ['[data-view="notice"]', view()],
  ]);
  const list = views.get('[data-view="list"]')!;
  Object.defineProperty(list, 'innerHTML', { set(value: string) {
    listHtml = value;
    editFields.clear();
    const title = value.match(/data-field="edit-title" value="([^"]*)"/);
    const detail = value.match(/data-field="edit-detail"[^>]*>([^<]*)</);
    if (title) editFields.set('[data-field="edit-title"]', { value: title[1] });
    if (detail) editFields.set('[data-field="edit-detail"]', { value: detail[1] });
  } });
  list.addEventListener = ((name: string, handler: (event: any) => void) => {
    if (name === 'click') listClick = handler;
    if (name === 'input') listInput = handler;
  }) as typeof list.addEventListener;
  capture.addEventListener = ((_name: string, handler: (event: any) => void) => { captureClick = handler; }) as typeof capture.addEventListener;
  const rowFor = (key: string) => ({
    getAttribute: (name: string) => name === 'data-key' ? key : key.split(':').at(-1),
    querySelector: (selector: string) => editFields.get(selector),
  });
  const typeEdit = (title: string, detail = '', key = 'habit:global:h1') => {
    editFields.get('[data-field="edit-title"]')!.value = title;
    editFields.get('[data-field="edit-detail"]')!.value = detail;
    const target = (name: string, value: string) => ({ value, closest: () => rowFor(key), getAttribute: (attr: string) => (attr === 'data-field' ? name : null) });
    listInput?.({ target: target('edit-detail', detail) });
    listInput?.({ target: target('edit-title', title) });
  };
  const click = (action: string, key = 'habit:global:h1') => {
    const row = rowFor(key);
    const button = { closest: () => row, getAttribute: () => action };
    listClick({ target: { closest: () => button } });
  };
  const editingKeyValue = () => listHtml.match(/data-key="([^"]+)" style="border-top[^"]*display:grid/)?.[1] ?? listHtml.match(/data-key="([^"]+)"/)?.[1] ?? '';
  const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  const root = { innerHTML: '', querySelector: (selector: string) => views.get(selector) };
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { querySelector: () => root, documentElement: {} },
  });
  mock.module('@openchamber/sdk', () => ({
    connectHost: () => ({
      storage: {
        keys: async () => { if (failKeys) throw new Error('read failed'); return [...stored.keys()]; },
        get: async (key: string) => {
          const value = structuredClone(stored.get(key));
          return holdGet ? holdGet(key, value) : value;
        },
        set: async (key: string, value: any) => { if (holdSet) await holdSet(); stored.set(key, structuredClone(value)); },
        delete: async (key: string) => { stored.delete(key); },
      },
      compose: async () => { composeCalls++; },
      writeClipboard: async () => { clipboardCalls++; },
      onReady: (fn: (value: any) => any) => { callbacks.ready = fn; },
      onDirectory: (fn: (value: any) => any) => { callbacks.directory = fn; },
      onSession: (fn: (value: any) => any) => { callbacks.session = fn; },
      onResolve: (fn: (value: any) => any) => { callbacks.resolve = fn; },
      onItem: (fn: (value: any) => any) => { callbacks.item = fn; },
    }),
  }));
  mock.module('@openchamber/sdk/ui', () => ({ applyHostReady() {} }));
  try {
    await import('./main');
    callbacks.ready({ directory: '/a', session: null, item: { kind: 'message', text: 'Keep this detail' } });
    // Allow the asynchronous storage refresh to repaint.
    await Promise.resolve();
    expect(capture.querySelector('[data-field="detail"]').value).toBe('Keep this detail');
    capture.querySelector('[data-field="title"]').value = 'Unfinished title';
    callbacks.session({ id: 's', title: 'Session' });
    callbacks.directory('/b');
    expect(capture.querySelector('[data-field="title"]').value).toBe('Unfinished title');
    expect(capture.querySelector('[data-field="detail"]').value).toBe('Keep this detail');
    expect(captureRenders).toBe(1);
    await settle();
    expect(listHtml).toContain('Confidence: 50%');
    click('confirm');
    click('confirm'); // duplicate while the write is pending is ignored
    await settle();
    expect(stored.get('habit:global:h1').supporting).toBe(1);
    expect(listHtml).toContain('Confidence: 67%');
    // Refresh reads the persisted counts rather than losing feedback.
    callbacks.ready({ directory: '/b', session: null, item: null });
    await settle();
    expect(listHtml).toContain('Confidence: 67%');
    click('contradict');
    await settle();
    expect(stored.get('habit:global:h1').contradicting).toBe(1);
    expect(listHtml).toContain('Confidence: 50%');
    click('insert');
    click('copy');
    await settle();
    expect(composeCalls).toBe(1);
    expect(clipboardCalls).toBe(1);
    expect(stored.get('habit:global:h1').supporting).toBe(1);
    const foreignKey = `habit:p:${hashDirectory('/other')}:foreign`;
    stored.set(foreignKey, { ...stored.get('habit:global:h1'), id: 'foreign', title: 'Other project only', scope: 'project', directory: '/other', directoryHash: hashDirectory('/other') });
    callbacks.ready({ directory: '/b', session: null, item: null });
    await settle();
    await expect(Promise.resolve().then(() => callbacks.resolve({ command: 'forget', args: 'Other project only' }))).rejects.toThrow('No habit');
    expect(stored.has(foreignKey)).toBe(true);

    const item = { kind: 'message', action: 'remember-message', directory: '/source', sessionId: 'source-session', sessionTitle: 'Source', messageId: 'message', role: 'assistant', text: 'Original' };
    callbacks.item(item);
    capture.querySelector('[data-field="detail"]').value = 'User draft';
    callbacks.ready({ directory: '/b', session: { id: 'wrong', title: 'Wrong' }, item: { ...item } });
    await settle();
    expect(capture.querySelector('[data-field="detail"]').value).toBe('User draft');
    capture.querySelector('[data-field="scope"]').value = 'project';
    captureClick({ target: { getAttribute: () => 'save' } });
    await settle();
    const saved = [...stored.values()].find((m) => m.title === 'Unfinished title');
    expect(saved.directory).toBe('/source');
    expect(saved.source).toEqual({ sessionId: 'source-session', sessionTitle: 'Source', messageId: 'message', role: 'assistant' });

    click('edit');
    typeEdit('Draft title');
    callbacks.session(null);
    callbacks.ready({ directory: '/b', session: null, item: null });
    await settle();
    expect(editFields.get('[data-field="edit-title"]')?.value).toBe('Draft title');
    const twinKey = `habit:p:${hashDirectory('/b')}:h1`;
    stored.set(twinKey, { ...stored.get('habit:global:h1'), scope: 'project', directory: '/b', directoryHash: hashDirectory('/b'), title: 'Twin' });
    callbacks.ready({ directory: '/b', session: null, item: null });
    await settle();
    expect((listHtml.match(/data-field="edit-title"/g) ?? []).length).toBe(1);
    const editKey = editingKeyValue();
    callbacks.directory('/elsewhere');
    callbacks.directory('/b');
    expect(editFields.get('[data-field="edit-title"]')?.value).toBe('Draft title');
    stored.get('habit:global:h1').supporting = 5;
    click('edit-save', editKey);
    await settle();
    expect(stored.get('habit:global:h1').title).toBe('Draft title');
    expect(stored.get('habit:global:h1').supporting).toBe(0);
    expect(views.get('[data-view="notice"]')!.textContent).toContain('reset');

    click('edit');
    typeEdit('Stale draft');
    stored.get('habit:global:h1').title = 'External change';
    click('edit-save');
    await settle();
    expect(stored.get('habit:global:h1').title).toBe('External change');
    expect(views.get('[data-view="notice"]')!.textContent).toContain('changed');
    click('edit-cancel');
    callbacks.ready({ directory: '/b', session: null, item: null });
    await settle();
    click('edit');
    stored.get('habit:global:h1').supporting = 7;
    click('edit-save');
    await settle();
    expect(stored.get('habit:global:h1').supporting).toBe(7);

    // A delete competing with a pending feedback write must not resurrect data.
    let releaseSet!: () => void;
    holdSet = () => new Promise<void>((resolve) => { releaseSet = resolve; });
    click('confirm');
    await settle();
    click('delete');
    await settle();
    expect(stored.has('habit:global:h1')).toBe(true); // shared lock rejects the competing action
    holdSet = null;
    releaseSet();
    await settle();
    click('delete');
    await settle();
    expect(stored.has('habit:global:h1')).toBe(false);

    // Older refresh snapshot must not replace a newer one.
    let releaseGet!: () => void;
    let held = false;
    holdGet = async (key, value) => {
      if (key === twinKey && !held) {
        held = true;
        await new Promise<void>((resolve) => { releaseGet = resolve; });
      }
      return value;
    };
    callbacks.ready({ directory: '/b', session: null, item: null });
    await settle();
    stored.get(twinKey).title = 'Newest';
    callbacks.ready({ directory: '/b', session: null, item: null });
    await settle();
    releaseGet();
    holdGet = null;
    await settle();
    expect(listHtml).toContain('Newest');
    expect(listHtml).not.toContain('<strong>Twin</strong>');

    failKeys = true;
    click('confirm', twinKey);
    await settle();
    expect(stored.get(twinKey).supporting).toBe(2);
    expect(views.get('[data-view="notice"]')!.textContent).toContain('refreshing the list failed');
    failKeys = false;

    // Forget waits for its load, but retains the invocation directory.
    stored.get(twinKey).title = 'Captured directory';
    let releaseForget!: () => void;
    held = false;
    holdGet = async (key, value) => {
      if (key === twinKey && !held) { held = true; await new Promise<void>((resolve) => { releaseForget = resolve; }); }
      return value;
    };
    callbacks.ready({ directory: '/b', session: null, item: null });
    const forgetting = callbacks.resolve({ command: 'forget', args: 'Captured directory' });
    callbacks.directory('/elsewhere');
    await settle();
    releaseForget();
    holdGet = null;
    await forgetting;
    expect(stored.has(twinKey)).toBe(false);
  } finally {
    mock.restore();
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

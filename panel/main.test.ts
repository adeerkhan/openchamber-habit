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
  let captureInput: (event: any) => void;
  let reviewClick: (event: any) => void;
  let applyClick: (event: any) => void;
  let listHtml = '';
  let reviewHtml = '';
  let applyHtml = '';
  const editFields = new Map<string, { value: string }>();
  let failKeys = false;
  let holdGet: ((key: string, value: any) => Promise<any>) | null = null;
  let holdSet: (() => Promise<void>) | null = null;
  let composeCalls = 0;
  let clipboardCalls = 0;
  let generateCalls: Array<{ prompt: string; system?: string }> = [];
  let generateAnswer = '{"candidates":[]}';
  let toastMessages: string[] = [];
  let badgeCalls: Array<number | null> = [];
  let agentsFile: string | null = null;
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
    ['[data-view="review"]', view()],
    ['[data-view="apply"]', view()],
    ['[data-view="notice"]', view()],
  ]);
  const list = views.get('[data-view="list"]')!;
  const review = views.get('[data-view="review"]')!;
  const apply = views.get('[data-view="apply"]')!;
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
  capture.addEventListener = ((name: string, handler: (event: any) => void) => {
    if (name === 'click') captureClick = handler;
    if (name === 'input') captureInput = handler;
  }) as typeof capture.addEventListener;
  Object.defineProperty(review, 'innerHTML', { set(value: string) { reviewHtml = value; } });
  Object.defineProperty(apply, 'innerHTML', { set(value: string) { applyHtml = value; } });
  review.addEventListener = ((name: string, handler: (event: any) => void) => {
    if (name === 'click') reviewClick = handler;
  }) as typeof review.addEventListener;
  apply.addEventListener = ((name: string, handler: (event: any) => void) => {
    if (name === 'click') applyClick = handler;
  }) as typeof apply.addEventListener;
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
  const editingKeyValue = () => listHtml.match(/data-key="([^"]+)" data-editing="true"/)?.[1] ?? listHtml.match(/data-key="([^"]+)"/)?.[1] ?? '';
  const reviewClickAction = (action: string, candidateId: string) => {
    const row = { getAttribute: (name: string) => (name === 'data-candidate' ? candidateId : null) };
    const button = { closest: (selector: string) => (selector === '[data-candidate]' ? row : null), getAttribute: () => action };
    reviewClick({ target: { closest: (selector: string) => (selector === '[data-candidate-action]' ? button : null) } });
  };
  const applyClickAction = (action: string) => {
    const button = { hasAttribute: () => false, getAttribute: () => action };
    applyClick({ target: { closest: (selector: string) => (selector === '[data-apply-action]' ? button : null) } });
  };
  const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
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
      toast: async (request: { message: string }) => { toastMessages.push(request.message); },
      setBadge: async (count: number | null) => { badgeCalls.push(count); },
      generate: async (request: { prompt: string; system?: string }) => {
        generateCalls.push({ prompt: request.prompt, system: request.system });
        return { text: generateAnswer };
      },
      readFile: async () => {
        if (agentsFile === null) throw Object.assign(new Error('missing'), { code: 'NOT_FOUND' });
        return { content: agentsFile };
      },
      writeFile: async (_path: string, content: string) => { agentsFile = content; return { written: true as const }; },
      onReady: (fn: (value: any) => any) => { callbacks.ready = fn; },
      onDirectory: (fn: (value: any) => any) => { callbacks.directory = fn; },
      onSession: (fn: (value: any) => any) => { callbacks.session = fn; },
      onSessionLifecycle: (fn: (value: any) => any) => { callbacks.lifecycle = fn; },
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
    expect(listHtml).toContain('0 confirmations · 0 contradictions');
    click('confirm');
    click('confirm'); // duplicate while the write is pending is ignored
    await settle();
    expect(stored.get('habit:global:h1').supporting).toBe(1);
    expect(listHtml).toContain('1 confirmation · 0 contradictions');
    expect(listHtml).not.toContain('Confidence:');
    // Refresh reads the persisted counts rather than losing feedback.
    callbacks.ready({ directory: '/b', session: null, item: null });
    await settle();
    expect(listHtml).toContain('1 confirmation · 0 contradictions');
    expect(listHtml).not.toContain('Confidence:');
    click('contradict');
    await settle();
    expect(stored.get('habit:global:h1').contradicting).toBe(1);
    expect(listHtml).toContain('1 confirmation · 1 contradiction');
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

    // The "title first" validation must clear when the user starts typing.
    capture.querySelector('[data-field="title"]').value = '';
    captureClick({ target: { getAttribute: () => 'save' } });
    await settle();
    expect(views.get('[data-view="notice"]')!.textContent).toBe('Give the habit a title first.');
    capture.querySelector('[data-field="title"]').value = 'N';
    captureInput({ target: { getAttribute: (a: string) => (a === 'data-field' ? 'title' : null), value: 'N' } });
    expect(views.get('[data-view="notice"]')!.textContent).toBe('');
    // Restore the draft the following action-provenance scenario expects.
    capture.querySelector('[data-field="title"]').value = 'Unfinished title';


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

    // --- Step 1: turn-level nudge -----------------------------------------
    // The SDK emits a session-derived lifecycle event with every `ready`; an
    // idle snapshot must not count as a turn.
    callbacks.ready({ directory: '/b', session: { id: 's', title: 'S' }, item: null });
    callbacks.lifecycle({ sessionId: 's', phase: 'completed' });
    expect(badgeCalls).toEqual([]);
    await settle();
    // Move past the ready-derived-event window: later completions are real turns.
    const liveNow = Date.now;
    Date.now = () => liveNow() + 5_000;
    try {
      callbacks.lifecycle({ sessionId: 's', phase: 'completed' });
      callbacks.lifecycle({ sessionId: 's', phase: 'completed' });
      callbacks.lifecycle({ sessionId: 's', phase: 'failure' });
      callbacks.lifecycle({ sessionId: 's', phase: 'started' });
    } finally {
      Date.now = liveNow;
    }
    expect(badgeCalls).toEqual([1, 2]); // failure and started never count

    // --- Step 2: one-click incremental extraction ------------------------
    callbacks.directory('/b');
    const sessionItem = {
      kind: 'session', action: 'remember-session', sessionId: 'sess-analysis', sessionTitle: 'Analysis', directory: '/b',
      messages: [
        { id: 'u-1', role: 'user', text: 'I always want tabs', createdAt: 1 },
        { id: 'a-1', role: 'assistant', text: 'ok', createdAt: 2 },
      ],
    };
    generateAnswer = JSON.stringify({ candidates: [{ title: 'Use tabs', detail: '', evidence: ['u-1'] }] });
    callbacks.item(sessionItem);
    await settle();
    expect(generateCalls).toHaveLength(1);
    expect(generateCalls[0].prompt).toContain('[id: u-1]');
    expect(stored.has('analysis:queue:sess-analysis')).toBe(true);
    expect(reviewHtml).toContain('Use tabs');
    expect(badgeCalls.at(-1)).toBeNull(); // reviewing clears the badge

    // A `ready` replay of the same item must not run the model again.
    callbacks.ready({ directory: '/b', session: { id: 'sess-analysis', title: 'Analysis' }, item: { ...sessionItem } });
    await settle();
    expect(generateCalls).toHaveLength(1);

    const candidateId = reviewHtml.match(/data-candidate="([^"]+)"/)![1];
    reviewClickAction('keep', candidateId);
    await settle();
    const kept = [...stored.values()].find((memory: any) => memory?.title === 'Use tabs');
    expect(kept.scope).toBe('project');
    expect(kept.directory).toBe('/b');
    expect(kept.source).toEqual({ sessionId: 'sess-analysis', sessionTitle: 'Analysis', messageId: 'u-1', role: 'user' });
    expect(stored.has('analysis:queue:sess-analysis')).toBe(false);
    expect(reviewHtml).toBe('');

    // A new turn analyzes only what is new.
    generateAnswer = JSON.stringify({ candidates: [] });
    sessionItem.messages.push({ id: 'u-2', role: 'user', text: 'Also named exports', createdAt: 3 });
    callbacks.item(sessionItem);
    await settle();
    expect(generateCalls).toHaveLength(2);
    expect(generateCalls[1].prompt).toContain('[id: u-2]');
    expect(generateCalls[1].prompt).not.toContain('[id: u-1]');

    // Re-clicking with nothing new must not call the model again.
    const realNow = Date.now;
    const shiftedNow = realNow() + 10_000;
    Date.now = () => shiftedNow;
    try {
      callbacks.item({ ...sessionItem, messages: [...sessionItem.messages] });
      await settle();
    } finally {
      Date.now = realNow;
    }
    expect(generateCalls).toHaveLength(2);
    expect(toastMessages.at(-1)).toContain('Nothing new');

    // A session item with no conversation grant keeps the manual path.
    callbacks.item({ kind: 'session', action: 'remember-session', sessionId: 'sess-nomsgs', sessionTitle: 'No messages', directory: '/b' });
    await settle();
    expect(capture.querySelector('[data-field="title"]').value).toBe('No messages');

    // --- Step 3: apply to AGENTS.md --------------------------------------
    expect(agentsFile).toBeNull();
    applyClickAction('preview');
    await settle();
    expect(applyHtml).toContain('Add the Habit block');
    expect(applyHtml).toContain('- Use tabs');
    expect(agentsFile).toBeNull(); // preview only, no write

    applyClickAction('confirm');
    await settle();
    expect(agentsFile).toContain('<!-- habit:start -->');
    expect(agentsFile).toContain('- Use tabs');
    expect(stored.has(`analysis:applied:${hashDirectory('/b')}`)).toBe(true);

    // An edit outside the markers stops the next preview.
    agentsFile = `manual note\n${agentsFile}`;
    applyClickAction('preview');
    await settle();
    expect(applyHtml).toContain('changed outside');
    expect(agentsFile.startsWith('manual note')).toBe(true);

    // Explicit override previews, and the confirmed write keeps the manual note.
    applyClickAction('override');
    await settle();
    expect(applyHtml).toContain('Replace the Habit block');
    applyClickAction('confirm');
    await settle();
    expect(agentsFile.startsWith('manual note')).toBe(true);
    expect(agentsFile).toContain('- Use tabs');
  } finally {
    mock.restore();
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

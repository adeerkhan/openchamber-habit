import { expect, mock, test } from 'bun:test';

// Minimal host/DOM boundary: test lifecycle callbacks without a browser dependency.
test('capture inputs survive ready refresh and context repaints', async () => {
  const callbacks: Record<string, (value: any) => any> = {};
  const fields = new Map<string, { value: string; focus(): void }>();
  let captureRenders = 0;
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
  const root = { innerHTML: '', querySelector: (selector: string) => views.get(selector) };
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { querySelector: () => root, documentElement: {} },
  });
  mock.module('@openchamber/sdk', () => ({
    connectHost: () => ({
      storage: { keys: async () => [] },
      onReady: (fn: (value: any) => any) => { callbacks.ready = fn; },
      onDirectory: (fn: (value: any) => any) => { callbacks.directory = fn; },
      onSession: (fn: (value: any) => any) => { callbacks.session = fn; },
      onResolve() {},
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
  } finally {
    mock.restore();
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

import { connectHost } from '@openchamber/sdk';
import { applyHostReady } from '@openchamber/sdk/ui';
import type { SessionSnapshot } from '@openchamber/sdk';

const host = connectHost();
const root = document.querySelector('#root');
if (!root) throw new Error('Missing root');

root.innerHTML =
  '<main style="padding:12px;display:grid;gap:12px;max-width:100%;box-sizing:border-box;">' +
  '<section data-view="session"></section>' +
  '<section data-view="turns"></section>' +
  '<section data-view="tokens"></section>' +
  '</main>';

const esc = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const sessionView = root.querySelector('[data-view="session"]') as HTMLElement;
const turnsView = root.querySelector('[data-view="turns"]') as HTMLElement;
const tokensView = root.querySelector('[data-view="tokens"]') as HTMLElement;

let currentSession: SessionSnapshot | null = null;
const turnLog: Array<{ at: number; text: string }> = [];

const paintSession = (): void => {
  if (!currentSession) {
    sessionView.innerHTML = '<h2 style="font-size:13px;margin:0 0 4px;">Current session</h2><p>No session open.</p>';
    return;
  }
  const model = currentSession.model ? esc(currentSession.model) : 'unknown model';
  sessionView.innerHTML =
    '<h2 style="font-size:13px;margin:0 0 4px;">Current session</h2>' +
    `<p style="margin:0;"><strong>${esc(currentSession.title || 'Untitled')}</strong></p>` +
    `<p style="margin:4px 0 0;opacity:0.75;">${esc(model)} · ${currentSession.busy ? 'working' : 'idle'}</p>`;
};

const paintTurns = (): void => {
  const rows = turnLog
    .slice(-8)
    .reverse()
    .map((entry) => `<li>${esc(new Date(entry.at).toLocaleTimeString())} — ${esc(entry.text)}</li>`)
    .join('');
  turnsView.innerHTML =
    '<h2 style="font-size:13px;margin:0 0 4px;">Turns</h2>' +
    (rows === '' ? '<p>No turns observed yet.</p>' : `<ul style="margin:0;padding-left:18px;">${rows}</ul>`);
};

const paintTokens = (): void => {
  // The host does not expose per-message token counts to guests in SDK v1,
  // so live tok/s cannot be computed here. This section is wired for the
  // future host token feed and stays honest until it lands.
  tokensView.innerHTML =
    '<h2 style="font-size:13px;margin:0 0 4px;">Tokens</h2>' +
    '<p style="margin:0;opacity:0.75;">Live token throughput is not exposed to extensions yet. ' +
    'See the OpenChamber status bar for the native indicator.</p>';
};

paintSession();
paintTurns();
paintTokens();

host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  currentSession = context.session;
  paintSession();
});

host.onSession((session) => {
  currentSession = session;
  paintSession();
});

host.onSessionLifecycle((event) => {
  const label =
    event.phase === 'started' ? 'turn started' : event.phase === 'completed' ? 'turn completed' : 'turn failed';
  turnLog.push({ at: Date.now(), text: `${label} (${event.sessionId.slice(0, 8)})` });
  if (turnLog.length > 50) turnLog.splice(0, turnLog.length - 50);
  paintTurns();
});

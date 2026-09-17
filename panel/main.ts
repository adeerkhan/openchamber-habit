import { connectHost } from '@openchamber/sdk';
import { applyHostReady } from '@openchamber/sdk/ui';
import type { SessionSnapshot } from '@openchamber/sdk';

const host = connectHost();
const root = document.querySelector('#root');
if (!root) throw new Error('Missing root');

root.innerHTML =
  '<main style="padding:12px;display:grid;gap:12px;max-width:100%;box-sizing:border-box;">' +
  '<style>@keyframes tps-pulse { 0%,100% { opacity:1; } 50% { opacity:0.35; } }</style>' +
  '<section data-view="session"></section>' +
  '<section data-view="turns"></section>' +
  '<section data-view="tokens"></section>' +
  '</main>';

const esc = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const dot = (color: string, pulse: boolean): string =>
  `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};` +
  `${pulse ? 'animation:tps-pulse 1.2s infinite;' : ''}"></span>`;

const sessionView = root.querySelector('[data-view="session"]') as HTMLElement;
const turnsView = root.querySelector('[data-view="turns"]') as HTMLElement;
const tokensView = root.querySelector('[data-view="tokens"]') as HTMLElement;

let currentSession: SessionSnapshot | null = null;
interface TurnRecord {
  startedAt: number;
  endedAt: number | null;
  phase: 'started' | 'completed' | 'failure';
}
let currentTurn: TurnRecord | null = null;
let lastFinishedTurn: TurnRecord | null = null;

const paintSession = (): void => {
  if (!currentSession) {
    sessionView.innerHTML = '<h2 style="font-size:13px;margin:0 0 4px;">Current session</h2><p>No session open.</p>';
    return;
  }
  const model = currentSession.model ? esc(currentSession.model) : 'unknown model';
  const mark = currentSession.busy ? dot('#ffaa00', true) : dot('#00cc66', false);
  const state = currentSession.busy ? 'working' : 'idle';
  sessionView.innerHTML =
    '<h2 style="font-size:13px;margin:0 0 4px;">Current session</h2>' +
    `<p style="margin:0;"><strong>${esc(currentSession.title || 'Untitled')}</strong></p>` +
    `<p style="margin:4px 0 0;opacity:0.75;">${mark} ${model} · ${state}</p>`;
};

const paintTurns = (): void => {
  const parts: Array<string> = [];
  if (lastFinishedTurn && lastFinishedTurn.endedAt !== null) {
    const seconds = ((lastFinishedTurn.endedAt - lastFinishedTurn.startedAt) / 1000).toFixed(1);
    const ok = lastFinishedTurn.phase === 'completed';
    const color = ok ? '#00cc66' : '#ff4444';
    const outcome = ok ? 'completed' : 'failed';
    parts.push(
      `<p style="margin:0 0 4px;">Last turn: <strong>${seconds}s</strong> · ` +
      `<strong style="color:${color};">${outcome}</strong></p>`,
    );
  }
  if (currentTurn && currentTurn.endedAt === null) {
    parts.push(
      `<p style="margin:0 0 4px;">${dot('#ffaa00', true)} Turn running…</p>`,
    );
  }
  if (parts.length === 0) {
    parts.push('<p style="margin:0;">No turns observed yet.</p>');
  }
  turnsView.innerHTML =
    '<h2 style="font-size:13px;margin:0 0 4px;">Turns</h2>' + parts.join('');
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
  const now = Date.now();
  if (event.phase === 'started') {
    currentTurn = { startedAt: now, endedAt: null, phase: 'started' };
  } else {
    if (currentTurn && currentTurn.endedAt === null) {
      currentTurn.endedAt = now;
      currentTurn.phase = event.phase;
      lastFinishedTurn = currentTurn;
    } else {
      lastFinishedTurn = { startedAt: now, endedAt: now, phase: event.phase };
    }
    currentTurn = null;
  }
  paintTurns();
});

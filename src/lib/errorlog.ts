import { SUPABASE_KEY, SUPABASE_URL, loadSession, syncConfigured } from './sync';
import { isStaleChunk } from './staleChunk';

// App errors reported by themselves (final list, Sascha 22.10.2026 – the test in the USA): what went wrong, where in the
// app, which version and phone – never a round, a position or a name of a course. Only from the live app (not the
// tests, not the development server), at most 10 a session, each message once; offline they wait (up to 20) and go
// with the next start. The table: supabase/golfos-errors.sql – without it nothing is sent and nothing breaks.

const QUEUE = 'golfos.errorqueue.v1';
const MAX_SESSION = 10;
const sent = new Set<string>();
let count = 0;

export interface ErrorRow {
  kind: 'crash' | 'error' | 'promise';
  message: string;
  stack: string;
  version: string;
  ua: string;
  screen: string;
  module: string;
  username: string | null;
}

/** Noise that is no fault of the app: a blocked third-party request, a resize loop, a script from elsewhere. */
export function isNoise(message: string): boolean {
  return /due to access control|ResizeObserver loop|^Script error\.?$|Load failed$|NetworkError|AbortError|The operation was aborted|signal timed out/i.test(message);
}

const live = () => typeof location !== 'undefined' && /github\.io$/.test(location.hostname) && import.meta.env.PROD;

function row(kind: ErrorRow['kind'], e: unknown): ErrorRow {
  const err = e instanceof Error ? e : new Error(typeof e === 'string' ? e : JSON.stringify(e)?.slice(0, 300) ?? String(e));
  let module = '';
  try {
    module = sessionStorage.getItem('golfos.module') ?? '';
  } catch {
    // storage blocked
  }
  return {
    kind,
    message: String(err.message).slice(0, 500),
    stack: String(err.stack ?? '').slice(0, 2000),
    version: typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '',
    ua: navigator.userAgent.slice(0, 300),
    screen: `${innerWidth}x${innerHeight}`,
    module,
    username: loadSession()?.username ?? null,
  };
}

async function send(rows: ErrorRow[]): Promise<boolean> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/golfos_errors`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(rows),
      keepalive: true,
    });
    return r.ok || r.status === 404; // no table yet: nothing to keep
  } catch {
    return false;
  }
}

function queue(rows: ErrorRow[]): void {
  try {
    const q: ErrorRow[] = JSON.parse(localStorage.getItem(QUEUE) ?? '[]');
    localStorage.setItem(QUEUE, JSON.stringify([...q, ...rows].slice(-20)));
  } catch {
    // storage full – the error is lost, the app goes on
  }
}

export function reportError(kind: ErrorRow['kind'], e: unknown): void {
  const r = row(kind, e);
  if (!live() || !syncConfigured() || isNoise(r.message) || (e instanceof Error && isStaleChunk(e))) return;
  if (sent.has(r.message) || count >= MAX_SESSION) return;
  sent.add(r.message);
  count++;
  void send([r]).then((done) => !done && queue([r]));
}

/** At the start: the errors waiting from offline, and the listeners for every later one. */
export function startErrorLog(): void {
  addEventListener('error', (ev) => reportError('error', ev.error ?? ev.message));
  addEventListener('unhandledrejection', (ev) => reportError('promise', ev.reason));
  if (!live()) return;
  try {
    const q: ErrorRow[] = JSON.parse(localStorage.getItem(QUEUE) ?? '[]');
    if (q.length) void send(q).then((done) => done && localStorage.removeItem(QUEUE));
  } catch {
    // storage blocked
  }
}

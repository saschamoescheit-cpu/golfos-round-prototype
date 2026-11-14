// Is the server reachable? (Sascha 14.11.2026: Supabase blocked the project – "exceed_egress_quota" – and the bets'
// standing went on showing old figures as if they were right: "Alle Auswertungen müssen richtig sein – immer!"). Every
// request to the server is watched: refused (402, 5xx) or no answer – down since then; any answer – up again. Kept on the
// phone, so a reload still knows. Read by ServerStale: a standing, a settlement, a leaderboard says it is not up to date.
import { SUPABASE_URL } from './sync';

const KEY = 'golfos.serverdown.v1';
/** since when the server does not answer (ISO), null: it does */
export function serverDownSince(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function note(ok: boolean): void {
  const was = serverDownSince();
  if (ok === (was == null)) return;
  try {
    if (ok) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, new Date().toISOString());
  } catch {
    /* storage blocked */
  }
  window.dispatchEvent(new Event('golfos:server'));
}
/** A request's outcome: refused by the server (402 – the project restricted, 5xx) or none at all counts as down. */
export function noteServer(status: number | null): void {
  note(status != null && status !== 402 && status < 500);
}

let watching = false;
/** Watches every request to the server – once, when the app starts. */
export function watchServer(): void {
  if (watching || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  watching = true;
  const plain = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(SUPABASE_URL)) return plain(input, init);
    try {
      const r = await plain(input, init);
      noteServer(r.status);
      return r;
    } catch (e) {
      // offline on the course is not the server's fault – only said when the phone has a connection
      // – nor a request the app called off itself or gave up on (review 14.11.2026: an AbortError, the 20 s timeout)
      const name = (e as { name?: string } | null)?.name;
      if (navigator.onLine !== false && name !== 'AbortError' && name !== 'TimeoutError') noteServer(null);
      throw e;
    }
  };
}

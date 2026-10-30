import { useEffect, useState } from 'react';
import { answerJoin, hostedCodes, joinRequests, type JoinRequest } from '../lib/sharedround';
import { tr } from '../lib/i18n';

// "Cedric wants to join – Let in / Decline" on the host's phone, wherever it is in the app (Sascha 29.10.2026: "the host
// must confirm the joining"; 30.10.2026: by QR and code too – "several want to join: an overview of all, let in one by
// one or all at once, ideally a push"). Looked for every few seconds while the phone hosts a round (12 hours from the
// code), not while it is locked – the push brings the host back. Once let in, the player's name goes into the host's
// flight if it is not there yet (golfos:join-approved – the setup and the hole map add him).

type Ask = JoinRequest & { code: string };

export function JoinRequests() {
  const [asks, setAsks] = useState<Ask[]>([]);
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState(false);
  useEffect(() => {
    let gone = false;
    let seen = new Set<string>();
    const look = async () => {
      if (document.hidden) return;
      const codes = hostedCodes();
      if (!codes.length) {
        if (!gone) setAsks([]);
        return;
      }
      const all = (await Promise.all(codes.map(async (code) => (await joinRequests(code)).map((r) => ({ ...r, code }))))).flat();
      if (gone) return;
      // a new one: a short buzz – the phone may be in the pocket
      if (all.some((a) => !seen.has(a.code + a.id))) navigator.vibrate?.(60);
      seen = new Set(all.map((a) => a.code + a.id));
      setAsks(all);
    };
    void look();
    const t = window.setInterval(() => void look(), 4000);
    const now = () => void look();
    window.addEventListener('golfos:near-changed', now);
    document.addEventListener('visibilitychange', now);
    return () => {
      gone = true;
      window.clearInterval(t);
      window.removeEventListener('golfos:near-changed', now);
      document.removeEventListener('visibilitychange', now);
    };
  }, []);
  useEffect(() => {
    if (asks.length < 2) setList(false);
  }, [asks.length]);
  const answer = async (some: Ask[], yes: boolean) => {
    setBusy(true);
    const done = await Promise.all(some.map(async (a) => ((await answerJoin(a.code, a.id, yes)) ? a : null)));
    setBusy(false);
    const ok = done.filter((a): a is Ask => a != null);
    if (yes) for (const a of ok) window.dispatchEvent(new CustomEvent('golfos:join-approved', { detail: { code: a.code, name: a.name, hcp: a.hcp } }));
    setAsks((x) => x.filter((y) => !ok.some((a) => a.code === y.code && a.id === y.id)));
  };
  if (!asks.length) return null;
  const hcp = (a: Ask) => (a.hcp ? ` · HCP ${a.hcp}` : '');
  // several: the overview – one by one or all at once
  if (list || asks.length > 1)
    return list ? (
      <div className="sheet-backdrop join-list-back" onClick={() => setList(false)}>
        <section className="sheet join-list" role="dialog" aria-label={tr('Requests to join', 'Beitrittsanfragen')} onClick={(e) => e.stopPropagation()}>
          <div className="sheet-head">
            <strong>{tr(`${asks.length} want to join`, `${asks.length} möchten beitreten`)}</strong>
            <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setList(false)}>
              ✕
            </button>
          </div>
          <ul className="join-list-rows">
            {asks.map((a) => (
              <li key={a.code + a.id}>
                <span className="grow">
                  <strong>{a.name}</strong>
                  <span className="muted small">{hcp(a).replace(/^ · /, '')}</span>
                </span>
                <button type="button" className="btn-secondary join-no" disabled={busy} aria-label={tr(`Decline ${a.name}`, `${a.name} ablehnen`)} onClick={() => void answer([a], false)}>
                  {tr('Decline', 'Ablehnen')}
                </button>
                <button type="button" className="btn-primary" disabled={busy} aria-label={tr(`Let ${a.name} in`, `${a.name} zulassen`)} onClick={() => void answer([a], true)}>
                  {tr('Let in', 'Zulassen')}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void answer(asks, true)}>
            {tr('Let all in', 'Alle zulassen')}
          </button>
        </section>
      </div>
    ) : (
      <div className="undo-toast join-request" role="alertdialog" aria-label={tr(`${asks.length} want to join`, `${asks.length} möchten beitreten`)}>
        <span>
          <strong>{tr(`${asks.length} want to join your round`, `${asks.length} möchten deiner Runde beitreten`)}</strong>
          <span className="muted small"> · {asks.map((a) => a.name).join(', ')}</span>
        </span>
        <span className="join-request-actions">
          <button type="button" className="join-no" disabled={busy} onClick={() => setList(true)}>
            {tr('Show', 'Ansehen')}
          </button>
          <button type="button" disabled={busy} onClick={() => void answer(asks, true)}>
            {tr('Let all in', 'Alle zulassen')}
          </button>
        </span>
      </div>
    );
  const a = asks[0];
  return (
    <div className="undo-toast join-request" role="alertdialog" aria-label={tr(`${a.name} wants to join`, `${a.name} möchte beitreten`)}>
      <span>
        <strong>{tr(`${a.name} wants to join your round`, `${a.name} möchte deiner Runde beitreten`)}</strong>
        {a.hcp && <span className="muted small">{hcp(a)}</span>}
      </span>
      <span className="join-request-actions">
        <button type="button" className="join-no" disabled={busy} onClick={() => void answer([a], false)}>
          {tr('Decline', 'Ablehnen')}
        </button>
        <button type="button" disabled={busy} onClick={() => void answer([a], true)}>
          {tr('Let in', 'Zulassen')}
        </button>
      </span>
    </div>
  );
}

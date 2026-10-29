import { useEffect, useState } from 'react';
import { answerJoin, joinRequests, shownNearby, type JoinRequest } from '../lib/sharedround';
import { tr } from '../lib/i18n';

// "Cedric wants to join – Let in / Decline" on the host's phone, wherever it is in the app (Sascha 29.10.2026: "the host
// must confirm the joining"). Looked for every few seconds while one of its rounds is shown nearby (two hours), not
// while the phone is locked. A code, QR code or link the host gave needs no confirming – he invited that one himself.

export function JoinRequests() {
  const [asks, setAsks] = useState<(JoinRequest & { code: string })[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let gone = false;
    let seen = new Set<string>();
    const look = async () => {
      if (document.hidden) return;
      const codes = shownNearby();
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
  const a = asks[0];
  if (!a) return null;
  const answer = async (yes: boolean) => {
    setBusy(true);
    const ok = await answerJoin(a.code, a.id, yes);
    setBusy(false);
    if (ok) setAsks((x) => x.filter((y) => !(y.code === a.code && y.id === a.id)));
  };
  return (
    <div className="undo-toast join-request" role="alertdialog" aria-label={tr(`${a.name} wants to join`, `${a.name} möchte beitreten`)}>
      <span>
        <strong>{tr(`${a.name} wants to join your round`, `${a.name} möchte deiner Runde beitreten`)}</strong>
        {asks.length > 1 && <span className="muted small"> · {tr(`${asks.length - 1} more`, `noch ${asks.length - 1}`)}</span>}
      </span>
      <span className="join-request-actions">
        <button type="button" className="join-no" disabled={busy} onClick={() => void answer(false)}>
          {tr('Decline', 'Ablehnen')}
        </button>
        <button type="button" disabled={busy} onClick={() => void answer(true)}>
          {tr('Let in', 'Zulassen')}
        </button>
      </span>
    </div>
  );
}

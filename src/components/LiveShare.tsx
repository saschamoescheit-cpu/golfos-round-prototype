import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { tr } from '../lib/i18n';
import { liveLink, liveState, setLive, type LiveState } from '../lib/live';
import { copyLink, InviteCard, shareLink } from './InviteCard';
import { OnOffRow, ToggleRow } from './Settings';
import { DoneFab } from './FloatActions';
import type { Action } from './ActionBar';

// "Zuschauer" (Sascha 08.11.2026, USA: "the live leaderboard also for people outside the tournament – the same for
// games and bets"): a block of its own below "Mitspieler einladen", the same in a tournament, a series, a game and a
// pool. The main switch right of the heading (as the notifications, 23.10.2026); on: the link as every QR card in the
// app – no code under it, it is not for joining; a pool or a game: "Beträge zeigen", off by default (Sascha's choice).

export function LiveShare(props: {
  /** the join code of the tournament, series, game or pool (its row) */
  code: string;
  /** its name, for the shared text */
  name: string;
  /** offer "Beträge zeigen" (a pool, a game) */
  money?: boolean;
}) {
  const [st, setSt] = useState<LiveState | null>(null);
  const box = useRef<HTMLElement>(null);
  const shown = useRef(false); // switched on here: its link and "Teilen" scrolled into view once rendered
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    void liveState(props.code).then((s) => alive && (s ? setSt(s) : setFailed(true)));
    return () => {
      alive = false;
    };
  }, [props.code]);
  const change = async (on: boolean, money: boolean, renew = false) => {
    setBusy(true);
    setMsg(null);
    const s = await setLive(props.code, on, money, renew);
    setBusy(false);
    if (s) {
      shown.current = on && !renew && !st?.live;
      setSt(s);
      setFailed(false);
      if (renew) setMsg(tr('New link – the old one no longer opens.', 'Neuer Link – der alte öffnet nicht mehr.'));
    } else setMsg(tr('No connection – try again in a moment.', 'Keine Verbindung – gleich noch einmal versuchen.'));
  };
  const on = !!st?.live;
  const url = st?.live ? liveLink(st.live) : null;
  useEffect(() => {
    if (!on || !shown.current) return;
    shown.current = false;
    box.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [on]);
  const text = tr(`"${props.name}" live – the leaderboard, no app needed`, `„${props.name}“ live – das Leaderboard, ohne App`);
  return (
    <section ref={box} className="setup-part live-share" aria-label={tr('Spectators', 'Zuschauer')}>
      <span className="eyebrow">{tr('Spectators', 'Zuschauer')}</span>
      <div className="card invite-card">
        {/* a row with An/Aus, no slider (Sascha 11.11.2026: "ohne Schieberegler – in der gesamten App") */}
        <div className="settings-list onoff-card-row">
          <OnOffRow
            label={tr('Live leaderboard to watch', 'Live-Leaderboard zum Zuschauen')}
            ariaLabel={tr('Live leaderboard for spectators', 'Live-Leaderboard für Zuschauer')}
            on={on}
            disabled={busy || (!st && !failed)}
            onChange={(v) => void change(v, st?.money ?? false)}
            onText={tr('A link to watch the leaderboard live', 'Ein Link, mit dem man das Leaderboard live verfolgt')}
            offText={tr('No link – an old one no longer opens', 'Kein Link – ein alter öffnet nicht mehr')}
          />
        </div>
        {!on && (
          <span className="muted small">
            {tr('A link for anyone not playing: the leaderboard only, live, in the browser – no app, no account. Joining is not possible with it.', 'Ein Link für alle, die nicht mitspielen: nur das Leaderboard, live, im Browser – ohne App und ohne Konto. Mitspielen geht damit nicht.')}
          </span>
        )}
        {failed && !st && <span className="muted small">{tr('Not possible right now – the server is not ready for it yet.', 'Gerade nicht möglich – der Server ist dafür noch nicht bereit.')}</span>}
        {on && url && (
          <InviteCard
            link={url}
            code={null}
            qrLabel={tr('QR code to watch', 'QR-Code zum Zuschauen')}
            hint={tr('Only to watch – switched off, the link no longer opens.', 'Nur zum Zuschauen – ausgeschaltet öffnet der Link nicht mehr.')}
            actions={[
              { label: tr('Share', 'Teilen'), aria: tr('Share the live link', 'Live-Link teilen'), icon: 'share', primary: true, onClick: () => void shareLink(text, url).then(setMsg) },
              { label: tr('Copy link', 'Link kopieren'), aria: tr('Copy the live link', 'Live-Link kopieren'), icon: 'link', onClick: () => void copyLink(url).then(setMsg) },
              { label: tr('New link', 'Neuer Link'), aria: tr('Make a new live link', 'Neuen Live-Link erstellen'), icon: 'renew', disabled: busy, onClick: () => void change(true, st?.money ?? false, true) },
            ]}
          />
        )}
        {on && props.money && (
          <ToggleRow
            label={tr('Show amounts', 'Beträge zeigen')}
            text={tr('Stakes and who is up – off: only the bets and where they stand', 'Einsätze und wer vorn liegt – aus: nur die Wetten und ihr Stand')}
            on={!!st?.money}
            disabled={busy}
            onChange={(m) => void change(true, m)}
          />
        )}
        {msg && <span className="muted small">{msg}</span>}
      </div>
    </section>
  );
}

// "Live" under every leaderboard while a round is played (Sascha 12.11.2026, on the course: "Hier könnte man auch den
// Knopf Live einbauen wie unter dem Leaderboard bei Tournaments – eig. bei allen Leaderboards in der App, solange irgendwo
// eine Runde läuft"): an icon of the board's action bar; its sheet the block "Zuschauer" as on the tournament's page.
export const liveAction = (open: () => void): Action => ({ label: 'Live', aria: tr('Live leaderboard for spectators', 'Live-Leaderboard für Zuschauer'), icon: 'live', onClick: open });

export function LiveSheet(props: { code: string; name: string; money?: boolean; onClose: () => void }) {
  // on the body – opened from a board that is itself in a sheet
  return createPortal(
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet" role="dialog" aria-label="Live" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>Live</strong>
        </div>
        <LiveShare code={props.code} name={props.name} money={props.money} />
        <DoneFab onClick={props.onClose} />
      </section>
    </div>,
    document.body,
  );
}

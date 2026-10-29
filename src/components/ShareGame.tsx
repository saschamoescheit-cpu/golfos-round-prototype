import { useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import type { Game } from '../lib/gameforms';
import { cleanCode, exchange, joinGame, joinLink, settleGame, shareGame, guestRound } from '../lib/sharedgame';
import { tr } from '../lib/i18n';

// Invite and join (Sascha 15.10.2026: "join the game by a code or a QR code"): the host shows the code and the QR
// code, the others scan it with the phone camera or type the code. Since 29.10.2026 as in Rounds (Sascha: "in Games
// we need the invitation of the flight's players as in Rounds"): the same texts, a link looks the game up at once, a
// round's code goes on to Rounds, and the exchange loses nothing (lib/sharedgame.ts).

export function Qr(props: { text: string }) {
  const svg = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(props.text);
    q.make();
    return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  }, [props.text]);
  return <div className="qr-box" aria-label={tr('QR code to join', 'QR-Code zum Beitreten')} dangerouslySetInnerHTML={{ __html: svg }} />;
}

/**
 * A shared game on screen: its scores exchanged with the other phones every 5 s while the app is visible, and at once
 * when it comes back – one exchange at a time, and what was entered meanwhile stays (as the hole map of a round).
 * `into` puts what came from the others where the screen reads it (the round of a game on the map).
 */
export function useGameExchange(g: Game, onChange: (g: Game) => void, into: (g: Game) => Game = (x) => x) {
  const latest = useRef(g);
  latest.current = g;
  const change = useRef(onChange);
  change.current = onChange;
  const put = useRef(into);
  put.current = into;
  const code = g.shared?.code ?? null;
  useEffect(() => {
    if (!code) return;
    let busy = false;
    const tick = async () => {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      const got = await exchange(latest.current).finally(() => (busy = false));
      if (!got) return;
      const next = put.current(settleGame(latest.current, got));
      if (JSON.stringify(next) !== JSON.stringify(latest.current)) change.current(next);
    };
    void tick();
    const t = window.setInterval(() => void tick(), 5000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [code]);
}

export function InviteSheet(props: { game: Game; onShared: (g: Game) => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const code = props.game.shared?.code ?? null;
  const share = async () => {
    if (!code) return;
    const url = joinLink(code);
    const nav = navigator as Navigator & { share?: (d: { text: string; url: string }) => Promise<void> };
    try {
      if (nav.share) await nav.share({ text: tr(`Join my game – code ${code}`, `Tritt meinem Spiel bei – Code ${code}`), url });
      else {
        await navigator.clipboard.writeText(url);
        setMsg(tr('Link copied.', 'Link kopiert.'));
      }
    } catch {
      /* cancelled */
    }
  };
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet invite-sheet" role="dialog" aria-label={tr('Invite players', 'Mitspieler einladen')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{tr('Invite players', 'Mitspieler einladen')}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        {!code ? (
          <>
            <span className="muted">
              {tr(
                'Your flight on other phones: everyone enters the scores, everyone sees them and the standing (signed in with Google).',
                'Dein Flight auf weiteren Handys: Jeder trägt ein, jeder sieht die Scores und den Stand (mit Google angemeldet).',
              )}
            </span>
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const g = await shareGame(props.game);
                setBusy(false);
                if (g) props.onShared(g);
                else setMsg(tr('No connection – try again in a moment.', 'Keine Verbindung – gleich noch einmal versuchen.'));
              }}
            >
              {busy ? tr('Creating …', 'Erzeuge …') : tr('Create a code', 'Code erzeugen')}
            </button>
          </>
        ) : (
          <>
            <Qr text={joinLink(code)} />
            <strong className="join-code" aria-label={tr(`Code ${code}`, `Code ${code}`)}>
              {code}
            </strong>
            <span className="muted small">{tr('Scan, or type the code under "Join a game" – then pick who you are.', 'Scannen oder Code unter „Spiel beitreten“ eingeben – dann wählen, wer man ist.')}</span>
            <button type="button" className="btn-secondary" onClick={share}>
              {tr('Share the link', 'Link teilen')}
            </button>
          </>
        )}
        {msg && <span className="muted small">{msg}</span>}
      </section>
    </div>
  );
}

export function JoinSheet(props: { initial?: string; onJoined: (g: Game) => void; onClose: () => void; /** a round's code: join it in Rounds */ onRoundCode?: (code: string) => void }) {
  const [code, setCode] = useState(cleanCode(props.initial ?? ''));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // joined: who is this phone's owner? (his own balance, his own row)
  const [found, setFound] = useState<Game | null>(null);
  const find = async (c = code) => {
    setBusy(true);
    const g = await joinGame(c);
    setBusy(false);
    if (g === 'round' && props.onRoundCode) props.onRoundCode(cleanCode(c));
    else if (g === 'round') setMsg(tr('This code is a round – join it under Rounds.', 'Dieser Code ist eine Runde – die unter Rounds beitreten.'));
    else if (g === 'none') setMsg(tr('No game with this code – check the code.', 'Kein Spiel mit diesem Code – Code prüfen.'));
    else if (!g) setMsg(tr('No connection – check the code or the connection.', 'Keine Verbindung – Code oder Verbindung prüfen.'));
    else setFound(g);
  };
  // opened by the link: look it up straight away (as in Rounds)
  useEffect(() => {
    if (props.initial && cleanCode(props.initial).length === 6) void find(cleanCode(props.initial));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet invite-sheet" role="dialog" aria-label={tr('Join a game', 'Spiel beitreten')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{tr('Join a game', 'Spiel beitreten')}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        {!found && (
          <>
            <input
              className="input join-input"
              value={code}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="K7P4QX"
              aria-label={tr('Code of the game', 'Code des Spiels')}
              onChange={(e) => {
                setCode(cleanCode(e.target.value));
                setMsg(null);
              }}
            />
            <button type="button" className="btn-primary" disabled={busy || code.length !== 6} onClick={() => void find()}>
              {busy ? tr('Joining …', 'Trete bei …') : tr('Join', 'Beitreten')}
            </button>
          </>
        )}
        {found && (
          <div className="field">
            <label>{tr(`${found.courseName} – who are you?`, `${found.courseName} – wer bist du?`)}</label>
            <div className="chip-set">
              {found.players.map((p) => (
                <button key={p.id} type="button" className="chip" onClick={() => props.onJoined(guestRound({ ...found, shared: { code: found.shared!.code, me: p.id } }, p.id))}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {msg && (
          <span className="small bad-text" role="alert">
            {msg}
          </span>
        )}
      </section>
    </div>
  );
}

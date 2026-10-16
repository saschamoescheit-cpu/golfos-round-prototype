import { useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import type { Game } from '../lib/gameforms';
import { cleanCode, joinGame, joinLink, shareGame, guestRound } from '../lib/sharedgame';
import { tr } from '../lib/i18n';

// Invite and join (Sascha 15.10.2026: "join the game by a code or a QR code"): the host shows the code and the QR
// code, the others scan it with the phone camera or type the code.

function Qr(props: { text: string }) {
  const svg = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(props.text);
    q.make();
    return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  }, [props.text]);
  return <div className="qr-box" aria-label={tr('QR code to join', 'QR-Code zum Beitreten')} dangerouslySetInnerHTML={{ __html: svg }} />;
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
            <span className="muted">{tr('Your friends see the game on their phones and enter their scores too. They need to be signed in.', 'Deine Mitspieler sehen das Spiel auf ihrem Handy und tragen selbst ein. Sie müssen angemeldet sein.')}</span>
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
            <span className="muted small">{tr('Scan with the phone camera, or in Games → "Join a game" type the code.', 'Mit der Handykamera scannen oder in Games → „Spiel beitreten“ den Code eingeben.')}</span>
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

export function JoinSheet(props: { initial?: string; onJoined: (g: Game) => void; onClose: () => void }) {
  const [code, setCode] = useState(cleanCode(props.initial ?? ''));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // joined: who is this phone's owner? (his own balance, his own row)
  const [found, setFound] = useState<Game | null>(null);
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet invite-sheet" role="dialog" aria-label={tr('Join a game', 'Spiel beitreten')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{tr('Join a game', 'Spiel beitreten')}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
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
        <button
          type="button"
          className="btn-primary"
          disabled={busy || code.length !== 6}
          onClick={async () => {
            setBusy(true);
            const g = await joinGame(code);
            setBusy(false);
            if (g) setFound(g);
            else setMsg(tr('No game with this code – check the code or the connection.', 'Kein Spiel mit diesem Code – Code oder Verbindung prüfen.'));
          }}
        >
          {busy ? tr('Joining …', 'Trete bei …') : tr('Join', 'Beitreten')}
        </button>
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
          <span className="small" style={{ color: 'var(--warn)' }} role="alert">
            {msg}
          </span>
        )}
      </section>
    </div>
  );
}

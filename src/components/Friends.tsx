import { useEffect, useState } from 'react';
import { tr } from '../lib/i18n';
import { loadFriends, saveFriends, type Friend } from '../lib/friends';
import { acceptFriend, appFriendLink, canLink, codeFromText, friendLink, friendPreview, myFriendCode, pendingAsk, publishCard, refreshFriends, renewFriendCode, setPendingAsk, spacedCode, unfriend, type FriendPreview } from '../lib/friendlinks';
import { loadProfile, shownName } from '../lib/profile';
import { newId } from '../lib/storage';
import { isNative } from '../lib/native';
import { Avatar } from './Avatar';
import { Qr } from './ShareGame';
import { QrScan } from './QrScan';

// The friends tab (Sascha 15.10. / 02.11.2026): the own friend code (QR as with PayPal, an invitation by WhatsApp),
// the friends linked by their accounts – name, handicap, home club and photo from their profiles – and the ones typed
// by hand as before.

export function Friends(props: { onSignIn: () => void }) {
  const [list, setList] = useState<Friend[]>(loadFriends);
  const [code, setCode] = useState<string | null>(() => (canLink() ? myFriendCode() : null));
  const [scan, setScan] = useState(false);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [ask, setAsk] = useState<string | null>(pendingAsk);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const linkable = canLink();

  useEffect(() => {
    const again = () => setList(loadFriends());
    const asked = () => setAsk(pendingAsk());
    window.addEventListener('golfos:friends-changed', again);
    window.addEventListener('golfos:pulled', again);
    window.addEventListener('golfos:friend-ask', asked);
    if (linkable) {
      void publishCard()
        .then((c) => c && setCode(c))
        .catch(() => setProblem(tr('The friend code needs a connection – try again later.', 'Der Freundes-Code braucht eine Verbindung – später nochmal.')));
      void refreshFriends();
    }
    return () => {
      window.removeEventListener('golfos:friends-changed', again);
      window.removeEventListener('golfos:pulled', again);
      window.removeEventListener('golfos:friend-ask', asked);
    };
  }, [linkable]);

  const store = (next: Friend[]) => {
    setList(next);
    saveFriends(next.filter((f) => f.uid || f.name.trim() || f.hcp.trim()));
  };
  const set = (id: string, patch: Partial<Friend>) => store(list.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const typedByHand = list.filter((f) => !f.uid);

  const invite = async () => {
    if (!code) return;
    const me = shownName(loadProfile()) || tr('A friend', 'Ein Freund');
    const text = tr(
      `${me} would like to be your friend in GolfOS – your handicap and home club then come from your profiles.`,
      `${me} möchte in GolfOS mit dir befreundet sein – HCP und Heimatclub kommen dann automatisch aus eurem Profil.`,
    );
    const url = friendLink(code);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'GolfOS', text, url });
        return;
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return; // closed by the player
    }
    // no share sheet (a PC): WhatsApp in a new tab, the link copied as well
    void navigator.clipboard?.writeText(`${text} ${url}`).catch(() => null);
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, '_blank', 'noopener');
    setSent(tr('Link copied – and WhatsApp opened.', 'Link kopiert – und WhatsApp geöffnet.'));
  };
  const take = (text: string): boolean => {
    const c = codeFromText(text);
    if (!c) return false;
    setScan(false);
    setTyping(false);
    setTyped('');
    setPendingAsk(c);
    return true;
  };

  return (
    <>
      <h1 className="tab-title">{tr('Friends', 'Freunde')}</h1>

      {linkable ? (
        <div className="card friend-code" aria-label={tr('My friend code', 'Mein Freundes-Code')}>
          <strong>{tr('My friend code', 'Mein Freundes-Code')}</strong>
          <span className="muted small">
            {tr(
              'Let a friend scan it – or send the invitation, e.g. by WhatsApp. Once he accepts, his handicap, home club and photo come from his profile, always up to date.',
              'Lass ihn scannen – oder schick die Einladung, z. B. per WhatsApp. Sobald dein Freund annimmt, kommen HCP, Heimatclub und Bild aus seinem Profil – immer aktuell.',
            )}
          </span>
          {code ? (
            <>
              <Qr text={friendLink(code)} label={tr('My friend code as a QR code', 'Mein Freundes-Code als QR-Code')} />
              <span className="friend-code-text">{spacedCode(code)}</span>
            </>
          ) : (
            <span className="muted small">{problem ?? tr('Making your code …', 'Dein Code wird erstellt …')}</span>
          )}
          <div className="friend-code-actions">
            <button type="button" className="btn-primary" disabled={!code} onClick={() => void invite()}>
              {tr('Send invitation', 'Einladung senden')}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setScan(true)}>
              {tr('Scan QR code', 'QR-Code scannen')}
            </button>
          </div>
          {sent && <span className="muted small">{sent}</span>}
          {typing ? (
            <form
              className="friend-code-type"
              onSubmit={(e) => {
                e.preventDefault();
                if (!take(typed)) setProblem(tr('That is not a friend code (12 characters).', 'Das ist kein Freundes-Code (12 Zeichen).'));
              }}
            >
              <input className="input" aria-label={tr("Your friend's code", 'Code deines Freundes')} placeholder="A1B2 C3D4 E5F6" value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" />
              <button type="submit" className="btn-secondary">
                {tr('Go', 'Los')}
              </button>
            </form>
          ) : (
            <button type="button" className="link-btn small" onClick={() => setTyping(true)}>
              {tr('Type a code', 'Code eingeben')}
            </button>
          )}
          {code && (
            <button
              type="button"
              className="link-btn small muted"
              onClick={() => {
                void renewFriendCode()
                  .then(setCode)
                  .catch(() => setProblem(tr('No connection – try again later.', 'Keine Verbindung – später nochmal.')));
              }}
            >
              {tr('New code (the old QR code and links stop working)', 'Neuer Code (alter QR-Code und Links gelten nicht mehr)')}
            </button>
          )}
        </div>
      ) : (
        <div className="card friend-code">
          <strong>{tr('Link friends', 'Freunde verknüpfen')}</strong>
          <span className="muted small">
            {tr(
              'Signed in, you link friends by QR code or an invitation (e.g. WhatsApp): their handicap, home club and photo then come from their profiles, always up to date.',
              'Angemeldet verknüpfst du Freunde per QR-Code oder Einladung (z. B. WhatsApp): HCP, Heimatclub und Bild kommen dann aus ihrem Profil – immer aktuell.',
            )}
          </span>
          <button type="button" className="btn-secondary" onClick={props.onSignIn}>
            {tr('Sign in (Profile)', 'Anmelden (Profil)')}
          </button>
        </div>
      )}

      {/* one list, linked and typed by hand side by side – a symbol tells them apart (Sascha 02.11.2026) */}
      {list.length > 0 && <span className="eyebrow">{tr('My friends', 'Meine Freunde')}</span>}
      {list.map((f) =>
        f.uid ? (
          <div key={f.id} className="card friend-linked">
            <KindMark linked />
            <Avatar name={f.name} photo={f.photo} size={44} />
            <span className="grow">
              <strong>{f.fullName || f.name}</strong>
              <span className="muted small" style={{ display: 'block' }}>
                {[f.hcp.trim() ? `HCP ${f.hcp}` : tr('no HCP in his profile', 'kein HCP im Profil'), f.club].filter(Boolean).join(' · ')}
              </span>
            </span>
            {removing === f.uid ? (
              <span className="friend-remove">
                <button
                  type="button"
                  className="btn-secondary small"
                  onClick={() => {
                    setRemoving(null);
                    void unfriend(f.uid!).catch(() => setProblem(tr('No connection – try again later.', 'Keine Verbindung – später nochmal.')));
                  }}
                >
                  {tr('Remove', 'Entfernen')}
                </button>
                <button type="button" className="link-btn small" onClick={() => setRemoving(null)}>
                  {tr('Keep', 'Behalten')}
                </button>
              </span>
            ) : (
              <button type="button" className="icon-btn" aria-label={tr(`Remove ${f.name}`, `${f.name} entfernen`)} onClick={() => setRemoving(f.uid!)}>
                ✕
              </button>
            )}
          </div>
        ) : (
          <div key={f.id} className="card game-player-row friend-typed">
            <KindMark />
            <div className="field">
              <label htmlFor={`fname-${f.id}`}>Name</label>
              <input id={`fname-${f.id}`} className="input" value={f.name} onChange={(e) => set(f.id, { name: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor={`fhcp-${f.id}`}>Handicap</label>
              <input id={`fhcp-${f.id}`} className="input" inputMode="decimal" value={f.hcp} onChange={(e) => set(f.id, { hcp: e.target.value })} />
            </div>
            <button type="button" className="icon-btn" aria-label={tr(`Remove ${f.name || 'friend'}`, `${f.name || 'Freund'} entfernen`)} onClick={() => store(list.filter((x) => x.id !== f.id))} style={{ marginBottom: 3 }}>
              ✕
            </button>
          </div>
        ),
      )}
      {list.length > 0 && (
        <span className="muted small friend-legend">
          <KindMark linked /> {tr('linked – from his profile', 'verknüpft – aus seinem Profil')} · <KindMark /> {tr('typed by hand', 'von Hand angelegt')}
        </span>
      )}
      {linkable && typedByHand.some((f) => f.name.trim()) && (
        <span className="muted small">
          {tr('Send them your invitation: once accepted, the friend typed by hand becomes the linked one.', 'Schick ihnen deine Einladung: Sobald sie annehmen, wird aus dem von Hand angelegten Freund der verknüpfte.')}
        </span>
      )}
      <button type="button" className="btn-secondary" onClick={() => setList([...list, { id: newId(), name: '', hcp: '' }])}>
        {tr('+ Add friend', '+ Freund hinzufügen')}
      </button>

      {scan && <QrScan title={tr('Scan QR code', 'QR-Code scannen')} onText={take} onClose={() => setScan(false)} />}
      {ask && <FriendAsk code={ask} onSignIn={props.onSignIn} />}
    </>
  );
}

/** The symbol of a friend: linked by his account (a chain) or typed by hand (a pen). */
function KindMark(props: { linked?: boolean }) {
  const label = props.linked ? tr('Linked – from his profile', 'Verknüpft – aus seinem Profil') : tr('Typed by hand', 'Von Hand angelegt');
  return (
    <span className={`friend-kind${props.linked ? ' linked' : ''}`} role="img" aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {props.linked ? (
          <>
            <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" />
            <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
          </>
        ) : (
          <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" />
        )}
      </svg>
    </span>
  );
}

/** "Sascha would like to be your friend": the one who sent the code – accept, or not. */
function FriendAsk(props: { code: string; onSignIn: () => void }) {
  const [who, setWho] = useState<FriendPreview | null | undefined>(undefined);
  const [state, setState] = useState<'ask' | 'busy' | 'done' | 'failed'>('ask');
  useEffect(() => {
    void friendPreview(props.code)
      .then(setWho)
      .catch(() => setWho(null));
  }, [props.code]);
  const close = () => setPendingAsk(null);
  const name = who ? `${who.first_name} ${who.last_name}`.trim() || tr('Someone', 'Jemand') : '';
  return (
    <div className="sheet-backdrop" onClick={close}>
      <section className="sheet" role="dialog" aria-label={tr('Friend request', 'Freundschaftsanfrage')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{tr('Friend request', 'Freundschaftsanfrage')}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={close}>
            ✕
          </button>
        </div>
        {who === undefined ? (
          <span className="muted">{tr('Looking up the code …', 'Code wird geprüft …')}</span>
        ) : who === null ? (
          <p className="notice">{tr('This friend code is unknown – maybe a new one was made. Ask for a fresh invitation.', 'Diesen Freundes-Code gibt es nicht – vielleicht wurde ein neuer erstellt. Lass dir eine neue Einladung schicken.')}</p>
        ) : (
          <div className="friend-ask">
            <Avatar name={name} photo={who.photo ?? undefined} size={72} />
            <strong>{name}</strong>
            {who.home_club && <span className="muted small">{who.home_club}</span>}
            {who.is_me ? (
              <p className="muted">{tr('That is your own code.', 'Das ist dein eigener Code.')}</p>
            ) : who.is_friend || state === 'done' ? (
              <p className="good-text">{tr(`You and ${name} are friends ✓`, `Du und ${name} seid befreundet ✓`)}</p>
            ) : (
              <>
                <p>{tr(`${name} would like to be your friend. You both see each other's name, handicap, home club and photo.`, `${name} möchte mit dir befreundet sein. Ihr seht dann gegenseitig Name, HCP, Heimatclub und Bild.`)}</p>
                {canLink() ? (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={state === 'busy'}
                    onClick={() => {
                      setState('busy');
                      void acceptFriend(props.code)
                        .then(() => setState('done'))
                        .catch(() => setState('failed'));
                    }}
                  >
                    {tr('Accept', 'Annehmen')}
                  </button>
                ) : (
                  <>
                    <span className="muted small">{tr('To accept, sign in first (Google or user name) – the request waits.', 'Zum Annehmen melde dich zuerst an (Google oder Benutzername) – die Anfrage wartet.')}</span>
                    <button type="button" className="btn-primary" onClick={props.onSignIn}>
                      {tr('Sign in', 'Anmelden')}
                    </button>
                  </>
                )}
                {state === 'failed' && <span className="small good-text">{tr('That did not work – check the connection and try again.', 'Das hat nicht geklappt – Verbindung prüfen und nochmal.')}</span>}
                {/* the website on an iPhone with the app: open the request there */}
                {!isNative() && /iPhone|iPad/.test(navigator.userAgent) && (
                  <a className="link-btn small" href={appFriendLink(props.code)}>
                    {tr('Open in the GolfOS app', 'In der GolfOS-App öffnen')}
                  </a>
                )}
                <button type="button" className="link-btn small" onClick={close}>
                  {tr('Not now', 'Jetzt nicht')}
                </button>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

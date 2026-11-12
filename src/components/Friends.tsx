import { useEffect, useState } from 'react';
import { AddRow } from './Settings';
import { FloatActions } from './FloatActions';
import { tr } from '../lib/i18n';
import { loadFriends, saveFriends, type Friend } from '../lib/friends';
import { acceptFriend, appFriendLink, canLink, codeFromText, friendLink, friendPreview, isLeaving, myFriendCode, pendingAsk, publishCard, refreshFriends, renewFriendCode, setPendingAsk, unfriendLater, type FriendPreview } from '../lib/friendlinks';
import { showCode } from '../lib/sharedgame';
import { loadProfile, shownName } from '../lib/profile';
import { newId } from '../lib/storage';
import { isNative } from '../lib/native';
import { Avatar } from './Avatar';
import { InviteCard, InviteIcon } from './InviteCard';
import { QrScan } from './QrScan';
import { SwipeRow } from './SwipeRow';

// The friends tab (Sascha 15.10. / 02.11.2026): the own friend code (QR as with PayPal, an invitation by WhatsApp),
// the friends linked by their accounts – name, handicap, home club and photo from their profiles – and the ones typed
// by hand as before.

export function Friends(props: { onSignIn: () => void; /** the friends page itself: "+" floats bottom right (Sascha 12.11.2026) */ float?: boolean }) {
  // a friend swiped away stays out while his "Undo" runs
  const shownFriends = () => loadFriends().filter((f) => !f.uid || !isLeaving(f.uid));
  const [list, setList] = useState<Friend[]>(shownFriends);
  const [code, setCode] = useState<string | null>(() => (canLink() ? myFriendCode() : null));
  const [scan, setScan] = useState(false);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [renewing, setRenewing] = useState(false);
  const [typedProblem, setTypedProblem] = useState<string | null>(null);
  const linkable = canLink();

  useEffect(() => {
    const again = () => setList(shownFriends());
    window.addEventListener('golfos:friends-changed', again);
    window.addEventListener('golfos:pulled', again);
    if (linkable) {
      void publishCard()
        .then((c) => c && setCode(c))
        .catch(() => setProblem(tr('The friend code needs a connection – try again later.', 'Der Freundes-Code braucht eine Verbindung – später nochmal.')));
      void refreshFriends();
    }
    // the friend scans the QR code and accepts while this screen is open (Sascha 06.11.2026: "it took very long – going
    // to Start and back, it was there at once"): asked again every few seconds while open, not only on opening
    const poll = linkable
      ? window.setInterval(() => {
          if (document.visibilityState === 'visible') void refreshFriends();
        }, 3000)
      : 0;
    return () => {
      window.clearInterval(poll);
      window.removeEventListener('golfos:friends-changed', again);
      window.removeEventListener('golfos:pulled', again);
    };
  }, [linkable]);

  const store = (next: Friend[]) => {
    setList(next);
    saveFriends(next.filter((f) => f.uid || f.name.trim() || f.hcp.trim()));
  };
  const set = (id: string, patch: Partial<Friend>) => store(list.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const typedByHand = list.filter((f) => !f.uid);
  // swiped away as everywhere in the app (Sascha 03.11.2026), "Undo" in the toast: typed by hand back in its place
  const removeTyped = (f: Friend) => {
    const at = list.findIndex((x) => x.id === f.id);
    store(list.filter((x) => x.id !== f.id));
    const undo = () => {
      const now = loadFriends();
      saveFriends([...now.slice(0, at), f, ...now.slice(at)]);
      window.dispatchEvent(new Event('golfos:friends-changed'));
    };
    window.dispatchEvent(new CustomEvent('golfos:deleted', { detail: { kind: 'friend', id: f.id, label: f.name.trim(), undo } }));
  };

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
        await navigator.share({ text, url }); // no title: WhatsApp drops the link with one (02.11.2026)
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
    setTypedProblem(null);
    setPendingAsk(c);
    return true;
  };

  return (
    <>
      <h1 className="tab-title">{tr('Friends', 'Freunde')}</h1>

      {linkable ? (
        // the own code as with PayPal: the QR code to scan, below it what one does with it – each an icon with its word
        // (Sascha 03.11.2026: "the QR code area, the buttons and the text links: nicer with icons")
        <div className="card friend-code" aria-label={tr('My friend code', 'Mein Freundes-Code')}>
          <div className="friend-code-head">
            <strong>{tr('My friend code', 'Mein Freundes-Code')}</strong>
            {code && (
              <button type="button" className="icon-btn friend-renew" aria-label={tr('New code', 'Neuer Code')} title={tr('New code', 'Neuer Code')} onClick={() => setRenewing(true)}>
                <InviteIcon kind="renew" />
              </button>
            )}
          </div>
          <InviteCard
            link={code ? friendLink(code) : null}
            code={code}
            codeClass="friend-code-text"
            qrLabel={tr('My friend code as a QR code', 'Mein Freundes-Code als QR-Code')}
            waiting={problem ?? tr('Making your code …', 'Dein Code wird erstellt …')}
            hint={tr('Your friend scans it or gets your invitation – once he accepts, you are friends with each other.', 'Dein Freund scannt ihn oder bekommt deine Einladung – sobald er annimmt, seid ihr gegenseitig befreundet.')}
            actions={[
              { label: tr('Invite', 'Einladen'), aria: tr('Send invitation', 'Einladung senden'), icon: 'share', primary: true, disabled: !code, onClick: () => void invite() },
              { label: tr('Scan', 'Scannen'), aria: tr('Scan QR code', 'QR-Code scannen'), icon: 'scan', onClick: () => setScan(true) },
              { label: tr('Type code', 'Code eingeben'), aria: tr('Type a code', 'Code eingeben'), icon: 'type', onClick: () => setTyping(true) },
            ]}
          />
          {sent && <span className="muted small">{sent}</span>}
          {problem && code && <span className="small good-text">{problem}</span>}
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

      {/* two groups (Sascha 03.11.2026): the linked friends always on top, those typed by hand below – each with its mark */}
      {list.some((f) => f.uid) && <span className="eyebrow">{tr('Linked friends', 'Verknüpfte Freunde')}</span>}
      {[...list.filter((f) => f.uid), ...list.filter((f) => !f.uid)].map((f, k, all) => [
        !f.uid && (k === 0 || all[k - 1].uid) ? <span key="typed-eyebrow" className="eyebrow friends-group">{tr('Typed by hand', 'Von Hand angelegt')}</span> : null,
        f.uid ? (
          <SwipeRow
            key={f.id}
            label={f.fullName || f.name}
            onDelete={() => unfriendLater(f.uid!, f.fullName || f.name, () => setProblem(tr('No connection – the friend stays. Try again later.', 'Keine Verbindung – der Freund bleibt. Später nochmal.')))}
          >
            <div className="card friend-linked">
              <KindMark linked />
              <Avatar name={f.name} photo={f.photo} size={44} />
              <span className="grow">
                <strong>{f.fullName || f.name}</strong>
                <span className="muted small" style={{ display: 'block' }}>
                  {[f.hcp.trim() ? `HCP ${f.hcp}` : tr('no HCP in his profile', 'kein HCP im Profil'), f.club].filter(Boolean).join(' · ')}
                </span>
              </span>
            </div>
          </SwipeRow>
        ) : (
          <SwipeRow key={f.id} label={f.name.trim() || tr('friend', 'Freund')} onDelete={() => removeTyped(f)}>
            <div className="card game-player-row friend-typed">
              <KindMark />
              <div className="field">
                <label htmlFor={`fname-${f.id}`}>Name</label>
                <input id={`fname-${f.id}`} className="input" value={f.name} onChange={(e) => set(f.id, { name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor={`fhcp-${f.id}`}>Handicap</label>
                <input id={`fhcp-${f.id}`} className="input" inputMode="decimal" value={f.hcp} onChange={(e) => set(f.id, { hcp: e.target.value })} />
              </div>
            </div>
          </SwipeRow>
        ),
      ])}
      {!typedByHand.length && <span className="eyebrow friends-group">{tr('Typed by hand', 'Von Hand angelegt')}</span>}
      {linkable && typedByHand.some((f) => f.name.trim()) && (
        <span className="muted small">
          {tr('Send them your invitation: once accepted, the friend typed by hand becomes the linked one.', 'Schick ihnen deine Einladung: Sobald sie annehmen, wird aus dem von Hand angelegten Freund der verknüpfte.')}
        </span>
      )}
      {props.float ? (
        <FloatActions
          plus={{
            label: tr('Add friend', 'Freund hinzufügen'),
            onClick: () => {
              const id = newId();
              setList([...list, { id, name: '', hcp: '' }]);
              window.setTimeout(() => document.getElementById(`fname-${id}`)?.focus(), 60);
            },
          }}
        />
      ) : (
        <AddRow label={tr('Add friend', 'Freund hinzufügen')} onClick={() => setList([...list, { id: newId(), name: '', hcp: '' }])} />
      )}

      {scan && <QrScan title={tr('Scan QR code', 'QR-Code scannen')} onText={take} onClose={() => setScan(false)} />}
      {typing && (
        <div className="sheet-backdrop" onClick={() => setTyping(false)}>
          <section className="sheet" role="dialog" aria-label={tr('Type a code', 'Code eingeben')} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{tr('Type a code', 'Code eingeben')}</strong>
              <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setTyping(false)}>
                ✕
              </button>
            </div>
            <span className="muted small">{tr("The 6 digits under your friend's QR code.", 'Die 6 Ziffern unter dem QR-Code deines Freundes.')}</span>
            <form
              className="friend-code-type"
              onSubmit={(e) => {
                e.preventDefault();
                if (!take(typed)) setTypedProblem(tr('That is not a friend code (6 digits).', 'Das ist kein Freundes-Code (6 Ziffern).'));
              }}
            >
              <input className="input" autoFocus aria-label={tr("Your friend's code", 'Code deines Freundes')} placeholder="123-456" inputMode="numeric" autoComplete="off" value={typed} onChange={(e) => setTyped(typedCode(e.target.value))} />
              <button type="submit" className="btn-primary">
                {tr('Go', 'Los')}
              </button>
            </form>
            {typedProblem && <span className="small good-text">{typedProblem}</span>}
          </section>
        </div>
      )}
      {renewing && (
        <div className="sheet-backdrop" onClick={() => setRenewing(false)}>
          <section className="sheet" role="dialog" aria-label={tr('New code', 'Neuer Code')} onClick={(e) => e.stopPropagation()}>
            <strong>{tr('A new friend code?', 'Neuer Freundes-Code?')}</strong>
            <span className="muted">{tr('Your old QR code and the invitations sent stop working. Your friends stay.', 'Dein alter QR-Code und verschickte Einladungen gelten dann nicht mehr. Deine Freunde bleiben.')}</span>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setRenewing(false);
                void renewFriendCode()
                  .then(setCode)
                  .catch(() => setProblem(tr('No connection – try again later.', 'Keine Verbindung – später nochmal.')));
              }}
            >
              {tr('Make a new code', 'Neuen Code erstellen')}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setRenewing(false)}>
              {tr('Keep the code', 'Code behalten')}
            </button>
          </section>
        </div>
      )}
    </>
  );
}

/** A friend's request on every screen of the app (03.11.2026: Chris opened the invitation, signed in first – and then
 *  "nothing happened": the request waited only in the friends tab). Shown wherever one is, until accepted or closed. */
export function FriendAskHost() {
  const [ask, setAsk] = useState<string | null>(pendingAsk);
  useEffect(() => {
    const asked = () => setAsk(pendingAsk());
    window.addEventListener('golfos:friend-ask', asked);
    return () => window.removeEventListener('golfos:friend-ask', asked);
  }, []);
  // he accepted one's invitation (Sascha 03.11.2026: "as on Instagram – a notice that we are GolfOS friends now")
  const [joined, setJoined] = useState<string[]>([]);
  useEffect(() => {
    const on = (e: Event) => setJoined((x) => [...x, String((e as CustomEvent<string>).detail)]);
    window.addEventListener('golfos:friend-new', on);
    return () => window.removeEventListener('golfos:friend-new', on);
  }, []);
  if (ask) return <FriendAsk key={ask} code={ask} onSignIn={() => window.dispatchEvent(new Event('golfos:open-profile'))} />;
  if (!joined.length) return null;
  const close = () => setJoined((x) => x.slice(1));
  return (
    <div className="sheet-backdrop" onClick={close}>
      <section className="sheet" role="dialog" aria-label={tr('New friend', 'Neuer Freund')} onClick={(e) => e.stopPropagation()}>
        <div className="friend-ask">
          <strong>{tr(`${joined[0]} accepted your friend request`, `${joined[0]} hat deine Freundschaftsanfrage angenommen`)}</strong>
          {/* the tick as an SVG, not a glyph in the text (Facelift 11.11.2026, O5) */}
          <p className="good-text friend-done"><DoneTick />{tr('You are GolfOS friends now – name, handicap, home club and photo come from each other’s profile.', 'Ihr seid jetzt GolfOS-Freunde – Name, HCP, Heimatclub und Bild kommen gegenseitig aus dem Profil.')}</p>
          <button type="button" className="btn-primary" onClick={close}>
            {tr('Great', 'Prima')}
          </button>
        </div>
      </section>
    </div>
  );
}

/** What is typed into "Code eingeben": digits as 123-456 while typing; a code of the 12 characters from before as it is. */
function typedCode(v: string): string {
  return /^[\d\s-]*$/.test(v) ? showCode(v.replace(/\D/g, '').slice(0, 6)) : v;
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
  const [tooMany, setTooMany] = useState(false);
  const [state, setState] = useState<'ask' | 'busy' | 'done' | 'failed'>('ask');
  const [failed, setFailed] = useState('');
  useEffect(() => {
    void friendPreview(props.code)
      .then(setWho)
      .catch((e) => {
        setTooMany((e as Error)?.message === 'too_many');
        setWho(null);
      });
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
        ) : who === null && tooMany ? (
          <p className="notice">{tr('Too many wrong codes – try again in an hour.', 'Zu viele falsche Codes – in einer Stunde nochmal.')}</p>
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
              <p className="good-text friend-done"><DoneTick />{tr(`You and ${name} are friends – you are in ${name}'s list too.`, `Du und ${name} seid befreundet – du stehst jetzt auch in der Liste von ${name}.`)}</p>
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
                        .catch((e) => {
                          setFailed(
                            (e as Error)?.message === 'unknown_code'
                              ? tr('This code is no longer valid – ask for a new invitation.', 'Dieser Code gilt nicht mehr – lass dir eine neue Einladung schicken.')
                              : (e as Error)?.message === 'not_signed_in'
                                ? tr('Sign in first (Profile), then open the invitation again.', 'Melde dich zuerst an (Profil) und öffne die Einladung dann noch einmal.')
                                : (e as Error)?.message === 'not_listed'
                                  ? tr('Accepted – but the friend does not show yet. Open "Friends" again in a moment.', 'Angenommen – aber der Freund erscheint noch nicht. Öffne „Freunde“ gleich noch einmal.')
                                  : tr('That did not work – check the connection and try again.', 'Das hat nicht geklappt – Verbindung prüfen und nochmal.'),
                          );
                          setState('failed');
                        });
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
                {state === 'failed' && <span className="small good-text">{failed}</span>}
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

/** "Done" before a sentence: the app's tick as an SVG (Facelift 11.11.2026, O5 – before "✓" in the text). */
function DoneTick() {
  return (
    <svg className="done-tick" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

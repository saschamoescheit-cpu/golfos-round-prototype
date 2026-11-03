import type { ReactNode } from 'react';
import { tr } from '../lib/i18n';
import { Qr } from './ShareGame';
import { showCode } from '../lib/sharedgame';
import { useState } from 'react';
import { inviteFriend } from '../lib/push';
import { loadFriends } from '../lib/friends';
import { canLink } from '../lib/friendlinks';
import { letInvited } from '../lib/sharedround';
import { loadProfile, shownName } from '../lib/profile';
import { Avatar } from './Avatar';

// One look for every QR code in the app (Sascha 03.11.2026: "the QR code with the same functions as under Friends –
// identical everywhere"): the QR code in the middle, the code below it, one line what to do, then what one does with it
// as round icons with a word – the friend code, a round's, a game's, a pool's and a tournament's invitation.

export interface InviteAction {
  /** the word under the icon */
  label: string;
  /** what a screen reader says (and tests find): "Einladung senden" for "Einladen" */
  aria?: string;
  icon: 'share' | 'scan' | 'type' | 'copy';
  /** the main one, green: inviting */
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function InviteCard(props: {
  /** the link in the QR code – null: still being made (then `waiting` shows) */
  link: string | null;
  /** the code under the QR code – shown 123-456 */
  code: string | null;
  /** the code's own class (tests and older styles read it: "join-code", "friend-code-text") */
  codeClass?: string;
  codeLabel?: string;
  qrLabel?: string;
  /** the line under the code: who scans, where one types it */
  hint?: ReactNode;
  /** while the code is made, or why it could not be */
  waiting?: ReactNode;
  actions: InviteAction[];
  /** below the icons: a switch, inviting by user name … */
  children?: ReactNode;
}) {
  return (
    <div className="invite-qr">
      {props.link ? (
        <>
          <Qr text={props.link} label={props.qrLabel} />
          {props.code && (
            <strong className={`invite-qr-code${props.codeClass ? ` ${props.codeClass}` : ''}`} aria-label={props.codeLabel} data-code={props.code}>
              {showCode(props.code)}
            </strong>
          )}
        </>
      ) : (
        <span className="muted small invite-qr-waiting">{props.waiting ?? tr('Making the code …', 'Code wird erstellt …')}</span>
      )}
      {props.hint && <span className="muted small invite-qr-hint">{props.hint}</span>}
      <div className="qr-actions">
        {props.actions.map((a) => (
          <button key={a.label} type="button" className="qr-action" aria-label={a.aria ?? a.label} disabled={a.disabled} onClick={a.onClick}>
            <span className={`qr-action-icon${a.primary ? ' primary' : ''}`}>
              <InviteIcon kind={a.icon} />
            </span>
            <span className="small">{a.label}</span>
          </button>
        ))}
      </div>
      {props.children}
    </div>
  );
}

/** The icons of the QR cards (and the friend code's "new code"). */
export function InviteIcon(props: { kind: InviteAction['icon'] | 'renew' }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {props.kind === 'share' ? (
        <>
          <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" />
          <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
        </>
      ) : props.kind === 'scan' ? (
        <>
          <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
          <path d="M4 12h16" />
        </>
      ) : props.kind === 'type' ? (
        <>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" />
        </>
      ) : props.kind === 'copy' ? (
        <>
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
        </>
      ) : (
        <>
          <path d="M20 11a8 8 0 1 0-2.3 5.7" />
          <path d="M20 4v7h-7" />
        </>
      )}
    </svg>
  );
}

const me = (): string => shownName(loadProfile()) || tr('a player', 'ein Spieler');

/** The linked friends (Friends, by their accounts) invited with a tap (Sascha 03.11.2026: "invite linked friends directly –
 *  for every 'invite players' in the whole app"): let in at once, a push on his phone – and his app, open, asks him
 *  straight away. Below the InviteCard of a round, tournament, series, game or pool of bets – `code` its code. */
export function FriendInvite(props: { code: string; /** only these – the flight's players by name (Sascha 03.11.2026: "only the linked friends I added to the flight") */ only?: string[] }) {
  const [state, setState] = useState<Record<string, 'busy' | 'sent' | 'silent' | 'failed'>>({});
  const wanted = props.only?.map((n) => n.trim().toLowerCase()).filter(Boolean);
  const friends = canLink() ? loadFriends().filter((f) => f.uid && (!wanted || wanted.includes(f.name.trim().toLowerCase()) || wanted.includes((f.fullName ?? '').trim().toLowerCase()))) : [];
  if (!friends.length) return null;
  const go = async (uid: string, name: string) => {
    setState((x) => ({ ...x, [uid]: 'busy' }));
    let r: 'sent' | 'silent' | 'old' | null = await inviteFriend(props.code, uid, name, me());
    if (r === 'old') r = (await letInvited(props.code, uid, name, me())) ? 'silent' : null;
    setState((x) => ({ ...x, [uid]: r === 'sent' || r === 'silent' ? r : 'failed' }));
  };
  const said = friends
    .map((f) => {
      const st = state[f.uid!];
      const n = f.name;
      return st === 'sent'
        ? tr(`${n} gets a notification – one tap and he is in.`, `${n} bekommt eine Mitteilung – mit einem Tipp ist er dabei.`)
        : st === 'silent'
          ? tr(`${n} is invited – when he opens GolfOS, the request is there.`, `${n} ist eingeladen – öffnet er GolfOS, ist die Anfrage da.`)
          : st === 'failed'
            ? tr(`${n}: no connection – try again.`, `${n}: keine Verbindung – nochmal versuchen.`)
            : null;
    })
    .filter(Boolean);
  return (
    <div className="invite-friends" aria-label={tr('Invite linked friends', 'Verknüpfte Freunde einladen')}>
      <span className="eyebrow">{tr('Invite linked friends', 'Verknüpfte Freunde einladen')}</span>
      {friends.map((f) => {
        const st = state[f.uid!];
        const done = st === 'sent' || st === 'silent';
        return (
          <div key={f.uid} className="invite-friend">
            <Avatar name={f.name} photo={f.photo} size={32} />
            <span className="grow">
              <strong>{f.fullName || f.name}</strong>
              {f.hcp.trim() && <span className="muted small"> · HCP {f.hcp}</span>}
            </span>
            <button type="button" className={done ? 'btn-secondary' : 'btn-primary'} disabled={st === 'busy' || done} aria-label={done ? tr(`${f.name} invited`, `${f.name} eingeladen`) : tr(`Invite ${f.name}`, `${f.name} einladen`)} onClick={() => void go(f.uid!, f.fullName || f.name)}>
              {st === 'busy' ? '…' : done ? tr('Invited ✓', 'Eingeladen ✓') : tr('Invite', 'Einladen')}
            </button>
          </div>
        );
      })}
      {said.map((x) => (
        <span key={x} className="muted small" role="status">
          {x}
        </span>
      ))}
    </div>
  );
}

/** Share a link with the phone's share sheet (WhatsApp, messages …); without one (a PC) copied. Returns a line to show. */
export async function shareLink(text: string, url: string): Promise<string | null> {
  const nav = navigator as Navigator & { share?: (d: { text: string; url: string }) => Promise<void> };
  try {
    if (nav.share) {
      await nav.share({ text, url }); // no title: WhatsApp drops the link with one (Sascha 02.11.2026)
      return null;
    }
    await navigator.clipboard.writeText(`${text} ${url}`);
    return tr('Link copied.', 'Link kopiert.');
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return null; // closed by the player
    return null;
  }
}

/** Copy a link: "Link kopiert." – or null when the phone does not let it. */
export async function copyLink(url: string): Promise<string | null> {
  try {
    await navigator.clipboard.writeText(url);
    return tr('Link copied.', 'Link kopiert.');
  } catch {
    return tr('Copying did not work – share the link instead.', 'Kopieren ging nicht – teile den Link.');
  }
}

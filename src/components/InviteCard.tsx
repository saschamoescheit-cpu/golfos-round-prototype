import type { ReactNode } from 'react';
import { tr } from '../lib/i18n';
import { Qr } from './ShareGame';

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
  /** the code as shown under the QR code */
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
            <strong className={`invite-qr-code${props.codeClass ? ` ${props.codeClass}` : ''}`} aria-label={props.codeLabel}>
              {props.code}
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

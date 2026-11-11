import { useState } from 'react';
import { createPortal } from 'react-dom';
import { PASSWORD_MIN, setLogin, signInWithPassword, signUp } from '../lib/sync';
import { tr } from '../lib/i18n';
import { SettingsList, SettingsRow } from './Settings';
import { SaveButton } from './ui';

// Sign in with a user name and password, or create the account once (Sascha 22.10.2026: "as in Schlaufuchs") –
// besides "Sign in with Google". One form with its heading; the other way as a green line under the button (Facelift
// 11.11.2026, "konto": not a block of two buttons "Anmelden | Konto anlegen").

const typing = { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false } as const;

export function AccountForm(props: { onDone: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (mode === 'login') await signInWithPassword(name, pw);
      else await signUp(name, email, pw);
      props.onDone();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const ready = mode === 'login' ? !!name.trim() && !!pw : !!name.trim() && email.includes('@') && pw.length >= PASSWORD_MIN;
  const title = mode === 'login' ? tr('Sign in', 'Anmelden') : tr('Create account', 'Konto anlegen');
  return (
    <form className="account-form" aria-label={title} onSubmit={submit}>
      <strong className="account-title">{title}</strong>
      <div className="field">
        <label htmlFor="acc-name">{mode === 'login' ? tr('User name or e-mail', 'Benutzername oder E-Mail') : tr('User name', 'Benutzername')}</label>
        <input id="acc-name" className="input" value={name} maxLength={mode === 'login' ? 120 : 20} autoComplete="username" {...typing} onChange={(e) => setName(e.target.value)} />
        {mode === 'signup' && <span className="muted small">{tr('3–20 characters: letters a–z, digits, dot or dash. You sign in with it on your other devices.', '3–20 Zeichen: Buchstaben a–z, Ziffern, Punkt oder Strich. Damit meldest du dich auf deinen anderen Geräten an.')}</span>}
      </div>
      {mode === 'signup' && (
        <div className="field">
          <label htmlFor="acc-email">{tr('E-mail', 'E-Mail')}</label>
          <input id="acc-email" className="input" type="email" value={email} autoComplete="email" {...typing} onChange={(e) => setEmail(e.target.value)} />
        </div>
      )}
      <div className="field">
        <label htmlFor="acc-pw">{tr('Password', 'Passwort')}</label>
        <input id="acc-pw" className="input" type="password" value={pw} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} onChange={(e) => setPw(e.target.value)} />
        {mode === 'signup' && <span className="muted small">{tr(`At least ${PASSWORD_MIN} characters.`, `Mindestens ${PASSWORD_MIN} Zeichen.`)}</span>}
      </div>
      {/* a problem in the app's green, not a red error (Facelift 11.11.2026, O4 – docs/DESIGN.md) */}
      {err && (
        <p className="notice account-problem" role="alert">
          {err}
        </p>
      )}
      <button type="submit" className="btn-primary" disabled={busy || !ready}>
        {busy ? tr('One moment …', 'Einen Moment …') : title}
      </button>
      <button
        type="button"
        className="account-switch"
        onClick={() => {
          setMode(mode === 'login' ? 'signup' : 'login');
          setErr(null);
        }}
      >
        {mode === 'login' ? (
          <>
            {tr('No account yet? ', 'Noch kein Konto? ')}
            <strong>{tr('Create account', 'Konto anlegen')}</strong>
          </>
        ) : (
          <>
            {tr('Have an account? ', 'Schon ein Konto? ')}
            <strong>{tr('Sign in', 'Anmelden')}</strong>
          </>
        )}
      </button>
    </form>
  );
}

/** Signed in: the user name and the password as rows (Facelift 11.11.2026, P6 – "Anmeldedaten"): each opens its sheet,
 *  confirmed with the round save button in its head (Sascha: the password confirmed on purpose, not saved by itself).
 *  No user name yet (signed in with Google): one row "Benutzername · festlegen", its sheet with the password too. */
export function LoginEditor(props: { current: string | null; onDone: () => void }) {
  const [open, setOpen] = useState<'name' | 'pw' | null>(null);
  return (
    <>
      <SettingsList label={tr('Sign-in details', 'Anmeldedaten')}>
        <SettingsRow label={tr('User name', 'Benutzername')} value={props.current ?? tr('set', 'festlegen')} need={!props.current} onClick={() => setOpen('name')} />
        {props.current && <SettingsRow label={tr('Password', 'Passwort')} value={tr('change', 'ändern')} onClick={() => setOpen('pw')} />}
      </SettingsList>
      {open && (
        <LoginSheet
          what={open}
          current={props.current}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            props.onDone();
          }}
        />
      )}
    </>
  );
}

function LoginSheet(props: { what: 'name' | 'pw'; current: string | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(props.current ?? '');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const needPw = !props.current; // no user name so far: the password belongs to it
  const withName = props.what === 'name';
  const withPw = props.what === 'pw' || needPw;
  const ready = (!withName || (!!name.trim() && name.trim() !== props.current)) && (!withPw || pw.length >= PASSWORD_MIN);
  const title = props.what === 'pw' ? tr('Change password', 'Passwort ändern') : props.current ? tr('User name', 'Benutzername') : tr('Set a user name', 'Benutzername festlegen');
  const save = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await setLogin(withName ? name : props.current, withPw ? pw : null);
      props.onSaved();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return createPortal(
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{title}</strong>
          <span className="sheet-head-acts">
            <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
              ✕
            </button>
            <SaveButton onClick={() => void save()} disabled={!ready || busy} />
          </span>
        </div>
        <form
          className="account-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {withName && (
            <div className="field">
              <label htmlFor="ed-name">{tr('User name', 'Benutzername')}</label>
              <input id="ed-name" className="input" value={name} maxLength={20} autoComplete="username" {...typing} onChange={(e) => setName(e.target.value)} />
              <span className="muted small">{tr('3–20 characters: letters a–z, digits, dot or dash.', '3–20 Zeichen: Buchstaben a–z, Ziffern, Punkt oder Strich.')}</span>
            </div>
          )}
          {withPw && (
            <div className="field">
              <label htmlFor="ed-pw">{props.what === 'pw' ? tr('New password', 'Neues Passwort') : tr('Password', 'Passwort')}</label>
              <input id="ed-pw" className="input" type="password" value={pw} autoComplete="new-password" onChange={(e) => setPw(e.target.value)} />
              <span className="muted small">{tr(`At least ${PASSWORD_MIN} characters.`, `Mindestens ${PASSWORD_MIN} Zeichen.`)}</span>
            </div>
          )}
          {err && (
            <p className="notice account-problem" role="alert">
              {err}
            </p>
          )}
          {/* Enter confirms as the save button does */}
          <button type="submit" hidden />
        </form>
      </section>
    </div>,
    document.body,
  );
}

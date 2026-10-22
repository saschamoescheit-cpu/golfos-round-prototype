import { useState } from 'react';
import { PASSWORD_MIN, setLogin, signInWithPassword, signUp } from '../lib/sync';
import { tr } from '../lib/i18n';
import { Segmented } from './ui';

// Sign in with a user name and password, or create the account once (Sascha 22.10.2026: "as in Schlaufuchs") –
// besides "Sign in with Google".

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
  return (
    <form className="account-form" onSubmit={submit}>
      <Segmented<'login' | 'signup'>
        label={tr('Sign in or create an account', 'Anmelden oder Konto anlegen')}
        value={mode}
        onChange={(v) => {
          if (!v) return;
          setMode(v);
          setErr(null);
        }}
        options={[
          { value: 'login', label: tr('Sign in', 'Anmelden') },
          { value: 'signup', label: tr('Create account', 'Konto anlegen') },
        ]}
      />
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
      {err && (
        <span className="small bad-text" role="alert">
          {err}
        </span>
      )}
      <button type="submit" className="btn-primary" disabled={busy || !ready}>
        {busy ? tr('One moment …', 'Einen Moment …') : mode === 'login' ? tr('Sign in', 'Anmelden') : tr('Create account', 'Konto anlegen')}
      </button>
    </form>
  );
}

/** Signed in: set or change user name and password (e.g. after signing in with Google). */
export function LoginEditor(props: { current: string | null; onDone: () => void }) {
  const [name, setName] = useState(props.current ?? '');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const needPw = !props.current; // no user name so far: the password belongs to it
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await setLogin(name, pw ? pw : null);
      props.onDone();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="account-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="ed-name">{tr('User name', 'Benutzername')}</label>
        <input id="ed-name" className="input" value={name} maxLength={20} autoComplete="username" {...typing} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="ed-pw">{props.current ? tr('New password (empty = stays)', 'Neues Passwort (leer lassen = bleibt)') : tr('Password', 'Passwort')}</label>
        <input id="ed-pw" className="input" type="password" value={pw} autoComplete="new-password" onChange={(e) => setPw(e.target.value)} />
        <span className="muted small">{tr(`At least ${PASSWORD_MIN} characters.`, `Mindestens ${PASSWORD_MIN} Zeichen.`)}</span>
      </div>
      {err && (
        <span className="small bad-text" role="alert">
          {err}
        </span>
      )}
      <div className="account-actions">
        <button type="submit" className="btn-primary" disabled={busy || !name.trim() || (needPw && pw.length < PASSWORD_MIN)}>
          {busy ? tr('One moment …', 'Einen Moment …') : tr('Save', 'Speichern')}
        </button>
        <button type="button" className="btn-secondary" onClick={props.onDone}>
          {tr('Cancel', 'Abbrechen')}
        </button>
      </div>
    </form>
  );
}

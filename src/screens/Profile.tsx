import { PAY_DETAILS, paypalName } from '../lib/wagers';
import { PenGlyph } from '../components/Glyph';
import { CurrencyRow } from '../components/CurrencyRow';
import { useEffect, useRef, useState } from 'react';
import type { Round } from '../types';
import { Attribution, TopBar } from '../components/ui';
import { carryToReview } from '../lib/stats';
import { loadCarryBag, loadUnit, saveUnit } from '../lib/storage';
import { getLang, tr } from '../lib/i18n';
import { ChoiceRow, SettingsList, SettingsRow } from '../components/Settings';
import { CaddieSettingsFields } from '../components/CaddieSettingsFields';
import { CoursePicker } from './CoursePicker';
import { SyncCard } from '../components/SyncCard';
import { PushCard } from '../components/PushCard';
import { Help, type HelpTab } from './Help';
import { Avatar } from '../components/Avatar';
import { PhotoCropper } from '../components/PhotoCropper';
import { STANDARD_CLUBS } from '../lib/clubs';
import { loadBagStyle } from '../lib/bagstyle';
import { loadProfile, profileIndex, saveProfile, type Profile } from '../lib/profile';
import { STANDARD_TEES, TEE_COLOURS, teeName } from '../data/tees';
import { groupForHandicap, GROUPS } from '../lib/sg';
import { deleteAccount, loadSession, signOut } from '../lib/sync';
import { shareBackup } from '../lib/backup';
import { shareWatchSamples, watchSamples } from '../lib/watch';
import { Block } from '../components/Block';
import { ACTION_ICONS } from '../components/ActionBar';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { LoginEditor } from '../components/AccountForm';

// Tab "Profile" (Sascha 14.10.2026, instead of BeBrassie's "More"): personal data, settings, the bag with
// distances and the caddie – everything the player sets once and the app keeps (the backup gave way to the sync).
// Facelift 11.11.2026 (P1–P4): every block with its small title above it, choices as rows with their sheet, the account's
// actions in one bar, deleting it asked as everywhere (ConfirmSheet).

export function ProfileTab(props: { rounds: Round[]; onBag: () => void; onCaddie: () => void; onChanged: () => void; onBack?: () => void; /** the friends – from every module (night 10./11.11.2026: they were only on the start page) */ onFriends?: () => void }) {
  const [p, setP] = useState<Profile>(loadProfile);
  const [unit, setUnit] = useState(loadUnit);
  const [picking, setPicking] = useState(false);
  const [help, setHelp] = useState<HelpTab | null>(null);
  const [teePick, setTeePick] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);
  const [cropping, setCropping] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  const [session, setSession] = useState(loadSession);
  // the swings the Apple Watch recorded (only in the app)
  const [swings, setSwings] = useState({ count: 0, uri: '' });
  useEffect(() => {
    void watchSamples().then(setSwings);
  }, []);
  useEffect(() => {
    const on = () => {
      const a = document.activeElement;
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return; // typing: the next sync brings it
      setP(loadProfile());
      setUnit(loadUnit());
      setRev((r) => r + 1);
    };
    window.addEventListener('golfos:pulled', on);
    return () => window.removeEventListener('golfos:pulled', on);
  }, []);
  const review = carryToReview(props.rounds, loadCarryBag()).length;
  const bag = loadCarryBag();
  const clubCount = (bag?.length ?? STANDARD_CLUBS.length) + (loadBagStyle().putter ? 1 : 0);
  const locale = getLang() === 'de' ? 'de-DE' : undefined;
  const set = (patch: Partial<Profile>) => {
    const next = { ...p, ...patch };
    setP(next);
    saveProfile(next);
  };

  const autoGroup = GROUPS.find((g) => g.id === groupForHandicap(profileIndex(p)))?.label ?? '';

  // help: the tutorial videos and the frequent questions (Sascha 23.10.2026)
  if (help)
    return (
      <div className="overlay-screen">
        <Help tab={help} onBack={() => setHelp(null)} />
      </div>
    );
  if (picking)
    return (
      <div className="overlay-screen">
        <CoursePicker
          onBack={() => setPicking(false)}
          onPicked={(c) => {
            set({ homeClub: c.name });
            setPicking(false);
          }}
        />
      </div>
    );

  // the photo as with Google – chosen, placed and removed by the player (a Google photo comes from Google)
  const canRemovePhoto = !!p.photo && (!session || !!session.username);

  return (
    <>
      {props.onBack ? <TopBar title={tr('Profile', 'Profil')} onBack={props.onBack} backLabel={tr('Back to My golf', 'Zurück zu Mein Golf')} /> : <h1 className="tab-title">{tr('Profile', 'Profil')}</h1>}

      {/* the Google sign-in first (Sascha 16.10.2026): it brings the name and the photo */}
      <SyncCard onSignedIn={() => { setP(loadProfile()); setSession(loadSession()); }} />

      {deleteMsg && <p className="notice account-delete-msg" role="status">{deleteMsg}</p>}

      <Block title={tr('About you', 'Persönliche Daten')}>
        <section className="card stats-card">
          <div className="profile-photo">
            <button type="button" className="profile-photo-btn" aria-label={tr('Change your photo', 'Profilbild ändern')} onClick={() => photoInput.current?.click()}>
              <Avatar name={p.firstName || '?'} me size={72} />
              <span className="profile-photo-edit" aria-hidden="true">
                <PenGlyph />
              </span>
            </button>
            {/* signed in: the account beside the photo again, "Abmelden" and "Konto löschen" small under it (Sascha 13.11.2026:
                "der obere Teil sollte wie früher neben dem Profilbild integriert werden") */}
            {session && (
              <span className="profile-account">
                <span>{session.username ? tr(`Signed in as ${session.username}`, `Angemeldet als ${session.username}`) : tr('Signed in with Google', 'Mit Google angemeldet')}</span>
                {session.email && <span className="muted small">{session.email}</span>}
                <span className="profile-account-actions" role="group" aria-label={tr('Account', 'Konto')}>
                  <button
                    type="button"
                    className="mini-action"
                    onClick={() => {
                      signOut();
                      setSession(null);
                    }}
                  >
                    {ACTION_ICONS.signout}
                    <span>{tr('Sign out', 'Abmelden')}</span>
                  </button>
                  <button type="button" className="mini-action danger" onClick={() => { setDeleting(true); setDeleteMsg(null); }}>
                    {ACTION_ICONS.delete}
                    <span>{tr('Delete account', 'Konto löschen')}</span>
                  </button>
                </span>
              </span>
            )}
            {/* the photo removed with the bin beside it (P4) – no text button */}
            {canRemovePhoto && (
              <button type="button" className="icon-btn photo-remove" aria-label={tr('Remove your photo', 'Profilbild entfernen')} title={tr('Remove', 'Entfernen')} onClick={() => set({ photo: undefined })}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
                </svg>
              </button>
            )}
            {cropping && (
              <PhotoCropper
                src={cropping}
                onCancel={() => setCropping(null)}
                onSave={(photo) => {
                  set({ photo });
                  setCropping(null);
                }}
              />
            )}
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) setCropping(await readPhoto(f)); // placed and zoomed by hand first (Sascha 17.10.2026)
              }}
            />
          </div>
          {/* user name and password only for an account signed in with them – with Google none needed (Sascha 13.11.2026) */}
          {session?.username && <LoginEditor current={session.username} onDone={() => setSession(loadSession())} />}
          <div className="form-grid">
            <div className="field">
              <label htmlFor="pf-first">{tr('First name', 'Vorname')}</label>
              <input id="pf-first" className="input" autoComplete="given-name" value={p.firstName} onChange={(e) => set({ firstName: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="pf-last">{tr('Last name', 'Nachname')}</label>
              <input id="pf-last" className="input" autoComplete="family-name" value={p.lastName} onChange={(e) => set({ lastName: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="pf-hcp">{tr('Handicap index', 'Handicap-Index')}</label>
            <input
              id="pf-hcp"
              className="input"
              inputMode="decimal"
              placeholder={tr('e.g. 18.4', 'z. B. 18,4')}
              value={p.hcpIndex}
              onChange={(e) => set({ hcpIndex: e.target.value.replace(/[^0-9.,+-]/g, '').slice(0, 5) })}
            />
          </div>
          {/* paid by PayPal right from the settlement (Sascha 10.11.2026) – the name behind paypal.me/ */}
          {PAY_DETAILS && (
            <div className="field">
              <label htmlFor="pf-paypal">{tr('PayPal.me name', 'PayPal.me-Name')}</label>
              <input
                id="pf-paypal"
                className="input"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder={tr('e.g. SaschaM (paypal.me/SaschaM)', 'z. B. SaschaM (paypal.me/SaschaM)')}
                value={p.paypal ?? ''}
                onChange={(e) => set({ paypal: paypalName(e.target.value) })}
              />
            </div>
          )}
          {/* gender as a row with its sheet (Facelift 11.11.2026, P1 – before a menu, Sascha 22.10.2026): course rating and
              the tee to start with follow from it */}
          <SettingsList>
            <ChoiceRow<'' | 'm' | 'f' | 'd'>
              label={tr('Gender', 'Geschlecht')}
              value={p.gender ?? ''}
              onChange={(v) => set({ gender: (v || undefined) as Profile['gender'] })}
              options={[
                { value: 'm', name: tr('male', 'männlich'), text: tr("The men's course rating, the yellow tee to start with", 'Course Rating der Herren, Start von Gelb') },
                { value: 'f', name: tr('female', 'weiblich'), text: tr("The ladies' course rating, the red tee to start with", 'Course Rating der Damen, Start von Rot') },
                { value: 'd', name: tr('diverse', 'divers'), text: tr("The men's course rating, the yellow tee to start with", 'Course Rating der Herren, Start von Gelb') },
                { value: '', name: tr('Not stated', 'Keine Angabe'), text: tr("The men's course rating, the yellow tee to start with", 'Course Rating der Herren, Start von Gelb') },
              ]}
            />
          </SettingsList>
        </section>
      </Block>

      {/* the Golf block as rows of one list, "Mein Bag ›" one of them (Sascha 12.11.2026: "Mein Bag as a normal row like Tee
          and Distanzen"; the friends no longer here – the menu and the start page lead to them); rows like every other
          setting, the choice in a sheet (Sascha 11.11.2026, design rounds 3–4); the home club and the strokes gained
          comparison rows of the same list (Facelift 11.11.2026, P2 – before a label above a lone row) */}
      <Block title={tr('Golf', 'Golf')}>
        <SettingsList>
          <SettingsRow label={tr('My bag', 'Mein Bag')} value={review > 0 ? tr(`${review} new`, `${review} neu`) : tr(`${clubCount} clubs`, `${clubCount} Schläger`)} need={review > 0} onClick={props.onBag} />
          {/* searched like when starting a round (Sascha 15.10.2026) */}
          <button type="button" className="settings-row home-club" onClick={() => setPicking(true)}>
            <span>{tr('Home club', 'Heimatclub')}</span>
            <span className="settings-value">{p.homeClub || tr('Search a course', 'Platz suchen')}</span>
            <span aria-hidden="true">›</span>
          </button>
          {/* the tee every round starts with – changed before the start when needed (Sascha 22.10.2026) */}
          <button type="button" className="settings-row std-tee" aria-haspopup="dialog" onClick={() => setTeePick(true)}>
            <span>Tee</span>
            <span className="settings-value std-tee-name">
              {p.tee && <span className="tee-dot" style={{ background: TEE_COLOURS[p.tee] ?? '#999' }} />}
              <span>{p.tee ? teeName(p.tee) : tr('none', 'keins')}</span>
            </span>
            <span aria-hidden="true">›</span>
          </button>
          <ChoiceRow<'m' | 'yd'>
            label={tr('Distances in', 'Distanzen in')}
            value={unit}
            onChange={(v) => {
              setUnit(v);
              saveUnit(v);
            }}
            options={[
              { value: 'm', name: tr('Metres', 'Meter'), text: tr('As on courses in Germany', 'Wie auf deutschen Plätzen') },
              { value: 'yd', name: 'Yards', text: tr('As in the USA and Great Britain', 'Wie in den USA und in Großbritannien') },
            ]}
          />
          <ChoiceRow<'right' | 'left'>
            label={tr('You play', 'Du spielst')}
            value={p.hand ?? 'right'}
            onChange={(v) => set({ hand: v })}
            options={[
              { value: 'right', name: tr('Right-handed', 'Rechtshänder') },
              { value: 'left', name: tr('Left-handed', 'Linkshänder'), text: tr('Pictures and the 3D golfer mirrored', 'Bilder und der 3D-Golfer gespiegelt') },
            ]}
          />
          {/* the currency (Sascha 12.11.2026): the Bilanz shows games and bets in another currency converted to it – at the
              rate of their cut-off day; none: each in its own. The whole catalogue, searchable (Sascha 12.11.2026) */}
          <CurrencyRow value={p.currency} onChange={(c) => set({ currency: c })} />
          {/* the group strokes gained is measured against – by default the next better one to the index (Sascha 17.10.2026) */}
          <ChoiceRow<string>
            label={tr('Strokes gained compared with', 'Strokes-Gained-Vergleich')}
            value={p.sgGroup ?? ''}
            onChange={(v) => set({ sgGroup: v || undefined })}
            shown={p.sgGroup ? undefined : <span className="value-2l">{autoGroup}<span>{tr('(automatic)', '(automatisch)')}</span></span>}
            options={[{ value: '', name: tr(`${autoGroup} (automatic)`, `${autoGroup} (automatisch)`), text: tr('The next better group – follows your handicap index', 'Die nächstbessere Gruppe – folgt deinem Handicap-Index') }, ...GROUPS.map((g) => ({ value: g.id, name: g.label }))]}
          />
        </SettingsList>
        {/* (the switch "Schlag per Ton (Test)" is gone – Sascha 03.11.2026: the iOS app hears the shots by itself) */}
      </Block>

      {/* the caddie's settings as rows of the same look (Sascha 12.11.2026) */}
      <Block title={tr('Caddie', 'Caddie')}>
        <CaddieSettingsFields key={rev} />
      </Block>

      {teePick && (
        <div className="sheet-backdrop" onClick={() => setTeePick(false)}>
          <section className="sheet" role="dialog" aria-label="Tee" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>Tee</strong>
              <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setTeePick(false)}>
                ✕
              </button>
            </div>
            <div className="pick-list">
              {[...STANDARD_TEES, ''].map((t) => (
                <button
                  key={t || 'none'}
                  type="button"
                  className="pick-option"
                  aria-pressed={(p.tee ?? '') === t}
                  onClick={() => {
                    set({ tee: t || undefined });
                    setTeePick(false);
                  }}
                >
                  {t ? <span className="tee-dot" style={{ background: TEE_COLOURS[t] ?? '#999' }} /> : <span className="tee-dot none" />}
                  <span className="grow">
                    <strong>{t ? teeName(t) : tr('None', 'Keins')}</strong>
                    {!t && <span className="muted small">{tr('yellow for men, red for ladies', 'Herren Gelb, Damen Rot')}</span>}
                  </span>
                  {(p.tee ?? '') === t && <span className="pick-check" aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
      {/* notifications on this phone (final list, Sascha 23.10.2026) */}
      <PushCard signedIn={!!session} key={session ? 'in' : 'out'} />
      {/* help (Sascha 23.10.2026): the tutorial as videos and the frequent questions – rows of a settings list as
          everywhere (Facelift 11.11.2026, P2) */}
      <Block title={tr('Help', 'Hilfe')}>
        <SettingsList label={tr('Help', 'Hilfe')}>
          <SettingsRow label={tr('Videos', 'Videos')} onClick={() => setHelp('videos')} />
          <SettingsRow label={tr('Frequent questions', 'Häufige Fragen')} onClick={() => setHelp('faq')} />
        </SettingsList>
      </Block>
      {/* your data (final list 22.10.2026; Sascha 23.10.2026: the text under the heading, the button as the round's export) */}
      <Block title={tr('Your data', 'Deine Daten')}>
        <section className="card stats-card">
          {/* the export tile, its text to the right (Sascha 23.10.2026) */}
          <div className="data-row">
            <button
              type="button"
              className="sc-action"
              onClick={async () => {
                try {
                  await shareBackup();
                } catch {
                  // the share sheet closed – nothing to say
                }
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v12M8 11l4 4 4-4" />
                <path d="M5 21h14" />
              </svg>
              <span>Export</span>
            </button>
            <p className="data-text muted small">{tr('Rounds, games, profile, bag and settings as one file.', 'Runden, Spiele, Profil, Bag und Einstellungen als eine Datei.')}</p>
          </div>
          {/* the Apple Watch's swings recorded (08.11.2026) – to tune the shot detection; only in the app, once there are some */}
          {swings.count > 0 && (
            <div className="data-row">
              <button type="button" className="sc-action" onClick={() => void shareWatchSamples(swings.uri).catch(() => undefined)}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="6" y="6" width="12" height="12" rx="3" />
                  <path d="M9 6l1-3h4l1 3M9 18l1 3h4l1-3M12 9.5V12l1.5 1.5" />
                </svg>
                <span>{tr('Watch', 'Uhr')}</span>
              </button>
              <p className="data-text muted small">{tr(`Your Apple Watch's ${swings.count} swings as a file – to tune the shot detection.`, `Die ${swings.count} Schwünge deiner Apple Watch als Datei – zum Feinjustieren der Schlagerkennung.`)}</p>
            </div>
          )}
        </section>
      </Block>
      {/* delete the account: asked as everywhere in the app (ConfirmSheet, Facelift 11.11.2026 P4); the data on this phone stay */}
      {deleting && session && (
        <ConfirmSheet
          title={tr('Delete account?', 'Konto löschen?')}
          text={tr(
            'Delete your account and all your data on the server? Rounds, games and settings on this phone stay – your other devices keep theirs too.',
            'Konto und alle deine Daten auf dem Server löschen? Runden, Spiele und Einstellungen auf diesem Handy bleiben – auch deine anderen Geräte behalten ihre.',
          )}
          confirmLabel={tr('Delete for good', 'Endgültig löschen')}
          busy={deleteBusy}
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            setDeleteBusy(true);
            try {
              await deleteAccount();
              setSession(null);
              setDeleting(false);
              setDeleteMsg(tr('Your account is deleted. The data on this phone stay.', 'Dein Konto ist gelöscht. Die Daten auf diesem Handy bleiben.'));
            } catch (e) {
              setDeleting(false);
              setDeleteMsg(e instanceof Error ? e.message : String(e));
            } finally {
              setDeleteBusy(false);
            }
          }}
        />
      )}
      <div className="home-foot">
        <Attribution />
        <span className="muted small" title={__BUILD_TIME__}>
          Version {new Date(__BUILD_TIME__).toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </>
  );
}

/** A chosen photo read as a data address, at most 1600 px – the cropper places and zooms it. */
async function readPhoto(file: File): Promise<string> {
  const raw = await new Promise<string>((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = fail;
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((ok, fail) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = fail;
    i.src = raw;
  });
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  if (k === 1) return raw;
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.9);
}

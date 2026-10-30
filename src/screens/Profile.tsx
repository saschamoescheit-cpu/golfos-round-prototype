import { useEffect, useRef, useState } from 'react';
import type { Round } from '../types';
import { Attribution, Segmented, TopBar } from '../components/ui';
import { carryToReview } from '../lib/stats';
import { loadCaddieSettings, loadCarryBag, loadUnit, saveUnit } from '../lib/storage';
import { getLang, tr } from '../lib/i18n';
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
import { setSoundTest, soundTestOn } from '../lib/impact';
import { pocketTestOn, setPocketTest } from '../components/PocketMode';

// Tab "Profile" (Sascha 14.10.2026, instead of BeBrassie's "More"): personal data, settings, the bag with
// distances and the caddie – everything the player sets once and the app keeps (the backup gave way to the sync).

export function ProfileTab(props: { rounds: Round[]; onBag: () => void; onCaddie: () => void; onChanged: () => void; onBack?: () => void }) {
  const [p, setP] = useState<Profile>(loadProfile);
  const [unit, setUnit] = useState(loadUnit);
  const [picking, setPicking] = useState(false);
  const [help, setHelp] = useState<HelpTab | null>(null);
  const [sgPick, setSgPick] = useState(false);
  const [teePick, setTeePick] = useState(false);
  const [soundTest, setSoundTestState] = useState(soundTestOn);
  const [pocketTest, setPocketTestState] = useState(pocketTestOn);
  const photoInput = useRef<HTMLInputElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);
  const [cropping, setCropping] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  const [session, setSession] = useState(loadSession);
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
  const caddie = loadCaddieSettings();
  const clubCount = (bag?.length ?? STANDARD_CLUBS.length) + (loadBagStyle().putter ? 1 : 0);
  const locale = getLang() === 'de' ? 'de-DE' : undefined;
  const set = (patch: Partial<Profile>) => {
    const next = { ...p, ...patch };
    setP(next);
    saveProfile(next);
  };

  const autoGroup = GROUPS.find((g) => g.id === groupForHandicap(profileIndex(p)))?.label ?? '';
  const sgSheet = sgPick && (
    <div className="sheet-backdrop" onClick={() => setSgPick(false)}>
      <section className="sheet" role="dialog" aria-label={tr('Strokes gained compared with', 'Strokes-Gained-Vergleich')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{tr('Strokes gained compared with', 'Strokes-Gained-Vergleich')}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setSgPick(false)}>
            ✕
          </button>
        </div>
        <div className="pick-list">
          {[{ id: '', label: tr(`Next better group (${autoGroup})`, `Nächstbessere Gruppe (${autoGroup})`), hint: tr('Follows your handicap index', 'Folgt deinem Handicap-Index') }, ...GROUPS.map((g) => ({ id: g.id, label: g.label, hint: '' }))].map((o) => (
            <button
              key={o.id || 'auto'}
              type="button"
              className="pick-option"
              aria-pressed={(p.sgGroup ?? '') === o.id}
              onClick={() => {
                set({ sgGroup: o.id || undefined });
                setSgPick(false);
              }}
            >
              <span className="grow">
                <strong>{o.label}</strong>
                {o.hint && <span className="muted small">{o.hint}</span>}
              </span>
              {(p.sgGroup ?? '') === o.id && <span className="pick-check" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      </section>
    </div>
  );

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

  return (
    <>
      {props.onBack ? <TopBar title={tr('Profile', 'Profil')} onBack={props.onBack} backLabel={tr('Back to My golf', 'Zurück zu Mein Golf')} /> : <h1 className="tab-title">{tr('Profile', 'Profil')}</h1>}

      {/* the Google sign-in first (Sascha 16.10.2026): it brings the name and the photo */}
      <SyncCard onSignedIn={() => { setP(loadProfile()); setSession(loadSession()); }} />

      <section className="card stats-card">
        <h2>{tr('About you', 'Persönliche Daten')}</h2>
        <div className="profile-photo">
          <button type="button" className="profile-photo-btn" aria-label={tr('Change your photo', 'Profilbild ändern')} onClick={() => photoInput.current?.click()}>
            <Avatar name={p.firstName || '?'} me size={72} />
            <span className="profile-photo-edit" aria-hidden="true">✎</span>
          </button>
          {session ? (
            <span className="profile-account">
              <span className="small">{session.username ? tr(`Signed in as ${session.username}`, `Angemeldet als ${session.username}`) : tr('Signed in with Google', 'Mit Google angemeldet')}</span>
              {session.email && <span className="muted small">{session.email}</span>}
              {/* signed in: only "Abmelden" (Sascha 22.10.2026: "the two ways to sign in only when not signed in") */}
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  signOut();
                  setSession(null);
                }}
              >
                {tr('Sign out', 'Abmelden')}
              </button>
            </span>
          ) : (
            <span />
          )}
          {/* the photo as with Google – chosen, placed and removed by the player (a Google photo comes from Google) */}
          {p.photo && (!session || !!session.username) && (
            <button type="button" className="btn-ghost" onClick={() => set({ photo: undefined })}>
              {tr('Remove', 'Entfernen')}
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
        {/* gender left of the handicap index, as a menu (Sascha 22.10.2026): course rating and the tee to start with follow from it */}
        <div className="form-grid">
          <div className="field">
            <label htmlFor="pf-gender">{tr('Gender', 'Geschlecht')}</label>
            <span className="select-wrap">
              <select id="pf-gender" className="input" value={p.gender ?? ''} onChange={(e) => set({ gender: (e.target.value || undefined) as Profile['gender'] })}>
                <option value="">–</option>
                <option value="m">{tr('male', 'männlich')}</option>
                <option value="f">{tr('female', 'weiblich')}</option>
                <option value="d">{tr('diverse', 'divers')}</option>
              </select>
            </span>
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
        </div>
        <div className="field">
          <label>{tr('Home club', 'Heimatclub')}</label>
          {/* searched like when starting a round (Sascha 15.10.2026) */}
          <button type="button" className="settings-row home-club" onClick={() => setPicking(true)}>
            <span className={p.homeClub ? '' : 'muted'}>{p.homeClub || tr('Search a course', 'Platz suchen')}</span>
            <span aria-hidden="true">›</span>
          </button>
        </div>
      </section>

      <section className="card stats-card">
        <h2>{tr('Golf', 'Golf')}</h2>
        <button type="button" className="list-item" onClick={props.onBag}>
          <span className="grow">
            <span className="title">{tr('My bag', 'Mein Bag')}</span>
            <span className="muted small">
              {tr(`${clubCount} clubs · favourite approach ${caddie.favourite} m`, `${clubCount} Schläger · Lieblingsdistanz ${caddie.favourite} m`)}
            </span>
          </span>
          {review > 0 && <span className="badge-dot">{tr(`${review} new`, `${review} neu`)}</span>}
          <span aria-hidden="true">›</span>
        </button>
        {/* the tee every round starts with – changed before the start when needed (Sascha 22.10.2026) */}
        <div className="field">
          <label>{tr('Standard tee', 'Standard-Tee')}</label>
          <button type="button" className="settings-row std-tee" aria-haspopup="dialog" onClick={() => setTeePick(true)}>
            <span className="std-tee-name">
              {p.tee && <span className="tee-dot" style={{ background: TEE_COLOURS[p.tee] ?? '#999' }} />}
              <span className={p.tee ? '' : 'muted'}>{p.tee ? teeName(p.tee) : tr('none – yellow (ladies red)', 'keins – Gelb (Damen Rot)')}</span>
            </span>
            <span aria-hidden="true">›</span>
          </button>
        </div>
        <div className="field">
          <label>{tr('Distances in', 'Distanzen in')}</label>
          <Segmented<'m' | 'yd'>
            label={tr('Unit', 'Einheit')}
            value={unit}
            onChange={(v) => {
              if (!v) return;
              setUnit(v);
              saveUnit(v);
            }}
            options={[
              { value: 'm', label: tr('Metres', 'Meter') },
              { value: 'yd', label: 'Yards' },
            ]}
          />
        </div>
        <div className="field">
          <label>{tr('You play', 'Du spielst')}</label>
          <Segmented<'right' | 'left'>
            label={tr('Hand', 'Hand')}
            value={p.hand ?? 'right'}
            onChange={(v) => v && set({ hand: v })}
            options={[
              { value: 'right', label: tr('Right-handed', 'Rechtshänder') },
              { value: 'left', label: tr('Left-handed', 'Linkshänder') },
            ]}
          />
        </div>
        {/* a test (Sascha 18.10.2026), above the strokes gained comparison – a slider as every on/off (23.10.2026): the
            microphone listens for the strike while the hole map is open – nothing recorded */}
        <div className="drawer-list settings-switches">
          <button
            type="button"
            className="drawer-row"
            role="switch"
            aria-checked={soundTest}
            onClick={() => {
              setSoundTest(!soundTest);
              setSoundTestState(!soundTest);
            }}
          >
            <span className="switch-label">
              <span>{tr('Shot by sound (test)', 'Schlag per Ton (Test)')}</span>
              <span className="muted small">{tr('Hears the strike during the round · this device only', 'Hört während der Runde den Treffmoment · nur auf diesem Gerät')}</span>
            </span>
            <span className={`drawer-switch${soundTest ? ' on' : ''}`} aria-hidden="true" />
          </button>
          {/* back as a test (Sascha 28.10.2026): the screen stays on but black, so GPS and the microphone keep going */}
          <button
            type="button"
            className="drawer-row"
            role="switch"
            aria-checked={pocketTest}
            onClick={() => {
              setPocketTest(!pocketTest);
              setPocketTestState(!pocketTest);
            }}
          >
            <span className="switch-label">
              <span>{tr('Pocket mode (test)', 'Taschenmodus (Test)')}</span>
              <span className="muted small">{tr('Screen black instead of locked – GPS and the shot by sound keep going · this device only','Bildschirm schwarz statt gesperrt – GPS und Schlag per Ton laufen weiter · nur auf diesem Gerät')}</span>
            </span>
            <span className={`drawer-switch${pocketTest ? ' on' : ''}`} aria-hidden="true" />
          </button>
        </div>
        {/* the group strokes gained is measured against – by default the next better one to the index (Sascha 17.10.2026);
            a row like the home club, the choice in a sheet like the game form (Sascha: "it does not look like the rest") */}
        <div className="field">
          <label>{tr('Strokes gained compared with', 'Strokes-Gained-Vergleich')}</label>
          <button type="button" className="settings-row home-club sg-row" onClick={() => setSgPick(true)}>
            <span>{p.sgGroup ? GROUPS.find((g) => g.id === p.sgGroup)?.label : tr(`Next better group (${autoGroup})`, `Nächstbessere Gruppe (${autoGroup})`)}</span>
            <span aria-hidden="true">›</span>
          </button>
        </div>
      </section>

      <section className="card stats-card">
        <h2>{tr('Caddie', 'Caddie')}</h2>
        <CaddieSettingsFields key={rev} />
      </section>



      {sgSheet}
      {teePick && (
        <div className="sheet-backdrop" onClick={() => setTeePick(false)}>
          <section className="sheet" role="dialog" aria-label={tr('Standard tee', 'Standard-Tee')} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{tr('Standard tee', 'Standard-Tee')}</strong>
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
      {/* help (Sascha 23.10.2026): the tutorial as videos and the frequent questions */}
      <section className="card stats-card">
        <h2>{tr('Help', 'Hilfe')}</h2>
        <div className="drawer-list">
          <button type="button" className="drawer-row" onClick={() => setHelp('videos')}>
            <span className="switch-label">
              <span>{tr('Videos', 'Videos')}</span>
              <span className="muted small">{tr('The app in 7 short chapters', 'Die App in 7 kurzen Kapiteln')}</span>
            </span>
            <span className="drawer-value" aria-hidden="true">›</span>
          </button>
          <button type="button" className="drawer-row" onClick={() => setHelp('faq')}>
            <span className="switch-label">
              <span>{tr('Frequent questions', 'Häufige Fragen')}</span>
              <span className="muted small">{tr('Answers by topic, each with its video', 'Antworten nach Themen, jede mit ihrem Video')}</span>
            </span>
            <span className="drawer-value" aria-hidden="true">›</span>
          </button>
        </div>
      </section>
      {/* your data (final list 22.10.2026; Sascha 23.10.2026: the text under the heading, the button as the round's export) */}
      <section className="card stats-card">
        <h2>{tr('Your data', 'Deine Daten')}</h2>
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
      </section>
      {/* delete the account: its own place, the button alone, apart from "your data" (Sascha 23.10.2026) – signed in only,
          asked once more; the data on this phone stay */}
      {session && (
        <div className="account-delete">
          {!deleting ? (
            <button type="button" className="btn-secondary btn-danger" onClick={() => { setDeleting(true); setDeleteMsg(null); }}>
              {tr('Delete account', 'Konto löschen')}
            </button>
          ) : (
            <div className="delete-ask card" role="group" aria-label={tr('Delete account?', 'Konto löschen?')}>
              <span>
                {tr(
                  'Delete your account and all your data on the server? Rounds, games and settings on this phone stay – your other devices keep theirs too.',
                  'Konto und alle deine Daten auf dem Server löschen? Runden, Spiele und Einstellungen auf diesem Handy bleiben – auch deine anderen Geräte behalten ihre.',
                )}
              </span>
              <div className="nav-bottom" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <button type="button" className="btn-secondary" onClick={() => setDeleting(false)}>
                  {tr('Cancel', 'Abbrechen')}
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-danger"
                  onClick={async () => {
                    try {
                      await deleteAccount();
                      setSession(null);
                      setDeleting(false);
                      setDeleteMsg(tr('Your account is deleted. The data on this phone stay.', 'Dein Konto ist gelöscht. Die Daten auf diesem Handy bleiben.'));
                    } catch (e) {
                      setDeleteMsg(e instanceof Error ? e.message : String(e));
                    }
                  }}
                >
                  {tr('Delete for good', 'Endgültig löschen')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {deleteMsg && <span className="muted small account-delete-msg" role="status">{deleteMsg}</span>}
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

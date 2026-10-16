import { useRef, useState } from 'react';
import type { Round } from '../types';
import { Attribution, Segmented } from '../components/ui';
import { carryToReview } from '../lib/stats';
import { loadCaddieSettings, loadCarryBag, loadUnit, saveUnit } from '../lib/storage';
import { getLang, tr } from '../lib/i18n';
import { CaddieSettingsFields } from '../components/CaddieSettingsFields';
import { CoursePicker } from './CoursePicker';
import { SyncCard } from '../components/SyncCard';
import { Avatar } from '../components/Avatar';
import { STANDARD_CLUBS } from '../lib/clubs';
import { loadBagStyle } from '../lib/bagstyle';
import { loadProfile, saveProfile, type Profile } from '../lib/profile';
import { isTestMode, setTestMode } from '../lib/testmode';

// Tab "Profile" (Sascha 14.10.2026, instead of BeBrassie's "More"): personal data, settings, the bag with
// distances and the caddie – everything the player sets once and the app keeps (the backup gave way to the sync).

export function ProfileTab(props: { rounds: Round[]; onBag: () => void; onCaddie: () => void; onChanged: () => void }) {
  const [testMode, setTestModeState] = useState(isTestMode);
  const [p, setP] = useState<Profile>(loadProfile);
  const [unit, setUnit] = useState(loadUnit);
  const [picking, setPicking] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
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
      <h1 className="tab-title">{tr('Profile', 'Profil')}</h1>

      {/* the Google sign-in first (Sascha 16.10.2026): it brings the name and the photo */}
      <SyncCard onSignedIn={() => setP(loadProfile())} />

      <section className="card stats-card">
        <h2>{tr('About you', 'Persönliche Daten')}</h2>
        <div className="profile-photo">
          <button type="button" className="profile-photo-btn" aria-label={tr('Change your photo', 'Profilbild ändern')} onClick={() => photoInput.current?.click()}>
            <Avatar name={p.firstName || '?'} me size={72} />
            <span className="profile-photo-edit" aria-hidden="true">✎</span>
          </button>
          <span className="muted small">{p.photo ? tr('Tap the photo to change it.', 'Tippe aufs Bild, um es zu ändern.') : tr('Tap to add a photo.', 'Tippe, um ein Bild hinzuzufügen.')}</span>
          {p.photo && (
            <button type="button" className="link-btn muted small" onClick={() => set({ photo: undefined })}>
              {tr('Remove', 'Entfernen')}
            </button>
          )}
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) set({ photo: await shrinkPhoto(f) });
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
          <span className="muted small">{tr('Used for the playing handicap when you start a round.', 'Daraus rechnet die App beim Rundenstart deine Spielvorgabe.')}</span>
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
      </section>

      <section className="card stats-card">
        <h2>{tr('Caddie', 'Caddie')}</h2>
        <CaddieSettingsFields />
      </section>

      {/* test mode: shots by hand to measure the shot detection (Sascha 16.10.2026) */}
      <section className="card stats-card">
        <h2>{tr('Test', 'Test')}</h2>
        <button type="button" className="drawer-row" role="switch" aria-checked={testMode} onClick={() => {
          setTestMode(!testMode);
          setTestModeState(!testMode);
        }}>
          <span className="switch-label">
            <span>{tr('Track shots by hand', 'Schläge von Hand erfassen')}</span>
            <span className="muted small">{tr('"Shot here" on the map, at the ball – to compare with the detection', '„Schlag hier“ auf der Karte, am Ball – zum Vergleich mit der Erkennung')}</span>
          </span>
          <span className={`drawer-switch${testMode ? ' on' : ''}`} aria-hidden="true" />
        </button>
      </section>


      <div className="home-foot">
        <Attribution />
        <span className="muted small" title={__BUILD_TIME__}>
          Version {new Date(__BUILD_TIME__).toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </>
  );
}

/** A chosen photo as a small square JPEG (160 px) – small enough to keep on the phone and to sync. */
async function shrinkPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = fail;
      i.src = url;
    });
    const n = 160;
    const c = document.createElement('canvas');
    c.width = n;
    c.height = n;
    const side = Math.min(img.width, img.height);
    c.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, n, n);
    return c.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

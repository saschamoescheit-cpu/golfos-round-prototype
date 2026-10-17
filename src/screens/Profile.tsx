import { useEffect, useRef, useState } from 'react';
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
import { loadProfile, profileIndex, saveProfile, type Profile } from '../lib/profile';
import { groupForHandicap, GROUPS } from '../lib/sg';
import { loadSession, signOut } from '../lib/sync';

// Tab "Profile" (Sascha 14.10.2026, instead of BeBrassie's "More"): personal data, settings, the bag with
// distances and the caddie – everything the player sets once and the app keeps (the backup gave way to the sync).

export function ProfileTab(props: { rounds: Round[]; onBag: () => void; onCaddie: () => void; onChanged: () => void }) {
  const [p, setP] = useState<Profile>(loadProfile);
  const [unit, setUnit] = useState(loadUnit);
  const [picking, setPicking] = useState(false);
  const [sgPick, setSgPick] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
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
              <span className="small">{tr('Signed in with Google', 'Mit Google angemeldet')}</span>
              {session.email && <span className="muted small">{session.email}</span>}
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
          {p.photo && !session && (
            <button type="button" className="btn-ghost" onClick={() => set({ photo: undefined })}>
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

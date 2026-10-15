import { useRef, useState } from 'react';
import type { Round } from '../types';
import { Attribution, Segmented } from '../components/ui';
import { restoreBackup, shareBackup } from '../lib/backup';
import { carryToReview } from '../lib/stats';
import { loadCaddieSettings, loadCarryBag, loadUnit, saveUnit } from '../lib/storage';
import { getLang, tr } from '../lib/i18n';
import { CaddieSettingsFields } from '../components/CaddieSettingsFields';
import { CoursePicker } from './CoursePicker';
import { SyncCard } from '../components/SyncCard';
import { STANDARD_CLUBS } from '../lib/clubs';
import { loadBagStyle } from '../lib/bagstyle';
import { loadProfile, saveProfile, type Profile } from '../lib/profile';

// Tab "Profile" (Sascha 14.10.2026, instead of BeBrassie's "More"): personal data, settings, the bag with
// distances, the caddie and the backup – everything the player sets once and the app keeps.

export function ProfileTab(props: { rounds: Round[]; onBag: () => void; onCaddie: () => void; onChanged: () => void }) {
  const [p, setP] = useState<Profile>(loadProfile);
  const [unit, setUnit] = useState(loadUnit);
  const [picking, setPicking] = useState(false);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
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

      <section className="card stats-card">
        <h2>{tr('About you', 'Persönliche Daten')}</h2>
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
      </section>

      <section className="card stats-card">
        <h2>{tr('Settings', 'Einstellungen')}</h2>
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
        <h3 className="settings-sub">{tr('Caddie', 'Caddie')}</h3>
        <CaddieSettingsFields />
      </section>

      <SyncCard />

      <section className="card stats-card">
        <h2>{tr('Backup', 'Sicherung')}</h2>
        <p className="muted small" style={{ margin: 0 }}>
          {tr(
            'Your rounds live only on this phone. Safari and the home-screen app keep separate data – use a backup to move or save it.',
            'Deine Runden liegen nur auf diesem Handy. Safari und die App auf dem Home-Bildschirm speichern getrennt – mit einer Sicherung kannst du sie übertragen oder aufbewahren.',
          )}
        </p>
        <div className="nav-bottom" style={{ gridTemplateColumns: props.rounds.length ? '1fr 1fr' : '1fr' }}>
          {props.rounds.length > 0 && (
            <button type="button" className="btn-secondary" onClick={() => shareBackup().catch(() => setBackupMsg(tr('Backup cancelled.', 'Sicherung abgebrochen.')))}>
              {tr('Save backup', 'Sichern')}
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={() => fileInput.current?.click()}>
            {tr('Restore backup', 'Wiederherstellen')}
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              let data: unknown;
              try {
                data = JSON.parse(await file.text());
              } catch {
                throw new Error(tr('This file is not a GolfOS backup.', 'Diese Datei ist keine GolfOS-Sicherung.'));
              }
              const { rounds } = restoreBackup(data as Parameters<typeof restoreBackup>[0]);
              setBackupMsg(tr(`Backup restored · ${rounds} ${rounds === 1 ? 'round' : 'rounds'} added.`, `Sicherung wiederhergestellt · ${rounds} ${rounds === 1 ? 'Runde' : 'Runden'} hinzugefügt.`));
              setP(loadProfile());
              props.onChanged();
            } catch (err) {
              setBackupMsg(err instanceof Error ? err.message : tr('This file could not be read.', 'Diese Datei konnte nicht gelesen werden.'));
            }
          }}
        />
        {backupMsg && <p className="small" style={{ margin: 0 }}>{backupMsg}</p>}
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

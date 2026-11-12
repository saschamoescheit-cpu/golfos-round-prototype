import { useEffect, useRef, useState } from 'react';
import { ActionBar } from './ActionBar';
import { FloatActions } from './FloatActions';
import { OnOffRow, SettingsList } from './Settings';
import { tr } from '../lib/i18n';
import { metres, specialBoard, specialName, specialsAt, type Special } from '../lib/specials';
import { setSpecial, type RoundEvent } from '../lib/sharedround';

// Special prizes at their hole (Sascha 01.11.2026: "Long Drive and Nearest to the Pin – the player enters his figure at
// the hole, everyone sees who leads"): a line on the hole map with the leader and "eintragen"; Nearest to the Pin the
// distance to the hole (one decimal), Long Drive the length from the tee – GPS suggests it, the player corrects it –
// and whether the ball is in the fairway (only then it counts). The host corrects an entry in Games.

/** The leader of a prize as one line: "Chris 2,4 m" – or none yet. */
export function leaderText(ev: RoundEvent, s: Special): string {
  const top = specialBoard(ev).find((x) => x.special.id === s.id)?.rows[0];
  return top ? `${top.name} ${metres(top.m, s.kind)}` : tr('nobody yet', 'noch keiner');
}

export function SpecialsAtHole(props: { ev: RoundEvent; code: string; flight: string; player: string; phone: string; hole: number; /** Long Drive: the length from the tee by GPS, metres */ fromTee: number | null }) {
  const specials = specialsAt(props.ev, props.hole);
  const [open, setOpen] = useState<Special | null>(null);
  // the sheet stays while it is open – a moment without the prize in the event (another phone's write coming in) must not
  // close it and lose what was typed (Sascha 12.11.2026, the night's QA: typed 247, the server kept 245)
  if (!specials.length && !open) return null;
  return (
    <>
      {specials.map((s) => {
        const mine = props.ev.flights[props.flight]?.specials?.[s.id]?.[props.player];
        return (
          <div key={s.id} className="test-shot-row">
            <span className="map-hint detected" role="status" aria-label={specialName(s.kind)}>
              <span>
                <strong>{specialName(s.kind)}</strong> · {tr('leading', 'führend')}: {leaderText(props.ev, s)}
              </span>
              <button type="button" className="btn-ghost" onClick={() => setOpen(s)}>
                {mine?.m != null ? tr(`yours ${metres(mine.m, s.kind)}`, `deins ${metres(mine.m, s.kind)}`) : s.kind === 'nearestPin' ? tr('Enter distance', 'Abstand eintragen') : tr('Enter length', 'Weite eintragen')}
              </button>
            </span>
          </div>
        );
      })}
      {open && <SpecialSheet {...props} special={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function SpecialSheet(props: { ev: RoundEvent; code: string; flight: string; player: string; phone: string; fromTee: number | null; special: Special; onClose: () => void }) {
  const s = props.special;
  const ntp = s.kind === 'nearestPin';
  // as it was when the sheet opened: a first entry is saved with the floating tick, one there already corrected saves by
  // itself (Sascha 11.11.2026, Facelift-Abnahme T3: "wenn nachträglich was bearbeitet wird, die automatische Speicherung")
  const [had] = useState(() => props.ev.flights[props.flight]?.specials?.[s.id]?.[props.player]);
  const editing = had?.m != null;
  const [value, setValue] = useState(() => (had?.m != null ? String(had.m).replace('.', ',') : !ntp && props.fromTee != null ? String(props.fromTee) : ''));
  const [fairway, setFairway] = useState(had?.fairway ?? true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const m = Number(value.replace(',', '.'));
  const valid = value.trim() !== '' && Number.isFinite(m) && m > 0 && m < (ntp ? 100 : 500);
  const entryOf = (v: number, fw: boolean) => ({ m: ntp ? Math.round(v * 10) / 10 : Math.round(v), ...(ntp ? {} : { fairway: fw }) });
  const write = (entry: { m: number | null; fairway?: boolean } | null) => setSpecial(props.code, props.flight, s.id, props.player, entry ? { ...entry, at: new Date().toISOString(), by: props.phone } : null);
  const noNet = () => setMsg(tr('No connection – try again in a moment.', 'Keine Verbindung – gleich noch einmal versuchen.'));
  // new: the tick saves and closes; taken back: gone, closed
  const save = async (entry: { m: number | null; fairway?: boolean } | null) => {
    setBusy(true);
    const ok = await write(entry);
    setBusy(false);
    if (ok) props.onClose();
    else noNet();
  };
  // corrected: a moment after the last change and when the sheet closes – one save at a time
  const key = JSON.stringify([valid ? entryOf(m, fairway) : null]);
  const saved = useRef(key);
  const latest = useRef({ key, entry: valid ? entryOf(m, fairway) : null });
  latest.current = { key, entry: valid ? entryOf(m, fairway) : null };
  const chain = useRef<Promise<void>>(Promise.resolve());
  const [saving, setSaving] = useState<'idle' | 'busy' | 'done'>('idle');
  const saveNow = async () => {
    const cur = latest.current;
    if (!editing || !cur.entry || saved.current === cur.key) return;
    setSaving('busy');
    const ok = await write(cur.entry);
    if (ok) {
      saved.current = cur.key;
      setMsg(null);
    } else {
      noNet();
      // on the course the connection comes back: tried again by itself while the sheet is open
      if (open.current) window.setTimeout(() => open.current && void flush(), 3000);
    }
    setSaving(ok ? 'done' : 'idle');
  };
  const flush = (): Promise<void> => (chain.current = chain.current.then(saveNow, saveNow));
  const open = useRef(true);
  useEffect(() => {
    open.current = true;
    return () => {
      // gone without "close" (the hole screen moved on, the app went to the background): what was typed is still saved
      void flush();
      open.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!editing || saved.current === key) return;
    const t = window.setTimeout(() => void flush(), 900);
    return () => window.clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => {
    void flush();
    props.onClose();
  };
  return (
    <div className="sheet-backdrop" onClick={close}>
      <section className="sheet" role="dialog" aria-label={specialName(s.kind)} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>
            {specialName(s.kind)} · {tr('hole', 'Loch')} {props.ev.holes[s.hole]?.label}
          </strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={close}>
            ✕
          </button>
        </div>
        <span className="muted small">
          {tr('Leading', 'Führend')}: {leaderText(props.ev, s)}
        </span>
        <div className="field">
          <label htmlFor="special-m">{ntp ? tr('Distance to the hole (m)', 'Abstand zur Fahne (m)') : tr('Length from the tee (m)', 'Weite vom Abschlag (m)')}</label>
          <input id="special-m" className="input" inputMode="decimal" value={value} placeholder={ntp ? '2,4' : '240'} onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ''))} />
          {!ntp && props.fromTee != null && (
            <button type="button" className="chip" onClick={() => setValue(String(props.fromTee))}>
              {tr(`GPS: ${props.fromTee} m from the tee`, `GPS: ${props.fromTee} m vom Abschlag`)}
            </button>
          )}
          {!ntp && props.fromTee == null && <span className="muted small">{tr('No GPS here – enter the length yourself.', 'Kein GPS hier – die Weite selbst eintragen.')}</span>}
        </div>
        {!ntp && (
          <>
            {/* yes / no as a row like every other setting (Facelift-Abnahme T3) */}
            <SettingsList>
              <OnOffRow label={tr('In the fairway', 'Im Fairway')} on={fairway} onChange={setFairway} onText={tr('The drive counts', 'Der Drive zählt')} offText={tr('In the rough – it does not count', 'Im Rough – er zählt nicht')} />
            </SettingsList>
            <span className="muted small">{tr('Only in the fairway it counts.', 'Nur im Fairway zählt er.')}</span>
          </>
        )}
        {editing && <ActionBar label={tr('My entry', 'Mein Eintrag')} actions={[{ label: tr('Take back', 'Zurücknehmen'), aria: tr('Take mine back', 'Meinen Wert zurücknehmen'), icon: 'reopen', danger: true, disabled: busy, onClick: () => { saved.current = latest.current.key; void save(null); } }]} />}
        {msg && (
          <span className="small good-text" role="status">
            {msg}
          </span>
        )}
        {editing ? (
          <span className="muted small autosave-note" role="status">
            {!valid ? tr('Enter a figure – then it is saved.', 'Wert eintragen – dann wird gespeichert.') : saving === 'busy' ? tr('Saving …', 'Speichert …') : saving === 'done' ? tr('Saved – for everyone', 'Gespeichert – für alle') : tr('Changes are saved by themselves', 'Änderungen werden von selbst gespeichert')}
          </span>
        ) : (
          // a first entry: the round green tick bottom right, above the sheet (Sascha 11.11.2026)
          <FloatActions overSheet save={{ label: tr('Save', 'Eintragen'), disabled: busy || !valid, onClick: () => void save(entryOf(m, fairway)) }} />
        )}
      </section>
    </div>
  );
}

import { useState } from 'react';
import { SpeakerIcon, useSpeaking } from './SpeakerIcon';
import { answer, canListen, listen, speak, summary, toggleSpeak, type CaddieFacts } from '../lib/caddietalk';
import { RulesBook } from './RulesBook';
import type { HoleNote } from '../lib/holenotes';
import { LIE_OPTIONS, type LieKind } from '../lib/caddie';
import { getLang, tr } from '../lib/i18n';
import type { HazardAhead, HoleBook } from '../lib/holebook';
import type { PlaysLike } from '../lib/caddie';
import { formatDistance, type Unit } from '../lib/geo';
import { hazardWord, sideWord } from '../lib/i18n';

// The caddie on the hole map (feature 017): appears when he has something new to say, can be hidden completely.
// Folded it is one glance – club, distance and the one line that matters; tapped open: reasons, lie, read aloud,
// ask, rules, hole notes.

export function CaddieCard(props: {
  facts: CaddieFacts;
  lines: { text: string; tone?: 'warn' | 'plan' | 'mental' | 'muted'; lead?: boolean }[];
  alt: string | null;
  onHide: () => void;
  note: HoleNote;
  onNote: (n: HoleNote) => void;
  holeLabel: string;
  clubCode: string;
  lie: LieKind | null; // null on the tee
  onLie: (l: LieKind) => void;
  book?: HoleBook | null; // what the course book knows about the hole
  /** what makes the shot longer or shorter, the boundary near the target and the hazards ahead (Sascha 18.10.2026) */
  pl?: PlaysLike;
  weather?: { tempC: number; windKmh: number } | null;
  ob?: { left: number; right: number } | null;
  ahead?: HazardAhead[];
  unit?: Unit;
}) {
  // the player opened the caddie: everything at once (Sascha 15.10.2026); no folding – shown or hidden from the
  // map's menu (Sascha 16.10.2026: "den kleinen Einklapppfeil brauchen wir nicht")
  const [sheet, setSheet] = useState<'ask' | 'rules' | 'notes' | null>(null);
  const talking = useSpeaking();
  const f = props.facts;
  // at most three lines (Sascha 16.10.2026: "der Caddie hat viel zu viele Informationen"): the head – club, distance,
  // plays like –, then the instruction (his plan, or the caddie's aim) and the one danger that matters. The rest is
  // still worked out and answered under "Ask".
  // the boundary has its own row below – not twice
  const shown = pickLines(props.lines).filter((l) => !(props.ob && /^(Out of bounds|Aus) /.test(l.text)));
  const head = `${Math.round(f.distance)} ${f.unit} ${f.targetTo} · ${tr('plays', 'spielt wie')} ${Math.round(f.playsLike)} ${f.unit}`;
  return (
    <>
      <section className="caddie-card" aria-label="AI caddie">
        <div className="head">
          <span className="club">{props.clubCode}</span>
          <span className="grow">
            {Math.round(f.distance)} {f.unit} {f.targetTo} · {tr('plays', 'spielt wie')} <strong className="nowrap">{Math.round(f.playsLike)} {f.unit}</strong>
          </span>
        </div>
        {shown.map((l, k) => (
          <span key={k} className={l.tone === 'warn' ? 'plan warn' : l.tone === 'plan' ? 'plan' : l.tone === 'mental' ? 'mental' : 'why'}>
            {l.text}
          </span>
        ))}
        <CaddieFacts pl={props.pl} weather={props.weather ?? null} ob={props.ob ?? null} ahead={props.ahead ?? []} unit={props.unit ?? 'm'} />
        {SHOW_DETAILS && props.alt && <span className="alt">{props.alt}</span>}
        {SHOW_DETAILS && props.book && <BookPart book={props.book} said={props.lines.map((l) => l.text)} />}
        {props.lie != null && (
          <label className="caddie-lie">
            <span>{tr('Lie', 'Lage')}</span>
            <select value={props.lie} onChange={(e) => props.onLie(e.target.value as LieKind)}>
              {LIE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="caddie-actions">
          {/* read aloud exactly what the card says */}
          <button type="button" onClick={() => toggleSpeak(SHOW_DETAILS ? summary(f) : [`${f.club}.`, head + '.', ...shown.map((l) => l.text)].join(' '))} aria-label={tr('Read aloud or stop', 'Vorlesen oder stoppen')} aria-pressed={talking}>
            <SpeakerIcon />
          </button>
          <button type="button" onClick={() => setSheet('ask')}>
            {tr('Ask', 'Fragen')}
          </button>
          <button type="button" onClick={() => setSheet('rules')}>
            {tr('Rules', 'Regeln')}
          </button>
          <button type="button" onClick={() => setSheet('notes')} aria-label={tr('Hole notes', 'Lochnotizen')}>
            <span className="wide-only">{tr('Hole notes', 'Lochnotizen')}</span>
            <span className="narrow-only">{tr('Notes', 'Notizen')}</span>
          </button>
          <button type="button" onClick={props.onHide} aria-label={tr('Hide caddie', 'Caddie ausblenden')}>
            ✕
          </button>
        </div>
      </section>
      {sheet === 'ask' && <AskSheet facts={f} onClose={() => setSheet(null)} onRules={() => setSheet('rules')} />}
      {sheet === 'rules' && <RulesBook onClose={() => setSheet(null)} />}
      {sheet === 'notes' && <NotesSheet hole={props.holeLabel} note={props.note} onSave={props.onNote} onClose={() => setSheet(null)} />}
    </>
  );
}

/** The long caddie (every reason, the hole book, other clubs) – off: the card keeps three lines (Sascha 16.10.2026). */
const SHOW_DETAILS = false;

type Line = { text: string; tone?: 'warn' | 'plan' | 'mental' | 'muted'; lead?: boolean };
/** The instruction (the player's plan or today's club talk, else the caddie's aim) and the one warning. */
export function pickLines(lines: Line[]): Line[] {
  const where = /^(You are|Du liegst) /;
  const instruction =
    lines.find((l) => l.lead) ?? lines.find((l) => l.tone === 'plan' && !where.test(l.text) && !/^(From the map|Laut Karte)/.test(l.text)) ?? null;
  const warning = lines.find((l) => l.tone === 'warn' && l !== instruction) ?? null;
  return [instruction, warning].filter((l): l is Line => l != null);
}

function Sheet(props: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet" role="dialog" aria-label={props.title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{props.title}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        {props.children}
      </section>
    </div>
  );
}

const QUESTIONS = (): string[] =>
  getLang() === 'de'
    ? ['Welcher Schläger?', 'Wie weit?', 'Wohin ziele ich?', 'Wie ist der Wind?', 'Wo steht die Fahne?', 'Wo darf ich verfehlen?', 'Was ist der Plan?', 'Wie läuft das Grün?']
    : ['What club?', 'How far?', 'Where do I aim?', 'How is the wind?', 'Where is the flag?', 'Where can I miss?', "What's the plan?", 'How does the green break?'];

function AskSheet(props: { facts: CaddieFacts; onClose: () => void; onRules: () => void }) {
  const [q, setQ] = useState<string | null>(null);
  const [a, setA] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ask = (text: string) => {
    setQ(text);
    const reply = answer(text, props.facts);
    setA(reply);
    speak(reply);
  };
  return (
    <Sheet title={tr('Ask your caddie', 'Frag deinen Caddie')} onClose={props.onClose}>
      <div className="chip-row wrap">
        {QUESTIONS().map((x) => (
          <button key={x} type="button" onClick={() => ask(x)}>
            {x}
          </button>
        ))}
        <button type="button" onClick={props.onRules}>
          {tr('Rules help', 'Regelhilfe')}
        </button>
      </div>
      {canListen() && (
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const heard = await listen();
            setBusy(false);
            if (heard) ask(heard);
            else setA(tr('I did not catch that – tap a question instead.', 'Das habe ich nicht verstanden – tippe stattdessen eine Frage an.'));
          }}
        >
          {busy ? tr('Listening …', 'Ich höre zu …') : tr('🎤 Ask with your voice', '🎤 Per Sprache fragen')}
        </button>
      )}
      {q && <p className="muted small" style={{ margin: 0 }}>{tr(`“${q}”`, `„${q}“`)}</p>}
      {a && <p style={{ margin: 0, fontSize: 17 }}>{a}</p>}
    </Sheet>
  );
}

export function NotesSheet(props: { hole: string; note: HoleNote; onSave: (n: HoleNote) => void; onClose: () => void }) {
  const [n, setN] = useState<HoleNote>(props.note);
  const flip = (k: 'obLeft' | 'obRight' | 'obLong') => setN({ ...n, [k]: !n[k] });
  return (
    <Sheet title={tr(`Hole ${props.hole} – what the caddie should know`, `Loch ${props.hole} – was der Caddie wissen soll`)} onClose={props.onClose}>
      <button type="button" className="toggle" aria-pressed={!!n.obLeft} onClick={() => flip('obLeft')}>
        {n.obLeft ? '✓' : '○'} {tr('Out of bounds left', 'Aus links')}
      </button>
      <button type="button" className="toggle" aria-pressed={!!n.obRight} onClick={() => flip('obRight')}>
        {n.obRight ? '✓' : '○'} {tr('Out of bounds right', 'Aus rechts')}
      </button>
      <button type="button" className="toggle" aria-pressed={!!n.obLong} onClick={() => flip('obLong')}>
        {n.obLong ? '✓' : '○'} {tr('Out of bounds behind the green', 'Aus hinter dem Grün')}
      </button>
      <div className="field">
        <label htmlFor="hole-note">{tr('Note (shown by the caddie)', 'Notiz (zeigt der Caddie)')}</label>
        <input id="hole-note" className="input" value={n.text ?? ''} placeholder={tr('e.g. blind tee shot – aim at the right tree', 'z. B. blinder Abschlag – auf den rechten Baum zielen')} onChange={(e) => setN({ ...n, text: e.target.value })} />
      </div>
      <button
        type="button"
        className="btn-primary"
        onClick={() => {
          props.onSave(n);
          props.onClose();
        }}
      >
        {tr('Save for this course', 'Für diesen Platz speichern')}
      </button>
    </Sheet>
  );
}

/** The course book's facts on the hole (Sascha 15.10.2026), under the caddie's advice when unfolded. */
function BookPart(props: { book: HoleBook; said: string[] }) {
  // a line the caddie already said above (e.g. the best leave on the green) is not repeated
  const b = { ...props.book, green: props.book.green.filter((t) => !props.said.includes(t)) };
  if (!b.tip && !b.rise && !b.hazards.length && !b.green.length && !b.record.length) return null;
  return (
    <div className="caddie-book" aria-label={tr('The hole', 'Das Loch')}>
      <span className="caddie-book-title">{tr('The hole', 'Das Loch')}{b.rise ? ` · ${b.rise}` : ''}</span>
      {b.tip && (
        <>
          <span className="caddie-book-lbl">{tr('Tip for this hole', 'Tipp für dieses Loch')}</span>
          <span>{b.tip}</span>
        </>
      )}
      {b.hazards.length > 0 && (
        <>
          <span className="caddie-book-lbl">{tr('From the tee: to reach / to carry', 'Vom Abschlag: bis dorthin / drüber')}</span>
          {b.hazards.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </>
      )}
      {b.green.length > 0 && (
        <>
          <span className="caddie-book-lbl">{tr('Green', 'Grün')}</span>
          {b.green.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </>
      )}
      {b.record.length > 0 && (
        <>
          <span className="caddie-book-lbl">{tr('Your record', 'Deine Bilanz')}</span>
          {b.record.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </>
      )}
    </div>
  );
}

const Icon = (p: { d: string }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={p.d} />
  </svg>
);
const WIND = 'M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h8';
const TEMP = 'M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0z';
const HILL = 'M3 19l6-8 4 5 3-3 5 6z';
const STAKE = 'M7 3v18M17 3v18M7 8h10M7 14h10';
const SAND = 'M3 16c3-4 6-4 9 0s6 4 9 0M5 11c2-2 5-2 7 0';
const WATER = 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z';

/** The facts under the caddie's advice (Sascha 18.10.2026: "very little information in the caddie – out of bounds,
 *  the coming hazards, the influence of temperature and wind"): one row what changes the length, one the boundary
 *  near the target, one per hazard ahead – short, each with its sign. */
function CaddieFacts(props: { pl?: PlaysLike; weather: { tempC: number; windKmh: number } | null; ob: { left: number; right: number } | null; ahead: HazardAhead[]; unit: Unit }) {
  const u = props.unit;
  const d = (m: number) => `${formatDistance(m, u)} ${u}`;
  const m = (v: number) => (Math.abs(v) < 1 ? `±0 ${u}` : `${v > 0 ? '+' : '−'}${formatDistance(Math.abs(v), u)} ${u}`);
  const pl = props.pl;
  const w = props.weather;
  // the metres come from the head or tail part of the wind; the cross part moves the ball sideways – both named
  const head = pl && Math.abs(pl.headKmh) >= 1 ? `${pl.headKmh >= 0 ? tr('into the wind', 'Gegenwind') : tr('downwind', 'Rückenwind')} ${Math.abs(pl.headKmh)} km/h` : null;
  const cross = pl && Math.abs(pl.crossKmh) >= 5 ? tr(`crosswind ${Math.abs(pl.crossKmh)} from the ${pl.crossKmh > 0 ? 'right' : 'left'}`, `Seitenwind ${Math.abs(pl.crossKmh)} von ${pl.crossKmh > 0 ? 'rechts' : 'links'}`) : null;
  const windText = !pl || !w ? null : Math.round(w.windKmh) < 5 ? tr('calm', 'windstill') : [head, cross].filter(Boolean).join(' · ') || tr('calm', 'windstill');
  const obSides = props.ob ? (['left', 'right'] as const).filter((s) => Number.isFinite(props.ob![s])) : [];
  if (!pl && !obSides.length && !props.ahead.length) return null;
  return (
    <div className="caddie-facts" aria-label={tr('What the caddie knows', 'Was der Caddie weiß')}>
      {pl && (
        <div className="cf-row">
          {windText && (
            <span className="cf">
              <Icon d={WIND} />
              {windText} <b>{m(pl.wind)}</b>
            </span>
          )}
          {w && (
            <span className="cf">
              <Icon d={TEMP} />
              {Math.round(w.tempC)} °C <b>{m(pl.temp)}</b>
            </span>
          )}
          {Math.abs(pl.height) >= 1 && (
            <span className="cf">
              <Icon d={HILL} />
              {pl.height > 0 ? tr('uphill', 'bergauf') : tr('downhill', 'bergab')} <b>{m(pl.height)}</b>
            </span>
          )}
        </div>
      )}
      {obSides.length > 0 && (
        <span className="cf warn">
          <Icon d={STAKE} />
          {tr('Out of bounds at the target', 'Aus am Ziel')}: {obSides.map((s) => `${sideWord(s)} ${d(props.ob![s])}`).join(' · ')}
        </span>
      )}
      {props.ahead.map((h) => (
        <span key={`${h.kind}${h.to}`} className="cf">
          <Icon d={h.kind === 'water' ? WATER : SAND} />
          {hazardWord(h.kind)} {h.side === 'middle' ? tr('in the middle', 'mittig') : sideWord(h.side)}: <b>{d(h.to)}</b> {tr('to reach', 'bis')} · <b>{d(h.carry)}</b> {tr('to carry', 'drüber')}
        </span>
      ))}
    </div>
  );
}

/** The caddie in a tournament (Rule 4.3, Sascha 18.10.2026): no advice, no wind, no green read – only the player's own
 *  notes on the hole, the plain distances to the hazards ahead, the rules and the notes to edit. */
export function TournamentCaddie(props: { holeLabel: string; note: HoleNote; onNote: (n: HoleNote) => void; onHide: () => void; ahead: HazardAhead[]; unit: Unit }) {
  const [sheet, setSheet] = useState<'rules' | 'notes' | null>(null);
  const n = props.note;
  const ob = [n.obLeft ? sideWord('left') : null, n.obRight ? sideWord('right') : null].filter(Boolean);
  return (
    <>
      <section className="caddie-card tournament" aria-label={tr('Caddie – tournament', 'Caddie – Turnier')}>
        <div className="head">
          <span className="club">{tr('Tournament', 'Turnier')}</span>
          <span className="grow">{tr(`Hole ${props.holeLabel} · your notes and distances`, `Loch ${props.holeLabel} · deine Notizen und Entfernungen`)}</span>
        </div>
        {n.tip && <span className="plan">{n.tip}</span>}
        {ob.length > 0 && <span className="plan warn">{tr('Out of bounds', 'Aus')} {ob.join(tr(' and ', ' und '))}</span>}
        <CaddieFacts weather={null} ob={null} ahead={props.ahead} unit={props.unit} />
        <div className="caddie-actions">
          <button type="button" onClick={() => setSheet('rules')}>
            {tr('Rules', 'Regeln')}
          </button>
          <button type="button" onClick={() => setSheet('notes')} aria-label={tr('Hole notes', 'Lochnotizen')}>
            <span className="wide-only">{tr('Hole notes', 'Lochnotizen')}</span>
            <span className="narrow-only">{tr('Notes', 'Notizen')}</span>
          </button>
          <button type="button" onClick={props.onHide} aria-label={tr('Hide caddie', 'Caddie ausblenden')}>
            ✕
          </button>
        </div>
      </section>
      {sheet === 'rules' && <RulesBook onClose={() => setSheet(null)} />}
      {sheet === 'notes' && <NotesSheet hole={props.holeLabel} note={props.note} onSave={props.onNote} onClose={() => setSheet(null)} />}
    </>
  );
}

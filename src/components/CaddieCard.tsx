import { useState } from 'react';
import { answer, canListen, listen, RULES, speak, summary, toggleSpeak, type CaddieFacts } from '../lib/caddietalk';
import type { HoleNote } from '../lib/holenotes';
import { LIE_OPTIONS, type LieKind } from '../lib/caddie';
import { getLang, tr } from '../lib/i18n';
import type { HoleBook } from '../lib/holebook';

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
}) {
  const [details, setDetails] = useState(false);
  const [sheet, setSheet] = useState<'ask' | 'rules' | 'notes' | null>(null);
  const f = props.facts;
  return (
    <>
      <section className="caddie-card" aria-label="AI caddie">
        <button type="button" className="head" onClick={() => setDetails(!details)} aria-expanded={details} aria-label={details ? tr('Fold the caddie', 'Caddie zuklappen') : tr('More from the caddie', 'Mehr vom Caddie')}>
          <span className="club">{props.clubCode}</span>
          <span className="grow">
            {Math.round(f.distance)} {f.unit} {f.targetTo} · {tr('plays', 'spielt wie')} <strong>{Math.round(f.playsLike)} {f.unit}</strong>
          </span>
          <span className="more" aria-hidden="true">{details ? '▴' : '▾'}</span>
        </button>
        {(details ? props.lines : one(props.lines)).map((l, k) => (
          <span key={k} className={l.tone === 'warn' ? 'plan warn' : l.tone === 'plan' ? 'plan' : l.tone === 'mental' ? 'mental' : 'why'}>
            {l.text}
          </span>
        ))}
        {details && props.alt && <span className="alt">{props.alt}</span>}
        {details && props.book && <BookPart book={props.book} said={props.lines.map((l) => l.text)} />}
        {details && props.lie != null && (
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
        {details && (
        <div className="caddie-actions">
          <button type="button" onClick={() => toggleSpeak(summary(f))} aria-label={tr('Read aloud or stop', 'Vorlesen oder stoppen')}>
            🔊
          </button>
          <button type="button" onClick={() => setSheet('ask')}>
            {tr('Ask', 'Fragen')}
          </button>
          <button type="button" onClick={() => setSheet('rules')}>
            {tr('Rules', 'Regeln')}
          </button>
          <button type="button" onClick={() => setSheet('notes')}>
            {tr('Hole notes', 'Lochnotizen')}
          </button>
          <button type="button" onClick={props.onHide} aria-label={tr('Hide caddie', 'Caddie ausblenden')}>
            ✕
          </button>
        </div>
        )}
      </section>
      {sheet === 'ask' && <AskSheet facts={f} onClose={() => setSheet(null)} onRules={() => setSheet('rules')} />}
      {sheet === 'rules' && <RulesSheet onClose={() => setSheet(null)} />}
      {sheet === 'notes' && <NotesSheet hole={props.holeLabel} note={props.note} onSave={props.onNote} onClose={() => setSheet(null)} />}
    </>
  );
}

type Line = { text: string; tone?: 'warn' | 'plan' | 'mental' | 'muted'; lead?: boolean };
/** Folded card: the lines that matter – a warning, and the reason for the plan when the caddie chose one (else the plan). */
function one(lines: Line[]): Line[] {
  const warn = lines.find((x) => x.tone === 'warn');
  const lead = lines.find((x) => x.lead);
  if (warn && lead) return [warn, lead];
  const l = warn ?? lead ?? lines.find((x) => x.tone === 'plan') ?? lines[0];
  return l ? [l] : [];
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

function RulesSheet(props: { onClose: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Sheet title={tr('Rules help', 'Regelhilfe')} onClose={props.onClose}>
      {RULES.map((r) => (
        <div key={r.id} className="card" style={{ background: 'var(--surface-2)' }}>
          <button type="button" className="toggle" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
            {open === r.id ? '▾' : '▸'} {r.title}
          </button>
          {open === r.id && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {r.text.map((t) => (
                <li key={t} style={{ marginBottom: 4 }}>
                  {t}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <p className="muted small" style={{ margin: 0 }}>
        {tr('Summary of the Rules of Golf (2023). Local rules of the club come first.', 'Kurzfassung der Golfregeln (2023). Die Platzregeln des Clubs gehen vor.')}
      </p>
    </Sheet>
  );
}

function NotesSheet(props: { hole: string; note: HoleNote; onSave: (n: HoleNote) => void; onClose: () => void }) {
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

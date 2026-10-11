import { useState } from 'react';
import { answer, canListen, listen, RULES, speak, summary, type CaddieFacts } from '../lib/caddietalk';
import type { HoleNote } from '../lib/holenotes';
import { LIE_OPTIONS, type LieKind } from '../lib/caddie';

// The caddie on the hole map (feature 017): appears when he has something new to say, can be hidden completely.
// Bottom row: read aloud, ask, rules, hole notes.

export function CaddieCard(props: {
  facts: CaddieFacts;
  lines: { text: string; tone?: 'warn' | 'plan' | 'mental' | 'muted' }[];
  alt: string | null;
  onHide: () => void;
  note: HoleNote;
  onNote: (n: HoleNote) => void;
  holeLabel: string;
  clubCode: string;
  lie: LieKind | null; // null on the tee
  onLie: (l: LieKind) => void;
}) {
  const [details, setDetails] = useState(false);
  const [sheet, setSheet] = useState<'ask' | 'rules' | 'notes' | null>(null);
  const f = props.facts;
  return (
    <>
      <section className="caddie-card" aria-label="AI caddie">
        <button type="button" className="head" onClick={() => setDetails(!details)} aria-expanded={details}>
          <span>
            Caddie · {Math.round(f.distance)} {f.unit} to {f.target} → plays <strong>{Math.round(f.playsLike)} {f.unit}</strong>
            <span className="muted small"> {details ? '▴' : '▾ why'}</span>
          </span>
          <span className="club">{props.clubCode}</span>
        </button>
        {(details ? props.lines : short(props.lines)).map((l, k) => (
          <span key={k} className={l.tone === 'warn' ? 'plan warn' : l.tone === 'plan' ? 'plan' : l.tone === 'mental' ? 'mental' : 'why'}>
            {l.text}
          </span>
        ))}
        {details && props.alt && <span className="alt">{props.alt}</span>}
        {props.lie != null && (
          <label className="caddie-lie">
            <span>Lie</span>
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
          <button type="button" onClick={() => speak(summary(f))} aria-label="Read aloud">
            🔊
          </button>
          <button type="button" onClick={() => setSheet('ask')}>
            Ask
          </button>
          <button type="button" onClick={() => setSheet('rules')}>
            Rules
          </button>
          <button type="button" onClick={() => setSheet('notes')}>
            Hole notes
          </button>
          <button type="button" onClick={props.onHide} aria-label="Hide caddie">
            ✕
          </button>
        </div>
      </section>
      {sheet === 'ask' && <AskSheet facts={f} onClose={() => setSheet(null)} onRules={() => setSheet('rules')} />}
      {sheet === 'rules' && <RulesSheet onClose={() => setSheet(null)} />}
      {sheet === 'notes' && <NotesSheet hole={props.holeLabel} note={props.note} onSave={props.onNote} onClose={() => setSheet(null)} />}
    </>
  );
}

type Line = { text: string; tone?: 'warn' | 'plan' | 'mental' | 'muted' };
/** Folded card: warnings, then the plan, one mental line – at most three lines (the rest under "why"). */
function short(lines: Line[]): Line[] {
  const warn = lines.filter((l) => l.tone === 'warn');
  const plan = lines.filter((l) => l.tone === 'plan');
  const mental = lines.filter((l) => l.tone === 'mental').slice(0, 1);
  const keep = new Set([...warn, ...plan].slice(0, mental.length ? 2 : 3).concat(mental));
  return lines.filter((l) => keep.has(l));
}

function Sheet(props: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet" role="dialog" aria-label={props.title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{props.title}</strong>
          <button type="button" className="icon-btn" aria-label="Close" onClick={props.onClose}>
            ✕
          </button>
        </div>
        {props.children}
      </section>
    </div>
  );
}

const QUESTIONS = ['What club?', 'How far?', 'Where do I aim?', 'How is the wind?', 'How does the green break?'];

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
    <Sheet title="Ask your caddie" onClose={props.onClose}>
      <div className="chip-row wrap">
        {QUESTIONS.map((x) => (
          <button key={x} type="button" onClick={() => ask(x)}>
            {x}
          </button>
        ))}
        <button type="button" onClick={props.onRules}>
          Rules help
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
            else setA('I did not catch that – tap a question instead.');
          }}
        >
          {busy ? 'Listening …' : '🎤 Ask with your voice'}
        </button>
      )}
      {q && <p className="muted small" style={{ margin: 0 }}>“{q}”</p>}
      {a && <p style={{ margin: 0, fontSize: 17 }}>{a}</p>}
    </Sheet>
  );
}

function RulesSheet(props: { onClose: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Sheet title="Rules help" onClose={props.onClose}>
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
        Summary of the Rules of Golf (2023). Local rules of the club come first.
      </p>
    </Sheet>
  );
}

function NotesSheet(props: { hole: string; note: HoleNote; onSave: (n: HoleNote) => void; onClose: () => void }) {
  const [n, setN] = useState<HoleNote>(props.note);
  const flip = (k: 'obLeft' | 'obRight' | 'obLong') => setN({ ...n, [k]: !n[k] });
  return (
    <Sheet title={`Hole ${props.hole} – what the caddie should know`} onClose={props.onClose}>
      <button type="button" className="toggle" aria-pressed={!!n.obLeft} onClick={() => flip('obLeft')}>
        {n.obLeft ? '✓' : '○'} Out of bounds left
      </button>
      <button type="button" className="toggle" aria-pressed={!!n.obRight} onClick={() => flip('obRight')}>
        {n.obRight ? '✓' : '○'} Out of bounds right
      </button>
      <button type="button" className="toggle" aria-pressed={!!n.obLong} onClick={() => flip('obLong')}>
        {n.obLong ? '✓' : '○'} Out of bounds behind the green
      </button>
      <div className="field">
        <label htmlFor="hole-note">Note (shown by the caddie)</label>
        <input id="hole-note" className="input" value={n.text ?? ''} placeholder="e.g. blind tee shot – aim at the right tree" onChange={(e) => setN({ ...n, text: e.target.value })} />
      </div>
      <button
        type="button"
        className="btn-primary"
        onClick={() => {
          props.onSave(n);
          props.onClose();
        }}
      >
        Save for this course
      </button>
    </Sheet>
  );
}

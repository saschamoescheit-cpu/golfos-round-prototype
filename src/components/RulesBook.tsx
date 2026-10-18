import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFINITIONS, RULES_OF_GOLF, type Rule, type RuleSection } from '../data/rulesOfGolf';
import { tr } from '../lib/i18n';
import { TopBar } from './ui';
import { RuleSketch } from './RuleSketch';

// The Rules of Golf as in the R&A app (Sascha 18.10.2026): the 25 rules in their groups, each with its sections, a
// search over everything – all of it in the app, no link to another website. Opened from the caddie ("Regeln").

const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Common situations on the course – a tap searches for them. */
const QUICK = () => [
  { q: tr('water', 'Wasser'), label: tr('Water', 'Wasser') },
  { q: tr('out of bounds', 'Aus'), label: tr('Out of bounds / lost', 'Aus / verloren') },
  { q: tr('unplayable', 'unspielbar'), label: tr('Unplayable', 'Unspielbar') },
  { q: tr('drop', 'droppen'), label: tr('Dropping', 'Droppen') },
  { q: tr('bunker', 'Bunker'), label: 'Bunker' },
  { q: tr('ground under repair', 'Boden in Ausbesserung'), label: tr('Ground under repair', 'Boden in Ausbesserung') },
  { q: tr('flagstick', 'Fahne'), label: tr('Flagstick', 'Fahne') },
  { q: tr('provisional', 'provisorisch'), label: tr('Provisional ball', 'Provisorischer Ball') },
];

interface Hit {
  rule: Rule | null;
  section: RuleSection;
  score: number;
}

function search(query: string): Hit[] {
  const words = fold(query).split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  const hits: Hit[] = [];
  const look = (rule: Rule | null, sec: RuleSection) => {
    const title = fold(sec.title());
    const ruleTitle = rule ? fold(rule.title()) : '';
    const keys = fold(sec.keys ?? '');
    const body = fold([sec.text().join(' '), sec.penalty?.() ?? ''].join(' '));
    let score = 0;
    for (const w of words) {
      if (sec.id.toLowerCase() === w || sec.id.startsWith(w + '.')) score += 10;
      else if (title.includes(w)) score += 4;
      else if (ruleTitle.includes(w)) score += 3;
      else if (keys.includes(w)) score += 2; // what players call it
      else if (body.includes(w)) score += 1;
      else return; // every word must be found
    }
    hits.push({ rule, section: sec, score });
  };
  for (const r of RULES_OF_GOLF) for (const sec of r.sections) look(r, sec);
  for (const d of DEFINITIONS) look(null, d);
  return hits.sort((a, b) => b.score - a.score).slice(0, 40);
}

export function RulesBook(props: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<{ n: number; section?: string } | null>(null);
  const hits = useMemo(() => search(query), [query]);
  const rule = open && open.n > 0 ? RULES_OF_GOLF.find((r) => r.n === open.n)! : null;
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open?.section) return top.current?.scrollIntoView();
    document.getElementById(open.n === 0 ? `def-${open.section}` : `rule-${open.section}`)?.scrollIntoView({ block: 'start' });
  }, [open]);

  if (open?.n === 0)
    return (
      <div className="overlay-screen rules-book">
        <main className="screen">
          <TopBar title={tr('Definitions', 'Erklärungen')} onBack={() => setOpen(null)} />
          {[...DEFINITIONS].sort((a, b) => a.title().localeCompare(b.title())).map((d) => (
            <section key={d.title()} id={`def-${d.title()}`} className={`card rule-section${open.section === d.title() ? ' hit' : ''}`}>
              <strong>{d.title()}</strong>
              {d.text().map((t) => (
                <p key={t}>{t}</p>
              ))}
            </section>
          ))}
        </main>
      </div>
    );

  if (rule)
    return (
      <div className="overlay-screen rules-book">
        <main className="screen" ref={top}>
          <TopBar title={rule.n > 25 ? tr('Local rules', 'Platzregeln') : tr(`Rule ${rule.n}`, `Regel ${rule.n}`)} onBack={() => setOpen(null)} />
          <section className="rule-head">
            <span className="rule-no big">{rule.n > 25 ? 'L' : rule.n}</span>
            <h2>{rule.title()}</h2>
          </section>
          <RuleSketch rule={rule.n} />
          <p className="muted" style={{ margin: 0 }}>{rule.purpose()}</p>
          {rule.sections.map((sec) => (
            <section key={sec.id} id={`rule-${sec.id}`} className={`card rule-section${open?.section === sec.id ? ' hit' : ''}`}>
              <strong>
                <span className="rule-sec-id">{sec.id}</span> {sec.title()}
              </strong>
              <RuleSketch section={sec.id} />
              {sec.text().map((t) => (
                <p key={t}>{t}</p>
              ))}
              {sec.penalty && (
                <p className="rule-penalty">
                  <span>{tr('Penalty', 'Strafe')}</span> {sec.penalty()}
                </p>
              )}
            </section>
          ))}
          <OfficialText />
        </main>
      </div>
    );

  return (
    <div className="overlay-screen rules-book">
      <main className="screen">
        <TopBar title={tr('Rules of Golf', 'Golfregeln')} onBack={props.onClose} />
        <input
          className="input"
          type="search"
          inputMode="search"
          placeholder={tr('Search the rules …', 'Regeln durchsuchen …')}
          aria-label={tr('Search the rules', 'Regeln durchsuchen')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {!query.trim() && (
          <div className="chip-set" role="group" aria-label={tr('Common situations', 'Häufige Situationen')}>
            {QUICK().map((c) => (
              <button key={c.label} type="button" className="chip" onClick={() => setQuery(c.q)}>
                {c.label}
              </button>
            ))}
          </div>
        )}
        {query.trim() ? (
          hits.length ? (
            <ul className="list rules-hits">
              {hits.map((h) => (
                <li key={(h.rule?.n ?? 'd') + h.section.id + h.section.title()}>
                  <button type="button" className="list-item" onClick={() => setOpen(h.rule ? { n: h.rule.n, section: h.section.id } : { n: 0, section: h.section.title() })}>
                    <span className="rule-no">{h.rule ? h.section.id : tr('Def.', 'Def.')}</span>
                    <span className="grow">
                      <span className="title">{h.section.title()}</span>
                      <span className="muted small rule-snippet">{h.section.text()[0]}</span>
                    </span>
                    <span aria-hidden="true">›</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{tr('Nothing found – try another word.', 'Nichts gefunden – versuch ein anderes Wort.')}</p>
          )
        ) : (
          groups().map((g) => (
            <section key={g.name} className="rules-group">
              <span className="eyebrow">{g.name}</span>
              <ul className="list">
                {g.rules.map((r) => (
                  <li key={r.n}>
                    <button type="button" className="list-item" onClick={() => setOpen({ n: r.n })}>
                      <span className="rule-no">{r.n > 25 ? 'L' : r.n}</span>
                      <span className="grow">
                        <span className="title">{r.title()}</span>
                      </span>
                      <span aria-hidden="true">›</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
        {!query.trim() && (
          <section className="rules-group">
            <span className="eyebrow">{tr('Definitions', 'Erklärungen')}</span>
            <ul className="list">
              <li>
                <button type="button" className="list-item" onClick={() => setOpen({ n: 0 })}>
                  <span className="rule-no">A–Z</span>
                  <span className="grow">
                    <span className="title">{tr(`All ${DEFINITIONS.length} defined terms`, `Alle ${DEFINITIONS.length} Begriffe`)}</span>
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
              </li>
            </ul>
          </section>
        )}
        <OfficialText />
      </main>
    </div>
  );
}

function groups(): { name: string; rules: Rule[] }[] {
  const out: { name: string; rules: Rule[] }[] = [];
  for (const r of RULES_OF_GOLF) {
    const name = r.group();
    const last = out[out.length - 1];
    if (last && last.name === name) last.rules.push(r);
    else out.push({ name, rules: [r] });
  }
  return out;
}

function OfficialText() {
  // everything in the app – no link to another website (Sascha 18.10.2026)
  return (
    <p className="muted small rules-note">
      {tr(
        'Explained in our own words after the Rules of Golf 2023 (R&A, USGA). The local rules of the club come first.',
        'In eigenen Worten nach den Golfregeln 2023 (R&A, USGA). Die Platzregeln des Clubs gehen vor.',
      )}
    </p>
  );
}

import { useState, type ReactNode } from 'react';
import { sided } from './sides';
import { dec, getLang, tr } from '../lib/i18n';
import { loadProfile } from '../lib/profile';
import type { CategoryId, Drill, Gear, GearKind, L, Level, Place, Scoring, Targets, Video } from './types';

// Small building blocks of the Training module.

// left-handers read every right/left mirrored, like the pictures (sides.ts)
export const t = (x: L | string | undefined): string => (x == null ? '' : typeof x === 'string' ? x : sided(tr(x.en, x.de)));

export const levelName = (l: Level | 0): string => [tr('everyone', 'alle'), tr('beginner', 'Einsteiger'), tr('intermediate', 'Fortgeschritten'), tr('advanced', 'Könner')][l];

export const placeName = (p: Place): string =>
  ({
    green: tr('putting green', 'Puttinggrün'),
    chipping: tr('chipping area', 'Chipping-Area'),
    bunker: tr('practice bunker', 'Übungsbunker'),
    range: tr('driving range', 'Driving Range'),
    course: tr('on the course', 'auf dem Platz'),
    home: tr('at home', 'zu Hause'),
    gym: tr('fitness', 'Fitness'),
  })[p];

export const kindName = (k: GearKind): string =>
  ({
    putting: tr('Putting', 'Putten'),
    shortgame: tr('Short game', 'Kurzes Spiel'),
    swing: tr('Swing', 'Schwung'),
    alignment: tr('Alignment', 'Ausrichtung'),
    speed: tr('Speed', 'Schnelligkeit'),
    tech: tr('Technology', 'Technik'),
    home: tr('Home practice', 'Zu Hause'),
    fitness: 'Fitness',
    balls: tr('Balls', 'Bälle'),
    books: tr('Books', 'Bücher'),
  })[k];

export const euro = (v: number): string => (getLang() === 'de' ? `${v.toFixed(2).replace('.', ',')} €` : `€${v.toFixed(2)}`);
export const euroRange = (p: [number, number]): string => (p[0] === p[1] ? `≈ ${Math.round(p[0])} €` : `≈ ${Math.round(p[0])}–${Math.round(p[1])} €`);
/** The middle of the price range – what the cart counts with. */
export const priceOf = (g: Gear): number => Math.round(((g.price[0] + g.price[1]) / 2) * 100) / 100;

/** The player's handicap index from the profile (null when not set). */
export function playerHcp(): number | null {
  const s = loadProfile().hcpIndex.trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s.replace('+', ''));
  return Number.isFinite(n) ? (s.startsWith('+') ? -n : n) : null;
}
export type Band = 'high' | 'mid' | 'low';
export const bandOf = (hcp: number | null): Band => (hcp == null ? 'mid' : hcp <= 10 ? 'low' : hcp <= 20 ? 'mid' : 'high');
export const bandName = (b: Band | 'tour'): string => ({ high: tr('hcp 21+', 'Hcp 21+'), mid: tr('hcp 11–20', 'Hcp 11–20'), low: tr('hcp 0–10', 'Hcp 0–10'), tour: tr('tour', 'Tour') })[b];

/** Is a higher result better for this scoring? */
export const higherBetter = (s: Scoring | undefined): boolean => !s || (s.kind !== 'strokes' && !(s.kind === 'meters' && s.lower));

export function scoreText(s: Scoring | undefined, v: number | null): string {
  if (v == null || !s || s.kind === 'none') return tr('done', 'erledigt');
  const unit = 'unit' in s && s.unit ? ` ${t(s.unit)}` : '';
  if (s.kind === 'made') return tr(`${v} of ${s.of}`, `${v} von ${s.of}`) + unit;
  return `${dec(v)}${unit}`;
}

/** The number of a result on its own – "12/16" for made-of, "8,5" otherwise. */
export const mainValue = (s: Scoring | undefined, v: number): string => (s?.kind === 'made' ? `${v}/${s.of}` : dec(v));
/** The unit of a result, e.g. "gelocht", "Bälle in der Leiter". */
export const unitText = (s: Scoring | undefined): string => (s && 'unit' in s && s.unit ? t(s.unit) : '');

/** The best result of a list of values. */
export const bestOf = (s: Scoring | undefined, values: number[]): number | null => (values.length ? (higherBetter(s) ? Math.max(...values) : Math.min(...values)) : null);

/** Reached the target of the player's band? */
export function meets(s: Scoring | undefined, targets: Targets | undefined, v: number | null, band: Band): boolean | null {
  if (v == null || !targets) return null;
  const goal = targets[band];
  return higherBetter(s) ? v >= goal : v <= goal;
}

// ---------- category icons ----------
const ic = (d: ReactNode) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);
export const CAT_ICON: Record<CategoryId, ReactNode> = {
  putting: ic(<><ellipse cx="12" cy="18" rx="8" ry="2.5" /><circle cx="12" cy="18" r="1.2" fill="currentColor" /><path d="M5 4l3 9h3" /></>),
  greenreading: ic(<><path d="M3 17c4-5 8-7 18-8" /><path d="M14 6l3 3-3 3" /><circle cx="6" cy="17" r="1.4" /></>),
  chipping: ic(<><path d="M4 18c3-6 7-9 9-9s3 2 7 9" strokeDasharray="2 2" /><circle cx="4" cy="18" r="1.4" /><path d="M18 18V8l3 1.5-3 1.5" /></>),
  pitching: ic(<><path d="M3 18c4-12 10-14 16-2" strokeDasharray="2 2" /><circle cx="3" cy="18" r="1.4" /><path d="M19 18V9l3 1.5-3 1.5" /></>),
  bunker: ic(<><path d="M3 17c3-4 15-4 18 0" /><path d="M6 17c2-1.5 10-1.5 12 0" /><circle cx="12" cy="13" r="1.4" /><path d="M9 9l1.5 2M15 9l-1.5 2M12 7v3" /></>),
  slopes: ic(<><path d="M3 19L21 9" /><circle cx="12" cy="12.6" r="1.4" /><path d="M3 19h18" strokeDasharray="2 2" /></>),
  trouble: ic(<><path d="M7 20V12M5 14l2-4 2 4M17 20v-9M14 13l3-6 3 6" /><path d="M3 20h18" /><circle cx="12" cy="18" r="1.2" /></>),
  irons: ic(<><path d="M14 3l-6 14" /><path d="M8 17l-3 1 1 3 6-2-1-3" /></>),
  woods: ic(<><path d="M15 3l-6 13" /><ellipse cx="7.5" cy="18.5" rx="4" ry="2.5" /></>),
  driver: ic(<><path d="M16 3l-6 12" /><ellipse cx="8" cy="18" rx="5" ry="3" /><path d="M18 21v-4" /></>),
  basics: ic(<><path d="M9 4h6M12 4v6" /><path d="M8 10h8l-1 10H9z" /></>),
  swing: ic(<><path d="M5 18A9 9 0 0 1 19 6" /><path d="M19 6l-1 4M19 6l-4-1" /><circle cx="12" cy="12" r="1.3" /></>),
  ballflight: ic(<><path d="M4 20C8 8 14 6 20 9" /><path d="M4 20c6-8 12-11 14-16" strokeDasharray="2 2" /></>),
  strategy: ic(<><path d="M4 20V4l9 3-9 3" /><path d="M10 20l4-6 6 6" /><circle cx="17" cy="9" r="2" /></>),
  mental: ic(<><path d="M9 20v-3a6 6 0 1 1 6-6v1l2 3h-2v2a2 2 0 0 1-2 2h-2" /><circle cx="11" cy="10" r="1" fill="currentColor" /></>),
  fitness: ic(<><path d="M4 10v4M7 8v8M17 8v8M20 10v4M7 12h10" /></>),
  practice: ic(<><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 13h5M8 17h3" /><path d="M15 15l2 2 3-4" /></>),
};

// ---------- video: a preview picture like on YouTube (Sascha 16.10.2026); the video loads only on tap ----------
export function VideoCard(props: { v: Video }) {
  const [on, setOn] = useState(false);
  const [noThumb, setNoThumb] = useState(false);
  const v = props.v;
  const src = `https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0${v.start ? `&start=${v.start}` : ''}`;
  return (
    <div className="tr-video">
      {on ? (
        <div className="tr-video-frame">
          <iframe src={src} title={v.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        </div>
      ) : (
        <button type="button" className={`tr-video-cover${noThumb ? '' : ' thumb'}`} onClick={() => setOn(true)} aria-label={tr(`Play video: ${v.title}`, `Video abspielen: ${v.title}`)}>
          {!noThumb && (
            <span className="tr-video-thumb">
              <img src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setNoThumb(true)} />
            </span>
          )}
          <span className="tr-play" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          <span className="grow">
            <strong>{v.title}</strong>
            <span className="muted small">
              {v.channel} · {v.lang === 'de' ? tr('German', 'Deutsch') : tr('English', 'Englisch')} · YouTube
            </span>
          </span>
        </button>
      )}
      {on && (
        <a className="btn-secondary tr-video-open" href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer">
          {tr('Open on YouTube', 'Auf YouTube öffnen')} ↗
        </a>
      )}
    </div>
  );
}

/** The privacy note for a list of videos – once, not under every card. */
export function VideoNote() {
  return <span className="muted small tr-video-note">{tr('Preview pictures from YouTube · a video starts only when you tap it.', 'Vorschaubilder von YouTube · ein Video startet erst beim Antippen.')}</span>;
}

/** The gear picture: the manufacturer's image (linked), our own icon when there is none or it fails. */
export function GearImage(props: { g: Gear; size?: 'small' | 'large' }) {
  const [failed, setFailed] = useState(false);
  const cls = `tr-gear-img ${props.size ?? 'small'}`;
  if (!props.g.image || failed)
    return (
      <span className={`${cls} placeholder`} aria-hidden="true">
        {GEAR_ICON[props.g.kind]}
      </span>
    );
  return <img className={cls} src={props.g.image} alt={t(props.g.name)} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

const gi = (d: ReactNode) => (
  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);
const GEAR_ICON: Record<GearKind, ReactNode> = {
  putting: gi(<><rect x="3" y="9" width="18" height="6" rx="1.5" /><circle cx="17" cy="12" r="1.3" /><circle cx="7" cy="12" r="1" /></>),
  shortgame: gi(<><circle cx="12" cy="13" r="7" /><circle cx="12" cy="13" r="3.5" /><circle cx="12" cy="13" r="0.8" fill="currentColor" /></>),
  swing: gi(<><path d="M6 20L17 4" /><circle cx="17.5" cy="4" r="1.8" /></>),
  alignment: gi(<><path d="M4 20L20 4M8 20L20 8" /></>),
  speed: gi(<><path d="M4 16a8 8 0 0 1 16 0" /><path d="M12 16l4-5" /></>),
  tech: gi(<><rect x="5" y="7" width="14" height="10" rx="2" /><circle cx="12" cy="12" r="2.5" /></>),
  home: gi(<><path d="M4 11l8-7 8 7v9H4z" /><path d="M9 20v-5h6v5" /></>),
  fitness: gi(<><path d="M4 10v4M7 8v8M17 8v8M20 10v4M7 12h10" /></>),
  balls: gi(<><circle cx="12" cy="12" r="7" /><circle cx="10" cy="10" r="0.6" fill="currentColor" /><circle cx="13" cy="9" r="0.6" fill="currentColor" /><circle cx="14" cy="12" r="0.6" fill="currentColor" /></>),
  books: gi(<><path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5z" /><path d="M12 6.5v13" /></>),
};

/** Entering a result in the drill's scoring. */
export function ResultInput(props: { drill: Drill; value: number | null; onChange: (v: number | null) => void }) {
  const s = props.drill.scoring;
  if (!s || s.kind === 'none') return null;
  if (s.kind === 'meters') {
    return (
      <div className="field">
        <label htmlFor={`res-${props.drill.id}`}>{t(s.unit) || tr('metres', 'Meter')}</label>
        <input
          id={`res-${props.drill.id}`}
          className="input"
          inputMode="decimal"
          value={props.value == null ? '' : dec(props.value)}
          onChange={(e) => {
            const n = Number(e.target.value.replace(',', '.'));
            props.onChange(e.target.value.trim() === '' || !Number.isFinite(n) ? null : n);
          }}
        />
      </div>
    );
  }
  const max = s.kind === 'made' ? s.of : s.kind === 'points' ? s.max : undefined;
  const start = s.kind === 'strokes' ? (s.par ?? 0) : 0;
  const v = props.value;
  const set = (n: number) => props.onChange(Math.max(0, max != null ? Math.min(max, n) : n));
  return (
    <div className="tr-result" role="group" aria-label={tr('Result', 'Ergebnis')}>
      <div className="stepper compact">
        <button type="button" aria-label={tr('minus one', 'minus eins')} onClick={() => set((v ?? start) - 1)}>
          −
        </button>
        <span className={`value${v == null ? ' placeholder' : ''}`} aria-live="polite">
          {v ?? '–'}
        </span>
        <button type="button" aria-label={tr('plus one', 'plus eins')} onClick={() => set(v == null ? (s.kind === 'strokes' ? start : 1) : v + 1)}>
          +
        </button>
      </div>
      <span className="muted small">
        {s.kind === 'made' ? tr(`of ${s.of}`, `von ${s.of}`) + (s.unit ? ` · ${t(s.unit)}` : '') : t(s.unit)}
      </span>
    </div>
  );
}

/** Little chart of the last results (oldest left). */
export function Sparkline(props: { values: number[]; goal?: number }) {
  const vs = props.values.slice(-12);
  if (vs.length < 2) return null;
  const all = props.goal != null ? [...vs, props.goal] : vs;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const W = 200;
  const H = 44;
  const x = (i: number) => 6 + (i * (W - 12)) / (vs.length - 1);
  const y = (v: number) => H - 6 - ((v - lo) / span) * (H - 12);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} aria-hidden="true" className="tr-spark">
      {props.goal != null && <line x1={0} x2={W} y1={y(props.goal)} y2={y(props.goal)} stroke="var(--brand-text)" strokeDasharray="4 4" strokeWidth={1} />}
      <polyline points={vs.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke="var(--brand-text)" strokeWidth={2} />
      {vs.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={2.6} fill="var(--brand-text)" />
      ))}
    </svg>
  );
}

/** The results of a drill over time: dots and line, the goal of the player's band dashed, best marked, dates. */
/** Key numbers of a drill's results: best, average of the last five, last, trend (last three against the first three). */
export function resultStats(s: Scoring | undefined, values: number[]) {
  // values: oldest first
  if (!values.length) return null;
  const up = higherBetter(s);
  const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
  const last5 = values.slice(-5);
  const trend = values.length >= 4 ? mean(values.slice(-3)) - mean(values.slice(0, 3)) : null;
  return {
    best: up ? Math.max(...values) : Math.min(...values),
    avg: Math.round(mean(last5) * 10) / 10,
    last: values[values.length - 1],
    count: values.length,
    /** positive = better, whatever the direction of the scoring */
    trend: trend == null ? null : Math.round((up ? trend : -trend) * 10) / 10,
  };
}

/** The results of a drill over time (Sascha 16.10.2026: "clear and professional"): a fixed scale with grid lines,
 * the goal of the player's band as a labelled line, the area under the results, the best result marked, dates. */
export function ResultChart(props: { entries: { at: string; value: number }[]; goal?: number; lowerBetter?: boolean; min?: number; max?: number }) {
  const es = props.entries.slice(-12);
  if (es.length < 2) return null;
  const vals = es.map((e) => e.value);
  const all = props.goal != null ? [...vals, props.goal] : vals;
  let lo = props.min ?? Math.min(...all);
  let hi = props.max ?? Math.max(...all);
  if (props.min == null || props.max == null) {
    const pad = (hi - lo || 2) * 0.15;
    if (props.min == null) lo = Math.max(0, Math.floor(lo - pad));
    if (props.max == null) hi = Math.ceil(hi + pad);
  }
  const span = hi - lo || 1;
  const W = 330;
  const H = 168;
  const L0 = 30;
  const R0 = 14;
  const T0 = 12;
  const B0 = 26;
  const x = (i: number) => L0 + (i * (W - L0 - R0)) / (es.length - 1);
  const y = (v: number) => T0 + (1 - (v - lo) / span) * (H - T0 - B0);
  const bestV = props.lowerBetter ? Math.min(...vals) : Math.max(...vals);
  const bestI = vals.lastIndexOf(bestV);
  const date = (iso: string) => new Date(iso).toLocaleDateString(getLang() === 'de' ? 'de-DE' : undefined, { day: '2-digit', month: '2-digit' });
  const grid = [lo, lo + span / 2, hi];
  const line = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${x(0).toFixed(1)},${(H - B0).toFixed(1)} ${line} ${x(vals.length - 1).toFixed(1)},${(H - B0).toFixed(1)}`;
  return (
    <figure className="tr-result-chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={tr('Your results over time', 'Deine Ergebnisse im Verlauf')}>
        <defs>
          <linearGradient id="tr-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {grid.map((g, k) => (
          <g key={k}>
            <line x1={L0} x2={W - R0} y1={y(g)} y2={y(g)} stroke="var(--line)" strokeWidth={1} />
            <text x={L0 - 6} y={y(g) + 4} fontSize={11} fill="var(--muted)" textAnchor="end">
              {dec(Math.round(g * 10) / 10)}
            </text>
          </g>
        ))}
        <polygon points={area} fill="url(#tr-area)" />
        {props.goal != null && (
          <g>
            <line x1={L0} x2={W - R0} y1={y(props.goal)} y2={y(props.goal)} stroke="var(--text-2)" strokeDasharray="6 4" strokeWidth={1.4} />
            <rect x={L0 + 4} y={y(props.goal) - 19} width={64} height={16} rx={8} fill="var(--surface-2)" />
            <text x={L0 + 36} y={y(props.goal) - 7} fontSize={11} fontWeight={700} fill="var(--text-2)" textAnchor="middle">
              {tr('goal', 'Ziel')} {dec(props.goal)}
            </text>
          </g>
        )}
        <polyline points={line} fill="none" stroke="var(--brand-text)" strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />
        {vals.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={i === bestI ? 6 : 3.6} fill={i === bestI ? 'var(--brand)' : 'var(--surface)'} stroke="var(--brand-text)" strokeWidth={2} />
        ))}
        <text x={x(bestI)} y={y(bestV) - 11} fontSize={11} fontWeight={700} fill="var(--text)" textAnchor={bestI === 0 ? 'start' : bestI === vals.length - 1 ? 'end' : 'middle'}>
          {tr('best', 'Bestwert')} {dec(bestV)}
        </text>
        <text x={L0} y={H - 6} fontSize={11} fill="var(--muted)">
          {date(es[0].at)}
        </text>
        <text x={W - R0} y={H - 6} fontSize={11} fill="var(--muted)" textAnchor="end">
          {date(es[es.length - 1].at)}
        </text>
      </svg>
      <figcaption className="muted small">
        {tr(`Your last ${es.length} results`, `Deine letzten ${es.length} Ergebnisse`)}
        {props.lowerBetter ? tr(' · lower is better', ' · weniger ist besser') : ''}
      </figcaption>
    </figure>
  );
}

export function Collapsible(props: { title: ReactNode; children: ReactNode; open?: boolean; className?: string }) {
  const [open, setOpen] = useState(props.open ?? false);
  return (
    <section className={`card tr-coll${props.className ? ' ' + props.className : ''}`}>
      <button type="button" className="tr-coll-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="grow">{props.title}</span>
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="tr-coll-body">{props.children}</div>}
    </section>
  );
}

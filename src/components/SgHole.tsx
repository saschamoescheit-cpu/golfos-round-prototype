import { SG_LABELS, type SgCategory } from '../lib/sg';
import { dec, tr } from '../lib/i18n';

// Strokes gained drawn on a golf hole: tee, approach, around the green and putting as zones from tee to flag,
// above each its strokes won (green) or lost (red) against the chosen group and the strokes played there.

const ZONES: { c: SgCategory; w: number }[] = [
  { c: 'tee', w: 24 },
  { c: 'approach', w: 34 },
  { c: 'around', w: 20 },
  { c: 'putting', w: 22 },
];
const COLS = ZONES.map((z) => `${z.w}fr`).join(' ');
// zone borders on the 400-wide drawing
const X1 = 4 * 24;
const X2 = 4 * (24 + 34);
const X3 = 4 * (24 + 34 + 20);

const TREES = [
  [14, 12], [40, 9], [62, 15], [88, 8], [118, 12], [146, 7], [176, 13], [204, 9], [238, 12], [300, 9], [394, 14], [386, 104],
  [22, 106], [52, 110], [80, 104], [112, 109], [222, 108], [250, 103], [278, 110], [306, 106], [334, 111], [362, 107],
] as const;

export function SgHole(props: { diff: Record<SgCategory, number>; shots: Record<SgCategory, number> }) {
  return (
    <figure className="sg-hole" aria-label={tr('Strokes gained on the hole', 'Strokes Gained auf der Bahn')}>
      <div className="sg-hole-row" style={{ gridTemplateColumns: COLS }}>
        {ZONES.map((z) => {
          const v = props.diff[z.c];
          return (
            <div key={z.c} className={`sg-hole-box ${v >= 0 ? 'good' : 'bad'}`}>
              <strong>{dec(`${v > 0 ? '+' : ''}${v.toFixed(1)}`)}</strong>
              <span>
                {props.shots[z.c]} {props.shots[z.c] === 1 ? tr('stroke', 'Schlag') : tr('strokes', 'Schläge')}
              </span>
            </div>
          );
        })}
      </div>
      <svg viewBox="0 0 400 120" role="img" aria-hidden="true">
        <rect width="400" height="120" rx="12" fill="#5d8c3b" />
        {TREES.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 7 : 5.5} fill="#2e5a28" />
        ))}
        {/* fairway from the tee to the green */}
        <path d="M30 52 C 80 38, 150 32, 210 38 S 300 40, 322 46 L 322 74 C 290 80, 240 84, 190 82 S 80 76, 30 68 Z" fill="#7cb24c" />
        <path d="M60 50 C 110 42, 160 40, 210 44 L 210 76 C 160 78, 110 76, 60 70 Z" fill="#86bb55" />
        <rect x="10" y="51" width="18" height="18" rx="4" fill="#8fc95a" stroke="#c9e6a4" strokeWidth="1.5" />
        <circle cx="19" cy="60" r="2.6" fill="#ffffff" />
        <ellipse cx="168" cy="96" rx="34" ry="9" fill="#3d7fd0" />
        <ellipse cx="262" cy="30" rx="15" ry="6" fill="#e9dca6" />
        {/* green with fringe, flag and bunker */}
        <ellipse cx="352" cy="60" rx="35" ry="25" fill="#86c964" />
        <ellipse cx="352" cy="60" rx="30" ry="21" fill="#a3e27f" />
        <ellipse cx="294" cy="90" rx="13" ry="5.5" fill="#e9dca6" />
        <circle cx="358" cy="62" r="2.4" fill="#0e1418" />
        <line x1="358" y1="62" x2="358" y2="36" stroke="#ffffff" strokeWidth="1.8" />
        <path d="M358 36 L372 40.5 L358 45 Z" fill="#ff6b5e" />
        {[X1, X2, X3].map((x) => (
          <line key={x} x1={x} y1="4" x2={x} y2="116" stroke="#ffffff" strokeWidth="1.6" strokeDasharray="5 4" opacity="0.9" />
        ))}
      </svg>
      <div className="sg-hole-row labels" style={{ gridTemplateColumns: COLS }}>
        {ZONES.map((z) => (
          <span key={z.c}>{SG_LABELS[z.c]}</span>
        ))}
      </div>
    </figure>
  );
}

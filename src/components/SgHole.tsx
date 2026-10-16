import { SG_LABELS, type SgCategory } from '../lib/sg';
import { dec, tr } from '../lib/i18n';

// Strokes gained drawn on a golf hole: tee, long game (second shots on par 5s, layups), approach, around the green
// (the ring round the green) and putting. Above each zone the strokes won (green) or lost (red) against the chosen
// group and the strokes played there.

const ZONES: { c: SgCategory; w: number }[] = [
  { c: 'tee', w: 17 },
  { c: 'long', w: 22 },
  { c: 'approach', w: 22 },
  { c: 'around', w: 19 },
  { c: 'putting', w: 20 },
];
const COLS = ZONES.map((z) => `${z.w}fr`).join(' ');
// zone borders on the 500-wide drawing (around the green is the ring, not a line)
const X1 = 5 * 17;
const X2 = 5 * (17 + 22);
const X3 = 5 * (17 + 22 + 22);

const TREES = [
  [14, 12], [42, 9], [66, 15], [96, 8], [126, 13], [156, 7], [186, 13], [216, 9], [246, 12], [276, 8], [306, 12], [330, 7],
  [22, 128], [54, 132], [84, 126], [204, 131], [232, 126], [262, 132], [292, 127], [318, 133],
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
      <svg viewBox="0 0 500 140" role="img" aria-hidden="true">
        <defs>
          <clipPath id="sg-hole-clip">
            <rect width="500" height="140" rx="12" />
          </clipPath>
        </defs>
        <g clipPath="url(#sg-hole-clip)">
          <rect width="500" height="140" fill="#5d8c3b" />
          {TREES.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 7 : 5.5} fill="#2e5a28" />
          ))}
          {/* around the green: the ring of fringe, rough and greenside bunkers */}
          <ellipse cx="420" cy="70" rx="84" ry="58" fill="#6c9d47" />
          {/* fairway from the tee into the ring */}
          <path d="M28 60 C 90 46, 170 40, 250 44 S 330 50, 360 56 L 360 84 C 330 90, 270 96, 210 94 S 90 88, 28 80 Z" fill="#7cb24c" />
          <path d="M60 58 C 120 50, 180 48, 250 51 L 250 87 C 180 89, 120 86, 60 82 Z" fill="#86bb55" />
          <rect x="10" y="61" width="18" height="18" rx="4" fill="#8fc95a" stroke="#c9e6a4" strokeWidth="1.5" />
          <circle cx="19" cy="70" r="2.6" fill="#ffffff" />
          <ellipse cx="145" cy="112" rx="34" ry="9" fill="#3d7fd0" />
          <ellipse cx="258" cy="32" rx="15" ry="6" fill="#e9dca6" /* ci-allow: bunker sand */ />
          <ellipse cx="372" cy="34" rx="13" ry="6" fill="#e9dca6" /* ci-allow: bunker sand */ />
          <ellipse cx="380" cy="110" rx="14" ry="6" fill="#e9dca6" /* ci-allow: bunker sand */ />
          {/* green with flag */}
          <ellipse cx="442" cy="70" rx="42" ry="31" fill="#86c964" />
          <ellipse cx="442" cy="70" rx="37" ry="27" fill="#a3e27f" />
          <circle cx="450" cy="73" r="2.4" fill="#0e1418" />
          <line x1="450" y1="73" x2="450" y2="45" stroke="#ffffff" strokeWidth="1.8" />
          <path d="M450 45 L464 49.5 L450 54 Z" fill="#ff6b5e" />
          {[X1, X2].map((x) => (
            <line key={x} x1={x} y1="4" x2={x} y2="136" stroke="#ffffff" strokeWidth="1.6" strokeDasharray="5 4" opacity="0.9" />
          ))}
          {/* approach ends where the ring round the green begins */}
          <line x1={X3} y1="4" x2={X3} y2="22" stroke="#ffffff" strokeWidth="1.6" strokeDasharray="5 4" opacity="0.9" />
          <line x1={X3} y1="118" x2={X3} y2="136" stroke="#ffffff" strokeWidth="1.6" strokeDasharray="5 4" opacity="0.9" />
          <ellipse cx="420" cy="70" rx="84" ry="58" fill="none" stroke="#ffffff" strokeWidth="1.6" strokeDasharray="5 4" opacity="0.9" />
          <ellipse cx="442" cy="70" rx="42" ry="31" fill="none" stroke="#ffffff" strokeWidth="1.2" strokeDasharray="3 3" opacity="0.7" />
        </g>
      </svg>
      <div className="sg-hole-row labels" style={{ gridTemplateColumns: COLS }}>
        {ZONES.map((z) => (
          <span key={z.c}>{SG_LABELS[z.c]}</span>
        ))}
      </div>
    </figure>
  );
}

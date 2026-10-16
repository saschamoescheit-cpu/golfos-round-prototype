import { getLang } from '../lib/i18n';
import type { Chart } from './content/charts';
import { t } from './ui';

// A small chart for „Gut zu wissen“: bars (one value each) or split rows (e.g. carry : roll). Plain HTML and CSS,
// so it follows the theme (dark, sun mode) and stays sharp on every phone.

const num = (v: number) => (getLang() === 'de' ? String(v).replace('.', ',') : String(v));

export function FactChart(props: { chart: Chart }) {
  const c = props.chart;
  return (
    <figure className="tr-chart">
      <figcaption className="tr-chart-title">{t(c.title)}</figcaption>
      {c.kind === 'bars' ? (
        <div className="tr-chart-bars">
          {c.bars.map((b, i) => {
            const max = c.max ?? Math.max(...c.bars.map((x) => x.value));
            return (
              <div key={i} className="tr-chart-row">
                <span className="tr-chart-label">{t(b.label)}</span>
                <span className="tr-chart-track">
                  <span className="tr-chart-bar" style={{ width: `${Math.max(2, Math.min(100, (b.value / max) * 100))}%` }} />
                </span>
                <span className="tr-chart-value">{b.text ?? `${num(b.value)}${c.unit ? ` ${c.unit}` : ''}`}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="tr-chart-bars">
          {c.rows.map((r, i) => {
            const sum = r.parts.reduce((a, b) => a + b, 0) || 1;
            return (
              <div key={i} className="tr-chart-row">
                <span className="tr-chart-label">{t(r.label)}</span>
                <span className="tr-chart-track split">
                  {r.parts.map((p, k) => (
                    <span key={k} className={`tr-chart-bar part${k}`} style={{ width: `${(p / sum) * 100}%` }} />
                  ))}
                </span>
                <span className="tr-chart-value">{r.text ?? r.parts.map(num).join(' : ')}</span>
              </div>
            );
          })}
          <div className="tr-chart-legend">
            {c.legend.map((l, k) => (
              <span key={k}>
                <i className={`part${k}`} />
                {t(l)}
              </span>
            ))}
          </div>
        </div>
      )}
      {c.caption && <p className="muted small">{t(c.caption)}</p>}
    </figure>
  );
}

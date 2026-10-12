import type { Round, RoundHole } from '../types';
import { grossForHole, handicapStrokes, stablefordPoints } from '../lib/scoring';
import { TEES } from '../data/tees';
import { tr } from '../lib/i18n';

// The digital scorecard laid out like the paper one: per nine a block with the holes across, rows for metres,
// stroke index, par and every player's score (golf marks: circle = birdie, square = bogey), Stableford points and putts.

type Mark = 'eagle' | 'birdie' | 'par' | 'bogey' | 'double';
const markFor = (gross: number, par: number): Mark => {
  const d = gross - par;
  return d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : 'double';
};

export function ScoreTable(props: { round: Round }) {
  const { round } = props;
  const received = Object.fromEntries(round.players.map((p) => [p.id, handicapStrokes(round.holes, p.playingHandicap)]));
  const teeData = TEES[round.courseId];
  const ti = round.tee && teeData ? teeData.tees.indexOf(round.tee) : -1;
  const metres = (h: RoundHole) => (ti >= 0 ? (teeData!.holes[h.label]?.[ti] ?? null) : null);
  const hasMetres = round.holes.some((h) => metres(h) != null);
  const me = round.players.find((p) => p.isMe);
  const hasPutts = me != null && round.entries[me.id].some((e) => e.putts != null);
  const nines = round.holes.length === 18 ? [round.holes.slice(0, 9), round.holes.slice(9)] : [round.holes];

  const gross = (pid: string, h: RoundHole) => grossForHole(round.entries[pid][h.index], h.par, received[pid][h.index]);
  const points = (pid: string, h: RoundHole) => stablefordPoints(round.entries[pid][h.index], h.par, received[pid][h.index]);
  const sum = (xs: (number | null)[]) => (xs.some((x) => x != null) ? xs.reduce<number>((s, x) => s + (x ?? 0), 0) : null);

  return (
    <div className="sc-wrap">
      {nines.map((nine, n) => {
        const sumLabel = nines.length === 2 ? (n === 0 ? 'Out' : 'In') : tr('Tot', 'Ges.');
        return (
          <div className="sc-block" key={n}>
            <table className="sc">
              <colgroup>
                <col className="lab" />
                {nine.map((h) => (
                  <col key={h.index} />
                ))}
                <col className="sumcol" />
              </colgroup>
              <thead>
                <tr className="holes">
                  <th className="lab">{tr('Hole', 'Loch')}</th>
                  {nine.map((h) => (
                    <th key={h.index}>{h.label}</th>
                  ))}
                  <th className="sumc">{sumLabel}</th>
                </tr>
              </thead>
              <tbody>
                {hasMetres && (
                  <tr className="meta">
                    <td className="lab">{tr('Metres', 'Meter')}</td>
                    {nine.map((h) => (
                      <td key={h.index}>{metres(h) ?? ''}</td>
                    ))}
                    <td className="sumc">{sum(nine.map(metres))}</td>
                  </tr>
                )}
                <tr className="meta">
                  <td className="lab">Hcp</td>
                  {nine.map((h) => (
                    <td key={h.index}>{h.strokeIndex}</td>
                  ))}
                  <td className="sumc" />
                </tr>
                <tr className="par">
                  <td className="lab">Par</td>
                  {nine.map((h) => (
                    <td key={h.index}>{h.par}</td>
                  ))}
                  <td className="sumc">{sum(nine.map((h) => h.par))}</td>
                </tr>
                {round.players.map((p) => [
                  <tr className="score" key={p.id}>
                    <td className="lab name">{p.name}</td>
                    {nine.map((h) => {
                      const g = gross(p.id, h);
                      const extra = received[p.id][h.index];
                      return (
                        <td key={h.index}>
                          {g == null ? (
                            <span className="muted">–</span>
                          ) : (
                            <span className={`mark ${markFor(g, h.par)}`}>
                              {g}
                              {round.entries[p.id][h.index].pickedUp ? '*' : ''}
                              {extra > 0 && <i className="hcp-dots" aria-hidden="true">{'•'.repeat(Math.min(extra, 3))}</i>}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="sumc">{sum(nine.map((h) => gross(p.id, h)))}</td>
                  </tr>,
                  p.playingHandicap != null && (
                    <tr className="meta pts" key={`${p.id}-pts`}>
                      <td className="lab">{tr('Pts', 'Pkt.')}</td>
                      {nine.map((h) => (
                        <td key={h.index}>{points(p.id, h) ?? ''}</td>
                      ))}
                      <td className="sumc">{sum(nine.map((h) => points(p.id, h)))}</td>
                    </tr>
                  ),
                ])}
                {hasPutts && me && (
                  <tr className="meta">
                    <td className="lab">Putts</td>
                    {nine.map((h) => (
                      <td key={h.index}>{round.entries[me.id][h.index].putts ?? ''}</td>
                    ))}
                    <td className="sumc">{sum(nine.map((h) => round.entries[me.id][h.index].putts))}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        );
      })}
      <div className="sc-legend muted small">
        <span><span className="mark eagle">3</span> Eagle</span>
        <span><span className="mark birdie">3</span> Birdie</span>
        <span><span className="mark bogey">5</span> Bogey</span>
        <span><span className="mark double">6</span> {tr('Double+', 'Doppel+')}</span>
        <span><span className="hcp-dot">•</span> {tr('handicap stroke', 'Vorgabeschlag')}</span>
        {round.players.some((p) => round.entries[p.id].some((e) => e.pickedUp)) && <span>* {tr('picked up', 'aufgehoben')}</span>}
      </div>
    </div>
  );
}

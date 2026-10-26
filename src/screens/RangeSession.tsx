import { useState, type ReactNode } from 'react';
import type { Club, Flight } from '../types';
import { Segmented, TopBar } from '../components/ui';
import { clubCode, getLang, tr } from '../lib/i18n';
import { clubName } from '../lib/caddie';
import { CLUB_ORDER } from '../lib/clubs';
import { FLIGHTS, flightName } from '../lib/shotfacts';
import { isLeftHanded } from '../lib/profile';
import type { LmSession, LmShot } from '../lib/launchmonitor';
import { closeGaps, clubsOf, flightOf, medianOf, mishits, offTour, outOfOrder, spreadOf, spreadSay, TOUR, type TourRef } from '../lib/rangesession';

// One launch monitor session on its own page (Sascha 26.10.2026): four tabs – spread, gaps, flight, swing – and the spread
// first, every time. All numbers as the device measured them.

type RangeTab = 'spread' | 'gaps' | 'flight' | 'swing';

export function RangeSession(props: { session: LmSession; bag: { club: Club; carry: number }[]; unit: 'm' | 'yd'; onBack: () => void }) {
  const { session } = props;
  const clubs = clubsOf(session.shots);
  const [tab, setTab] = useState<RangeTab>('spread');
  // the club with the most shots first
  const [club, setClub] = useState<Club | null>(() => [...clubs].sort((a, b) => b.shots.length - a.shots.length)[0]?.club ?? null);
  const yd = props.unit === 'yd';
  const locale = getLang() === 'de' ? 'de-DE' : 'en-US';
  const fmt = (v: number, d = 0) => v.toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d });
  const dist = (m: number) => `${fmt(yd ? m * 1.09361 : m)} ${yd ? 'yd' : 'm'}`;
  const speed = (kmh: number) => `${fmt(yd ? kmh / 1.609344 : kmh)} ${yd ? 'mph' : 'km/h'}`;
  const temps = session.shots.map((s) => s.temp).filter((v): v is number => v != null);
  const temp = temps.length ? Math.round(temps.sort((a, b) => a - b)[temps.length >> 1]) : null;
  const day = session.measuredAt ? new Date(session.measuredAt).toLocaleDateString(locale) : null;
  const shots = clubs.find((c) => c.club === club)?.shots ?? [];
  return (
    <main className="screen range-session">
      <TopBar title={tr('Range session', 'Range-Sitzung')} onBack={props.onBack} backLabel={tr('Back to my bag', 'Zurück zu Mein Bag')} />
      <span className="muted small range-sub">
        {[session.source, day ?? tr(`imported ${new Date(session.importedAt).toLocaleDateString(locale)}`, `importiert ${new Date(session.importedAt).toLocaleDateString(locale)}`), tr(`${session.shots.length} shots`, `${session.shots.length} Schläge`), temp != null ? `${yd ? fmt((temp * 9) / 5 + 32) + ' °F' : temp + ' °C'}` : null].filter(Boolean).join(' · ')}
      </span>
      <Segmented<RangeTab>
        label={tr('Session', 'Sitzung')}
        value={tab}
        onChange={(v) => v && setTab(v)}
        options={[
          { value: 'spread', label: tr('Spread', 'Streuung') },
          { value: 'gaps', label: tr('Gaps', 'Abstände') },
          { value: 'flight', label: tr('Flight', 'Flugbahn') },
          { value: 'swing', label: tr('Swing', 'Schwung') },
        ]}
      />
      {tab !== 'gaps' && clubs.length > 1 && (
        <div className="chip-row" role="group" aria-label={tr('Club', 'Schläger')}>
          {clubs.map((c) => (
            <button key={c.club} type="button" aria-pressed={c.club === club} onClick={() => setClub(c.club)}>
              {clubCode(c.club)} · {c.shots.length}×
            </button>
          ))}
        </div>
      )}
      {tab === 'spread' && club && <SpreadTab club={club} shots={shots} dist={dist} yd={yd} />}
      {tab === 'gaps' && <GapsTab session={session} bag={props.bag} dist={dist} />}
      {tab === 'flight' && club && <FlightTab club={club} shots={shots} fmt={fmt} />}
      {tab === 'swing' && club && <SwingTab club={club} shots={shots} fmt={fmt} speed={speed} dist={dist} yd={yd} />}
    </main>
  );
}

function Tile(props: { num: ReactNode; label: string; tone?: 'good' | 'bad' }) {
  return (
    <div className={['insight', props.tone ?? ''].filter(Boolean).join(' ')}>
      <span className="insight-num">{props.num}</span>
      <span className="insight-label">{props.label}</span>
    </div>
  );
}

// ---------- Streuung: every shot from above, the ellipse where 8 of 10 land ----------

function SpreadTab(props: { club: Club; shots: LmShot[]; dist: (m: number) => string; yd: boolean }) {
  const s = spreadOf(props.shots);
  const say = spreadSay(s, clubName(props.club), tr);
  return (
    <>
      <section className="card stats-card">
        <h2>{tr('Every shot from above', 'Jeder Schlag von oben')}</h2>
        <RangeDots shots={props.shots} stats={s} yd={props.yd} />
        <p className="muted small" style={{ margin: 0 }}>
          {tr('Each dot a shot, red a clear mishit · the ellipse holds 8 of 10 balls – the same the map shows on the round.', 'Jeder Punkt ein Schlag, rot ein klarer Fehlschlag · in der Ellipse landen 8 von 10 Bällen – dieselbe zeigt die Karte auf der Runde.')}
        </p>
      </section>
      <div className="range-tiles">
        <Tile num={props.dist(s.carry)} label={tr('carry (median)', 'Carry (Median)')} />
        <Tile num={s.total != null ? props.dist(s.total) : '–'} label={tr('with roll', 'mit Ausrollen')} />
        <Tile num={s.sideLo != null && s.sideHi != null ? props.dist(s.sideHi - s.sideLo) : '–'} label={tr('width (8 of 10)', 'Breite (8 von 10)')} />
        <Tile num={props.dist(s.carryHi - s.carryLo)} label={tr('length (8 of 10)', 'Länge (8 von 10)')} />
      </div>
      {say && (
        <section className="card stats-card">
          <h2>{tr('What stands out', 'Was auffällt')}</h2>
          <p style={{ margin: 0 }}>{say}</p>
        </section>
      )}
    </>
  );
}

function RangeDots(props: { shots: LmShot[]; stats: ReturnType<typeof spreadOf>; yd: boolean }) {
  const u = (m: number) => Math.round(props.yd ? m * 1.09361 : m);
  const uL = props.yd ? 'yd' : 'm';
  const { shots, stats: s } = props;
  const miss = mishits(shots);
  const W = 320;
  const H = 300;
  const sides = shots.map((x) => x.side ?? 0);
  const maxSide = Math.max(20, ...sides.map((v) => Math.abs(v) + 5));
  const tick = maxSide > 45 ? 20 : 10;
  const lo = Math.floor((Math.min(...shots.map((x) => x.carry)) - 6) / 10) * 10;
  const hi = Math.ceil((Math.max(...shots.map((x) => x.carry)) + 6) / 10) * 10;
  const x = (m: number) => 34 + ((m + maxSide) / (2 * maxSide)) * (W - 42);
  const y = (m: number) => 8 + (1 - (m - lo) / (hi - lo)) * (H - 30);
  const step = hi - lo > 80 ? 20 : 10;
  return (
    <svg className="spread-chart range-dots" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr(`${shots.length} shots from above`, `${shots.length} Schläge von oben`)}>
      {Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, k) => lo + k * step).map((m) => (
        <g key={m}>
          <line x1={34} x2={W - 8} y1={y(m)} y2={y(m)} className="spread-grid" />
          <text x={28} y={y(m) + 3} textAnchor="end" className="spread-axis">{u(m)}</text>
        </g>
      ))}
      {Array.from({ length: Math.floor(maxSide / tick) * 2 + 1 }, (_, k) => (k - Math.floor(maxSide / tick)) * tick).map((m) => (
        <g key={m}>
          {m !== 0 && <line x1={x(m)} x2={x(m)} y1={8} y2={H - 22} className="spread-grid" />}
          <text x={x(m)} y={H - 6} textAnchor="middle" className="spread-axis">{m === 0 ? tr('target', 'Ziel') : `${u(Math.abs(m))} ${m < 0 ? 'L' : 'R'}`}</text>
        </g>
      ))}
      <line x1={x(0)} x2={x(0)} y1={8} y2={H - 22} className="spread-mid" />
      {s.sideLo != null && s.sideHi != null && (
        <ellipse cx={x((s.sideLo + s.sideHi) / 2)} cy={y((s.carryLo + s.carryHi) / 2)} rx={Math.max(3, (x(s.sideHi) - x(s.sideLo)) / 2)} ry={Math.max(3, (y(s.carryLo) - y(s.carryHi)) / 2)} className="spread-ell" />
      )}
      {shots.map((p, k) => (
        <circle key={k} cx={x(Math.max(-maxSide, Math.min(maxSide, p.side ?? 0)))} cy={y(p.carry)} r={4.5} className={miss.has(p) ? 'spread-dot miss' : 'spread-dot good'} />
      ))}
      <line x1={34} x2={W - 8} y1={y(s.carry)} y2={y(s.carry)} className="range-median" />
      <text x={W - 10} y={y(s.carry) - 5} textAnchor="end" className="spread-axis range-median-label">
        {tr(`median ${u(s.carry)} ${uL}`, `Median ${u(s.carry)} ${uL}`)}
      </text>
    </svg>
  );
}

// ---------- Abstände: the bag in a row, measured beside what you entered ----------

function GapsTab(props: { session: LmSession; bag: { club: Club; carry: number }[]; dist: (m: number) => string }) {
  const clubs = clubsOf(props.session.shots);
  const measured = new Map(clubs.map((c) => [c.club, spreadOf(c.shots)] as const));
  const carries = new Map([...measured].map(([c, s]) => [c, s.carry] as const));
  const rows = [...new Set([...props.bag.map((b) => b.club), ...carries.keys()])].sort((a, b) => CLUB_INDEX(a) - CLUB_INDEX(b));
  const bagCarry = (c: Club) => props.bag.find((b) => b.club === c)?.carry ?? null;
  const wrong = outOfOrder(carries, props.bag);
  const max = Math.max(...rows.map((c) => measured.get(c)?.carryHi ?? bagCarry(c) ?? 0)) * 1.05;
  const close = closeGaps(carries);
  return (
    <>
      <section className="card stats-card">
        <h2>{tr('Carry per club', 'Carry je Schläger')}</h2>
        <div className="range-gaps" role="table" aria-label={tr('Carry per club', 'Carry je Schläger')}>
          {rows.map((c) => {
            const m = measured.get(c);
            const v = m ? m.carry : bagCarry(c);
            if (v == null) return null;
            return (
              <div key={c} className={`range-gap${m ? ' measured' : ''}`} role="row">
                <strong role="cell">{clubCode(c)}</strong>
                <span className="range-bar" role="cell">
                  <i style={{ width: `${(v / max) * 100}%` }} />
                  {m && <s style={{ left: `${(m.carryLo / max) * 100}%`, width: `${((m.carryHi - m.carryLo) / max) * 100}%` }} />}
                </span>
                <span role="cell" className={m ? 'good-text' : wrong.has(c) ? 'bad-text' : 'muted'}>{props.dist(v)}</span>
              </div>
            );
          })}
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          {tr('Green: measured in this session (the mark: 8 of 10). Grey: in your bag, entered by you. Red: does not fit the order of the measured clubs.', 'Grün: in dieser Sitzung gemessen (der Strich: 8 von 10). Grau: in deinem Bag, selbst eingetragen. Rot: passt nicht zur Reihenfolge der gemessenen Schläger.')}
        </p>
      </section>
      {(close.length > 0 || wrong.size > 0) && (
        <section className="card stats-card">
          <h2>{tr('What stands out', 'Was auffällt')}</h2>
          {close.map((g) => {
            const a = medianOf(clubs.find((c) => c.club === g.long)!.shots, 'ballSpeed');
            const b = medianOf(clubs.find((c) => c.club === g.short)!.shots, 'ballSpeed');
            const ta = TOUR[g.long];
            const tb = TOUR[g.short];
            const mine = a && b ? Math.round((a / b - 1) * 100) : null;
            const tour = ta && tb ? Math.round((ta.ballSpeed / tb.ballSpeed - 1) * 100) : null;
            return (
              <p key={g.long} style={{ margin: 0 }}>
                {tr(`${clubName(g.long)} flies only ${g.gap} m farther than ${clubName(g.short)}.`, `${clubName(g.long)} fliegt nur ${g.gap} m weiter als ${clubName(g.short)}.`)}
                {mine != null && tour != null && mine < tour - 3 ? tr(` Its ball is only ${mine} % faster (tour: ${tour} %) – it is not struck fully.`, ` Sein Ball ist nur ${mine} % schneller (Tour: ${tour} %) – er wird nicht voll getroffen.`) : ''}
                {/^[2-4]i$/.test(g.long) ? tr(` A hybrid instead would be worth a try.`, ` Ein Hybrid stattdessen wäre einen Test wert.`) : ''}
              </p>
            );
          })}
          {wrong.size > 0 && (
            <p style={{ margin: 0 }}>
              {tr(`In your bag ${[...wrong].map(clubCode).join(', ')} do not fit the measurement – enter their carries yourself in My bag.`, `In deinem Bag passen ${[...wrong].map(clubCode).join(', ')} nicht zur Messung – trag ihre Weiten selbst in Mein Bag ein.`)}
            </p>
          )}
        </section>
      )}
    </>
  );
}
const CLUB_INDEX = (c: Club) => CLUB_ORDER.indexOf(c);

// ---------- Flugbahn: the nine flights and draw/fade, counted ----------

function FlightTab(props: { club: Club; shots: LmShot[]; fmt: (v: number, d?: number) => string }) {
  const lefty = isLeftHanded();
  const flights = props.shots.map((s) => flightOf(s, lefty)).filter((f): f is Flight => f != null);
  if (!flights.length)
    return (
      <section className="card stats-card">
        <p style={{ margin: 0 }}>{tr('The file has no launch direction – the flight cannot be read from it.', 'Die Datei enthält keine Abflugrichtung – die Flugbahn lässt sich daraus nicht bestimmen.')}</p>
      </section>
    );
  const count = new Map<Flight, number>();
  for (const f of flights) count.set(f, (count.get(f) ?? 0) + 1);
  const top = Math.max(...count.values());
  const sorted = [...count.entries()].sort((a, b) => b[1] - a[1]);
  const tile = (f: (typeof FLIGHTS)[number]) => {
    const n = count.get(f.value) ?? 0;
    const s = f.start * 8;
    const c = f.curve * 10;
    const d = `M20 34 Q${(20 + s * 0.55).toFixed(1)} 19 ${20 + s + c} 5`;
    return (
      <div key={f.value} className={`flight-opt range-flight${n ? '' : ' zero'}`} aria-pressed={n === top}>
        {n > 0 && <span className="range-flight-n">{n}</span>}
        <svg width="40" height="38" viewBox="0 0 40 38" aria-hidden="true" style={lefty ? { transform: 'scaleX(-1)' } : undefined}>
          <line x1="20" y1="36" x2="20" y2="3" stroke="currentColor" strokeOpacity="0.25" strokeDasharray="2 3" />
          <path d={d} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="20" cy="34" r="2.6" fill="currentColor" />
        </svg>
        <span>{f.label()}</span>
      </div>
    );
  };
  const path = medianOf(props.shots, 'path');
  const face = medianOf(props.shots, 'face');
  const f2p = medianOf(props.shots, 'faceToPath');
  const deg = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${props.fmt(Math.abs(v), 1)}°`;
  return (
    <>
      <section className="card stats-card">
        <h2>{tr(`${flights.length} shots · recognised by the device`, `${flights.length} Schläge · vom Gerät erkannt`)}</h2>
        <div className="flight-picker" role="group" aria-label={tr('Flights', 'Flugbahnen')}>
          <div className="flight-grid">{FLIGHTS.filter((f) => !f.shape).map(tile)}</div>
          <div className="flight-grid two">{FLIGHTS.filter((f) => f.shape).map(tile)}</div>
        </div>
        <p style={{ margin: 0 }}>
          {top / flights.length >= 0.35
            ? tr(`Most frequent: ${flightName(sorted[0][0])} (${sorted[0][1]} of ${flights.length}).`, `Am häufigsten: ${flightName(sorted[0][0])} (${sorted[0][1]} von ${flights.length}).`)
            : tr(`No set pattern: ${sorted.slice(0, 3).map(([f, n]) => `${flightName(f)} ${n}×`).join(', ')}.`, `Kein festes Muster: ${sorted.slice(0, 3).map(([f, n]) => `${flightName(f)} ${n}×`).join(', ')}.`)}
        </p>
      </section>
      {(path != null || face != null || f2p != null) && (
        <section className="card stats-card">
          <h2>{tr('Why', 'Warum')}</h2>
          <div className="range-rows">
            {path != null && <Row label={tr('Club path', 'Schwungbahn')} value={deg(path)} />}
            {face != null && <Row label={tr('Face to target', 'Schlagfläche zum Ziel')} value={deg(face)} />}
            {f2p != null && <Row label={tr('Face to path', 'Fläche zur Bahn')} value={deg(f2p)} />}
          </div>
          {f2p != null && (
            <p style={{ margin: 0 }}>
              {Math.abs(f2p) < 1
                ? tr('On average the face is square to the path – the ball flies without much curve.', 'Im Mittel steht die Fläche gerade zur Bahn – der Ball fliegt ohne große Kurve.')
                : (f2p > 0) !== lefty
                  ? tr(`On average the face is ${props.fmt(Math.abs(f2p), 1)}° open to the path – the ball curves to the slice side.`, `Im Mittel steht die Fläche ${props.fmt(Math.abs(f2p), 1)}° offen zur Bahn – der Ball dreht zur Slice-Seite.`)
                  : tr(`On average the face is ${props.fmt(Math.abs(f2p), 1)}° closed to the path – the ball curves to the hook side.`, `Im Mittel steht die Fläche ${props.fmt(Math.abs(f2p), 1)}° geschlossen zur Bahn – der Ball dreht zur Hook-Seite.`)}
            </p>
          )}
        </section>
      )}
    </>
  );
}

function Row(props: { label: string; value: string; tour?: string; bad?: boolean }) {
  return (
    <div className="range-row">
      <span>{props.label}</span>
      <strong className={props.bad ? 'bad-text' : undefined}>{props.value}</strong>
      {props.tour !== undefined && <span className="muted small">{props.tour}</span>}
    </div>
  );
}

// ---------- Schwung: the device's numbers beside the tour average ----------

function SwingTab(props: { club: Club; shots: LmShot[]; fmt: (v: number, d?: number) => string; speed: (kmh: number) => string; dist: (m: number) => string; yd: boolean }) {
  const t = TOUR[props.club];
  const rpm = (v: number) => `${props.fmt(Math.round(v / 10) * 10)} ${tr('rpm', 'U/min')}`;
  const deg = (v: number) => `${v < 0 ? '−' : ''}${props.fmt(Math.abs(v), 1)}°`;
  const rows: { key: keyof TourRef; label: string; show: (v: number) => string }[] = [
    { key: 'clubSpeed', label: tr('Club speed', 'Schlägerkopf'), show: props.speed },
    { key: 'ballSpeed', label: tr('Ball speed', 'Ballgeschwindigkeit'), show: props.speed },
    { key: 'smash', label: 'Smash Factor', show: (v) => props.fmt(v, 2) },
    { key: 'launch', label: tr('Launch angle', 'Abflugwinkel'), show: deg },
    { key: 'spin', label: 'Backspin', show: rpm },
    { key: 'apex', label: tr('Apex', 'Scheitelpunkt'), show: props.dist },
    { key: 'attack', label: tr('Attack angle', 'Anstellwinkel'), show: deg },
    { key: 'carry', label: 'Carry', show: props.dist },
  ];
  const mineOf = (k: keyof TourRef) => medianOf(props.shots, k === 'carry' ? 'carry' : (k as keyof LmShot));
  const shown = rows.filter((r) => mineOf(r.key) != null);
  const flagged = shown.filter((r) => t && offTour(r.key, mineOf(r.key)!, t[r.key]));
  const back = medianOf(props.shots, 'backSec');
  const down = medianOf(props.shots, 'downSec');
  const tempo = medianOf(props.shots, 'tempo') ?? (back && down ? back / down : null);
  return (
    <>
      <section className="card stats-card">
        <div className="range-row range-head">
          <span className="muted small">{tr(`${clubName(props.club)} · median`, `${clubName(props.club)} · Median`)}</span>
          <span className="muted small">{tr('you', 'du')}</span>
          <span className="muted small">Tour</span>
        </div>
        <div className="range-rows">
          {shown.map((r) => {
            const mine = mineOf(r.key)!;
            return <Row key={r.key} label={r.label} value={r.show(mine)} tour={t ? r.show(t[r.key]) : '–'} bad={!!t && offTour(r.key, mine, t[r.key])} />;
          })}
        </div>
        <p className="muted small" style={{ margin: 0 }}>{t ? tr('Tour: PGA Tour average (TrackMan).', 'Tour: Schnitt der PGA Tour (TrackMan).') : tr('No tour average for this club.', 'Für diesen Schläger gibt es keinen Tour-Schnitt.')}</p>
      </section>
      {flagged.length > 0 && (
        <section className="card stats-card">
          <h2>{tr('What stands out', 'Was auffällt')}</h2>
          <p style={{ margin: 0 }}>
            {tr('Clearly different from the tour: ', 'Deutlich anders als auf der Tour: ')}
            {flagged.map((r) => `${r.label} (${r.show(mineOf(r.key)!)} ${tr('against', 'statt')} ${r.show(t![r.key])})`).join(', ')}.
            {flagged.some((r) => r.key === 'attack') && mineOf('attack')! > t!.attack
              ? tr(' A flat attack angle: the ball is swept rather than struck down – it holds the green less well.', ' Ein flacher Anstellwinkel: Der Ball wird eher gefegt als nach unten getroffen – er hält schlechter auf dem Grün.')
              : ''}
          </p>
        </section>
      )}
      {tempo != null && (
        <section className="card stats-card">
          <h2>{tr('Rhythm', 'Rhythmus')}</h2>
          <div className="range-rows">
            {back != null && down != null && <Row label={tr('Backswing / downswing', 'Rückschwung / Abschwung')} value={`${props.fmt(back, 2)} s / ${props.fmt(down, 2)} s`} />}
            <Row label="Tempo" value={`${props.fmt(tempo, 1)} : 1`} tour="Tour 3 : 1" />
          </div>
          <p className="muted small" style={{ margin: 0 }}>{tr('As the device measures it – telling as a trend over several sessions.', 'So misst es das Gerät – als Verlauf über mehrere Sitzungen aussagekräftiger als einzeln.')}</p>
        </section>
      )}
    </>
  );
}

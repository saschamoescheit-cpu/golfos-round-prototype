import { useMemo, useState } from 'react';
import type { DetailEntry, HoleEntry, Round, Shot } from '../types';
import { distanceM, holeMapData } from '../lib/geo';
import { deriveFromShots, firstPuttM, KINDS, shotLengths, suggestKind } from '../lib/shots';
import { holeSg } from '../lib/sg';
import { detectHoleShots, loadTrack, trackForHole } from '../lib/track';
import { loadCachedCourse, loadGeometry, loadImagery, loadRounds, loadUnit } from '../lib/storage';
import { pickImagery } from '../lib/imagery';
import { playerBag } from '../lib/stats';
import { formatDistance } from '../lib/geo';
import { HoleMap } from '../components/HoleMap';
import { ShotSheet } from '../components/ShotSheet';
import { TopBar } from '../components/ui';

// Round check after a detailed round (feature 007): every shot of every hole on the map, with club, shot type,
// lie, length and strokes gained. Shots detected from the GPS track are marked "check"; the player corrects
// them and confirms the hole.

export function RoundReview(props: { round: Round; onChange: (r: Round) => void; onDone: () => void }) {
  const { round } = props;
  const me = round.players.find((p) => p.isMe)!;
  const geometry = useMemo(() => loadGeometry(round.courseId), [round.courseId]);
  const maps = useMemo(() => round.holes.map((h) => holeMapData(geometry, h.loop, h.number)), [geometry, round.holes]);
  const track = useMemo(() => loadTrack(round.id), [round.id]);
  const bag = useMemo(() => playerBag(loadRounds().filter((r) => r.finishedAt && r.id !== round.id)), [round.id]);
  const unit = loadUnit();
  const course = loadCachedCourse(round.courseId);
  const imagery = pickImagery(course ? [course.lon, course.lat] : (maps.find(Boolean)?.greenCenter ?? [0, 0]), loadImagery());
  const entries = round.entries[me.id];
  const firstToCheck = entries.findIndex((e) => e.detail?.shots.some((s) => s.review));
  const [k, setK] = useState(firstToCheck >= 0 ? firstToCheck : 0);
  const [edit, setEdit] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const hole = round.holes[k];
  const data = maps[k];
  const e = entries[k];
  const d: DetailEntry | null = e.detail ?? null;
  const pin = d?.pin ?? data?.greenCenter ?? null;
  const lengths = d ? shotLengths(d) : [];
  const sg = d ? holeSg({ ...d, pin }, e.putts, hole.par) : null;
  const toCheck = entries.reduce((n, x) => n + (x.detail?.shots.filter((s) => s.review).length ?? 0), 0);
  const fmt = (m: number) => `${formatDistance(m, unit)} ${unit}`;

  const save = (index: number, patch: Partial<HoleEntry>) => {
    const list = entries.slice();
    list[index] = { ...list[index], ...patch };
    props.onChange({ ...round, entries: { ...round.entries, [me.id]: list } });
  };
  /** Saves shots and recomputes the derived values; a score the player entered by hand is kept. */
  const saveDetail = (index: number, detail: DetailEntry, entry = entries[index]) => {
    const derived = deriveFromShots(detail, entry.putts, round.holes[index].par, maps[index]);
    if (entry.strokes != null && !entry.detail) delete derived.strokes;
    save(index, { detail, ...derived });
  };

  const detectAll = () => {
    let holes = 0;
    const list = entries.slice();
    round.holes.forEach((h, i) => {
      const m = maps[i];
      if (!m || list[i].detail?.shots.length) return;
      const part = trackForHole(track, m, maps[i + 1] ?? null);
      const found = detectHoleShots(part, m, h.par, bag);
      if (!found) return;
      holes++;
      const derived = deriveFromShots(found, list[i].putts, h.par, m);
      if (list[i].strokes != null) delete derived.strokes; // keep the score entered on the course
      list[i] = { ...list[i], detail: { ...found, pin: m.greenCenter }, ...derived };
    });
    props.onChange({ ...round, entries: { ...round.entries, [me.id]: list } });
    setNotice(holes ? `Shots detected on ${holes} ${holes === 1 ? 'hole' : 'holes'} – please check them.` : 'No shots found in the GPS track.');
  };

  const confirmHole = () => {
    if (d) saveDetail(k, { ...d, shots: d.shots.map((s) => ({ ...s, review: false })) });
    if (k < round.holes.length - 1) setK(k + 1);
  };

  const editing: Shot | null = d && edit != null ? d.shots[edit] : null;
  const shotCount = d ? d.shots.length + d.shots.filter((s) => s.penalty).length + (d.holedOut ? 0 : (e.putts ?? 0)) : null;
  const mismatch = d && e.strokes != null && shotCount != null && d.onGreen && e.putts != null && shotCount !== e.strokes;

  return (
    <main className="screen review">
      <TopBar title="Check your shots" onBack={props.onDone} backLabel="Done" />
      <div className="row">
        <span className="muted small">{toCheck ? `${toCheck} ${toCheck === 1 ? 'shot' : 'shots'} to check` : 'All shots checked ✓'}</span>
        {track.length > 20 && (
          <button type="button" className="btn-ghost" onClick={detectAll}>
            Detect shots from GPS track
          </button>
        )}
      </div>
      {notice && <div className="notice">{notice}</div>}

      <div className="review-nav">
        <button type="button" className="icon-btn" aria-label="Previous hole" disabled={k === 0} onClick={() => setK(k - 1)}>
          ←
        </button>
        <div style={{ textAlign: 'center' }}>
          <strong>Hole {hole.label}</strong>
          <div className="muted small">
            Par {hole.par} · {e.strokes ?? '–'} strokes{e.putts != null ? ` · ${e.putts} putts` : ''}
          </div>
        </div>
        <button type="button" className="icon-btn" aria-label="Next hole" disabled={k === round.holes.length - 1} onClick={() => setK(k + 1)}>
          →
        </button>
      </div>

      {data && (
        <div className="review-map">
          <HoleMap
            holeKey={`review-${k}`}
            padding={{ top: 24, bottom: 24, left: 24, right: 24 }}
            data={data}
            player={null}
            from={data.tee}
            pin={pin ?? data.greenCenter}
            targets={[]}
            unit={unit}
            imagery={imagery}
            track={[
              ...(d?.shots ?? []).flatMap((s, n) => (s.pos ? [{ pos: s.pos, label: `${n + 1}${s.club ? ' ' + s.club : ''}${s.review ? ' ?' : ''}` }] : [])),
              ...(d?.onGreen ? [{ pos: d.onGreen, label: e.putts != null ? `${e.putts} putts` : 'green', green: true }] : []),
            ]}
            onTargetsChange={() => {}}
            onTargetRemove={() => {}}
            onPinChange={(p) => d && saveDetail(k, { ...d, pin: p })}
            onMapTap={() => {}}
          />
        </div>
      )}

      {mismatch && (
        <div className="notice">
          Your score was {e.strokes}, the shots add up to {shotCount}. Please add or delete a shot, or correct the putts.
        </div>
      )}

      {!d || d.shots.length === 0 ? (
        <p className="muted">No shots on this hole{track.length > 20 ? ' – try “Detect shots from GPS track”.' : '.'}</p>
      ) : (
        <ol className="shot-list review-list">
          {d.shots.map((s, n) => {
            const toPin = s.pos && pin ? distanceM(s.pos, pin) : null;
            const kind = s.kind ?? suggestKind(s.lie, toPin);
            const v = sg?.[n]?.sg;
            return (
              <li key={n} className={s.review ? 'check' : undefined}>
                <span className="n">{n + 1}</span>
                <button type="button" className="shot-row" onClick={() => setEdit(n)}>
                  <strong>{s.club ?? '–'}</strong> · {KINDS.find((x) => x.value === kind)!.label}
                  <span className="muted small" style={{ display: 'block' }}>
                    {s.lie}
                    {lengths[n] != null ? ` · ${fmt(lengths[n]!)}` : ''}
                    {s.penalty ? ' · +1 penalty' : ''}
                    {s.review ? ' · check' : ''}
                  </span>
                </button>
                <span className={`sg-badge ${v == null ? '' : v >= 0 ? 'good' : 'bad'}`}>{v == null ? '' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}`}</span>
                <span />
              </li>
            );
          })}
          {d.onGreen && (
            <li>
              <span className="n">⛳</span>
              <span>
                {e.putts ?? '–'} putts
                <span className="muted small" style={{ display: 'block' }}>
                  first putt {firstPuttM({ ...d, pin }) != null ? fmt(firstPuttM({ ...d, pin })!) : '–'}
                </span>
              </span>
              <span className={`sg-badge ${sg ? (sg[sg.length - 1].sg >= 0 ? 'good' : 'bad') : ''}`}>
                {sg && sg[sg.length - 1].category === 'putting' ? `${sg[sg.length - 1].sg >= 0 ? '+' : ''}${sg[sg.length - 1].sg.toFixed(2)}` : ''}
              </span>
              <span />
            </li>
          )}
        </ol>
      )}

      <span className="spacer" />
      <button type="button" className="btn-primary" onClick={confirmHole}>
        {k < round.holes.length - 1 ? `Confirm hole ${hole.label} →` : 'Confirm last hole'}
      </button>

      {editing && d && (
        <ShotSheet
          title={`Hole ${hole.label} · shot ${edit! + 1}`}
          lie={editing.lie}
          club={editing.club}
          penalty={editing.penalty}
          kind={editing.kind}
          toPinM={editing.pos && pin ? distanceM(editing.pos, pin) : null}
          editing
          bag={bag}
          onCancel={() => setEdit(null)}
          onSave={(v) => {
            const shots = d.shots.slice();
            shots[edit!] = { ...shots[edit!], ...v };
            saveDetail(k, { ...d, shots });
            setEdit(null);
          }}
          onDelete={() => {
            saveDetail(k, { ...d, shots: d.shots.filter((_, n) => n !== edit) });
            setEdit(null);
          }}
        />
      )}
    </main>
  );
}

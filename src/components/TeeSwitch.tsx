// The tee changed in the middle of a round (Sascha 13.11.2026, click paths: "Abschlag in der Runde" – it was only possible
// before the start). A row in the hole drawer, the same choice as in "Neue Runde": colour, length, course rating and slope;
// the lengths, the caddie, the course rating and the player's own playing handicap follow the new tee.
import type { Round } from '../types';
import { TEES, TEE_COLOURS, courseTees, teeName } from '../data/tees';
import { loadGeometry } from '../lib/storage';
import { ogaTees } from '../lib/ogaratings';
import { playingHandicapFor, ratingFor } from '../lib/handicap';
import { isLady, loadProfile } from '../lib/profile';
import { tr, dec } from '../lib/i18n';

/** The tees a round's course offers – none, or only one: nothing to switch. */
export function roundTees(round: Round): string[] {
  return courseTees(round.courseId, loadGeometry(round.courseId).teeColours, ogaTees(round.courseId)).tees;
}

/** The round from another tee: the player's own tee, the round's (lengths, caddie, rating) and his playing handicap from
 *  his index for it – a course rating typed for the old tee no longer counts. */
export function withTee(round: Round, tee: string, fromNow = false): Round {
  const index = loadProfile().hcpIndex;
  const playing = playingHandicapFor(round.courseId, round.holes, tee, index, isLady());
  // in the middle of the round (review 14.11.2026): the holes played keep the tee they were played from – the round
  // check reads a hole's own tee before the round's
  const me = round.players.find((p) => p.isMe)?.id;
  const old = round.tee;
  const entries =
    fromNow && me && old && round.entries[me]
      ? { ...round.entries, [me]: round.entries[me].map((e) => (e && (e.strokes != null || e.pickedUp) && !e.tee ? { ...e, tee: old } : e)) }
      : round.entries;
  return {
    ...round,
    tee,
    rating: undefined,
    entries,
    players: round.players.map((p) => (p.isMe ? { ...p, tee, ...(playing != null ? { playingHandicap: playing } : {}) } : p)),
  };
}

export function TeeSwitchSheet(props: { round: Round; onPick: (tee: string) => void; onClose: () => void }) {
  const { round } = props;
  const lady = isLady();
  const data = TEES[round.courseId];
  const rated = round.holes.length === 18 || round.holes.length === 9;
  const tees = roundTees(round).map((t) => {
    const i = data ? data.tees.indexOf(t) : -1;
    const total = i >= 0 ? round.holes.reduce((s, h) => s + (data!.holes[h.label]?.[i] ?? 0), 0) : 0;
    return { id: t, name: teeName(t), colour: TEE_COLOURS[t] ?? '#999', total, rating: rated ? ratingFor(round.courseId, t, round.holes, lady) : null };
  });
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet" role="dialog" aria-label="Tee" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>Tee</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        <div className="pick-list">
          {tees.map((t) => (
            <button key={t.id} type="button" className="pick-option" aria-pressed={t.id === round.tee} onClick={() => props.onPick(t.id)}>
              <span className="tee-dot" style={{ background: t.colour }} />
              <span className="grow">
                <strong>{t.name}</strong>
                <span className="muted small">{[t.total > 0 ? `${t.total} m` : '', t.rating ? `Course Rating ${dec(t.rating.cr.toFixed(1))} · Slope ${t.rating.slope}` : ''].filter(Boolean).join(' · ')}</span>
              </span>
              {t.id === round.tee && <span className="pick-check" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

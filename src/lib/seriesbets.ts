import { tr } from './i18n';
import { decidedOf, inPool, isPicked, isVoided, KINDS, type Wager, type WagerPool } from './wagers';
import { changePool, isHost, loadPools, myAccount } from './wagerstore';

// A round added to a tournament series while bets run on it (Sascha 14.11.2026: "sollte abgefragt werden, ob die
// laufenden Wetten auch für die neue hinzugefügte Runde zählen sollen. Danach muss sich entsprechend alles anpassen"):
// the pools this phone hosts that run over the series' days, their open bets in groups of a kind ("Birdies in Folge",
// "Ergebnis brutto in 6 Runden"), each group ticked when it counts the round already. Saved: the ticked ones count it –
// the period stretched, the trip's rounds and the bet's chosen rounds take it, a "not counted" taken back; the others
// do not – the round taken out of that bet (voided) or out of its chosen rounds.

export interface NewRound {
  day: string;
  course: string;
  courseId?: string;
  tour?: string;
}
export interface BetGroup {
  key: string;
  label: string;
  /** the players' names */
  who: string[];
  ids: string[];
  /** every bet of it counts the round as things are */
  counts: boolean;
}
export interface PoolAsk {
  code: string;
  name: string;
  groups: BetGroup[];
}

const groupKey = (w: Wager) => [w.kind, w.scope ?? '', w.holes ?? 18, w.net ? 'net' : '', w.rounds ?? '', w.picks?.length ? 'picks' : ''].join('|');
function groupLabel(w: Wager): string {
  const k = KINDS.find((x) => x.kind === w.kind);
  const name = k ? k.name() : w.kind;
  const parts = [name];
  if (w.scope === 'trip') parts.push(tr('on the trip', 'auf der Reise'));
  if (w.rounds) parts.push(tr(`in ${w.rounds} rounds`, `in ${w.rounds} Runden`));
  if (w.picks?.length) parts.push(tr('chosen rounds', 'ausgewählte Runden'));
  return parts.join(' · ');
}

/** Does the bet count the round – the pool's period left aside (it is stretched when it counts). */
const countsRound = (pool: WagerPool, w: Wager, r: NewRound) => inPool(r, { ...pool, from: r.day < pool.from ? r.day : pool.from, to: r.day > pool.to ? r.day : pool.to }, w);

/** The pools to ask about: hosted here, not deleted, running over the series' other rounds or the new one's day. */
export function seriesAsks(r: NewRound, others: { day: string }[]): PoolAsk[] {
  const out: PoolAsk[] = [];
  for (const e of loadPools()) {
    const p = e.pool;
    if (!isHost(e) || p.deletedAt) continue;
    const over = (d: string) => d >= p.from && d <= p.to;
    if (!over(r.day) && !others.some((o) => over(o.day))) continue;
    const open = p.wagers.filter((w) => w.kind !== 'free' && !decidedOf(p.progress?.[w.id]) && (!w.attempts || w.attempts === 'any'));
    if (!open.length) continue;
    const groups = new Map<string, BetGroup>();
    for (const w of open) {
      const k = groupKey(w);
      const g = groups.get(k) ?? { key: k, label: groupLabel(w), who: [], ids: [], counts: true };
      g.ids.push(w.id);
      const name = p.players.find((x) => x.id === w.player)?.name;
      if (name && !g.who.includes(name)) g.who.push(name);
      g.counts = g.counts && countsRound(p, w, r);
      groups.set(k, g);
    }
    out.push({ code: e.code, name: p.name, groups: [...groups.values()] });
  }
  return out;
}

/** The pool changed as answered: `yes` – the groups that count the round. */
export function applySeriesAnswer(pool: WagerPool, r: NewRound, groups: BetGroup[], yes: Set<string>, now = new Date().toISOString()): WagerPool {
  const by = myAccount() ?? '';
  const counting = new Set(groups.filter((g) => yes.has(g.key)).flatMap((g) => g.ids));
  const asked = new Set(groups.flatMap((g) => g.ids));
  const any = counting.size > 0;
  const next: WagerPool = { ...pool };
  if (any) {
    if (r.day < next.from) next.from = r.day;
    if (r.day > next.to) next.to = r.day;
    // the trip's rounds listed: this one too
    if (next.rounds?.length && !next.rounds.some((x) => x.day === r.day && (!x.course || x.course === r.course || (!!x.courseId && x.courseId === r.courseId))))
      next.rounds = [...next.rounds, { id: `r${Date.now().toString(36)}`, day: r.day, course: r.course, ...(r.courseId ? { courseId: r.courseId } : {}), ...(r.tour ? { tour: r.tour } : {}) }];
  }
  next.wagers = pool.wagers.map((w) => {
    if (!asked.has(w.id)) return w;
    const round = { day: r.day, course: r.course, ...(r.courseId ? { courseId: r.courseId } : {}) };
    if (counting.has(w.id)) {
      const x: Wager = { ...w };
      if (x.picks?.length && !isPicked(x.picks, round)) x.picks = [...x.picks, round];
      if (x.voided?.length && isVoided(x, round)) x.voided = x.voided.filter((v) => !(v.day === r.day && v.course === r.course));
      if (x.until && x.until < r.day) x.until = r.day;
      if (x.from && x.from > r.day) x.from = r.day;
      return x;
    }
    // not counted: out of its chosen rounds, or taken out of this bet
    if (w.picks?.length) return isPicked(w.picks, round) ? { ...w, picks: w.picks.filter((p) => !(p.day === r.day && isPicked([p], round))) } : w;
    return isVoided(w, round) ? w : { ...w, voided: [...(w.voided ?? []), { day: r.day, course: r.course, by, at: now }] };
  });
  return next;
}

/** Saved on the server (the host's change). */
export const answerSeries = (code: string, r: NewRound, groups: BetGroup[], yes: Set<string>): Promise<boolean> => changePool(code, (p) => applySeriesAnswer(p, r, groups, yes)).then((x) => !!x);

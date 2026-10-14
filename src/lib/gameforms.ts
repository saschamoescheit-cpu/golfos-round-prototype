import { tr } from './i18n';

// The "Games" module (Sascha 15.10.2026): side games among friends as a product of its own, not tied to the round
// analysis – skins, Nassau, wolf, Chicago, Bingo Bango Bongo, Las Vegas, sixes, snake, dots, Stableford and match
// play duels. Each form has its rules ("Ausgestaltung"), its settings and, where needed, what is entered per hole
// besides the strokes. Results in points; with a stake per point the settlement in euros.

export type FormId = 'skins' | 'nassau' | 'wolf' | 'chicago' | 'bbb' | 'vegas' | 'sixes' | 'snake' | 'dots' | 'stableford' | 'match';

export interface GameHole {
  label: string;
  par: number;
  si: number; // stroke index
}
export interface GamePlayer {
  id: string;
  name: string;
  hcp: number | null; // playing handicap (Spielvorgabe)
}
/** What is entered per hole besides the strokes. */
export interface HoleExtra {
  wolfPartner?: string | null; // wolf: the partner the wolf chose; null = lone wolf
  wolfBlind?: boolean; // wolf: lone wolf announced before anyone hit (blind)
  bingo?: string | null; // first on the green
  bango?: string | null; // closest to the pin once all are on the green
  bongo?: string | null; // first to hole out
  threePutt?: string[]; // snake: who three-putted (in order)
  dots?: Record<string, string[]>; // dots: per player the dots won on this hole
}
export interface Game {
  id: string;
  createdAt: string;
  finishedAt: string | null;
  courseName: string;
  holes: GameHole[];
  players: GamePlayer[];
  form: FormId;
  settings: Record<string, number | boolean | string>;
  scores: Record<string, (number | null)[]>; // gross strokes per player and hole
  extra: HoleExtra[];
  current: number;
}

export interface SettingDef {
  key: string;
  label: () => string;
  type: 'stake' | 'bool' | 'choice';
  options?: { value: string; label: () => string }[];
  default: number | boolean | string;
  hint?: () => string;
}
export interface StandingRow {
  id: string;
  name: string;
  points: number; // for the ranking (higher = better)
  value: string; // as shown
  detail?: string;
}
export interface Standing {
  rows: StandingRow[];
  status?: string; // a line on top, e.g. "Front 9: Anna 2 up"
  money?: Record<string, number>; // + wins / − pays, in euros
}
export interface FormDef {
  id: FormId;
  name: () => string;
  short: () => string; // one line for the list
  rules: () => string[]; // how it is played
  players: [number, number];
  counts?: number[]; // only these player numbers (e.g. one against one or two against two)
  settings: SettingDef[];
  input?: 'wolf' | 'bbb' | 'snake' | 'dots';
  standing: (g: Game) => Standing;
}

// ---------- helpers ----------

/** Strokes received per hole for a playing handicap (stroke index order, more than 18 – a second round). */
export function received(holes: GameHole[], hcp: number | null): number[] {
  if (hcp == null || hcp === 0) return holes.map(() => 0);
  const n = holes.length;
  const order = holes.map((h, i) => ({ i, si: h.si || i + 1 })).sort((a, b) => a.si - b.si);
  const out = holes.map(() => 0);
  const full = n === 9 ? Math.round(hcp / 2) : hcp; // a 9-hole game gets half the 18-hole handicap
  const sign = full < 0 ? -1 : 1;
  for (let k = 0; k < Math.abs(full); k++) out[order[k % n].i] += sign;
  return out;
}

const net = (g: Game, pid: string, i: number): number | null => {
  const s = g.scores[pid]?.[i];
  if (s == null) return null;
  const p = g.players.find((x) => x.id === pid)!;
  return g.settings.net === false ? s : s - received(g.holes, p.hcp)[i];
};
const stake = (g: Game, key = 'stake') => Number(g.settings[key] ?? 0);
const played = (g: Game, i: number) => g.players.every((p) => g.scores[p.id]?.[i] != null);
const holesDone = (g: Game) => g.holes.filter((_, i) => played(g, i)).length;
const euro = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(Math.abs(v) % 1 ? 2 : 0)} €`;
const rank = (rows: StandingRow[]) => rows.sort((a, b) => b.points - a.points);
const name = (g: Game, id: string) => g.players.find((p) => p.id === id)?.name ?? '?';

/** Money from points: everyone settles with everyone – the difference of points times the stake. */
function settle(g: Game, points: Record<string, number>, perPoint: number): Record<string, number> {
  const money: Record<string, number> = Object.fromEntries(g.players.map((p) => [p.id, 0]));
  if (!perPoint) return money;
  for (const a of g.players) for (const b of g.players) if (a.id < b.id) {
    const d = (points[a.id] - points[b.id]) * perPoint;
    money[a.id] += d;
    money[b.id] -= d;
  }
  return money;
}

/** Hole by hole between two sides (lower net wins): +1 side A, −1 side B, 0 halved, null not played. */
function holeWinner(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return a < b ? 1 : a > b ? -1 : 0;
}
const best = (g: Game, ids: string[], i: number): number | null => {
  const xs = ids.map((id) => net(g, id, i)).filter((v): v is number => v != null);
  return xs.length === ids.length ? Math.min(...xs) : null;
};
function matchText(results: (number | null)[], a: string, b: string): { diff: number; text: string } {
  let diff = 0;
  let n = 0;
  for (const r of results) if (r != null) { diff += r; n++; }
  if (!n) return { diff: 0, text: tr('not started', 'noch nicht begonnen') };
  if (!diff) return { diff, text: tr(`all square after ${n}`, `All Square nach ${n}`) };
  return { diff, text: tr(`${diff > 0 ? a : b} ${Math.abs(diff)} up after ${n}`, `${diff > 0 ? a : b} ${Math.abs(diff)} auf nach ${n}`) };
}

const NET: SettingDef = { key: 'net', label: () => tr('With handicap (net)', 'Mit Vorgabe (netto)'), type: 'bool', default: true };

// ---------- the forms ----------

export const FORMS: FormDef[] = [
  {
    id: 'skins',
    name: () => 'Skins',
    short: () => tr('Every hole is worth a skin – only an outright win takes it.', 'Jedes Loch ist ein Skin wert – nur ein alleiniger Sieg holt ihn.'),
    rules: () => [
      tr('Each hole is worth one skin.', 'Jedes Loch ist einen Skin wert.'),
      tr('The lowest score on the hole wins the skin – alone. A tie: nobody wins it.', 'Das beste Ergebnis am Loch gewinnt den Skin – allein. Bei Gleichstand gewinnt keiner.'),
      tr('With carry-over the skin goes on to the next hole, which is then worth more.', 'Mit Übertrag wandert der Skin aufs nächste Loch, das dann mehr wert ist.'),
      tr('Every skin is paid by each of the others with the stake.', 'Jeden Skin zahlen alle anderen mit dem Einsatz.'),
    ],
    players: [2, 4],
    settings: [
      NET,
      { key: 'carry', label: () => tr('Carry-over on a tie', 'Übertrag bei Gleichstand'), type: 'bool', default: true },
      { key: 'stake', label: () => tr('Stake per skin', 'Einsatz je Skin'), type: 'stake', default: 1 },
    ],
    standing: (g) => {
      const skins: Record<string, number> = Object.fromEntries(g.players.map((p) => [p.id, 0]));
      let pot = 0;
      const won: string[] = [];
      g.holes.forEach((_, i) => {
        if (!played(g, i)) return;
        pot += 1;
        const nets = g.players.map((p) => ({ id: p.id, v: net(g, p.id, i)! }));
        const low = Math.min(...nets.map((x) => x.v));
        const winners = nets.filter((x) => x.v === low);
        if (winners.length === 1) {
          skins[winners[0].id] += pot;
          won.push(`${g.holes[i].label}: ${name(g, winners[0].id)}${pot > 1 ? ` (${pot})` : ''}`);
          pot = 0;
        } else if (!g.settings.carry) pot = 0;
      });
      const money: Record<string, number> = Object.fromEntries(g.players.map((p) => [p.id, 0]));
      const n = g.players.length;
      for (const p of g.players) {
        money[p.id] += skins[p.id] * (n - 1) * stake(g);
        for (const q of g.players) if (q.id !== p.id) money[q.id] -= skins[p.id] * stake(g);
      }
      return {
        rows: rank(g.players.map((p) => ({ id: p.id, name: p.name, points: skins[p.id], value: tr(`${skins[p.id]} skins`, `${skins[p.id]} Skins`) }))),
        status: pot ? tr(`${pot} skin(s) carried over`, `${pot} Skin(s) im Übertrag`) : won.slice(-1)[0],
        money,
      };
    },
  },
  {
    id: 'nassau',
    name: () => 'Nassau',
    short: () => tr('Three matches in one: front 9, back 9 and the whole round.', 'Drei Lochspiele in einem: vordere 9, hintere 9 und die ganze Runde.'),
    rules: () => [
      tr('Match play hole by hole, three bets: front nine, back nine, total.', 'Lochspiel Loch für Loch, drei Wetten: vordere 9, hintere 9, gesamt.'),
      tr('Two players one against one – or four players, 1 & 2 against 3 & 4 with the better ball.', 'Zwei Spieler einer gegen einen – oder vier Spieler, 1 & 2 gegen 3 & 4 mit dem besseren Ball.'),
      tr('Each bet won pays the stake.', 'Jede gewonnene Wette bringt den Einsatz.'),
      tr('Press: two down in a nine, a new bet starts from the next hole to the end of that nine.', 'Press: Wer in einer Neun 2 hinten liegt, startet ab dem nächsten Loch eine neue Wette bis zum Ende dieser Neun.'),
    ],
    players: [2, 4],
    counts: [2, 4],
    settings: [
      NET,
      { key: 'stake', label: () => tr('Stake per bet', 'Einsatz je Wette'), type: 'stake', default: 5 },
      { key: 'press', label: () => tr('Automatic press at 2 down', 'Automatischer Press bei 2 hinten'), type: 'bool', default: false },
    ],
    standing: (g) => {
      const four = g.players.length === 4;
      const A = four ? [g.players[0].id, g.players[1].id] : [g.players[0].id];
      const B = four ? [g.players[2].id, g.players[3].id] : [g.players[1].id];
      const nA = A.map((id) => name(g, id)).join(' & ');
      const nB = B.map((id) => name(g, id)).join(' & ');
      const res = g.holes.map((_, i) => holeWinner(best(g, A, i), best(g, B, i)));
      const half = g.holes.length >= 18 ? 9 : Math.ceil(g.holes.length / 2);
      const parts = [
        { label: tr('Front', 'Vorne'), from: 0, to: half },
        { label: tr('Back', 'Hinten'), from: half, to: g.holes.length },
        { label: tr('Total', 'Gesamt'), from: 0, to: g.holes.length },
      ];
      let bets = 0; // + side A won bets
      const lines: string[] = [];
      for (const part of parts) {
        const m = matchText(res.slice(part.from, part.to), nA, nB);
        lines.push(`${part.label}: ${m.text}`);
        const done = res.slice(part.from, part.to).every((r) => r != null);
        if (done && m.diff) bets += Math.sign(m.diff);
        if (g.settings.press && part.label !== tr('Total', 'Gesamt')) {
          // presses: from the hole after a side went 2 down, to the end of the nine
          let d = 0;
          for (let i = part.from; i < part.to; i++) {
            if (res[i] == null) break;
            d += res[i]!;
            if (Math.abs(d) === 2 && i + 1 < part.to) {
              const pm = matchText(res.slice(i + 1, part.to), nA, nB);
              lines.push(`Press ${part.label} ${g.holes[i + 1].label}: ${pm.text}`);
              if (res.slice(i + 1, part.to).every((r) => r != null) && pm.diff) bets += Math.sign(pm.diff);
              d = 0;
            }
          }
        }
      }
      const money: Record<string, number> = Object.fromEntries(g.players.map((p) => [p.id, 0]));
      for (const id of A) money[id] += bets * stake(g);
      for (const id of B) money[id] -= bets * stake(g);
      return {
        rows: [
          { id: 'A', name: nA, points: bets, value: tr(`${Math.max(0, bets)} bets`, `${Math.max(0, bets)} Wetten`) },
          { id: 'B', name: nB, points: -bets, value: tr(`${Math.max(0, -bets)} bets`, `${Math.max(0, -bets)} Wetten`) },
        ].sort((a, b) => b.points - a.points),
        status: lines.join(' · '),
        money,
      };
    },
  },
  {
    id: 'wolf',
    name: () => 'Wolf',
    short: () => tr('Four players, the wolf picks a partner after each tee shot – or plays alone.', 'Vier Spieler, der Wolf wählt nach den Abschlägen einen Partner – oder spielt allein.'),
    rules: () => [
      tr('The wolf rotates: player 1 on hole 1, player 2 on hole 2 …', 'Der Wolf wechselt: Spieler 1 an Loch 1, Spieler 2 an Loch 2 …'),
      tr('After each tee shot the wolf may take that player as partner – or play alone (lone wolf).', 'Nach jedem Abschlag darf der Wolf diesen Spieler als Partner nehmen – oder allein spielen (Lone Wolf).'),
      tr('Two against two: the better ball wins, each winner 1 point. Lone wolf wins: 2 points from each; loses: each other gets 1.', 'Zwei gegen zwei: der bessere Ball gewinnt, jeder Sieger 1 Punkt. Lone Wolf gewinnt: 2 Punkte von jedem; verliert: jeder andere 1 Punkt.'),
      tr('Blind wolf (alone before anyone hit): everything counts double.', 'Blind Wolf (allein, bevor einer geschlagen hat): alles zählt doppelt.'),
    ],
    players: [4, 4],
    input: 'wolf',
    settings: [NET, { key: 'stake', label: () => tr('Stake per point', 'Einsatz je Punkt'), type: 'stake', default: 1 }],
    standing: (g) => {
      const pts: Record<string, number> = Object.fromEntries(g.players.map((p) => [p.id, 0]));
      g.holes.forEach((_, i) => {
        if (!played(g, i)) return;
        const wolf = g.players[i % 4].id;
        const x = g.extra[i] ?? {};
        if (x.wolfPartner === undefined) return; // the wolf did not choose yet
        const k = x.wolfBlind ? 2 : 1;
        const team = x.wolfPartner ? [wolf, x.wolfPartner] : [wolf];
        const others = g.players.map((p) => p.id).filter((id) => !team.includes(id));
        const r = holeWinner(best(g, team, i), best(g, others, i));
        if (!r) return;
        if (team.length === 2) for (const id of r > 0 ? team : others) pts[id] += k;
        else if (r > 0) pts[wolf] += 2 * others.length * k;
        else for (const id of others) pts[id] += k;
      });
      return {
        rows: rank(g.players.map((p) => ({ id: p.id, name: p.name, points: pts[p.id], value: tr(`${pts[p.id]} pts`, `${pts[p.id]} Pkt.`) }))),
        status: !g.finishedAt && g.current < g.holes.length ? tr(`Wolf on ${g.holes[g.current].label}: ${g.players[g.current % 4].name}`, `Wolf an ${g.holes[g.current].label}: ${g.players[g.current % 4].name}`) : undefined,
        money: settle(g, pts, stake(g)),
      };
    },
  },
  {
    id: 'chicago',
    name: () => 'Chicago',
    short: () => tr('Points per hole against your own quota – the handicap is in the quota.', 'Punkte je Loch gegen die eigene Quote – die Vorgabe steckt in der Quote.'),
    rules: () => [
      tr('Points on every hole (gross): bogey 1, par 2, birdie 4, eagle 8, albatross 16.', 'Punkte an jedem Loch (brutto): Bogey 1, Par 2, Birdie 4, Eagle 8, Albatros 16.'),
      tr('Everyone has a quota: 39 minus the playing handicap (9 holes: half).', 'Jeder hat eine Quote: 39 minus Spielvorgabe (9 Löcher: die Hälfte).'),
      tr('Who beats his quota by the most wins; with a stake everyone settles the differences.', 'Wer seine Quote am weitesten übertrifft, gewinnt; mit Einsatz rechnet jeder die Differenzen ab.'),
    ],
    players: [2, 4],
    settings: [{ key: 'stake', label: () => tr('Stake per point', 'Einsatz je Punkt'), type: 'stake', default: 0.5 }],
    standing: (g) => {
      const pts: Record<string, number> = {};
      const rows = g.players.map((p) => {
        let s = 0;
        g.holes.forEach((h, i) => {
          const v = g.scores[p.id]?.[i];
          if (v == null) return;
          const d = v - h.par;
          s += d >= 2 ? 0 : d === 1 ? 1 : d === 0 ? 2 : d === -1 ? 4 : d === -2 ? 8 : 16;
        });
        const quota = Math.round(((39 - (p.hcp ?? 0)) * g.holes.length) / 18);
        pts[p.id] = s - quota;
        return { id: p.id, name: p.name, points: s - quota, value: `${s - quota >= 0 ? '+' : ''}${s - quota}`, detail: tr(`${s} pts, quota ${quota}`, `${s} Pkt., Quote ${quota}`) };
      });
      return { rows: rank(rows), money: settle(g, pts, stake(g)) };
    },
  },
  {
    id: 'bbb',
    name: () => 'Bingo Bango Bongo',
    short: () => tr('Three points per hole – the good players have no head start.', 'Drei Punkte je Loch – gute Spieler haben keinen Vorsprung.'),
    rules: () => [
      tr('Bingo: first ball on the green.', 'Bingo: erster Ball auf dem Grün.'),
      tr('Bango: closest to the pin once all balls are on the green.', 'Bango: am nächsten zur Fahne, wenn alle Bälle auf dem Grün sind.'),
      tr('Bongo: first to hole out.', 'Bongo: zuerst eingelocht.'),
      tr('The one farthest from the hole plays first – the order matters.', 'Wer am weitesten weg liegt, spielt zuerst – die Reihenfolge ist wichtig.'),
    ],
    players: [2, 4],
    input: 'bbb',
    settings: [{ key: 'stake', label: () => tr('Stake per point', 'Einsatz je Punkt'), type: 'stake', default: 0.5 }],
    standing: (g) => {
      const pts: Record<string, number> = Object.fromEntries(g.players.map((p) => [p.id, 0]));
      for (const x of g.extra) for (const k of ['bingo', 'bango', 'bongo'] as const) if (x?.[k]) pts[x[k]!] = (pts[x[k]!] ?? 0) + 1;
      return { rows: rank(g.players.map((p) => ({ id: p.id, name: p.name, points: pts[p.id], value: tr(`${pts[p.id]} pts`, `${pts[p.id]} Pkt.`) }))), money: settle(g, pts, stake(g)) };
    },
  },
  {
    id: 'vegas',
    name: () => 'Las Vegas',
    short: () => tr('Two against two, the two scores of a team make one number.', 'Zwei gegen zwei, die beiden Ergebnisse eines Teams ergeben eine Zahl.'),
    rules: () => [
      tr('Teams 1 & 2 against 3 & 4. The scores of a team form a number, the lower first: 4 and 5 = 45.', 'Teams 1 & 2 gegen 3 & 4. Die Ergebnisse eines Teams bilden eine Zahl, die kleinere zuerst: 4 und 5 = 45.'),
      tr('A score of 10 or more puts it first: 4 and 10 = 104.', 'Ein Ergebnis ab 10 kommt nach vorne: 4 und 10 = 104.'),
      tr('Birdie flip: a birdie turns the other team’s number round (45 becomes 54).', 'Birdie-Flip: ein Birdie dreht die Zahl des anderen Teams um (45 wird 54).'),
      tr('The difference is won in points.', 'Die Differenz wird in Punkten gewonnen.'),
    ],
    players: [4, 4],
    settings: [
      { key: 'flip', label: () => tr('Birdie flip', 'Birdie-Flip'), type: 'bool', default: true },
      { key: 'stake', label: () => tr('Stake per point', 'Einsatz je Punkt'), type: 'stake', default: 0.1 },
    ],
    standing: (g) => {
      const T = [[g.players[0].id, g.players[1].id], [g.players[2].id, g.players[3].id]];
      let diff = 0;
      g.holes.forEach((h, i) => {
        if (!played(g, i)) return;
        const sc = T.map((t) => t.map((id) => g.scores[id][i]!));
        const num = (s: number[]) => {
          const [a, b] = s.slice().sort((x, y) => x - y);
          return b >= 10 ? Number(`${b}${a}`) : Number(`${a}${b}`);
        };
        const flipped = (s: number[]) => {
          const [a, b] = s.slice().sort((x, y) => x - y);
          return Number(`${b}${a}`);
        };
        let n = sc.map(num);
        if (g.settings.flip !== false) {
          const birdie = sc.map((s) => s.some((v) => v < h.par));
          if (birdie[0] && !birdie[1]) n = [n[0], flipped(sc[1])];
          if (birdie[1] && !birdie[0]) n = [flipped(sc[0]), n[1]];
        }
        diff += n[1] - n[0]; // + team A ahead (lower number wins)
      });
      const name2 = (t: string[]) => t.map((id) => name(g, id)).join(' & ');
      const money: Record<string, number> = Object.fromEntries(g.players.map((p) => [p.id, 0]));
      for (const id of T[0]) money[id] += diff * stake(g);
      for (const id of T[1]) money[id] -= diff * stake(g);
      return {
        rows: [
          { id: 'A', name: name2(T[0]), points: diff, value: tr(`${diff >= 0 ? '+' : ''}${diff} pts`, `${diff >= 0 ? '+' : ''}${diff} Pkt.`) },
          { id: 'B', name: name2(T[1]), points: -diff, value: tr(`${-diff >= 0 ? '+' : ''}${-diff} pts`, `${-diff >= 0 ? '+' : ''}${-diff} Pkt.`) },
        ].sort((a, b) => b.points - a.points),
        money,
      };
    },
  },
  {
    id: 'sixes',
    name: () => tr('Sixes (round robin)', 'Sixes (Round Robin)'),
    short: () => tr('Four players, new partners every six holes.', 'Vier Spieler, alle sechs Löcher neue Partner.'),
    rules: () => [
      tr('Holes 1–6: 1 & 2 against 3 & 4; holes 7–12: 1 & 3 against 2 & 4; holes 13–18: 1 & 4 against 2 & 3.', 'Loch 1–6: 1 & 2 gegen 3 & 4; Loch 7–12: 1 & 3 gegen 2 & 4; Loch 13–18: 1 & 4 gegen 2 & 3.'),
      tr('Each six is a better-ball match; the winners get one point each.', 'Jede Sechser-Runde ist ein Bestball-Lochspiel; die Sieger bekommen je einen Punkt.'),
      tr('9 holes: three matches of three holes.', '9 Löcher: drei Spiele à drei Löcher.'),
    ],
    players: [4, 4],
    settings: [NET, { key: 'stake', label: () => tr('Stake per point', 'Einsatz je Punkt'), type: 'stake', default: 2 }],
    standing: (g) => {
      const ids = g.players.map((p) => p.id);
      const pairs = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
      const seg = Math.ceil(g.holes.length / 3);
      const pts: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
      const lines: string[] = [];
      pairs.forEach(([a, b], k) => {
        const A = a.map((j) => ids[j]);
        const B = b.map((j) => ids[j]);
        const res = g.holes.slice(k * seg, (k + 1) * seg).map((_, j) => holeWinner(best(g, A, k * seg + j), best(g, B, k * seg + j)));
        const m = matchText(res, A.map((id) => name(g, id)).join(' & '), B.map((id) => name(g, id)).join(' & '));
        lines.push(`${k * seg + 1}–${Math.min(g.holes.length, (k + 1) * seg)}: ${m.text}`);
        if (res.every((r) => r != null) && m.diff) for (const id of m.diff > 0 ? A : B) pts[id] += 1;
      });
      return { rows: rank(g.players.map((p) => ({ id: p.id, name: p.name, points: pts[p.id], value: tr(`${pts[p.id]} pts`, `${pts[p.id]} Pkt.`) }))), status: lines.join(' · '), money: settle(g, pts, stake(g)) };
    },
  },
  {
    id: 'snake',
    name: () => 'Snake',
    short: () => tr('Whoever three-putts takes the snake – the last one pays.', 'Wer dreiputtet, bekommt die Schlange – der Letzte zahlt.'),
    rules: () => [
      tr('A three-putt (or more) takes the snake.', 'Ein Dreiputt (oder mehr) holt die Schlange.'),
      tr('Every three-putt makes the snake longer: the pot grows by the stake.', 'Jeder Dreiputt macht die Schlange länger: der Topf wächst um den Einsatz.'),
      tr('Whoever holds the snake after the last hole pays the pot to each of the others.', 'Wer nach dem letzten Loch die Schlange hat, zahlt den Topf an jeden der anderen.'),
    ],
    players: [2, 4],
    input: 'snake',
    settings: [{ key: 'stake', label: () => tr('Stake per three-putt', 'Einsatz je Dreiputt'), type: 'stake', default: 1 }],
    standing: (g) => {
      let holder: string | null = null;
      let length = 0;
      const count: Record<string, number> = Object.fromEntries(g.players.map((p) => [p.id, 0]));
      for (const x of g.extra) for (const id of x?.threePutt ?? []) {
        holder = id;
        length++;
        count[id]++;
      }
      const money: Record<string, number> = Object.fromEntries(g.players.map((p) => [p.id, 0]));
      if (holder) for (const p of g.players) if (p.id !== holder) {
        money[p.id] += length * stake(g);
        money[holder] -= length * stake(g);
      }
      return {
        rows: g.players
          .map((p) => ({ id: p.id, name: p.name, points: p.id === holder ? -100 : -count[p.id], value: p.id === holder ? tr('🐍 holds the snake', '🐍 hat die Schlange') : tr(`${count[p.id]}× three-putt`, `${count[p.id]}× Dreiputt`) }))
          .sort((a, b) => b.points - a.points),
        status: holder ? tr(`Snake: ${name(g, holder)} · length ${length}`, `Schlange: ${name(g, holder)} · Länge ${length}`) : tr('No snake yet', 'Noch keine Schlange'),
        money,
      };
    },
  },
  {
    id: 'dots',
    name: () => tr('Dots (junk)', 'Dots (Punktejagd)'),
    short: () => tr('Points for the good moments: birdie, sandy, greenie, chip-in …', 'Punkte für die guten Momente: Birdie, Sandy, Greenie, Chip-in …'),
    rules: () => [
      tr('Birdie 1, eagle 2 – counted by itself from the score.', 'Birdie 1, Eagle 2 – zählt die App selbst aus dem Score.'),
      tr('Sandy: par or better after a bunker shot. Greenie: on a par 3 on the green with the tee shot, closest to the pin, and par.', 'Sandy: Par oder besser nach einem Bunkerschlag. Greenie: am Par 3 mit dem Abschlag aufs Grün, am nächsten zur Fahne und Par.'),
      tr('Chip-in and one-putt from more than 10 m: one dot each.', 'Chip-in und Ein-Putt aus mehr als 10 m: je ein Punkt.'),
    ],
    players: [2, 4],
    input: 'dots',
    settings: [{ key: 'stake', label: () => tr('Stake per dot', 'Einsatz je Punkt'), type: 'stake', default: 0.5 }],
    standing: (g) => {
      const pts: Record<string, number> = Object.fromEntries(g.players.map((p) => [p.id, 0]));
      g.holes.forEach((h, i) => {
        for (const p of g.players) {
          const v = g.scores[p.id]?.[i];
          if (v != null) pts[p.id] += v === h.par - 1 ? 1 : v <= h.par - 2 ? 2 : 0;
          pts[p.id] += g.extra[i]?.dots?.[p.id]?.length ?? 0;
        }
      });
      return { rows: rank(g.players.map((p) => ({ id: p.id, name: p.name, points: pts[p.id], value: tr(`${pts[p.id]} dots`, `${pts[p.id]} Punkte`) }))), money: settle(g, pts, stake(g)) };
    },
  },
  {
    id: 'stableford',
    name: () => tr('Stableford duel', 'Stableford-Duell'),
    short: () => tr('Classic Stableford points, everyone against everyone.', 'Klassische Stableford-Punkte, jeder gegen jeden.'),
    rules: () => [
      tr('Net par 2 points, net birdie 3, net bogey 1, worse 0.', 'Netto-Par 2 Punkte, Netto-Birdie 3, Netto-Bogey 1, schlechter 0.'),
      tr('Most points win; with a stake everyone settles the differences.', 'Die meisten Punkte gewinnen; mit Einsatz rechnet jeder die Differenzen ab.'),
    ],
    players: [2, 4],
    settings: [{ key: 'stake', label: () => tr('Stake per point', 'Einsatz je Punkt'), type: 'stake', default: 0.5 }],
    standing: (g) => {
      const pts: Record<string, number> = {};
      const rows = g.players.map((p) => {
        const rec = received(g.holes, p.hcp);
        let s = 0;
        g.holes.forEach((h, i) => {
          const v = g.scores[p.id]?.[i];
          if (v != null) s += Math.max(0, h.par + rec[i] - v + 2);
        });
        pts[p.id] = s;
        return { id: p.id, name: p.name, points: s, value: tr(`${s} pts`, `${s} Pkt.`) };
      });
      return { rows: rank(rows), money: settle(g, pts, stake(g)) };
    },
  },
  {
    id: 'match',
    name: () => tr('Match play', 'Lochspiel'),
    short: () => tr('One against one (or best ball two against two), hole by hole.', 'Einer gegen einen (oder Bestball zwei gegen zwei), Loch für Loch.'),
    rules: () => [
      tr('Every hole is won, lost or halved – the lower (net) score wins it.', 'Jedes Loch wird gewonnen, verloren oder geteilt – das bessere (Netto-)Ergebnis gewinnt.'),
      tr('Over when one side leads by more holes than are left (e.g. 3&2).', 'Vorbei, wenn eine Seite mit mehr Löchern führt als noch zu spielen sind (z. B. 3&2).'),
      tr('Four players: 1 & 2 against 3 & 4, the better ball counts.', 'Vier Spieler: 1 & 2 gegen 3 & 4, der bessere Ball zählt.'),
    ],
    players: [2, 4],
    counts: [2, 4],
    settings: [NET, { key: 'stake', label: () => tr('Stake for the match', 'Einsatz für das Spiel'), type: 'stake', default: 5 }],
    standing: (g) => {
      const four = g.players.length === 4;
      const A = four ? [g.players[0].id, g.players[1].id] : [g.players[0].id];
      const B = four ? [g.players[2].id, g.players[3].id] : [g.players[1].id];
      const nA = A.map((id) => name(g, id)).join(' & ');
      const nB = B.map((id) => name(g, id)).join(' & ');
      const res = g.holes.map((_, i) => holeWinner(best(g, A, i), best(g, B, i)));
      const m = matchText(res, nA, nB);
      const left = res.filter((r) => r == null).length;
      const over = Math.abs(m.diff) > left;
      const status = over && m.diff ? tr(`${m.diff > 0 ? nA : nB} wins ${Math.abs(m.diff)}${left ? `&${left}` : ' up'}`, `${m.diff > 0 ? nA : nB} gewinnt ${Math.abs(m.diff)}${left ? `&${left}` : ' auf'}`) : m.text;
      const money: Record<string, number> = Object.fromEntries(g.players.map((p) => [p.id, 0]));
      if (over && m.diff) {
        for (const id of A) money[id] += Math.sign(m.diff) * stake(g);
        for (const id of B) money[id] -= Math.sign(m.diff) * stake(g);
      }
      const won = (s: number) => res.filter((r) => r === s).length;
      return {
        rows: [
          { id: 'A', name: nA, points: m.diff, value: tr(`${won(1)} won`, `${won(1)} gewonnen`) },
          { id: 'B', name: nB, points: -m.diff, value: tr(`${won(-1)} won`, `${won(-1)} gewonnen`) },
        ].sort((a, b) => b.points - a.points),
        status,
        money,
      };
    },
  },
];

export const formDef = (id: FormId): FormDef => FORMS.find((f) => f.id === id)!;
export const formatEuro = euro;
export const holesPlayed = holesDone;

/** Who pays whom: the fewest payments that settle the balances (largest debt to largest win first). */
export function transfers(money: Record<string, number>): { from: string; to: string; amount: number }[] {
  const cents = Object.entries(money).map(([id, v]) => ({ id, v: Math.round(v * 100) }));
  const pay = cents.filter((x) => x.v < 0).sort((a, b) => a.v - b.v);
  const get = cents.filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  const out: { from: string; to: string; amount: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < pay.length && j < get.length) {
    const amt = Math.min(-pay[i].v, get[j].v);
    if (amt > 0) out.push({ from: pay[i].id, to: get[j].id, amount: amt / 100 });
    pay[i].v += amt;
    get[j].v -= amt;
    if (!pay[i].v) i++;
    if (!get[j].v) j++;
  }
  return out;
}

/** Players per side for the team forms (shown in the setup and the standing). */
export function sidesOf(form: FormId, n: number): [number[], number[]] | null {
  if (form === 'vegas' || ((form === 'nassau' || form === 'match') && n === 4)) return [[0, 1], [2, 3]];
  return null;
}

export const fitsPlayers = (f: FormDef, n: number): boolean => (f.counts ? f.counts.includes(n) : n >= f.players[0] && n <= f.players[1]);
export const playersText = (f: FormDef): string =>
  f.counts ? f.counts.join(tr(' or ', ' oder ')) + tr(' players', ' Spieler') : f.players[0] === f.players[1] ? `${f.players[0]}${tr(' players', ' Spieler')}` : `${f.players[0]}–${f.players[1]}${tr(' players', ' Spieler')}`;

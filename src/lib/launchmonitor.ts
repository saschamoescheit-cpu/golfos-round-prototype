import type { Club } from '../types';

// Launch monitor data (Sascha 25.10.2026: "carry distances backed by measured launch monitor data, better spread
// ellipses"). No maker offers an open API to players (Trackman only to partners under contract); every one exports a
// session as a CSV file – Trackman (Performance Studio), Foresight (FSX), Garmin Golf (Approach R10/R50), Rapsodo
// (R-Cloud), SkyTrak, FlightScope, Uneekor. The columns differ by maker and language, so they are found by their names:
// the club, the carry, the carry's distance off the line; units from the header or a units row, else asked.

export interface LmShot {
  club: Club;
  /** metres */
  carry: number;
  /** metres off the target line at the carry, − left / + right; null when the file has none */
  side: number | null;
}
export interface LmImport {
  /** the maker the columns point to, or "CSV" */
  source: string;
  /** the unit of the file's distances – "yd" or "m" – and whether the file said so */
  unit: 'yd' | 'm';
  unitSure: boolean;
  shots: LmShot[];
  /** rows with a club name the app does not know, or without a carry */
  skipped: number;
  /** club names that could not be matched (shown so the player knows) */
  unknownClubs: string[];
}
export interface LmClub {
  club: Club;
  shots: number;
  /** median carry, metres */
  carry: number;
  /** 80 % of the carries around the median (−/+ metres) */
  len: { lo: number; hi: number };
  /** 80 % of the balls off the line, metres (− left / + right); null without side data */
  side: { lo: number; hi: number } | null;
}
export interface LmData {
  importedAt: string;
  source: string;
  file: string;
  clubs: LmClub[];
}

const YD = 0.9144;

/** One CSV line into cells – quotes, doubled quotes, any of , ; tab as separator. */
export function cells(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

/** A number as launch monitors write it: "152.3", "152,3", "12.4 L", "R 3.1", "-5.2", "152.3 yds". */
export function num(raw: string | undefined): number | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (!s) return null;
  const m = /-?\d+(?:[.,]\d+)?/.exec(s);
  if (!m) return null;
  let v = Number(m[0].replace(',', '.'));
  if (!Number.isFinite(v)) return null;
  // left/right as a letter: left is negative
  if (/(^|[^a-z])l(eft|inks)?([^a-z]|$)/i.test(s.replace(m[0], ' ')) && v > 0) v = -v;
  return v;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** The app's club for a launch monitor's name: "Driver", "3 Wood", "7 Iron", "7i", "Eisen 7", "Pitching Wedge", "56°" … */
export function clubOf(name: string): Club | null {
  const s = norm(name).replace(/\s+/g, ''); // "7 Iron" → "7iron", "Eisen 7" → "eisen7", "Pitching Wedge" → "pitchingwedge"
  if (!s) return null;
  if (/^(dr|driver|1w|1wood|holz1)$/.test(s) || s.includes('driver')) return 'Dr';
  if (/putter|^pt$/.test(s)) return 'Pt';
  const wood = /^(\d)(w|wood|fw|fairway|fairwaywood|holz)$|^(wood|holz|fw)(\d)$/.exec(s);
  if (wood) {
    const n = Number(wood[1] ?? wood[4]);
    return n === 3 ? '3W' : n === 4 ? '4W' : n === 5 ? '5W' : n === 7 ? '7W' : n === 9 ? '9W' : null;
  }
  const hyb = /^(\d)(h|hy|hyb|hybrid|rescue)$|^(h|hy|hybrid|rescue)(\d)$/.exec(s);
  if (hyb) {
    const n = Number(hyb[1] ?? hyb[4]);
    return n === 2 ? '2H' : n === 3 ? '3H' : n === 4 ? 'Hy' : n === 5 ? '5H' : n === 6 ? '6H' : null;
  }
  const iron = /^(\d)(i|iron|eisen)$|^(i|iron|eisen)(\d)$/.exec(s);
  if (iron) {
    const n = Number(iron[1] ?? iron[4]);
    return n >= 2 && n <= 9 ? (`${n}i` as Club) : null;
  }
  if (/^(pw|p|pitching|pitchingwedge|pitch|pitchwedge|wedgep)$/.test(s)) return 'PW';
  if (/^(gw|aw|uw|gap|gapwedge|approach|approachwedge|attackwedge|utilitywedge)$/.test(s)) return 'GW';
  if (/^(sw|sand|sandwedge)$/.test(s)) return 'SW';
  if (/^(lw|lob|lobwedge)$/.test(s)) return 'LW';
  // a wedge by its loft: 46–48° pitching, 50–54° gap, 55–57° sand, 58° and more lob
  const loft = /^(?:wedge)?(\d{2})(?:deg|grad|°)?(?:wedge)?$/.exec(s.replace('°', ''));
  if (loft) {
    const d = Number(loft[1]);
    return d >= 44 && d <= 48 ? 'PW' : d <= 54 && d > 48 ? 'GW' : d <= 57 && d > 54 ? 'SW' : d >= 58 && d <= 64 ? 'LW' : null;
  }
  return null;
}

type Col = { i: number; h: string };
/** The columns by their names – the carry, its distance off the line, the club. */
function columns(head: string[]): { club: Col | null; carry: Col | null; side: Col | null } {
  const h = head.map((x, i) => ({ i, h: norm(x) }));
  const isSide = (s: string) => /side|offline|lateral|deviation|abweichung|seit|links rechts|left right|dispersion/.test(s);
  const carry =
    h.find((c) => /^carry( distance| dist| flat)?( yds| yards| m| meters| metres)?$/.test(c.h)) ??
    h.find((c) => /carry|tragweite|flugweite/.test(c.h) && !isSide(c.h) && !/angle|time|winkel|height|apex/.test(c.h)) ??
    null;
  // off the line: the carry's first (where the ball landed), else any lateral distance – not an angle
  const sides = h.filter((c) => isSide(c.h) && !/angle|winkel|spin|deg/.test(c.h));
  const side = sides.find((c) => /carry/.test(c.h)) ?? sides.find((c) => !/total|gesamt/.test(c.h)) ?? sides[0] ?? null;
  const club =
    h.find((c) => /^(club|club name|club type|schläger|schlaeger|clubtype|club model)$/.test(c.h)) ??
    h.find((c) => /club|schläger/.test(c.h) && !/speed|path|face|angle|head|brand|loft/.test(c.h)) ??
    null;
  return { club, carry, side };
}

function makerOf(head: string[], text: string): string {
  const all = `${head.join(' ')} ${text.slice(0, 400)}`.toLowerCase();
  if (/trackman/.test(all)) return 'Trackman';
  if (/foresight|fsx|gcquad|gc3/.test(all)) return 'Foresight';
  if (/rapsodo|mlm2/.test(all)) return 'Rapsodo';
  if (/skytrak/.test(all)) return 'SkyTrak';
  if (/flightscope|mevo/.test(all)) return 'FlightScope';
  if (/uneekor/.test(all)) return 'Uneekor';
  if (/carry deviation distance|garmin|approach r10|r50/.test(all)) return 'Garmin';
  return 'CSV';
}

/** Reads a launch monitor's CSV export. */
export function parseLaunchCsv(text: string, forceUnit?: 'yd' | 'm'): LmImport {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() && !/^sep=/.test(l.trim()));
  const sepOf = (l: string) => ([';', '\t', ','] as const).map((c) => ({ c, n: cells(l, c).length })).sort((a, b) => b.n - a.n)[0].c;
  // the header: the first line that names a carry and a club (title lines and settings may stand above it)
  let hi = -1;
  let sep = ',';
  let cols: ReturnType<typeof columns> = { club: null, carry: null, side: null };
  for (let k = 0; k < Math.min(lines.length, 30); k++) {
    const s = sepOf(lines[k]);
    const c = columns(cells(lines[k], s));
    if (c.carry && c.club) {
      hi = k;
      sep = s;
      cols = c;
      break;
    }
  }
  const empty: LmImport = { source: 'CSV', unit: forceUnit ?? 'yd', unitSure: !!forceUnit, shots: [], skipped: 0, unknownClubs: [] };
  if (hi < 0) return empty;
  const head = cells(lines[hi], sep);
  // the unit: in the carry's header ("Carry (yds)", "[m]"), in a units row under it, or asked
  const unitFrom = (s: string): 'yd' | 'm' | null => (/\b(yds?|yards?)\b|\[yds?\]/i.test(s) ? 'yd' : /\[m\]|\(m\)|\bmeters?\b|\bmetres?\b|\bmeter\b|\bm\b/i.test(s) ? 'm' : null);
  let unit: 'yd' | 'm' | null = forceUnit ?? unitFrom(head[cols.carry!.i] ?? '');
  let first = hi + 1;
  const next = lines[first] ? cells(lines[first], sep) : [];
  if (next.length && num(next[cols.carry!.i]) == null) {
    unit = unit ?? unitFrom(next[cols.carry!.i] ?? '');
    first++;
  }
  const unitSure = unit != null;
  const raw: { club: string; carry: number; side: number | null }[] = [];
  let skipped = 0;
  for (const line of lines.slice(first)) {
    const c = cells(line, sep);
    const carry = num(c[cols.carry!.i]);
    const name = c[cols.club!.i] ?? '';
    if (carry == null || carry <= 0 || !name) {
      skipped++;
      continue;
    }
    raw.push({ club: name, carry, side: cols.side ? num(c[cols.side.i]) : null });
  }
  // no unit anywhere: the US makers' default is yards – a driver over 280 or a 7-iron over 200 would be metres only by mistake
  if (!unit) unit = 'yd';
  const k = unit === 'yd' ? YD : 1;
  const unknown = new Set<string>();
  const shots: LmShot[] = [];
  for (const r of raw) {
    const club = clubOf(r.club);
    if (!club || club === 'Pt') {
      unknown.add(r.club);
      skipped++;
      continue;
    }
    shots.push({ club, carry: Math.round(r.carry * k * 10) / 10, side: r.side == null ? null : Math.round(r.side * k * 10) / 10 });
  }
  return { source: makerOf(head, text), unit, unitSure, shots, skipped, unknownClubs: [...unknown] };
}

const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo);
};

/** Per club: the median carry and where 80 % of the balls end – the clear mishits (under 60 % of the median) left out. */
export function summarize(shots: LmShot[]): LmClub[] {
  const by = new Map<Club, LmShot[]>();
  for (const s of shots) by.set(s.club, [...(by.get(s.club) ?? []), s]);
  const out: LmClub[] = [];
  for (const [club, xs] of by) {
    const med0 = quantile(xs.map((x) => x.carry), 0.5);
    const good = xs.filter((x) => x.carry >= 0.6 * med0);
    if (!good.length) continue;
    const carries = good.map((x) => x.carry);
    const med = quantile(carries, 0.5);
    const sides = good.map((x) => x.side).filter((v): v is number => v != null);
    out.push({
      club,
      shots: good.length,
      carry: Math.round(med),
      len: { lo: Math.round(quantile(carries, 0.1) - med), hi: Math.round(quantile(carries, 0.9) - med) },
      side: sides.length >= 3 ? { lo: Math.round(quantile(sides, 0.1)), hi: Math.round(quantile(sides, 0.9)) } : null,
    });
  }
  const order: Club[] = ['Dr', '3W', '4W', '5W', '7W', '9W', '2H', '3H', 'Hy', '5H', '6H', '2i', '3i', '4i', '5i', '6i', '7i', '8i', '9i', 'PW', 'GW', 'SW', 'LW'];
  return out.sort((a, b) => order.indexOf(a.club) - order.indexOf(b.club));
}

// ---------- kept on the phone (and synced like the bag) ----------

const KEY = 'golfos.launch.v1';
export function loadLaunch(): LmData | null {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? 'null') as LmData | null;
    return d && Array.isArray(d.clubs) ? d : null;
  } catch {
    return null;
  }
}
export function saveLaunch(d: LmData | null): void {
  try {
    if (d) localStorage.setItem(KEY, JSON.stringify(d));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage full or blocked */
  }
}
/** A club's launch monitor data when it rests on enough shots to say something about the spread. */
export const LM_SPREAD_FROM = 5;
export function launchFor(club: Club, d: LmData | null = loadLaunch()): LmClub | null {
  return d?.clubs.find((c) => c.club === club && c.shots >= LM_SPREAD_FROM) ?? null;
}

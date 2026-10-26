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
  // what else the device measured (Sascha 26.10.2026, the "Range-Sitzung" page) – each only when the file has it
  /** when the shot was hit, local time "2025-11-15T22:09:37" */
  at?: string;
  /** metres */
  total?: number;
  apex?: number;
  /** km/h */
  clubSpeed?: number;
  ballSpeed?: number;
  smash?: number;
  /** degrees: attack angle, club path, face to the target, face to the path (+ open/right) */
  attack?: number;
  path?: number;
  face?: number;
  faceToPath?: number;
  /** degrees: launch angle up, launch direction (+ right), the carry's angle off the line (+ right) */
  launch?: number;
  dir?: number;
  sideAngle?: number;
  /** revolutions per minute */
  spin?: number;
  /** °C */
  temp?: number;
  /** seconds, and their ratio */
  backSec?: number;
  downSec?: number;
  tempo?: number;
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
  /** the day of the session it comes from (from the file), and that session */
  measuredAt?: string | null;
  session?: string;
}
/** One imported file: its shots as measured (in metres and km/h), for the session's own page. */
export interface LmSession {
  id: string;
  source: string;
  file: string;
  importedAt: string;
  /** the first shot's time from the file; null when the file has no dates */
  measuredAt: string | null;
  shots: LmShot[];
}
export interface LmData {
  importedAt: string;
  source: string;
  file: string;
  /** per club the values in use – a newer session's club replaces an older one's only when the player says so */
  clubs: LmClub[];
  /** every session imported (Sascha 26.10.2026: "new sessions add to the old ones") */
  sessions?: LmSession[];
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
  // not measured: Foresight writes 16777215 (0xFFFFFF), others FLT_MAX – no value, not a giant one
  if (!Number.isFinite(v) || Math.abs(v) >= 1e6) return null;
  // left/right as a letter: left is negative
  if (/(^|[^a-z])l(eft|inks)?([^a-z]|$)/i.test(s.replace(m[0], ' ')) && v > 0) v = -v;
  return v;
}

/** Lower case, without accents and umlauts ("Schlägerart" → "schlagerart", "Híbrido" → "hibrido"), without the invisible
 *  spaces some exports carry ("Dist.​vuelo"), anything else a space. */
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ​-‍﻿]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** The app's club for a launch monitor's name: "Driver", "3 Wood", "7 Iron", "7i", "Eisen 7", "Pitching Wedge", "56°" … */
export function clubOf(name: string): Club | null {
  const s = norm(name).replace(/\s+/g, ''); // "7 Iron" → "7iron", "Eisen 7" → "eisen7", "Pitching Wedge" → "pitchingwedge"
  if (!s) return null;
  if (/^(dr|driver|1w|1wood|holz1)$/.test(s) || s.includes('driver')) return 'Dr';
  if (/putter|^pt$/.test(s)) return 'Pt';
  const wood = /^(\d)(w|wood|fw|fairway|fairwaywood|holz|madera|hout)$|^(wood|holz|fw|madera|hout)(\d)$/.exec(s);
  if (wood) {
    const n = Number(wood[1] ?? wood[4]);
    return n === 3 ? '3W' : n === 4 ? '4W' : n === 5 ? '5W' : n === 7 ? '7W' : n === 9 ? '9W' : null;
  }
  const hyb = /^(\d)(h|hy|hyb|hybrid|rescue|hibrido)$|^(h|hy|hybrid|rescue|hibrido)(\d)$/.exec(s);
  if (hyb) {
    const n = Number(hyb[1] ?? hyb[4]);
    return n === 2 ? '2H' : n === 3 ? '3H' : n === 4 ? 'Hy' : n === 5 ? '5H' : n === 6 ? '6H' : null;
  }
  const iron = /^(\d)(i|iron|eisen|hierro|ijzer)$|^(i|iron|eisen|hierro|ijzer)(\d)$/.exec(s);
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
/**
 * The columns by their names – the carry, its distance off the line, the club – in English, German, Spanish and Dutch
 * (Garmin exports in the phone's language: "Carry-Distanz", "Carry-Abweichungsdistanz", "Schlägerart"; "Dist. vuelo",
 * "Tipo de palo"; "Carry-afstand", "Type club" – as the open R10Progress project reads them, 26.10.2026).
 */
function columns(head: string[]): { clubs: Col[]; carry: Col | null; side: Col | null } {
  const h = head.map((x, i) => ({ i, h: norm(x) }));
  const isSide = (s: string) => /side|offline|lateral|deviation|abweichung|seit|desviacion|afwijking|links rechts|left right|dispersion/.test(s);
  const carry =
    h.find((c) => /^carry( distance| dist| flat)?( yds| yards| m| meters| metres)?$/.test(c.h)) ??
    h.find((c) => /carry|tragweite|flugweite|vuelo/.test(c.h) && !isSide(c.h) && !/angle|time|winkel|height|apex|ziel|target|objetivo|doel/.test(c.h)) ??
    null;
  // off the line: the carry's first (where the ball landed), else any lateral distance – not an angle
  const sides = h.filter((c) => isSide(c.h) && !/angle|winkel|spin|deg|angulo|hoek/.test(c.h));
  const side = sides.find((c) => /carry|vuelo/.test(c.h)) ?? sides.find((c) => !/total|gesamt|totale/.test(c.h)) ?? sides[0] ?? null;
  // the club: its type first ("Driver", "7 Iron"), then its name – Garmin leaves the name empty or puts the model there
  const kind = (c: Col) => /^(club type|clubtype|type club|schlagerart|tipo de palo|club)$/.test(c.h);
  const named = (c: Col) => /^(club name|club model|schlagername|schlager|schlaeger|clubnaam|nombre del palo|palo)$/.test(c.h);
  const other = (c: Col) => /club|schlager|palo/.test(c.h) && !/speed|path|face|angle|head|brand|loft|snelh|gsch|marke|velocidad|cara/.test(c.h);
  const clubs = [...h.filter(kind), ...h.filter(named), ...h.filter((c) => !kind(c) && !named(c) && other(c))];
  return { clubs, carry, side };
}

type Extra = Exclude<keyof LmShot, 'club' | 'carry' | 'side' | 'at'>;
/**
 * The other measurements by their column names – Garmin (English and German, as the R10 exports them), Trackman, Foresight
 * (FSX), Rapsodo, SkyTrak. The more exact names first; a field takes the first column that fits.
 */
const EXTRAS: [Extra, RegExp][] = [
  ['clubSpeed', /^(club speed|club head speed|clubhead speed|schl gsch|schlagergeschwindigkeit|schlagerkopfgeschwindigkeit|velocidad del palo|clubsnelheid)\b/],
  ['ballSpeed', /^(ball speed|ballgeschwindigkeit|velocidad de la bola|balsnelheid)\b/],
  ['smash', /^(smash factor|smash|efficiency)\b/],
  ['attack', /^(attack angle|angle of attack|aoa|anstellwinkel|angulo de ataque|aanvalshoek)\b/],
  ['faceToPath', /^(face to path|schlagflachenstellung|cara a trayectoria|face naar baan)\b/],
  ['path', /^(club path|schwungbahn|trayectoria del palo|clubbaan)\b/],
  ['face', /^(face angle|club face|face to target|schlagflache|cara del palo|clubface)\b/],
  ['launch', /^(launch angle|vla|vertical launch|abflugwinkel|angulo de salida|lanceerhoek)\b/],
  ['dir', /^(launch direction|hla|horizontal launch|azimuth|abflugrichtung|direccion de salida|lanceerrichting)\b/],
  ['spin', /^(spin rate|total spin|drehrate|velocidad de giro|spinrate)\b/],
  ['spin', /^(backspin|back spin)\b/],
  ['apex', /^(apex height|apex|peak height|max height|height|hohe des scheitelpunkts|scheitelpunkt|altura maxima|altura|hoogte)\b/],
  ['total', /^(total distance|total|gesamtstrecke|gesamtdistanz|distancia total|totale afstand)( yds| yards| m)?$/],
  ['sideAngle', /^(carry deviation angle|carry abweichungswinkel|angulo de desviacion de vuelo|carry afwijkingshoek|carry side angle)\b/],
  ['temp', /^(temperature|temperatur|temperatura|temp)\b/],
  ['backSec', /^(backswing time|ruckschw zeit|ruckschwungzeit|tiempo de backswing)\b/],
  ['downSec', /^(downswing time|durchschw zeit|abschwungzeit|tiempo de downswing)\b/],
  ['tempo', /^(swing tempo|schwungtempo|tempo)\b/],
];
const DATE = /^(date|datum|fecha|timestamp|datetime|date time|datum tijd)$/;

/** A shot's time as the devices write it: "2025-11-15 22:09", "15.11.25 22:09:37" (German Garmin), "10/25/26 9:00 AM". */
export function whenOf(raw: string | undefined): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  const two = (n: number) => String(n).padStart(2, '0');
  const year = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));
  let d: number, m: number, y: number;
  let rest = '';
  let hit = /^(\d{4})-(\d{1,2})-(\d{1,2})(.*)$/.exec(s);
  if (hit) [y, m, d, rest] = [Number(hit[1]), Number(hit[2]), Number(hit[3]), hit[4]];
  else if ((hit = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})(.*)$/.exec(s))) [d, m, y, rest] = [Number(hit[1]), Number(hit[2]), year(hit[3]), hit[4]];
  else if ((hit = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(.*)$/.exec(s))) {
    // US order unless the first number cannot be a month
    const a = Number(hit[1]);
    const b = Number(hit[2]);
    [m, d] = a > 12 ? [b, a] : [a, b];
    y = year(hit[3]);
    rest = hit[4];
  } else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const t = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i.exec(rest);
  let h = t ? Number(t[1]) : 0;
  if (t?.[4]) h = (h % 12) + (/pm/i.test(t[4]) ? 12 : 0);
  return `${y}-${two(m)}-${two(d)}T${two(h)}:${two(t ? Number(t[2]) : 0)}:${two(t?.[3] ? Number(t[3]) : 0)}`;
}

function makerOf(head: string[], text: string): string {
  const all = `${head.join(' ')} ${text.slice(0, 400)}`.toLowerCase();
  if (/trackman/.test(all)) return 'Trackman';
  if (/foresight|fsx|gcquad|gc3/.test(all)) return 'Foresight';
  if (/rapsodo|mlm2/.test(all)) return 'Rapsodo';
  if (/skytrak/.test(all)) return 'SkyTrak';
  if (/flightscope|mevo/.test(all)) return 'FlightScope';
  if (/uneekor/.test(all)) return 'Uneekor';
  if (/carry deviation distance|carry-abweichungsdistanz|carry-afwijkingsafstand|desviación de vuelo|garmin|approach r10|r50/.test(all)) return 'Garmin';
  // by their own columns when the file does not name them (Sascha 26.10.2026: Trackman and Foresight exports to come)
  const cols = head.map(norm).join('|');
  const has = (names: string) => new RegExp(`(^|\\|)(${names})( yds| yards| m| ft| deg| mph| rpm)?(\\||$)`).test(cols);
  if (has('dyn loft|spin loft|swing plane|swing direction|land angle|carry side')) return 'Trackman';
  if (has('azimuth|efficiency|face to target|descent angle|angle of attack')) return 'Foresight';
  return 'CSV';
}

/** Reads a launch monitor's CSV export. */
export function parseLaunchCsv(text: string, forceUnit?: 'yd' | 'm'): LmImport {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() && !/^sep=/.test(l.trim()));
  const sepOf = (l: string) => ([';', '\t', ','] as const).map((c) => ({ c, n: cells(l, c).length })).sort((a, b) => b.n - a.n)[0].c;
  // the header: the first line that names a carry and a club (title lines and settings may stand above it)
  let hi = -1;
  let sep = ',';
  let cols: ReturnType<typeof columns> = { clubs: [], carry: null, side: null };
  for (let k = 0; k < Math.min(lines.length, 30); k++) {
    const s = sepOf(lines[k]);
    const c = columns(cells(lines[k], s));
    if (c.carry && c.clubs.length) {
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
  let unitsRow: string[] = [];
  if (next.length && num(next[cols.carry!.i]) == null) {
    unit = unit ?? unitFrom(next[cols.carry!.i] ?? '');
    unitsRow = next;
    first++;
  }
  const unitSure = unit != null;
  // the other measurements and the time, each in its own column
  const hn = head.map(norm);
  const extras = new Map<Extra, number>();
  const used = new Set<number>([cols.carry!.i, ...(cols.side ? [cols.side.i] : []), ...cols.clubs.map((c) => c.i)]);
  for (const [field, re] of EXTRAS) {
    if (extras.has(field)) continue;
    const i = hn.findIndex((h, k) => !used.has(k) && re.test(h));
    if (i >= 0) {
      extras.set(field, i);
      used.add(i);
    }
  }
  const dateCol = hn.findIndex((h) => DATE.test(h));
  const raw: { club: string; carry: number; side: number | null; c: string[] }[] = [];
  let skipped = 0;
  for (const line of lines.slice(first)) {
    const c = cells(line, sep);
    // summary rows (Rapsodo writes an "Average" per club, others "Mean", "Std. Dev.", "Total") are no shots
    if (c.some((x) => /^(average|avg\.?|mean|median|std\.?( ?dev\.?)?|standard deviation|total|summe|durchschnitt|mittelwert|promedio|gemiddelde)$/i.test(x.trim()))) {
      skipped++;
      continue;
    }
    const carry = num(c[cols.carry!.i]);
    // the first club column that names a club the app knows – else the first one with anything in it (reported)
    const names = cols.clubs.map((x) => (c[x.i] ?? '').trim()).filter(Boolean);
    const name = names.find((x) => clubOf(x)) ?? names[0] ?? '';
    if (carry == null || carry <= 0 || !name) {
      skipped++;
      continue;
    }
    raw.push({ club: name, carry, side: cols.side ? num(c[cols.side.i]) : null, c });
  }
  // no unit anywhere: exports in German, Spanish or Dutch come in metres (Garmin: km/h and metres), English ones in yards –
  // the player sees it and can switch
  if (!unit) unit = /distanz|abweichung|schlager|distancia|desviacion|palo|afstand|afwijking/.test(norm(head.join(' '))) ? 'm' : 'yd';
  const k = unit === 'yd' ? YD : 1;
  // each measurement's unit from its header or the units row: speeds to km/h, heights and distances to metres, °F to °C
  const unitText = (i: number) => `${head[i] ?? ''} ${unitsRow[i] ?? ''}`.toLowerCase();
  const speedK = (i: number) => (/km\/?h|kph/.test(unitText(i)) ? 1 : /m\/s/.test(unitText(i)) ? 3.6 : /mph/.test(unitText(i)) ? 1.609344 : unit === 'yd' ? 1.609344 : 1);
  const distK = (i: number) => (/\b(yds?|yards?)\b/.test(unitText(i)) ? YD : /\b(ft|feet)\b/.test(unitText(i)) ? 0.3048 : /\[m\]|\(m\)|\bm\b|meter|metre/.test(unitText(i)) ? 1 : k);
  const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
  const extraOf = (c: string[]): Partial<LmShot> => {
    const out: Partial<LmShot> = {};
    for (const [field, i] of extras) {
      const v = num(c[i]);
      if (v == null) continue;
      if (field === 'clubSpeed' || field === 'ballSpeed') out[field] = round(v * speedK(i), 1);
      else if (field === 'total' || field === 'apex') out[field] = round(v * distK(i), 1);
      else if (field === 'temp') out.temp = round(/°f|deg f|\bf\b|fahrenheit/.test(unitText(i)) ? ((v - 32) * 5) / 9 : v, 1);
      // Garmin writes the swing times in hundredths ("094" = 0.94 s)
      else if (field === 'backSec' || field === 'downSec') out[field] = round(v > 5 ? v / 100 : v, 2);
      else if (field === 'spin') out.spin = Math.round(Math.abs(v));
      else out[field] = round(v, 2);
    }
    if (dateCol >= 0) {
      const at = whenOf(c[dateCol]);
      if (at) out.at = at;
    }
    return out;
  };
  const unknown = new Set<string>();
  const shots: LmShot[] = [];
  for (const r of raw) {
    const club = clubOf(r.club);
    if (!club || club === 'Pt') {
      unknown.add(r.club);
      skipped++;
      continue;
    }
    shots.push({ club, carry: Math.round(r.carry * k * 10) / 10, side: r.side == null ? null : Math.round(r.side * k * 10) / 10, ...extraOf(r.c) });
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
  return out.sort((a, b) => ORDER.indexOf(a.club) - ORDER.indexOf(b.club));
}
const ORDER: Club[] = ['Dr', '3W', '4W', '5W', '7W', '9W', '2H', '3H', 'Hy', '5H', '6H', '2i', '3i', '4i', '5i', '6i', '7i', '8i', '9i', 'PW', 'GW', 'SW', 'LW'];

/** The session's day: its first shot's time from the file, or null when the file has no dates. */
export const measuredAtOf = (shots: LmShot[]): string | null => shots.map((s) => s.at).filter((t): t is string => !!t).sort()[0] ?? null;

/**
 * A club measured before and again in this session (Sascha 26.10.2026: "the newer one replaces the older – or the app
 * says so and the player decides"): the newer is proposed – a session without dates counts as the newest.
 */
export function proposeNew(old: LmClub, measuredAt: string | null): boolean {
  if (!measuredAt || !old.measuredAt) return true;
  return measuredAt >= old.measuredAt;
}

/** A new session added to what is kept: its clubs in, except those the player keeps from before; the session kept too. */
export function mergeLaunch(prev: LmData | null, session: LmSession, clubs: LmClub[], keepOld: Club[] = []): LmData {
  const byClub = new Map((prev?.clubs ?? []).map((c) => [c.club, c] as const));
  for (const c of clubs) if (!(byClub.has(c.club) && keepOld.includes(c.club))) byClub.set(c.club, { ...c, measuredAt: session.measuredAt, session: session.id });
  return {
    importedAt: session.importedAt,
    source: session.source,
    file: session.file,
    clubs: [...byClub.values()].sort((a, b) => ORDER.indexOf(a.club) - ORDER.indexOf(b.club)),
    sessions: [...(prev?.sessions ?? []), session],
  };
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

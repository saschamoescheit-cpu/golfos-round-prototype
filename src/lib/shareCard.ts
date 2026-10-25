import type { Round, RoundHole } from '../types';
import { fmtHcp, grossForHole, handicapStrokes, playerTotals, stablefordPoints } from './scoring';
import { playedHandicap } from './handicap';
import { teeName } from '../data/tees';
import { dec, getLang, tr } from './i18n';

// Feature 012: the scorecard of a round as a picture to send (WhatsApp, Instagram) – drawn on a canvas from the
// round's data, 1080 × 1350 (4:5), in the app's colours with the golf marks of the scorecard.

const C = {
  bg: '#0e1418', surface: '#18222a', surface2: '#222d35', line: '#2c3943', text: '#eef2ec', muted: '#9faea6',
  brand: '#9bc53d', bad: '#ff8a7f', dark: '#0e1418',
};
const DISPLAY = 'Lexend, "Segoe UI", system-ui, sans-serif';
const BODY = 'Figtree, "Segoe UI", system-ui, sans-serif';
const W = 1080;
const H = 1350;

export async function renderScorecard(round: Round): Promise<Blob> {
  await Promise.all([`700 40px ${DISPLAY}`, `400 40px ${DISPLAY}`, `700 40px ${BODY}`, `500 40px ${BODY}`].map((f) => document.fonts?.load(f).catch(() => null)));
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  const me = round.players.find((p) => p.isMe) ?? round.players[0];
  const entries = round.entries[me.id];
  const received = handicapStrokes(round.holes, me.playingHandicap);
  const t = playerTotals(round.holes, entries, me.playingHandicap);
  const putts = entries.some((e) => e.putts != null) ? entries.reduce((s, e) => s + (e.putts ?? 0), 0) : null;
  const ph = playedHandicap(round);

  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, H);
  const text = (s: string, x: number, y: number, font: string, colour = C.text, align: CanvasTextAlign = 'left') => {
    g.font = font;
    g.fillStyle = colour;
    g.textAlign = align;
    g.fillText(s, x, y);
  };

  // header
  text('GolfOS', 60, 92, `700 34px ${DISPLAY}`, C.brand);
  text(new Date(round.createdAt).toLocaleDateString(getLang() === 'de' ? 'de-DE' : undefined), W - 60, 92, `500 30px ${BODY}`, C.muted, 'right');
  let name = round.courseName;
  g.font = `700 54px ${DISPLAY}`;
  while (g.measureText(name).width > W - 120 && name.length > 4) name = name.slice(0, -2) + '…';
  text(name, 60, 172, `700 54px ${DISPLAY}`);
  const sub = [me.name, round.tee ? `${tr('tee', 'Abschlag')} ${teeName(round.tee)}` : null, me.playingHandicap != null ? `${tr('hcp', 'SV')} ${fmtHcp(me.playingHandicap)}` : null].filter(Boolean).join(' · ');
  text(sub, 60, 222, `500 30px ${BODY}`, C.muted);

  // totals
  roundRect(g, 60, 262, W - 120, 210, 28, C.surface);
  text(String(t.gross), 110, 410, `700 132px ${DISPLAY}`);
  const cells: [string, string][] = [
    [t.toPar === 0 ? 'Par' : t.toPar > 0 ? `+${t.toPar}` : String(t.toPar), tr('to par', 'zu Par')],
    ...(t.stableford != null ? [[String(t.stableford), 'Stableford'] as [string, string]] : []),
    ...(putts != null ? [[String(putts), 'Putts'] as [string, string]] : []),
  ];
  const cw = (W - 120 - 330) / cells.length;
  cells.forEach(([v, l], i) => {
    const cx = 60 + 330 + cw * i + cw / 2;
    text(v, cx, 382, `700 58px ${DISPLAY}`, C.text, 'center');
    text(l, cx, 428, `500 26px ${BODY}`, C.muted, 'center');
  });

  // the nines
  const nines = round.holes.length === 18 ? [round.holes.slice(0, 9), round.holes.slice(9)] : [round.holes];
  let y = 510;
  nines.forEach((nine, n) => {
    const sumLabel = nines.length === 2 ? (n === 0 ? 'Out' : 'In') : tr('Tot', 'Ges.');
    y = drawNine(g, nine, y, sumLabel, (h) => grossForHole(entries[h.index], h.par, received[h.index]), (h) => (me.playingHandicap != null ? stablefordPoints(entries[h.index], h.par, received[h.index]) : null), (h) => received[h.index], (h) => entries[h.index].putts) + 24;
  });

  // footer
  const fy = Math.max(y + 30, H - 70);
  if (ph) text(`${tr('Handicap played', 'Gespieltes Handicap')} ${dec(ph.differential.toFixed(1))}`, 60, fy, `600 30px ${BODY}`, C.text);
  legend(g, W - 60, fy);
  return new Promise((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas'))), 'image/png'));
}

function drawNine(
  g: CanvasRenderingContext2D, nine: RoundHole[], top: number, sumLabel: string,
  gross: (h: RoundHole) => number | null, pts: (h: RoundHole) => number | null, extra: (h: RoundHole) => number, putts: (h: RoundHole) => number | null,
): number {
  const left = 60;
  const lab = 110;
  const sumW = 110;
  const colW = (W - 120 - lab - sumW) / nine.length;
  const hasPts = nine.some((h) => pts(h) != null);
  const hasPutts = nine.some((h) => putts(h) != null);
  const heights = [62, 52, 86, ...(hasPts ? [48] : []), ...(hasPutts ? [48] : [])];
  const height = heights.reduce((s, x) => s + x, 0);
  roundRect(g, left, top, W - 120, height, 24, C.surface);
  g.save();
  roundPath(g, left, top, W - 120, height, 24);
  g.clip();
  g.fillStyle = C.surface2;
  g.fillRect(left, top, W - 120, heights[0]);
  g.fillRect(W - 60 - sumW, top, sumW, height);
  g.restore();
  const cx = (i: number) => left + lab + colW * i + colW / 2;
  const sx = W - 60 - sumW / 2;
  const sum = (f: (h: RoundHole) => number | null) => {
    const v = nine.map(f);
    return v.some((x) => x != null) ? String(v.reduce<number>((s, x) => s + (x ?? 0), 0)) : '';
  };
  const label = (s: string, yy: number) => {
    g.font = `600 22px ${BODY}`;
    g.fillStyle = C.muted;
    g.textAlign = 'left';
    g.fillText(s.toUpperCase(), left + 22, yy);
  };
  let y = top;
  // holes
  label(tr('Hole', 'Loch'), y + 40);
  nine.forEach((h, i) => cell(g, h.label, cx(i), y + 41, `700 28px ${BODY}`, C.text));
  cell(g, sumLabel, sx, y + 41, `700 28px ${BODY}`, C.text);
  y += heights[0];
  // par
  label('Par', y + 34);
  nine.forEach((h, i) => cell(g, String(h.par), cx(i), y + 35, `600 28px ${BODY}`, C.muted));
  cell(g, sum((h) => h.par), sx, y + 35, `700 28px ${BODY}`, C.text);
  y += heights[1];
  g.strokeStyle = C.line;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(left, y);
  g.lineTo(W - 60, y);
  g.stroke();
  // score with golf marks
  label(tr('Score', 'Score'), y + 52);
  nine.forEach((h, i) => {
    const v = gross(h);
    const mx = cx(i);
    const my = y + 43;
    if (v == null) return cell(g, '–', mx, my + 11, `600 30px ${BODY}`, C.muted);
    const d = v - h.par;
    const r = 27;
    let colour = C.text;
    if (d <= -2) {
      g.fillStyle = C.brand;
      g.beginPath();
      g.arc(mx, my, r, 0, Math.PI * 2);
      g.fill();
      colour = '#fff';
    } else if (d === -1) {
      g.strokeStyle = C.brand;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(mx, my, r, 0, Math.PI * 2);
      g.stroke();
      colour = C.brand;
    } else if (d === 1) {
      g.strokeStyle = C.muted;
      g.lineWidth = 3;
      g.strokeRect(mx - r, my - r, r * 2, r * 2);
    } else if (d >= 2) {
      roundRect(g, mx - r, my - r, r * 2, r * 2, 5, C.bad);
      colour = '#fff';
    }
    cell(g, String(v), mx, my + 11, `700 32px ${BODY}`, colour);
    const e = extra(h);
    if (e > 0) cell(g, '•'.repeat(Math.min(3, e)), mx + r + 2, my - r + 6, `700 22px ${BODY}`, C.brand);
  });
  cell(g, sum(gross), sx, y + 54, `700 34px ${BODY}`, C.text);
  y += heights[2];
  if (hasPts) {
    label(tr('Pts', 'Pkt.'), y + 32);
    nine.forEach((h, i) => cell(g, String(pts(h) ?? ''), cx(i), y + 33, `500 26px ${BODY}`, C.text));
    cell(g, sum(pts), sx, y + 33, `700 26px ${BODY}`, C.text);
    y += 48;
  }
  if (hasPutts) {
    label('Putts', y + 32);
    nine.forEach((h, i) => cell(g, String(putts(h) ?? ''), cx(i), y + 33, `500 26px ${BODY}`, C.muted));
    cell(g, sum(putts), sx, y + 33, `700 26px ${BODY}`, C.text);
  }
  return top + height;
}

function legend(g: CanvasRenderingContext2D, right: number, y: number) {
  const items: [string, (x: number) => void][] = [
    ['Birdie', (x) => { g.strokeStyle = C.brand; g.lineWidth = 3; g.beginPath(); g.arc(x, y - 9, 11, 0, Math.PI * 2); g.stroke(); }],
    ['Bogey', (x) => { g.strokeStyle = C.muted; g.lineWidth = 3; g.strokeRect(x - 11, y - 20, 22, 22); }],
  ];
  let x = right;
  g.font = `500 24px ${BODY}`;
  for (const [label, mark] of items.reverse()) {
    const w = g.measureText(label).width;
    g.fillStyle = C.muted;
    g.textAlign = 'right';
    g.fillText(label, x, y);
    mark(x - w - 22);
    x -= w + 60;
  }
}

function cell(g: CanvasRenderingContext2D, s: string, x: number, y: number, font: string, colour: string) {
  g.font = font;
  g.fillStyle = colour;
  g.textAlign = 'center';
  g.fillText(s, x, y);
}

function roundPath(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  roundPath(g, x, y, w, h, r);
  g.fillStyle = fill;
  g.fill();
}

/** Opens the phone's share sheet with the picture; where sharing files is not possible the picture is downloaded. */
export async function shareScorecard(round: Round): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = await renderScorecard(round);
  const day = round.createdAt.slice(0, 10);
  const slug = round.courseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const file = new File([blob], `golfos-${slug}-${day}.png`, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: `${round.courseName} · GolfOS` });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}

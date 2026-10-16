import { L, type CategoryId } from '../types';

// Small charts for „Gut zu wissen“ (Sascha 16.10.2026: pictures with the text). Only numbers that are already in
// the facts of the topic – the chart shows them, it does not add new ones. To be checked by Chris with the facts.

export type Chart =
  /** one bar per value; the bar length is value / max */
  | { kind: 'bars'; title: L; unit: string; bars: { label: L | string; value: number; text?: string }[]; max?: number; caption?: L }
  /** each row is split into parts (e.g. carry : roll, back : through); the legend names the parts */
  | { kind: 'split'; title: L; legend: L[]; rows: { label: L | string; parts: number[]; text?: string }[]; caption?: L };

export const CHARTS: Partial<Record<CategoryId, Chart[]>> = {
  putting: [
    {
      kind: 'bars',
      title: L('Tour players: holed by distance', 'Tour-Spieler: gelocht nach Distanz'),
      unit: '%',
      max: 100,
      bars: [
        { label: '0,6 m', value: 99 },
        { label: '0,9 m', value: 96 },
        { label: '1,2 m', value: 88 },
        { label: '2,4 m', value: 50 },
        { label: '6 m', value: 15 },
      ],
      caption: L('Long putts are about getting close, not holing.', 'Lange Putts heißen: nah rankommen, nicht lochen.'),
    },
  ],
  greenreading: [
    {
      kind: 'bars',
      title: L('Green speed (Stimp)', 'Grüngeschwindigkeit (Stimp)'),
      unit: '',
      max: 14,
      bars: [
        { label: L('German club greens', 'Deutsche Clubgrüns'), value: 9, text: '8–10' },
        { label: L('Tour greens', 'Tour-Grüns'), value: 13, text: '12–14' },
      ],
      caption: L('The faster the green, the more the same slope breaks.', 'Je schneller das Grün, desto stärker bricht dasselbe Gefälle.'),
    },
  ],
  chipping: [
    {
      kind: 'split',
      title: L('Carry : roll on a flat green', 'Flug : Rollen auf flachem Grün'),
      legend: [L('carry', 'Flug'), L('roll', 'Rollen')],
      rows: [
        { label: 'SW', parts: [1, 1], text: '1:1' },
        { label: 'PW', parts: [1, 2], text: '1:2' },
        { label: L('9 iron', 'Eisen 9'), parts: [1, 3], text: '1:3' },
        { label: L('8 iron', 'Eisen 8'), parts: [1, 4], text: '1:4' },
        { label: L('7 iron', 'Eisen 7'), parts: [1, 5], text: '1:5' },
      ],
      caption: L('Uphill less roll, downhill more.', 'Bergauf weniger Rollen, bergab mehr.'),
    },
    {
      kind: 'bars',
      title: L('Up and down from beside the green', 'Up-and-down neben dem Grün'),
      unit: '%',
      max: 100,
      bars: [
        { label: L('Tour', 'Tour'), value: 60 },
        { label: L('Handicap 20', 'Handicap 20'), value: 17, text: '15–20 %' },
      ],
    },
  ],
  pitching: [
    {
      kind: 'bars',
      title: L('Clock system: share of the full wedge distance', 'Uhr-System: Anteil der vollen Wedge-Distanz'),
      unit: '%',
      max: 100,
      bars: [
        { label: '9:00', value: 60, text: '≈ 60 %' },
        { label: '10:30', value: 80, text: '≈ 80 %' },
        { label: L('full', 'voll'), value: 100 },
      ],
      caption: L('Starting values – measure your own with the clock matrix.', 'Startwerte – miss deine eigenen mit der Uhr-Matrix.'),
    },
    {
      kind: 'bars',
      title: L('From 90 m: distance to the hole', 'Aus 90 m: Abstand zum Loch'),
      unit: 'm',
      max: 15,
      bars: [
        { label: L('Tour', 'Tour'), value: 5.5, text: '5–6 m' },
        { label: L('Handicap 20', 'Handicap 20'), value: 13.5, text: '12–15 m' },
      ],
    },
  ],
  bunker: [
    {
      kind: 'bars',
      title: L('Sand saves from greenside bunkers', 'Sand Saves aus Grünbunkern'),
      unit: '%',
      max: 100,
      bars: [
        { label: L('Tour', 'Tour'), value: 50 },
        { label: L('Handicap 20', 'Handicap 20'), value: 12, text: '10–15 %' },
      ],
    },
  ],
  irons: [
    {
      kind: 'bars',
      title: L('Gap between two irons', 'Abstand zwischen zwei Eisen'),
      unit: 'm',
      max: 12,
      bars: [
        { label: L('Men', 'Herren'), value: 11, text: '10–12 m' },
        { label: L('Women', 'Damen'), value: 9, text: '8–10 m' },
      ],
    },
  ],
  swing: [
    {
      kind: 'split',
      title: L('Tour Tempo: back 3 – down 1', 'Tour-Tempo: zurück 3 – runter 1'),
      legend: [L('backswing', 'Ausholen'), L('downswing', 'Abschwung')],
      rows: [{ label: L('Tour', 'Tour'), parts: [0.75, 0.25], text: '0,75 s : 0,25 s' }],
      caption: L('The same ratio for every club – only the length changes.', 'Das gleiche Verhältnis für jeden Schläger – nur die Länge ändert sich.'),
    },
  ],
  strategy: [
    {
      kind: 'bars',
      title: L('What a miss costs (strokes)', 'Was ein Fehler kostet (Schläge)'),
      unit: '',
      max: 2,
      bars: [
        { label: L('Penalty (water, OB)', 'Strafe (Wasser, Aus)'), value: 1.75, text: '1,5–2' },
        { label: L('Fairway bunker', 'Fairwaybunker'), value: 0.5, text: '0,5' },
        { label: L('Rough', 'Rough'), value: 0.3, text: '0,3' },
      ],
      caption: L('Broadie, Strokes Gained – aim away from the expensive miss.', 'Broadie, Strokes Gained – zielen weg vom teuren Fehler.'),
    },
  ],
  trouble: [
    {
      kind: 'bars',
      title: L('Wind: length per km/h', 'Wind: Länge pro km/h'),
      unit: '%',
      max: 0.6,
      bars: [
        { label: L('Into the wind', 'Gegenwind'), value: 0.6, text: '− 0,6 %' },
        { label: L('Downwind', 'Rückenwind'), value: 0.3, text: '+ 0,3 %' },
      ],
      caption: L('Headwind hurts twice as much as tailwind helps.', 'Gegenwind schadet doppelt so viel, wie Rückenwind hilft.'),
    },
  ],
  mental: [
    {
      kind: 'split',
      title: L('Box breathing: 4 – 4 – 4 – 4 seconds', 'Box-Atmung: 4 – 4 – 4 – 4 Sekunden'),
      legend: [L('in', 'ein'), L('hold', 'halten'), L('out', 'aus'), L('hold', 'halten')],
      rows: [{ label: L('1 breath', '1 Atemzug'), parts: [4, 4, 4, 4], text: '16 s' }],
    },
  ],
  practice: [
    {
      kind: 'split',
      title: L('How to split your practice time', 'So teilst du deine Übungszeit auf'),
      legend: [L('short game & putting', 'Kurzes Spiel & Putten'), L('approach', 'Annäherung'), L('tee shots', 'Abschläge')],
      rows: [{ label: L('Amateur', 'Amateur'), parts: [50, 30, 20], text: '50 · 30 · 20 %' }],
    },
  ],
};

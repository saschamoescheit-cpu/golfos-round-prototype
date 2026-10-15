import { L, type Plan } from '../types';

// Ready-made practice plans: drills one after the other with minutes. Missing drill ids are skipped by the app,
// so a plan never breaks when content changes.

export const PLANS: Plan[] = [
  {
    id: 'putt-30-startline',
    name: L('Putting 30 min: start line', 'Putten 30 Min: Startlinie'),
    about: L('The strike and the face – the base of every holed putt.', 'Treffmoment und Schlagfläche – die Basis jedes gelochten Putts.'),
    level: 1,
    focus: ['putting'],
    items: [
      { drill: 'sweetspot-gate', minutes: 6 },
      { drill: 'tiger-gate', minutes: 10 },
      { drill: 'ball-gate', minutes: 8 },
      { drill: 'clock', minutes: 6 },
    ],
  },
  {
    id: 'putt-30-speed',
    name: L('Putting 30 min: length', 'Putten 30 Min: Länge'),
    about: L('No more three-putts: feel for the length from 3 to 20 m.', 'Schluss mit Dreiputts: Gefühl für die Länge von 3 bis 20 m.'),
    level: 1,
    focus: ['putting'],
    items: [
      { drill: 'star-fringe', minutes: 5 },
      { drill: 'ladder', minutes: 8 },
      { drill: 'pelz-17', minutes: 7 },
      { drill: 'lag-circle', minutes: 10 },
    ],
  },
  {
    id: 'putt-45-complete',
    name: L('Putting 45 min: complete', 'Putten 45 Min: komplett'),
    about: L('One third start line, one third length, one third pressure.', 'Ein Drittel Startlinie, ein Drittel Länge, ein Drittel Druck.'),
    level: 2,
    focus: ['putting'],
    items: [
      { drill: 'tiger-gate', minutes: 8 },
      { drill: 'ball-gate', minutes: 7 },
      { drill: 'ladder', minutes: 8 },
      { drill: 'four-tee', minutes: 7 },
      { drill: 'clock', minutes: 8 },
      { drill: 'par18', minutes: 7 },
    ],
  },
  {
    id: 'putt-home-15',
    name: L('Putting at home 15 min', 'Putten zu Hause 15 Min'),
    about: L('On a mat or carpet – every evening.', 'Auf Matte oder Teppich – jeden Abend.'),
    level: 0,
    focus: ['putting'],
    items: [
      { drill: 'mirror-setup', minutes: 4 },
      { drill: 'coin-line', minutes: 4 },
      { drill: 'wellputt-lines', minutes: 4 },
      { drill: 'pressure-putt', minutes: 3 },
    ],
  },
];

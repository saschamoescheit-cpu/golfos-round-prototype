import { L, type CategoryId, type Sketch } from '../types';

// Pictures and videos for the basics (Sascha 16.10.2026: "always put pictures or videos together with the text").
// Per topic, in the order of its sections: the drill that shows it (its sketch is drawn in the section, with a link
// to the drill), an own sketch where no drill fits, and the videos that explain it (YouTube ids from the topic's
// video list; the one in the player's language is shown).

export interface SectionMedia {
  drill?: string;
  sketch?: Sketch;
  videos?: string[];
}

const grain: Sketch = {
  view: 'top',
  w: 6,
  h: 5,
  items: [
    { k: 'green', x: 0, y: 0, w: 6, h: 5 },
    { k: 'slope', at: [5.1, 2.4], dir: 0, label: L('grain', 'Wuchsrichtung') },
    { k: 'hole', at: [3, 3.6], flag: true },
    { k: 'ball', at: [2.2, 0.6], n: L('with the grain', 'mit dem Gras') },
    { k: 'path', pts: [[2.2, 0.6], [2.6, 2.4], [3.1, 4.6]], style: 'roll', arrow: true },
    { k: 'ball', at: [3.8, 0.6], n: L('into the grain', 'gegen das Gras') },
    { k: 'path', pts: [[3.8, 0.6], [3.5, 2]], style: 'roll', arrow: true },
    { k: 'text', at: [3, 4.75], t: L('rolls on: shiny = with the grain', 'rollt weiter: glänzt = mit dem Gras'), size: 0.24 },
    { k: 'text', at: [4.6, 1.6], t: L('stops short: dark', 'bleibt kurz: dunkel'), size: 0.24 },
  ],
  caption: L(
    'Shiny grass grows away from you – the putt runs faster. Dark grass grows towards you – it runs slower. Wet greens are slower and break less.',
    'Glänzendes Gras wächst von dir weg – der Putt läuft schneller. Dunkles Gras wächst dir entgegen – er läuft langsamer. Nasse Grüns sind langsamer und brechen weniger.',
  ),
};

export const SECTION_MEDIA: Partial<Record<CategoryId, SectionMedia[]>> = {
  putting: [
    { drill: 'ball-gate', videos: ['YZA7DEt-MG4', 'VMBqHXYalis'] },
    { drill: 'mirror-setup', videos: ['VMBqHXYalis'] },
    { drill: 'metronome', videos: ['och5_Z0V6PI', 'R4HD_Dg7aCQ'] },
    { drill: 'clock' },
    { drill: 'ladder', videos: ['MducFYxKUmQ', 'PI9o7pwJpbc', 'Lx1e2M2NiLc', 'yoqycx4scGY'] },
    { drill: 'par18', videos: ['Lx1e2M2NiLc', 'R4HD_Dg7aCQ'] },
  ],
  greenreading: [
    { drill: 'low-side', videos: ['7e8UgT6LrW4', 'Wjega5_5pPM'] },
    { drill: 'fall-line', videos: ['Wjega5_5pPM'] },
    { drill: 'three-speeds', videos: ['tV8RdAWzoLU'] },
    { drill: 'apex-tee', videos: ['7e8UgT6LrW4', 'Khk7PGhDq1o'] },
    { drill: 'feet-feel', videos: ['kD3H_UaiuRI', 'jGhWkR6mCCI', 'oc2BxEvGjvQ'] },
    { sketch: grain },
    { drill: 'green-map-compare', videos: ['FxCKSAQdfeE'] },
  ],
  chipping: [
    { drill: 'trail-toe', videos: ['1YynrlcIJVY', 'glV5Y8ZR4XY'] },
    { drill: 'stick-lead-arm', videos: ['nQ3FtVyBfCI', '4ymDdaK4Rv4'] },
    { drill: 'landing-ring', videos: ['KZH7GTUspSg', 'a_2-rsJIqUo', 'nA0yMYITG2E'] },
    { drill: 'rough-chip', videos: ['CW-QqKjLXBQ'] },
    { drill: 'flag-circles', videos: ['nA0yMYITG2E'] },
  ],
  pitching: [
    { drill: 'feet-together-pitch', videos: ['OYlbeTYHihA'] },
    { drill: 'clock-matrix', videos: ['UeEkXxKSxzs', 'TjupRZpHYLs', '9qT9GmhL7KQ'] },
    { drill: 'wedge-ladder', videos: ['jpN1VuiAwPc', 'wHkHJBuWoGA'] },
    { drill: 'towel-arms', videos: ['m3UR4wtW3vk', '5vYP8wOgu1Y'] },
    { drill: 'flop-shot' },
    { drill: 'low-spinner' },
  ],
  bunker: [
    { drill: 'line-in-sand', videos: ['lRV0WYmwYMQ', 'zPSsqtnvc08'] },
    { drill: 'splash-no-ball', videos: ['HUDS7vJZWB8', 'inT-f1UJOuU', 'ZOoL602PfjQ', 'RCfgvdz491Y'] },
    { drill: 'bunker-slopes', videos: ['7B9q27fQImA', 'IbbVxPDSeAQ'] },
    { drill: 'fairway-bunker' },
  ],
  slopes: [
    { drill: 'aim-for-slope', videos: ['Ma3CVK5QNNw', '2jkum70WgLc'] },
    { drill: 'below-feet-stay', videos: ['vWZvqBnDkEE', 'Ufp6j_vIIpk'] },
    { drill: 'slope-ball-position', videos: ['ptGKpaVW_mY', 'wIdKL7v7hmk'] },
    { drill: 'hold-finish-slope', videos: ['ptGKpaVW_mY', 'Q0XXzbpj0mc'] },
    { drill: 'slope-chips', videos: ['WxMeuv7p1wc', 'kdKSkou7H-I'] },
  ],
  trouble: [
    { drill: 'punch-gap', videos: ['MvU5yDXHLJw', '2pzn4RuGGy8'] },
    { drill: 'rough-reading' },
    { drill: 'divot-lie' },
    { drill: 'knockdown-wind', videos: ['JCYbFBgfosI'] },
    { drill: 'escape-decision', videos: ['JzbPT93PoXE', 'cRa63BQjfjM'] },
  ],
  irons: [
    { drill: 'towel-behind', videos: ['Ifc37epOCqM', 'fIRndq3lXlk', 'Tt2L8DvHpPw', 'Rn5QtoZZ7OU'] },
    { drill: 'mirror-setup-full', videos: ['W_b6ov29TUA', 'yZzcE_VGaEc'] },
    { drill: 'gapping' },
    { drill: 'green-target-game' },
  ],
  woods: [
    { drill: 'tee-low-wood', videos: ['AoJoIhSF59s', 'vwOL_czcTIs'] },
    { drill: 'woods-sweep', videos: ['81sEbGUnvLk', '_hyThATVJNM', 'CDWX251oPBU', 'RV7vHKR0q8k'] },
    { drill: 'wood-par5-layup', videos: ['-WVSjEdBWq4'] },
  ],
  driver: [
    { drill: 'tee-height', videos: ['VwUWRR-9PRo', 'kuRpelCXmSw'] },
    { drill: 'hit-up-tee', videos: ['nfFYtMzVzR8', 'wY5pgvZd48U', 'Z1QbsV7q5VI'] },
    { drill: 'fairway-gate', videos: ['tXoEQBtK6Nw'] },
    { drill: 'speed-training', videos: ['oAOuwFHf_Gc'] },
  ],
  basics: [
    { drill: 'grip-check', videos: ['amhiD-oDPQc', 'EDbHyYyWxII', '48SMagY0D1s'] },
    { drill: 'posture-club-spine', videos: ['P4d5TjzEgtk', 'C9XnDCfywPI'] },
    { drill: 'alignment-station', videos: ['_9HsHMOMzoc', 'C9XnDCfywPI'] },
    { drill: 'ball-position-ladder', videos: ['0l90w6dA2_I'] },
    { drill: 'routine-aim-tee' },
  ],
  swing: [
    { drill: 'slow-motion' },
    { drill: 'pump-drill', videos: ['ZQob3g4l0WU'] },
    { drill: 'l-to-l' },
    { drill: 'tempo-321', videos: ['V-8UIPxsJiQ', '0pA3JRw2xJA', 'NqPQr1CyaCk', '3-hyz3ucsOE'] },
  ],
  ballflight: [
    { drill: 'nine-shot', videos: ['_-6S0cf1my4'] },
    { drill: 'slice-gate', videos: ['cBJBM2kDpvg', 'wklLR1o5xf0', 'ZyLi2TQ4pRU', 'pj_sJOwQ3rM'] },
    { drill: 'hook-gate', videos: ['EndU64gWnAQ', '_-6S0cf1my4', 'u7cHr86wDa4'] },
    { drill: 'sweetspot-gate' },
    { drill: 'draw-on-purpose', videos: ['20bTUPC6--c'] },
  ],
  strategy: [
    { drill: 'decade-light', videos: ['XYWnxt5OAb4'] },
    { drill: 'favourite-distance', videos: ['TfJyD72ZV_M', '8K2TTIGOntE'] },
    { drill: 'par3-middle', videos: ['rErHiKeE7xs', 'dbFu871N2jE', '0-ZY9--GywQ'] },
    { drill: 'bogey-plan', videos: ['bQDlKZv5IYg', 'uJAKprMXcU4'] },
    { drill: 'two-club-wind', videos: ['eIxgLuKybVo'] },
  ],
  mental: [
    { drill: 'routine-build', videos: ['wn7Sswh0X9o', 'Nn8Ib5AawaE', 'NPVnYnyA7kw'] },
    { drill: 'ten-second' },
    { drill: 'box-breathing', videos: ['2QHCkNPEK8o'] },
    { drill: 'visualise', videos: ['3VE1lhvOrNg'] },
  ],
  fitness: [
    { drill: 'warmup-10', videos: ['FBQjnEAp8iI', 'y2smq_zwXdw', 'zIfEgvQJL4k'] },
    { drill: 'open-books', videos: ['fBozEYMB6xo', '-TEFEtvhdyw', '6E8pMeSsRjA'] },
    { drill: 'med-ball-throw' },
    { drill: 'deep-squat' },
  ],
  practice: [
    { drill: 'block-then-random', videos: ['YZ7-iFn73fs', 'KxwHcaoPBMY', 'nUpsR1wETrg'] },
    { drill: 'range-round', videos: ['i5OAPb-VJ8U', 'MJCG7gvGC0I'] },
    { drill: 'skills-test' },
    { drill: 'chip-towel-home' },
  ],
};

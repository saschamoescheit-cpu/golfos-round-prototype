// Hole notes (feature 017): what the player (or the club) knows about a hole that no map shows –
// out of bounds inside the course, a blind tee shot, "never short-right". The caddie learns the course this way.
// Stored per course on the device; in the product shared between players of a club.

export interface HoleNote {
  obLeft?: boolean;
  obRight?: boolean;
  obLong?: boolean;
  /** Woods to that side where balls are mostly lost – like out of bounds (Sascha's Hetzenhof notes, 15.10.2026). */
  lostLeft?: boolean;
  lostRight?: boolean;
  text?: string;
  /** What a good local player knows about the hole (strategy), shown with the caddie. */
  tip?: string;
}

const KEY = 'golfos.holenotes.v1.';

/** Known from players (Sascha, 11.10.2026). */
const DEFAULTS: Record<string, Record<string, HoleNote>> = {
  // Hetzenhof A: Sascha's strategy notes (caddie workshop, 15.10.2026), shortened
  'osm:relation/1326323': {
    '1A': { obLeft: true, obRight: true, tip: 'Ball ins Spiel bringen: 180–190 m (z. B. Eisen 4) reichen für Par; mit dem Driver wird die Landezone breiter. Grün hängt von links nach rechts: Mitte bis leicht rechts anspielen und eher kurz lassen – bergauf putten.' },
    '2A': { obLeft: true, tip: 'Wasser rechts aus dem Spiel nehmen: Mitte bis linke Grünseite. Zu weit links ist Aus (Maisfeld). Das Grün ist kaum onduliert.' },
    '3A': { obLeft: true, tip: 'Drive über den linken Bunker, Richtung des rechten der zwei Bäume – je weiter rechts, desto kürzer der zweite Schlag. Grün hängt stark von links nach rechts, rechts lauert ein Bunker: linke Grünseite bis Mitte anspielen.' },
    '4A': { lostLeft: true, tip: 'Links Wald – der Ball ist meist weg, erneut abschlagen. Rechts ist rot gesteckt (droppen, die Länge bleibt). Wer nicht lang ist: Eisen 4 ins Spiel, das Fairway fällt nach rechts. 2. Schlag links halten und auf Höhe der Fairwaybunker ablegen (ebener Stand). 3. Schlag: Grünbunker und die rechte Grünseite meiden (steil bergab), nicht zu lang. Grün stark onduliert.' },
    '5A': { lostLeft: true, tip: 'Hcp 1 – ein Bogey ist ein gutes Ergebnis. Links Wald (Bälle weg): Mitte bis rechts, ideal Richtung Baum in Verlängerung des Abschlags, dann etwa 150 m ins Grün. 2. Schlag: Grünbunker meiden, keinesfalls zu lang. Das Grün fällt stark nach vorn – Putt bergauf.' },
    '6A': { tip: '110–150 m je nach Fahne. Fahne hinten: 10 m rechts der Fahne auf die Welle zielen, der Ball läuft zur Fahne. Bunker meiden; wenn verfehlen, dann rechts.' },
    '7A': { tip: 'Fairwaybunker in der Drive-Landezone meiden (oder carry überspielen). Ziel: die Tanne in Verlängerung des Abschlags – verzeiht 10–15 m links und rechts. Grünbunker meiden; wenn verfehlen, dann rechts, eher kurz lassen – Putt bergauf.' },
    '8A': { tip: 'Risk & Reward: lange Driver können über Wald und Teich rechts abkürzen. Sicher: 180–190 m ins Spiel (Eisen 4, bei Gegenwind Holz 5), dann 90–110 m ins Grün. Grünbunker vorne und rechts meiden; lieber lang verfehlen – von dort viel Grün zum Chippen.' },
    '9A': { obLeft: true, tip: 'Langes Par 5: Driver Mitte Bahn (links Aus, rechts verzeiht viel). 2. Schlag vor die Bunker oder links vorbei – nicht zu lang, sonst Wald mit Strafschlag. 3. Schlag: Grünbunker meiden, links verfehlen ist ungefährlich.' },
  },
  // Son Antem West, local rules (scorecard 2023): the driving range right of 10, behind the 11th green and right of 12 is out of bounds.
  'osm:way/28625559': { '10': { obRight: true }, '11': { obLong: true }, '12': { obRight: true } },
  'osm:relation/3977168': { '10': { obRight: true }, '11': { obLong: true }, '12': { obRight: true } },
};

export function loadHoleNotes(courseId: string): Record<string, HoleNote> {
  let own: Record<string, HoleNote> = {};
  try {
    own = JSON.parse(localStorage.getItem(KEY + courseId) ?? '{}');
  } catch {
    // storage blocked
  }
  return { ...(DEFAULTS[courseId] ?? {}), ...own };
}

export function saveHoleNote(courseId: string, hole: string, note: HoleNote): void {
  try {
    const all = JSON.parse(localStorage.getItem(KEY + courseId) ?? '{}');
    all[hole] = note;
    localStorage.setItem(KEY + courseId, JSON.stringify(all));
  } catch {
    // storage full – the note lives for this session only
  }
}

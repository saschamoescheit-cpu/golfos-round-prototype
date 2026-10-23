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

/** The hole has a note – the player's own text or one of the choices (Sascha 23.10.2026: the green dot). */
export const hasNote = (n: HoleNote | null | undefined): boolean =>
  !!n && !!(n.text?.trim() || n.obLeft || n.obRight || n.obLong || n.lostLeft || n.lostRight);

const KEY = 'golfos.holenotes.v1.';
const COURSE = 'golfos.course.v1.'; // the course cache (storage.ts)

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
    // Hetzenhof B (Sascha, 15.10.2026)
    '1B': { tip: 'Ziel vom Abschlag: die Reihe aus drei Bäumen hinter dem ersten Bunker. Fairwaybunker meiden, zu weit links ist nicht gut – wenn verfehlen, dann rechts der Bunker. 2. Schlag: linken Grünbunker meiden, nicht lang; wenn verfehlen, dann rechts.' },
    '2B': { tip: 'Sehr kurzes Par 4: Lange Spieler überspielen den Fairwaybunker und greifen das Grün an, sonst vor dem Bunker ablegen. Die linke Seite komplett meiden – Mitte bis rechts ist perfekt. 2. Schlag: Grünbunker meiden, das Grün ist fair.' },
    '3B': { tip: 'Die linke Seite und den Bunker meiden, auch lang links ist schlecht – wenn verfehlen, dann rechts. Große Welle im Grün: Fahne hinten links → Mitte Grün spielen, der Ball rollt über die Welle zur Fahne.' },
    '4B': { lostRight: true, tip: 'Den Abschlag links halten: über den linken Bunker (die Welle lässt den Ball rollen) oder rechts am Bunker vorbei – aber nie rechts verfehlen, dort sind die Bälle oft weg. 2. Schlag links halten, den Bunker 50 m vor dem Grün aus dem Spiel nehmen. Das Grün ist ein Vulkan und fällt in alle Richtungen – wenn verfehlen, dann rechts.' },
    '5B': { obRight: true, tip: 'Sehr schweres Loch: Abschlag auf 180–200 m ablegen – dort ist ein Plateau mit gutem Stand. Rechts ist über die ganze Bahn Aus, links darf man verfehlen. 2. Schlag: Grünbunker und die rechte Seite meiden, links halten (Orientierung: Gewitterhütte), Mitte Grün.' },
    '6B': { lostLeft: true, tip: 'Die linke Seite komplett meiden, Bälle sind oft weg – rechts halten. Zielhilfe: der große Baum hinter dem Grün in Verlängerung des Abschlags. Wenn verfehlen, dann rechts.' },
    '7B': { tip: 'Hcp 1 – ein Bogey ist hier ein gutes Ergebnis. Die linke Seite und den linken Fairwaybunker in der Landezone meiden (kostet ein bis zwei Schläge); Richtung: der Fairwaybunker geradeaus. Wenn verfehlen, dann rechts. 2. Schlag meist noch 170 m bergauf: Grünbunker links meiden, zwischen Mitte und rechts halten. Grün stark onduliert.' },
    '8B': { tip: 'Meist Gegenwind, der kaum zu spüren ist – ein Blick in die Baumkronen hilft. Bunker meiden; wenn verfehlen, dann rechts. Hinter dem Grün ist noch Platz.' },
    '9B': { lostLeft: true, tip: 'Birdie-Chance. Links Wald – der Ball ist weg; rechts Wald, aber rot gesteckt. Ideal: den Abschlag so lang, dass die Hindernisse nicht ins Spiel kommen, dann etwa 200 m. Angreifen: Wasser rechts und Bunker meiden, bester Fehlschlag lang oder leicht links. Vorlegen: links vom Wasser, dann entspannt aufs Grün.' },
    // Hetzenhof C (Sascha, 15.10.2026)
    '1C': { lostLeft: true, tip: 'Schweres Par 3 mit schmaler Landezone: die linke Seite komplett meiden, die Bälle sind weg; auch den Grünbunker meiden. Bester Fehlschlag: lang rechts vom Grün. Sonst muss der Schlag einfach sitzen.' },
    '2C': { obRight: true, tip: 'Kurzes Par 4 mit Birdie-Chance. Angreifen geht nur über eine Waldlinie, ohne den Ball landen zu sehen – ohne Forecaddie lieber den Abschlag auf 170–180 m ablegen und mit einem entspannten Wedge aufs Grün. Rechts ist Aus. Das Grün ist leicht onduliert und einfach.' },
    '3C': { tip: 'Links und rechts meiden, vor allem bei hohem Rough – Abschlag so lang wie möglich und gerade. 2. Schlag: wieder beide Seiten meiden; lange Spieler überspielen den Bunker geradeaus, die anderen legen davor oder rechts daneben ab. 3. Schlag: den rechten Grünbunker meiden, bester Fehlschlag gerade lang.' },
    '4C': { lostRight: true, tip: 'Sehr schweres Loch – ein Bogey ist in Ordnung. Rechts ist praktisch nur Wald, links Rough. Zielhilfe: der große Baum geradeaus. Danach die Bunker meiden; das Grün auf keinen Fall links verfehlen.' },
    '5C': { obRight: true, tip: 'Sehr schwer: lang, leicht bergauf und meist Gegenwind – ein Bogey ist in Ordnung. Rechts über die ganze Bahn Aus; Abschlag maximal lang und gerade. 2. Schlag weiter rechts meiden; wer angreift, meidet die zwei Grünbunker. Welle im Grün: Fahne hinten → das Plateau erreichen.' },
    '6C': { obRight: true, tip: 'Eher einfach, ein Schlag ist drin. Die ganze rechte Seite meiden: Wald, Büsche und eine Aus-Linie. Abschlag gerade und lang – gute Drives rollen bis 50 m vors Grün. 2. Schlag: Bunker links und rechts meiden, lieber zu lang.' },
    '7C': { lostLeft: true, tip: 'Dankbares Loch, für lange Spieler eine Eagle-Chance. Links Bäume, Wald und viel Rough meiden, rechts die Fairwaybunker. Das Fairway hängt leicht nach rechts – Bälle aus der Mitte springen und rollen nach rechts. 2. Schlag: alle Bunker und links meiden, rechts verzeiht etwas. Annäherung eher kurz – Putt bergauf.' },
    '8C': { obLong: true, tip: 'Sehr kurz, aber das Par ist nicht leicht: Wasser vor dem Grün, Bunker rechts, hinter dem Grün Aus. Mit dem richtigen Schläger genau die Distanz treffen.' },
    '9C': { lostLeft: true, lostRight: true, tip: 'Schweres Schlussloch – ein Bogey ist absolut in Ordnung. Links und rechts sind die Bälle weg: Abschlag maximal lang und gerade. Das Grün ist schmal und lang, auf beiden Seiten Bunker – wenn verfehlen, dann rechts.' },
  },
  // Son Antem West, local rules (scorecard 2023): the driving range right of 10, behind the 11th green and right of 12 is out of bounds.
  'osm:way/28625559': { '10': { obRight: true }, '11': { obLong: true }, '12': { obRight: true } },
  'osm:relation/3977168': { '10': { obRight: true }, '11': { obLong: true }, '12': { obRight: true } },
};

/** The same course found under another id (Sascha 22.10.2026: "hole notes for the course, not for one round"): the search
 *  may give the relation, the map the way, another source its own id – the same name within 2 km is the same course.
 *  Two courses of one resort (Son Antem East and West) have different names and stay apart. */
function sameCourseIds(courseId: string): string[] {
  const out: string[] = [];
  try {
    const me = JSON.parse(localStorage.getItem(COURSE + courseId) ?? 'null') as { name?: string; lat?: number; lon?: number } | null;
    if (!me?.name || me.lat == null || me.lon == null) return out;
    const fold = (t: string) => t.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(KEY)) continue;
      const id = key.slice(KEY.length);
      if (id === courseId) continue;
      const c = JSON.parse(localStorage.getItem(COURSE + id) ?? 'null') as { name?: string; lat?: number; lon?: number } | null;
      if (!c?.name || c.lat == null || c.lon == null || fold(c.name) !== fold(me.name)) continue;
      const dy = (c.lat - me.lat) * 111;
      const dx = (c.lon - me.lon) * 111 * Math.cos((me.lat * Math.PI) / 180);
      if (Math.hypot(dx, dy) <= 2) out.push(id);
    }
  } catch {
    // storage blocked
  }
  return out;
}

/** The notes of a course – every hole by its own label ("8C"), so one note counts in every combination of loops
 *  (C alone, B + C, C + A) and in every later round. */
export function loadHoleNotes(courseId: string): Record<string, HoleNote> {
  let own: Record<string, HoleNote> = {};
  const read = (id: string): Record<string, HoleNote> => {
    try {
      return JSON.parse(localStorage.getItem(KEY + id) ?? '{}');
    } catch {
      return {}; // storage blocked
    }
  };
  for (const id of sameCourseIds(courseId)) own = { ...own, ...read(id) };
  own = { ...own, ...read(courseId) };
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

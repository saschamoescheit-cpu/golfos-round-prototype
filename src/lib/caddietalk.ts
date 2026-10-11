import { speechLang, tr } from './i18n';
// What the caddie says beyond numbers (feature 017): mental cues, rules help, answers to quick questions,
// reading aloud. Rule-based in the prototype; a language model can take over later (needs a backend).

/** One short mental cue on the tee, from the last hole and the stage of the round. */
export function mentalTip(o: { hole: number; holes: number; lastToPar: number | null; lastPickedUp: boolean; tempC?: number | null }): string | null {
  if (o.hole === 0) return tr('First tee: one practice swing, pick a small target, commit to it.', 'Erster Abschlag: ein Probeschwung, ein kleines Ziel wählen, dann voll dahinterstehen.');
  if (o.tempC != null && o.tempC >= 27 && o.hole % 3 === 0) return tr('Hot today: drink at every tee and wait in the shade.', 'Heiß heute: an jedem Abschlag trinken und im Schatten warten.');
  if (o.lastPickedUp || (o.lastToPar != null && o.lastToPar >= 2)) return tr('Let the last hole go. Small target, smooth tempo – one shot at a time.', 'Hak das letzte Loch ab. Kleines Ziel, ruhiges Tempo – ein Schlag nach dem anderen.');
  if (o.lastToPar != null && o.lastToPar <= -1) return tr('Nice one. Same routine, same tempo – no extra speed now.', 'Schön gespielt. Gleiche Routine, gleiches Tempo – jetzt nicht schneller werden.');
  if (o.hole === Math.floor(o.holes / 2)) return tr('Halfway: drink some water and have a bite.', 'Halbzeit: etwas trinken und eine Kleinigkeit essen.');
  if (o.hole % 6 === 0) return tr('Time for a sip of water – energy for the next holes.', 'Zeit für einen Schluck Wasser – Energie für die nächsten Löcher.');
  if (o.hole >= o.holes - 3) return tr('Closing holes: stay in your routine, play to your targets.', 'Schlusslöcher: bleib in deiner Routine, spiel auf deine Ziele.');
  return null;
}

/** Rules of Golf 2023 – the options a caddie explains most often (short; the rule book decides). */
export const RULES: { id: string; title: string; text: string[] }[] = [
  {
    id: 'water',
    title: tr('Ball in a penalty area (water)', 'Ball in einer Penalty Area (Wasser)'),
    text: [
      tr(
        'Yellow: 1 stroke – replay from where you hit, or drop back on the line from the flag through the point where the ball crossed the edge.',
        'Gelb: 1 Strafschlag – vom letzten Schlagort erneut spielen oder auf der Linie Fahne–Kreuzungspunkt beliebig weit nach hinten droppen.',
      ),
      tr(
        'Red: also 1 stroke – drop within 2 club lengths of where it crossed the edge, not nearer the hole.',
        'Rot: ebenfalls 1 Strafschlag – zusätzlich innerhalb von 2 Schlägerlängen vom Kreuzungspunkt droppen, nicht näher zur Fahne.',
      ),
      tr('Or play it as it lies, without penalty.', 'Oder den Ball straflos spielen, wie er liegt.'),
    ],
  },
  {
    id: 'ob',
    title: tr('Out of bounds or lost ball', 'Aus oder verlorener Ball'),
    text: [
      tr(
        'Stroke and distance: 1 stroke, play again from where you hit. Play a provisional ball if it might be lost or out!',
        'Schlag und Distanz: 1 Strafschlag, vom letzten Schlagort erneut spielen. Spiel einen provisorischen Ball, wenn er verloren oder im Aus sein könnte!',
      ),
      tr(
        'If the club uses Local Rule E-5: 2 strokes, drop on the fairway (or edge of the fairway) level with where the ball was lost.',
        'Gilt die Platzregel E-5: 2 Strafschläge, Drop auf dem Fairway (oder am Fairwayrand) auf Höhe der Stelle, wo der Ball verloren ging.',
      ),
    ],
  },
  {
    id: 'unplayable',
    title: tr('Unplayable ball', 'Ball unspielbar'),
    text: [
      tr(
        '1 stroke, then: replay from where you hit, or drop back on the line from the flag through the ball, or drop within 2 club lengths, not nearer the hole.',
        '1 Strafschlag, dann: vom letzten Schlagort erneut spielen, auf der Linie Fahne–Ball nach hinten droppen oder innerhalb von 2 Schlägerlängen droppen, nicht näher zur Fahne.',
      ),
      tr(
        'In a bunker the drop must stay in the bunker – or for 2 strokes drop back on the line outside the bunker.',
        'Im Bunker muss der Drop im Bunker bleiben – oder mit 2 Strafschlägen auf der Linie nach hinten außerhalb des Bunkers.',
      ),
    ],
  },
  {
    id: 'free',
    title: tr('Free relief (cart path, sprinkler, ground under repair)', 'Straflose Erleichterung (Weg, Sprinkler, Boden in Ausbesserung)'),
    text: [
      tr(
        'No penalty: find the nearest point of complete relief, drop within 1 club length, not nearer the hole.',
        'Kein Strafschlag: nächstgelegenen Punkt vollständiger Erleichterung bestimmen, innerhalb einer Schlägerlänge droppen, nicht näher zur Fahne.',
      ),
    ],
  },
  {
    id: 'embedded',
    title: tr('Embedded ball (general area)', 'Eingebetteter Ball (Gelände)'),
    text: [
      tr(
        'No penalty: drop within 1 club length behind the spot where the ball is embedded, not nearer the hole.',
        'Kein Strafschlag: innerhalb einer Schlägerlänge hinter der Stelle droppen, an der der Ball eingebettet ist, nicht näher zur Fahne.',
      ),
    ],
  },
];

export interface CaddieFacts {
  club: string;
  distance: number;
  playsLike: number;
  target: string; // 'the pin' | 'the gold marker' | 'target 1' (in the player's language)
  targetTo: string; // 'to the pin' / 'zur Fahne'
  aim: string | null;
  plan: string | null;
  wind: string | null;
  green: string | null;
  warning: string | null;
  unit: string;
}

/** The caddie's summary in one or two sentences (also read aloud). */
export function summary(f: CaddieFacts): string {
  const parts = [`${f.club}. ${Math.round(f.distance)} ${f.unit} ${f.targetTo}, ${tr('plays like', 'spielt sich wie')} ${Math.round(f.playsLike)}.`];
  if (f.warning) parts.push(f.warning + '.');
  if (f.aim) parts.push(f.aim + '.');
  if (f.plan) parts.push(f.plan);
  return parts.join(' ');
}

/** Answers a spoken or typed question from keywords. */
export function answer(q: string, f: CaddieFacts): string {
  const t = q.toLowerCase();
  const has = (...w: string[]) => w.some((x) => t.includes(x));
  if (has('rule', 'water', 'drop', 'lost', 'out of bounds', 'unplayable', 'regel', 'wasser', 'aus ', 'verloren', 'unspielbar'))
    return tr('Open "Rules" for the options – water, out of bounds, unplayable and free relief.', 'Öffne „Regeln“ für die Möglichkeiten – Wasser, Aus, unspielbar und straflose Erleichterung.');
  if (has('green', 'putt', 'break', 'grün')) return f.green ?? tr('No green slope data for this hole.', 'Für dieses Loch gibt es keine Grün-Neigung.');
  if (has('wind')) return f.wind ?? tr('No wind data right now.', 'Gerade keine Winddaten.');
  if (has('aim', 'where', 'line', 'wohin', 'ziel')) return [f.warning, f.aim ?? tr(`Aim at ${f.target}.`, `Spiel auf ${f.target}.`), f.plan].filter(Boolean).join(' ');
  if (has('far', 'distance', 'yard', 'meter', 'how long', 'weit', 'entfernung'))
    return `${Math.round(f.distance)} ${f.unit} ${f.targetTo}, ${tr('plays like', 'spielt sich wie')} ${Math.round(f.playsLike)} ${f.unit}.`;
  if (has('club', 'hit', 'what', 'schläger', 'eisen', 'iron', 'holz', 'welch'))
    return tr(`${f.club} – ${Math.round(f.playsLike)} ${f.unit} plays-like ${f.targetTo}.`, `${f.club} – spielt sich wie ${Math.round(f.playsLike)} ${f.unit} ${f.targetTo}.`);
  return summary(f);
}

/** Reads text aloud (iPhone Safari supports this). */
export function speak(text: string): boolean {
  const s = (window as Window & { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
  if (!s) return false;
  s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = speechLang();
  u.rate = 1;
  s.speak(u);
  return true;
}

/** Listens once (Safari: webkitSpeechRecognition); resolves the recognised text or null. */
export function listen(): Promise<string | null> {
  type Rec = { lang: string; interimResults: boolean; onresult: (e: { results: { 0: { transcript: string } }[] }) => void; onerror: () => void; onend: () => void; start: () => void };
  const W = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  const C = W.SpeechRecognition ?? W.webkitSpeechRecognition;
  if (!C) return Promise.resolve(null);
  return new Promise((resolve) => {
    const r = new C();
    let done = false;
    r.lang = speechLang();
    r.interimResults = false;
    r.onresult = (e) => {
      done = true;
      resolve(e.results[0][0].transcript);
    };
    r.onerror = () => !done && resolve(null);
    r.onend = () => !done && resolve(null);
    r.start();
  });
}

export const canListen = () => {
  const W = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return W.SpeechRecognition != null || W.webkitSpeechRecognition != null;
};

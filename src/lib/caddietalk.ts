// What the caddie says beyond numbers (feature 017): mental cues, rules help, answers to quick questions,
// reading aloud. Rule-based in the prototype; a language model can take over later (needs a backend).

/** One short mental cue on the tee, from the last hole and the stage of the round. */
export function mentalTip(o: { hole: number; holes: number; lastToPar: number | null; lastPickedUp: boolean }): string | null {
  if (o.hole === 0) return 'First tee: one practice swing, pick a small target, commit to it.';
  if (o.lastPickedUp || (o.lastToPar != null && o.lastToPar >= 2)) return 'Let the last hole go. Small target, smooth tempo – one shot at a time.';
  if (o.lastToPar != null && o.lastToPar <= -1) return 'Nice one. Same routine, same tempo – no extra speed now.';
  if (o.hole === Math.floor(o.holes / 2)) return 'Halfway: drink some water and have a bite.';
  if (o.hole >= o.holes - 3) return 'Closing holes: stay in your routine, play to your targets.';
  return null;
}

/** Rules of Golf 2023 – the options a caddie explains most often (short; the rule book decides). */
export const RULES: { id: string; title: string; text: string[] }[] = [
  {
    id: 'water',
    title: 'Ball in a penalty area (water)',
    text: [
      'Yellow: 1 stroke – replay from where you hit, or drop back on the line from the flag through the point where the ball crossed the edge.',
      'Red: also 1 stroke – drop within 2 club lengths of where it crossed the edge, not nearer the hole.',
      'Or play it as it lies, without penalty.',
    ],
  },
  {
    id: 'ob',
    title: 'Out of bounds or lost ball',
    text: [
      'Stroke and distance: 1 stroke, play again from where you hit. Play a provisional ball if it might be lost or out!',
      'If the club uses Local Rule E-5: 2 strokes, drop on the fairway (or edge of the fairway) level with where the ball was lost.',
    ],
  },
  {
    id: 'unplayable',
    title: 'Unplayable ball',
    text: [
      '1 stroke, then: replay from where you hit, or drop back on the line from the flag through the ball, or drop within 2 club lengths, not nearer the hole.',
      'In a bunker the drop must stay in the bunker – or for 2 strokes drop back on the line outside the bunker.',
    ],
  },
  {
    id: 'free',
    title: 'Free relief (cart path, sprinkler, ground under repair)',
    text: ['No penalty: find the nearest point of complete relief, drop within 1 club length, not nearer the hole.'],
  },
  {
    id: 'embedded',
    title: 'Embedded ball (general area)',
    text: ['No penalty: drop within 1 club length behind the spot where the ball is embedded, not nearer the hole.'],
  },
];

export interface CaddieFacts {
  club: string;
  distance: number;
  playsLike: number;
  target: string; // 'the pin' | 'the gold marker' | 'target 1'
  aim: string | null;
  plan: string | null;
  wind: string | null;
  green: string | null;
  warning: string | null;
  unit: string;
}

/** The caddie's summary in one or two sentences (also read aloud). */
export function summary(f: CaddieFacts): string {
  const parts = [`${f.club}. ${Math.round(f.distance)} ${f.unit} to ${f.target}, plays like ${Math.round(f.playsLike)}.`];
  if (f.warning) parts.push(f.warning + '.');
  if (f.aim) parts.push(f.aim + '.');
  if (f.plan) parts.push(f.plan);
  return parts.join(' ');
}

/** Answers a spoken or typed question from keywords. */
export function answer(q: string, f: CaddieFacts): string {
  const t = q.toLowerCase();
  const has = (...w: string[]) => w.some((x) => t.includes(x));
  if (has('rule', 'water', 'drop', 'lost', 'out of bounds', 'unplayable', 'regel', 'wasser', 'aus')) return 'Open "Rules" for the options – water, out of bounds, unplayable and free relief.';
  if (has('green', 'putt', 'break', 'grün')) return f.green ?? 'No green slope data for this hole.';
  if (has('wind')) return f.wind ?? 'No wind data right now.';
  if (has('aim', 'where', 'line', 'wohin', 'ziel')) return [f.warning, f.aim ?? `Aim at ${f.target}.`, f.plan].filter(Boolean).join(' ');
  if (has('far', 'distance', 'yard', 'meter', 'how long', 'weit', 'entfernung')) return `${Math.round(f.distance)} ${f.unit} to ${f.target}, plays like ${Math.round(f.playsLike)} ${f.unit}.`;
  if (has('club', 'hit', 'what', 'schläger', 'eisen', 'iron')) return `${f.club} – ${Math.round(f.playsLike)} ${f.unit} plays-like to ${f.target}.`;
  return summary(f);
}

/** Reads text aloud (iPhone Safari supports this). */
export function speak(text: string): boolean {
  const s = (window as Window & { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
  if (!s) return false;
  s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
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
    r.lang = 'en-US';
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

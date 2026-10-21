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
  target: string; // 'the pin' | 'target 1' | '150 m' (in the player's language)
  targetTo: string; // 'to the pin' / 'zur Fahne'
  aim: string | null;
  plan: string | null;
  wind: string | null;
  green: string | null;
  warning: string | null;
  unit: string;
  /** "Normally your 7-iron – with the wind into you (+15 m) today the 6-iron." */
  clubTalk?: string | null;
  /** Where the flag stands on the green: "back left". */
  pinSpot?: string | null;
  /** The hole's strategy (hole note tip) – read on the tee. */
  tip?: string | null;
  teeShot?: boolean;
  /** Under 5 km/h – the caddie does not talk about it unasked. */
  calm?: boolean;
}

const dot = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/** What the caddie says – like a caddie talks it through with the player (Sascha 15.10.2026): distance and club
 *  (and why it is another club than usual), the wind, the flag, the danger, the aim, where to miss – and on the tee
 *  the plan for the hole. Also read aloud. */
export function summary(f: CaddieFacts): string {
  const parts = [`${Math.round(f.distance)} ${f.unit} ${f.targetTo}, ${tr('plays like', 'spielt sich wie')} ${Math.round(f.playsLike)}.`];
  parts.push(f.clubTalk ? dot(f.clubTalk) : `${f.club}.`);
  if (f.wind && !f.clubTalk && !f.calm) parts.push(dot(`${tr('Wind', 'Wind')}: ${f.wind}`));
  if (f.pinSpot) parts.push(dot(tr(`The flag is ${f.pinSpot}`, `Die Fahne steht ${f.pinSpot}`)));
  if (f.warning) parts.push(dot(f.warning));
  if (f.aim) parts.push(dot(f.aim));
  if (f.plan) parts.push(dot(f.plan));
  if (f.teeShot && f.tip) parts.push(dot(`${tr('The plan for this hole', 'Der Plan für dieses Loch')}: ${f.tip}`));
  return parts.join(' ');
}

/** Answers a spoken or typed question from keywords. */
export function answer(q: string, f: CaddieFacts): string {
  const t = q.toLowerCase();
  const has = (...w: string[]) => w.some((x) => t.includes(x));
  if (has('rule', 'water', 'drop', 'lost', 'out of bounds', 'unplayable', 'regel', 'wasser', 'aus ', 'verloren', 'unspielbar'))
    return tr('Open "Rules" for the options – water, out of bounds, unplayable and free relief.', 'Öffne „Regeln“ für die Möglichkeiten – Wasser, Aus, unspielbar und straflose Erleichterung.');
  if (has('green', 'putt', 'break', 'grün')) return f.green ?? tr('No green slope data for this hole.', 'Für dieses Loch gibt es keine Grün-Neigung.');
  if (has('wind')) return [f.wind ?? tr('No wind data right now.', 'Gerade keine Winddaten.'), f.clubTalk].filter(Boolean).join(' – ');
  if (has('miss', 'verfehl', 'fehlschl', 'ablage'))
    return [f.warning, f.plan ?? tr('No side is clearly worse – aim for the middle.', 'Keine Seite ist klar schlechter – spiel auf die Mitte.')].filter(Boolean).map((x) => dot(x as string)).join(' ');
  if (has('plan', 'strateg', 'tip', 'tipp'))
    return [f.teeShot ? null : f.plan, f.tip ? `${tr('The plan for this hole', 'Der Plan für dieses Loch')}: ${f.tip}` : null, f.teeShot ? f.plan : null].filter(Boolean).map((x) => dot(x as string)).join(' ') || tr('No plan for this hole yet.', 'Für dieses Loch gibt es noch keinen Plan.');
  if (has('flag', 'pin', 'fahne')) return f.pinSpot ? tr(`The flag is ${f.pinSpot}.`, `Die Fahne steht ${f.pinSpot}.`) : tr('Flag in the middle of the green.', 'Fahne in der Grünmitte.');
  if (has('aim', 'where', 'line', 'wohin', 'ziel')) return [f.warning, f.aim ?? tr(`Aim at ${f.target}.`, `Spiel auf ${f.target}.`), f.plan].filter(Boolean).join(' ');
  if (has('far', 'distance', 'yard', 'meter', 'how long', 'weit', 'entfernung'))
    return `${Math.round(f.distance)} ${f.unit} ${f.targetTo}, ${tr('plays like', 'spielt sich wie')} ${Math.round(f.playsLike)} ${f.unit}.`;
  if (has('club', 'hit', 'what', 'schläger', 'eisen', 'iron', 'holz', 'welch'))
    return tr(`${f.club} – ${Math.round(f.playsLike)} ${f.unit} plays-like ${f.targetTo}.`, `${f.club} – spielt sich wie ${Math.round(f.playsLike)} ${f.unit} ${f.targetTo}.`);
  return summary(f);
}

// Whether the caddie is talking right now – the app shows a stop button while he is.
let talking = false;
const listeners = new Set<() => void>();
const setTalking = (v: boolean) => {
  if (talking === v) return;
  talking = v;
  listeners.forEach((l) => l());
};
export const isSpeaking = () => talking;
export function onSpeaking(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

const synth = () => (typeof window === 'undefined' ? undefined : (window as Window & { speechSynthesis?: SpeechSynthesis }).speechSynthesis);

/**
 * A moment of silence through an <audio> element, played from the tap: on the iPhone the page then plays sound like a
 * media app – the read-aloud is heard with the ring switch on silent, which mutes it otherwise (Sascha 17.10.2026:
 * "I tap read aloud, nothing happens").
 */
let silence: HTMLAudioElement | null = null;
function wakeAudio(): void {
  try {
    if (!silence) {
      // 50 ms of silence as a data: address (not a blob: one – a revoked blob address showed as an error in WebKit)
      const n = 400; // 8 kHz, 8 bit, mono
      const b = new Uint8Array(44 + n);
      const v = new DataView(b.buffer);
      const str = (o: number, t: string) => [...t].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
      str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
      v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); str(36, 'data'); v.setUint32(40, n, true);
      b.fill(128, 44);
      silence = new Audio('data:audio/wav;base64,' + btoa(String.fromCharCode(...b)));
    }
    silence.currentTime = 0;
    void silence.play().catch(() => undefined);
  } catch {
    /* no audio element: speak anyway */
  }
}

let current: SpeechSynthesisUtterance | null = null; // held, so the browser does not drop it before it ends

function utterance(text: string, lang: string, voice: SpeechSynthesisVoice | null): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  if (voice) u.voice = voice;
  u.rate = 1;
  return u;
}

/** The voice for the language: the device's default one, else one on the device itself (not a network or novelty
 *  voice), else none – then the system picks by the language. */
function pickVoice(s: SpeechSynthesis, lang: string): SpeechSynthesisVoice | null {
  const mine = s.getVoices().filter((x) => x.lang.replace('_', '-').toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
  return mine.find((x) => x.default) ?? mine.find((x) => x.localService && /^(Anna|Helena|Markus|Petra|Yannick|Viktor|Martin|Samantha|Daniel|Karen|Moira|Tessa|Alex)\b/.test(x.name)) ?? null;
}
let micPause: (() => boolean) | null = null;
/** Who listens with the microphone pauses it while the caddie talks: returns true when it was listening. */
export function setMicPause(f: (() => boolean) | null): void {
  micPause = f;
}
let watchdog = 0;

/** Reads text aloud (iPhone Safari supports this). */
export function speak(text: string): boolean {
  const s = synth();
  if (!s || !text.trim()) return false;
  wakeAudio();
  const lang = speechLang();
  const u = utterance(text, lang, pickVoice(s, lang));
  u.onstart = () => window.clearTimeout(watchdog);
  u.onend = () => {
    window.clearTimeout(watchdog);
    if (current === u) setTalking(false);
  };
  u.onerror = u.onend;
  current = u;
  setTalking(true);
  const go = () => {
    if (s.paused) s.resume();
    s.speak(u);
    // never started: once more without a chosen voice – the system's own for the language (a listed voice may not be
    // downloaded on the iPhone and stays silent); then not green for ever – the next tap tries again
    window.clearTimeout(watchdog);
    watchdog = window.setTimeout(() => {
      if (current !== u || s.speaking) return;
      s.cancel();
      if (!u.voice) {
        setTalking(false);
        return;
      }
      const again = utterance(text, lang, null);
      again.onstart = () => window.clearTimeout(watchdog);
      again.onend = () => {
        window.clearTimeout(watchdog);
        if (current === again) setTalking(false);
      };
      again.onerror = again.onend;
      current = again;
      window.setTimeout(() => {
        s.speak(again);
        watchdog = window.setTimeout(() => {
          if (current === again && !s.speaking) {
            s.cancel();
            setTalking(false);
          }
        }, 2500);
      }, 120);
    }, 1500);
  };
  // the microphone off first – the iPhone needs a moment to give the sound back to the loudspeaker
  if (micPause?.()) {
    s.cancel();
    window.setTimeout(go, 400);
    return true;
  }
  // cancel and speak in the same moment leaves Safari silent: a short pause between, only when something was talking
  if (s.speaking || s.pending) {
    s.cancel();
    window.setTimeout(go, 120);
  } else go();
  return true;
}

/** Stops the caddie mid-sentence. */
export function stopSpeaking(): void {
  current = null;
  window.clearTimeout(watchdog);
  synth()?.cancel();
  setTalking(false);
}

/** The read-aloud buttons: a second tap stops him. */
export function toggleSpeak(text: string): void {
  if (talking) stopSpeaking();
  else speak(text);
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

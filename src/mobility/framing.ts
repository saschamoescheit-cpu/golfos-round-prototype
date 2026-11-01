import type { Frame } from './measure';

// Is the player in the picture, and if not, what to do (Sascha 1.11.2026: "tell me whether I am fully in the picture
// or whether I have to put the phone differently, e.g. further away"). The points a test needs and does not see are
// looked at where the model puts them: below the picture = the feet are cut off, above = the head, at a side = off
// the middle; inside the picture but not seen = something covers them (light, clothes, the body itself).

export type Fit = 'none' | 'far' | 'feet' | 'head' | 'side' | 'hidden' | 'turn' | 'ok';

const EDGE = 0.02;

export function fitOf(f: Frame | null, missing: number[], turned: boolean): Fit {
  if (!f) return 'none';
  if (missing.length) {
    const pts = missing.map((i) => f.lm[i]).filter(Boolean);
    const below = pts.some((p) => p.y > 1 - EDGE);
    const above = pts.some((p) => p.y < EDGE);
    if (below && above) return 'far';
    if (below) return 'feet';
    if (above) return 'head';
    if (pts.some((p) => p.x < EDGE || p.x > 1 - EDGE)) return 'side';
    return 'hidden';
  }
  return turned ? 'ok' : 'turn';
}

type T = (en: string, de: string) => string;

/** the words on the screen (short) */
export function fitScreen(fit: Fit, view: 'front' | 'side' | 'floor' | null | undefined, tr: T): string {
  switch (fit) {
    case 'none':
      return tr('No one in the picture – step in front of the phone', 'Niemand im Bild – stell dich vor das Handy');
    case 'far':
      return tr('Not fully in the picture – step further away', 'Nicht ganz im Bild – geh weiter weg');
    case 'feet':
      return tr('The feet are cut off – further away or the phone lower', 'Die Füße fehlen – weiter weg oder das Handy tiefer');
    case 'head':
      return tr('The head is cut off – further away or the phone higher', 'Der Kopf fehlt – weiter weg oder das Handy höher');
    case 'side':
      return tr('Move to the middle of the picture', 'Geh in die Mitte des Bildes');
    case 'hidden':
      return tr('Not everything is visible – more light, nothing in front of the body', 'Nicht alles zu sehen – mehr Licht, nichts vor dem Körper');
    case 'turn':
      return view === 'side' ? tr('Turn side-on to the phone', 'Dreh dich seitlich zum Handy') : tr('Turn face-on to the phone', 'Dreh dich frontal zum Handy');
    case 'ok':
      return tr('Recognised', 'Erkannt');
  }
}

/** the words said aloud (a full sentence) */
export function fitSpeech(fit: Fit, view: 'front' | 'side' | 'floor' | null | undefined, tr: T): string {
  switch (fit) {
    case 'none':
      return tr('I cannot see you yet. Step in front of the phone.', 'Ich sehe dich noch nicht. Stell dich vor das Handy.');
    case 'far':
      return tr('You are not fully in the picture. Step further away.', 'Du bist nicht ganz im Bild. Geh weiter weg.');
    case 'feet':
      return tr('Your feet are not in the picture. Step further away or put the phone lower.', 'Deine Füße sind nicht im Bild. Geh weiter weg oder stell das Handy tiefer.');
    case 'head':
      return tr('Your head is not in the picture. Step further away or put the phone higher.', 'Dein Kopf ist nicht im Bild. Geh weiter weg oder stell das Handy höher.');
    case 'side':
      return tr('Move to the middle of the picture.', 'Geh in die Mitte des Bildes.');
    case 'hidden':
      return tr('I cannot see your whole body. More light, and nothing in front of you.', 'Ich sehe nicht deinen ganzen Körper. Mehr Licht, und nichts vor dir.');
    case 'turn':
      return view === 'side' ? tr('Turn side-on to the phone.', 'Dreh dich seitlich zum Handy.') : tr('Turn face-on to the phone.', 'Dreh dich frontal zum Handy.');
    case 'ok':
      return tr('Person recognised.', 'Person erkannt.');
  }
}

/**
 * When to say the hint: a new hint once it has lasted 1.5 s, the same one again after 6 s at the most often – the
 * player walks to the right place meanwhile and should not be talked over.
 */
export class FitVoice {
  private fit: Fit | null = null;
  private since = 0;
  private said: Fit | null = null;
  private saidAt = -1e9;
  reset() {
    this.fit = null;
    this.said = null;
    this.saidAt = -1e9;
  }
  /** the fit of this picture → the fit to say now, or null */
  push(fit: Fit, now: number): Fit | null {
    if (fit !== this.fit) {
      this.fit = fit;
      this.since = now;
    }
    if (fit === 'ok' || now - this.since < 1500) return null;
    if (fit === this.said && now - this.saidAt < 6000) return null;
    if (now - this.saidAt < 2500) return null;
    this.said = fit;
    this.saidAt = now;
    return fit;
  }
}

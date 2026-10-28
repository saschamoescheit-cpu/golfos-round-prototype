import type { Round } from '../types';

// Signing the round (Sascha 16.10.2026: "wenn eine Runde nachbearbeitet ist, muss man die Runde signieren – wie bei
// einer Scorekarte … nur signierte Runden sollten in Statistiken einfließen"): the player confirms his scores with a
// tap; only signed rounds count in statistics, bests, course records and the measured carries.

export const isSigned = (r: Round): boolean => !!r.finishedAt && !!r.signedAt;

/** The rounds that count in statistics: finished and signed. */
export const statRounds = (rounds: Round[]): Round[] => rounds.filter(isSigned);

/** Finished rounds still waiting for the signature. */
/** Finished rounds the player wants to sign and has not yet – a round only kept as a round (capture 'score') is
 *  done as it is (Sascha 17.10.2026). */
/** A round with a result: at least one hole scored (or picked up). Empty rounds are listed nowhere (Sascha 18.10.2026:
 *  "either I played a round and have a result – or it is not a round"); they stay stored, nothing is deleted. */
export const hasScore = (r: Round): boolean => (r.entries[r.players.find((p) => p.isMe)?.id ?? ''] ?? []).some((e) => e.strokes != null || e.pickedUp);

export const unsignedRounds = (rounds: Round[]): Round[] => rounds.filter((r) => !!r.finishedAt && !r.signedAt && !r.preview && r.capture !== 'score' && hasScore(r));

/** How a round was signed: the last step of the check, "Runde bestätigen" after it, the state on the scorecard – or the
 *  signature withdrawn there. */
export type SignStep = NonNullable<Round['signLog']>[number];
export type SignWay = SignStep['how'];

/** The kind of device, for the round's signing trace: iPhone, iPad, Android, Mac, Windows … ('' when unknown). */
export function deviceName(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): string {
  // an iPad with desktop Safari says "Macintosh" – with touch it is an iPad
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)) return 'iPad';
  return /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
}

// Every signature and every withdrawal goes with the round, with the way and the device (Sascha 28.10.2026: a round
// "jumped to signed by itself" after checking it on the iPad – the next time the trace says where it came from).
const step = (r: Round, how: SignWay, at: string): SignStep[] => [...(r.signLog ?? []), { at, how, device: deviceName() }].slice(-10);
export const sign = (r: Round, how: Exclude<SignWay, 'withdraw'> = 'status'): Round => {
  const at = new Date().toISOString();
  return { ...r, signedAt: at, signLog: step(r, how, at) };
};
export const unsign = (r: Round): Round => ({ ...r, signedAt: null, signLog: step(r, 'withdraw', new Date().toISOString()) });

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
export const unsignedRounds = (rounds: Round[]): Round[] => rounds.filter((r) => !!r.finishedAt && !r.signedAt && !r.preview && r.capture !== 'score');

export const sign = (r: Round): Round => ({ ...r, signedAt: new Date().toISOString() });
export const unsign = (r: Round): Round => ({ ...r, signedAt: null });

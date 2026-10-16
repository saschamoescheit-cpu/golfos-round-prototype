// Test mode (Sascha 16.10.2026: "I could track every shot by hand with a button, to compare it with the shots the
// app detects"): a switch in the profile; on the course a "Shot here" button stores where the ball lay – kept apart
// from the detection as the truth to measure it against (scripts/replay.ts); the round export comes back with it.

const KEY = 'golfos.testmode.v1';

export function isTestMode(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setTestMode(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* this visit only */
  }
}

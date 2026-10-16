import { describe, expect, it } from 'vitest';

// every source file of the app (vite reads them as text); the course data is left out, except the tee colours
const SOURCES = import.meta.glob(['/src/**/*.{ts,tsx,css}', '!/src/**/*.test.ts', '!/src/data/**', '/src/data/tees.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Yellow, amber, gold: hue 38–64°, clearly saturated, neither very dark nor almost white. */
function yellowish(hex: string): boolean {
  const h = hex.length === 4 ? hex.slice(1).split('').map((c) => c + c).join('') : hex.slice(1, 7);
  const [r, g, b] = [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return false;
  const s = l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  let hue = max === r ? (g - b) / (max - min) : max === g ? 2 + (b - r) / (max - min) : 4 + (r - g) / (max - min);
  hue = (hue * 60 + 360) % 360;
  return hue >= 38 && hue <= 64 && s >= 0.45 && l >= 0.3 && l <= 0.88;
}

describe('the CI: no yellow in the app', () => {
  it('no yellow colour in any screen, component or style (hints green, warnings red)', () => {
    const found: string[] = [];
    for (const [f, text] of Object.entries(SOURCES)) {
      text
        .split('\n')
        .forEach((line, k) => {
          if (line.includes('ci-allow')) return;
          for (const m of line.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) if (yellowish(m[0])) found.push(`${f}:${k + 1} ${m[0]}`);
        });
    }
    expect(found).toEqual([]);
  });
  it('the check itself knows yellow from green and red', () => {
    expect(['#f2b53d', '#f6d48a', '#ffd54a', '#ffe14d', '#ffd23f'].every(yellowish)).toBe(true);
    expect(['#9bc53d', '#79a128', '#ff8a7f', '#ff6b5e', '#eef2ec', '#8fa3b0'].some(yellowish)).toBe(false);
  });
});

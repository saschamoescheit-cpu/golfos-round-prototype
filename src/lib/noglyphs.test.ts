import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// No emojis or text signs as icons on the screens (DESIGN: SVG only – Sascha 22.10.2026; night 10./11.11.2026: 👍 ✋ ⛳
// 🐍 🐇 ✎ ★ ⇄ were left). Comments may name them; the training review's Markdown export and the drills' drawn sketches
// write them as text on purpose.
const SIGNS = /[👍✋⛳🐍🐇✎★⇄]/u;
const SKIP = /review\.ts$|sketches\.ts$/;
const root = join(__dirname, '..');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) && !SKIP.test(n) ? [p] : [];
  });

describe('icons are SVG', () => {
  it('no emoji or text sign as an icon in the code of the screens', () => {
    const hits = files(root)
      .flatMap((f) =>
        readFileSync(f, 'utf8')
          .split(/\r?\n/)
          .map((line, k) => ({ f, k: k + 1, code: line.replace(/\/\/.*$/, '') }))
          .filter((x) => !/^\s*(\/\*|\*)/.test(x.code) && SIGNS.test(x.code)),
      )
      .map((x) => `${x.f.slice(root.length + 1)}:${x.k}`);
    expect(hits).toEqual([]);
  }, 30000);
});

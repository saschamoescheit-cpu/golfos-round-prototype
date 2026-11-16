// The translators' parts into one dictionary per language (Sascha 13.11.2026: all languages): src/i18n/parts/<lang>-N.json
// → src/i18n/dict/<lang>.json – only texts the app still has (src/i18n/source.json), a translation with the same slots
// {0} {1} … as its English text; the rest stays English. Usage: node scripts/i18n-merge.mjs [lang …]
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';

const source = JSON.parse(readFileSync('src/i18n/source.json', 'utf8'));
const slots = (s) => (s.match(/\{\d\}/g) ?? []).sort().join();
const LOCALES = new Set(['en', 'en-GB']);
// texts that look like identifiers (lower case with a hyphen) – shown to the player, so they are translated
const HYPHEN_TEXTS = new Set(['one-putts', 'three-putts', '1-putts', '3-putts', 'self-judged', 'right-handed', 'left-handed', '3-wood', 'set-up', 'face-on']);
const langs = process.argv.slice(2).length ? process.argv.slice(2) : [...new Set(readdirSync('src/i18n/parts').map((f) => f.split('-')[0]).filter((l) => l !== 'en'))];
for (const lang of langs) {
  const out = {};
  let bad = 0;
  for (let n = 0; existsSync(`src/i18n/parts/${lang}-${n}.json`); n++) {
    const part = JSON.parse(readFileSync(`src/i18n/parts/${lang}-${n}.json`, 'utf8'));
    for (const [k, v] of Object.entries(part)) {
      if (!(k in source) || typeof v !== 'string' || !v.trim()) continue;
      // a locale or language code ("en-GB", "en"): the app puts the language's own in – only these two; "to", "in", "vs"
      // are words (night 16./17.11.2026: they stayed English in every language)
      if (LOCALES.has(k)) continue;
      // an identifier, not a text (leadElbow, tiger-gate) – but words written with a hyphen are texts
      if (!HYPHEN_TEXTS.has(k) && (/^[a-z]+[A-Z][A-Za-z]*$/.test(k) || /^[a-z0-9]+(-[a-z0-9]+)+$/.test(k))) continue;
      if (slots(k) !== slots(v)) {
        bad++;
        continue;
      }
      if (v !== k) out[k] = v;
    }
  }
  const total = Object.keys(source).length;
  writeFileSync(`src/i18n/dict/${lang}.json`, JSON.stringify(out));
  console.log(`${lang}: ${Object.keys(out).length} of ${total} translated (${bad} with wrong slots left English)`);
}

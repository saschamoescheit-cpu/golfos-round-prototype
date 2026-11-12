// Every text of the app for the translations (Sascha 13.11.2026: "neben Deutsch und Englisch auch alle anderen Sprachen"):
// each tr('English', 'Deutsch') call, its English text the key – a template's `${…}` as {0}, {1} … – written to
// src/i18n/source.json ({ key: German }) for the translators. Usage: node scripts/i18n-extract.mjs
import ts from 'typescript';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f)) files.push(p);
  }
};
walk('src');

/** A literal as a key: its text, each `${…}` a numbered slot. */
function keyOf(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    let s = node.head.text;
    node.templateSpans.forEach((span, i) => (s += `{${i}}` + span.literal.text));
    return s;
  }
  return null;
}

const out = {};
let calls = 0;
let dynamic = 0;
for (const f of files) {
  const src = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'tr' && n.arguments.length === 2) {
      calls++;
      const en = keyOf(n.arguments[0]);
      const de = keyOf(n.arguments[1]);
      if (en == null || de == null) dynamic++;
      else if (!(en in out)) out[en] = de;
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
}
writeFileSync('src/i18n/source.json', JSON.stringify(out, null, 1));
const keys = Object.keys(out);
console.log(`${calls} calls, ${keys.length} texts (${keys.filter((k) => /\{\d\}/.test(k)).length} with slots), ${dynamic} not literal`);

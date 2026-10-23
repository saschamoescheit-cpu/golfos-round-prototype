// A whole round without network on a course in Florida (night run 23./24.10.2026: the test in the USA) – qa/offlineround.mjs
// on Orange Lake Resort – The Legends: kept offline with the US imagery, 9 holes played offline, checked, signed, the
// stats; back online nothing lost.  Usage: node qa/offlineus.mjs [built app url, default the preview :4173]
import { spawn } from 'node:child_process';

const url = process.argv[2] ?? 'http://localhost:4173/';
const c = spawn(process.execPath, [new URL('./offlineround.mjs', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), url, 'Orange Lake', '28.3674', '-81.6071', '18 Löcher'], { stdio: 'inherit' });
c.on('close', (code) => process.exit(code ?? 1));

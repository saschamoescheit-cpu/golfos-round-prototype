// The QA gate of Rounds & Games before going live (night 18./19.10.2026): all browser tests, several at a time, then the
// unit tests. Prints only what failed – and a line per test with its time.
// Usage: node qa/gate.mjs [parallel=4] [http://localhost:PORT/] [--built=http://localhost:PORT2/] [test …]   (the dev
// server on :5173 must run, or the one at the given address – a second copy of the app, so work goes on while the gate
// runs; with --built the vite preview of the same state for the tests that need no source modules)
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';

// every failure with its lines – which tests wobble under load, and why (night run 23./24.10.2026)
const FLAKY_LOG = new URL('./gate-flaky.log', import.meta.url);
const logFail = (name, phase, out) => {
  try {
    const lines = out.split('\n').filter((l) => /^✗|TimeoutError|Error:|waiting for/.test(l.trim())).slice(0, 8).map((l) => '    ' + l.trim().slice(0, 240));
    appendFileSync(FLAKY_LOG, `${new Date().toISOString()} ${name} [${phase}]\n${lines.join('\n')}\n`);
  } catch {
    /* the log is a help only */
  }
};

const ALL = ['rules', 'tournament', 'soundtest', 'chevrons', 'caddievoice', 'profile', 'bin', 'review', 'sign', 'score', 'roundfilter', 'games', 'gamemap', 'modes', 'sticky', 'sgcard', 'hazards', 'usflorida', 'synclive', 'syncpush', 'sharegame', 'het9', 'plan', 'puttzoom', 'plan2d', 'totraining', 'training', 'offline', 'visual', 'gameround', 'weatherdwd', 'greensmade', 'dopimagery', 'stalechunk', 'imageryhang', 'hcpask', 'outages', 'edgehang', 'storagefull', 'photondown', 'staletobin', 'teepick', 'stdtee', 'account', 'holeback', 'finishchoice', 'shothold', 'penaltyrows', 'postround1', 'postround2', 'markerpos', 'offlineround', 'gamebar', 'sharedrating', 'pushnotify', 'voiceask', 'openholes', 'emptytiles', 'help', 'offlineus', 'spread', 'par3target', 'gamefavs', 'whitenumbers', 'offlinetiles', 'reviewwind', 'bookrecord', 'gamestart', 'launchimport', 'rangesession', 'remotesetup', 'hawkslanding', 'octettiles'];
const args = process.argv.slice(2);
const par = Number(args.find((a) => /^\d+$/.test(a)) ?? 3);
const base = args.find((a) => /^https?:/.test(a));
// --built=URL: the built app (vite preview of the same state) for every test that does not load the app's source
// modules itself – under load the dev server dropped single modules ("Importing a module script failed", 27.10.2026)
const built = args.find((a) => a.startsWith('--built='))?.slice(8);
const only = args.filter((a) => !/^\d+$/.test(a) && !/^https?:/.test(a) && !a.startsWith('--'));
// these import src/… in the page – they need the dev server; and those whose answers from a simulated server (Supabase,
// tiles) the built app's service worker takes over on localhost after the first load – its requests pass the test's
// routes (gate 27.10.2026: 401 from the real server; against the live site and the dev server they pass)
const DEV_ONLY = ['bin', 'games', 'gamesim', 'het9', 'rehearsal', 'score', 'synclive', 'syncpush', 'sharegame', 'plan2d', 'usflorida'];
const urlFor = (name) => (/^(offline|push)/.test(name) ? [] : built && !DEV_ONLY.includes(name) ? [built] : base ? [base] : []);
const TIMES_LOG = new URL('./gate-times.log', import.meta.url);
// the longest first, so the run ends together
const SLOW = ['games', 'modes', 'het9', 'training', 'puttzoom', 'score', 'review', 'bin'];
const queue = (only.length ? only : ALL).slice().sort((a, b) => (SLOW.indexOf(a) < 0 ? 99 : SLOW.indexOf(a)) - (SLOW.indexOf(b) < 0 ? 99 : SLOW.indexOf(b)));
const failed = [];
const t0 = Date.now();

function run(cmd, argv, timeoutMs) {
  return new Promise((resolve) => {
    const p = spawn(cmd, argv, { shell: false });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    const timer = setTimeout(() => {
      out += '\n✗ TIMEOUT';
      p.kill();
    }, timeoutMs);
    p.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

async function worker() {
  while (queue.length) {
    const name = queue.shift();
    const s = Date.now();
    const { code, out } = await run(process.execPath, [`qa/${name}.mjs`, ...urlFor(name)], name === 'games' || name === 'modes' ? 1800000 : 900000);
    const bad = out.split('\n').filter((l) => /^✗|TimeoutError|Error:/.test(l.trim()));
    const secs = Math.round((Date.now() - s) / 1000);
    try {
      appendFileSync(TIMES_LOG, `${new Date().toISOString()} ${name} ${secs}s ${bad.length || code ? 'fail' : 'ok'}${built && !DEV_ONLY.includes(name) ? ' built' : ''}\n`);
    } catch {
      /* the log is a help only */
    }
    if (bad.length || code) {
      failed.push(name);
      logFail(name, "pool", out);
      console.log(`✗ ${name} (${secs} s)\n   ${bad.slice(0, 6).join('\n   ') || 'exit ' + code}`);
    } else console.log(`✓ ${name} (${secs} s)`);
  }
}

await Promise.all(Array.from({ length: par }, worker));
// a test that failed among others runs once more on its own – the load of four browsers at a time can make a test
// miss a timing; a real failure fails again
for (const name of failed.splice(0)) {
  const { code, out } = await run(process.execPath, [`qa/${name}.mjs`, ...urlFor(name)], name === 'games' || name === 'modes' ? 1800000 : 900000);
  const bad = out.split('\n').filter((l) => /^✗|TimeoutError|Error:/.test(l.trim()));
  if (bad.length || code) {
    failed.push(name);
    logFail(name, "alone", out);
    console.log(`✗ ${name} again on its own\n   ${bad.slice(0, 6).join('\n   ')}`);
  } else console.log(`✓ ${name} on its own (it failed among the others)`);
}
if (!only.length) {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const v = await new Promise((resolve) => {
    const p = spawn(npx + ' vitest run', { shell: true });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', () => resolve(out));
  });
  const line = String(v).split('\n').find((l) => /Tests\s/.test(l)) ?? 'vitest: no result';
  console.log(line.replace(/\x1b\[[0-9;]*m/g, '').trim());
  if (/failed/.test(line)) failed.push('vitest');
}
console.log(`== done in ${Math.round((Date.now() - t0) / 60000)} min · ${failed.length ? 'FAILED: ' + failed.join(', ') : 'all green'}`);
process.exit(failed.length ? 1 : 0);

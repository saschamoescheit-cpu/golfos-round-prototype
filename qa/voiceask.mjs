// QA (Pre-Final, Sascha 23.10.2026): "Per Sprache fragen" ends by itself after a pause – or with "Fertig – fragen" – and
// the answer follows (Safari's recognition often never ends on its own: here it never does); the hole note shows in the
// caddie, a green dot on "Lochnotizen" when the hole has one (own text or a choice), and the note in the Birdiebook.
// Usage: node qa/voiceask.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
await mockNet(ctx);
await ctx.addInitScript(() => {
  const w = window;
  w.__said = [];
  const fake = { speaking: false, pending: false, paused: false, getVoices: () => [{ lang: 'de-DE', name: 'Anna' }], speak(u) { w.__said.push(u.text); }, cancel() {}, resume() {} };
  Object.defineProperty(w, 'speechSynthesis', { value: fake, configurable: true });
  w.SpeechSynthesisUtterance = function (t) { this.text = t; };
  // a recognition like Safari's on the iPhone: words while spoken, but it never ends by itself
  w.__recStops = 0;
  w.__words = ['Welcher', 'Welcher Schläger']; // what the player says, one step every 300 ms
  w.webkitSpeechRecognition = function () {
    const r = this;
    let timer = null;
    r.start = () => {
      let n = 0;
      const said = w.__words.slice();
      const step = () => {
        if (n >= said.length) return; // silence – and no end
        const t = said[n++];
        r.onresult?.({ results: [{ 0: { transcript: t }, isFinal: false, length: 1 }] });
        timer = setTimeout(step, w.__gap ?? 300);
      };
      timer = setTimeout(step, 300);
    };
    r.stop = () => {
      w.__recStops++;
      clearTimeout(timer);
    };
    r.abort = () => clearTimeout(timer);
  };
});
const p = await ctx.newPage();
const errs = [];
// leaving the hole map while it still loads parts of the app: WebKit reports the cut-off load – only then (as photondown)
let leaving = false;
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com)\/\S* due to access control/.test(e.message) && !(leaving && /Importing a module script failed/.test(e.message))) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
await p.goto(url);
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('golfos.intro.v1', '1'); localStorage.setItem('golfos.tip.shots.v1', '1'); sessionStorage.setItem('golfos.module', 'rounds'); });
await p.reload();
await p.waitForTimeout(800);
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.waitForTimeout(1500);
await p.fill('#course-search', 'Hetzenhof');
await p.waitForTimeout(2000);
await p.locator('button.list-item').first().click();
await p.getByText('Runde starten').waitFor({ timeout: 30000 });
await p.getByRole('button', { name: /A · 9 Löcher/ }).click();
await p.getByText('Runde starten').click();
await p.waitForTimeout(5000);
await p.getByRole('button', { name: /Caddie zeigen/ }).click();
await p.waitForTimeout(800);

// ---------- hole notes in the caddie ----------
const card = p.locator('.caddie-card');
const notesBtn = card.getByRole('button', { name: /^Lochnotizen/ });
// 1A has the club's choices (out of bounds left and right): a note – the dot and the row
ok((await notesBtn.locator('.note-dot').count()) === 1, '1A has a note (the choices out of bounds left and right): green dot on "Lochnotizen"');
ok(/Deine Notiz\s+Aus links und rechts/.test(await card.innerText()), `the note in the caddie: "${(await card.locator('.caddie-note').innerText().catch(() => '')).trim()}"`);
await notesBtn.click();
await p.waitForTimeout(400);
await p.fill('#hole-note', 'Blinder Abschlag – auf den rechten Baum');
await p.getByRole('button', { name: 'Für diesen Platz speichern' }).click();
await p.waitForTimeout(500);
const cardText = await card.innerText();
ok(/Deine Notiz\s+Blinder Abschlag – auf den rechten Baum · Aus links und rechts/.test(cardText), 'the own text shows in the caddie at once');
ok(cardText.split('Blinder Abschlag').length === 2, 'once in the card, not also as a caddie line');
// no note at all (text emptied, choices off): no dot, no row – then the text again
await notesBtn.click();
await p.waitForTimeout(300);
await p.getByRole('button', { name: /Aus links/ }).click();
await p.getByRole('button', { name: /Aus rechts/ }).click();
await p.fill('#hole-note', '');
await p.getByRole('button', { name: 'Für diesen Platz speichern' }).click();
await p.waitForTimeout(500);
ok((await notesBtn.locator('.note-dot').count()) === 0 && (await card.locator('.caddie-note').count()) === 0, 'no note left: no dot, no row');
await notesBtn.click();
await p.waitForTimeout(300);
await p.fill('#hole-note', 'Blinder Abschlag – auf den rechten Baum');
await p.getByRole('button', { name: 'Für diesen Platz speichern' }).click();
await p.waitForTimeout(500);
ok((await notesBtn.locator('.note-dot').count()) === 1, 'the own text alone: the dot again');
if (process.env.SHOTS) await card.screenshot({ path: `${process.env.SHOTS}/caddie-note.png` });

// ---------- ask by voice ----------
await card.getByRole('button', { name: 'Fragen' }).click();
await p.waitForTimeout(500);
const mic = p.getByRole('button', { name: 'Per Sprache fragen' });
ok(await mic.isVisible(), '"Per Sprache fragen"');
await mic.click();
await p.waitForTimeout(450);
ok(await p.getByRole('button', { name: 'Fertig – fragen' }).isVisible(), 'while listening: "Fertig – fragen" to end it');
await p.waitForTimeout(500);
ok(/„Welcher Schläger“ …/.test(await p.getByRole('status').innerText().catch(() => '')), 'the words show while spoken');
// the player stops talking: after the pause the question is asked – the recognition itself never ended
await p.waitForTimeout(2200);
const sheet = p.getByRole('dialog', { name: 'Frag deinen Caddie' });
const txt = await sheet.innerText();
ok(/„Welcher Schläger“/.test(txt) && (await p.getByRole('button', { name: 'Per Sprache fragen' }).isVisible()), 'a pause ends it by itself: the question asked, the button back');
ok((await p.evaluate(() => window.__recStops)) >= 1, 'the microphone stopped');
const answered = await p.evaluate(() => window.__said.slice(-1)[0] ?? '');
ok(answered.length > 5, `the answer follows (read aloud: "${answered.slice(0, 60)}")`);
// talking on and on: "Fertig – fragen" ends it, the answer to what was heard
await p.evaluate(() => {
  window.__words = ['Wie', 'Wie weit', 'Wie weit ist', 'Wie weit ist es', 'Wie weit ist es noch', 'Wie weit ist es noch bis', 'Wie weit ist es noch bis zur', 'Wie weit ist es noch bis zur Fahne'];
  window.__gap = 400;
});
await p.getByRole('button', { name: 'Per Sprache fragen' }).click();
await p.waitForTimeout(1300);
await p.getByRole('button', { name: 'Fertig – fragen' }).click();
await p.waitForTimeout(600);
const txt2 = await sheet.innerText();
ok(/„Wie weit[^“]*“/.test(txt2) && (await p.getByRole('button', { name: 'Per Sprache fragen' }).isVisible()), `"Fertig – fragen" ends it: ${(txt2.match(/„Wie weit[^“]*“/) ?? ['?'])[0]}`);
// closing the sheet while listening switches the microphone off
const stops = await p.evaluate(() => window.__recStops);
await p.getByRole('button', { name: 'Per Sprache fragen' }).click();
await p.waitForTimeout(300);
await sheet.getByRole('button', { name: 'Schließen' }).click();
await p.waitForTimeout(300);
ok((await p.evaluate(() => window.__recStops)) > stops, 'the sheet closed while listening: the microphone off');

// ---------- the Birdiebook ----------
leaving = true;
await p.goto(url);
await p.evaluate(() => {
  sessionStorage.setItem('golfos.module', 'rounds');
  const rs = JSON.parse(localStorage.getItem('golfos.rounds.v1') ?? '[]');
  localStorage.setItem('golfos.rounds.v1', JSON.stringify(rs.map((r) => ({ ...r, finishedAt: r.finishedAt ?? new Date().toISOString() }))));
});
await p.reload();
await p.waitForTimeout(1200);
leaving = false;
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.fill('#course-search', 'Hetzenhof');
await p.waitForTimeout(2000);
await p.locator('button.list-item').first().click();
await p.getByText('Runde starten').waitFor({ timeout: 30000 });
await p.getByRole('button', { name: /A · 9 Löcher/ }).click();
await p.getByRole('button', { name: 'Birdiebook' }).click();
await p.waitForTimeout(3000);
const page1 = p.locator('section.book-hole').first();
const t1 = await page1.innerText();
ok(/Deine Lochnotiz/i.test(t1) && /Blinder Abschlag – auf den rechten Baum/.test(t1), 'the Birdiebook shows the hole note of 1A');
ok(t1.split('Blinder Abschlag – auf den rechten Baum').length === 2, 'the note once on the page, not also among the caddie lines');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);

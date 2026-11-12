// The statistics' topics since the Facelift (11.11.2026, R13): the switch "‹ Abschlag ›" labelled "Thema" – a tap on it
// lists all topics in a sheet. Helpers for the tests that went to a topic by its chip before.
// Usage: import { pickTopic, topicNames } from './topic.mjs'; await pickTopic(p, 'Schläger');

/** Opens the topic named (a string – the whole name – or a RegExp) from the switch's sheet. */
export async function pickTopic(p, name) {
  await p.getByRole('group', { name: 'Thema' }).locator('.step-pick-now').click();
  const dlg = p.getByRole('dialog', { name: 'Thema' });
  await dlg.waitFor({ timeout: 5000 });
  const names = (await dlg.locator('.pick-option strong').allInnerTexts()).map((t) => t.trim());
  const k = names.findIndex((n) => (typeof name === 'string' ? n === name : name.test(n)));
  if (k < 0) throw new Error(`no topic ${name} in ${names.join(' · ')}`);
  await dlg.locator('.pick-option').nth(k).click();
  await p.waitForTimeout(250);
}

/** The names of all topics, in order (from the switch's sheet, closed again). */
export async function topicNames(p) {
  await p.getByRole('group', { name: 'Thema' }).locator('.step-pick-now').click();
  const dlg = p.getByRole('dialog', { name: 'Thema' });
  await dlg.waitFor({ timeout: 5000 });
  const names = (await dlg.locator('.pick-option strong').allInnerTexts()).map((t) => t.trim());
  await dlg.getByRole('button', { name: 'Schließen' }).click();
  await p.waitForTimeout(200);
  return names;
}

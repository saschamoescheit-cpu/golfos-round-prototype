// The statistics' topics as tabs (Sascha 16.11.2026: "den Filter darunter lieber in Tabs darstellen" – the scorecard's
// tab row; from the Facelift 11.11.2026 to then the switch "‹ Abschlag ›"). Helpers for the tests that go to a topic.
// Usage: import { pickTopic, topicNames } from './topic.mjs'; await pickTopic(p, 'Schläger');

const tabs = (p) => p.getByRole('tablist', { name: 'Thema' });

/** Opens the topic named (a string – the whole name – or a RegExp) by its tab. */
export async function pickTopic(p, name) {
  const names = (await tabs(p).getByRole('tab').allInnerTexts()).map((t) => t.trim());
  const k = names.findIndex((n) => (typeof name === 'string' ? n === name : name.test(n)));
  if (k < 0) throw new Error(`no topic ${name} in ${names.join(' · ')}`);
  await tabs(p).getByRole('tab').nth(k).click();
  await p.waitForTimeout(250);
}

/** The names of all topics, in order. */
export async function topicNames(p) {
  return (await tabs(p).getByRole('tab').allInnerTexts()).map((t) => t.trim());
}

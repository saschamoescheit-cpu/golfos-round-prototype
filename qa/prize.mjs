// QA helper (03.11.2026): "Worum wird gespielt" has no default – a new game waits for it. Money in euro, as the tests
// played before; nothing when it is chosen already (or the page has no such row).
export async function pickPrize(p, kind = 'Geld', then = 'Euro (€)') {
  const row = p.locator('.settings-row').filter({ hasText: 'Worum wird gespielt' }).first();
  if (!(await row.count()) || !/Bitte wählen/.test(await row.innerText().catch(() => ''))) return;
  await row.click();
  await p.locator('.pick-option').filter({ hasText: kind }).first().click();
  if (then) await p.locator('.pick-option').filter({ hasText: then }).first().click().catch(() => {});
  await p.waitForTimeout(150);
}

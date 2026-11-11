// Since 11.11.2026 (Sascha, design round 4: "ohne Schieberegler – in der gesamten App") a yes/no setting is a row with
// "An" / "Aus" on the right (OnOffRow) – a tap opens its sheet with both; a list of several (players, rounds, extras) is
// ticked (TickRow, role "checkbox"). These helpers find, read and flip such a row for the tests that used the sliders.
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** the An/Aus row named so (a string: its label exactly; a RegExp: matched against "Label: An") */
export const onOff = (scope, name) => scope.locator('.onoff-row').and(scope.getByRole('button', { name: typeof name === 'string' ? new RegExp(`^${esc(name)}: (An|Aus)$`) : name })).first();

/** on? */
export const isOn = async (row) => (await row.getAttribute('data-on')) === 'true';

/** the other one picked in its sheet – as a finger does: tap the row, tap "An" or "Aus" */
export async function flip(row) {
  const page = row.page();
  await row.click();
  const sheet = page.locator('.sheet[role="dialog"]').last();
  await sheet.locator('.pick-option[aria-pressed="false"]').first().click();
  await page.waitForTimeout(200);
}

/** set it to on / off (nothing done when it is so already) */
export async function setOnOff(row, on) {
  if ((await isOn(row)) !== on) await flip(row);
}

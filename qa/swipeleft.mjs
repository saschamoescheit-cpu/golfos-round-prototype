// A row of SwipeRow swiped left by a finger (the mouse's pointer events, as qa/swipe.mjs) – a little: its action shows
// at the right edge; `all`: across, the action at once. Then `tapAction` taps the action where a finger would.
export async function swipeLeft(page, row, dx = 90) {
  await row.scrollIntoViewIfNeeded();
  const box = await row.boundingBox();
  const x = box.x + box.width * 0.7;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x - (dx * i) / 8, y);
  await page.mouse.up();
  await page.waitForTimeout(450);
}
export async function tapAction(action) {
  const box = await action.boundingBox();
  await action.click({ position: { x: box.width - 40, y: box.height / 2 } });
}

// QA helper (16.11.2026): a green is drawn round with one finger in "Loch einrichten" – the mouse goes once round an
// ellipse (rx, ry in screen pixels) about the point (x, y) and lets go where it started.
export async function drawGreen(p, x, y, rx = 30, ry = 20) {
  await p.mouse.move(x + rx, y);
  await p.mouse.down();
  for (let a = 0.2; a <= Math.PI * 2 + 0.01; a += 0.2) await p.mouse.move(x + rx * Math.cos(a), y + ry * Math.sin(a), { steps: 2 });
  await p.mouse.move(x + rx, y + 1);
  await p.mouse.up();
  await p.waitForTimeout(600);
}

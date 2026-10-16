// The drawn tree crowns of the 2D view (as in BeBrassie): a round crown of a few leaf clusters with a soft shadow,
// lit from the top left. Three looks so a wood does not repeat one stamp. Drawn once on a canvas, added to the map.

const LOOKS = [
  { base: '#2f7f35', dark: '#1d5a24', light: '#5aa84a' },
  { base: '#3a8a2f', dark: '#245f1f', light: '#6bb54c' },
  { base: '#2b7442', dark: '#1a4f2c', light: '#53a061' },
];

/** One crown as image data (64 × 64 px, shown at pixel ratio 2), or null where there is no canvas (tests). */
export function treeImage(look: number): ImageData | null {
  if (typeof document === 'undefined') return null;
  const S = 64;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const g = cv.getContext('2d');
  if (!g) return null;
  const c = LOOKS[look % LOOKS.length];
  const R = 22;
  const cx = 30;
  const cy = 30;
  // shadow to the bottom right
  g.fillStyle = 'rgba(10, 30, 10, 0.28)';
  g.beginPath();
  g.ellipse(cx + 5, cy + 6, R, R * 0.92, 0, 0, Math.PI * 2);
  g.fill();
  // the crown: leaf clusters around the middle
  const lobes = 7;
  const pts: [number, number, number][] = [[cx, cy, R * 0.62]];
  for (let k = 0; k < lobes; k++) {
    const a = (k / lobes) * Math.PI * 2 + look * 0.7;
    const r = R * (0.5 + 0.08 * ((k * 7 + look * 3) % 3));
    pts.push([cx + Math.cos(a) * R * 0.45, cy + Math.sin(a) * R * 0.45, r]);
  }
  // dark rim first, then the lit body
  g.fillStyle = c.dark;
  for (const [x, y, r] of pts) {
    g.beginPath();
    g.arc(x, y, r + 1.4, 0, Math.PI * 2);
    g.fill();
  }
  for (const [x, y, r] of pts) {
    const grad = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    grad.addColorStop(0, c.light);
    grad.addColorStop(0.55, c.base);
    grad.addColorStop(1, c.dark);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // a few light leaf flecks
  g.fillStyle = 'rgba(190, 235, 150, 0.35)';
  for (let k = 0; k < 9; k++) {
    const a = k * 2.4 + look;
    const r = R * 0.55 * ((k % 3) / 3 + 0.2);
    g.beginPath();
    g.arc(cx - 4 + Math.cos(a) * r, cy - 4 + Math.sin(a) * r, 1.8, 0, Math.PI * 2);
    g.fill();
  }
  return g.getImageData(0, 0, S, S);
}

export const TREE_LOOKS = LOOKS.length;

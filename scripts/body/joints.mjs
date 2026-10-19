// joint positions of the realistic body (Blender coords: x left, y back, z up; metres), left side; the right side mirrors x
import fs from 'fs';
const { W, a, b, n } = JSON.parse(fs.readFileSync(process.argv[2]));
const H = (bb, aa, nn) => W.map((w, i) => w + (bb * b[i] + aa * a[i] + nn * n[i]) / 1000);
const J = {
  pelvis: [0, 0, 0.886], spine: [0, 0.015, 0.992], chest: [0, 0.02, 1.185], neck: [0, -0.005, 1.426], head: [0, -0.025, 1.513], headTop: [0, -0.03, 1.68],
  shoulder: [0.172, 0.005, 1.375], elbow: [0.293, 0.005, 1.085], wrist: [0.373, -0.061, 0.885],
  hip: [0.085, -0.005, 0.886], knee: [0.134, 0.02, 0.465], ankle: [0.172, 0.045, 0.075], toe: [0.205, -0.09, 0.025],
  handEnd: H(-52, 99, 18),
};
const F = {
  index: [[-80, 100, 8], [-87, 134, 3], [-92, 154, -2], [-94, 163, -4]],
  middle: [[-52, 99, 20], [-64, 143, 23], [-72, 168, 17], [-73, 181, 15]],
  ring: [[-27, 98, 26], [-37, 142, 31], [-40, 167, 23], [-42, 181, 20]],
  little: [[-2, 102, 28], [1, 137, 36], [4, 156, 36], [5, 168, 37]],
  thumb: [[-37, 32, -22], [-66, 57, -33], [-85, 77, -42], [-96, 87, -47]],
};
for (const [k, pts] of Object.entries(F)) J[k] = pts.map((p) => H(...p));
J.handFrame = { W, a, b, n };
fs.writeFileSync(process.argv[3], JSON.stringify(J, null, 1));
console.log('ok', Object.keys(J).length);

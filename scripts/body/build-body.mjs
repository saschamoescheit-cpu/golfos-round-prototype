// Builds the realistic body asset for the shared 3D golfer from Blender's CC0 "Human Base Meshes" (realistic male, base
// level), rigged with automatic weights to our skeleton (rigit.py). Output: a TS module with the mesh as base64 and the
// bind frames of every bone. Usage: node build-body.mjs rigged.json joints.json out.ts
import fs from 'fs';
const [, , RIG, JOINTS, OUT] = process.argv;
const R = JSON.parse(fs.readFileSync(RIG));
const J = JSON.parse(fs.readFileSync(JOINTS));
const S = 1.038; // the rig's height: hip joint 0.92 m
const T = (p) => [p[0] * S, p[2] * S, -p[1] * S]; // Blender (x left, y back, z up) → three (x left, y up, z front)
const sub = (a, b) => a.map((x, i) => x - b[i]);
const add = (a, b) => a.map((x, i) => x + b[i]);
const mul = (a, k) => a.map((x) => x * k);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(...a);
const nrm = (a) => mul(a, 1 / len(a));
const perp = (v, axis) => nrm(sub(v, mul(axis, dot(v, axis))));

// ---------- joints and bind frames (three coords) ----------
const P = {}; // joint positions
const mir = (p, s) => [p[0] * s, p[1], p[2]];
for (const k of ['pelvis', 'spine', 'chest', 'neck', 'head', 'headTop']) P[k] = T(J[k]);
const FINGERS = ['index', 'middle', 'ring', 'little', 'thumb'];
for (const [s, sx] of [['L', 1], ['R', -1]]) {
  for (const k of ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle', 'toe', 'handEnd']) P[k + s] = T(mir(J[k], sx));
  for (const f of FINGERS) J[f].forEach((p, i) => (P[`${f}${i}${s}`] = T(mir(p, sx))));
}
// a frame: columns x, y, z (unit vectors) and the origin
const frame = (o, y, zHint, xHint) => {
  if (xHint) {
    const x = perp(xHint, y);
    return { o, x, y, z: cross(x, y) };
  }
  const z = perp(zHint, y);
  return { o, x: cross(y, z), y, z };
};
const F = {};
const UP = [0, 1, 0], FWD = [0, 0, 1];
for (const k of ['pelvis', 'spine', 'chest', 'neck', 'head']) F[k] = { o: P[k], x: [1, 0, 0], y: UP, z: FWD };
const L = {}; // segment lengths for the realistic rig
for (const [s, sx] of [['L', 1], ['R', -1]]) {
  // the hand: fingers along −y, the thumb side +z (left hand; the right hand mirrors), palm towards −x (left)
  const hf = J.handFrame; // Blender coords: a along the hand, b across (thumb side −b), n palm normal outward (left hand)
  const a3 = nrm(T(mir(hf.a, sx))), b3 = nrm(T(mir(hf.b, sx))), n3 = nrm(T(mir(hf.n, sx)));
  // left hand: x = n, y = −a, z = −b; the right hand is the mirror image: the same anatomical axes give x = −n
  const hy = mul(a3, -1);
  const hz = mul(b3, -1);
  const handZ = hz;
  F['wrist' + s] = frame(P['wrist' + s], hy, hz);
  const upperY = nrm(sub(P['shoulder' + s], P['elbow' + s]));
  const foreY = nrm(sub(P['elbow' + s], P['wrist' + s]));
  // the arm hangs with the elbow bending forward: its hinge across the body; the forearm takes the hand's twist
  F['shoulder' + s] = frame(P['shoulder' + s], upperY, perp(handZ, upperY));
  F['elbow' + s] = frame(P['elbow' + s], foreY, handZ);
  L['upperArm'] = len(sub(P['elbowL'], P['shoulderL']));
  L['forearm'] = len(sub(P['wristL'], P['elbowL']));
  for (const f of FINGERS) {
    for (let i = 0; i < 3; i++) {
      const y = nrm(sub(P[`${f}${i}${s}`], P[`${f}${i + 1}${s}`]));
      // fingers curl about their z (the thumb side); the thumb's own axes follow the palm normal
      F[`${f}${i}${s}`] = f === 'thumb' ? frame(P[`${f}${i}${s}`], y, null, sx > 0 ? n3 : mul(n3, 1)) : frame(P[`${f}${i}${s}`], y, handZ);
    }
  }
  F['hip' + s] = frame(P['hip' + s], nrm(sub(P['hip' + s], P['knee' + s])), FWD);
  F['knee' + s] = frame(P['knee' + s], nrm(sub(P['knee' + s], P['ankle' + s])), FWD);
  // the ankle: upright, +z along the foot (the mesh's toes point a little out)
  const foot = sub(P['toe' + s], P['ankle' + s]);
  F['ankle' + s] = frame(P['ankle' + s], UP, [foot[0], 0, foot[2]]);
}
L.thigh = len(sub(P.kneeL, P.hipL));
L.shin = len(sub(P.ankleL, P.kneeL));

// ---------- the mesh ----------
const B = R.v.map((p) => p.slice()); // Blender coords (the tests below), grows with the cut edges
const boneIx = Object.fromEntries(R.bones.map((b, i) => [b, i]));
const W = R.w.map((ws) => {
  const tot = ws.reduce((s, x) => s + x[0], 0);
  return ws.map(([w, b]) => [boneIx[b], w / tot]);
});
let tris = [];
for (const poly of R.f) for (let i = 1; i < poly.length - 1; i++) tris.push([poly[0], poly[i], poly[i + 1]]);
const domOf = (ws) => R.bones[ws.slice().sort((p, q) => q[1] - p[1])[0][0]];
const triDom = (t) => {
  const tot = {};
  for (const i of t) for (const [bi, w] of W[i]) tot[bi] = (tot[bi] ?? 0) + w;
  return R.bones[Object.entries(tot).sort((p, q) => q[1] - p[1])[0][0]];
};
const mixW = (a, b, k) => {
  const tot = {};
  for (const [bi, w] of W[a]) tot[bi] = (tot[bi] ?? 0) + w * (1 - k);
  for (const [bi, w] of W[b]) tot[bi] = (tot[bi] ?? 0) + w * k;
  const ws = Object.entries(tot).map(([bi, w]) => [Number(bi), w]).sort((p, q) => q[1] - p[1]).slice(0, 4);
  const s = ws.reduce((x, y) => x + y[1], 0);
  return ws.map(([bi, w]) => [bi, w / s]);
};
// cuts every triangle that a border crosses along that border (f = 0), so sleeves, belt, glove and hair line end on a
// clean line instead of the mesh's stairs
const edgeCut = new Map();
const cut = (field, applies) => {
  const out = [];
  for (const t of tris) {
    if (!applies(t)) { out.push(t); continue; }
    const f = t.map((i) => field(B[i]));
    const pos = f.map((x) => x >= 0);
    if (pos[0] === pos[1] && pos[1] === pos[2]) { out.push(t); continue; }
    // the lone vertex on one side
    const lone = pos[0] === pos[1] ? 2 : pos[0] === pos[2] ? 1 : 0;
    const a = t[lone], b = t[(lone + 1) % 3], c = t[(lone + 2) % 3];
    const fa = f[lone], fb = f[(lone + 1) % 3], fc = f[(lone + 2) % 3];
    const at = (p, q, fp, fq) => {
      const key = p < q ? `${p}_${q}` : `${q}_${p}`;
      if (edgeCut.has(key)) return edgeCut.get(key);
      const k = fp / (fp - fq);
      B.push(B[p].map((x, i) => x + (B[q][i] - x) * k));
      W.push(mixW(p, q, k));
      edgeCut.set(key, B.length - 1);
      return B.length - 1;
    };
    const ab = at(a, b, fa, fb), ac = at(a, c, fa, fc);
    out.push([a, ab, ac], [ab, b, c], [ab, c, ac]);
  }
  tris = out;
  edgeCut.clear();
};
const along = (p, from, to) => { const d = sub(to, from); return dot(sub(p, from), d) / dot(d, d); };
// the cap line: from the forehead down towards the back of the head
const capLine = (y) => 1.632 + ((y + 0.1) / 0.16) * (1.565 - 1.632);
const neckLine = (y) => 1.418 + 0.03 * Math.min(1, Math.max(0, (y + 0.02) / 0.1));
const isEar = (x, y, z) => Math.abs(x) > 0.079 && z > 1.515 && z < 1.625 && y > -0.075 && y < 0.012;
const isHair = (x, y, z) => {
  if (isEar(x, y, z)) return false;
  const ax = Math.abs(x);
  // the back of the head down to the nape (the hairline curves up a little at the sides of the neck)
  if (y > 0.005 && z > 1.495 + 0.25 * Math.max(0, ax - 0.03)) return true;
  // the sides: behind a line in front of the ear (a short sideburn), above the middle of the ear
  if (ax > 0.055 && y > -0.078 && z > 1.555) return true;
  // the temples up to the cap
  if (ax > 0.05 && y > -0.1 && z > 1.6) return true;
  return false;
};
const isTorso = (d) => /^(pelvis|spine|chest|hip|knee|ankle)/.test(d);
const isArm = (d) => /^(shoulder|elbow|wrist|index|middle|ring|little|thumb)/.test(d);
const tDom = (t) => triDom(t);
const shoeTop = (p) => 0.072 + 0.022 * Math.min(1, Math.max(0, (p[1] - 0.0) / 0.08));
cut((p) => p[2] - shoeTop(p), (t) => /^(ankle|knee)/.test(tDom(t)));
cut((p) => p[2] - 0.022, (t) => /^(ankle|knee)/.test(tDom(t)));
cut((p) => p[2] - 0.956, (t) => isTorso(tDom(t)) || /^shoulder/.test(tDom(t)));
cut((p) => p[2] - 0.988, (t) => isTorso(tDom(t)) || /^shoulder/.test(tDom(t)));
cut((p) => p[2] - neckLine(p[1]), (t) => /^(chest|neck|spine)/.test(tDom(t)));
for (const sx of [1, -1]) cut((p) => along(p, mir(J.shoulder, sx), mir(J.elbow, sx)) - 0.6, (t) => /^(shoulder|elbow)/.test(tDom(t)) && Math.sign(B[t[0]][0]) === sx);
cut((p) => along(p, J.elbow, J.wrist) - 0.94, (t) => /^(elbow|wrist)/.test(tDom(t)) && B[t[0]][0] > 0);
cut((p) => p[2] - (capLine(p[1]) - 0.024), (t) => /^(head|neck)/.test(tDom(t)));

// regions: 0 skin, 1 shirt, 2 trousers, 3 shoe, 4 sole, 5 glove, 6 cap, 7 hair, 8 belt, 9 eye white, 10 iris, 11 visor
// underside – per triangle, by its centre and its strongest bone
const classify = (p, d) => {
  const [x, y, z] = p;
  const sx = x > 0 ? 1 : -1;
  if (z < shoeTop(p) && /^(ankle|knee)/.test(d)) return z < 0.022 ? 4 : 3;
  if (/^ankle/.test(d)) return 2; // above the shoe: the trouser leg reaches down to it
  if (isArm(d)) {
    const tS = along(p, mir(J.shoulder, sx), mir(J.elbow, sx));
    const tF = along(p, mir(J.elbow, sx), mir(J.wrist, sx));
    if (/^shoulder/.test(d) && tS < 0.6) return 1;
    if (sx > 0 && (/^(wrist|index|middle|ring|little|thumb)/.test(d) || tF > 0.94)) return 5;
    return 0;
  }
  if (/^(pelvis|hip|knee)/.test(d) || (/^spine/.test(d) && z < 0.97)) return z > 0.956 && z < 0.988 && Math.abs(x) < 0.22 ? 8 : z >= 0.988 ? 1 : 2;
  if (/^(spine|chest)/.test(d)) return z > 0.956 && z < 0.988 ? 8 : z > neckLine(y) ? 0 : 1;
  if (/^(head|neck)/.test(d) && z > capLine(y) - 0.024 && z > 1.5) return 7;
  return 0;
};
const triReg0 = tris.map((t) => classify([0, 1, 2].map((k) => (B[t[0]][k] + B[t[1]][k] + B[t[2]][k]) / 3), triDom(t)));
const V = B.map(T);
const nV = V.length;
const normalsOf = (P, list) => {
  const N = P.map(() => [0, 0, 0]);
  for (const [a, b, c] of list) {
    const n = cross(sub(P[b], P[a]), sub(P[c], P[a]));
    for (const i of [a, b, c]) for (let k = 0; k < 3; k++) N[i][k] += n[k];
  }
  return N.map((n) => (len(n) ? nrm(n) : [0, 1, 0]));
};
const nb = V.map(() => new Set());
const vTris = V.map(() => []);
tris.forEach(([a, b, c], ti) => { nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b); for (const i of [a, b, c]) vTris[i].push(ti); });
const cloth = (r) => r === 1 || r === 2 || r === 8;
const OFF = { 1: 0.006, 2: 0.008, 8: 0.01, 3: 0.009, 4: 0.011, 5: 0.0015 };
// a vertex inside a region takes its offset; on a border it stays (a sleeve or a trouser leg ends close on the skin)
const vOff = V.map((_, i) => { const rs = new Set(vTris[i].map((ti) => triReg0[ti])); return rs.size === 1 ? OFF[[...rs][0]] ?? 0 : 0; });
const allCloth = (i) => vTris[i].every((ti) => cloth(triReg0[ti]));
for (let it = 0; it < 10; it++) {
  const next = V.map((p) => p.slice());
  for (let i = 0; i < nV; i++) {
    if (!allCloth(i) || vOff[i] === 0) continue;
    const m = [0, 0, 0]; for (const j of nb[i]) for (let k = 0; k < 3; k++) m[k] += V[j][k] / nb[i].size;
    next[i] = add(V[i], mul(sub(m, V[i]), 0.5));
  }
  for (let i = 0; i < nV; i++) V[i] = next[i];
}
// one more step: the border vertices of cloth half out, so the edge is a soft hem, not a step
const N1 = normalsOf(V, tris);
for (let i = 0; i < nV; i++) {
  let off = vOff[i];
  if (!off) { const rs = vTris[i].map((ti) => OFF[triReg0[ti]] ?? 0); off = Math.min(...rs) > 0 ? Math.min(...rs) : Math.max(...rs) * 0.35; }
  if (off) V[i] = add(V[i], mul(N1[i], off));
}
for (let i = 0; i < nV; i++) if (vTris[i].some((ti) => triReg0[ti] === 4)) V[i][1] = Math.max(0, Math.min(V[i][1], 0.012));
// the shirt hangs over the chest (22.10.2026): spanned from the chest's high points down to the belt, as cloth does,
// not drawn into the hollows under and between the chest muscles; the trousers likewise over the seat and the hips –
// these points of the cloth only ever move out, to the mean of their neighbours where that lies further out, many times
// (the hollows fill, the high points stay)
{
  const trunk = (i) => vTris[i].length && ((vTris[i].every((ti) => triReg0[ti] === 1) && /^(chest|spine|pelvis)/.test(domOf(W[i]))) || (vTris[i].every((ti) => triReg0[ti] === 2) && /^(pelvis|hip)/.test(domOf(W[i])) && B[i][2] > 0.7));
  for (let it = 0; it < 40; it++) {
    const NS = normalsOf(V, tris);
    const next = V.map((q) => q.slice());
    for (let i = 0; i < nV; i++) {
      if (!trunk(i)) continue;
      const m = [0, 0, 0]; for (const j of nb[i]) for (let k = 0; k < 3; k++) m[k] += V[j][k] / nb[i].size;
      const out = dot(sub(m, V[i]), NS[i]);
      if (out > 0) next[i] = add(V[i], mul(NS[i], out * 0.8));
    }
    for (let i = 0; i < nV; i++) V[i] = next[i];
  }
}
// the trousers hang straight from the thigh down, wider than the leg (golf trousers, not leggings): every trouser
// vertex of a leg is pushed out from the leg's axis to at least the trouser's own radius there, the hem a little
// wider and resting on the shoe
{
  const legAxis = (sx) => [T(mir(J.hip, sx)), T(mir(J.knee, sx)), T(mir(J.ankle, sx))];
  const axes = { 1: legAxis(1), [-1]: legAxis(-1) };
  const nearest = (p, a, b) => { const d = sub(b, a); const t = Math.min(1, Math.max(0, dot(sub(p, a), d) / dot(d, d))); return [add(a, mul(d, t)), t]; };
  for (let i = 0; i < nV; i++) {
    if (!vTris[i].length || !vTris[i].every((ti) => triReg0[ti] === 2)) continue;
    const d = domOf(W[i]);
    if (!/^(hip|knee|ankle)/.test(d)) continue;
    const sx = B[i][0] > 0 ? 1 : -1;
    const [h, k, an] = axes[sx];
    const p = V[i];
    if (p[1] > h[1] - 0.18) continue; // the seat and the top of the thigh follow the body
    const [q1, t1] = nearest(p, h, k);
    const [q2, t2] = nearest(p, k, an);
    const onShin = len(sub(p, q2)) < len(sub(p, q1)) || p[1] < k[1];
    const q = onShin ? q2 : q1;
    // the radius: 9 cm at mid-thigh down to 7.2 cm at the knee, 7 cm at the hem
    const R = onShin ? 0.072 - 0.004 * t2 : 0.09 - 0.018 * Math.max(0, (t1 - 0.4) / 0.6);
    const off = sub(p, q);
    const r = len(off);
    // the inner sides of the legs stay where they are (the legs would run into each other)
    const inward = (off[0] * sx) < -0.4 * r;
    const want = Math.max(r, inward ? r : R);
    const blend = Math.min(1, (h[1] - 0.18 - p[1]) / 0.08);
    V[i] = add(q, mul(off, (r + (want - r) * blend) / Math.max(r, 1e-6)));
  }
}
// smooth what the push left uneven (the trouser legs), the borders kept
for (let it = 0; it < 6; it++) {
  const next = V.map((p) => p.slice());
  for (let i = 0; i < nV; i++) {
    if (!vTris[i].length || !vTris[i].every((ti) => triReg0[ti] === 2) || !/^(hip|knee|ankle)/.test(domOf(W[i]))) continue;
    if (B[i][2] > 0.6) continue;
    const m = [0, 0, 0]; for (const j of nb[i]) for (let k = 0; k < 3; k++) m[k] += V[j][k] / nb[i].size;
    next[i] = add(V[i], mul(sub(m, V[i]), 0.5));
  }
  for (let i = 0; i < nV; i++) V[i] = next[i];
}
// the shoes: the toes smoothed away into one rounded shoe (many passes, the edge at the trouser hem kept), a little
// fuller than the foot, the sole flat
{
  const shoe = (i) => vTris[i].length && vTris[i].every((ti) => triReg0[ti] === 3 || triReg0[ti] === 4);
  // only outward: the grooves between the toes fill up, the outer shape stays (a toe cap, not five toes)
  for (let it = 0; it < 120; it++) {
    const NI = normalsOf(V, tris);
    const next = V.map((p) => p.slice());
    for (let i = 0; i < nV; i++) {
      if (!shoe(i)) continue;
      const m = [0, 0, 0]; for (const j of nb[i]) for (let k = 0; k < 3; k++) m[k] += V[j][k] / nb[i].size;
      const step = mul(sub(m, V[i]), 0.5);
      const outward = dot(step, NI[i]);
      // the part along the surface always (it evens the mesh out); the part across only outwards
      const along = sub(step, mul(NI[i], outward));
      next[i] = add(V[i], add(along, mul(NI[i], Math.max(0, outward))));
    }
    for (let i = 0; i < nV; i++) V[i] = next[i];
  }
  const NS = normalsOf(V, tris);
  for (let i = 0; i < nV; i++) if (shoe(i)) V[i] = add(V[i], mul(NS[i], 0.006));
  for (let i = 0; i < nV; i++) if (vTris[i].some((ti) => triReg0[ti] === 4)) V[i][1] = Math.max(0, Math.min(V[i][1], 0.014));
}

// ---------- the cap: a smooth shell fitted to the head above the cap line, and a curved visor ----------
const headBone = boneIx.head;
const scalp = V.filter((_, i) => B[i][2] > capLine(B[i][1]) - 0.01 && /^(head)/.test(domOf(W[i])));
const lo = [0, 1, 2].map((k) => Math.min(...scalp.map((p) => p[k]))), hi = [0, 1, 2].map((k) => Math.max(...scalp.map((p) => p[k])));
const capC = [(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2];
const capR = [(hi[0] - lo[0]) / 2 + 0.008, hi[1] - lo[1] + 0.008, (hi[2] - lo[2]) / 2 + 0.008];
// the rim plane: the cap line in three coords (y up, z front): height falls from the front to the back
const rimY = (z) => capLine(-z / S) * S;
const capV0 = V.length;
const capTris = [];
const NU = 40, NV = 12;
for (let i = 0; i <= NV; i++) {
  for (let j = 0; j < NU; j++) {
    const u = (j / NU) * Math.PI * 2;
    // along the meridian from the top (v=0) down to the rim
    let lo2 = 0, hi2 = Math.PI * 0.75;
    const at = (v) => [capC[0] + capR[0] * Math.sin(v) * Math.sin(u), capC[1] + capR[1] * Math.cos(v), capC[2] + capR[2] * Math.sin(v) * Math.cos(u)];
    for (let k = 0; k < 30; k++) { const m = (lo2 + hi2) / 2; const p = at(m); if (p[1] > rimY(p[2]) - 0.004) lo2 = m; else hi2 = m; }
    const p = at((lo2 * i) / NV);
    V.push(p); W.push([[headBone, 1]]);
  }
}
// shrink-wrapped onto the head: each point of the shell pushed out until it lies 6 mm outside every bit of scalp in its
// direction, then smoothed (the rim stays on its line)
const scalpAll = V.slice(0, nV).filter((_, i) => /^(head|neck)/.test(domOf(W[i])) && B[i][2] > capLine(B[i][1]) - 0.03);
for (let i = 0; i <= NV; i++) for (let j = 0; j < NU; j++) {
  const ix = capV0 + i * NU + j;
  const d = nrm(sub(V[ix], capC));
  let r = len(sub(V[ix], capC));
  for (const q of scalpAll) { const v = sub(q, capC); const l = len(v); if (l > 0 && dot(v, d) / l > 0.985) r = Math.max(r, dot(v, d) + 0.006); }
  V[ix] = add(capC, mul(d, r));
}
for (let it = 0; it < 4; it++) {
  const next = [];
  for (let i = 1; i < NV; i++) for (let j = 0; j < NU; j++) {
    const at = (a, b) => V[capV0 + a * NU + ((b + NU) % NU)];
    const m = [at(i - 1, j), at(i + 1, j), at(i, j - 1), at(i, j + 1)].reduce((x, y) => add(x, y), [0, 0, 0]);
    next.push([capV0 + i * NU + j, add(mul(V[capV0 + i * NU + j], 0.5), mul(m, 0.125))]);
  }
  for (const [ix, p] of next) V[ix] = p;
}
// a structured cap, not a swim cap: the crown stands off the head – most at the front panels (up to 1.2 cm), a little
// all round – the rim stays on its line
for (let i = 0; i < NV; i++) for (let j = 0; j < NU; j++) {
  const ix = capV0 + i * NU + j;
  const d = nrm(sub(V[ix], capC));
  const front = Math.min(1, Math.max(0, (d[2] + 0.2) / 1.0)) ** 1.5;
  const keep = 1 - (i / NV) ** 2;
  V[ix] = add(V[ix], mul(d, (0.003 + 0.009 * front * (1 - Math.abs(d[1]) * 0.5)) * keep));
}
const capIx = (i, j) => capV0 + i * NU + (j % NU);
for (let i = 0; i < NV; i++) for (let j = 0; j < NU; j++) capTris.push([capIx(i, j), capIx(i + 1, j), capIx(i + 1, j + 1)], [capIx(i, j), capIx(i + 1, j + 1), capIx(i, j + 1)]);
// the button on top, where the six panels meet: a flat dome of 7 mm
const buttonTop = [];
{
  const top = V[capIx(0, 0)];
  const up = nrm(sub(top, capC));
  const t1 = nrm(cross(up, [1, 0, 0])), t2 = cross(up, t1);
  const b0 = V.length;
  V.push(add(top, mul(up, 0.0038))); W.push([[headBone, 1]]);
  const NB = 12;
  for (let r = 1; r <= 2; r++) for (let k = 0; k < NB; k++) {
    const a = (k / NB) * Math.PI * 2, rr = r === 1 ? 0.0045 : 0.0072;
    V.push(add(add(top, mul(up, r === 1 ? 0.0028 : -0.0005)), add(mul(t1, Math.cos(a) * rr), mul(t2, Math.sin(a) * rr)))); W.push([[headBone, 1]]);
  }
  for (let k = 0; k < NB; k++) {
    const k1 = (k + 1) % NB;
    buttonTop.push([b0, b0 + 1 + k1, b0 + 1 + k], [b0 + 1 + k, b0 + 1 + k1, b0 + 1 + NB + k1], [b0 + 1 + k, b0 + 1 + NB + k1, b0 + 1 + NB + k]);
  }
}
// the visor: from the front of the rim (±55°), 6.5 cm out, arched across and curved down at its edge; top and underside
const visTop = [], visBot = [];
const NS = 16, ND = 5;
for (let k = 0; k <= NS; k++) {
  const ang = ((-55 + (110 * k) / NS) * Math.PI) / 180;
  const j = Math.round((ang / (Math.PI * 2)) * NU + NU) % NU;
  const rim = V[capIx(NV, j)];
  const dir = [Math.sin(ang), 0, Math.cos(ang)];
  for (let d = 0; d <= ND; d++) {
    const s = d / ND;
    const reach = 0.066 * Math.cos(ang * 0.9) * s;
    const drop = 0.006 * s + 0.01 * s * s + 0.008 * Math.abs(Math.sin(ang)) * s; // curved down to the front and the sides
    const p = add(add(rim, mul(dir, reach - 0.002)), [0, -drop, 0]);
    visTop.push(V.length); V.push(p); W.push([[headBone, 1]]);
    visBot.push(V.length); V.push(add(p, [0, -0.003, 0])); W.push([[headBone, 1]]);
  }
}
const vIx = (arr, k, d) => arr[k * (ND + 1) + d];
const visorTris = [], visorBotTris = [];
for (let k = 0; k < NS; k++) for (let d = 0; d < ND; d++) {
  visorTris.push([vIx(visTop, k, d), vIx(visTop, k + 1, d), vIx(visTop, k + 1, d + 1)], [vIx(visTop, k, d), vIx(visTop, k + 1, d + 1), vIx(visTop, k, d + 1)]);
  visorBotTris.push([vIx(visBot, k, d), vIx(visBot, k + 1, d + 1), vIx(visBot, k + 1, d)], [vIx(visBot, k, d), vIx(visBot, k, d + 1), vIx(visBot, k + 1, d + 1)]);
}
// the edge of the visor
for (let k = 0; k < NS; k++) visorTris.push([vIx(visTop, k, ND), vIx(visTop, k + 1, ND), vIx(visBot, k + 1, ND)], [vIx(visTop, k, ND), vIx(visBot, k + 1, ND), vIx(visBot, k, ND)]);
// the polo collar: along the neckline (where shirt meets skin above the chest), a band standing up 1.6 cm and folded
// down outside over 3 cm; and three buttons on the placket
const NN = normalsOf(V, tris);
const edgeTris = new Map();
tris.forEach((t, ti) => { for (let k = 0; k < 3; k++) { const a = t[k], b = t[(k + 1) % 3]; const key = a < b ? a + '_' + b : b + '_' + a; (edgeTris.get(key) ?? edgeTris.set(key, []).get(key)).push([ti, a, b]); } });
const collarTris = [];
// the boundary vertices of the neckline, in order around the neck, smoothed into one even curve
const ring = new Set();
for (const [, list] of edgeTris) {
  if (list.length !== 2) continue;
  const [x, y] = list;
  const rx = triReg0[x[0]], ry = triReg0[y[0]];
  if (!((rx === 1 && ry === 0) || (rx === 0 && ry === 1))) continue;
  const [, a, b] = rx === 1 ? x : y;
  for (const i of [a, b]) if (B[i][2] > 1.36 && Math.abs(B[i][0]) < 0.16) ring.add(i);
}
const rp = [...ring];
const cx = rp.reduce((t, i) => t + V[i][0], 0) / rp.length, cz = rp.reduce((t, i) => t + V[i][2], 0) / rp.length;
const angOf = (i) => Math.atan2(V[i][0] - cx, V[i][2] - cz);
const NC = 72;
const curve = [];
for (let k = 0; k < NC; k++) {
  const a0 = -Math.PI + ((k + 0.5) / NC) * Math.PI * 2;
  // the neighbours within ±12°, weighted by closeness
  let w = 0; const p = [0, 0, 0]; const n = [0, 0, 0]; let best = rp[0], bd = 9;
  for (const i of rp) {
    let d = Math.abs(angOf(i) - a0); if (d > Math.PI) d = Math.PI * 2 - d;
    if (d < bd) { bd = d; best = i; }
    if (d > 0.21) continue;
    const ww = 1 - d / 0.21; w += ww;
    for (let c = 0; c < 3; c++) { p[c] += V[i][c] * ww; n[c] += NN[i][c] * ww; }
  }
  if (!w) continue;
  curve.push({ p: mul(p, 1 / w), n: nrm(n), wts: W[best] });
}
// the band: up 1.6 cm, then folded down outside over 3 cm; a small gap at the front (the collar's two tips)
const rows = (c) => {
  const up = [0, 1, 0];
  const out = nrm([c.n[0], 0, c.n[2]]);
  return [c.p, add(c.p, add(mul(up, 0.016), mul(out, 0.002))), add(c.p, add(mul(up, 0.012), mul(out, 0.011))), add(c.p, add(mul(up, -0.022), mul(out, 0.016)))];
};
// the collar's weights: its foot on the neckline as the shirt's edge there, the fold lying on the shirt moving with the
// chest – the neck turns inside the collar (as in a real one), the collar does not turn with the head
const blendW = (wa, wb, t) => {
  const m = new Map();
  for (const [b, w] of wa) m.set(b, (m.get(b) ?? 0) + w * (1 - t));
  for (const [b, w] of wb) m.set(b, (m.get(b) ?? 0) + w * t);
  const top = [...m].sort((x, y) => y[1] - x[1]).slice(0, 4);
  const sum = top.reduce((x, [, w]) => x + w, 0);
  return top.map(([b, w]) => [b, w / sum]);
};
const chestW = [[boneIx.chest, 1]];
const colIdx = curve.map((c) => rows(c).map((p, r) => { V.push(p); W.push(blendW(c.wts, chestW, [0, 0.5, 0.9, 1][r])); return V.length - 1; }));
for (let k = 0; k < colIdx.length; k++) {
  const A = colIdx[k], Bq = colIdx[(k + 1) % colIdx.length];
  // leave out the front: the collar opens there (the placket)
  const am = Math.atan2(curve[k].p[0] - cx, curve[k].p[2] - cz);
  if (Math.abs(am) < 0.09) continue;
  for (let r = 0; r < 3; r++) collarTris.push([A[r], Bq[r], Bq[r + 1]], [A[r], Bq[r + 1], A[r + 1]]);
}
// buttons: on the front of the chest, below the neckline, 3 cm apart
const chestBone = boneIx.chest;
const front = V.slice(0, nV).map((p, i) => [p, i]).filter(([p, i]) => Math.abs(p[0]) < 0.012 && triReg0.length && /^(chest|spine)/.test(domOf(W[i])) && p[1] > 1.3 && p[1] < 1.43);
const buttonTris = [];
for (const yb of [1.405, 1.375, 1.345]) {
  const near = front.filter(([p]) => Math.abs(p[1] - yb) < 0.01);
  if (!near.length) continue;
  const zf = Math.max(...near.map(([p]) => p[2]));
  const c = [0, yb, zf + 0.002];
  const base = V.length;
  const NB = 10;
  V.push(add(c, [0, 0, 0.0025])); W.push([[chestBone, 1]]);
  for (let k = 0; k < NB; k++) { const t = (k / NB) * Math.PI * 2; V.push(add(c, [Math.cos(t) * 0.0048, Math.sin(t) * 0.0048, 0])); W.push([[chestBone, 1]]); }
  for (let k = 0; k < NB; k++) buttonTris.push([base, base + 1 + k, base + 1 + ((k + 1) % NB)]);
}
// the golf shoes: in place of the feet a smooth shoe of their own, lofted along the foot – its footprint and height
// taken from the foot (a little fuller), a flat sole with an edge, a rounded toe; skinned to the ankle
const shoeTris = [], soleTris = [];
const shoeCentres = [];
for (const sx of [1, -1]) {
  const ankleBone = boneIx['ankle' + (sx > 0 ? 'L' : 'R')];
  const footIdx = [];
  for (let i = 0; i < nV; i++) if (vTris[i].length && vTris[i].every((ti) => triReg0[ti] === 3 || triReg0[ti] === 4) && Math.sign(B[i][0]) === sx) footIdx.push(i);
  const pts = footIdx.map((i) => V[i]);
  const heel3 = T(mir(J.ankle, sx)), toe3 = T(mir(J.toe, sx));
  const fwd = nrm([toe3[0] - heel3[0], 0, toe3[2] - heel3[2]]);
  const lat = [fwd[2], 0, -fwd[0]];
  const along = pts.map((p) => dot(sub(p, heel3), fwd));
  const a0 = Math.min(...along) - 0.006, a1 = Math.max(...along) + 0.01;
  const NU = 28, NVs = 22;
  const rows = [];
  // the measures of the foot along its length, smoothed (no dents from the toes)
  const prm = [];
  for (let u = 0; u <= NU; u++) {
    const t = u / NU;
    const a = a0 + (a1 - a0) * t;
    const near = pts.filter((p, k) => Math.abs(along[k] - a) < 0.02);
    const ls = near.map((p) => dot(sub(p, heel3), lat));
    const lo = near.length ? Math.min(...ls) : -0.03, hi = near.length ? Math.max(...ls) : 0.03;
    const top = near.length ? Math.max(...near.map((p) => p[1])) + 0.006 : 0.05;
    prm.push({ t, a, cen: (lo + hi) / 2, half: Math.min(0.05, (hi - lo) / 2 + 0.006), height: Math.min(Math.max(0.03, top), 0.098) });
  }
  for (let pass = 0; pass < 6; pass++) for (const key of ['cen', 'half', 'height']) {
    const v = prm.map((x) => x[key]);
    for (let u = 1; u < NU; u++) prm[u][key] = (v[u - 1] + 2 * v[u] + v[u + 1]) / 4;
  }
  for (const pr of prm) {
    const { t, a } = pr;
    // a rounded toe and heel: the outline an ellipse at both ends, the toe box lower towards the tip
    const toe = Math.max(0, (t - 0.74) / 0.26), heel = Math.max(0, (0.1 - t) / 0.1);
    const half = pr.half * Math.sqrt(Math.max(0.0025, 1 - toe * toe)) * Math.sqrt(Math.max(0.09, 1 - heel * heel));
    const height = 0.014 + (pr.height - 0.014) * (1 - 0.6 * Math.pow(Math.max(0, (t - 0.55) / 0.45), 1.4)) * Math.sqrt(Math.max(0.05, 1 - toe * toe * 0.9));
    const cen = pr.cen;
    const ring = [];
    for (let v = 0; v < NVs; v++) {
      const th = (v / NVs) * Math.PI * 2;
      // a rounded box in the cross-section: flat underneath, rounded on top
      const c = Math.cos(th), sn = Math.sin(th);
      const x = half * Math.sign(c) * Math.pow(Math.abs(c), 2 / 3);
      const y = sn >= 0 ? 0.014 + (height - 0.014) * Math.pow(sn, 2 / 2.4) : 0.014;
      const p = add(add(heel3, mul(fwd, a)), mul(lat, cen + x));
      ring.push([p[0], y, p[2]]);
    }
    { const cc = add(add(heel3, mul(fwd, a)), mul(lat, cen)); shoeCentres.push([cc[0], Math.max(0.012, height * 0.45), cc[2]]); }
    rows.push(ring);
  }
  const base = V.length;
  for (const ring of rows) for (const p of ring) { V.push(p); W.push([[ankleBone, 1]]); }
  const ix = (u, v) => base + u * NVs + (v % NVs);
  for (let u = 0; u < NU; u++) for (let v = 0; v < NVs; v++) shoeTris.push([ix(u, v), ix(u + 1, v), ix(u + 1, v + 1)], [ix(u, v), ix(u + 1, v + 1), ix(u, v + 1)]);
  // close the heel and the toe
  for (const [u, flip] of [[0, true], [NU, false]]) { const c = V.length; const m = rows[u].reduce((s2, p) => add(s2, p), [0, 0, 0]).map((x) => x / NVs); V.push(m); W.push([[ankleBone, 1]]); for (let v = 0; v < NVs; v++) shoeTris.push(flip ? [c, ix(u, v + 1), ix(u, v)] : [c, ix(u, v), ix(u, v + 1)]); }
  // the sole: a slab a little wider, 1.4 cm high
  const sb = V.length;
  for (const ring of rows) {
    const cx = ring.reduce((s2, p) => s2 + p[0], 0) / NVs, cz = ring.reduce((s2, p) => s2 + p[2], 0) / NVs;
    for (let v = 0; v < NVs; v++) { const p = ring[v]; const k = 1.06; V.push([cx + (p[0] - cx) * k, 0.0, cz + (p[2] - cz) * k]); W.push([[ankleBone, 1]]); V.push([cx + (p[0] - cx) * k, 0.016, cz + (p[2] - cz) * k]); W.push([[ankleBone, 1]]); }
  }
  const sx2 = (u, v, top) => sb + (u * NVs + (v % NVs)) * 2 + (top ? 1 : 0);
  for (let u = 0; u < NU; u++) for (let v = 0; v < NVs; v++) {
    soleTris.push([sx2(u, v, 0), sx2(u, v, 1), sx2(u + 1, v, 1)], [sx2(u, v, 0), sx2(u + 1, v, 1), sx2(u + 1, v, 0)]);
  }
}
// every shoe and sole triangle facing outwards: away from the nearest point of its shoe's middle line
for (const list of [shoeTris, soleTris]) for (const t of list) {
  const [p0, p1, p2] = t.map((i) => V[i]);
  const n = cross(sub(p1, p0), sub(p2, p0));
  const c = mul(add(add(p0, p1), p2), 1 / 3);
  let best = shoeCentres[0], bd = Infinity;
  for (const q of shoeCentres) { const d = (q[0] - c[0]) ** 2 + (q[2] - c[2]) ** 2; if (d < bd) { bd = d; best = q; } }
  if (dot(n, sub(c, best)) < 0) { const tmp = t[1]; t[1] = t[2]; t[2] = tmp; }
}
// the eyes: on the head, white with a dark iris at the front
const eyeTris = [];
const eyeReg = [];
const eyeBase = V.length;
for (const e of R.eyes) {
  const base = V.length;
  const pts = e.v.map(T);
  const c = mul(pts.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / pts.length);
  for (const p of pts) { V.push(p); W.push([[headBone, 1]]); eyeReg.push(dot(nrm(sub(p, c)), FWD) > 0.82 ? 10 : 9); }
  for (const poly of e.f) for (let i = 1; i < poly.length - 1; i++) eyeTris.push([base + poly[0], base + poly[i], base + poly[i + 1]]);
}
// the feet themselves stay hidden in the shoes
const keepTri = tris.map((_, ti) => triReg0[ti] !== 3 && triReg0[ti] !== 4);
const all = [...tris.filter((_, ti) => keepTri[ti]), ...shoeTris, ...soleTris, ...capTris, ...buttonTop, ...visorTris, ...visorBotTris, ...eyeTris, ...collarTris, ...buttonTris];
const triReg = [...triReg0.filter((_, ti) => keepTri[ti]), ...shoeTris.map(() => 3), ...soleTris.map(() => 4), ...capTris.map(() => 6), ...buttonTop.map(() => 6), ...visorTris.map(() => 14), ...visorBotTris.map(() => 11), ...eyeTris.map((t) => (t.some((i) => eyeReg[i - eyeBase] === 10) ? 10 : 9)), ...collarTris.map(() => 13), ...buttonTris.map(() => 12)];
const order = all.map((_, i) => i).sort((p, q) => triReg[p] - triReg[q]);
const groups = [];
for (const i of order) { const r = triReg[i]; const g = groups[groups.length - 1]; if (g && g.r === r) g.n += 3; else groups.push({ r, start: groups.length ? groups[groups.length - 1].start + groups[groups.length - 1].n : 0, n: 3 }); }

// ---------- binary ----------
const nv = V.length;
const pos = new Int16Array(nv * 3);
for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) pos[i * 3 + k] = Math.round(V[i][k] * 10000);
const idx = new Uint16Array(order.length * 3);
order.forEach((ti, k) => all[ti].forEach((v, c) => (idx[k * 3 + c] = v)));
const sIdx = new Uint8Array(nv * 4), sW = new Uint8Array(nv * 4);
for (let i = 0; i < nv; i++) {
  const ws = W[i].slice(0, 4);
  let rest = 255;
  // quantised to 255 in all: floor each, the remainder to the strongest (never below 0 – a wrap-around stretched the neck)
  const q = ws.map(([, w]) => Math.floor(w * 255));
  q[0] += 255 - q.reduce((x, y) => x + y, 0);
  ws.forEach(([b], k) => { sIdx[i * 4 + k] = b; sW[i * 4 + k] = q[k]; });
}
// the face's tones (a colour factor per vertex, used by the skin): eyebrows, the lips, a shadow of stubble on the jaw –
// placed by the eyes and the nose of this body (Blender coords: eyes at z 1.574, x ±0.033; nose tip z 1.539)
const tint = new Uint8Array(nv * 3).fill(255);
const smooth01 = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
for (let i = 0; i < Math.min(nv, B.length); i++) {
  const [x, y, z] = B[i];
  if (z < 1.44 || z > 1.7) continue;
  if (!/^(head|neck)/.test(domOf(W[i]))) continue;
  const ax = Math.abs(x);
  let c = [1, 1, 1];
  const mixC = (col, k) => { c = c.map((v, j) => v * (1 - k) + col[j] * k); };
  // stubble: chin, jaw and upper lip, a faint grey-blue shadow
  const st = smooth01(1.535, 1.52, z) * smooth01(1.455, 1.47, z) * smooth01(0.075, 0.055, Math.abs(x)) * smooth01(-0.07, -0.1, y);
  mixC([0.78, 0.76, 0.78], st * 0.55);
  // the lips
  const lip = smooth01(0.027, 0.018, Math.abs(x)) * smooth01(1.494, 1.5, z) * smooth01(1.52, 1.513, z) * smooth01(-0.14, -0.148, y);
  mixC([0.78, 0.5, 0.48], lip * 0.85);
  // the eyebrows: an arch above each eye
  const browZ = 1.6 - 0.04 * (ax - 0.035) ** 2 / 0.0009 * 0.06;
  const brow = smooth01(0.012, 0.018, ax) * smooth01(0.062, 0.054, ax) * smooth01(0.007, 0.002, Math.abs(z - browZ)) * smooth01(-0.115, -0.128, y);
  mixC([0.28, 0.21, 0.17], brow * 0.9);
  // short hair on the sides and the back of the head, blended into the skin with a soft hairline; the ears left free
  {
    const back = smooth01(-0.006, 0.012, y) * smooth01(1.488, 1.506, z - 0.25 * Math.max(0, ax - 0.03));
    const sideH = smooth01(0.048, 0.06, ax) * smooth01(-0.086, -0.072, y) * smooth01(1.546, 1.564, z);
    const temple = smooth01(0.042, 0.055, ax) * smooth01(-0.106, -0.094, y) * smooth01(1.592, 1.606, z);
    const ear = smooth01(0.072, 0.081, ax) * smooth01(1.505, 1.518, z) * smooth01(1.632, 1.62, z) * smooth01(-0.082, -0.07, y) * smooth01(0.018, 0.008, y);
    const hair = Math.max(back, sideH, temple) * (1 - ear);
    // the hair's colour as a factor on the skin (#3a2b20 over #c8946f, in linear light), with a little noise of strands
    mixC([0.075, 0.08, 0.095], hair * 0.97);
  }
  for (let k = 0; k < 3; k++) tint[i * 3 + k] = Math.round(Math.min(1, c[k]) * 255);
}
// shade in the hollows (22.10.2026): where the surface lies below its surroundings – the ears, round the eyes and the
// nose, between the fingers, the armpits, folds of the clothes – a little darker, as the light from the sky reaches it
// less. Worked out from the shape at rest: how far each point lies below the mean of its neighbourhood (two sizes), along
// its normal; kept in the vertex colours with the face's tones
{
  const adj = Array.from({ length: nv }, () => new Set());
  for (const t of all) for (let k = 0; k < 3; k++) { adj[t[k]].add(t[(k + 1) % 3]); adj[t[k]].add(t[(k + 2) % 3]); }
  const NA = normalsOf(V, all);
  const blur = (P, n) => {
    let cur = P;
    for (let it = 0; it < n; it++) cur = cur.map((q, i) => { if (!adj[i].size) return q; const m = [0, 0, 0]; for (const j of adj[i]) for (let c = 0; c < 3; c++) m[c] += cur[j][c]; return mul(m, 1 / adj[i].size); });
    return cur;
  };
  const near = blur(V, 3), wide = blur(near, 12);
  for (let i = 0; i < nv; i++) {
    const d1 = dot(NA[i], sub(near[i], V[i])), d2 = dot(NA[i], sub(wide[i], V[i]));
    const ao = Math.max(0.6, 1 - Math.max(0, d1) * 55 - Math.max(0, d2) * 22);
    for (let k = 0; k < 3; k++) tint[i * 3 + k] = Math.round(tint[i * 3 + k] * ao);
  }
}
const buf = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(idx.buffer), Buffer.from(sIdx.buffer), Buffer.from(sW.buffer), Buffer.from(tint.buffer)]);
const round = (a) => a.map((x) => Math.round(x * 100000) / 100000);
const frames = Object.fromEntries(R.bones.map((b) => [b, { o: round(F[b].o), x: round(F[b].x), y: round(F[b].y), z: round(F[b].z) }]));
const fingerData = {};
for (const s of ['L', 'R']) for (const f of FINGERS) fingerData[f + s] = [0, 1, 2].map((i) => round([len(sub(P[`${f}${i + 1}${s}`], P[`${f}${i}${s}`]))])[0]);
const meta = { vertices: nv, indices: idx.length, bones: R.bones, frames, groups: groups.map((g) => [g.r, g.start, g.n]), lengths: round([L.upperArm, L.forearm, L.thigh, L.shin]), fingers: fingerData, capCentre: round(capC) };
const ts = `// GENERATED by build-body.mjs – the realistic body of the shared 3D golfer: Blender Foundation "Human Base Meshes"
// (realistic male, CC0 1.0, https://www.blender.org/download/demo/asset-bundles/), rigged to our skeleton with automatic
// weights; clothes (shirt, trousers, shoes, glove, cap) cut from its own surface. Do not edit – rebuild instead.
export const BODY_META = ${JSON.stringify(meta)} as const;
export const BODY_DATA = '${buf.toString('base64')}';
`;
fs.writeFileSync(OUT, ts);
console.log('vertices', nv, 'triangles', idx.length / 3, 'bytes', buf.length, 'groups', groups.map((g) => `${g.r}:${g.n / 3}`).join(' '), 'lengths', meta.lengths);

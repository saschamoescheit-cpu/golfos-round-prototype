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
const V = R.v.map(T);
const nV = V.length;
const tris = [];
const trisFace = [];
R.f.forEach((poly, fi) => { for (let i = 1; i < poly.length - 1; i++) { tris.push([poly[0], poly[i], poly[i + 1]]); trisFace.push(fi); } });
const boneIx = Object.fromEntries(R.bones.map((b, i) => [b, i]));
const W = R.w.map((ws) => {
  const tot = ws.reduce((s, x) => s + x[0], 0);
  return ws.map(([w, b]) => [boneIx[b], w / tot]);
});
const dom = (i) => R.bones[W[i][0][0]];
// vertex normals and neighbours
const normals = () => {
  const N = V.map(() => [0, 0, 0]);
  for (const [a, b, c] of tris) {
    const n = cross(sub(V[b], V[a]), sub(V[c], V[a]));
    for (const i of [a, b, c]) for (let k = 0; k < 3; k++) N[i][k] += n[k];
  }
  return N.map((n) => (len(n) ? nrm(n) : [0, 1, 0]));
};
const nb = V.map(() => new Set());
for (const [a, b, c] of tris) { nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b); }

// regions: 0 skin, 1 shirt, 2 trousers, 3 shoe, 4 sole, 5 glove, 6 cap, 7 hair, 8 belt, 9 eye white, 10 iris – per FACE
// (by its centre and its strongest bone), so the edges of sleeves, belt and glove follow the mesh's own loops
const B = R.v; // Blender coords for the tests below
const along = (p, from, to) => { const d = sub(to, from); return dot(sub(p, from), d) / dot(d, d); };
const capLine = (y) => 1.632 + ((y + 0.1) / 0.16) * (1.565 - 1.632);
const classify = (p, d) => {
  const [x, y, z] = p;
  const side = x > 0 ? 'L' : 'R';
  const sx = x > 0 ? 1 : -1;
  if (z < 0.115 && /^(ankle|knee)/.test(d)) return z < 0.022 ? 4 : 3;
  if (/^(shoulder|elbow|wrist|index|middle|ring|little|thumb)/.test(d)) {
    const tS = along(p, mir(J.shoulder, sx), mir(J.elbow, sx));
    const tF = along(p, mir(J.elbow, sx), mir(J.wrist, sx));
    if (/^shoulder/.test(d) && tS < 0.6) return 1;
    if (side === 'L' && (/^(wrist|index|middle|ring|little|thumb)/.test(d) || tF > 0.94)) return 5;
    return 0;
  }
  if (/^(pelvis|hip|knee)/.test(d) || /^spine/.test(d) && z < 0.97) return z > 0.956 && z < 0.988 && Math.abs(x) < 0.2 ? 8 : z >= 0.988 ? 1 : 2;
  if (/^(spine|chest)/.test(d)) return z > 0.956 && z < 0.988 ? 8 : (z > 1.415 && Math.abs(x) < 0.08 && y < 0.035) || z > 1.445 ? 0 : 1;
  if (/^(head|neck)/.test(d) && z > capLine(y) - 0.024 && y > -0.07 && z > 1.5) return 7;
  return 0;
};
const faceReg = R.f.map((poly) => {
  const c = [0, 1, 2].map((k) => poly.reduce((s, i) => s + B[i][k], 0) / poly.length);
  const tot = {};
  for (const i of poly) for (const [bi, w] of W[i]) tot[bi] = (tot[bi] ?? 0) + w;
  const best = Object.entries(tot).sort((p, q) => q[1] - p[1])[0][0];
  return classify(c, R.bones[best]);
});
const vFaces = V.map(() => []);
R.f.forEach((poly, fi) => poly.forEach((i) => vFaces[i].push(fi)));
const cloth = (r) => r === 1 || r === 2 || r === 8;
const OFF = { 1: 0.006, 2: 0.008, 8: 0.01, 3: 0.009, 4: 0.011, 5: 0.0015 };
const REG = new Uint8Array(nV); // the vertex: the thickest cloth around it (for the offset)
for (let i = 0; i < nV; i++) { let r = 0, o = 0; for (const fi of vFaces[i]) { const q = faceReg[fi]; if ((OFF[q] ?? 0) > o) { o = OFF[q]; r = q; } } REG[i] = r; }
const allCloth = (i) => vFaces[i].every((fi) => cloth(faceReg[fi]));
// cloth: smoothed (no muscles through the shirt) and a little away from the skin
for (let it = 0; it < 10; it++) {
  const next = V.map((p) => p.slice());
  for (let i = 0; i < nV; i++) {
    if (!allCloth(i)) continue;
    const m = [0, 0, 0]; for (const j of nb[i]) for (let k = 0; k < 3; k++) m[k] += V[j][k] / nb[i].size;
    next[i] = add(V[i], mul(sub(m, V[i]), 0.5));
  }
  for (let i = 0; i < nV; i++) V[i] = next[i];
}
const N1 = normals();
for (let i = 0; i < nV; i++) { const off = OFF[REG[i]] ?? 0; if (off) V[i] = add(V[i], mul(N1[i], off)); }
for (let i = 0; i < nV; i++) if (REG[i] === 4) V[i][1] = Math.max(0, Math.min(V[i][1], 0.012));

// ---------- the cap: a shell over the scalp above the cap line, and the visor ----------
const capV = new Map();
const capTris = [];
const inCap = (i) => B[i][2] > capLine(B[i][1]) - 0.004 && /^(head|neck)/.test(dom(i));
const N2 = normals();
for (const t of tris) {
  if (!t.every(inCap)) continue;
  const ids = t.map((i) => {
    if (!capV.has(i)) { capV.set(i, V.length); V.push(add(V[i], mul(N2[i], 0.007))); W.push(W[i]); REG.length; }
    return capV.get(i);
  });
  capTris.push(ids);
}
// the visor: from the cap's front edge, 7 cm out and a little down, over ±65°
const headC = T([0, -0.035, 1.6]);
const rimPts = [...capV.keys()].filter((i) => B[i][2] < capLine(B[i][1]) + 0.012).map((i) => V[capV.get(i)]);
const visorV = [];
const steps = 14;
for (let k = 0; k <= steps; k++) {
  const ang = ((-65 + (130 * k) / steps) * Math.PI) / 180;
  const dir = [Math.sin(ang), 0, Math.cos(ang)];
  // the rim point in this direction: the furthest cap point along dir near the rim
  let best = null; let bd = -1;
  for (const p of rimPts) { const d = sub(p, headC); const h = [d[0], 0, d[2]]; const c = dot(nrm(h), dir); if (c > 0.985 && len(h) > bd) { bd = len(h); best = p; } }
  if (!best) best = add(headC, add(mul(dir, 0.1), [0, 0.03, 0]));
  const inner = add(best, mul(dir, -0.004));
  const depth = 0.068 * Math.cos(ang * 0.8);
  const outer = add(inner, add(mul(dir, depth), [0, -0.012, 0]));
  visorV.push(inner, outer);
}
const vis0 = V.length;
const headBone = boneIx.head;
for (const p of visorV) { V.push(p); W.push([[headBone, 1]]); }
const visorTris = [];
for (let k = 0; k < steps; k++) {
  const a0 = vis0 + 2 * k, a1 = a0 + 1, b0 = a0 + 2, b1 = a0 + 3;
  visorTris.push([a0, b0, a1], [a1, b0, b1]);
}
// the eyes: on the head, white with a dark iris at the front
const eyeTris = [];
const eyeReg = [];
for (const e of R.eyes) {
  const base = V.length;
  const pts = e.v.map(T);
  const c = mul(pts.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / pts.length);
  for (const p of pts) { V.push(p); W.push([[headBone, 1]]); eyeReg.push(dot(nrm(sub(p, c)), FWD) > 0.82 ? 10 : 9); }
  for (const poly of e.f) for (let i = 1; i < poly.length - 1; i++) eyeTris.push([base + poly[0], base + poly[i], base + poly[i + 1]]);
}
const eyeBase = V.length - eyeReg.length;
const all = [...tris, ...capTris, ...visorTris, ...eyeTris];
const triReg = [...trisFace.map((fi) => faceReg[fi]), ...capTris.map(() => 6), ...visorTris.map(() => 6), ...eyeTris.map((t) => (t.some((i) => eyeReg[i - eyeBase] === 10) ? 10 : 9))];
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
  ws.forEach(([b, w], k) => { sIdx[i * 4 + k] = b; const q = k === ws.length - 1 ? rest : Math.round(w * 255); sW[i * 4 + k] = q; rest -= q; });
}
const buf = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(idx.buffer), Buffer.from(sIdx.buffer), Buffer.from(sW.buffer)]);
const round = (a) => a.map((x) => Math.round(x * 100000) / 100000);
const frames = Object.fromEntries(R.bones.map((b) => [b, { o: round(F[b].o), x: round(F[b].x), y: round(F[b].y), z: round(F[b].z) }]));
const fingerData = {};
for (const s of ['L', 'R']) for (const f of FINGERS) fingerData[f + s] = [0, 1, 2].map((i) => round([len(sub(P[`${f}${i + 1}${s}`], P[`${f}${i}${s}`]))])[0]);
const meta = { vertices: nv, indices: idx.length, bones: R.bones, frames, groups: groups.map((g) => [g.r, g.start, g.n]), lengths: round([L.upperArm, L.forearm, L.thigh, L.shin]), fingers: fingerData };
const ts = `// GENERATED by build-body.mjs – the realistic body of the shared 3D golfer: Blender Foundation "Human Base Meshes"
// (realistic male, CC0 1.0, https://www.blender.org/download/demo/asset-bundles/), rigged to our skeleton with automatic
// weights; clothes (shirt, trousers, shoes, glove, cap) cut from its own surface. Do not edit – rebuild instead.
export const BODY_META = ${JSON.stringify(meta)} as const;
export const BODY_DATA = '${buf.toString('base64')}';
`;
fs.writeFileSync(OUT, ts);
console.log('vertices', nv, 'triangles', idx.length / 3, 'bytes', buf.length, 'groups', groups.map((g) => `${g.r}:${g.n / 3}`).join(' '), 'lengths', meta.lengths);

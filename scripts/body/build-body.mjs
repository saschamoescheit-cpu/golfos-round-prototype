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
const isTorso = (d) => /^(pelvis|spine|chest|hip|knee|ankle)/.test(d);
const isArm = (d) => /^(shoulder|elbow|wrist|index|middle|ring|little|thumb)/.test(d);
const tDom = (t) => triDom(t);
cut((p) => p[2] - 0.115, (t) => /^(ankle|knee)/.test(tDom(t)));
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
  if (z < 0.115 && /^(ankle|knee)/.test(d)) return z < 0.022 ? 4 : 3;
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
const capIx = (i, j) => capV0 + i * NU + (j % NU);
for (let i = 0; i < NV; i++) for (let j = 0; j < NU; j++) capTris.push([capIx(i, j), capIx(i + 1, j), capIx(i + 1, j + 1)], [capIx(i, j), capIx(i + 1, j + 1), capIx(i, j + 1)]);
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
const all = [...tris, ...capTris, ...visorTris, ...visorBotTris, ...eyeTris];
const triReg = [...triReg0, ...capTris.map(() => 6), ...visorTris.map(() => 6), ...visorBotTris.map(() => 11), ...eyeTris.map((t) => (t.some((i) => eyeReg[i - eyeBase] === 10) ? 10 : 9))];
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

// Tests of the world rules in src/world.js: levels, growth, the map, the voxel models, what a hole can swallow.
// Run: node tests/world.test.js   (no installs)
const W = require('../src/world.js');
let passed = 0, failed = 0;
const ok = (c, msg) => { if (c) passed++; else { failed++; console.log('FAIL ' + msg); } };
const near = (a, b, e) => Math.abs(a - b) <= e;

// -- levels and growth
ok(W.MAXLV === 1000, 'the level cap is 1,000');
ok(near(W.radiusAt(1, 0), 0.5, 1e-12), 'level 1 has a hole of radius 50 cm');
ok(near(W.radiusAt(W.MAXLV, 0) / W.radiusAt(1, 0), W.REACH, 1e-6), 'the cap is 5,000 times wider than level 1');
let mono = true; for (let L = 1; L < W.MAXLV; L++) if (!(W.radiusAt(L + 1, 0) > W.radiusAt(L, 0)) || !(W.need(L + 1) > W.need(L))) mono = false;
ok(mono, 'radius and the xp a level needs only ever go up');
ok(W.progress(0).level === 1 && W.progress(0).frac === 0, 'no xp is level 1');
ok(W.progress(W.CUM[10]).level === 10 && W.progress(W.CUM[10] - 1e-9).level === 9, 'progress finds the level boundaries');
ok(near(W.progress(W.CUM[50] + W.need(50) / 2).frac, 0.5, 1e-9), 'halfway through a level reads 0.5');
ok(W.progress(W.MAXXP).level === 1000 && W.progress(W.MAXXP * 10).level === 1000, 'xp past the cap stays at level 1,000');
ok(W.xpFor(0.4, 0.5) > W.xpFor(0.1, 0.5) && W.xpFor(0.1, 0.5) > 0, 'bigger things give more xp, small ones still give some');
ok(W.xpFor(1, 1) > W.xpFor(1, 10), 'the same thing is worth less to a bigger hole');

// -- what a hole can swallow
ok(W.canEat(0.4, 0.5) && !W.canEat(0.5, 0.5) && W.canEat(0.46, 0.5), 'a hole swallows things up to 92% of its radius');
ok(W.swallowDist(0.4, 0.5) > 0.3 && W.swallowDist(0.46, 0.5) > 0, 'a swallowable thing always falls when the centre is over the hole');

// -- the map's size rules
ok(W.scaleAt(0) === 1 && W.scaleAt(W.D0) === 2, 'things are twice as big 120 m out');
ok(W.tierOf(0) === 0 && W.tierOf(119.9) === 0 && W.tierOf(120) === 1 && W.tierOf(359.9) === 1 && W.tierOf(360) === 2, 'rings change at 120 m, 360 m, 840 m ...');
for (let t = 0; t < 12; t++) { const [a, b] = W.tierRange(t); ok(W.tierOf(a) === t && W.tierOf(b - 1e-6) === t && W.tierOf(b) === t + 1, 'ring ' + t + ' edges agree with tierOf'); }
ok(W.cellSize(0) === 32 && W.cellSize(3) === 256, 'cells are 32 m wide in the first ring and double each ring');

// -- areas: the start is a village; every area exists; the same seed gives the same map
ok(W.biomeAt(0, 0) === 'village' && W.biomeAt(40, -30) === 'village', 'the start is a village');
const seen = { village: 0, forest: 0, city: 0 };
for (let k = 0; k < 3000; k++) { const d = 100 + k * 7, th = k * 2.399; seen[W.biomeAt(d * Math.cos(th), d * Math.sin(th))]++; }
ok(seen.village > 300 && seen.forest > 300 && seen.city > 300, 'villages, forests and cities all turn up (' + JSON.stringify(seen) + ')');
ok(W.biomeAt(1234.5, -987.6) === W.biomeAt(1234.5, -987.6), 'an area is the same each time it is asked');

// -- the models
for (const t of W.TYPES) {
  const m = W.model(t);
  let rad = 0, hmax = 0, inBox = true;
  for (const [cx, cy, cz, sx, sy, sz] of m.parts) { rad = Math.max(rad, Math.hypot(Math.abs(cx) + sx / 2, Math.abs(cz) + sz / 2)); hmax = Math.max(hmax, cy + sy / 2); if (cy - sy / 2 < -1e-9) inBox = false; }
  ok(near(rad, t.b, 1e-9), t.id + ': the model fits its radius');
  ok(near(hmax, m.h, 1e-9) && m.h > 0 && inBox, t.id + ': the model stands on the ground and has a height');
  ok(m.parts.every(p => /^#[0-9a-f]{6}$/i.test(p[6])), t.id + ': every part has a colour');
}
ok(new Set(W.TYPES.map(t => t.id)).size === W.TYPES.length, 'every type has its own id');
const small = W.TYPES.filter(t => t.b <= 0.4 && t.from === 0);
for (const b of ['village', 'forest', 'city']) ok(small.filter(t => t.biome === b).length >= 4, b + ' has at least four things a level 1 hole can eat from the start');

// -- cells
const a = W.genCell(1, 2, 3, 0), b = W.genCell(1, 2, 3, 0);
ok(JSON.stringify(a.objs) === JSON.stringify(b.objs), 'a cell is the same each time it is made');
W.setSeed(5); const c = W.genCell(1, 2, 3, 0); W.setSeed(20261124);
ok(JSON.stringify(c.objs) !== JSON.stringify(a.objs), 'another seed makes another map');
let bad = 0, outside = 0, wrongRing = 0, clash = 0, total = 0;
for (const [t, i, j] of [[0, 0, 0], [0, -1, -1], [0, 3, -2], [1, 1, 1], [1, -2, 1], [2, 2, -3], [2, -1, 1], [3, 4, 4], [4, -6, 2], [6, 20, -9]]) {
  const cell = W.genCell(t, i, j, 0), [dA, dB] = W.tierRange(t);
  total += cell.objs.length;
  for (const o of cell.objs) {
    const d = Math.hypot(o.x, o.z);
    if (o.x - o.r < cell.x0 - 1e-6 || o.x + o.r > cell.x0 + cell.C + 1e-6 || o.z - o.r < cell.z0 - 1e-6 || o.z + o.r > cell.z0 + cell.C + 1e-6) outside++;
    if (d < dA || d >= dB || d < W.SPAWN_CLEAR) wrongRing++;
    if (!(o.r > 0 && o.h > 0 && o.s >= W.scaleAt(d) * 0.85 - 1e-9 && o.s <= W.scaleAt(d) * 1.2 + 1e-9)) bad++;
  }
  for (let p = 0; p < cell.objs.length; p++) for (let q = p + 1; q < cell.objs.length; q++) { const u = cell.objs[p], v = cell.objs[q]; if (Math.hypot(u.x - v.x, u.z - v.z) < (u.r + v.r) * 0.85 - 1e-9) clash++; }
}
ok(total > 300, 'cells hold things (' + total + ' in ten cells)');
ok(outside === 0, 'every thing stands wholly inside its cell');
ok(wrongRing === 0, 'every thing belongs to its cell\'s ring and nothing stands on the start');
ok(bad === 0, 'every thing is sized to its distance');
ok(clash === 0, 'things in a cell do not overlap');
// cutting small things out does not move the big ones
const full = W.genCell(2, -3, 2, 0), cut = W.genCell(2, -3, 2, 1.0);
const key = o => o.ty + ':' + o.x.toFixed(6) + ':' + o.z.toFixed(6);
const fullKeys = new Set(full.objs.map(key));
ok(cut.objs.length < full.objs.length && cut.objs.every(o => o.r >= 1.0 && fullKeys.has(key(o))), 'leaving out small things leaves the rest exactly as it was');
// the start: a level 1 hole has food, and nothing big enough to be in the way
const start = W.genCell(0, 0, 0, 0);
const edible = start.objs.filter(o => W.canEat(o.r, W.R0)).length;
ok(edible > 40, 'the first cell has plenty a level 1 hole can eat (' + edible + ')');
// the four cells round the start: bigger things in sight at once (out of reach of a level 1 hole), some of them within a
// few levels' reach, and nothing enormous
const round = [[0, 0], [-1, 0], [0, -1], [-1, -1]].flatMap(([i, j]) => W.genCell(0, i, j, 0).objs);
const nextUp = round.filter(o => !W.canEat(o.r, W.R0) && W.canEat(o.r, W.radiusAt(12, 0))).length, houses = round.filter(o => o.r >= 1.8).length;
ok(nextUp >= 10, 'round the start there are plenty of things just too big for level 1 that a level 12 hole can eat (' + nextUp + ')');
ok(houses >= 2, 'round the start there are houses in sight (' + houses + ')');
ok(round.every(o => o.r < 6), 'round the start nothing is enormous');
ok(round.length > 500, 'the start has more than 500 things within 32 m (' + round.length + ')');
ok(round.filter(o => W.TYPES[o.ty].walk).length >= 20, 'and plenty of animals to wander (' + round.filter(o => W.TYPES[o.ty].walk).length + ')');
// the hole's size grows quickly early: about 5 times wider by level 70 and 8 by 100
ok(W.radiusAt(10, 0) / W.R0 > 1.5 && W.radiusAt(100, 0) / W.R0 > 7 && W.radiusAt(100, 0) / W.R0 < 10, 'the hole is 1.5 times wider by level 10 and 7 to 10 times by level 100 (' + (W.radiusAt(10, 0) / W.R0).toFixed(2) + ', ' + (W.radiusAt(100, 0) / W.R0).toFixed(1) + ')');
// further out is bigger
const nearMax = Math.max(...W.genCell(0, 0, 0).objs.map(o => o.r)), farMax = Math.max(...W.genCell(5, 3, 1).objs.map(o => o.r));
ok(farMax > nearMax * 10, 'things are much bigger far out (' + nearMax.toFixed(2) + ' m against ' + farMax.toFixed(0) + ' m)');
// city streets: cars stand on streets, buildings between them
let cars = 0, carsOff = 0, blocks = 0, blocksOn = 0;
for (let t = 1; t < 5; t++) for (let i = -8; i < 8; i++) for (let j = -8; j < 8; j++) {
  if (W.biomeAt((i + 0.5) * W.cellSize(t), (j + 0.5) * W.cellSize(t)) !== 'city') continue;
  for (const o of W.genCell(t, i, j, 0).objs) {
    const ty = W.TYPES[o.ty], g = W.grid(o.x, o.z);
    if (ty.on === 'road') { cars++; if (!(g.fu < W.ROADW || g.fv < W.ROADW)) carsOff++; }
    if (ty.on === 'block') { blocks++; if (g.fu < W.ROADW || g.fv < W.ROADW) blocksOn++; }
  }
}
ok(cars > 10 && carsOff === 0, 'cars stand on streets (' + cars + ' checked)');
ok(blocks > 10 && blocksOn === 0, 'buildings stand between streets (' + blocks + ' checked)');

// -- the cells wanted round a point
const w0 = W.wantedCells(0, 0, 10);
ok(w0.length >= 1 && w0.length <= 4 && w0[0].dist === 0, 'at the start, a few cells of ring 0 are wanted');
const w1 = W.wantedCells(0, 0, 400);
ok(w1.some(c => c.t === 0) && w1.some(c => c.t === 1) && w1.some(c => c.t === 2), 'a wide view takes in several rings');
ok(w1.every((c, i) => i === 0 || c.dist >= w1[i - 1].dist), 'wanted cells come nearest first');
ok(W.wantedCells(0, 0, 100, 1e9).length === 0, 'when everything would be a speck, nothing is wanted');
const covers = (px, pz, R) => { // every point within R of the player lies in a wanted cell of its own ring
  const want = new Set(W.wantedCells(px, pz, R).map(c => c.t + ':' + c.i + ':' + c.j));
  for (let k = 0; k < 400; k++) {
    const th = k * 2.399, rr = R * Math.sqrt((k + 0.5) / 400), x = px + rr * Math.cos(th), z = pz + rr * Math.sin(th);
    const t = W.tierOf(Math.hypot(x, z)), C = W.cellSize(t);
    if (!want.has(t + ':' + Math.floor(x / C) + ':' + Math.floor(z / C))) return false;
  }
  return true;
};
ok(covers(0, 0, 60) && covers(300, -200, 150) && covers(-1500, 900, 400) && covers(50, 50, 500), 'every point near the player is in a wanted cell');

// -- words
ok(W.fmtLen(0.5) === '50 cm' && W.fmtLen(1) === '1.0 m' && W.fmtLen(250) === '250 m' && W.fmtLen(2500) === '2.50 km' && W.fmtLen(25000) === '25 km', 'lengths are written in cm, m and km');

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

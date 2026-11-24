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

// -- plots and roads: the framework every area follows
const kindsSeen = {};
for (let t = 0; t < 5; t++) for (let i = -14; i < 14; i++) for (let j = -14; j < 14; j++) { const [dA, dB] = W.tierRange(t), c = W.cellInfo(t, i, j), d = Math.hypot(c.cx, c.cz); if (d >= dA && d < dB) kindsSeen[c.biome + '/' + c.kind] = 1; }
const KINDS = ['village/homestead', 'village/farm', 'village/pasture', 'village/field', 'village/orchard', 'village/green', 'village/pond', 'village/meadow', 'forest/dense', 'forest/mixed', 'forest/clearing', 'forest/rocky', 'forest/pond', 'forest/grove', 'city/built', 'city/park', 'city/plaza', 'city/lot'];
ok(KINDS.every(k => kindsSeen[k] && W.LAYOUTS[k.split('/')[0]][k.split('/')[1]]), 'all 18 kinds of plot turn up, and each has a layout (' + KINDS.filter(k => !kindsSeen[k]).join(',') + ')');
ok(W.cellInfo(0, 0, 0).kind === 'pasture' && W.cellInfo(0, -1, 0).kind === 'homestead' && W.cellInfo(0, 0, -1).kind === 'green' && W.cellInfo(0, -1, -1).kind === 'homestead', 'the four cells round the start are fixed');
let edgeBad = 0, edges = 0, roadStart = 0;
for (let t = 0; t < 4; t++) for (let i = -9; i < 9; i++) for (let j = -9; j < 9; j++) {
  const c = W.cellInfo(t, i, j), e = W.cellInfo(t, i + 1, j), s = W.cellInfo(t, i, j + 1);
  edges++; if (c.road.e !== e.road.w || c.road.s !== s.road.n) edgeBad++;
  for (const [sd, mx, mz] of [['w', c.x0, c.cz], ['e', c.x1, c.cz], ['n', c.cx, c.z0], ['s', c.cx, c.z1]]) if (c.road[sd] && Math.hypot(mx, mz) < 45) roadStart++;
}
ok(edgeBad === 0, 'both cells either side of a road agree on it (' + edges + ' cells)');
ok(roadStart === 0, 'no road runs through the start');
let cityEdges = 0, cityBroken = 0;
for (let t = 1; t < 4; t++) for (let i = -9; i < 9; i++) for (let j = -9; j < 9; j++) { const c = W.cellInfo(t, i, j), e = W.cellInfo(t, i + 1, j); if (c.biome === 'city' && e.biome === 'city') { cityEdges++; if (c.road.e !== 'street') cityBroken++; } }
ok(cityEdges > 20 && cityBroken === 0, 'every edge between two city plots is a street (' + cityEdges + ')');

// -- cells
const a = W.genCell(1, 2, 3, 0), b = W.genCell(1, 2, 3, 0);
ok(JSON.stringify(a.objs) === JSON.stringify(b.objs), 'a cell is the same each time it is made');
W.setSeed(5); const c5 = W.genCell(1, 2, 3, 0); W.setSeed(20261124);
ok(JSON.stringify(c5.objs) !== JSON.stringify(a.objs), 'another seed makes another map');
let bad = 0, outside = 0, wrongRing = 0, clash = 0, total = 0, cells = 0, spawnBad = 0;
const SAMPLE = [];
for (let t = 0; t < 5; t++) for (let i = -9; i < 9; i += 2) for (let j = -9; j < 9; j += 2) { const [dA, dB] = W.tierRange(t), c = W.cellInfo(t, i, j), d = Math.hypot(c.cx, c.cz); if (d >= dA && d < dB) SAMPLE.push([t, i, j]); }
for (const [t, i, j] of SAMPLE) {
  const cell = W.genCell(t, i, j, 0), [dA, dB] = W.tierRange(t);
  total += cell.objs.length; cells++;
  for (const o of cell.objs) {
    const d = Math.hypot(o.x, o.z), S = W.scaleAt(d);
    if (o.x - o.ex < cell.x0 - 1e-6 || o.x + o.ex > cell.x0 + cell.C + 1e-6 || o.z - o.ez < cell.z0 - 1e-6 || o.z + o.ez > cell.z0 + cell.C + 1e-6) outside++;
    if (d < dA || d >= dB) wrongRing++;
    if (d - o.r < W.SPAWN_CLEAR - 1e-9) spawnBad++;
    if (!(o.r > 0 && o.h > 0 && o.s >= S * 0.5 && o.s <= S * 1.4)) bad++;
  }
  for (let p = 0; p < cell.objs.length; p++) for (let q = p + 1; q < cell.objs.length; q++) { const u = cell.objs[p], v = cell.objs[q]; if (Math.abs(u.x - v.x) < (u.ex + v.ex) * 0.9 - 1e-9 && Math.abs(u.z - v.z) < (u.ez + v.ez) * 0.9 - 1e-9) clash++; }
}
ok(cells > 50 && total > 3000, 'cells hold things (' + total + ' in ' + cells + ' cells)');
ok(outside === 0, 'every thing stands wholly inside its cell');
ok(wrongRing === 0, 'every thing belongs to its cell\'s ring');
ok(spawnBad === 0, 'nothing stands on the start');
ok(bad === 0, 'every thing is sized to its distance');
ok(clash === 0, 'things in a cell do not overlap');
// cutting small things out does not move anything else
let cutBad = 0;
for (const [t, i, j] of SAMPLE.slice(0, 40)) {
  const full = W.genCell(t, i, j, 0), cut = W.genCell(t, i, j, W.scaleAt(Math.hypot(full.x0 + full.C / 2, full.z0 + full.C / 2)) * 0.5);
  const key = o => o.ty + ':' + o.x.toFixed(6) + ':' + o.z.toFixed(6), want = full.objs.filter(o => o.r >= W.scaleAt(Math.hypot(full.x0 + full.C / 2, full.z0 + full.C / 2)) * 0.5).map(key).sort().join('|');
  if (cut.objs.map(key).sort().join('|') !== want) cutBad++;
}
ok(cutBad === 0, 'leaving out small things leaves the rest exactly as it was');
// the start: a level 1 hole has food, bigger things in sight, houses, animals
const round = [[0, 0], [-1, 0], [0, -1], [-1, -1]].flatMap(([i, j]) => W.genCell(0, i, j, 0).objs);
const edible = round.filter(o => W.canEat(o.r, W.R0)).length, nextUp = round.filter(o => !W.canEat(o.r, W.R0) && W.canEat(o.r, W.radiusAt(12, 0))).length, houses = round.filter(o => /house|cottage/.test(W.TYPES[o.ty].id)).length;
ok(edible > 200, 'round the start there are plenty of things a level 1 hole can eat (' + edible + ')');
ok(nextUp >= 10, 'round the start there are things just too big for level 1 that a level 12 hole can eat (' + nextUp + ')');
ok(houses >= 2, 'round the start there are houses in sight (' + houses + ')');
ok(round.every(o => o.r < 6), 'round the start nothing is enormous');
ok(round.filter(o => W.TYPES[o.ty].walk).length >= 20, 'and plenty of animals to wander (' + round.filter(o => W.TYPES[o.ty].walk).length + ')');
ok(W.radiusAt(10, 0) / W.R0 > 1.5 && W.radiusAt(100, 0) / W.R0 > 7 && W.radiusAt(100, 0) / W.R0 < 10, 'the hole is 1.5 times wider by level 10 and 7 to 10 times by level 100');
// further out is bigger
const nearMax = Math.max(...W.genCell(0, 0, 0).objs.map(o => o.r)), farMax = Math.max(...W.genCell(5, 3, 1).objs.map(o => o.r), 0);
ok(farMax > nearMax * 8, 'things are much bigger far out (' + nearMax.toFixed(2) + ' m against ' + farMax.toFixed(0) + ' m)');

// -- believable places: things stand where they belong
const idOf = o => W.TYPES[o.ty].id.replace(/\d$/, '');
const sideDist = (c, o) => ({ w: o.x - c.x0, e: c.x1 - o.x, n: o.z - c.z0, s: c.z1 - o.z });
const cityCells = SAMPLE.filter(([t, i, j]) => W.cellInfo(t, i, j).biome === 'city' && t >= 1), built = cityCells.filter(([t, i, j]) => W.cellInfo(t, i, j).kind === 'built');
let cars = 0, carsOff = 0, carsWrong = 0, blds = 0, bldOnRoad = 0, bldWrong = 0, lamps = 0, lampsOff = 0, lights = 0, lightsOff = 0;
const angleEq = (p, q) => Math.abs(Math.atan2(Math.sin(p - q), Math.cos(p - q))) < 1e-6;
for (const [t, i, j] of built) {
  const c = W.cellInfo(t, i, j), cell = W.genCell(t, i, j, 0), TS = c.TS, S = W.STYLES.street, wd = S.w * TS, pv = S.verge * TS;
  for (const o of cell.objs) {
    const id = idOf(o), dist = sideDist(c, o);
    if (['car', 'van', 'bus'].includes(id)) {                      // in a lane, going the way traffic goes on that side
      cars++;
      const side = Object.keys(dist).filter(k => c.road[k] === 'street').sort((p, q) => dist[p] - dist[q])[0];
      if (!side || dist[side] > wd / 2 + 1e-6) carsOff++;
      else if (!angleEq(o.yaw % (2 * Math.PI), W.yawOf(...W.LANE[side]) % (2 * Math.PI))) carsWrong++;
    }
    if (['shop', 'terrace', 'flats', 'office', 'tower', 'skyscraper'].includes(id)) {   // between the pavements, facing the nearest street
      blds++;
      if (o.x - o.ex < c.inner.x0 - 1e-6 || o.x + o.ex > c.inner.x1 + 1e-6 || o.z - o.ez < c.inner.z0 - 1e-6 || o.z + o.ez > c.inner.z1 + 1e-6) bldOnRoad++;
      const side = ['w', 'e', 'n', 's'].find(k => angleEq(o.yaw, W.yawOf(...W.FACE[k])));   // it faces one street, and its front is on that street's pavement
      const ext = side === 'w' || side === 'e' ? o.ex : o.ez;
      if (!side || Math.abs(dist[side] - ext - (c.mg[side] + 0.25 * TS)) > 1e-6) bldWrong++;
    }
    if (id === 'lamp') { lamps++; const side = Object.keys(dist).sort((p, q) => dist[p] - dist[q])[0]; if (dist[side] < wd / 2 - 1e-6 || dist[side] > wd / 2 + pv + 1e-6) lampsOff++; }
    if (id === 'trafficlight') { lights++; const dx = Math.min(o.x - c.x0, c.x1 - o.x), dz = Math.min(o.z - c.z0, c.z1 - o.z); if (dx > wd / 2 + pv || dz > wd / 2 + pv) lightsOff++; }
  }
}
ok(built.length >= 8 && cars > 20 && carsOff === 0, 'cars stand in the lanes (' + cars + ' cars in ' + built.length + ' blocks)');
ok(carsWrong === 0, 'and go the way traffic goes on that side (on the left)');
ok(blds > 40 && bldOnRoad === 0, 'buildings stand between the pavements (' + blds + ' buildings)');
ok(bldWrong === 0, 'and face the street');
ok(lamps > 40 && lampsOff === 0, 'lamps stand on the pavement (' + lamps + ')');
ok(lights >= 10 && lightsOff === 0, 'traffic lights stand at the corners (' + lights + ')');
// ground: a street tile is dark, the pavement light, and no building stands on the street
let groundBad = 0;
for (const [t, i, j] of built.slice(0, 6)) {
  const c = W.cellInfo(t, i, j), wd = W.STYLES.street.w * c.TS, pv = W.STYLES.street.verge * c.TS, rd = W.groundColour(c.x0 + wd * 0.25, c.cz, 0, 0), pave = W.groundColour(c.x0 + wd / 2 + pv / 2, c.cz, 0, 0);
  if (!(rd[0] < 0.3 && rd[1] < 0.3 && pave[0] > 0.6)) groundBad++;
}
ok(groundBad === 0, 'the ground is dark where the street is and light where the pavement is');
// buildings are taller further out, and low at a city\'s edge
const heights = d0 => { const hs = []; for (const [t, i, j] of built) { const c = W.cellInfo(t, i, j); if (Math.hypot(c.cx, c.cz) < d0) continue; for (const o of W.genCell(t, i, j, 0).objs) if (['shop', 'terrace', 'flats', 'office', 'tower', 'skyscraper'].includes(idOf(o))) hs.push(o.h / W.scaleAt(Math.hypot(o.x, o.z))); } return hs; };
const lowB = W.TYPES.filter(t => /^(shop|terrace)/.test(t.id)), skyB = W.BYID.skyscraper;
ok(lowB.every(t => t.from <= 40) && skyB.from >= 800, 'shops and terraces appear from 40 m, skyscrapers only from 840 m out');
// pens: an animal in a pen is inside it; fences stand round it
let penBad = 0, pens = 0, fences = 0;
for (const [t, i, j] of SAMPLE.slice(0, 120)) for (const o of W.genCell(t, i, j, 0).objs) { if (o.pen) { pens++; if (o.x < o.pen.x0 || o.x > o.pen.x1 || o.z < o.pen.z0 || o.z > o.pen.z1) penBad++; } if (idOf(o) === 'fence') fences++; }
ok(pens > 20 && penBad === 0, 'penned animals are inside their pens (' + pens + ')');
ok(fences > 50, 'there are fences (' + fences + ')');
// the village and the forest: houses face their lane, trees are not on trails
let houseBad = 0, houseN = 0, treeOnTrail = 0, trees = 0;
for (const [t, i, j] of SAMPLE) {
  const c = W.cellInfo(t, i, j);
  if (c.biome === 'village' && c.kind === 'homestead') for (const o of W.genCell(t, i, j, 0).objs) if (/^(house|cottage)/.test(W.TYPES[o.ty].id)) { houseN++; const roads = Object.keys(c.road).filter(k => c.road[k]); if (roads.length && !roads.some(k => angleEq(o.yaw, W.yawOf(...W.FACE[k])))) houseBad++; }
  if (c.biome === 'forest') for (const o of W.genCell(t, i, j, 0).objs) if (['pine', 'oak', 'giantoak', 'redwood'].includes(idOf(o))) { trees++; const dist = sideDist(c, o); for (const k of Object.keys(dist)) if (c.road[k] && dist[k] - Math.max(o.ex, o.ez) < W.STYLES[c.road[k]].w / 2 * c.TS - 1e-6) treeOnTrail++; }
}
ok(houseN >= 10 && houseBad === 0, 'houses face their lane (' + houseN + ')');
ok(trees > 200 && treeOnTrail === 0, 'trees keep off the trails (' + trees + ')');
// ponds: a pond cell has water, and ducks and reeds round it, and nothing stands in the water
let pondBad = 0, ponds = 0, ducks = 0;
for (let t = 0; t < 4; t++) for (let i = -12; i < 12; i++) for (let j = -12; j < 12; j++) { const [dA, dB] = W.tierRange(t), c = W.cellInfo(t, i, j), d = Math.hypot(c.cx, c.cz); if (!c.pond || d < dA || d >= dB) continue; ponds++; for (const o of W.genCell(t, i, j, 0).objs) { const id = idOf(o); if (id === 'duck') ducks++; else if (Math.hypot(o.x - c.pond.x, o.z - c.pond.z) < c.pond.r * 0.9) pondBad++; } }
ok(ponds >= 6 && pondBad === 0 && ducks > 5, 'ponds have ducks and nothing but ducks in the water (' + ponds + ' ponds, ' + ducks + ' ducks)');

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

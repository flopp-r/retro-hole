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

ok(near(W.xpForRadius(W.radiusAt(1, 0)), 0, 1e-9) && near(W.xpForRadius(W.radiusAt(W.MAXLV, 0)), W.MAXXP, 1e-6), 'a hole of the starting radius has no xp, and one of the cap radius has all of it');
{ let bad = 0; for (const [L, f] of [[1, 0.3], [2, 0.9], [10, 0.5], [50, 0.1], [100, 0.99], [300, 0.5], [700, 0.2]]) { const p = W.progress(W.xpForRadius(W.radiusAt(L, f))); if (p.level !== L || Math.abs(p.frac - f) > 1e-6) bad++; }
  ok(bad === 0, 'a bot made at a size has exactly the level that size is'); }

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
const seen = {}; for (const k of Object.keys(W.BIOMES)) seen[k] = 0;
for (let k = 0; k < 6000; k++) { const d = 100 + k * 7, th = k * 2.399; seen[W.biomeAt(d * Math.cos(th), d * Math.sin(th))]++; }
ok(Object.keys(W.BIOMES).length === 7 && Object.values(seen).every(n => n > 100), 'all seven areas turn up (' + JSON.stringify(seen) + ')');
ok(W.biomeAt(1234.5, -987.6) === W.biomeAt(1234.5, -987.6), 'an area is the same each time it is asked');
// regions are big: walking out along any direction, the first change of area is a long way off, and the start is a big village
let nearest = 1e9, startR = 1e9;
for (let k = 0; k < 360; k += 5) { const th = k * Math.PI / 180; for (let d = 0; d < 3000; d += 5) if (W.biomeAt(d * Math.cos(th), d * Math.sin(th)) !== 'village') { startR = Math.min(startR, d); break; } }
ok(startR >= 150, 'the village round the start is at least 150 m in every direction (' + startR + ' m)');
// the widest circle that fits inside each patch: none of the patches near the start is small (10 m squares on a 3 km map)
{ const N = 300, H = 1500, st = 2 * H / N, g = []; for (let r = 0; r < N; r++) { g.push([]); for (let c = 0; c < N; c++) g[r].push(W.biomeAt(-H + (c + 0.5) * st, -H + (r + 0.5) * st)); }
  const dist = Array.from({ length: N }, () => new Float32Array(N).fill(1e9));
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const b = g[r][c]; if (r === 0 || c === 0 || r === N - 1 || c === N - 1 || g[r - 1][c] !== b || g[r + 1][c] !== b || g[r][c - 1] !== b || g[r][c + 1] !== b) dist[r][c] = 0; }
  for (let pass = 0; pass < 2; pass++) { const fwd = pass === 0; for (let r = fwd ? 0 : N - 1; fwd ? r < N : r >= 0; r += fwd ? 1 : -1) for (let c = fwd ? 0 : N - 1; fwd ? c < N : c >= 0; c += fwd ? 1 : -1) { let v = dist[r][c]; const s = fwd ? -1 : 1; if (r + s >= 0 && r + s < N) v = Math.min(v, dist[r + s][c] + 1); if (c + s >= 0 && c + s < N) v = Math.min(v, dist[r][c + s] + 1); dist[r][c] = v; } }
  const seen = Array.from({ length: N }, () => new Uint8Array(N)), small = [];
  for (let r0 = 0; r0 < N; r0++) for (let c0 = 0; c0 < N; c0++) { if (seen[r0][c0]) continue; const b = g[r0][c0], stack = [[r0, c0]]; seen[r0][c0] = 1; let maxd = 0, edge = false, cx = 0, cz = 0, n = 0;
    while (stack.length) { const [r, c] = stack.pop(); n++; cx += c; cz += r; maxd = Math.max(maxd, dist[r][c]); if (r === 0 || c === 0 || r === N - 1 || c === N - 1) edge = true; for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < N && cc < N && !seen[rr][cc] && g[rr][cc] === b) { seen[rr][cc] = 1; stack.push([rr, cc]); } } }
    const away = Math.hypot(cx / n * st - H, cz / n * st - H);
    // strips along a ring edge, where the cells of two rings meet and decide a boundary at different resolutions, are not regions (HANDOVER.md, known limits)
    const t = W.tierOf(away), nearRingEdge = [W.tierRange(t)[0], W.tierRange(t)[1]].some(e => Math.abs(away - e) < 2 * W.cellSize(t) + 30);
    if (!edge && n > 40 && !nearRingEdge && 2 * maxd * st < 250 && away < 1000) small.push(b + ' ' + Math.round(2 * maxd * st) + ' m'); }
  ok(small.length === 0, 'no area within 1 km of the start has a patch narrower than 250 m (' + small.join(', ') + ')'); }

// -- rival holes
{ let n = 0, cells = 0, mism = 0, bad = 0, nearStart = 0; const names = new Set();
  for (let tt = 0; tt < 5; tt++) for (let i = -12; i < 12; i++) for (let j = -12; j < 12; j++) { const [dA, dB] = W.tierRange(tt), c = W.cellInfo(tt, i, j), d = Math.hypot(c.cx, c.cz); if (d < dA || d >= dB) continue; cells++;
    const b = W.genCell(tt, i, j, 0).bot, b2 = W.genCell(tt, i, j, 0.5).bot;
    if (JSON.stringify(b) !== JSON.stringify(b2)) mism++;
    if (!b) continue; n++; names.add(b.name);
    const dd = Math.hypot(b.x, b.z), S = W.scaleAt(dd), f = b.r / (W.R0 * S);
    if (!(f >= 0.49 && f <= 2.7) || b.x < c.x0 || b.x > c.x1 || b.z < c.z0 || b.z > c.z1 || W.tierOf(dd) !== tt || !/^#[0-9a-f]{6}$/i.test(b.colour)) bad++;
    if (dd < 150 && f > 1.21 && !(tt === 0 && W.START_BOTS)) bad++; }
  ok(mism === 0, 'a cell\'s bot is the same however much is culled');
  ok(bad === 0, 'every bot is inside its cell and as big as its place suits (0.5 to 2.7 times, and no bigger than 1.2 times near the start)');
  ok(n / cells > 0.12 && n / cells < 0.28 && names.size > 25, 'about one cell in five has a bot, with many different names (' + n + ' in ' + cells + ' cells, ' + names.size + ' names)');
  const a = W.genCell(0, 0, 0, 0).bot, b = W.genCell(0, -1, -1, 0).bot;
  ok(a && b && a.r < W.R0 * 1.0 && b.r < W.R0 * 0.8 && W.canEat(b.r, W.R0) && !W.canEat(W.R0, a.r * 0.5), 'two small bots live round the start, neither able to swallow a new hole'); }

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
for (let t = 0; t < 7; t++) for (let i = -30; i < 30; i++) for (let j = -30; j < 30; j++) { const [dA, dB] = W.tierRange(t), c = W.cellInfo(t, i, j), d = Math.hypot(c.cx, c.cz); if (d >= dA && d < dB) kindsSeen[c.biome + '/' + c.kind] = 1; }
const KINDS = ['jurassic/jungle', 'jurassic/paddock', 'jurassic/nest', 'jurassic/visitor', 'jurassic/lagoon', 'jurassic/compound', 'desert/dunes', 'desert/oasis', 'desert/town', 'desert/ruins', 'desert/canyon', 'desert/camp', 'arctic/snowfield', 'arctic/pinewood', 'arctic/frozenlake', 'arctic/outpost', 'arctic/iglooville', 'arctic/glacier', 'volcano/ashfield', 'volcano/lavaflow', 'volcano/crater', 'volcano/mine', 'volcano/forge', 'volcano/spires', 'village/homestead', 'village/farm', 'village/pasture', 'village/field', 'village/orchard', 'village/green', 'village/pond', 'village/meadow', 'forest/dense', 'forest/mixed', 'forest/clearing', 'forest/rocky', 'forest/pond', 'forest/grove', 'city/built', 'city/park', 'city/plaza', 'city/lot'];
ok(KINDS.every(k => kindsSeen[k] && W.LAYOUTS[k.split('/')[0]][k.split('/')[1]]), 'all 42 kinds of plot turn up, and each has a layout (' + KINDS.filter(k => !kindsSeen[k]).join(',') + ')');
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
const scanCells = (pred, limit) => { const out = []; for (let tt = 0; tt < 6 && out.length < limit; tt++) for (let i = -30; i < 30 && out.length < limit; i++) for (let j = -30; j < 30 && out.length < limit; j++) { const [dA, dB] = W.tierRange(tt), c = W.cellInfo(tt, i, j), d = Math.hypot(c.cx, c.cz); if (d >= dA && d < dB && pred(c)) out.push([tt, i, j]); } return out; };
const idOf = o => W.TYPES[o.ty].id.replace(/\d$/, '');
const DINO_IDS = ['gallimimus', 'raptor', 'ankylosaurus', 'triceratops', 'stegosaurus', 'trex', 'brachio'];
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
for (const [t, i, j] of built.filter(([t, i, j]) => { const c = W.cellInfo(t, i, j); return c.road.w === 'street' && W.tierOf(Math.hypot(c.x0, c.cz)) === t && W.tierOf(Math.hypot(c.x0 + 0.1 * c.C, c.cz)) === t; }).slice(0, 6)) {
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
for (const [tt, i, j] of scanCells(c => c.biome === 'village' && c.kind === 'homestead', 60)) { const c = W.cellInfo(tt, i, j);
  for (const o of W.genCell(tt, i, j, 0).objs) if (/^(house|cottage)/.test(W.TYPES[o.ty].id)) { houseN++; const roads = Object.keys(c.road).filter(k => c.road[k]); if (roads.length && !roads.some(k => angleEq(o.yaw, W.yawOf(...W.FACE[k])))) houseBad++; } }
const TREE_IDS = ['pine', 'oak', 'giantoak', 'redwood', 'jungletree', 'tropicpalm', 'cycad', 'swamptree', 'snowpine', 'datepalm', 'charredtree'];
for (const [tt, i, j] of scanCells(c => ['forest', 'jurassic', 'arctic', 'desert', 'volcano'].includes(c.biome) && ['dense', 'mixed', 'grove', 'jungle', 'pinewood', 'oasis', 'ashfield'].includes(c.kind), 160)) { const c = W.cellInfo(tt, i, j);
  for (const o of W.genCell(tt, i, j, 0).objs) if (TREE_IDS.includes(idOf(o))) { trees++; const dist = sideDist(c, o); for (const k of Object.keys(dist)) if (c.road[k] && dist[k] - Math.max(o.ex, o.ez) < W.STYLES[c.road[k]].w / 2 * c.TS - 1e-6) treeOnTrail++; } }
ok(houseN >= 10 && houseBad === 0, 'houses face their lane (' + houseN + ')');
ok(trees > 1000 && treeOnTrail === 0, 'trees keep off the roads and trails in every area (' + trees + ')');
// pools and rivers (water, ice, lava): only things that belong on them stand in them
let wetBad = 0, pools = 0, wet = 0, riverBad = 0, rivers = 0; const liquids = new Set();
for (const [tt, i, j] of scanCells(c => !!c.pond || !!c.river, 120)) { const c = W.cellInfo(tt, i, j); if (c.pond) { pools++; liquids.add(c.pond.liquid); } if (c.river) { rivers++; liquids.add(c.river.liquid); }
  for (const o of W.genCell(tt, i, j, 0).objs) { const inPond = c.pond && Math.hypot(o.x - c.pond.x, o.z - c.pond.z) < c.pond.r * 0.9, inRiver = c.river && Math.abs((c.river.horiz ? o.z : o.x) - c.river.at) < c.river.w / 2 * 0.9;
    if (inPond || inRiver) { if (o.wet) wet++; else wetBad++; } } }
ok(pools >= 20 && rivers >= 3 && liquids.size === 3 && wetBad === 0 && wet > 40, 'only creatures and reeds that belong stand in water, ice or lava (' + pools + ' pools, ' + rivers + ' rivers, ' + wet + ' things on the liquid, ' + [...liquids].join('/') + ')');
// pens of every kind: electric fences round dinosaurs, a herd of one species, a gate
let paddocks = 0, fencedOk = 0;
const inRing = c => [[c.x0, c.z0], [c.x1, c.z0], [c.x0, c.z1], [c.x1, c.z1]].every(q => W.tierOf(Math.hypot(...q)) === c.t);   // not straddling a ring edge
for (const [tt, i, j] of scanCells(c => c.biome === 'jurassic' && c.kind === 'paddock' && inRing(c), 12)) { const objs = W.genCell(tt, i, j, 0).objs; paddocks++; const penned = objs.filter(o => o.pen && DINO_IDS.includes(idOf(o))), species = new Set(penned.map(idOf)); if (penned.length >= 2 && species.size === 1 && objs.some(o => idOf(o) === 'gate') && objs.filter(o => idOf(o) === 'efence').length > 20) fencedOk++; }
ok(paddocks >= 6 && fencedOk === paddocks, 'every dinosaur paddock has a herd of one species behind an electric fence with a gate (' + paddocks + ')');
// each new area has its own things, and its small ones are there to eat from the start of its ring
const AREA_SMALL = { jurassic: ['egg', 'compy'], desert: ['scorpion', 'lizard', 'cactus'], arctic: ['hare', 'penguin', 'snowdrift'], volcano: ['magmanewt', 'ember', 'lavarock'] };
for (const [area, ids] of Object.entries(AREA_SMALL)) { const found = new Set(); for (const [tt, i, j] of scanCells(c => c.biome === area, 25)) for (const o of W.genCell(tt, i, j, 0).objs) found.add(idOf(o)); ok(ids.every(id => found.has(id)) && found.size >= 14, area + ' has its own small things and at least 14 kinds of thing (' + found.size + ')'); }

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

// -- quick mode: one fixed scale, no level cap, regions of one size, extremely fast growth
W.setMode('quick');
ok(W.getMode() === 'quick' && W.scaleAt(0) === 1 && W.scaleAt(1e6) === 1 && W.tierOf(1e6) === 0 && W.tierRange(0)[1] === Infinity && W.cellSize(0) === 32, 'quick mode has one scale and one cell size however far out');
ok(W.MAXLV === Infinity && W.MAXXP === Infinity && W.progress(1e9).level > 10000, 'quick mode has no level cap');
{ let mono = true, back = 0; for (let L = 1; L < 3000; L += 7) { if (!(W.radiusAt(L + 1, 0) > W.radiusAt(L, 0)) || !(W.need(L + 1) >= W.need(L))) mono = false; const p = W.progress(W.cum(L) + 1e-9); if (p.level !== L) back++; }
  ok(mono && back === 0, 'quick mode levels only go up, and xp gives back the level');
  let rt = 0; for (const [L, f] of [[1, 0.3], [2, 0.9], [10, 0.5], [100, 0.99], [1000, 0.5], [9000, 0.2]]) { const p = W.progress(W.xpForRadius(W.radiusAt(L, f))); if (p.level !== L || Math.abs(p.frac - f) > 1e-6) rt++; }
  ok(rt === 0, 'a bot made at a size has exactly that level in quick mode'); }
ok(near(W.radiusAt(1, 0), 0.5, 1e-12) && W.radiusAt(100, 0) > 6 && W.radiusAt(100, 0) < 8 && W.radiusAt(1000, 0) > 20 && W.radiusAt(1000, 0) < 35, 'the hole reaches the size of the biggest buildings at level 100 (' + W.radiusAt(100, 0).toFixed(1) + ' m) and keeps growing more slowly (' + W.radiusAt(1000, 0).toFixed(0) + ' m at 1,000)');
ok(W.cum(10) < 1.5 && W.cum(100) < 25 && W.need(1) < 0.2, 'levels need very little xp (' + W.cum(100).toFixed(1) + ' xp to level 100, against ' + (() => { W.setMode('normal'); const v = W.CUM[100].toFixed(0); W.setMode('quick'); return v; })() + ' normally)');
// the map: areas are regions of one size, the start is a big village, and things are the same size everywhere
{ const seenQ = {}; for (const k of Object.keys(W.BIOMES)) seenQ[k] = 0; for (let k = 0; k < 8000; k++) { const d = 100 + k * 6, th = k * 2.399; seenQ[W.biomeAt(d * Math.cos(th), d * Math.sin(th))]++; }
  ok(Object.values(seenQ).every(n => n > 150), 'all seven areas turn up in quick mode (' + JSON.stringify(seenQ) + ')');
  let startRq = 1e9; for (let k = 0; k < 360; k += 5) { const th = k * Math.PI / 180; for (let d = 0; d < 4000; d += 5) if (W.biomeAt(d * Math.cos(th), d * Math.sin(th)) !== 'village') { startRq = Math.min(startRq, d); break; } }
  ok(startRq >= 250, 'the village round the start is at least 250 m in every direction (' + startRq + ' m)');
  // regions are the same size near and far: count area changes along a line 0-1.5 km and 8-9.5 km out
  const changes = (from) => { let n = 0, last = null; for (let d = from; d < from + 1500; d += 10) { const b = W.biomeAt(d, 0.37 * d); if (last && b !== last) n++; last = b; } return n; };
  const near = changes(300), far = changes(8000), far2 = changes(20000);
  ok(near >= 1 && far >= 1 && far2 >= 1 && far <= near * 5 && near <= far * 5 + 5, 'areas change about as often far out as near (' + near + ', ' + far + ', ' + far2 + ' changes in 1.5 km)'); }
{ let sizeBad = 0, outside = 0, clash = 0, cells = 0, objsN = 0;
  for (const [i, j] of [[0, 0], [-1, 0], [5, 7], [-40, 30], [200, -150], [900, 600], [-3000, 100]]) { const cell = W.genCell(0, i, j, 0); cells++; objsN += cell.objs.length;
    for (const o of cell.objs) { if (!(o.s >= 0.5 && o.s <= 1.4)) sizeBad++; if (o.x - o.ex < cell.x0 - 1e-6 || o.x + o.ex > cell.x0 + 32 + 1e-6 || o.z - o.ez < cell.z0 - 1e-6 || o.z + o.ez > cell.z0 + 32 + 1e-6) outside++; }
    for (let p = 0; p < cell.objs.length; p++) for (let q = p + 1; q < cell.objs.length; q++) { const u = cell.objs[p], v = cell.objs[q]; if (Math.abs(u.x - v.x) < (u.ex + v.ex) * 0.9 - 1e-9 && Math.abs(u.z - v.z) < (u.ez + v.ez) * 0.9 - 1e-9) clash++; } }
  ok(objsN > 800 && sizeBad === 0, 'things are the same size 100 m or 100 km out (' + objsN + ' things in ' + cells + ' cells)');
  ok(outside === 0 && clash === 0, 'and stand wholly inside their cell, not overlapping');
  ok(JSON.stringify(W.genCell(0, 12, -9, 0).objs) === JSON.stringify(W.genCell(0, 12, -9, 0).objs), 'a quick cell is the same each time');
  const full = W.genCell(0, 40, 25, 0), cut = W.genCell(0, 40, 25, 0.4), keep = full.objs.filter(o => o.r >= 0.4).map(o => o.ty + ':' + o.x.toFixed(5) + ':' + o.z.toFixed(5)).sort().join('|');
  ok(cut.objs.map(o => o.ty + ':' + o.x.toFixed(5) + ':' + o.z.toFixed(5)).sort().join('|') === keep, 'leaving out small things leaves the rest exactly as it was, in quick mode too'); }
{ const kindsQ = {}; for (let i = -120; i < 120; i++) for (let j = -120; j < 120; j++) { const c = W.cellInfo(0, i, j); kindsQ[c.biome + '/' + c.kind] = 1; }
  ok(KINDS.every(k => kindsQ[k]), 'all 42 kinds of plot turn up in quick mode (' + KINDS.filter(k => !kindsQ[k]).join(',') + ')'); }
// bots in quick mode: small near the start, bigger the further out, to 14 times by 1.5 km
{ const rs = d => { const out = []; for (let a = 0; a < 3000 && out.length < 40; a++) { const th = a * 2.399, x = d * Math.cos(th), z = d * Math.sin(th), c = W.cellAt(x, z), b = W.genCell(0, c.i, c.j, 0).bot; if (b) out.push(b.r); } return out.sort((p, q) => p - q)[Math.floor(out.length / 2)]; };
  const nearR = rs(100), farR = rs(2500);
  ok(nearR < 1.2 && farR > 3 * nearR && W.botScale(5000) === W.QUICK.BOT_X && W.botScale(0) === 1, 'bots get bigger with distance in quick mode (' + nearR.toFixed(2) + ' m at 100 m, ' + farR.toFixed(1) + ' m at 2.5 km)'); }
{ const w = W.wantedCells(0, 0, 1e6, 0); ok(w.length === 1200 && w.every((c, i) => i === 0 || c.dist >= w[i - 1].dist), 'a hole far too big for the cells wants only the nearest ones (quick mode)'); }
W.setMode('normal');
ok(W.getMode() === 'normal' && W.MAXLV === 1000 && W.scaleAt(120) === 2 && W.cellSize(2) === 128, 'switching back to normal mode gives the normal world again');

// -- coins: on the map, and what a hole earns
{ const coin = W.BYID.coin;
  ok(coin && coin.b < 0.2 && coin.from === 0 && W.canEat(coin.b * 0.85, W.R0), 'a gold coin is small and from the start, and a level 1 hole can swallow it');
  const perCell = (mode) => { W.setMode(mode); let n = 0, cells = 0, bad = 0, others = 0; for (let i = -6; i < 6; i++) for (let j = -6; j < 6; j++) { const cell = W.genCell(0, i, j, 0), c = W.cellInfo(0, i, j), d = Math.hypot(c.cx, c.cz); if (mode === 'normal' && d > 80) continue; cells++; for (const o of cell.objs) { if (o.ty === coin.i) { n++; if (o.state !== 0 || !(o.r > 0.1)) bad++; } else others++; } } return { n, cells, bad }; };
  const nm = perCell('normal'), qk = perCell('quick');
  ok(nm.n / nm.cells > 0.5 && nm.n / nm.cells < 4 && qk.n / qk.cells > 0.5 && qk.n / qk.cells < 6 && nm.bad === 0, 'about one or two coins in a plot (' + (nm.n / nm.cells).toFixed(2) + ' normal, ' + (qk.n / qk.cells).toFixed(2) + ' quick)');
  W.setMode('normal');
  // coins are put down last, so a cell without them is exactly what it was
  const noCoin = (cell) => cell.objs.filter(o => o.ty !== coin.i).map(o => [o.ty, o.x.toFixed(6), o.z.toFixed(6), o.s.toFixed(6)].join()).join('|');
  const again = noCoin(W.genCell(0, 3, -2, 0)) === noCoin(W.genCell(0, 3, -2, 0)), cutOk = (() => { const full = W.genCell(1, 4, 2, 0), cut = W.genCell(1, 4, 2, 0.3); const keep = full.objs.filter(o => o.r >= 0.3).map(o => o.ty + ':' + o.x.toFixed(5) + ':' + o.z.toFixed(5)).sort().join('|'); return cut.objs.map(o => o.ty + ':' + o.x.toFixed(5) + ':' + o.z.toFixed(5)).sort().join('|') === keep; })();
  ok(again && cutOk, 'coins do not break the rules for a cell: the same each time, and leaving out small things leaves the rest as it was');
  // pay
  W.setMode('normal');
  let up = true; for (let L = 1; L < 1000; L++) if (W.levelPay(L + 1) < W.levelPay(L)) up = false;
  ok(up && W.levelPay(1) === 1 && W.levelPay(100) === 21 && W.levelPay(1000) === 201, 'a level pays more the higher it is (1 coin at level 1, 21 at 100, 201 at 1,000)');
  ok(W.foundPay(W.R0) === 10 && W.foundPay(W.radiusAt(100, 0)) === 55 && W.foundPay(W.radiusAt(1000, 0)) === 160, 'a coin found pays more for a bigger hole (10, 55 and 160 coins)');
  ok(W.sizeLevel(W.radiusAt(250, 0)) === 250 && W.sizeLevel(0.1) === 1 && W.sizeLevel(1e9) === 1000, 'the size level of a normal hole is its level');
  ok(W.killPay(W.radiusAt(50, 0), 0) === 55 && W.killPay(W.radiusAt(50, 0), 1) === 27.5 && W.killPay(W.radiusAt(50, 0), 3) === 13.75, 'a bot swallowed pays 5 plus its size level, less each time the same bot is swallowed again');
  W.setMode('quick');
  ok(W.levelPay(100) === 0.21 && W.levelPay(1000) < 3 && W.foundPay(W.R0) === 1, 'in Quick Game a level pays 1/100 and a coin found 1/10 of what they do in the normal game');
  { let total = 0; for (let L = 1; L <= 1000; L++) total += W.levelPay(L); W.setMode('normal'); let totalN = 0; for (let L = 1; L <= 1000; L++) totalN += W.levelPay(L);
    ok(total > 500 && total < 1500 && totalN > 90000, 'all 1,000 levels pay about ' + Math.round(total) + ' coins in Quick Game (16 minutes) and ' + totalN + ' in the normal game (about 20 hours)'); } }
W.setMode('normal');

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

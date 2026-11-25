// Every area and the plot kinds with a liquid or a river: go there, and the HUD names the area, things stand all
// round, the ground is the area's colour, and nothing reaches the console.
const { launch, serve, watch, ok, ready, frames, shot } = require('./lib.js');
(async () => {
  const site = await serve(), { b, newPage } = await launch();
  const log = [];
  const p = await newPage({ viewport: { width: 480, height: 300 } });
  watch(p, log);
  await p.goto(site.url); await ready(p); await p.click('#bPlay'); await frames(p, 4);
  await p.evaluate(() => { __rh.H.prot = 1e9; });
  const find = (biome, kind, loose) => p.evaluate(([bm, kd, loose]) => { const W = __rh.W;
    for (let t = 1; t < 7; t++) for (let i = -60; i < 60; i++) for (let j = -60; j < 60; j++) { const c = W.cellInfo(t, i, j), [a, b] = W.tierRange(t), cs = [[c.x0, c.z0], [c.x1, c.z0], [c.x0, c.z1], [c.x1, c.z1]].map(q => Math.hypot(...q)); if ((!loose && (Math.min(...cs) < a || Math.max(...cs) >= b)) || c.biome !== bm || (kd && c.kind !== kd) || Math.hypot(c.cx, c.cz) < a) continue; return { x: c.cx, z: c.cz, S: W.scaleAt(Math.hypot(c.cx, c.cz)), kind: c.kind, pond: c.pond ? c.pond.liquid : null, river: c.river ? c.river.liquid : null }; }
    return null; }, [biome, kind, !!loose]);
  const visit = async (spot, k = 0.9) => {
    await p.evaluate(([s, k]) => { const W = __rh.W; let L = 1; while (W.radiusAt(L, 0) < k * 0.5 * s.S && L < 999) L++; __rh.setXp(W.CUM[L]); __rh.teleport(s.x, s.z); }, [spot, k]);
    await frames(p, 14);
    return p.evaluate(() => ({ area: document.querySelector('#wArea').textContent.trim(), objs: __rh.objects, standing: __rh.standing(), slots: __rh.poolSlots(), falling: __rh.FALL.length, calls: __rh.drawn.calls }));
  };
  const NAMES = { village: 'Village', forest: 'Forest', city: 'City', jurassic: 'Jurassic Park', desert: 'Desert', arctic: 'Arctic', volcano: 'Volcano' };
  for (const biome of Object.keys(NAMES)) {
    const spot = await find(biome); if (!spot) { ok(false, biome + ': no cell found'); continue; }
    const r = await visit(spot);
    ok(r.area === NAMES[biome], biome + ': the HUD says ' + NAMES[biome] + ' (' + r.area + ', a ' + spot.kind + ')');
    ok(r.objs > 150 && r.slots === r.standing + r.falling, biome + ': it is full of things, each drawn once (' + r.objs + ')');
  }
  // the ground really is each area's colour: sample a ground tile of a plot of each kind
  const colours = await p.evaluate(() => { const W = __rh.W, out = {}; for (const bm of Object.keys(W.BIOMES)) { for (let tt = 1; tt < 6 && !out[bm]; tt++) for (let i = -60; i < 60 && !out[bm]; i++) for (let j = -60; j < 60 && !out[bm]; j++) { const c = W.cellInfo(tt, i, j), cs = [[c.x0, c.z0], [c.x1, c.z0], [c.x0, c.z1], [c.x1, c.z1]].map(q => W.tierOf(Math.hypot(...q))); if (c.biome === bm && !c.pond && !c.river && cs.every(x => x === tt) && !c.road.w && !c.road.n && ['jungle', 'dunes', 'snowfield', 'ashfield'].includes(c.kind)) out[bm] = W.groundColour(c.cx, c.cz, 7, 9); } } return out; });
  const lum = c => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  ok(colours.arctic && lum(colours.arctic) > 0.8 && colours.volcano && lum(colours.volcano) < 0.25 && colours.desert && colours.desert[0] > colours.desert[2] + 0.2 && colours.jurassic && colours.jurassic[1] > colours.jurassic[0], 'arctic ground is white, volcano ground dark, desert sandy, jungle green');
  // lava, ice and water
  for (const [biome, kind, liquid, test] of [['volcano', 'lavaflow', 'lava', c => c[0] > 0.8 && c[2] < 0.35], ['volcano', 'crater', 'lava', c => c[0] > 0.8 && c[2] < 0.35], ['arctic', 'frozenlake', 'ice', c => c[2] > c[0] && lum(c) > 0.6], ['desert', 'oasis', 'water', c => c[2] > c[0]], ['jurassic', 'lagoon', 'water', c => c[2] > c[0]]]) {
    const spot = await find(biome, kind, kind === 'crater'); if (!spot) { ok(false, kind + ': no cell found'); continue; }
    const r = await visit(spot, 0.9);
    const colour = await p.evaluate(s => { const W = __rh.W, c = W.cellAt(s.x, s.z), q = c.pond ? { x: c.pond.x, z: c.pond.z } : { x: c.river.horiz ? c.cx : c.river.at, z: c.river.horiz ? c.river.at : c.cz }; return W.groundColour(q.x, q.z, 3, 4); }, spot);
    ok((spot.pond || spot.river) === liquid && test(colour) && r.objs > 100, kind + ': a ' + liquid + ' ' + (spot.pond ? 'pool' : 'river') + ' coloured as such (' + colour.map(v => v.toFixed(2)).join(',') + ')');
  }
  const here = await find('jurassic', 'paddock');
  if (here) { await visit(here); await p.screenshot({ path: shot('paddock.png') }); }
  ok(log.length === 0, 'the console stayed clean' + (log.length ? ': ' + log.slice(0, 3).join(' | ') : ''));
  await b.close(); site.close();
})().catch(e => { console.error(e); process.exit(1); });

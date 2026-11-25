// The extremes: a hole at the level cap, a tiny hole far from the start, a big hole where everything is dust, and the
// way back. Nothing may reach the console, and the number of things made must stay inside the budget.
const { launch, serve, watch, ok, ready, frames, shot } = require('./lib.js');
(async () => {
  const site = await serve(), { b, newPage } = await launch();
  const log = [];
  const p = await newPage({ viewport: { width: 480, height: 300 } });
  watch(p, log);
  await p.goto(site.url); await ready(p); await p.click('#bPlay'); await frames(p, 3);
  const state = () => p.evaluate(() => ({ lvl: __rh.H.level, r: __rh.H.r, objs: __rh.objects, standing: __rh.standing(), slots: __rh.poolSlots(), falling: __rh.FALL.length, cells: __rh.CELLS.size, tile: __rh.tile, calls: __rh.drawn.calls, tris: __rh.drawn.tris, near: __rh.nearestEdible(), q: __rh.queue }));

  // the level cap, 500 km out, where things are 4,000 times the starting size
  await p.evaluate(() => { __rh.setXp(__rh.W.MAXXP * 2); __rh.teleport(400000, 300000); }); await frames(p, 8);
  let s = await state();
  ok(s.lvl === 1000 && Math.abs(s.r - 2500) < 1, 'level 1,000 has a hole 5 km wide (' + s.r.toFixed(1) + ' m radius)');
  ok((await p.textContent('#lvNum')).trim() === 'Level 1,000' && (await p.textContent('#lvNext')).trim() === 'MAX' && (await p.textContent('#lvSize')).includes('5.00 km'), 'the HUD says Level 1,000, MAX and 5.00 km wide');
  ok(s.objs > 5 && s.objs <= 14000 && s.slots === s.standing + s.falling && s.near !== null, 'a cap-level hole 500 km out has things to eat (' + s.objs + ')');
  const e0 = await p.evaluate(() => { const n = __rh.nearestEdible(); __rh.teleport(n.x, n.z); return __rh.H.eaten; });
  await frames(p, 40);
  ok(await p.evaluate(e => __rh.H.eaten > e && __rh.FALL.length === 0, e0), 'it can still eat there');
  await p.screenshot({ path: shot('cap-far.png') });
  ok(s.tile.n > 0 && s.tile.n <= 90, 'the ground field stays a sensible size (' + s.tile.n + ' tiles across)');

  // the cap-level hole back where everything is dust: nothing is made, nothing breaks
  await p.evaluate(() => __rh.teleport(0, 0)); await frames(p, 8);
  s = await state();
  ok(s.objs <= 14000 && s.slots === s.standing + s.falling, 'at the start a cap-level hole sees 80 km round it, and what it makes stays inside the budget (' + s.objs + ' made)');
  await p.screenshot({ path: shot('cap-start.png') });

  // a level 1 hole 20 km out: everything is huge, nothing is edible, but it can walk home
  await p.evaluate(() => { __rh.setXp(0); __rh.teleport(20000, 0); }); await frames(p, 8);
  s = await state();
  ok(s.lvl === 1 && s.near === null && s.objs > 0, 'a level 1 hole 20 km out finds nothing it can eat (' + s.objs + ' things, all too big)');
  ok(await p.evaluate(() => __rh.speedRef() > 20 * __rh.H.r), 'but it moves much faster than its size alone gives, so it can walk home');
  await p.screenshot({ path: shot('tiny-far.png') });
  await p.evaluate(() => __rh.pause()); await p.click('#bHome'); await frames(p, 6);
  s = await state();
  ok(await p.evaluate(() => __rh.state === 'play' && __rh.H.x === 0 && __rh.H.z === 0) && s.lvl === 1 && s.near !== null, 'Return to Start puts the hole back at the start, at the same level, with food again');
  ok((await p.textContent('#wDist')).includes('At the start'), 'and the HUD says so');

  // it says something when nothing is nearby for a while
  await p.evaluate(() => { __rh.teleport(20000, 0); }); await frames(p, 4);
  await p.evaluate(() => { document.querySelector('#hint').textContent = ''; });
  const said = await p.evaluate(() => new Promise(res => { const t0 = performance.now(); const f = () => { const h = document.querySelector('#hint'); if (/Return to Start/.test(h.textContent)) res(true); else if (performance.now() - t0 > 14000) res(false); else setTimeout(f, 200); }; f(); }));
  ok(said, 'with nothing small enough nearby for a while, a hint points to Return to Start');

  // a big hole in a place where everything is small (a city 700 m out, seen by a level 400 hole) must not make and drop
  // cells over and over: that regrew what was eaten there, and the place seemed to refresh itself
  const city = await p.evaluate(() => { const W = __rh.W; for (let t = 1; t < 4; t++) for (let i = -30; i < 30; i++) for (let j = -30; j < 30; j++) { const c = W.cellInfo(t, i, j), [a, b] = W.tierRange(t); const cs = [[c.x0, c.z0], [c.x1, c.z0], [c.x0, c.z1], [c.x1, c.z1]].map(q => Math.hypot(...q)); if (Math.min(...cs) >= a && Math.max(...cs) < b && c.biome === 'city' && c.kind === 'built') return { x: c.cx, z: c.cz }; } return null; });
  ok(!!city, 'there is a city to test in');
  await p.evaluate(c => { __rh.setXp(__rh.W.CUM[400]); __rh.teleport(c.x, c.z); }, city); await frames(p, 40);
  const churn = await p.evaluate(() => new Promise(res => {
    let prev = new Set(__rh.CELLS.keys()), made = 0, dropped = 0, objsMax = 0; const e0 = __rh.H.eaten, t0 = performance.now();
    const tick = () => { const cur = new Set(__rh.CELLS.keys()); for (const k of cur) if (!prev.has(k)) made++; for (const k of prev) if (!cur.has(k)) dropped++; prev = cur; objsMax = Math.max(objsMax, __rh.objects);
      if (performance.now() - t0 > 3000) res({ made, dropped, eaten: __rh.H.eaten - e0, cells: cur.size, objsMax }); else setTimeout(tick, 40); };
    tick();
  }));
  ok(churn.cells > 100 && churn.objsMax <= 14500, 'a level 400 hole in a small-scale city holds many cells within the budget (' + churn.cells + ' cells, ' + churn.objsMax + ' things)');
  ok(churn.made === 0 && churn.dropped === 0, 'and, standing still, makes and drops none (' + churn.made + ' made, ' + churn.dropped + ' dropped)');
  ok(churn.eaten === 0, 'so nothing it eats grows back at once');

  // a long walk keeps the books straight: every few seconds of movement, nothing leaks
  await p.evaluate(() => { __rh.teleport(0, 0); __rh.setXp(__rh.W.CUM[60]); });
  for (let k = 0; k < 8; k++) {
    await p.evaluate(k => { __rh.steer(k % 2 ? 1 : -1, 1); }, k); await frames(p, 25);
  }
  await p.evaluate(() => __rh.steer(0, 0)); await frames(p, 30);
  s = await state();
  ok(s.slots === s.standing && s.falling === 0 && s.objs <= 14000, 'after a long walk and many things eaten, the drawn copies match the things standing (' + s.slots + ')');
  ok(await p.evaluate(() => Math.hypot(__rh.H.x, __rh.H.z)) > 5, 'the walk went somewhere');

  ok(log.length === 0, 'the console stayed clean' + (log.length ? ': ' + log.slice(0, 3).join(' | ') : ''));
  await b.close(); site.close();
})().catch(e => { console.error(e); process.exit(1); });

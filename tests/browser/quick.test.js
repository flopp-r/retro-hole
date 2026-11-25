// Quick Game: picked from the title screen, one size of everything everywhere, extremely fast growth with no level cap,
// its own save, the normal game untouched, and a clean console.
const { launch, serve, watch, ok, ready, frames, shot } = require('./lib.js');
(async () => {
  const site = await serve(), { b, newPage } = await launch();
  const log = [];
  const p = await newPage({ viewport: { width: 760, height: 340 } });
  watch(p, log);
  await p.goto(site.url); await ready(p);

  // the title screen: Play, Quick Game and Settings, all inside a phone held sideways
  const vis = sel => p.evaluate(s => { const e = document.querySelector(s); return !!e && !e.hidden && e.offsetParent !== null; }, sel);
  ok(await vis('#bPlay') && await vis('#bQuick') && await vis('#bSet') && !await vis('#bNew') && !await vis('#bQuickNew'), 'a new player sees Play, Quick Game and Settings only');
  const fits = () => p.evaluate(() => { const W = innerWidth, H = innerHeight; return [...document.querySelectorAll('#titleBox, #titleBtns button, #how')].filter(e => !e.hidden && e.offsetParent !== null).every(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= W && r.top >= 0 && r.bottom <= H; }); });
  ok(await fits(), 'the title screen fits 760 x 340');
  await p.screenshot({ path: shot('quick-title.png') });

  await p.click('#bQuick'); await frames(p, 4);
  await p.evaluate(() => { __rh.H.prot = 1e9; });
  ok(await p.evaluate(() => __rh.state === 'play' && __rh.mode === 'quick' && __rh.W.getMode() === 'quick'), 'Quick Game starts in quick mode');
  ok(await vis('#wMode') && (await p.textContent('#wMode')).includes('Quick'), 'the HUD says Quick Mode');
  ok(await p.evaluate(() => __rh.H.level === 1 && Math.abs(__rh.H.r - 0.5) < 1e-9), 'a quick game starts at level 1, 0.5 m radius');

  // the same size of everything far out: a house 30 km out is the size of a house at the start
  const sizeAt = (x, z) => p.evaluate(([x, z]) => { __rh.teleport(x, z); let best = 0, n = 0; for (const c of __rh.CELLS.values()) for (const o of c.objs) { n++; best = Math.max(best, o.r); } return { best, n, scale: __rh.W.scaleAt(Math.hypot(x, z)) }; }, [x, z]);
  const a = await sizeAt(0, 0), f = await sizeAt(30000, 20000);
  ok(a.scale === 1 && f.scale === 1 && a.n > 50 && f.n > 50 && f.best < 8, 'things are the same size 36 km out (biggest ' + f.best.toFixed(1) + ' m, ' + f.n + ' things)');
  ok(await p.evaluate(() => __rh.tile.n > 0), 'the ground is drawn there too');
  await p.evaluate(() => __rh.teleport(0, 0)); await frames(p, 6);

  // eating makes you grow extremely fast: a few dozen things is many levels
  for (let k = 0; k < 8; k++) { await p.evaluate(() => { const n = __rh.nearestEdible(); if (n) __rh.teleport(n.x, n.z); }); await frames(p, 8); }
  const lv1 = await p.evaluate(() => __rh.H.level);
  ok(lv1 >= 3, 'eating a few things gives several levels at once (level ' + lv1 + ')');

  // no cap: a huge xp is a huge level, and the HUD never says MAX
  await p.evaluate(() => { __rh.setXp(__rh.W.cum(5000)); }); await frames(p, 6);
  ok(await p.evaluate(() => __rh.H.level >= 5000) && /^Level [5-9],\d{3}$/.test((await p.textContent('#lvNum')).trim()) && (await p.textContent('#lvNext')).trim() !== 'MAX', 'there is no level cap: level 5,000 and beyond is possible and the HUD never says MAX');
  await p.evaluate(() => { __rh.setXp(__rh.W.cum(100)); __rh.teleport(0, 0); }); await frames(p, 30);
  const r100 = await p.evaluate(() => __rh.H.r);
  ok(r100 > 6 && r100 < 8, 'level 100 is about the size of the biggest buildings (' + r100.toFixed(1) + ' m radius)');
  await p.screenshot({ path: shot('quick-l100.png') });

  // a very big hole sees mostly dust and the number of things stays inside the budget
  await p.evaluate(() => { __rh.setXp(__rh.W.cum(3000)); }); await frames(p, 30);
  const big = await p.evaluate(() => ({ objs: __rh.objects, cells: __rh.CELLS.size, r: __rh.H.r }));
  ok(big.objs <= 14500 && big.cells > 10, 'a hole ' + big.r.toFixed(0) + ' m wide keeps the cells within the budget (' + big.cells + ' cells, ' + big.objs + ' things)');
  await p.screenshot({ path: shot('quick-big.png') });

  // its own save: quit, and the title offers Continue Quick with its level; the normal game is untouched
  await p.evaluate(() => { __rh.setXp(__rh.W.cum(200)); __rh.teleport(1000, 500); }); await frames(p, 6);
  await p.evaluate(() => __rh.pause()); await p.click('#bQuit'); await frames(p, 4);
  ok(await p.evaluate(() => __rh.state === 'title' && __rh.mode === 'normal' && __rh.W.getMode() === 'normal'), 'Quit to Title goes back to the normal world');
  ok((await p.textContent('#bQuick')).includes('Continue Quick (Level 200)') && await vis('#bQuickNew') && (await p.textContent('#bPlay')).trim() === 'Play' && !await vis('#bNew'), 'the title offers Continue Quick (Level 200) and a plain Play: the two saves are separate');
  ok(await fits(), 'the title screen with all five buttons fits 760 x 340');
  await p.screenshot({ path: shot('quick-title-saved.png') });
  const saves = await p.evaluate(() => ({ n: localStorage.getItem('retroHole.save'), q: JSON.parse(localStorage.getItem('retroHole.saveQuick')) }));
  ok(saves.n === null && saves.q && saves.q.x === 1000 && saves.q.z === 500, 'the quick save is its own key, and the normal game has none');

  await p.reload(); await ready(p);
  ok((await p.textContent('#bQuick')).includes('Level 200'), 'Continue Quick survives a reload');
  await p.click('#bQuick'); await frames(p, 4); await p.evaluate(() => { __rh.H.prot = 1e9; });
  ok(await p.evaluate(() => __rh.mode === 'quick' && __rh.H.level === 200 && Math.hypot(__rh.H.x - 1000, __rh.H.z - 500) < 1), 'Continue Quick puts the hole back where it was at level 200');

  // a normal game after a quick one is the normal world again, with its own save
  await p.evaluate(() => __rh.pause()); await p.click('#bQuit'); await frames(p, 4);
  await p.click('#bPlay'); await frames(p, 6);
  ok(await p.evaluate(() => __rh.mode === 'normal' && __rh.W.scaleAt(120) === 2 && __rh.H.level === 1) && !await vis('#wMode'), 'Play starts the normal game: level 1, scale growing with distance, no Quick Mode tag');
  await p.evaluate(() => __rh.pause()); await p.click('#bQuit'); await frames(p, 4);
  ok((await p.textContent('#bPlay')).includes('Continue') && (await p.textContent('#bQuick')).includes('Level 200'), 'both games are kept side by side');

  // New Quick Game starts afresh and forgets only the quick save
  await p.click('#bQuickNew'); await frames(p, 4);
  ok(await p.evaluate(() => __rh.mode === 'quick' && __rh.H.level === 1 && __rh.H.x === 0), 'New Quick Game starts again at level 1');
  ok(await p.evaluate(() => localStorage.getItem('retroHole.save') !== null), 'and leaves the normal save alone');

  ok(log.length === 0, 'nothing reached the console' + (log.length ? ': ' + log.slice(0, 3).join(' | ') : ''));
  await b.close(); site.close();
})().catch(e => { console.error(e); process.exit(1); });

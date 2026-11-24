// The game with real input: title, steering, eating and falling, levels, the menu, settings, saving, phone sizes.
const { launch, serve, watch, ok, ready, frames, shot } = require('./lib.js');
(async () => {
  const site = await serve(), { b, newPage } = await launch();
  const log = [];
  const p = await newPage({ viewport: { width: 480, height: 300 } });
  watch(p, log);
  await p.goto(site.url); await ready(p);

  // title screen
  ok(await p.isVisible('#title') && !(await p.isVisible('#hud')), 'the title screen shows first');
  ok((await p.textContent('#bPlay')).trim() === 'Play' && !(await p.isVisible('#bNew')), 'a new player sees Play and no New Game');
  ok(/^Version [0-9a-f]{8}$/.test((await p.textContent('#ver')).trim()), 'the version is shown');
  ok(await p.evaluate(() => __rh.objects > 50 && __rh.state === 'title'), 'the world is drawn behind the title');

  // play
  await p.click('#bPlay'); await frames(p, 3);
  ok(await p.evaluate(() => __rh.state === 'play') && await p.isVisible('#hud') && !(await p.isVisible('#title')), 'Play starts a game');
  ok((await p.textContent('#lvNum')).trim() === 'Level 1' && (await p.textContent('#lvSize')).includes('1.0 m'), 'the HUD shows Level 1 and a hole 1.0 m wide');
  ok((await p.textContent('#wArea')).trim() === 'Village' && (await p.textContent('#wDist')).includes('At the start'), 'the HUD names the area and where you are');
  ok(await p.evaluate(() => !document.querySelector('#ver').offsetParent), 'the version is hidden in a game');

  // animals wander about, and stay inside their own cells
  const walkers = () => p.evaluate(() => { const a = []; for (const c of __rh.CELLS.values()) for (const o of c.objs) if (__rh.W.TYPES[o.ty].walk && !o.state) a.push({ k: c.key + ':' + o.ty + ':' + o.slot, x: o.x, z: o.z, inside: o.x >= c.x0 + o.r - 1e-6 && o.x <= c.x0 + c.C - o.r + 1e-6 && o.z >= c.z0 + o.r - 1e-6 && o.z <= c.z0 + c.C - o.r + 1e-6 }); return a; });
  const a0 = await walkers(); await frames(p, 80); const a1 = await walkers();
  const was = new Map(a0.map(o => [o.k, o]));
  const moved = a1.filter(o => was.has(o.k) && Math.hypot(o.x - was.get(o.k).x, o.z - was.get(o.k).z) > 0.01).length;
  ok(a0.length >= 15, 'there are animals near the start (' + a0.length + ')');
  ok(moved >= 5, 'animals wander about (' + moved + ' of ' + a0.length + ' moved)');
  ok(a1.every(o => o.inside), 'and they stay inside their cells');
  ok(await p.evaluate(() => __rh.poolSlots() === __rh.standing() + __rh.FALL.length), 'moving animals keep the drawn copies in step');

  // steering with the keyboard: right on the screen is +x and -z
  const pos = () => p.evaluate(() => ({ x: __rh.H.x, z: __rh.H.z }));
  const p0 = await pos();
  await p.keyboard.down('d'); await frames(p, 25); await p.keyboard.up('d');
  const p1 = await pos();
  ok(p1.x - p0.x > 0.3 && p1.z - p0.z < -0.3 && Math.abs((p1.x - p0.x) + (p1.z - p0.z)) < 0.2 * Math.hypot(p1.x - p0.x, p1.z - p0.z), 'D moves the hole to the right of the screen');
  await p.keyboard.down('w'); await frames(p, 25); await p.keyboard.up('w');
  const p2 = await pos();
  ok(p2.x - p1.x < -0.3 && p2.z - p1.z < -0.3, 'W moves the hole up the screen (away from the camera)');
  await p.keyboard.down('ArrowLeft'); await p.keyboard.down('ArrowDown'); await frames(p, 25); await p.keyboard.up('ArrowLeft'); await p.keyboard.up('ArrowDown');
  const p3 = await pos();
  ok(Math.hypot(p3.x - p2.x, p3.z - p2.z) > 0.3 && p3.x - p2.x > -0.2 && p3.z - p2.z > 0.3 * Math.abs(p3.x - p2.x), 'the arrow keys steer too (left and down together go down-left on the screen)');
  // the mouse: a pointer to the right of the middle steers right
  await p.mouse.move(470, 150); await frames(p, 25); const p4 = await pos(); await p.mouse.move(240, 150); await frames(p, 3);
  ok(p4.x - p3.x > 0.3, 'a mouse pointer to the right steers right');
  await p.mouse.move(440, 28); await frames(p, 3); const m0 = await pos(); await frames(p, 20); const m1 = await pos();   // over the Menu button
  ok(Math.hypot(m1.x - m0.x, m1.z - m0.z) < 0.05, 'a pointer over a button does not steer');
  await p.mouse.move(240, 150); await frames(p, 30);
  const idle = await pos(); await frames(p, 20); const idle2 = await pos();
  ok(Math.hypot(idle2.x - idle.x, idle2.z - idle.z) < 0.3, 'a pointer at the middle holds still');

  // eating: put the hole on the nearest thing it can swallow
  const before = await p.evaluate(() => { const n = __rh.nearestEdible(); for (const c of __rh.CELLS.values()) for (const o of c.objs) if (o.x === n.x && o.z === n.z) window.__thing = o; __rh.teleport(n.x, n.z); return { n, standing: __rh.standing(), xp: __rh.H.xp, r: __rh.H.r }; });
  await frames(p, 4);
  const mid = await p.evaluate(() => ({ falling: __rh.FALL.length, eaten: __rh.H.eaten }));
  ok(mid.falling >= 1 && mid.eaten >= 1, 'a thing over the hole starts to fall (' + before.n.type + ')');
  await p.screenshot({ path: shot('falling.png') });
  await frames(p, 40);
  const after = await p.evaluate(() => ({ falling: __rh.FALL.length, standing: __rh.standing(), xp: __rh.H.xp, r: __rh.H.rt, eaten: __rh.H.eaten, slots: __rh.poolSlots() }));
  ok(after.falling === 0 && await p.evaluate(() => window.__thing.state === 2), 'the thing is gone once it has fallen');
  ok(after.xp > before.xp && after.r >= before.r, 'eating gives xp and the hole grows');
  ok((await p.textContent('#lvEaten')).includes('Eaten ' + after.eaten), 'the HUD counts what has been eaten');
  ok(after.slots === after.standing, 'every standing thing has exactly one drawn copy (' + after.slots + ')');

  // a thing bigger than the hole is not swallowed
  const big = await p.evaluate(() => {
    __rh.teleport(60, 40);
    for (const c of __rh.CELLS.values()) for (const o of c.objs) if (!o.state && !__rh.W.canEat(o.r, __rh.H.r) && o.r < 3) return { x: o.x, z: o.z, r: o.r };
    return null;
  });
  ok(!!big, 'there are things bigger than a level 1 hole');
  await p.evaluate(b => __rh.teleport(b.x, b.z), big); await frames(p, 25);
  ok(await p.evaluate(() => __rh.FALL.length === 0), 'a thing bigger than the hole stays standing');

  // levelling up: eat with a hole just short of level 2
  await p.evaluate(() => { __rh.teleport(0, 0); __rh.setXp(__rh.W.CUM[2] - 0.001); });
  const lv = await p.evaluate(() => { const n = __rh.nearestEdible(); __rh.teleport(n.x, n.z); return __rh.H.level; });
  await frames(p, 6);
  ok(lv === 1 && await p.evaluate(() => __rh.H.level) === 2 && (await p.textContent('#lvNum')).trim() === 'Level 2', 'one more thing takes the hole to level 2');
  ok(await p.evaluate(() => document.querySelector('#toast').classList.contains('on') && document.querySelector('#toast').textContent === 'Level 2'), 'a banner says Level 2');
  await frames(p, 40);
  ok(await p.evaluate(() => __rh.H.r > __rh.W.radiusAt(2, 0) - 1e-3), 'the hole grows to its new size');

  // the pause menu
  await p.keyboard.press('Escape');
  ok(await p.isVisible('#pause') && await p.evaluate(() => __rh.state === 'pause'), 'Esc opens the menu');
  const hp = await pos(); await p.keyboard.down('d'); await frames(p, 15); await p.keyboard.up('d');
  const hq = await pos();
  ok(Math.hypot(hq.x - hp.x, hq.z - hp.z) < 1e-9, 'the hole does not move while the menu is open');
  await p.click('#bSet2'); ok(await p.isVisible('#settings'), 'Settings opens from the menu');
  await p.click('#settings button[data-key="pixel"][data-v="3"]'); await frames(p, 3);
  ok(await p.evaluate(() => __rh.S.pixel === 3 && JSON.parse(localStorage.getItem('retroHole.settings')).pixel === 3), 'a setting changes at once and is saved');
  ok(await p.evaluate(() => document.querySelector('#view').style.width) === '480px', 'pixel size 3 still fills the window');
  await p.click('#settings button[data-key="outline"][data-v="false"]'); await p.click('#settings button[data-key="levels"][data-v="16"]'); await frames(p, 2);
  await p.keyboard.press('Escape'); ok(!(await p.isVisible('#settings')) && await p.isVisible('#pause'), 'Esc closes Settings first');
  await p.keyboard.press('Escape'); ok(await p.evaluate(() => __rh.state === 'play') && !(await p.isVisible('#pause')), 'Esc closes the menu');
  await p.click('#bMenu'); ok(await p.evaluate(() => __rh.state === 'pause'), 'the Menu button opens it too');
  await p.click('#bResume');

  // saving: quit, reload, continue
  await p.evaluate(() => { __rh.setXp(__rh.W.CUM[30] + 0.01); __rh.teleport(150, -90); });
  await frames(p, 3);
  const keep = await p.evaluate(() => ({ x: __rh.H.x, z: __rh.H.z, level: __rh.H.level }));
  await p.click('#bMenu'); await p.click('#bQuit');
  ok(await p.evaluate(() => __rh.state === 'title') && (await p.textContent('#bPlay')).includes('Continue (Level 30)') && await p.isVisible('#bNew'), 'after Quit to Title the button says Continue (Level 30)');
  await p.reload(); await ready(p);
  ok((await p.textContent('#bPlay')).includes('Continue (Level 30)'), 'Continue is still there after a reload');
  await p.click('#bPlay'); await frames(p, 3);
  const back = await p.evaluate(() => ({ x: __rh.H.x, z: __rh.H.z, level: __rh.H.level }));
  ok(back.level === 30 && Math.hypot(back.x - keep.x, back.z - keep.z) < 0.01, 'Continue returns to the same place and level ' + JSON.stringify([keep, back]));
  ok(await p.evaluate(() => __rh.S.pixel === 3 && __rh.S.levels === 16 && !__rh.S.outline), 'the settings were kept through the reload');
  await p.click('#bMenu'); await p.click('#bQuit'); await p.click('#bNew');
  ok(await p.evaluate(() => __rh.H.level === 1 && __rh.H.x === 0 && __rh.H.eaten === 0), 'New Game starts again from level 1 at the start');

  // the map streams in and out as the hole moves
  await p.evaluate(() => __rh.teleport(0, 0)); await frames(p, 3);
  const cells0 = await p.evaluate(() => [...__rh.CELLS.keys()].sort().join());
  await p.evaluate(() => __rh.teleport(900, 500)); await frames(p, 6);
  const far = await p.evaluate(() => ({ keys: [...__rh.CELLS.keys()], slots: __rh.poolSlots(), standing: __rh.standing(), falling: __rh.FALL.length }));
  ok(!far.keys.some(k => cells0.split(',').includes(k)) && far.keys.length > 0, 'cells near the start are dropped when the hole is far away');
  ok(far.slots === far.standing + far.falling && far.standing > 0, 'no copies of dropped things are left drawn');
  await p.evaluate(() => __rh.teleport(0, 0)); await frames(p, 6);
  ok(await p.evaluate(() => __rh.standing() > 100), 'going back finds the start made again (and the things you ate regrown)');

  // touch: put a finger down and drag it to the right (as a phone does); a stick appears and the hole follows
  await p.evaluate(() => __rh.teleport(0, 0)); await frames(p, 2);
  const t0 = await pos();
  await p.evaluate(() => { const ev = (t, x, y) => document.querySelector('#view').dispatchEvent(new PointerEvent(t, { pointerType: 'touch', pointerId: 7, clientX: x, clientY: y, bubbles: true })); ev('pointerdown', 200, 200); ev('pointermove', 260, 200); });
  ok(await p.isVisible('#stick'), 'a finger down shows the stick');
  await frames(p, 25);
  const t1 = await pos();
  ok(t1.x - t0.x > 0.3 && t1.z - t0.z < -0.3, 'dragging a finger right steers right');
  await p.evaluate(() => document.querySelector('#view').dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', pointerId: 7, bubbles: true })));
  ok(!(await p.isVisible('#stick')), 'lifting the finger hides the stick');
  await frames(p, 30); const t2 = await pos(); await frames(p, 15); const t3 = await pos();
  ok(Math.hypot(t3.x - t2.x, t3.z - t2.z) < 0.3, 'and the hole stops');

  // a phone held upright and on its side: nothing overlaps, nothing runs off the screen
  for (const [w, h] of [[390, 760], [760, 340], [1280, 720]]) {
    await p.setViewportSize({ width: w, height: h }); await frames(p, 3);
    const r = await p.evaluate(() => {
      const box = s => { const e = document.querySelector(s).getBoundingClientRect(); return { l: e.left, r: e.right, t: e.top, b: e.bottom }; };
      return { lvl: box('#lvl'), top: box('#top'), vw: innerWidth, vh: innerHeight, canvasW: document.querySelector('#view').getBoundingClientRect().width };
    });
    const overlap = !(r.lvl.r <= r.top.l || r.top.r <= r.lvl.l || r.lvl.b <= r.top.t || r.top.b <= r.lvl.t);
    ok(!overlap && r.lvl.l >= 0 && r.top.r <= r.vw && r.top.b <= r.vh, `the HUD fits a ${w}x${h} screen without overlap`);
    ok(Math.abs(r.canvasW - w) <= 4, `the picture fills a ${w}x${h} screen`);
  }
  await p.setViewportSize({ width: 480, height: 300 });
  await p.screenshot({ path: shot('game.png') });

  ok(log.length === 0, 'the console stayed clean' + (log.length ? ': ' + log.slice(0, 3).join(' | ') : ''));
  await b.close(); site.close();
})().catch(e => { console.error(e); process.exit(1); });

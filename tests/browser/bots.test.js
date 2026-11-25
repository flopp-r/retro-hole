// The rival holes: where they are, that they eat and grow, hunt and flee, swallow you (you lose half your xp and come
// back a little way off, protected) and are swallowed by you, and respawn; the labels and the scoreboard.
const { launch, serve, watch, ok, ready, frames, shot } = require('./lib.js');
(async () => {
  const site = await serve(), { b, newPage } = await launch();
  const log = [];
  const p = await newPage({ viewport: { width: 480, height: 300 } });
  watch(p, log);
  await p.addInitScript(() => { localStorage.setItem('retroHole.settings', JSON.stringify({ pixel: 4, levels: 8, volume: 1, mouse: false })); });
  await p.goto(site.url); await ready(p);
  ok(await p.evaluate(() => __rh.BOTS.length === 0 && __rh.UN.uNH.value === 1), 'no bots on the title screen');
  await p.click('#bPlay'); await frames(p, 6);

  // the two small bots round the start
  const st = await p.evaluate(() => ({ n: __rh.BOTS.length, active: __rh.active.length, holes: __rh.UN.uNH.value, names: __rh.BOTS.map(b => b.name), hr: __rh.H.r, rs: __rh.BOTS.map(b => b.r), prot: __rh.H.prot }));
  ok(st.n >= 2 && st.active >= 2 && st.holes === 1 + st.active, 'there are bots round the start, each cut out of the ground (' + st.names.join(', ') + ')');
  ok(st.rs.every(r => r < st.hr * 1.05), 'none is bigger than a new hole at the start');
  ok(st.prot > 5, 'a new game starts with a few seconds of protection');
  ok(await p.evaluate(() => __rh.VIS.length >= 3 && __rh.VIS[0].pit.visible && __rh.VIS.slice(1, 3).every(v => v.pit.visible && v.a.visible && v.b.visible)), 'each has a pit and a ring');
  await p.evaluate(() => { const b = __rh.active[0]; __rh.H.prot = 1e9; __rh.teleport(b.x - 2, b.z + 2); }); await frames(p, 5);
  ok(await p.evaluate(() => [...document.querySelectorAll('.botLabel')].some(e => !e.hidden && /[A-Za-z].* \d/.test(e.textContent))), 'a bot on the screen has a name and level over it');
  ok(await p.evaluate(() => !document.querySelector('#board').hidden && /You/.test(document.querySelector('#board').textContent)), 'the scoreboard lists you and the bots near you');

  // bots eat and grow, and stop at their cap
  await p.evaluate(() => { __rh.H.prot = 1e9; __rh.teleport(60, 60); });
  const g0 = await p.evaluate(() => __rh.BOTS.map(b => ({ e: b.eaten, l: b.level, r: b.r })));
  await frames(p, 140);
  const g1 = await p.evaluate(() => __rh.BOTS.map(b => ({ e: b.eaten, l: b.level, r: b.r })));
  ok(g1.some((g, i) => g0[i] && g.e > g0[i].e + 3) || (await p.evaluate(() => __rh.BOTS.length)) > 0, 'bots near you eat things');
  await p.evaluate(() => { __rh.teleport(0, 0); });
  await frames(p, 8);
  const grow = await p.evaluate(() => new Promise(res => { const bs = __rh.BOTS.filter(b => Math.hypot(b.spec.x, b.spec.z) < 60); const l0 = bs.map(b => b.level), e0 = bs.map(b => b.eaten); let n = 0; const t = () => { if (++n > 160) res({ l0, l1: bs.map(b => b.level), e0, e1: bs.map(b => b.eaten), r: bs.map(b => b.r), hr: __rh.H.r }); else setTimeout(t, 30); }; t(); }));
  ok(grow.e1.every((e, i) => e > grow.e0[i]) && grow.l1.every((l, i) => l >= grow.l0[i]), 'the bots round the start eat and grow (' + grow.l0.join(',') + ' to ' + grow.l1.join(',') + ')');
  ok(grow.r.every(r => r < 1.6), 'and the ones near the start stop growing at a modest size (' + grow.r.map(r => r.toFixed(2)).join(', ') + ' m)');

  // helper in the page: keep one bot, park the rest
  const setup = () => p.evaluate(() => { for (const b of __rh.BOTS) { b.alive = false; b.respawn = 1e9; b.dying = 0; } const b = __rh.BOTS[0]; Object.assign(b, { alive: true, respawn: 0, prot: 0, vx: 0, vz: 0 }); __rh.H.prot = 0; return b.name; });
  const place = (dist, ratio) => p.evaluate(([d, k]) => { const b = __rh.BOTS[0], H = __rh.H; b.r = b.rt = H.r * k; b.x = H.x + d * Math.max(H.r, b.r); b.z = H.z; b.vx = b.vz = 0; b.think = 0; b.xp = __rh.W.xpForRadius(b.r); }, [dist, ratio]);

  // a bigger bot near you hunts you; a smaller one runs away
  await p.evaluate(() => { __rh.teleport(0, 0); __rh.setXp(__rh.W.CUM[20]); }); await frames(p, 4);
  await setup();
  await place(6, 1.6); await frames(p, 3);
  const hunt = await p.evaluate(() => ({ mode: __rh.BOTS[0].mode, d: Math.hypot(__rh.BOTS[0].x - __rh.H.x, __rh.BOTS[0].z - __rh.H.z), big: __rh.BOTS[0].r }));
  ok(hunt.mode === 'hunt', 'a clearly bigger bot near you hunts you (' + hunt.mode + ')');
  const lab = await p.evaluate(() => { const e = [...document.querySelectorAll('.botLabel')].find(x => !x.hidden); return e ? e.dataset.danger : null; });
  ok(lab === '1', 'its name is marked red');
  await place(5, 0.5); await frames(p, 3);
  const flee = await p.evaluate(() => ({ mode: __rh.BOTS[0].mode }));
  ok(flee.mode === 'flee', 'a smaller bot near you flees (' + flee.mode + ')');
  const lab2 = await p.evaluate(() => { const e = [...document.querySelectorAll('.botLabel')].find(x => !x.hidden); return e ? e.dataset.danger : null; });
  ok(lab2 === '2', 'its name is marked green');
  const d0 = await p.evaluate(() => Math.hypot(__rh.BOTS[0].x - __rh.H.x, __rh.BOTS[0].z - __rh.H.z));
  await frames(p, 25);
  ok(await p.evaluate(d => Math.hypot(__rh.BOTS[0].x - __rh.H.x, __rh.BOTS[0].z - __rh.H.z) > d, d0), 'and gets further away');
  await place(60, 1); await frames(p, 3);
  ok(await p.evaluate(() => __rh.BOTS[0].mode !== 'hunt' && __rh.BOTS[0].mode !== 'flee'), 'a bot far away ignores you');

  // a bigger bot swallows you: half your xp is lost, you come back a way off, protected
  const before = await p.evaluate(() => { const b = __rh.BOTS[0], H = __rh.H, o = { xp: H.xp }; b.r = b.rt = H.r * 3; b.x = H.x; b.z = H.z; b.prot = 0; H.prot = 0; return o; });
  await frames(p, 3);
  const after = await p.evaluate(() => ({ xp: __rh.H.xp, x: __rh.H.x, z: __rh.H.z, prot: __rh.H.prot, toast: document.querySelector('#toast').textContent, d: Math.hypot(__rh.H.x - __rh.BOTS[0].x, __rh.H.z - __rh.BOTS[0].z), br: __rh.BOTS[0].r }));
  ok(Math.abs(after.xp - before.xp / 2) < 0.1 * before.xp, 'being swallowed halves your xp (' + before.xp.toFixed(1) + ' to ' + after.xp.toFixed(1) + ')');
  ok(after.d > 8 * after.br && after.prot > 2, 'you come back well away from it, and protected');
  ok(/Swallowed by/.test(after.toast) && /half your xp/.test(after.toast), 'and are told ("' + after.toast + '")');
  await frames(p, 6);
  ok(await p.evaluate(x => __rh.H.xp >= x, after.xp), 'a protected hole is not swallowed again');

  // you swallow a smaller bot, which respawns later
  await setup(); await place(80, 1);
  await p.evaluate(() => { __rh.H.prot = 0; __rh.setXp(__rh.W.CUM[60]); __rh.teleport(0, 0); __rh.BOTS[0].x = 400; __rh.BOTS[0].z = 400; }); await frames(p, 3);
  await setup();
  const xp0 = await p.evaluate(() => { const b = __rh.BOTS[0], H = __rh.H, x = H.xp; b.r = b.rt = H.r * 0.4; b.x = H.x; b.z = H.z; b.prot = 0; H.prot = 0; return x; });
  await frames(p, 3);
  const eat = await p.evaluate(() => ({ alive: __rh.BOTS[0].alive, xp: __rh.H.xp, toast: document.querySelector('#toast').textContent, name: __rh.BOTS[0].name, rs: __rh.BOTS[0].respawn }));
  ok(!eat.alive && eat.xp > xp0, 'a bigger hole swallows a bot and gains xp (' + JSON.stringify([eat.alive, xp0, eat.xp]) + ')');
  ok(/You swallowed/.test(eat.toast), 'and is told ("' + eat.toast + '")');
  ok(eat.rs > 0 && eat.rs <= 25, 'the bot will come back (in ' + eat.rs.toFixed(0) + ' s)');
  await p.evaluate(() => { __rh.BOTS[0].respawn = 0.05; __rh.H.prot = 1e9; }); await frames(p, 6);
  ok(await p.evaluate(() => __rh.BOTS[0].alive && __rh.BOTS[0].level === __rh.W.progress(__rh.W.xpForRadius(__rh.BOTS[0].spec.r)).level), 'and comes back as it started');

  // quitting and returning to the start leaves no bots behind
  await p.click('#bMenu'); await p.click('#bQuit'); await frames(p, 3);
  ok(await p.evaluate(() => __rh.BOTS.length === 0 && __rh.active.length === 0 && __rh.UN.uNH.value === 1), 'no bots on the title screen after quitting');
  await p.click('#bPlay'); await frames(p, 6);
  ok(await p.evaluate(() => __rh.BOTS.length >= 2 && __rh.H.prot > 5), 'and they are there again, with protection, when you continue');

  // Return to Start from the menu keeps the bots round the start (they were only made while the game was 'play', not 'pause')
  await p.evaluate(() => { __rh.teleport(3000, 3000); }); await frames(p, 4);
  await p.evaluate(() => __rh.pause()); await p.click('#bHome'); await frames(p, 6);
  ok(await p.evaluate(() => __rh.state === 'play' && __rh.BOTS.length >= 2), 'Return to Start from the menu leaves the bots round the start in place (' + await p.evaluate(() => __rh.BOTS.length) + ')');

  // the board and labels fit a phone on its side and upright
  for (const [w, h] of [[390, 760], [760, 340], [1280, 720]]) {
    await p.setViewportSize({ width: w, height: h }); await frames(p, 4);
    const r = await p.evaluate(() => { const box = s => { const e = document.querySelector(s); if (e.hidden) return null; const q = e.getBoundingClientRect(); return { l: q.left, r: q.right, t: q.top, b: q.bottom }; }; return { lvl: box('#lvl'), top: box('#top'), board: box('#board'), vw: innerWidth, vh: innerHeight }; });
    const hit = (a, c) => a && c && !(a.r <= c.l || c.r <= a.l || a.b <= c.t || c.b <= a.t);
    ok(!r.board || (!hit(r.board, r.lvl) && !hit(r.board, r.top) && r.board.b <= r.vh && r.board.r <= r.vw), `the scoreboard fits a ${w}x${h} screen without overlap`);
  }
  await p.setViewportSize({ width: 480, height: 300 });
  await p.screenshot({ path: shot('bots.png') });

  ok(log.length === 0, 'the console stayed clean' + (log.length ? ': ' + log.slice(0, 3).join(' | ') : ''));
  await b.close(); site.close();
})().catch(e => { console.error(e); process.exit(1); });

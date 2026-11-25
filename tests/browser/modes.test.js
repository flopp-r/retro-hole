// The game modes: the Modes screen, Time Attack, the Arena, Peaceful and Single Area. What each one does, what it pays, what
// it saves, and that the normal game is untouched. Nothing may reach the console.
const { launch, serve, watch, ok, ready, frames, shot } = require('./lib.js');
(async () => {
  const site = await serve(), { b, newPage } = await launch();
  const log = [];
  const p = await newPage({ viewport: { width: 760, height: 340 } });
  watch(p, log);
  await p.goto(site.url); await ready(p);
  const vis = sel => p.evaluate(s => { const e = document.querySelector(s); return !!e && !e.hidden && e.getClientRects().length > 0; }, sel);
  const inside = sel => p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }, sel);
  const keys = () => p.evaluate(() => Object.keys(localStorage).filter(k => /^retroHole\.save/.test(k)).sort());
  const coins = () => p.evaluate(() => __rh.profile.coins);
  const titleFits = () => p.evaluate(() => [...document.querySelectorAll('#titleBox, #titleBtns button')].filter(e => !e.hidden && e.getClientRects().length > 0).every(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }));
  const toTitle = async () => { await p.evaluate(() => { if (__rh.state === 'play') __rh.pause(); }); if (await vis('#over')) await p.click('#bOverQuit'); else await p.click('#bQuit'); await frames(p, 3); };
  const play = async (card, n = 8) => { await p.click('#bModes'); await frames(p, 1); await p.click(`.mdCard[data-mode="${card}"] button`); await frames(p, n); await p.evaluate(() => { __rh.H.prot = 1e9; }); };
  // eats the nearest things that are not coins until the hole is at a level
  const grow = async (lv) => { for (let k = 0; k < 400 && await p.evaluate(l => __rh.H.level < l, lv); k++) { await p.evaluate(() => { const n = __rh.nearestEdible(/^(?!coin)/); if (n) __rh.teleport(n.x, n.z); }); await frames(p, 4); } };

  // the title screen and the Modes screen
  ok(await vis('#bModes') && await titleFits(), 'the title screen has a Modes button and fits 760 x 340');
  await p.evaluate(() => { localStorage.setItem('retroHole.save', JSON.stringify({ v: 1, x: 0, z: 0, xp: 5, eaten: 0 })); localStorage.setItem('retroHole.saveQuick', JSON.stringify({ v: 1, x: 0, z: 0, xp: 5, eaten: 0 })); });
  await p.reload(); await ready(p);
  ok(await vis('#bNew') && await vis('#bQuickNew') && await vis('#bModes') && await vis('#bSkins') && await vis('#bSet') && await titleFits(), 'with both saves there are seven buttons, still fitting 760 x 340');
  await p.evaluate(() => { localStorage.removeItem('retroHole.save'); localStorage.removeItem('retroHole.saveQuick'); }); await p.reload(); await ready(p);
  await p.click('#bModes'); await frames(p, 2);
  ok(await vis('#modes') && await inside('#modes .ovPanel') && await inside('#bModesClose'), 'Modes opens and fits 760 x 340');
  ok(await p.evaluate(() => ['time', 'arena', 'peaceful', ...['village', 'forest', 'city', 'jurassic', 'desert', 'arctic', 'volcano'].map(a => 'area:' + a)].every(m => document.querySelector(`.mdCard[data-mode="${m}"]`))), 'it lists Time Attack, Arena, Peaceful and the seven areas');
  await p.keyboard.press('Escape'); await frames(p, 1);
  ok(!await vis('#modes') && await p.evaluate(() => __rh.state === 'title'), 'Esc closes it');
  await p.setViewportSize({ width: 360, height: 640 }); await p.click('#bModes'); await frames(p, 2);
  ok(await inside('#modes .ovPanel') && await inside('#bModesClose'), 'and it fits 360 x 640');
  await p.click('#bModesClose'); await p.setViewportSize({ width: 760, height: 340 }); await frames(p, 2);

  // Time Attack: three minutes, scored and paid at the end, never saved
  await play('time');
  ok(await p.evaluate(() => __rh.state === 'play' && __rh.play.id === 'time' && __rh.play.left > 177 && __rh.play.left <= 180 && __rh.BOTS.length >= 2), 'Time Attack starts a 3 minute run on the map, with its bots');
  ok((await p.textContent('#wMode')).trim() === 'Time Attack' && (await p.textContent('#wTime')).trim() === 'Time 3:00', 'the HUD says Time Attack and Time 3:00');
  const l0 = await p.evaluate(() => __rh.play.left); await frames(p, 20); const l1 = await p.evaluate(() => __rh.play.left);
  ok(l1 < l0 - 0.3, 'the time counts down while you play (' + l0.toFixed(1) + ' to ' + l1.toFixed(1) + ')');
  await p.evaluate(() => __rh.pause()); const l2 = await p.evaluate(() => __rh.play.left); await frames(p, 20);
  ok(await p.evaluate(l => __rh.play.left === l, l2), 'and stops while the menu is open');
  await p.evaluate(() => __rh.resume()); await frames(p, 1);
  await grow(4);
  ok(await coins() === 0 && await p.evaluate(() => __rh.H.level >= 4), 'levels and things found pay nothing during the run (level ' + await p.evaluate(() => __rh.H.level) + ', ' + await coins() + ' coins)');
  ok(JSON.stringify(await keys()) === '[]', 'and a timed run is not saved');
  await p.evaluate(() => { __rh.setXp(__rh.W.CUM[30]); __rh.H.r = __rh.H.rt; __rh.H.kills = 2; __rh.play.left = 0.02; }); await frames(p, 4);
  const exp = await p.evaluate(() => { const s = __rh.K.timeScore({ level: __rh.H.level, frac: __rh.H.frac, kills: 2 }); return { s, pay: __rh.K.timePay(s) }; });
  ok(await p.evaluate(() => __rh.state === 'over') && await vis('#over') && await inside('#over .ovPanel'), 'when the time is up the result shows, fitting the screen');
  const over = await p.evaluate(() => ({ title: document.querySelector('#ovTitle').textContent, lines: document.querySelector('#ovLines').innerText }));
  ok(over.title === "Time's Up" && over.lines.includes('Score ' + exp.s.toLocaleString('en-GB')) && over.lines.includes('New best score') && over.lines.includes('Coins +' + exp.pay), 'it says "Time\'s Up", the score (' + exp.s + '), a new best and the ' + exp.pay + ' coins');
  ok(await coins() === exp.pay && await p.evaluate(s => __rh.profile.best.time === s && __rh.profile.best.timePlayed === 1, exp.s), 'which are paid, and the best score is kept');
  await p.screenshot({ path: shot('modes-time-over.png') });
  await frames(p, 6);
  ok(await p.evaluate(() => __rh.state === 'over' && __rh.play.left === 0), 'the game holds still behind the result');
  await p.click('#bAgain'); await frames(p, 6); await p.evaluate(() => { __rh.H.prot = 1e9; });
  ok(await p.evaluate(() => __rh.state === 'play' && __rh.H.level === 1 && __rh.play.left > 177 && __rh.H.kills === 0) && !await vis('#over'), 'Play Again starts a fresh run: level 1, 3:00');
  await p.evaluate(() => { __rh.play.left = 0.02; }); await frames(p, 4);
  ok((await p.textContent('#ovLines')).includes('Best score ' + exp.s.toLocaleString('en-GB')) && !(await p.textContent('#ovLines')).includes('New best'), 'a lower score does not replace the best');
  await p.evaluate(() => { __rh.start(true, 'time'); __rh.H.prot = 1e9; __rh.setXp(__rh.W.CUM[900]); __rh.H.r = __rh.H.rt; __rh.play.left = 0.02; }); await frames(p, 4);
  ok((await p.textContent('#ovLines')).includes('Coins +300'), 'a huge score pays at most 300 coins');
  await toTitle();
  ok(JSON.stringify(await keys()) === '[]' && await p.evaluate(() => __rh.state === 'title' && __rh.play.id === 'normal'), 'quitting leaves no save and goes back to the title');

  // the Arena: a ring, a wall, equal holes, paid by place
  const c0 = await coins();
  await play('arena', 12);
  const ar = await p.evaluate(() => ({ bots: __rh.BOTS.length, equal: __rh.BOTS.every(b => b.level === 1 && b.r < 0.7), left: __rh.play.left, cells: __rh.CELLS.size, R: __rh.arena && __rh.arena.R, tag: document.querySelector('#wMode').textContent }));
  ok(ar.bots === 11 && ar.equal && ar.left > 237 && ar.left <= 240 && ar.R === 45 && ar.tag === 'Arena', 'the Arena has 11 bots and you, all level 1, in a ring 90 m across, for 4 minutes');
  ok(ar.cells >= 10, 'all of the ring is loaded, whatever the size of the hole (' + ar.cells + ' cells)');
  await frames(p, 40);
  ok(await p.evaluate(() => { const rows = [...document.querySelectorAll('#board div')]; return rows.length >= 5 && rows.length <= 6 && rows.some(r => r.textContent.includes('You')); }), 'the scoreboard shows the top five, and you with your place if you are lower');
  await p.evaluate(() => { __rh.H.x = 500; __rh.H.z = 0; }); await frames(p, 3);
  ok(await p.evaluate(() => Math.hypot(__rh.H.x, __rh.H.z) <= __rh.arena.R - __rh.H.r + 1e-6), 'the wall keeps the hole inside the ring');
  ok(await p.evaluate(() => __rh.BOTS.every(b => Math.hypot(b.x, b.z) <= __rh.arena.R + 1e-6)), 'and the bots');
  await p.screenshot({ path: shot('modes-arena-wall.png') });
  await p.evaluate(() => { __rh.teleport(0, 0); __rh.pause(); }); await frames(p, 1);
  ok(!await vis('#bHome'), 'Return to Start is not offered in the Arena');
  await p.evaluate(() => __rh.resume());
  await p.evaluate(() => __rh.fastForward(60));
  ok(await p.evaluate(() => __rh.BOTS.filter(b => b.level > 5).length >= 6), 'the bots eat and grow (' + await p.evaluate(() => __rh.BOTS.map(b => b.level).sort((a, c) => c - a).join(',')) + ')');
  ok(await coins() === c0, 'nothing is paid during the round');
  // swallowed in the Arena: back inside the ring
  await p.evaluate(() => { const b = __rh.BOTS[0]; b.alive = true; b.dying = 0; b.prot = 0; b.r = b.rt = __rh.H.r * 4; b.x = __rh.H.x; b.z = __rh.H.z; __rh.H.prot = 0; });
  await frames(p, 4);
  ok(await p.evaluate(() => __rh.H.deaths === 1 && Math.hypot(__rh.H.x, __rh.H.z) <= __rh.arena.R), 'a bot swallowing you counts a death and you come back inside the ring');
  // last place pays 20; a win pays 120 plus 10 a kill
  await p.evaluate(() => { __rh.H.prot = 1e9; __rh.play.left = 0.02; }); await frames(p, 4);
  let res = await p.evaluate(() => ({ lines: document.querySelector('#ovLines').innerText, title: document.querySelector('#ovTitle').textContent }));
  const m = res.lines.match(/finished (\d+)\w\w of 12/);
  ok(m && +m[1] >= 2 && res.title === 'Round Over' && /Coins \+(20|50|80)$/m.test(res.lines), 'a level 1 hole after a minute of bots finishes behind them and is paid by place (' + (m && m[0]) + ', ' + (res.lines.match(/Coins \+\d+/) || [])[0] + ')');
  await p.screenshot({ path: shot('modes-arena-over.png') });
  await p.click('#bAgain'); await frames(p, 8); await p.evaluate(() => { __rh.H.prot = 1e9; __rh.setXp(__rh.W.CUM[80]); __rh.H.r = __rh.H.rt; __rh.H.kills = 3; __rh.play.left = 0.02; }); await frames(p, 4);
  res = await p.evaluate(() => ({ lines: document.querySelector('#ovLines').innerText, title: document.querySelector('#ovTitle').textContent, best: __rh.profile.best }));
  ok(res.title === 'You Won' && res.lines.includes('finished 1st of 12') && res.lines.includes('Coins +150'), 'a win with 3 kills pays 120 plus 30 coins ("' + res.title + '")');
  ok(res.best.arenaWins === 1 && res.best.arenaBest === 1 && res.best.arenaPlayed === 2, 'and the best results are kept (1 win in 2 rounds)');
  ok(JSON.stringify(await keys()) === '[]', 'the Arena is not saved');
  await toTitle();
  ok(await p.evaluate(() => __rh.arena === null && __rh.BOTS.length === 0 && __rh.W.getArea() === null), 'quitting takes the wall and the bots away');

  // Peaceful: no bots, no deaths, no coins, saved
  const c1 = await coins();
  await play('peaceful');
  ok(await p.evaluate(() => __rh.state === 'play' && __rh.BOTS.length === 0 && __rh.active.length === 0) && (await p.textContent('#wMode')).trim() === 'Peaceful' && !await vis('#board'), 'Peaceful has no rival holes and no scoreboard');
  await grow(5);
  ok(await coins() === c1, 'and pays no coins for levels (level ' + await p.evaluate(() => __rh.H.level) + ')');
  const coin = await p.evaluate(() => { const n = __rh.nearestEdible(/^coin$/); if (n) __rh.teleport(n.x, n.z); return n; }); await frames(p, 25);
  ok(!!coin && await coins() === c1, 'or for a gold coin');
  await p.evaluate(() => __rh.pause()); await frames(p, 1);
  ok(JSON.stringify(await keys()) === '["retroHole.savePeaceful"]', 'it is saved under its own key, apart from the normal game');
  await p.click('#bQuit'); await frames(p, 3);
  ok(await p.evaluate(() => __rh.state === 'title' && __rh.BOTS.length === 0) && (await p.textContent('#bPlay')).trim() === 'Play', 'the normal game is not touched (still Play, no save)');
  await p.click('#bModes'); await frames(p, 1);
  const pc = await p.evaluate(() => document.querySelector('.mdCard[data-mode="peaceful"]').innerText);
  ok(/Continue \(Level \d+\)/.test(pc) && /New/.test(pc), 'the Modes screen offers Continue (Level N) and New for it');
  await p.click('.mdCard[data-mode="peaceful"] button'); await frames(p, 6);
  ok(await p.evaluate(() => __rh.H.level >= 5), 'Continue puts the hole back at its level');
  await toTitle();

  // Single Area: an endless game on a map of one area, saved for each area
  await play('area:forest');
  ok((await p.textContent('#wArea')).trim() === 'Forest' && (await p.textContent('#wMode')).trim() === 'Single Area' && await p.evaluate(() => __rh.W.getArea() === 'forest' && __rh.BOTS.length >= 2), 'Single Area: forest starts in the forest, with its bots');
  await p.evaluate(() => { __rh.teleport(6000, -4000); }); await frames(p, 6);
  ok(await p.evaluate(() => __rh.W.biomeAt(__rh.H.x, __rh.H.z) === 'forest' && __rh.CELLS.size > 0) && (await p.textContent('#wArea')).trim() === 'Forest', 'it is forest 7 km out as well');
  await p.evaluate(() => __rh.teleport(0, 0)); await frames(p, 4);
  const c2 = await coins(); await grow(4);
  ok(await coins() > c2, 'a Single Area game pays coins like the normal game (' + ((await coins()) - c2) + ')');
  await p.evaluate(() => __rh.pause()); await frames(p, 1);
  const areaKeys = async () => (await keys()).filter(k => k.startsWith('retroHole.saveArea'));
  ok(JSON.stringify(await areaKeys()) === '["retroHole.saveArea.forest"]', 'it is saved for that area alone');
  await p.click('#bQuit'); await frames(p, 3);
  ok(await p.evaluate(() => __rh.W.getArea() === null) && (await p.textContent('#bPlay')).trim() === 'Play', 'quitting gives the mixed map back, and the normal game is untouched');
  await p.click('#bModes'); await frames(p, 1);
  const fc = await p.evaluate(() => ({ forest: document.querySelector('.mdCard[data-mode="area:forest"]').innerText, desert: document.querySelector('.mdCard[data-mode="area:desert"]').innerText }));
  ok(/Level \d+/.test(fc.forest) && /Continue/.test(fc.forest) && /New/.test(fc.forest) && /Not started/.test(fc.desert), 'the Modes screen shows the forest game\'s level and the desert not started');
  await p.click('.mdCard[data-mode="area:desert"] button'); await frames(p, 8); await p.evaluate(() => { __rh.H.prot = 1e9; });
  ok((await p.textContent('#wArea')).trim() === 'Desert' && await p.evaluate(() => __rh.H.level === 1), 'a desert game starts at level 1, apart from the forest one');
  await p.evaluate(() => __rh.pause()); await frames(p, 1);
  ok(JSON.stringify(await areaKeys()) === '["retroHole.saveArea.desert","retroHole.saveArea.forest"]' && (await keys()).includes('retroHole.savePeaceful') && !(await keys()).includes('retroHole.save'), 'each area has its own save, apart from Peaceful and the normal game');
  await toTitle();

  // the Stats tab lists every kind of game
  await p.click('#bSkins'); await p.click('#skTabs button[data-tab=stats]'); await frames(p, 2);
  const st = await p.textContent('#skStats');
  ok(['Normal Game', 'Quick Game', 'Time Attack', 'Arena', 'Single Area', 'Best Results'].every(s => st.includes(s)) && await inside('#skins .ovPanel'), 'the Stats tab lists every kind of game and the best results');
  ok(await p.evaluate(() => __rh.profile.stats.arena.deaths === 1 && __rh.profile.stats.arena.kills === 0 && __rh.profile.stats.normal.deaths === 0), 'deaths in the Arena are counted for the Arena alone');
  await p.click('#bSkinsClose');

  // admin mode keeps its own saves for the new modes too
  await p.evaluate(() => { localStorage.setItem('retroHole.admin', '1'); }); await p.reload(); await ready(p);
  await play('peaceful'); await p.evaluate(() => __rh.pause()); await frames(p, 1);
  ok((await keys()).includes('retroHole.savePeacefulAdmin'), 'in admin mode Peaceful saves under its test key');

  ok(log.length === 0, 'nothing reached the console' + (log.length ? ': ' + log.slice(0, 3).join(' | ') : ''));
  await b.close(); site.close();
})().catch(e => { console.error(e); process.exit(1); });

// Admin mode: typed on the title screen with no box, a separate test profile and test saves, and the Admin panel. The test
// uses a stand-in word and swaps the fingerprint in the page, so the real word is never in the repository.
const crypto = require('crypto');
const { launch, serve, watch, ok, ready, frames, shot } = require('./lib.js');
const WORD = 'stand-in word', PRINT = crypto.createHash('sha256').update('retroRack:' + WORD.toLowerCase()).digest('hex');
(async () => {
  const site = await serve(), { b, newPage } = await launch();
  const log = [];
  const p = await newPage({ viewport: { width: 760, height: 340 } });
  watch(p, log);
  await p.goto(site.url); await ready(p);
  await p.evaluate(h => { __rh.ADMINW.print = h; }, PRINT);
  const vis = sel => p.evaluate(s => { const e = document.querySelector(s); return !!e && !e.hidden && e.getClientRects().length > 0; }, sel);
  const inside = sel => p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }, sel);
  const ls = k => p.evaluate(k => localStorage.getItem(k), k);
  const settle = async () => { await frames(p, 4); await p.waitForTimeout(200); await frames(p, 2); };

  // nothing on the screen gives it away, and the wrong word does nothing
  ok(!await vis('#bAdmin') && !await p.evaluate(() => __rh.admin) && (await p.textContent('#ver')).trim() === 'Version ' + await p.evaluate(() => __rh.BUILD), 'at first there is no admin mode and nothing on the title screen mentions it');
  await p.keyboard.type('not the word'); await settle();
  ok(!await p.evaluate(() => __rh.admin), 'typing something else on the title screen does nothing');
  ok(await p.evaluate(async () => !(await __rh.isAdminWord('stand-in')) && !(await __rh.isAdminWord('')) && !(await __rh.isAdminWord('x'.repeat(60)))), 'part of the word, nothing and a very long text are all refused');

  // typing the word while Settings is open does nothing
  await p.click('#bSet'); await p.keyboard.type(WORD); await settle();
  ok(!await p.evaluate(() => __rh.admin), 'typing the word with Settings open does nothing');
  await p.click('#bSetClose');

  // the word, after other letters, switches it on (any ending of what was typed may be the word)
  await p.keyboard.type('xyz' + WORD.toUpperCase()); await settle();
  ok(await p.evaluate(() => __rh.admin) && await p.evaluate(() => localStorage.getItem('retroHole.admin') === '1'), 'typing the word on the title screen (in capitals, after other letters) switches admin mode on');
  ok((await p.textContent('#ver')).includes('Admin mode on'), 'and the screen says so');
  ok((await p.textContent('#bSkins')).includes('100,000 coins'), 'the test profile has 100,000 coins');
  await p.click('#bSkins'); await frames(p, 2);
  ok(await p.evaluate(() => [...document.querySelectorAll('#skGrid .skCard button')].every(b => b.textContent === 'Worn' || b.textContent === 'Wear')), 'and owns every skin');
  await p.click('#skTabs button[data-tab=fx]'); await frames(p, 1);
  ok(await p.evaluate(() => [...document.querySelectorAll('#skGrid .skCard button')].every(b => b.textContent === 'Worn' || b.textContent === 'Wear')), 'and every effect');
  await p.click('#bSkinsClose');
  ok(await ls('retroHole.profile') === null, 'the real profile was not touched');

  // in a game: the test profile, the Admin tag and the panel
  await p.click('#bPlay'); await frames(p, 8);
  ok(await vis('#wAdmin') && (await p.textContent('#lvCoins')).trim() === '100,000 coins', 'a game shows the Admin tag and the 100,000 coins');
  await p.evaluate(() => __rh.pause()); await frames(p, 1);
  ok(await vis('#bAdmin'), 'the menu has an Admin button');
  await p.click('#bAdmin'); await frames(p, 2);
  ok(await vis('#admin') && await inside('#admin .ovPanel') && await inside('#bAdminClose'), 'the Admin panel opens and fits 760 x 340');
  ok(await p.evaluate(() => document.querySelectorAll('#adGo button').length === 8), 'it can go to the 7 areas and the start');
  // level
  await p.fill('#adLevel', '50'); await p.click('#adSetLevel'); await frames(p, 2);
  ok(await p.evaluate(() => __rh.H.level === 50 && Math.abs(__rh.H.r - __rh.W.radiusAt(50, 0)) < 1e-9), 'Set puts the hole at level 50, with its size');
  await p.fill('#adLevel', '99999'); await p.click('#adSetLevel'); await frames(p, 1);
  ok(await p.evaluate(() => __rh.H.level === 1000), 'the level is held to the game\'s cap (1,000)');
  await p.fill('#adLevel', '30'); await p.keyboard.press('Enter'); await frames(p, 1);
  ok(await p.evaluate(() => __rh.H.level === 30), 'Enter in the box sets it too');
  // coins
  const c0 = await p.evaluate(() => __rh.profile.coins); await p.click('#adCoins'); await frames(p, 1);
  ok(await p.evaluate(c => Math.abs(__rh.profile.coins - c - 100000) < 1e-9, c0), 'Add 100,000 adds 100,000 coins');
  // god mode
  ok(!await p.evaluate(() => __rh.god), 'a hole can be swallowed to begin with');
  await p.click('#adGod button[data-v="1"]'); await frames(p, 1);
  ok(await p.evaluate(() => __rh.god), 'Can\'t Be Swallowed turns on');
  await p.keyboard.press('Escape'); await frames(p, 1);
  ok(!await vis('#admin') && await p.evaluate(() => __rh.state === 'pause'), 'Esc closes the Admin panel but not the menu');
  await p.evaluate(() => __rh.resume()); await frames(p, 2);
  ok(await p.evaluate(() => __rh.BOTS.length > 0), 'bots are there after the level was set from the menu');
  await p.evaluate(() => { __rh.teleport(0, 0); for (const b of __rh.BOTS) { b.alive = false; b.respawn = 1e9; } const b = __rh.BOTS[0]; Object.assign(b, { alive: true, respawn: 0, prot: 0, vx: 0, vz: 0 }); __rh.H.prot = 0; b.r = b.rt = __rh.H.r * 3; b.x = __rh.H.x; b.z = __rh.H.z; });
  await frames(p, 6);
  ok(await p.evaluate(() => __rh.H.deaths === 0 && __rh.H.level >= 30), 'a bot three times the size sitting on the hole does not swallow it');
  await p.evaluate(() => __rh.pause()); await p.click('#bAdmin'); await p.click('#adGod button[data-v="0"]'); await p.click('#bAdminClose');
  await p.evaluate(() => { __rh.resume(); __rh.H.prot = 0; const b = __rh.BOTS[0]; b.alive = true; b.prot = 0; b.r = b.rt = __rh.H.r * 3; b.x = __rh.H.x; b.z = __rh.H.z; }); await frames(p, 4);
  ok(await p.evaluate(() => __rh.H.deaths === 1), 'with it off, the same bot swallows the hole');
  // go to every area
  await p.evaluate(() => { __rh.H.prot = 1e9; });
  for (const a of ['village', 'forest', 'city', 'jurassic', 'desert', 'arctic', 'volcano']) {
    await p.evaluate(() => __rh.pause()); await p.click('#bAdmin'); await p.click(`#adGo button[data-area=${a}]`); await frames(p, 3);
    const at = await p.evaluate(() => ({ biome: __rh.W.biomeAt(__rh.H.x, __rh.H.z), state: __rh.state, cells: __rh.CELLS.size, area: document.querySelector('#wArea').textContent, name: null }));
    ok(at.biome === a && at.state === 'play' && at.cells >= 1, 'Go To ' + a + ' puts the hole there (' + at.area + ', ' + at.cells + ' cells), and the game carries on');
  }
  await p.evaluate(() => __rh.pause()); await p.click('#bAdmin'); await p.click('#adGo button[data-area=start]'); await frames(p, 3);
  ok(await p.evaluate(() => Math.hypot(__rh.H.x, __rh.H.z) < 1), 'Start goes back to the start');
  ok(await p.evaluate(() => __rh.BOTS.length >= 2), 'with the bots round the start (jumping from the menu made none before)');
  await p.screenshot({ path: shot('admin-game.png') });
  await p.evaluate(() => __rh.pause()); await p.click('#bAdmin'); await frames(p, 2); await p.screenshot({ path: shot('admin-panel.png') });
  await p.keyboard.press('Escape');

  // the test saves are separate from the real ones
  ok(await ls('retroHole.saveAdmin') !== null && await ls('retroHole.save') === null && await ls('retroHole.profile') === null, 'the game was saved in the test save; the real save and profile are untouched');
  await p.click('#bQuit'); await frames(p, 3);
  ok((await p.textContent('#bPlay')).includes('Continue'), 'the title screen continues the test game');

  // it stays on through a reload, and typing the word again switches it off and brings the real profile back
  await p.reload(); await ready(p); await p.evaluate(h => { __rh.ADMINW.print = h; }, PRINT);
  ok(await p.evaluate(() => __rh.admin) && (await p.textContent('#ver')).includes('Admin mode'), 'admin mode stays on through a reload, and the title screen says so');
  await p.keyboard.type(WORD); await settle();
  ok(!await p.evaluate(() => __rh.admin) && (await p.textContent('#bSkins')).includes('Skins (0 coins)') && (await p.textContent('#bPlay')).trim() === 'Play' && !await vis('#wAdmin'), 'typing it again switches it off: the real profile (0 coins) and no saved game are back');
  ok((await p.textContent('#ver')).includes('Admin mode off'), 'and the screen says so');
  await p.reload(); await ready(p);
  ok(!await p.evaluate(() => __rh.admin) && await ls('retroHole.admin') === '0', 'and it stays off');
  // the test profile is kept for next time
  await p.evaluate(h => { __rh.ADMINW.print = h; }, PRINT); await p.keyboard.type(WORD); await settle();
  ok(await p.evaluate(() => __rh.admin) && (await p.textContent('#bPlay')).includes('Continue'), 'switching it on again finds the test game where it was left');

  // the Admin panel fits a phone upright too
  await p.setViewportSize({ width: 360, height: 640 }); await p.click('#bPlay'); await frames(p, 4);
  await p.evaluate(() => { __rh.H.prot = 1e9; __rh.pause(); }); await p.click('#bAdmin'); await frames(p, 2);
  ok(await inside('#admin .ovPanel') && await inside('#bAdminClose'), 'the Admin panel fits 360 x 640');
  await p.keyboard.press('Escape');

  ok(log.length === 0, 'nothing reached the console' + (log.length ? ': ' + log.slice(0, 3).join(' | ') : ''));
  await b.close(); site.close();
})().catch(e => { console.error(e); process.exit(1); });

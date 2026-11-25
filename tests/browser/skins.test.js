// Kills and deaths, coins (from levels, kills and coins on the map), the Skins screen and what it changes: the hole's
// ring and pit, and the effect when something falls in. Nothing may reach the console.
const { launch, serve, watch, ok, ready, frames, shot } = require('./lib.js');
(async () => {
  const site = await serve(), { b, newPage } = await launch();
  const log = [];
  const p = await newPage({ viewport: { width: 760, height: 340 } });
  watch(p, log);
  await p.goto(site.url); await ready(p);
  const vis = sel => p.evaluate(s => { const e = document.querySelector(s); return !!e && !e.hidden && e.getClientRects().length > 0; }, sel);
  const inside = sel => p.evaluate(s => { const e = document.querySelector(s), r = e.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }, sel);
  const coins = () => p.evaluate(() => __rh.profile.coins);

  // the title screen with its sixth button
  ok(await vis('#bSkins') && (await p.textContent('#bSkins')).includes('Skins (0 coins)'), 'the title screen has a Skins button showing the coins (0 at first)');
  const titleFits = () => p.evaluate(() => [...document.querySelectorAll('#titleBox, #titleBtns button')].filter(e => !e.hidden && e.offsetParent !== null).every(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }));
  ok(await titleFits(), 'the title screen fits 760 x 340');

  // the Skins screen of a new player
  await p.click('#bSkins'); await frames(p, 2);
  ok(await vis('#skins') && await inside('#skins .ovPanel'), 'Skins opens, inside the screen');
  ok((await p.textContent('#skGrid .skCard[data-id=classic] button')) === 'Worn' && await p.evaluate(() => [...document.querySelectorAll('#skGrid .skCard')].length === 25), 'it lists 25 skins, Classic worn');
  ok(await p.evaluate(() => [...document.querySelectorAll('#skGrid .skCard')].filter(c => c.dataset.id !== 'classic').every(c => c.querySelector('button').disabled)), 'with no coins, nothing can be bought');
  for (const tab of ['fx', 'stats', 'skin']) { await p.click(`#skTabs button[data-tab=${tab}]`); await frames(p, 1); ok(await inside('#skins .ovPanel') && await inside('#bSkinsClose'), 'the ' + tab + ' tab fits the screen'); }
  await p.keyboard.press('Escape'); await frames(p, 1);
  ok(!await vis('#skins') && await p.evaluate(() => __rh.state === 'title'), 'Esc closes Skins');

  // in a game: the counters and coins on the screen
  await p.click('#bPlay'); await frames(p, 8);
  await p.evaluate(() => { __rh.H.prot = 1e9; });
  ok((await p.textContent('#lvKD')).trim() === 'Kills 0 / Deaths 0' && (await p.textContent('#lvCoins')).trim() === '0 coins', 'the HUD shows Kills 0 / Deaths 0 and 0 coins');

  // levels pay: eat things (not coins) until level 4, and the coins are exactly what those levels pay
  for (let k = 0; k < 400 && await p.evaluate(() => __rh.H.level < 4); k++) { await p.evaluate(() => { const n = __rh.nearestEdible(/^(?!coin)/); if (n) __rh.teleport(n.x, n.z); }); await frames(p, 4); }
  const lv = await p.evaluate(() => ({ level: __rh.H.level, coins: __rh.profile.coins, want: Array.from({ length: __rh.H.level - 1 }, (_, i) => __rh.W.levelPay(i + 2)).reduce((a, c) => a + c, 0), best: __rh.H.best }));
  ok(lv.level >= 4 && Math.abs(lv.coins - lv.want) < 1e-9 && lv.best === lv.level, 'reaching level ' + lv.level + ' paid ' + lv.coins + ' coins, what levels 2 to ' + lv.level + ' pay');
  await frames(p, 2);
  ok((await p.textContent('#lvCoins')).trim() === Math.floor(lv.coins) + ' coins', 'and the HUD says so');

  // a coin on the map pays by the hole's size
  await p.evaluate(() => { __rh.H.best = 1e9; });                 // from here no level pays, so only the coin does
  const c0 = await coins();
  const coin = await p.evaluate(() => { const n = __rh.nearestEdible(/^coin$/); if (n) __rh.teleport(n.x, n.z); return n; });
  ok(!!coin && coin.type === 'coin', 'there is a coin to find near the start (' + (coin && coin.d.toFixed(0)) + ' m away)');
  await frames(p, 8);
  const c1 = await coins(), rr = await p.evaluate(() => __rh.H.r), paid = c1 - c0;
  ok(paid > 0 && await p.evaluate(([pd, r]) => [0.98, 1, 1.02].some(f => Math.abs(__rh.W.foundPay(r * f) - pd) < 1e-9), [paid, rr]), 'swallowing it paid ' + paid + ' coins, what a coin pays a hole this size');
  ok((await p.textContent('#coinPop')).startsWith('+') && await p.evaluate(() => document.querySelector('#coinPop').classList.contains('on')), 'and a +' + paid + ' shows by the coins');

  // kills: swallowing a smaller bot counts, pays by its size, and pays less the second time
  const setup = () => p.evaluate(() => { for (const b of __rh.BOTS) { b.alive = false; b.respawn = 1e9; b.dying = 0; b.deaths = 0; } const b = __rh.BOTS[0]; Object.assign(b, { alive: true, respawn: 0, prot: 0, vx: 0, vz: 0 }); __rh.H.prot = 0; return b.name; });
  const swallow = () => p.evaluate(() => { const b = __rh.BOTS[0], H = __rh.H; b.alive = true; b.dying = 0; b.r = b.rt = H.r * 0.4; b.x = H.x; b.z = H.z; b.prot = 0; H.prot = 0; b.think = 1e9; return b.r; });
  await p.evaluate(() => { __rh.teleport(0, 0); __rh.setXp(__rh.W.CUM[30]); }); await frames(p, 3);
  await setup(); const k0 = await coins();
  const br = await swallow(); await frames(p, 3);
  const kill1 = await p.evaluate(() => ({ kills: __rh.H.kills, life: __rh.profile.stats.normal.kills, coins: __rh.profile.coins, toast: document.querySelector('#toast').textContent, alive: __rh.BOTS[0].alive }));
  ok(!kill1.alive && kill1.kills === 1 && kill1.life === 1, 'swallowing a bot counts one kill, this run and for good');
  const pay1 = kill1.coins - k0;
  ok(Math.abs(pay1 - await p.evaluate(r => __rh.W.killPay(r, 0), br)) < 1e-9 && /You swallowed .* \+\d/.test(kill1.toast), 'it paid ' + pay1 + ' coins (5 plus the bot\'s size level), and the message says so ("' + kill1.toast + '")');
  await p.evaluate(() => { __rh.BOTS[0].respawn = 0.05; }); await frames(p, 6);
  const k2 = await coins(); await swallow(); await frames(p, 3);
  const pay2 = (await coins()) - k2;
  ok(await p.evaluate(() => __rh.H.kills === 2) && Math.abs(pay2 - pay1 / 2) < 1e-6, 'the same bot swallowed again pays half (' + pay2 + ' against ' + pay1 + ')');
  ok((await p.textContent('#lvKD')).trim() === 'Kills 2 / Deaths 0', 'the HUD says Kills 2 / Deaths 0');

  // deaths: a bigger bot swallows you; one death, nothing earned by climbing back
  const before = await p.evaluate(() => { const b = __rh.BOTS[0], H = __rh.H; b.r = b.rt = H.r * 3; b.x = H.x; b.z = H.z; b.alive = true; b.prot = 0; H.prot = 0; return { best: H.best, level: H.level, coins: __rh.profile.coins }; });
  await frames(p, 3);
  const dead = await p.evaluate(() => ({ deaths: __rh.H.deaths, life: __rh.profile.stats.normal.deaths, level: __rh.H.level, best: __rh.H.best, coins: __rh.profile.coins }));
  ok(dead.deaths === 1 && dead.life === 1 && dead.level < before.level, 'being swallowed counts one death, this run and for good');
  ok(dead.best === before.best && dead.coins === before.coins, 'and the levels lost are not paid again when you climb back (best level kept: ' + dead.best + ')');
  await frames(p, 2);
  ok((await p.textContent('#lvKD')).trim() === 'Kills 2 / Deaths 1', 'the HUD says Kills 2 / Deaths 1');

  // the counters and coins are kept: the run with its save, the totals for good
  await p.evaluate(() => { __rh.H.prot = 1e9; __rh.pause(); });
  await p.click('#bQuit'); await frames(p, 3);
  await p.reload(); await ready(p);
  ok(await p.evaluate(() => __rh.profile.stats.normal.kills === 2 && __rh.profile.stats.normal.deaths === 1 && __rh.profile.stats.quick.kills === 0) && (await coins()) > 0, 'after a reload the totals and the coins are still there (the totals are kept per game)');
  ok((await p.textContent('#bSkins')).includes('Skins (' + Math.floor(await coins()) + ' coins)'), 'and the title screen shows the coins');
  await p.click('#bPlay'); await frames(p, 4);
  ok((await p.textContent('#lvKD')).trim() === 'Kills 2 / Deaths 1', 'Continue brings the run\'s kills and deaths back');
  await p.evaluate(() => { __rh.pause(); }); await p.click('#bQuit'); await frames(p, 3);
  await p.click('#bNew'); await frames(p, 4);
  ok((await p.textContent('#lvKD')).trim() === 'Kills 0 / Deaths 0' && await p.evaluate(() => __rh.profile.stats.normal.kills === 2), 'New Game starts the run at 0 and 0 but keeps the totals');
  await p.evaluate(() => { __rh.H.prot = 1e9; });

  // the Skins screen from the menu in a game; Esc closes only Skins
  await p.evaluate(() => { __rh.earnCoins(1000); __rh.saveProfile(); }); const have = await coins();
  await p.evaluate(() => __rh.pause()); await p.click('#bSkins2'); await frames(p, 2);
  ok(await vis('#skins') && await inside('#skins .ovPanel') && await p.evaluate(() => __rh.state === 'pause'), 'the menu has Skins, which opens over the game');
  await p.click('#skTabs button[data-tab=stats]'); await frames(p, 1);
  ok((await p.textContent('#skStats')).includes('This Run') && await inside('#skins .ovPanel'), 'Stats lists both games and this run');
  await p.click('#skTabs button[data-tab=skin]'); await frames(p, 1);
  await p.keyboard.press('Escape'); await frames(p, 1);
  ok(!await vis('#skins') && await p.evaluate(() => __rh.state === 'pause'), 'Esc closes Skins but not the menu');
  await p.click('#bSkins2');

  // buying: a skin takes its price, is worn at once, changes the hole, and is kept
  const ringHas = hex => p.evaluate(h => { const col = __rh.VIS[0].a.geometry.attributes.color, want = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255); for (let i = 0; i < col.count; i++) if (Math.abs(col.getX(i) - want[0]) < 0.01 && Math.abs(col.getY(i) - want[1]) < 0.01 && Math.abs(col.getZ(i) - want[2]) < 0.01) return true; return false; }, hex);
  ok(await ringHas('#fff0b0') && !await ringHas('#7dffb0'), 'the ring starts in Classic\'s colour');
  ok(await p.evaluate(() => !document.querySelector('#skGrid .skCard[data-id=mint] button').disabled && document.querySelector('#skGrid .skCard[data-id=void] button').disabled), 'with ' + Math.floor(have) + ' coins, a 150 skin can be bought and a 6,000 one cannot');
  await p.click('#skGrid .skCard[data-id=mint] button'); await frames(p, 2);
  const after = await p.evaluate(() => ({ coins: __rh.profile.coins, wear: __rh.profile.wear.skin, owned: __rh.profile.owned.skin.join(), btn: document.querySelector('#skGrid .skCard[data-id=mint] button').textContent, shown: document.querySelector('#skCoins').textContent }));
  ok(Math.abs(after.coins - (have - 150)) < 1e-9 && after.wear === 'mint' && after.owned === 'classic,mint' && after.btn === 'Worn', 'buying Mint took 150 coins and put it on');
  ok(after.shown === Math.floor(have - 150).toLocaleString('en-GB') + ' coins', 'the coins on the Skins screen drop to ' + after.shown);
  ok(await ringHas('#7dffb0') && !await ringHas('#fff0b0'), 'the hole\'s ring is now Mint');
  await p.click('#skGrid .skCard[data-id=classic] button'); await frames(p, 1);
  ok(await ringHas('#fff0b0') && await p.evaluate(() => __rh.profile.wear.skin === 'classic'), 'a skin owned can be worn again for nothing');
  await p.click('#skGrid .skCard[data-id=mint] button');
  await p.click('#skGrid .skCard[data-id=rainbow]'); // (a card is not a button: nothing happens)
  await p.screenshot({ path: shot('skins-open.png') });

  // an effect: nothing flies up with none; bits fly up with Sparkle
  await p.click('#skTabs button[data-tab=fx]'); await frames(p, 1);
  ok(await p.evaluate(() => document.querySelectorAll('#skGrid .skCard').length === 7 && document.querySelector('#skGrid .skCard[data-id=none] button').textContent === 'Worn'), 'Effects lists 7, with none worn');
  await p.click('#bSkinsClose'); await p.evaluate(() => __rh.resume()); await frames(p, 2);
  const eatOne = async () => { await p.evaluate(() => { const n = __rh.nearestEdible(/^(?!coin)/); if (n) __rh.teleport(n.x, n.z); }); let m = 0; for (let k = 0; k < 6; k++) { await frames(p, 1); m = Math.max(m, await p.evaluate(() => __rh.bits)); } return m; };
  ok(await eatOne() === 0, 'with no effect, nothing flies up when something falls in');
  await p.evaluate(() => __rh.pause()); await p.click('#bSkins2'); await p.click('#skTabs button[data-tab=fx]');
  await p.click('#skGrid .skCard[data-id=sparkle] button'); await frames(p, 1);
  ok(await p.evaluate(() => __rh.profile.wear.fx === 'sparkle' && __rh.profile.owned.fx.join() === 'none,sparkle'), 'buying Sparkle puts it on');
  await p.click('#bSkinsClose'); await p.evaluate(() => __rh.resume()); await frames(p, 2);
  const bitsN = await eatOne();
  ok(bitsN >= 3, 'with Sparkle, bits fly up when something falls in (' + bitsN + ')');
  await frames(p, 60);
  ok(await p.evaluate(() => __rh.bits) <= 12, 'and they die away');
  await p.screenshot({ path: shot('skins-hud.png') });

  // kept through a reload
  await p.evaluate(() => { __rh.pause(); __rh.saveProfile(); }); await p.click('#bQuit'); await frames(p, 2);
  const kept = await p.evaluate(() => ({ coins: __rh.profile.coins }));
  await p.reload(); await ready(p);
  ok(await p.evaluate(c => __rh.profile.wear.skin === 'mint' && __rh.profile.wear.fx === 'sparkle' && Math.abs(__rh.profile.coins - c) < 1e-9, kept.coins) && await ringHas('#7dffb0'), 'the skin, the effect and the coins are kept through a reload, and the hole wears Mint again');

  // a damaged profile in storage is cleaned, not trusted
  await p.evaluate(() => { localStorage.setItem('retroHole.profile', JSON.stringify({ coins: -50, owned: { skin: ['classic'] }, wear: { skin: 'mint', fx: 'sparkle' } })); });
  await p.reload(); await ready(p);
  ok(await p.evaluate(() => __rh.profile.coins === 0 && __rh.profile.wear.skin === 'classic' && __rh.profile.wear.fx === 'none'), 'a damaged saved profile is cleaned: no negative coins, nothing worn that is not owned');

  // the Skins screen fits an upright phone too
  await p.setViewportSize({ width: 360, height: 640 }); await p.click('#bSkins'); await frames(p, 2);
  for (const tab of ['skin', 'fx', 'stats']) { await p.click(`#skTabs button[data-tab=${tab}]`); await frames(p, 1); ok(await inside('#skins .ovPanel') && await inside('#bSkinsClose'), 'the ' + tab + ' tab fits 360 x 640'); }
  await p.click('#bSkinsClose'); await p.setViewportSize({ width: 760, height: 340 }); await frames(p, 2);

  // the HUD with its extra line still fits phones, upright and sideways, without overlapping the scoreboard
  for (const [w, h] of [[760, 340], [480, 300], [360, 640]]) {
    await p.setViewportSize({ width: w, height: h }); await p.click('#bPlay').catch(() => {}); await frames(p, 4);
    await p.evaluate(() => { __rh.H.prot = 1e9; __rh.teleport(300, 200); });   // a long distance makes the widest text in the corner
    await frames(p, 4);
    const fit = await p.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(), l = r('#lvl'), bd = document.querySelector('#board'); return { inLvl: l.right <= innerWidth && l.bottom <= innerHeight, noOverlap: bd.hidden || r('#board').top >= l.bottom - 1, where: r('#where').left >= l.right - 1 || r('#where').top >= l.bottom }; });
    ok(fit.inLvl && fit.noOverlap && fit.where, 'the HUD fits and does not overlap at ' + w + ' x ' + h + ' ' + JSON.stringify(fit));
    await p.evaluate(() => { __rh.pause(); }); await p.click('#bQuit'); await frames(p, 2);
    ok(await titleFits(), 'the title screen fits at ' + w + ' x ' + h + ' (or scrolls inside its box)');
  }

  ok(log.length === 0, 'nothing reached the console' + (log.length ? ': ' + log.slice(0, 3).join(' | ') : ''));
  await b.close(); site.close();
})().catch(e => { console.error(e); process.exit(1); });

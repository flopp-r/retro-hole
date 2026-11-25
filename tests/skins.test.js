// Tests of the skins, effects and the saved profile in src/skins.js. Run: node tests/skins.test.js   (no installs)
const K = require('../src/skins.js');
let passed = 0, failed = 0;
const ok = (c, msg) => { if (c) passed++; else { failed++; console.log('FAIL ' + msg); } };
const HEX = /^#[0-9a-f]{6}$/i;

// -- the catalogue
const all = [...K.SKINS, ...K.EFFECTS];
ok(K.SKINS.length === 25 && K.EFFECTS.length === 7, 'there are 25 skins and 7 effects');
ok(new Set(K.SKINS.map(s => s.id)).size === 25 && new Set(K.EFFECTS.map(s => s.id)).size === 7, 'every skin and effect has its own id');
ok(K.SKINS[0].id === 'classic' && K.SKINS[0].price === 0 && K.EFFECTS[0].id === 'none' && K.EFFECTS[0].price === 0, 'the first of each is free (Classic, and no effect)');
ok(all.slice().every(x => K.RARITY[x.rarity] && (x.price > 0 || x.id === 'classic' || x.id === 'none')), 'everything else costs coins and has a known rarity');
ok(K.SKINS.every(s => s.ring.length >= 1 && s.ring.every(c => HEX.test(c)) && s.pit.length === 2 && s.pit.every(c => HEX.test(c)) && ['solid', 'stripes', 'halves', 'thirds', 'checker', 'dash', 'gradient'].includes(s.pattern)), 'every skin has hex colours and a known pattern');
ok(K.SKINS.every(s => s.pattern === 'solid' || s.ring.length >= 2), 'a patterned skin has at least two colours');
ok(K.SKINS.every(s => (s.rarity === 'epic' || s.rarity === 'legendary') === (s.spin > 0)), 'only epic and legendary skins spin');
ok(K.EFFECTS.slice(1).every(e => e.n > 0 && e.life > 0 && e.size > 0 && e.bits.length >= 1 && e.bits.every(c => HEX.test(c))), 'every effect has bits, a life and a size');
{ const by = r => K.SKINS.filter(s => s.rarity === r && s.id !== 'classic').map(s => s.price); const order = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  ok(order.every(r => new Set(by(r)).size === 1) && order.every((r, i) => !i || by(r)[0] > by(order[i - 1])[0]), 'a skin costs more the rarer it is (150, 400, 1,000, 2,500 and 6,000 coins)'); }
ok(K.cost() === 44500, 'the whole collection costs 44,500 coins (' + K.cost() + ')');

// -- the profile
{ const p = K.fresh();
  ok(p.coins === 0 && p.wear.skin === 'classic' && p.wear.fx === 'none' && K.owns(p, 'skin', 'classic') && p.stats.normal.kills === 0 && p.stats.quick.deaths === 0, 'a new profile has no coins, the free skin and effect, and no kills or deaths');
  ok(!K.buy(p, 'skin', 'mint') && p.coins === 0 && !K.owns(p, 'skin', 'mint'), 'buying without enough coins changes nothing');
  K.earn(p, 200); K.earn(p, -50); K.earn(p, NaN); K.earn(p, 0.5);
  ok(p.coins === 200.5, 'coins add up (and nothing negative or not a number is taken)');
  ok(K.buy(p, 'skin', 'mint') && p.coins === 50.5 && K.owns(p, 'skin', 'mint') && p.wear.skin === 'mint', 'buying takes the price and puts it on');
  ok(!K.buy(p, 'skin', 'mint') && p.coins === 50.5, 'buying what is owned changes nothing');
  ok(!K.buy(p, 'skin', 'nope') && !K.buy(p, 'bogus', 'mint') && p.coins === 50.5, 'an unknown skin or kind cannot be bought');
  ok(K.wear(p, 'skin', 'classic') && p.wear.skin === 'classic' && !K.wear(p, 'skin', 'void') && p.wear.skin === 'classic', 'a skin owned can be worn again, one not owned cannot');
  K.earn(p, 300); ok(K.buy(p, 'fx', 'sparkle') && p.wear.fx === 'sparkle' && p.owned.fx.length === 2, 'effects are bought the same way');
  const text = JSON.stringify(p), q = K.validate(JSON.parse(text));
  ok(JSON.stringify(q) === text, 'a saved profile loads back exactly');
  ok(K.kd({ kills: 6, deaths: 3 }) === 2 && K.kd({ kills: 5, deaths: 0 }) === 5 && K.kd({ kills: 0, deaths: 0 }) === 0, 'kills per death, and just the kills while there are no deaths'); }
{ const v = K.validate({ coins: -5, owned: { skin: ['classic', 'mint', 'mint', 'ghost', 7], fx: 'x' }, wear: { skin: 'void', fx: 'none' }, stats: { normal: { kills: 3.7, deaths: -2 }, quick: { kills: 'many' }, other: { kills: 9 } } });
  ok(v.coins === 0 && v.owned.skin.join() === 'classic,mint' && v.owned.fx.join() === 'none' && v.wear.skin === 'classic', 'a damaged profile is cleaned: no negative coins, no unknown or repeated skins, no wearing what is not owned');
  ok(v.stats.normal.kills === 3 && v.stats.normal.deaths === 0 && v.stats.quick.kills === 0, 'and kills and deaths become whole, non-negative numbers');
  ok(K.validate(null).coins === 0 && K.validate('x').wear.skin === 'classic' && K.validate(42).owned.fx[0] === 'none', 'anything that is not a profile gives a new one');
  ok(K.validate({ coins: 1e30 }).coins <= 1e12, 'coins are capped'); }

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

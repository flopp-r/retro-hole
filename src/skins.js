// ------------------------------------------------------------------ skins, eating effects and the wallet
// No screen and no three.js here (it also runs in Node, for the tests): the catalogue of hole skins and eating effects,
// their prices, and the saved profile (coins, what is owned and worn, kills and deaths for good).
const SKINS_MOD = (() => {
const RARITY = {                                                  // the colour of a card, and the name shown
  common: { name: 'Common', colour: '#c9ced8' }, uncommon: { name: 'Uncommon', colour: '#7dffb0' }, rare: { name: 'Rare', colour: '#6cb8ff' },
  epic: { name: 'Epic', colour: '#c79bff' }, legendary: { name: 'Legendary', colour: '#ffc56b' },
};
const PRICE = { common: 150, uncommon: 400, rare: 1000, epic: 2500, legendary: 6000 };
// A skin: the ring's colours and how they are laid round it (pattern), the pit's two colours (top, bottom), and spin
// (radians a second, for the epic and legendary ones). Patterns: solid, stripes (every 3rd segment of 48), halves,
// thirds, checker (every segment), dash (long colour, short dark gap) and gradient (the colours blend round the ring).
const PIT = { c: ['#5a4a8c', '#150e2a'] };
const sk = (id, name, rarity, ring, pattern, pit, spin = 0) => ({ id, name, rarity, price: id === 'classic' ? 0 : PRICE[rarity], ring, pattern, pit: pit || PIT.c, spin });
const SKINS = [
  sk('classic', 'Classic', 'common', ['#fff0b0'], 'solid'),
  sk('mint', 'Mint', 'common', ['#7dffb0'], 'solid', ['#2f6a55', '#0a2a22']),
  sk('sky', 'Sky', 'common', ['#6cb8ff'], 'solid', ['#2f5a8c', '#0a1a33']),
  sk('rose', 'Rose', 'common', ['#ff6f8f'], 'solid', ['#8c2f4a', '#33101c']),
  sk('tangerine', 'Tangerine', 'common', ['#ffa040'], 'solid', ['#8c5a2f', '#331c0a']),
  sk('lilac', 'Lilac', 'common', ['#c79bff'], 'solid', ['#5a3a8c', '#1a0e33']),
  sk('slate', 'Slate', 'common', ['#c9ced8'], 'solid', ['#4a4f5c', '#14161c']),
  sk('candy', 'Candy Stripe', 'uncommon', ['#ff6f8f', '#ffffff'], 'stripes', ['#8c2f4a', '#33101c']),
  sk('bee', 'Bee', 'uncommon', ['#ffd34d', '#1a1433'], 'stripes', ['#8c7a2f', '#2a2208']),
  sk('ocean', 'Ocean', 'uncommon', ['#6cb8ff', '#ffffff'], 'halves', ['#2f5a8c', '#0a1a33']),
  sk('meadow', 'Meadow', 'uncommon', ['#3f9a3c', '#a8d36a'], 'checker', ['#2f6a2f', '#0a2a0a']),
  sk('sunset', 'Sunset', 'uncommon', ['#ff6f8f', '#ffc56b'], 'halves', ['#8c3a4a', '#331018']),
  sk('zebra', 'Zebra', 'uncommon', ['#ffffff', '#2a2a33'], 'checker', ['#4a4f5c', '#0d0a1c']),
  sk('tricolour', 'Tricolour', 'rare', ['#ff4a5a', '#ffffff', '#3a6fd1'], 'thirds', ['#4a4f8c', '#0d0a2c']),
  sk('lava', 'Lava', 'rare', ['#ff4a1c', '#ffb03a', '#7a1010'], 'stripes', ['#8c2f10', '#330a00']),
  sk('frost', 'Frost', 'rare', ['#bfe8ff', '#6cb8ff'], 'dash', ['#3a6a8c', '#0a1a2a']),
  sk('toxic', 'Toxic', 'rare', ['#b8ff3a', '#1a1433'], 'dash', ['#4a8c1a', '#102a05']),
  sk('royal', 'Royal', 'rare', ['#7a4ad1', '#ffd34d'], 'halves', ['#4a2a8c', '#150a33']),
  sk('ember', 'Ember', 'epic', ['#ff4a1c', '#ffd34d'], 'checker', ['#8c2f10', '#2a0a00'], 0.8),
  sk('galaxy', 'Galaxy', 'epic', ['#1a1433', '#7a4ad1', '#6cb8ff', '#ffffff'], 'stripes', ['#2a1a5a', '#05020f'], 0.8),
  sk('gold', 'Gold', 'epic', ['#ffd34d', '#fff2a8', '#c98f12'], 'stripes', ['#8c6a1a', '#2a1c05'], 0.8),
  sk('rainbow', 'Rainbow', 'epic', ['#ff4a5a', '#ffa040', '#ffd34d', '#7dffb0', '#6cb8ff', '#c79bff'], 'gradient', null, 0.8),
  sk('void', 'Void', 'legendary', ['#0d0a1c', '#7a4ad1'], 'dash', ['#1a0e33', '#000000'], 1.6),
  sk('prism', 'Prism', 'legendary', ['#ff4a5a', '#ffa040', '#ffd34d', '#7dffb0', '#6cb8ff', '#c79bff'], 'checker', ['#5a4a8c', '#0a0618'], 1.6),
  sk('sun', 'Sun', 'legendary', ['#ffd34d', '#ff8a3a', '#fff2a8'], 'thirds', ['#8c4a1a', '#2a1005'], 1.6),
];
// An eating effect: little coloured cubes thrown up when a thing falls in. All sizes and speeds are in hole radii
// (so it looks the same at every level): n bits a thing, speed sideways, up (and `g` the pull of gravity; negative
// floats), life in seconds, size.
const fxe = (id, name, rarity, bits, n, speed, up, g, life, size) => ({ id, name, rarity, price: id === 'none' ? 0 : { common: 300, uncommon: 300, rare: 800, epic: 2000, legendary: 4000 }[rarity], bits, n, speed, up, g, life, size });
const EFFECTS = [
  fxe('none', 'None', 'common', ['#ffffff'], 0, 0, 0, 0, 0, 0),
  fxe('sparkle', 'Sparkle', 'common', ['#fff2a8', '#ffffff', '#ffd34d'], 5, 1.1, 1.3, 4, 0.55, 0.22),
  fxe('smoke', 'Smoke', 'uncommon', ['#8a8f9a', '#c9ced8', '#5a5f6c'], 4, 0.5, 1.2, -1, 0.9, 0.4),
  fxe('confetti', 'Confetti', 'rare', ['#ff6f8f', '#6cb8ff', '#ffd34d', '#7dffb0', '#c79bff'], 7, 1.5, 1.5, 5, 0.8, 0.26),
  fxe('embers', 'Embers', 'rare', ['#ff4a1c', '#ffb03a', '#ffd34d'], 6, 0.7, 1.4, -0.8, 0.9, 0.2),
  fxe('stars', 'Stars', 'epic', ['#ffffff', '#ffd34d'], 6, 1.2, 1.8, 3.5, 0.8, 0.32),
  fxe('burst', 'Rainbow Burst', 'legendary', ['#ff4a5a', '#ffa040', '#ffd34d', '#7dffb0', '#6cb8ff', '#c79bff'], 12, 1.9, 2.0, 5, 0.9, 0.28),
];
const KINDS = { skin: SKINS, fx: EFFECTS };
const find = (kind, id) => (Object.prototype.hasOwnProperty.call(KINDS, kind) ? KINDS[kind] : []).find(x => x.id === id) || null;

// The saved profile: coins (may hold fractions; shown rounded down), what is owned and worn, kills and deaths for good.
// stats are kept for each game, since Quick Game and the normal game are separate.
const STAT_KEYS = ['normal', 'quick', 'time', 'arena', 'area'];   // kills and deaths are kept for each kind of game (Single Area is one, whichever area)
const blankStats = () => Object.fromEntries(STAT_KEYS.map(k => [k, { kills: 0, deaths: 0 }]));
const blankBest = () => ({ time: 0, timePlayed: 0, arenaPlayed: 0, arenaWins: 0, arenaBest: 0 });   // arenaBest: the best place (1 is first), 0 when never played
const fresh = () => ({ v: 1, coins: 0, owned: { skin: ['classic'], fx: ['none'] }, wear: { skin: 'classic', fx: 'none' }, stats: blankStats(), best: blankBest() });
const num = (x, max = 1e12) => typeof x === 'number' && isFinite(x) && x >= 0 ? Math.min(x, max) : 0;
function validate(raw) {                                          // a clean profile from anything that was saved
  const p = fresh();
  if (!raw || typeof raw !== 'object') return p;
  p.coins = Math.round(num(raw.coins) * 100) / 100;
  for (const k of Object.keys(KINDS)) {
    const own = raw.owned && Array.isArray(raw.owned[k]) ? raw.owned[k] : [];
    for (const id of own) if (typeof id === 'string' && find(k, id) && !p.owned[k].includes(id)) p.owned[k].push(id);
    const w = raw.wear && raw.wear[k];
    if (typeof w === 'string' && p.owned[k].includes(w)) p.wear[k] = w;
  }
  for (const m of STAT_KEYS) { const s = raw.stats && raw.stats[m]; if (s) { p.stats[m].kills = Math.floor(num(s.kills, 1e9)); p.stats[m].deaths = Math.floor(num(s.deaths, 1e9)); } }
  if (raw.best && typeof raw.best === 'object') for (const k of Object.keys(p.best)) p.best[k] = Math.floor(num(raw.best[k], 1e9));
  return p;
}
const full = () => { const p = fresh(); p.coins = 100000; for (const k of Object.keys(KINDS)) p.owned[k] = KINDS[k].map(x => x.id); return p; };   // admin mode's test profile: everything owned, plenty of coins
const owns = (p, kind, id) => p.owned[kind].includes(id);
function buy(p, kind, id) {                                       // spends the coins and puts it on; false (nothing changed) if unknown, owned or too dear
  const it = find(kind, id);
  if (!it || owns(p, kind, id) || p.coins < it.price) return false;
  p.coins = Math.round((p.coins - it.price) * 100) / 100; p.owned[kind].push(id); p.wear[kind] = id;
  return true;
}
function wear(p, kind, id) { if (!find(kind, id) || !owns(p, kind, id)) return false; p.wear[kind] = id; return true; }
const earn = (p, n) => { if (n > 0 && isFinite(n)) p.coins = Math.round(Math.min(p.coins + n, 1e12) * 100) / 100; };
// The timed modes pay by result, with a cap so they cannot be repeated to fill the shop. Time Attack: the score is 100 a
// level plus the share of the next level (0 to 100) plus 250 a kill, and pays a coin for every 40 points, to 300 coins.
// Arena: 120, 80 and 50 coins for first, second and third, 20 for the rest, plus 10 a kill (at most 8 count), to 200 coins.
const TIME_SECS = 180, ARENA_SECS = 240, TIME_PAY_CAP = 300, ARENA_PAY_CAP = 200;
const timeScore = ({ level, frac, kills }) => level * 100 + Math.round(frac * 100) + kills * 250;
const timePay = score => Math.min(TIME_PAY_CAP, Math.max(0, Math.floor(score / 40)));
const arenaPay = (rank, kills) => Math.min(ARENA_PAY_CAP, ([0, 120, 80, 50][rank] || 20) + 10 * Math.min(8, Math.max(0, kills)));
const kd = s => s.deaths ? s.kills / s.deaths : s.kills;          // kills for each death (with no deaths, just the kills)
const total = p => SKINS.length + EFFECTS.length - 2;             // what can be bought (the two free ones excluded)
const cost = () => [...SKINS, ...EFFECTS].reduce((a, x) => a + x.price, 0);
return { RARITY, PRICE, SKINS, EFFECTS, KINDS, STAT_KEYS, TIME_SECS, ARENA_SECS, timeScore, timePay, arenaPay, find, fresh, full, validate, owns, buy, wear, earn, kd, total, cost };
})();
if (typeof module !== 'undefined') module.exports = SKINS_MOD;

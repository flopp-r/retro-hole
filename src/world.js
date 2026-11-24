// Retro Hole's world: the rules that need no screen. Levels and growth, the endless map (areas, what stands where,
// how big it is), the voxel models, and what a hole can swallow. No DOM and no three.js, so it also runs in Node,
// for the tests and the pace tool. Everything is a pure function of the world seed: the same seed gives the same map.
const WORLD = (() => {
'use strict';

// ------------------------------------------------------------------ numbers
// The size of things grows in a straight line with the distance from the start: at D0 metres out everything is twice
// the size it is at the start, at 2*D0 three times, and so on. A hole that has grown to match meets the same kind of
// world wherever it is, so the map can go on for ever and the numbers never run away (see HANDOVER.md, section 3).
const D0 = 120;                    // metres out where things are twice the starting size
const R0 = 0.5;                    // the hole's radius at level 1 (m)
const MAXLV = 1000;                // the level cap
const REACH = 5000;                // how many times wider the hole is at the cap than at level 1
const CURVE = 0.6;                 // how the growth is spread over the levels: 1 would be the same share every level; less is quicker at first
const C0 = 32;                     // a map cell is this wide (m) in the first ring, and twice as wide in each next one
const EAT_MAX = 0.92;              // a hole swallows things up to this fraction of its own radius
const SPAWN_CLEAR = 3;             // nothing stands this close to the start (m)

const scaleAt = d => 1 + d / D0;
const tierOf = d => Math.floor(Math.log2(scaleAt(d)));              // ring 0 is 0 to 120 m, ring 1 is 120 to 360 m ...
const tierRange = t => [D0 * (Math.pow(2, t) - 1), D0 * (Math.pow(2, t + 1) - 1)];
const cellSize = t => C0 * Math.pow(2, t);

let SEED = 20261124;
const setSeed = s => { SEED = s | 0; };
const getSeed = () => SEED;

// ------------------------------------------------------------------ random numbers
const hash = (a, b = 0, c = 0, d = 0, e = 0) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x7f4a7c15, 0xc2b2ae35) ^ Math.imul((c | 0) + 0x165667b1, 0x27d4eb2f) ^ Math.imul((d | 0) + 0x94d049bb, 0x85ebca77) ^ Math.imul((e | 0) + 0x3c6ef372, 0xd3a2646c);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return h >>> 0;
};
const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// ------------------------------------------------------------------ levels
// Eating gives xp; a level needs a little more xp than the one before. The hole's radius grows smoothly with xp:
// R0 at level 1, REACH times that at the cap. The growth is quick at first (about 8% a level at the start, 3% by level
// 10, 1.3% by level 100, half a per cent at the cap), so the first minutes show a hole visibly getting bigger. The xp a
// thing gives is its size next to the hole's, squared, plus a small flat part, so small things still count at the start
// and a thing nearly your size is worth a lot.
const need = L => 0.2 * Math.pow(1 + L / 25, 1.1);               // xp to get from level L to L + 1
const CUM = new Float64Array(MAXLV + 2);                          // CUM[L] = xp at which level L begins
for (let L = 1; L <= MAXLV; L++) CUM[L + 1] = CUM[L] + need(L);
const MAXXP = CUM[MAXLV];
function progress(xp) {                                           // { level, frac }: frac is how far through the level
  if (xp >= MAXXP) return { level: MAXLV, frac: 0 };
  let lo = 1, hi = MAXLV;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (CUM[mid] <= xp) lo = mid; else hi = mid - 1; }
  return { level: lo, frac: (xp - CUM[lo]) / need(lo) };
}
const radiusAt = (level, frac = 0) => R0 * Math.pow(REACH, Math.pow(Math.min(level - 1 + frac, MAXLV - 1) / (MAXLV - 1), CURVE));
const xpFor = (objR, holeR) => { const q = objR / holeR; return 0.015 + q * q; };
const canEat = (objR, holeR) => objR <= holeR * EAT_MAX;
const swallowDist = (objR, holeR) => holeR - 0.35 * objR;         // the hole's centre must be this close to the thing's

// ------------------------------------------------------------------ areas
// Areas are patches on a map drawn in rings and sectors, so a patch is as much bigger as it is further out, and the
// pattern looks the same at every size. u goes round the start (SECTORS to a full turn), v goes outward in steps of
// equal ratio. The start itself is always the village.
const SECTORS = 6, RINGS = 2.2;
const BIOMES = {
  village: { name: 'Village', ground: ['#6fae4a', '#79b952', '#67a547'], field: ['#bdb458', '#a9b856'] },
  forest: { name: 'Forest', ground: ['#3d7a38', '#36702f', '#44843f'] },
  city: { name: 'City', ground: ['#8c8e9e', '#9496a6', '#85879a'], road: ['#3a3c49', '#41434f'] },
};
const vnoise = (u, v, K, seed) => {
  const iu = Math.floor(u), iv = Math.floor(v), fu = u - iu, fv = v - iv;
  const h = (a, b) => hash(seed, ((a % K) + K) % K, b) / 4294967296;
  const su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv);
  const a = h(iu, iv), b = h(iu + 1, iv), c = h(iu, iv + 1), d = h(iu + 1, iv + 1);
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
};
function polar(x, z) {                                            // where a point is on the ring-and-sector map
  const d = Math.hypot(x, z), S = scaleAt(d);
  return { d, S, u: (Math.atan2(z, x) / (2 * Math.PI) + 0.5) * SECTORS, v: Math.log(S) * RINGS };
}
function biomeAt(x, z) {
  const p = polar(x, z);
  if (p.d < 70) return 'village';
  const city = 0.65 * vnoise(p.u, p.v, SECTORS, SEED + 1) + 0.35 * vnoise(p.u * 2, p.v * 2, SECTORS * 2, SEED + 2);
  if (city > 0.6) return 'city';
  const forest = 0.65 * vnoise(p.u, p.v, SECTORS, SEED + 3) + 0.35 * vnoise(p.u * 2, p.v * 2, SECTORS * 2, SEED + 4);
  return forest > 0.5 ? 'forest' : 'village';
}
// The city's streets: radial roads and ring roads, spaced so a block is about as wide as it is long at any distance.
const ROADS = 36, ROADV = 5.7, ROADW = 0.16;                      // roads in a full turn; ring roads per unit of v; their share of a block
function grid(x, z) {
  const d = Math.hypot(x, z), S = scaleAt(d);
  const th = Math.atan2(z, x), u = (th / (2 * Math.PI) + 0.5) * ROADS, v = Math.log(S) * ROADV;
  return { fu: u - Math.floor(u), fv: v - Math.floor(v), mu: 2 * Math.PI * Math.max(d, 1) / ROADS, mv: D0 * S / ROADV, th, u };
}
function groundColour(x, z, tx, tz) {                             // the colour of one ground tile, as [r, g, b] from 0 to 1
  const biome = biomeAt(x, z), B = BIOMES[biome], h = hash(tx, tz, 77);
  let hex;
  if (biome === 'city') {
    const g = grid(x, z);
    hex = (g.fu < ROADW || g.fv < ROADW) ? B.road[h & 1] : B.ground[h % 3];
  } else if (biome === 'village') {
    const p = polar(x, z), f = vnoise(p.u * 3, p.v * 3, SECTORS * 3, SEED + 9) > 0.66;
    hex = f ? B.field[(tx + tz) & 1] : B.ground[h % 3];
  } else hex = B.ground[h % 3];
  const n = parseInt(hex.slice(1), 16), j = 0.94 + 0.12 * ((h >>> 8) & 255) / 255;
  return [((n >> 16) & 255) / 255 * j, ((n >> 8) & 255) / 255 * j, (n & 255) / 255 * j];
}

// ------------------------------------------------------------------ things (voxel models)
// A model is boxes on a coarse grid, built in grid units and then scaled so that the circle round its footprint has
// the natural radius b (metres at the start; everything is multiplied by the local scale where it stands).
// P(width, height, depth, colour, x, y, z): a box standing on height y, centred on x and z. Colour 'T' takes the
// variant's colour. lam: how many stand in 100 m2 at the start (they thin out as 1 / scale squared). from: how far
// out (m) before it appears. on: 'road' only on a street, 'block' only between streets, else anywhere. walk: how fast
// it wanders, in metres a second at the starting size (animals); 0 stands still.
const P = (w, h, d, c, x = 0, y = 0, z = 0) => [w, h, d, c, x, y, z];
const TYPES = [];
function def(biome, id, name, b, lam, from, parts, o = {}) {
  const tints = o.tints || [null];
  tints.forEach((tc, n) => TYPES.push({
    biome, id: o.tints ? id + n : id, kind: id, name, b, lam: lam / tints.length, from, on: o.on || 'any', walk: o.walk || 0,
    parts: parts.map(p => p[3] === 'T' ? [p[0], p[1], p[2], tc, p[4], p[5], p[6]] : p),
  }));
}
const WOOD = '#8a5a30', DWOOD = '#5a3d22', WHITE = '#f4f1ea', DARK = '#2a2a33', GLASS = '#9fd8ff', ROOF = '#a8472f', STONE = '#8a8f9a';
const rows = (w, d, y0, step, n, col, h = 1.2) => Array.from({ length: n }, (_, k) => P(w + 0.3, h, d + 0.3, col, 0, y0 + k * step, 0));
// -- village: small things to eat from the first step, bigger ones in sight at the start (a cow, a pig, a shed, houses)
// that come within reach a few levels at a time, and animals that wander about
def('village', 'flower', 'Flower', 0.08, 20, 0, [P(1, 4, 1, '#3f9a3c'), P(3, 1, 3, 'T', 0, 4, 0), P(1, 1, 1, '#ffd34d', 0, 5, 0)], { tints: ['#ff5d7a', '#ffd34d', '#f4f4f4', '#9a6bff'] });
def('village', 'gnome', 'Garden Gnome', 0.1, 2, 0, [P(3, 3, 3, '#3d6fd1'), P(3, 2, 3, '#f0c8a0', 0, 3, 0), P(3, 3, 3, '#d6443c', 0, 5, 0), P(3, 1, 1, '#ffffff', 0, 3, -1.5)]);
def('village', 'rabbit', 'Rabbit', 0.12, 2, 0, [P(3, 3, 4, '#c9b8a0'), P(2, 2, 2, '#c9b8a0', 0, 3, -2), P(1, 3, 1, '#c9b8a0', -0.7, 5, -2), P(1, 3, 1, '#c9b8a0', 0.7, 5, -2), P(1, 1, 1, '#ffffff', 0, 2, 2.5)], { walk: 0.7 });
def('village', 'duck', 'Duck', 0.13, 3, 0, [P(3, 2, 4, '#f2d34a'), P(2, 2, 2, '#f2d34a', 0, 2, -2), P(1, 1, 1, '#f2863a', 0, 2, -3.5), P(1, 1, 1, '#f2d34a', 0, 2, 2.5)], { walk: 0.25 });
def('village', 'bucket', 'Bucket', 0.14, 5, 0, [P(4, 3, 4, '#8a93a3'), P(2, 1, 2, '#3a3f4d', 0, 3, 0)]);
def('village', 'chicken', 'Chicken', 0.16, 4, 0, [P(3, 3, 4, WHITE), P(2, 2, 2, WHITE, 0, 3, -2), P(1, 1, 1, '#f2a33a', 0, 3, -3.5), P(1, 1, 1, '#d6443c', 0, 5, -2), P(1, 2, 1, WHITE, 0, 3, 2.5)], { walk: 0.35 });
def('village', 'mailbox', 'Postbox', 0.12, 1.5, 0, [P(1, 5, 1, '#7a5a3a'), P(3, 2, 4, '#3d6fd1', 0, 5, 0)]);
def('village', 'cat', 'Cat', 0.15, 1, 0, [P(2, 3, 5, '#e8a24a'), P(3, 3, 3, '#e8a24a', 0, 3, -3), P(1, 1, 1, '#e8a24a', -1, 6, -3), P(1, 1, 1, '#e8a24a', 1, 6, -3), P(1, 4, 1, '#e8a24a', 0, 3, 3)], { walk: 0.5 });
def('village', 'crate', 'Crate', 0.2, 2.5, 0, [P(4, 4, 4, '#a8803c'), P(4.2, 0.6, 4.2, '#6a4a22', 0, 1.7, 0)]);
def('village', 'barrel', 'Barrel', 0.22, 2, 0, [P(4, 5, 4, '#7a5a3a'), P(4.4, 0.6, 4.4, '#3a3f4d', 0, 1, 0), P(4.4, 0.6, 4.4, '#3a3f4d', 0, 3.8, 0)]);
def('village', 'dog', 'Dog', 0.28, 1, 0, [P(3, 3, 6, '#a87a4a', 0, 2, 0), P(3, 3, 3, '#a87a4a', 0, 4, -4), P(1, 2, 1, '#7a5230', -1.5, 4, -4), P(1, 2, 1, '#7a5230', 1.5, 4, -4), P(1, 3, 1, '#a87a4a', 0, 4, 3.5), P(1, 2, 1, '#7a5230', -1, 0, -2), P(1, 2, 1, '#7a5230', 1, 0, -2), P(1, 2, 1, '#7a5230', -1, 0, 2), P(1, 2, 1, '#7a5230', 1, 0, 2)], { walk: 0.7 });
def('village', 'haybale', 'Hay Bale', 0.3, 3, 0, [P(6, 4, 4, '#e1c35a'), P(1, 4, 5, '#b8963a', -2, 0, 0), P(1, 4, 5, '#b8963a', 2, 0, 0)]);
def('village', 'wheelbarrow', 'Wheelbarrow', 0.3, 1, 0, [P(4, 2, 6, '#3f9a5a', 0, 2, 0), P(1, 1, 5, '#7a5a3a', -1.5, 1, 3), P(1, 1, 5, '#7a5a3a', 1.5, 1, 3), P(1, 3, 3, DARK, 0, 0, -3), P(1, 3, 1, '#7a5a3a', -1.5, 0, 5), P(1, 3, 1, '#7a5a3a', 1.5, 0, 5)]);
def('village', 'fence', 'Fence', 0.35, 3, 0, [P(1, 4, 1, '#c8a06a', -3, 0, 0), P(1, 4, 1, '#c8a06a', 3, 0, 0), P(7, 1, 0.6, '#c8a06a', 0, 1, 0), P(7, 1, 0.6, '#c8a06a', 0, 3, 0)]);
def('village', 'bench', 'Bench', 0.4, 1.2, 0, [P(8, 1, 3, '#9a6b3d', 0, 2, 0), P(8, 3, 1, '#9a6b3d', 0, 3, -1), P(1, 2, 3, DWOOD, -3, 0, 0), P(1, 2, 3, DWOOD, 3, 0, 0)]);
def('village', 'scarecrow', 'Scarecrow', 0.28, 1, 0, [P(1, 9, 1, '#7a5a3a'), P(7, 1, 1, '#7a5a3a', 0, 6, 0), P(3, 4, 2, '#3d6fd1', 0, 4, 0), P(3, 3, 3, '#e3c27a', 0, 8, 0), P(5, 1, 5, DWOOD, 0, 11, 0), P(3, 2, 3, DWOOD, 0, 12, 0)]);
def('village', 'doghouse', 'Kennel', 0.4, 1, 0, [P(6, 4, 6, '#c8553d'), P(8, 1, 8, '#6b3a28', 0, 4, 0), P(6, 1, 6, '#6b3a28', 0, 5, 0), P(2, 2, 1, '#2a1a14', 0, 0, -3)]);
def('village', 'hedge', 'Hedge', 0.5, 1.5, 0, [P(8, 4, 3, '#2f7a3a'), P(6, 1, 2, '#3f9a46', 0, 4, 0)]);
def('village', 'sheep', 'Sheep', 0.45, 1.5, 0, [P(5, 4, 7, '#f3f1ea', 0, 2, 0), P(3, 3, 3, '#3a3a44', 0, 3, -5), P(1, 2, 1, '#3a3a44', -1.5, 0, -2.5), P(1, 2, 1, '#3a3a44', 1.5, 0, -2.5), P(1, 2, 1, '#3a3a44', -1.5, 0, 2.5), P(1, 2, 1, '#3a3a44', 1.5, 0, 2.5)], { walk: 0.25 });
def('village', 'pig', 'Pig', 0.5, 0.9, 0, [P(5, 4, 8, '#f0a8b0', 0, 2, 0), P(4, 4, 3, '#f0a8b0', 0, 3, -5.5), P(2, 2, 1, '#e08890', 0, 3, -7.5), P(1.5, 2, 1.5, '#e08890', -1.5, 0, -2.5), P(1.5, 2, 1.5, '#e08890', 1.5, 0, -2.5), P(1.5, 2, 1.5, '#e08890', -1.5, 0, 2.5), P(1.5, 2, 1.5, '#e08890', 1.5, 0, 2.5), P(1, 1, 1, '#e08890', 0, 5, 4.5)], { walk: 0.3 });
def('village', 'cow', 'Cow', 0.7, 1.0, 0, [P(6, 5, 10, WHITE, 0, 3, 0), P(3, 0.4, 4, DARK, 1, 8, -1), P(2, 0.4, 3, DARK, -1.5, 8, 2.5), P(4, 4, 4, WHITE, 0, 5, -7), P(3, 2, 1, '#e9a0a0', 0, 5, -9.5), P(2, 3, 2, WHITE, -2, 0, -3.5), P(2, 3, 2, WHITE, 2, 0, -3.5), P(2, 3, 2, WHITE, -2, 0, 3.5), P(2, 3, 2, WHITE, 2, 0, 3.5)], { walk: 0.2 });
def('village', 'picnic', 'Picnic Table', 0.6, 0.4, 5, [P(10, 1, 6, '#9a6b3d', 0, 4, 0), P(10, 1, 2, '#9a6b3d', 0, 2, -4), P(10, 1, 2, '#9a6b3d', 0, 2, 4), P(1, 4, 6, DWOOD, -4, 0, 0), P(1, 4, 6, DWOOD, 4, 0, 0)]);
def('village', 'well', 'Well', 0.6, 0.4, 10, [P(8, 4, 8, STONE), P(6, 0.5, 6, '#3a6fd1', 0, 4, 0), P(1, 6, 1, '#7a5a3a', -3.5, 4, 0), P(1, 6, 1, '#7a5a3a', 3.5, 4, 0), P(10, 1, 6, '#9b3d2e', 0, 10, 0)]);
def('village', 'horse', 'Horse', 0.9, 0.35, 20, [P(5, 6, 12, '#8a5a30', 0, 6, 0), P(3, 5, 4, '#8a5a30', 0, 10, -8), P(1, 5, 5, '#3a2414', 0, 10, -5), P(1.5, 6, 1.5, '#6a4a22', -1.5, 0, -4.5), P(1.5, 6, 1.5, '#6a4a22', 1.5, 0, -4.5), P(1.5, 6, 1.5, '#6a4a22', -1.5, 0, 4.5), P(1.5, 6, 1.5, '#6a4a22', 1.5, 0, 4.5), P(1, 5, 1, '#3a2414', 0, 6, 6.5)], { walk: 0.5 });
def('village', 'tractor', 'Tractor', 1.0, 0.4, 25, [P(7, 5, 13, '#c8362e', 0, 3, 2), P(7, 6, 5, '#4a5666', 0, 8, -1), P(2, 6, 6, DARK, -5, 0, -3), P(2, 6, 6, DARK, 5, 0, -3), P(2, 4, 4, DARK, -4, 0, 6), P(2, 4, 4, DARK, 4, 0, 6)]);
def('village', 'appletree', 'Apple Tree', 1.0, 0.8, 8, [P(2, 6, 2, '#6a4a2a'), P(9, 4, 9, '#3f9a46', 0, 6, 0), P(7, 3, 7, '#4aa84e', 0, 10, 0), P(1, 1, 1, '#d6443c', 3.6, 7, 1), P(1, 1, 1, '#d6443c', -3.6, 6.5, -1.5), P(1, 1, 1, '#d6443c', 1, 10, 3.4), P(1, 1, 1, '#d6443c', -1.5, 10.5, -3.4)]);
def('village', 'shed', 'Shed', 1.1, 0.35, 12, [P(9, 6, 8, '#a8803c'), P(10, 1, 9, DWOOD, 0, 6, 0), P(8, 1, 7, DWOOD, 0, 7, 0), P(3, 4, 1, '#5a3d22', 0, 0, -4.2), P(2, 2, 1, '#8fd0f0', 3, 2, -4.2)]);
def('village', 'haystack', 'Haystack', 1.2, 0.5, 8, [P(10, 3, 10, '#e1c35a'), P(8, 3, 8, '#e8cc62', 0, 3, 0), P(6, 3, 6, '#e1c35a', 0, 6, 0), P(3, 2, 3, '#d9b84e', 0, 9, 0)]);
def('village', 'silo', 'Silo', 1.4, 0.2, 40, [P(10, 20, 10, '#b7bcc8'), P(12, 2, 12, '#8c93a3', 0, 20, 0), P(8, 2, 8, '#8c93a3', 0, 22, 0)]);
def('village', 'cottage', 'Cottage', 2.0, 0.5, 10, [P(16, 8, 12, '#e8dcc0'), P(18, 1, 14, ROOF, 0, 8, 0), P(14, 1, 12, ROOF, 0, 9, 0), P(10, 1, 10, ROOF, 0, 10, 0), P(3, 5, 1, '#6b4a2a', 0, 0, -6), P(3, 3, 1, '#6fb4e8', -5, 3, -6), P(3, 3, 1, '#6fb4e8', 5, 3, -6), P(2, 4, 2, '#7a3d2a', 4, 9, 2)]);
def('village', 'house', 'House', 2.5, 0.35, 25, [P(16, 6, 14, 'T'), P(16.4, 6, 14.4, 'T', 0, 6, 0), P(18, 1, 16, '#9b3d2e', 0, 12, 0), P(14, 1, 14, '#9b3d2e', 0, 13, 0), P(10, 1, 12, '#9b3d2e', 0, 14, 0), P(6, 1, 10, '#9b3d2e', 0, 15, 0), P(3, 5, 1, '#5a3d22', 0, 0, -7.2), P(3, 3, 1, GLASS, -5, 2, -7.2), P(3, 3, 1, GLASS, 5, 2, -7.2), P(3, 3, 1, GLASS, -5, 8, -7.4), P(3, 3, 1, GLASS, 0, 8, -7.4), P(3, 3, 1, GLASS, 5, 8, -7.4), P(2, 5, 2, '#7a3d2a', 5, 12, 3)], { tints: ['#e8dcc0', '#d9a87a', '#c8d8e0'] });
def('village', 'barn', 'Barn', 3.2, 0.15, 40, [P(20, 12, 16, '#b8332b'), P(22, 1, 18, DWOOD, 0, 12, 0), P(18, 1, 16, DWOOD, 0, 13, 0), P(14, 1, 14, DWOOD, 0, 14, 0), P(8, 1, 12, DWOOD, 0, 15, 0), P(8, 8, 1, WHITE, 0, 0, -8.2), P(6, 6, 1, '#7a1f1a', 0, 0, -8.5)]);
def('village', 'windmill', 'Windmill', 2.6, 0.1, 80, [P(10, 6, 10, '#e8dcc0'), P(8, 6, 8, '#e8dcc0', 0, 6, 0), P(6, 6, 6, '#e8dcc0', 0, 12, 0), P(8, 2, 8, ROOF, 0, 18, 0), P(14, 1, 1, WHITE, 0, 16, -4), P(1, 14, 1, WHITE, 0, 9, -4.5), P(2, 2, 2, DWOOD, 0, 15.5, -3.6)]);
def('village', 'church', 'Church', 3.5, 0.08, 150, [P(14, 10, 24, '#e8e2d4', 0, 0, 4), P(16, 1, 26, '#6a5a6a', 0, 10, 4), P(12, 1, 26, '#6a5a6a', 0, 11, 4), P(8, 1, 26, '#6a5a6a', 0, 12, 4), P(8, 18, 8, '#e8e2d4', 0, 0, -9), P(6, 3, 6, '#6a5a6a', 0, 18, -9), P(4, 3, 4, '#6a5a6a', 0, 21, -9), P(2, 4, 2, '#6a5a6a', 0, 24, -9), P(4, 6, 1, '#4a3a2a', 0, 0, -13.2)]);
// -- forest
def('forest', 'mushroom', 'Mushroom', 0.09, 10, 0, [P(2, 3, 2, '#f2ede0'), P(5, 2, 5, '#d6443c', 0, 3, 0), P(3, 1, 3, '#d6443c', 0, 5, 0), P(1, 0.4, 1, '#ffffff', 1, 5, 0.5), P(1, 0.4, 1, '#ffffff', -1, 5, -0.5)]);
def('forest', 'fern', 'Fern', 0.14, 8, 0, [P(1, 2, 1, '#2f6a3a'), P(5, 1, 1, '#3f8a46', 0, 2, 0), P(1, 1, 5, '#3f8a46', 0, 2, 0), P(3, 1, 3, '#4f9a52', 0, 3, 0)]);
def('forest', 'stump', 'Stump', 0.22, 2.5, 0, [P(5, 3, 5, '#7a5a3a'), P(4, 1, 4, '#c8a06a', 0, 3, 0)]);
def('forest', 'rock', 'Rock', 0.3, 3, 0, [P(6, 3, 5, '#8a8f9a'), P(4, 2, 4, '#9aa0ab', 0, 3, 0), P(2, 1, 2, '#a8aeb8', 0, 5, 0)]);
def('forest', 'log', 'Log', 0.4, 1.5, 0, [P(10, 3, 3, '#7a5a3a'), P(0.5, 2.4, 2.4, '#c8a06a', -5, 0.3, 0), P(0.5, 2.4, 2.4, '#c8a06a', 5, 0.3, 0)]);
def('forest', 'bush', 'Bush', 0.5, 3.5, 0, [P(7, 4, 7, '#2f7a3a'), P(5, 2, 5, '#3f9a46', 0, 4, 0), P(3, 1, 3, '#4fb04f', 0, 6, 0), P(1, 1, 1, '#d6443c', 3.2, 2, 1)]);
def('forest', 'squirrel', 'Squirrel', 0.1, 1.5, 0, [P(2, 2, 3, '#b8703c'), P(2, 2, 2, '#b8703c', 0, 2, -1.5), P(1, 4, 1, '#c8803c', 0, 1, 2.5), P(1, 1, 1, '#2a1a14', 0, 3, -2.5)], { walk: 0.5 });
def('forest', 'fox', 'Fox', 0.25, 0.6, 20, [P(3, 3, 6, '#d6702c', 0, 2, 0), P(3, 3, 3, '#d6702c', 0, 4, -4), P(1, 1, 1, '#d6702c', -1, 7, -4), P(1, 1, 1, '#d6702c', 1, 7, -4), P(2, 3, 4, '#d6702c', 0, 3, 5), P(2, 1, 2, '#ffffff', 0, 3, 7), P(1, 2, 1, '#2a2a33', -1, 0, -2), P(1, 2, 1, '#2a2a33', 1, 0, -2), P(1, 2, 1, '#2a2a33', -1, 0, 2), P(1, 2, 1, '#2a2a33', 1, 0, 2)], { walk: 0.7 });
def('forest', 'deer', 'Deer', 0.65, 0.6, 40, [P(4, 4, 8, '#a8703c', 0, 5, 0), P(3, 3, 3, '#a8703c', 0, 8, -5), P(1, 3, 1, '#e8dcc0', -1, 11, -5), P(1, 3, 1, '#e8dcc0', 1, 11, -5), P(1, 5, 1, '#8a5a2c', -1.2, 0, -3), P(1, 5, 1, '#8a5a2c', 1.2, 0, -3), P(1, 5, 1, '#8a5a2c', -1.2, 0, 3), P(1, 5, 1, '#8a5a2c', 1.2, 0, 3), P(2, 2, 1, '#f2ede0', 0, 7, 4.5)], { walk: 0.4 });
def('forest', 'pine', 'Pine Tree', 1.0, 2.0, 0, [P(2, 3, 2, '#6a4a2a'), P(9, 3, 9, '#2d6a3a', 0, 3, 0), P(7, 3, 7, '#35783f', 0, 6, 0), P(5, 3, 5, '#3f8a46', 0, 9, 0), P(3, 3, 3, '#4a9a50', 0, 12, 0), P(1, 2, 1, '#4a9a50', 0, 15, 0)]);
def('forest', 'boulder', 'Boulder', 1.3, 0.5, 40, [P(14, 5, 12, '#7a808c'), P(10, 4, 9, '#8a909c', 0, 5, 0), P(6, 3, 6, '#9aa0ab', 0, 9, 0)]);
def('forest', 'oak', 'Oak Tree', 1.7, 1.0, 20, [P(4, 8, 4, '#6a4a2a'), P(14, 5, 14, '#3f8a3a', 0, 8, 0), P(10, 4, 10, '#4aa046', 0, 13, 0), P(6, 2, 6, '#58b452', 0, 17, 0)]);
def('forest', 'cabin', 'Log Cabin', 2.2, 0.12, 120, [P(14, 7, 12, WOOD), P(16, 1, 14, DWOOD, 0, 7, 0), P(12, 1, 12, DWOOD, 0, 8, 0), P(8, 1, 10, DWOOD, 0, 9, 0), P(4, 1, 8, DWOOD, 0, 10, 0), P(3, 5, 1, '#3a2414', 0, 0, -6.2), P(3, 3, 1, '#8fd0f0', 4, 2, -6.2), P(2, 6, 2, STONE, 4, 7, 2)]);
def('forest', 'giantoak', 'Giant Oak', 3.2, 0.25, 150, [P(6, 14, 6, '#6a4a2a'), P(22, 6, 22, '#2f7a36', 0, 14, 0), P(16, 5, 16, '#3f9a46', 0, 20, 0), P(10, 4, 10, '#52b050', 0, 25, 0)]);
def('forest', 'redwood', 'Redwood', 4.8, 0.1, 300, [P(6, 30, 6, '#7a4a2a'), P(20, 4, 20, '#2a6a38', 0, 26, 0), P(16, 4, 16, '#2e723c', 0, 30, 0), P(12, 4, 12, '#347c42', 0, 34, 0), P(8, 4, 8, '#3a8648', 0, 38, 0), P(4, 4, 4, '#429050', 0, 42, 0)]);
// -- city
def('city', 'pigeon', 'Pigeon', 0.08, 4, 0, [P(3, 2, 4, '#8a93a3'), P(2, 2, 2, '#6a7383', 0, 2, -2), P(1, 1, 1, '#f2a33a', 0, 2, -3.5), P(2, 1, 2, '#6a7383', 0, 2, 2.5)], { walk: 0.35 });
def('city', 'cone', 'Traffic Cone', 0.1, 9, 0, [P(4, 1, 4, '#e86a1c'), P(3, 2, 3, '#ff7a2a', 0, 1, 0), P(1, 2, 1, '#ff7a2a', 0, 3, 0), P(3, 0.5, 3, '#f4f4f4', 0, 2, 0)]);
def('city', 'hydrant', 'Hydrant', 0.12, 4.5, 0, [P(3, 4, 3, '#d6443c'), P(4, 1, 4, '#b8332b', 0, 4, 0), P(1, 2, 5, '#d6443c', 0, 2, 0)]);
def('city', 'bin', 'Wheelie Bin', 0.14, 4.5, 0, [P(4, 5, 4, '#4a6a5a'), P(5, 1, 5, '#3a5448', 0, 5, 0)]);
def('city', 'lamp', 'Street Lamp', 0.2, 3.5, 0, [P(1, 14, 1, '#4a4f5c'), P(4, 1, 1, '#4a4f5c', -1.5, 13, 0), P(3, 1, 2, '#fff2a8', -3, 12, 0)]);
def('city', 'phonebox', 'Phone Box', 0.3, 0.6, 0, [P(4, 9, 4, '#d6443c'), P(3, 4, 4.2, GLASS, 0, 3, 0), P(4.2, 4, 3, GLASS, 0, 3, 0)]);
def('city', 'citybench', 'Park Bench', 0.4, 1.2, 0, [P(8, 1, 3, '#7a6a52', 0, 2, 0), P(8, 3, 1, '#7a6a52', 0, 3, -1), P(1, 2, 3, '#3a3f4d', -3, 0, 0), P(1, 2, 3, '#3a3f4d', 3, 0, 0)]);
def('city', 'busstop', 'Bus Stop', 0.8, 0.5, 0, [P(8, 1, 4, '#3d6fd1', 0, 7, 0), P(1, 7, 1, '#4a4f5c', -3.5, 0, 0), P(1, 7, 1, '#4a4f5c', 3.5, 0, 0), P(6, 1, 2, '#7a5a3a', 0, 2, 0), P(8, 5, 0.5, GLASS, 0, 2, -1.8)]);
def('city', 'car', 'Car', 0.9, 1.1, 0, [P(8, 3, 16, 'T', 0, 2, 0), P(7, 3, 8, '#cfe8f5', 0, 5, 0.5), P(7, 0.5, 8, 'T', 0, 8, 0.5), P(1, 3, 3, DARK, -4, 0, -5), P(1, 3, 3, DARK, 4, 0, -5), P(1, 3, 3, DARK, -4, 0, 5), P(1, 3, 3, DARK, 4, 0, 5)], { on: 'road', tints: ['#d6443c', '#3d6fd1', '#e8b023', '#f2f2f2', '#3f9a5a'] });
def('city', 'van', 'Van', 1.05, 0.35, 60, [P(8, 6, 16, '#f2f2f2', 0, 2, 0), P(8, 3, 4, GLASS, 0, 5, -6.2), P(8, 1, 16, '#3d6fd1', 0, 5, 0.3), P(1, 3, 3, DARK, -4, 0, -5), P(1, 3, 3, DARK, 4, 0, -5), P(1, 3, 3, DARK, -4, 0, 5), P(1, 3, 3, DARK, 4, 0, 5)], { on: 'road' });
def('city', 'bus', 'Bus', 1.5, 0.3, 90, [P(9, 8, 28, '#e8b023', 0, 2, 0), P(9.3, 3, 25, GLASS, 0, 6, 0.5), P(1, 4, 4, DARK, -4.5, 0, -8), P(1, 4, 4, DARK, 4.5, 0, -8), P(1, 4, 4, DARK, -4.5, 0, 8), P(1, 4, 4, DARK, 4.5, 0, 8)], { on: 'road' });
def('city', 'shop', 'Shop', 2.3, 0.45, 40, [P(18, 10, 14, 'T'), P(19, 1, 15, '#6a6f7c', 0, 10, 0), P(18, 1, 4, '#d6443c', 0, 6, -9), P(5, 5, 1, '#3a3f4d', 0, 0, -7.2), P(4, 3, 1, GLASS, -6, 2, -7.2), P(4, 3, 1, GLASS, 6, 2, -7.2)], { on: 'block', tints: ['#c9a27a', '#a8c0d8', '#d89a9a'] });
def('city', 'flats', 'Block of Flats', 3.0, 0.3, 120, [P(20, 24, 16, '#b9806a'), ...rows(20, 16, 3, 5, 4, GLASS), P(21, 1, 17, '#5a5f6c', 0, 24, 0)], { on: 'block' });
def('city', 'office', 'Office', 4.0, 0.2, 220, [P(22, 40, 22, '#7f9bb5'), ...rows(22, 22, 3, 5, 7, GLASS, 2), P(23, 1, 23, '#4a5266', 0, 40, 0)], { on: 'block' });
def('city', 'tower', 'Tower', 5.2, 0.12, 400, [P(24, 70, 24, '#8c93a8'), ...rows(24, 24, 4, 6, 11, GLASS, 2), P(14, 16, 14, '#7a8198', 0, 70, 0), P(1, 10, 1, '#d0d4de', 0, 86, 0)], { on: 'block' });
def('city', 'skyscraper', 'Skyscraper', 6.0, 0.08, 600, [P(26, 110, 26, '#5b7fa8'), ...rows(26, 26, 4, 6, 17, GLASS, 2), P(18, 12, 18, '#4f6f98', 0, 110, 0), P(10, 10, 10, '#456690', 0, 122, 0), P(2, 14, 2, '#d6443c', 0, 132, 0)], { on: 'block' });

TYPES.sort((a, b) => b.b - a.b);                                  // biggest first: they are placed first, the small fill the gaps
TYPES.forEach((t, i) => { t.i = i; });
const BIGGEST = TYPES[0].b;
const byId = id => TYPES.find(t => t.id === id);

const MODELS = new Map();
function model(ty) {                                              // { parts: [cx, cy, cz, sx, sy, sz, colour], b, h } in metres at the starting size
  const t = typeof ty === 'number' ? TYPES[ty] : ty;
  let m = MODELS.get(t.i);
  if (m) return m;
  let rad = 0, top = 0;
  for (const [w, h, d, , x, y, z] of t.parts) { rad = Math.max(rad, Math.hypot(Math.abs(x) + w / 2, Math.abs(z) + d / 2)); top = Math.max(top, y + h); }
  const k = t.b / rad;
  m = { parts: t.parts.map(([w, h, d, c, x, y, z]) => [x * k, (y + h / 2) * k, z * k, w * k, h * k, d * k, c]), b: t.b, h: top * k };
  MODELS.set(t.i, m);
  return m;
}

// ------------------------------------------------------------------ making a cell
// The map is cut into square cells, each ring with its own cell size, and every cell is made from the seed alone, so a
// cell is the same each time it is made. A thing belongs to the cell its centre is in, and stays wholly inside it.
// cull: leave out things smaller than this radius (they would be specks next to the hole).
function genCell(t, i, j, cull = 0) {
  const C = cellSize(t), x0 = i * C, z0 = j * C, [dA, dB] = tierRange(t), f2 = Math.pow(2, t);
  const objs = [];
  let maxR = 0;
  for (const ty of TYPES) {
    if (ty.b * f2 * 2 * 1.2 < cull) continue;
    const rnd = rng(hash(SEED, t, i, j, ty.i + 1));
    const want = ty.lam / 100 * C0 * C0;                          // tries in this cell at the start's density
    let n = Math.floor(want); if (rnd() < want - n) n++;
    for (let a = 0; a < n; a++) {
      let x = x0 + rnd() * C, z = z0 + rnd() * C;
      const d = Math.hypot(x, z), q = rnd(), q2 = rnd(), q3 = rnd(), q4 = rnd();
      if (d < dA || d >= dB || d < SPAWN_CLEAR || d < ty.from) continue;
      const S = scaleAt(d);
      if (q > (f2 / S) * (f2 / S)) continue;                      // thinner further out: constant share of the ground covered
      if (biomeAt(x, z) !== ty.biome) continue;
      const s = S * (0.85 + 0.35 * q2), r = ty.b * s;
      if (r < cull || r > C * 0.49) continue;
      x = Math.min(Math.max(x, x0 + r), x0 + C - r); z = Math.min(Math.max(z, z0 + r), z0 + C - r);
      let yaw = q3 * Math.PI * 2;
      if (ty.on !== 'any') {
        const g = grid(x, z);
        if (ty.on === 'block') {
          const ru = r / g.mu, rv = r / g.mv;
          if (ru > 0.42 || rv > 0.42 || g.fu < ROADW + ru || g.fu > 1 - ru || g.fv < ROADW + rv || g.fv > 1 - rv) continue;
        } else {
          const onU = g.fu < ROADW * 0.8, onV = g.fv < ROADW * 0.8;
          if (!onU && !onV) continue;
          const alongU = onU && (!onV || q4 < 0.5);
          let dx, dz;                                             // which way the street runs here
          if (alongU) { const th = (Math.floor(g.u) / ROADS - 0.5) * 2 * Math.PI; dx = Math.cos(th); dz = Math.sin(th); }
          else { const ph = Math.atan2(z, x); dx = -Math.sin(ph); dz = Math.cos(ph); }
          yaw = Math.atan2(-dx, -dz) + (q3 < 0.5 ? 0 : Math.PI);   // models face -z
        }
      }
      let clash = false;
      for (const o of objs) { const ex = o.x - x, ez = o.z - z, rr = (o.r + r) * 0.85; if (ex * ex + ez * ez < rr * rr) { clash = true; break; } }
      if (clash) continue;
      objs.push({ x, z, ty: ty.i, s, r, h: model(ty).h * s, yaw, br: 0.88 + 0.22 * q4, state: 0, slot: -1 });
      if (r > maxR) maxR = r;
    }
  }
  return { t, i, j, x0, z0, C, objs, maxR, key: t + ':' + i + ':' + j };
}

// ------------------------------------------------------------------ the cells wanted round a point
// All the cells of every ring that reach within R of (px, pz). Nearest first. A ring whose biggest thing would be
// smaller than cull has nothing worth making, so it is left out.
const distToZero = (a, b) => (a <= 0 && b >= 0) ? 0 : Math.min(Math.abs(a), Math.abs(b));
function wantedCells(px, pz, R, cull = 0, maxCells = 1200) {
  const dp = Math.hypot(px, pz), out = [];
  const t0 = tierOf(Math.max(0, dp - R)), t1 = tierOf(dp + R);
  for (let t = t0; t <= t1; t++) {
    if (BIGGEST * Math.pow(2, t + 1) * 1.2 < cull) continue;
    const C = cellSize(t), [dA, dB] = tierRange(t);
    const i0 = Math.floor((px - R) / C), i1 = Math.floor((px + R) / C), j0 = Math.floor((pz - R) / C), j1 = Math.floor((pz + R) / C);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 6000) continue;           // far too many small cells: a hole this much bigger than the ring sees only dust there
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const xa = i * C, xb = xa + C, za = j * C, zb = za + C;
      const nx = Math.min(Math.max(px, xa), xb), nz = Math.min(Math.max(pz, za), zb);
      const dist = Math.hypot(nx - px, nz - pz);
      if (dist > R) continue;
      const near = Math.hypot(distToZero(xa, xb), distToZero(za, zb));
      const far = Math.hypot(Math.max(Math.abs(xa), Math.abs(xb)), Math.max(Math.abs(za), Math.abs(zb)));
      if (far < dA || near >= dB) continue;
      out.push({ t, i, j, dist });
    }
  }
  out.sort((a, b) => a.dist - b.dist);
  return out.length > maxCells ? out.slice(0, maxCells) : out;
}

// ------------------------------------------------------------------ words
function fmtLen(m) {                                              // a length for the screen, in metric
  if (m < 1) return Math.round(m * 100) + ' cm';
  if (m < 10) return m.toFixed(1) + ' m';
  if (m < 1000) return Math.round(m) + ' m';
  if (m < 10000) return (m / 1000).toFixed(2) + ' km';
  return Math.round(m / 1000).toLocaleString('en-GB') + ' km';
}

return {
  D0, R0, MAXLV, REACH, CURVE, C0, EAT_MAX, SPAWN_CLEAR, MAXXP, CUM,
  scaleAt, tierOf, tierRange, cellSize, setSeed, getSeed, hash, rng,
  need, progress, radiusAt, xpFor, canEat, swallowDist,
  BIOMES, biomeAt, grid, groundColour, ROADW, polar,
  TYPES, BIGGEST, byId, model, genCell, wantedCells, fmtLen,
};
})();
if (typeof module !== 'undefined') module.exports = WORLD;

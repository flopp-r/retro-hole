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
const setSeed = s => { SEED = s | 0; INFO.clear(); };
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
const need = L => 0.14 * Math.pow(1 + L / 25, 1.1);               // xp to get from level L to L + 1
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

// ------------------------------------------------------------------ things (voxel models)
// A model is boxes on a coarse grid, built in grid units and then scaled so that the circle round its footprint has
// the natural radius b (metres at the start; everything is multiplied by the local scale where it stands). Models face
// -z (a door, a nose), and their width is along x.
// P(width, height, depth, colour, x, y, z): a box standing on height y, centred on x and z. Colour 'T' takes the
// variant's colour. from: how far out (m) before it appears. walk: how fast it wanders, in metres a second at the
// starting size (animals); 0 stands still. Where a thing stands, and how many, is decided by the layouts below.
const P = (w, h, d, c, x = 0, y = 0, z = 0) => [w, h, d, c, x, y, z];
const TYPES = [];
function def(biome, id, name, b, from, parts, o = {}) {
  const tints = o.tints || [null];
  tints.forEach((tc, n) => TYPES.push({
    biome, id: o.tints ? id + n : id, kind: id, name, b, from, walk: o.walk || 0,
    parts: parts.map(p => p[3] === 'T' ? [p[0], p[1], p[2], tc, p[4], p[5], p[6]] : p),
  }));
}
const WOOD = '#8a5a30', DWOOD = '#5a3d22', WHITE = '#f4f1ea', DARK = '#2a2a33', GLASS = '#9fd8ff', ROOF = '#a8472f', STONE = '#8a8f9a';
const rows = (w, d, y0, step, n, col, h = 1.2) => Array.from({ length: n }, (_, k) => P(w + 0.3, h, d + 0.3, col, 0, y0 + k * step, 0));
// -- village: small things to eat from the first step, bigger ones in sight at the start (a cow, a pig, a shed, houses)
// that come within reach a few levels at a time, and animals that wander about
def('village', 'flower', 'Flower', 0.08, 0, [P(1, 4, 1, '#3f9a3c'), P(3, 1, 3, 'T', 0, 4, 0), P(1, 1, 1, '#ffd34d', 0, 5, 0)], { tints: ['#ff5d7a', '#ffd34d', '#f4f4f4', '#9a6bff'] });
def('village', 'gnome', 'Garden Gnome', 0.1, 0, [P(3, 3, 3, '#3d6fd1'), P(3, 2, 3, '#f0c8a0', 0, 3, 0), P(3, 3, 3, '#d6443c', 0, 5, 0), P(3, 1, 1, '#ffffff', 0, 3, -1.5)]);
def('village', 'rabbit', 'Rabbit', 0.12, 0, [P(3, 3, 4, '#c9b8a0'), P(2, 2, 2, '#c9b8a0', 0, 3, -2), P(1, 3, 1, '#c9b8a0', -0.7, 5, -2), P(1, 3, 1, '#c9b8a0', 0.7, 5, -2), P(1, 1, 1, '#ffffff', 0, 2, 2.5)], { walk: 0.7 });
def('village', 'duck', 'Duck', 0.13, 0, [P(3, 2, 4, '#f2d34a'), P(2, 2, 2, '#f2d34a', 0, 2, -2), P(1, 1, 1, '#f2863a', 0, 2, -3.5), P(1, 1, 1, '#f2d34a', 0, 2, 2.5)], { walk: 0.25 });
def('village', 'bucket', 'Bucket', 0.14, 0, [P(4, 3, 4, '#8a93a3'), P(2, 1, 2, '#3a3f4d', 0, 3, 0)]);
def('village', 'chicken', 'Chicken', 0.16, 0, [P(3, 3, 4, WHITE), P(2, 2, 2, WHITE, 0, 3, -2), P(1, 1, 1, '#f2a33a', 0, 3, -3.5), P(1, 1, 1, '#d6443c', 0, 5, -2), P(1, 2, 1, WHITE, 0, 3, 2.5)], { walk: 0.35 });
def('village', 'mailbox', 'Postbox', 0.12, 0, [P(1, 5, 1, '#7a5a3a'), P(3, 2, 4, '#3d6fd1', 0, 5, 0)]);
def('village', 'cat', 'Cat', 0.15, 0, [P(2, 3, 5, '#e8a24a'), P(3, 3, 3, '#e8a24a', 0, 3, -3), P(1, 1, 1, '#e8a24a', -1, 6, -3), P(1, 1, 1, '#e8a24a', 1, 6, -3), P(1, 4, 1, '#e8a24a', 0, 3, 3)], { walk: 0.5 });
def('village', 'crate', 'Crate', 0.2, 0, [P(4, 4, 4, '#a8803c'), P(4.2, 0.6, 4.2, '#6a4a22', 0, 1.7, 0)]);
def('village', 'barrel', 'Barrel', 0.22, 0, [P(4, 5, 4, '#7a5a3a'), P(4.4, 0.6, 4.4, '#3a3f4d', 0, 1, 0), P(4.4, 0.6, 4.4, '#3a3f4d', 0, 3.8, 0)]);
def('village', 'dog', 'Dog', 0.28, 0, [P(3, 3, 6, '#a87a4a', 0, 2, 0), P(3, 3, 3, '#a87a4a', 0, 4, -4), P(1, 2, 1, '#7a5230', -1.5, 4, -4), P(1, 2, 1, '#7a5230', 1.5, 4, -4), P(1, 3, 1, '#a87a4a', 0, 4, 3.5), P(1, 2, 1, '#7a5230', -1, 0, -2), P(1, 2, 1, '#7a5230', 1, 0, -2), P(1, 2, 1, '#7a5230', -1, 0, 2), P(1, 2, 1, '#7a5230', 1, 0, 2)], { walk: 0.7 });
def('village', 'haybale', 'Hay Bale', 0.3, 0, [P(6, 4, 4, '#e1c35a'), P(1, 4, 5, '#b8963a', -2, 0, 0), P(1, 4, 5, '#b8963a', 2, 0, 0)]);
def('village', 'wheelbarrow', 'Wheelbarrow', 0.3, 0, [P(4, 2, 6, '#3f9a5a', 0, 2, 0), P(1, 1, 5, '#7a5a3a', -1.5, 1, 3), P(1, 1, 5, '#7a5a3a', 1.5, 1, 3), P(1, 3, 3, DARK, 0, 0, -3), P(1, 3, 1, '#7a5a3a', -1.5, 0, 5), P(1, 3, 1, '#7a5a3a', 1.5, 0, 5)]);
def('village', 'fence', 'Fence', 0.35, 0, [P(1, 4, 1, '#c8a06a', -3, 0, 0), P(1, 4, 1, '#c8a06a', 3, 0, 0), P(7, 1, 0.6, '#c8a06a', 0, 1, 0), P(7, 1, 0.6, '#c8a06a', 0, 3, 0)]);
def('village', 'bench', 'Bench', 0.4, 0, [P(8, 1, 3, '#9a6b3d', 0, 2, 0), P(8, 3, 1, '#9a6b3d', 0, 3, -1), P(1, 2, 3, DWOOD, -3, 0, 0), P(1, 2, 3, DWOOD, 3, 0, 0)]);
def('village', 'scarecrow', 'Scarecrow', 0.28, 0, [P(1, 9, 1, '#7a5a3a'), P(7, 1, 1, '#7a5a3a', 0, 6, 0), P(3, 4, 2, '#3d6fd1', 0, 4, 0), P(3, 3, 3, '#e3c27a', 0, 8, 0), P(5, 1, 5, DWOOD, 0, 11, 0), P(3, 2, 3, DWOOD, 0, 12, 0)]);
def('village', 'doghouse', 'Kennel', 0.4, 0, [P(6, 4, 6, '#c8553d'), P(8, 1, 8, '#6b3a28', 0, 4, 0), P(6, 1, 6, '#6b3a28', 0, 5, 0), P(2, 2, 1, '#2a1a14', 0, 0, -3)]);
def('village', 'hedge', 'Hedge', 0.5, 0, [P(8, 4, 3, '#2f7a3a'), P(6, 1, 2, '#3f9a46', 0, 4, 0)]);
def('village', 'sheep', 'Sheep', 0.45, 0, [P(5, 4, 7, '#f3f1ea', 0, 2, 0), P(3, 3, 3, '#3a3a44', 0, 3, -5), P(1, 2, 1, '#3a3a44', -1.5, 0, -2.5), P(1, 2, 1, '#3a3a44', 1.5, 0, -2.5), P(1, 2, 1, '#3a3a44', -1.5, 0, 2.5), P(1, 2, 1, '#3a3a44', 1.5, 0, 2.5)], { walk: 0.25 });
def('village', 'pig', 'Pig', 0.5, 0, [P(5, 4, 8, '#f0a8b0', 0, 2, 0), P(4, 4, 3, '#f0a8b0', 0, 3, -5.5), P(2, 2, 1, '#e08890', 0, 3, -7.5), P(1.5, 2, 1.5, '#e08890', -1.5, 0, -2.5), P(1.5, 2, 1.5, '#e08890', 1.5, 0, -2.5), P(1.5, 2, 1.5, '#e08890', -1.5, 0, 2.5), P(1.5, 2, 1.5, '#e08890', 1.5, 0, 2.5), P(1, 1, 1, '#e08890', 0, 5, 4.5)], { walk: 0.3 });
def('village', 'cow', 'Cow', 0.7, 0, [P(6, 5, 10, WHITE, 0, 3, 0), P(3, 0.4, 4, DARK, 1, 8, -1), P(2, 0.4, 3, DARK, -1.5, 8, 2.5), P(4, 4, 4, WHITE, 0, 5, -7), P(3, 2, 1, '#e9a0a0', 0, 5, -9.5), P(2, 3, 2, WHITE, -2, 0, -3.5), P(2, 3, 2, WHITE, 2, 0, -3.5), P(2, 3, 2, WHITE, -2, 0, 3.5), P(2, 3, 2, WHITE, 2, 0, 3.5)], { walk: 0.2 });
def('village', 'picnic', 'Picnic Table', 0.6, 5, [P(10, 1, 6, '#9a6b3d', 0, 4, 0), P(10, 1, 2, '#9a6b3d', 0, 2, -4), P(10, 1, 2, '#9a6b3d', 0, 2, 4), P(1, 4, 6, DWOOD, -4, 0, 0), P(1, 4, 6, DWOOD, 4, 0, 0)]);
def('village', 'well', 'Well', 0.6, 10, [P(8, 4, 8, STONE), P(6, 0.5, 6, '#3a6fd1', 0, 4, 0), P(1, 6, 1, '#7a5a3a', -3.5, 4, 0), P(1, 6, 1, '#7a5a3a', 3.5, 4, 0), P(10, 1, 6, '#9b3d2e', 0, 10, 0)]);
def('village', 'horse', 'Horse', 0.9, 20, [P(5, 6, 12, '#8a5a30', 0, 6, 0), P(3, 5, 4, '#8a5a30', 0, 10, -8), P(1, 5, 5, '#3a2414', 0, 10, -5), P(1.5, 6, 1.5, '#6a4a22', -1.5, 0, -4.5), P(1.5, 6, 1.5, '#6a4a22', 1.5, 0, -4.5), P(1.5, 6, 1.5, '#6a4a22', -1.5, 0, 4.5), P(1.5, 6, 1.5, '#6a4a22', 1.5, 0, 4.5), P(1, 5, 1, '#3a2414', 0, 6, 6.5)], { walk: 0.5 });
def('village', 'tractor', 'Tractor', 1.0, 25, [P(7, 5, 13, '#c8362e', 0, 3, 2), P(7, 6, 5, '#4a5666', 0, 8, -1), P(2, 6, 6, DARK, -5, 0, -3), P(2, 6, 6, DARK, 5, 0, -3), P(2, 4, 4, DARK, -4, 0, 6), P(2, 4, 4, DARK, 4, 0, 6)]);
def('village', 'appletree', 'Apple Tree', 1.0, 8, [P(2, 6, 2, '#6a4a2a'), P(9, 4, 9, '#3f9a46', 0, 6, 0), P(7, 3, 7, '#4aa84e', 0, 10, 0), P(1, 1, 1, '#d6443c', 3.6, 7, 1), P(1, 1, 1, '#d6443c', -3.6, 6.5, -1.5), P(1, 1, 1, '#d6443c', 1, 10, 3.4), P(1, 1, 1, '#d6443c', -1.5, 10.5, -3.4)]);
def('village', 'shed', 'Shed', 1.1, 12, [P(9, 6, 8, '#a8803c'), P(10, 1, 9, DWOOD, 0, 6, 0), P(8, 1, 7, DWOOD, 0, 7, 0), P(3, 4, 1, '#5a3d22', 0, 0, -4.2), P(2, 2, 1, '#8fd0f0', 3, 2, -4.2)]);
def('village', 'haystack', 'Haystack', 1.2, 8, [P(10, 3, 10, '#e1c35a'), P(8, 3, 8, '#e8cc62', 0, 3, 0), P(6, 3, 6, '#e1c35a', 0, 6, 0), P(3, 2, 3, '#d9b84e', 0, 9, 0)]);
def('village', 'silo', 'Silo', 1.4, 40, [P(10, 20, 10, '#b7bcc8'), P(12, 2, 12, '#8c93a3', 0, 20, 0), P(8, 2, 8, '#8c93a3', 0, 22, 0)]);
def('village', 'cottage', 'Cottage', 2.0, 10, [P(16, 8, 12, '#e8dcc0'), P(18, 1, 14, ROOF, 0, 8, 0), P(14, 1, 12, ROOF, 0, 9, 0), P(10, 1, 10, ROOF, 0, 10, 0), P(3, 5, 1, '#6b4a2a', 0, 0, -6), P(3, 3, 1, '#6fb4e8', -5, 3, -6), P(3, 3, 1, '#6fb4e8', 5, 3, -6), P(2, 4, 2, '#7a3d2a', 4, 9, 2)]);
def('village', 'house', 'House', 2.5, 25, [P(16, 6, 14, 'T'), P(16.4, 6, 14.4, 'T', 0, 6, 0), P(18, 1, 16, '#9b3d2e', 0, 12, 0), P(14, 1, 14, '#9b3d2e', 0, 13, 0), P(10, 1, 12, '#9b3d2e', 0, 14, 0), P(6, 1, 10, '#9b3d2e', 0, 15, 0), P(3, 5, 1, '#5a3d22', 0, 0, -7.2), P(3, 3, 1, GLASS, -5, 2, -7.2), P(3, 3, 1, GLASS, 5, 2, -7.2), P(3, 3, 1, GLASS, -5, 8, -7.4), P(3, 3, 1, GLASS, 0, 8, -7.4), P(3, 3, 1, GLASS, 5, 8, -7.4), P(2, 5, 2, '#7a3d2a', 5, 12, 3)], { tints: ['#e8dcc0', '#d9a87a', '#c8d8e0'] });
def('village', 'barn', 'Barn', 3.2, 40, [P(20, 12, 16, '#b8332b'), P(22, 1, 18, DWOOD, 0, 12, 0), P(18, 1, 16, DWOOD, 0, 13, 0), P(14, 1, 14, DWOOD, 0, 14, 0), P(8, 1, 12, DWOOD, 0, 15, 0), P(8, 8, 1, WHITE, 0, 0, -8.2), P(6, 6, 1, '#7a1f1a', 0, 0, -8.5)]);
def('village', 'windmill', 'Windmill', 2.6, 80, [P(10, 6, 10, '#e8dcc0'), P(8, 6, 8, '#e8dcc0', 0, 6, 0), P(6, 6, 6, '#e8dcc0', 0, 12, 0), P(8, 2, 8, ROOF, 0, 18, 0), P(14, 1, 1, WHITE, 0, 16, -4), P(1, 14, 1, WHITE, 0, 9, -4.5), P(2, 2, 2, DWOOD, 0, 15.5, -3.6)]);
def('village', 'church', 'Church', 3.5, 150, [P(14, 10, 24, '#e8e2d4', 0, 0, 4), P(16, 1, 26, '#6a5a6a', 0, 10, 4), P(12, 1, 26, '#6a5a6a', 0, 11, 4), P(8, 1, 26, '#6a5a6a', 0, 12, 4), P(8, 18, 8, '#e8e2d4', 0, 0, -9), P(6, 3, 6, '#6a5a6a', 0, 18, -9), P(4, 3, 4, '#6a5a6a', 0, 21, -9), P(2, 4, 2, '#6a5a6a', 0, 24, -9), P(4, 6, 1, '#4a3a2a', 0, 0, -13.2)]);
// -- forest
def('forest', 'mushroom', 'Mushroom', 0.09, 0, [P(2, 3, 2, '#f2ede0'), P(5, 2, 5, '#d6443c', 0, 3, 0), P(3, 1, 3, '#d6443c', 0, 5, 0), P(1, 0.4, 1, '#ffffff', 1, 5, 0.5), P(1, 0.4, 1, '#ffffff', -1, 5, -0.5)]);
def('forest', 'fern', 'Fern', 0.14, 0, [P(1, 2, 1, '#2f6a3a'), P(5, 1, 1, '#3f8a46', 0, 2, 0), P(1, 1, 5, '#3f8a46', 0, 2, 0), P(3, 1, 3, '#4f9a52', 0, 3, 0)]);
def('forest', 'stump', 'Stump', 0.22, 0, [P(5, 3, 5, '#7a5a3a'), P(4, 1, 4, '#c8a06a', 0, 3, 0)]);
def('forest', 'rock', 'Rock', 0.3, 0, [P(6, 3, 5, '#8a8f9a'), P(4, 2, 4, '#9aa0ab', 0, 3, 0), P(2, 1, 2, '#a8aeb8', 0, 5, 0)]);
def('forest', 'log', 'Log', 0.4, 0, [P(10, 3, 3, '#7a5a3a'), P(0.5, 2.4, 2.4, '#c8a06a', -5, 0.3, 0), P(0.5, 2.4, 2.4, '#c8a06a', 5, 0.3, 0)]);
def('forest', 'bush', 'Bush', 0.5, 0, [P(7, 4, 7, '#2f7a3a'), P(5, 2, 5, '#3f9a46', 0, 4, 0), P(3, 1, 3, '#4fb04f', 0, 6, 0), P(1, 1, 1, '#d6443c', 3.2, 2, 1)]);
def('forest', 'squirrel', 'Squirrel', 0.1, 0, [P(2, 2, 3, '#b8703c'), P(2, 2, 2, '#b8703c', 0, 2, -1.5), P(1, 4, 1, '#c8803c', 0, 1, 2.5), P(1, 1, 1, '#2a1a14', 0, 3, -2.5)], { walk: 0.5 });
def('forest', 'fox', 'Fox', 0.25, 20, [P(3, 3, 6, '#d6702c', 0, 2, 0), P(3, 3, 3, '#d6702c', 0, 4, -4), P(1, 1, 1, '#d6702c', -1, 7, -4), P(1, 1, 1, '#d6702c', 1, 7, -4), P(2, 3, 4, '#d6702c', 0, 3, 5), P(2, 1, 2, '#ffffff', 0, 3, 7), P(1, 2, 1, '#2a2a33', -1, 0, -2), P(1, 2, 1, '#2a2a33', 1, 0, -2), P(1, 2, 1, '#2a2a33', -1, 0, 2), P(1, 2, 1, '#2a2a33', 1, 0, 2)], { walk: 0.7 });
def('forest', 'deer', 'Deer', 0.65, 40, [P(4, 4, 8, '#a8703c', 0, 5, 0), P(3, 3, 3, '#a8703c', 0, 8, -5), P(1, 3, 1, '#e8dcc0', -1, 11, -5), P(1, 3, 1, '#e8dcc0', 1, 11, -5), P(1, 5, 1, '#8a5a2c', -1.2, 0, -3), P(1, 5, 1, '#8a5a2c', 1.2, 0, -3), P(1, 5, 1, '#8a5a2c', -1.2, 0, 3), P(1, 5, 1, '#8a5a2c', 1.2, 0, 3), P(2, 2, 1, '#f2ede0', 0, 7, 4.5)], { walk: 0.4 });
def('forest', 'pine', 'Pine Tree', 1.0, 0, [P(2, 3, 2, '#6a4a2a'), P(9, 3, 9, '#2d6a3a', 0, 3, 0), P(7, 3, 7, '#35783f', 0, 6, 0), P(5, 3, 5, '#3f8a46', 0, 9, 0), P(3, 3, 3, '#4a9a50', 0, 12, 0), P(1, 2, 1, '#4a9a50', 0, 15, 0)]);
def('forest', 'boulder', 'Boulder', 1.3, 40, [P(14, 5, 12, '#7a808c'), P(10, 4, 9, '#8a909c', 0, 5, 0), P(6, 3, 6, '#9aa0ab', 0, 9, 0)]);
def('forest', 'oak', 'Oak Tree', 1.7, 20, [P(4, 8, 4, '#6a4a2a'), P(14, 5, 14, '#3f8a3a', 0, 8, 0), P(10, 4, 10, '#4aa046', 0, 13, 0), P(6, 2, 6, '#58b452', 0, 17, 0)]);
def('forest', 'cabin', 'Log Cabin', 2.2, 120, [P(14, 7, 12, WOOD), P(16, 1, 14, DWOOD, 0, 7, 0), P(12, 1, 12, DWOOD, 0, 8, 0), P(8, 1, 10, DWOOD, 0, 9, 0), P(4, 1, 8, DWOOD, 0, 10, 0), P(3, 5, 1, '#3a2414', 0, 0, -6.2), P(3, 3, 1, '#8fd0f0', 4, 2, -6.2), P(2, 6, 2, STONE, 4, 7, 2)]);
def('forest', 'giantoak', 'Giant Oak', 3.2, 150, [P(6, 14, 6, '#6a4a2a'), P(22, 6, 22, '#2f7a36', 0, 14, 0), P(16, 5, 16, '#3f9a46', 0, 20, 0), P(10, 4, 10, '#52b050', 0, 25, 0)]);
def('forest', 'redwood', 'Redwood', 4.8, 300, [P(6, 30, 6, '#7a4a2a'), P(20, 4, 20, '#2a6a38', 0, 26, 0), P(16, 4, 16, '#2e723c', 0, 30, 0), P(12, 4, 12, '#347c42', 0, 34, 0), P(8, 4, 8, '#3a8648', 0, 38, 0), P(4, 4, 4, '#429050', 0, 42, 0)]);
// -- city
def('city', 'pigeon', 'Pigeon', 0.08, 0, [P(3, 2, 4, '#8a93a3'), P(2, 2, 2, '#6a7383', 0, 2, -2), P(1, 1, 1, '#f2a33a', 0, 2, -3.5), P(2, 1, 2, '#6a7383', 0, 2, 2.5)], { walk: 0.35 });
def('city', 'cone', 'Traffic Cone', 0.1, 0, [P(4, 1, 4, '#e86a1c'), P(3, 2, 3, '#ff7a2a', 0, 1, 0), P(1, 2, 1, '#ff7a2a', 0, 3, 0), P(3, 0.5, 3, '#f4f4f4', 0, 2, 0)]);
def('city', 'hydrant', 'Hydrant', 0.12, 0, [P(3, 4, 3, '#d6443c'), P(4, 1, 4, '#b8332b', 0, 4, 0), P(1, 2, 5, '#d6443c', 0, 2, 0)]);
def('city', 'bin', 'Wheelie Bin', 0.14, 0, [P(4, 5, 4, '#4a6a5a'), P(5, 1, 5, '#3a5448', 0, 5, 0)]);
def('city', 'lamp', 'Street Lamp', 0.2, 0, [P(1, 14, 1, '#4a4f5c'), P(4, 1, 1, '#4a4f5c', -1.5, 13, 0), P(3, 1, 2, '#fff2a8', -3, 12, 0)]);
def('city', 'phonebox', 'Phone Box', 0.3, 0, [P(4, 9, 4, '#d6443c'), P(3, 4, 4.2, GLASS, 0, 3, 0), P(4.2, 4, 3, GLASS, 0, 3, 0)]);
def('city', 'citybench', 'Park Bench', 0.4, 0, [P(8, 1, 3, '#7a6a52', 0, 2, 0), P(8, 3, 1, '#7a6a52', 0, 3, -1), P(1, 2, 3, '#3a3f4d', -3, 0, 0), P(1, 2, 3, '#3a3f4d', 3, 0, 0)]);
def('city', 'busstop', 'Bus Stop', 0.8, 0, [P(8, 1, 4, '#3d6fd1', 0, 7, 0), P(1, 7, 1, '#4a4f5c', -3.5, 0, 0), P(1, 7, 1, '#4a4f5c', 3.5, 0, 0), P(6, 1, 2, '#7a5a3a', 0, 2, 0), P(8, 5, 0.5, GLASS, 0, 2, -1.8)]);
def('city', 'car', 'Car', 0.9, 0, [P(8, 3, 16, 'T', 0, 2, 0), P(7, 3, 8, '#cfe8f5', 0, 5, 0.5), P(7, 0.5, 8, 'T', 0, 8, 0.5), P(1, 3, 3, DARK, -4, 0, -5), P(1, 3, 3, DARK, 4, 0, -5), P(1, 3, 3, DARK, -4, 0, 5), P(1, 3, 3, DARK, 4, 0, 5)], { tints: ['#d6443c', '#3d6fd1', '#e8b023', '#f2f2f2', '#3f9a5a'] });
def('city', 'van', 'Van', 1.05, 60, [P(8, 6, 16, '#f2f2f2', 0, 2, 0), P(8, 3, 4, GLASS, 0, 5, -6.2), P(8, 1, 16, '#3d6fd1', 0, 5, 0.3), P(1, 3, 3, DARK, -4, 0, -5), P(1, 3, 3, DARK, 4, 0, -5), P(1, 3, 3, DARK, -4, 0, 5), P(1, 3, 3, DARK, 4, 0, 5)]);
def('city', 'bus', 'Bus', 1.5, 90, [P(9, 8, 28, '#e8b023', 0, 2, 0), P(9.3, 3, 25, GLASS, 0, 6, 0.5), P(1, 4, 4, DARK, -4.5, 0, -8), P(1, 4, 4, DARK, 4.5, 0, -8), P(1, 4, 4, DARK, -4.5, 0, 8), P(1, 4, 4, DARK, 4.5, 0, 8)]);
def('city', 'shop', 'Shop', 2.3, 40, [P(18, 10, 14, 'T'), P(19, 1, 15, '#6a6f7c', 0, 10, 0), P(18, 1, 4, '#d6443c', 0, 6, -9), P(5, 5, 1, '#3a3f4d', 0, 0, -7.2), P(4, 3, 1, GLASS, -6, 2, -7.2), P(4, 3, 1, GLASS, 6, 2, -7.2)], { tints: ['#c9a27a', '#a8c0d8', '#d89a9a'] });
def('city', 'flats', 'Block of Flats', 3.0, 120, [P(20, 24, 16, '#b9806a'), ...rows(20, 16, 3, 5, 4, GLASS), P(21, 1, 17, '#5a5f6c', 0, 24, 0)]);
def('city', 'office', 'Office', 4.0, 220, [P(22, 40, 22, '#7f9bb5'), ...rows(22, 22, 3, 5, 7, GLASS, 2), P(23, 1, 23, '#4a5266', 0, 40, 0)]);
def('city', 'tower', 'Tower', 5.2, 400, [P(24, 70, 24, '#8c93a8'), ...rows(24, 24, 4, 6, 11, GLASS, 2), P(14, 16, 14, '#7a8198', 0, 70, 0), P(1, 10, 1, '#d0d4de', 0, 86, 0)]);
def('city', 'skyscraper', 'Skyscraper', 6.0, 840, [P(26, 110, 26, '#5b7fa8'), ...rows(26, 26, 4, 6, 17, GLASS, 2), P(18, 12, 18, '#4f6f98', 0, 110, 0), P(10, 10, 10, '#456690', 0, 122, 0), P(2, 14, 2, '#d6443c', 0, 132, 0)]);

// -- extra things that make the areas believable: terraces and street trees, fountains and traffic lights; reeds, a
// campfire and a woodpile
def('city', 'terrace', 'Terrace', 2.2, 40, [P(24, 8, 10, 'T'), P(24.6, 1, 12, '#5a4a4a', 0, 8, 0), P(22, 1, 10, '#5a4a4a', 0, 9, 0), P(3, 5, 1, '#3a2414', -8, 0, -5.2), P(3, 5, 1, '#3a2414', 0, 0, -5.2), P(3, 5, 1, '#3a2414', 8, 0, -5.2), P(3, 3, 1, GLASS, -8, 4, -5.2), P(3, 3, 1, GLASS, 0, 4, -5.2), P(3, 3, 1, GLASS, 8, 4, -5.2), P(2, 4, 2, '#7a3d2a', -4, 9, 2), P(2, 4, 2, '#7a3d2a', 4, 9, 2)], { tints: ['#b5654a', '#c08a5a', '#a8a0a0'] });
def('city', 'parktree', 'Park Tree', 0.6, 0, [P(2, 5, 2, '#6a4a2a'), P(8, 4, 8, '#3f9a46', 0, 5, 0), P(6, 3, 6, '#52b050', 0, 9, 0)]);
def('city', 'streettree', 'Street Tree', 0.45, 0, [P(1, 4, 1, '#6a4a2a'), P(5, 4, 5, '#3f9a46', 0, 4, 0), P(3, 2, 3, '#58b452', 0, 8, 0)]);
def('city', 'fountain', 'Fountain', 0.8, 0, [P(12, 2, 12, '#9aa0ab'), P(10, 0.5, 10, '#6fb4e8', 0, 2, 0), P(2, 5, 2, '#9aa0ab', 0, 2, 0), P(6, 1, 6, '#9aa0ab', 0, 7, 0), P(1, 2, 1, '#bfe4ff', 0, 8, 0)]);
def('city', 'trafficlight', 'Traffic Light', 0.15, 0, [P(1, 10, 1, '#3a3f4d'), P(2, 4, 2, '#1d1d24', 0, 10, 0), P(1, 1, 0.5, '#ff4a3a', 0, 13, -1.1), P(1, 1, 0.5, '#ffb23a', 0, 12, -1.1), P(1, 1, 0.5, '#5aff7a', 0, 11, -1.1)]);
def('forest', 'reed', 'Reeds', 0.1, 0, [P(1, 5, 1, '#8a9a3a'), P(1, 1, 1, '#6a4a2a', 0, 5, 0)]);
def('forest', 'campfire', 'Campfire', 0.2, 0, [P(5, 1, 5, '#8a8f9a'), P(4, 1, 1, '#6a4a2a', 0, 1, 0), P(1, 1, 4, '#6a4a2a', 0, 1, 0), P(2, 3, 2, '#ff8a2a', 0, 1, 0), P(1, 2, 1, '#ffd34d', 0, 3, 0)]);
def('forest', 'woodpile', 'Woodpile', 0.35, 0, [P(6, 3, 3, '#8a5a30'), P(6, 2, 3, '#7a4a22', 0, 3, 0), P(0.5, 2.6, 2.6, '#c8a06a', -3, 0.2, 0), P(0.5, 2.6, 2.6, '#c8a06a', 3, 0.2, 0)]);

TYPES.sort((a, b) => b.b - a.b);                                  // biggest first: they are placed first, the small fill the gaps
TYPES.forEach((t, i) => { t.i = i; });
const BIGGEST = TYPES[0].b;
const BYID = {};
for (const t of TYPES) BYID[t.id] = t;
const byId = id => TYPES.find(t => t.id === id);

const MODELS = new Map();
function model(ty) {                                              // { parts: [cx, cy, cz, sx, sy, sz, colour], b, h } in metres at the starting size
  const t = typeof ty === 'number' ? TYPES[ty] : ty;
  let m = MODELS.get(t.i);
  if (m) return m;
  let rad = 0, top = 0, hw = 0, hd = 0;
  for (const [w, h, d, , x, y, z] of t.parts) { rad = Math.max(rad, Math.hypot(Math.abs(x) + w / 2, Math.abs(z) + d / 2)); top = Math.max(top, y + h); hw = Math.max(hw, Math.abs(x) + w / 2); hd = Math.max(hd, Math.abs(z) + d / 2); }
  const k = t.b / rad;
  m = { parts: t.parts.map(([w, h, d, c, x, y, z]) => [x * k, (y + h / 2) * k, z * k, w * k, h * k, d * k, c]), b: t.b, h: top * k, hw: hw * k, hd: hd * k };   // hw, hd: half the width and depth of the footprint
  MODELS.set(t.i, m);
  return m;
}


// ------------------------------------------------------------------ areas, plots and roads: the framework every area follows
// The map is cut into square cells (32 m wide in ring 0, twice as wide in each next ring). Each cell is a PLOT of one
// area (village, forest or city) and of one kind within it (a farm, a clearing, a city block ...). Roads run along
// cell edges, so every plot knows which of its four sides has a road and how wide it is. Everything that stands in a
// plot is placed by that kind's layout, from the same few tools: things facing a road, fences round a garden, animals
// inside a pen, trees with plants at their feet, rows of buildings along a street. A thing only goes where it makes
// sense: cars on the roads, lamps and benches on the pavement, buildings in rows facing the street, chickens in
// the yard, ducks on the pond. To add an area: an entry in BIOMES, a plot kind chooser in plotKind(), its layouts in
// LAYOUTS, and its ground colours in groundColour(). The same function of the seed gives the same cell every time.
const TWO32 = 4294967296;
const SECTORS = 6, RINGS = 2.2;
const BIOMES = {
  village: { name: 'Village', road: 0.4, style: 'lane', prio: 1 },
  forest: { name: 'Forest', road: 0.15, style: 'trail', prio: 0 },
  city: { name: 'City', road: 1, style: 'street', prio: 2 },
};
// width of a road and of the pavement or verge each side of it, in units of the ring's scale (see cellInfo)
const STYLES = { street: { w: 3.2, verge: 0.9 }, lane: { w: 1.6, verge: 0.4 }, trail: { w: 0.8, verge: 0 } };
const vnoise = (u, v, K, seed) => {
  const iu = Math.floor(u), iv = Math.floor(v), fu = u - iu, fv = v - iv;
  const h = (a, b) => hash(seed, ((a % K) + K) % K, b) / TWO32;
  const su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv);
  const a = h(iu, iv), b = h(iu + 1, iv), c = h(iu, iv + 1), d = h(iu + 1, iv + 1);
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
};
function polar(x, z) {                                            // where a point is on the ring-and-sector map
  const d = Math.hypot(x, z), S = scaleAt(d);
  return { d, S, u: (Math.atan2(z, x) / (2 * Math.PI) + 0.5) * SECTORS, v: Math.log(S) * RINGS };
}
// Areas are patches on a map of rings and sectors, so a patch is as much bigger as it is far out and the pattern
// looks the same at every size. A cell takes the area at its middle. The start (within 70 m) is always a village.
function rawBiome(x, z) {
  const p = polar(x, z);
  if (p.d < 70) return 'village';
  const city = 0.65 * vnoise(p.u, p.v, SECTORS, SEED + 1) + 0.35 * vnoise(p.u * 2, p.v * 2, SECTORS * 2, SEED + 2);
  if (city > 0.6) return 'city';
  const forest = 0.65 * vnoise(p.u, p.v, SECTORS, SEED + 3) + 0.35 * vnoise(p.u * 2, p.v * 2, SECTORS * 2, SEED + 4);
  return forest > 0.5 ? 'forest' : 'village';
}
// the road on one cell edge: its style, or null. axis 0: the line x = k * C, between cells (k - 1, m) and (k, m);
// axis 1: the line z = k * C, between (m, k - 1) and (m, k). A line is a road along its whole length when its hash is
// under the road share of the busier area on either side, so streets run on through a city, a lane carries on into a
// forest as a trail, and a city meets a village where its streets end.
function edgeRoad(t, axis, k, m) {
  const C = cellSize(t), ci = axis ? [m, k - 1] : [k - 1, m], cj = axis ? [m, k] : [k, m];
  const a = rawBiome((ci[0] + 0.5) * C, (ci[1] + 0.5) * C), b = rawBiome((cj[0] + 0.5) * C, (cj[1] + 0.5) * C);
  const mx = axis ? (m + 0.5) * C : k * C, mz = axis ? k * C : (m + 0.5) * C;
  if (Math.hypot(mx, mz) < 45) return null;                       // no road through the start
  const A = BIOMES[a], B = BIOMES[b];
  if (hash(SEED, t, axis, k, 5) / TWO32 >= Math.max(A.road, B.road)) return null;
  return (A.prio >= B.prio ? A : B).style;
}
// the four cells round the start are fixed, so there are houses, animals and a green in sight from the first step
const START_PLOTS = { '0:0': 'pasture', '-1:0': 'homestead', '0:-1': 'green', '-1:-1': 'homestead' };
function plotKind(c) {
  if (c.t === 0 && START_PLOTS[c.i + ':' + c.j]) return START_PLOTS[c.i + ':' + c.j];
  const h = hash(SEED, c.t, c.i, c.j, 7) / TWO32, d = Math.hypot(c.cx, c.cz);
  const choose = list => { let tot = 0; for (const e of list) tot += e[1]; let a = h * tot; for (const e of list) if ((a -= e[1]) < 0) return e[0]; return list[list.length - 1][0]; };
  if (c.biome === 'city') return choose([['built', 70], ['park', 14], ['plaza', 6], ['lot', 10]]);
  if (c.biome === 'forest') return d < 200 ? choose([['dense', 28], ['mixed', 40], ['clearing', 14], ['rocky', 10], ['pond', 8]]) : choose([['dense', 25], ['mixed', 28], ['clearing', 12], ['rocky', 10], ['pond', 7], ['grove', 18]]);
  if (d < 60) return choose([['homestead', 30], ['pasture', 22], ['meadow', 16], ['orchard', 14], ['green', 10], ['pond', 8]]);
  return choose([['homestead', 24], ['farm', 14], ['pasture', 14], ['field', 16], ['orchard', 9], ['green', 7], ['pond', 7], ['meadow', 9]]);
}
const INFO = new Map();
function cellInfo(t, i, j) {                                      // everything about one cell that ground and layout both need
  const key = t + ':' + i + ':' + j;
  let c = INFO.get(key);
  if (c) return c;
  const C = cellSize(t), f = Math.pow(2, t), x0 = i * C, z0 = j * C;
  c = { t, i, j, C, f, TS: 1.5 * f, x0, z0, x1: x0 + C, z1: z0 + C, cx: x0 + C / 2, cz: z0 + C / 2, key };
  c.biome = rawBiome(c.cx, c.cz);
  c.road = { w: edgeRoad(t, 0, i, j), e: edgeRoad(t, 0, i + 1, j), n: edgeRoad(t, 1, j, i), s: edgeRoad(t, 1, j + 1, i) };
  c.kind = plotKind(c);
  // how far in from each side the plot proper begins: the road and its verge, or a small gap with no road
  const mg = sd => c.road[sd] ? (STYLES[c.road[sd]].w / 2 + STYLES[c.road[sd]].verge) * c.TS : 0.04 * C;
  c.mg = { w: mg('w'), e: mg('e'), n: mg('n'), s: mg('s') };
  c.inner = { x0: x0 + c.mg.w, x1: c.x1 - c.mg.e, z0: z0 + c.mg.n, z1: c.z1 - c.mg.s };
  if (c.kind === 'pond') {
    const o = (hash(SEED, t, i, j, 11) / TWO32 - 0.5) * 0.2 * C, o2 = (hash(SEED, t, i, j, 12) / TWO32 - 0.5) * 0.2 * C;
    c.pond = { x: c.cx + o, z: c.cz + o2, r: 0.27 * C };
  }
  if (INFO.size > 6000) INFO.clear();
  INFO.set(key, c);
  return c;
}
function cellAt(x, z) { const t = tierOf(Math.hypot(x, z)), C = cellSize(t); return cellInfo(t, Math.floor(x / C), Math.floor(z / C)); }
const biomeAt = (x, z) => cellAt(x, z).biome;

// ------------------------------------------------------------------ the ground
const PAL = {
  village: { grass: ['#6fae4a', '#79b952', '#67a547'], pasture: ['#80c05a', '#78b852', '#88c862'], lane: ['#b89a68', '#aa8c5c'], verge: ['#86c25e', '#7cb856'], crops: [['#bdb458', '#a9b856'], ['#9ab04a', '#86a040'], ['#d4a050', '#c08c40']] },
  forest: { moss: ['#3d7a38', '#36702f', '#44843f'], clearing: ['#5a9a46', '#52903e'], rocky: ['#6a7a60', '#62725a'], grove: ['#2f6a30', '#2a6029'], trail: ['#7a5a3a', '#6e5032'] },
  city: { paving: ['#8c8e9e', '#9496a6', '#85879a'], road: ['#3a3c49', '#41434f'], pavement: ['#b2b4c2', '#a8aaba'], park: ['#5fa84a', '#58a044'], plaza: ['#c8c4b8', '#beb9ac'], lot: ['#4a4c58', '#50525e'] },
  water: ['#3a78c8', '#4486d4'], sand: ['#d8c98a', '#cfc080'],
};
function groundColour(x, z, tx, tz) {                             // the colour of one ground tile, as [r, g, b] from 0 to 1
  const c = cellAt(x, z), h = hash(tx, tz, 77), P_ = PAL[c.biome], pick = arr => arr[h % arr.length];
  let hex = null;
  // roads and their verges, from each side that has one
  for (const sd of ['w', 'e', 'n', 's']) {
    const st = c.road[sd]; if (!st) continue;
    const S = STYLES[st], dist = sd === 'w' ? x - c.x0 : sd === 'e' ? c.x1 - x : sd === 'n' ? z - c.z0 : c.z1 - z;
    if (dist < S.w / 2 * c.TS) { hex = pick(st === 'street' ? PAL.city.road : st === 'lane' ? PAL.village.lane : PAL.forest.trail); break; }
    if (dist < (S.w / 2 + S.verge) * c.TS && !hex) hex = pick(st === 'street' ? PAL.city.pavement : PAL.village.verge);
  }
  if (!hex) {
    const k = c.kind;
    if (c.pond) { const q = Math.hypot(x - c.pond.x, z - c.pond.z); if (q < c.pond.r) hex = pick(PAL.water); else if (q < c.pond.r * 1.16) hex = pick(PAL.sand); }
    if (!hex) {
      if (c.biome === 'village') hex = k === 'field' ? PAL.village.crops[hash(SEED, c.t, c.i, c.j, 13) % 3][(hash(SEED, c.t, c.i, c.j, 14) & 1 ? tx : tz) & 1] : k === 'pasture' || k === 'green' || k === 'orchard' ? pick(PAL.village.pasture) : pick(PAL.village.grass);
      else if (c.biome === 'forest') hex = pick(k === 'clearing' ? PAL.forest.clearing : k === 'rocky' ? PAL.forest.rocky : k === 'grove' ? PAL.forest.grove : PAL.forest.moss);
      else hex = pick(k === 'park' ? PAL.city.park : k === 'plaza' ? PAL.city.plaza : k === 'lot' ? PAL.city.lot : PAL.city.paving);
    }
  }
  const n = parseInt(hex.slice(1), 16), j = 0.94 + 0.12 * ((h >>> 8) & 255) / 255;
  return [((n >> 16) & 255) / 255 * j, ((n >> 8) & 255) / 255 * j, (n & 255) / 255 * j];
}

// ------------------------------------------------------------------ the tools every layout uses
const LAYOUTS = { city: {}, village: {}, forest: {} };
const DENSITY = 1.8;                                              // how thickly everything is scattered (the counts in the layouts are multiplied by this)
const yawOf = (dx, dz) => Math.atan2(-dx, -dz);                   // models face -z, so this turns a model to face (dx, dz)
const FACE = { w: [-1, 0], e: [1, 0], n: [0, -1], s: [0, 1] };    // from a plot towards the road on that side
const INWARD = { w: [1, 0], e: [-1, 0], n: [0, 1], s: [0, -1] };
const LANE = { w: [0, 1], e: [0, -1], n: [-1, 0], s: [1, 0] };    // the way traffic goes in the lane inside each side (drive on the left)
function makeCtx(c, cull) {
  const rnd = rng(hash(SEED, c.t, c.i, c.j, 99)), objs = [], d = Math.hypot(c.cx, c.cz), Sc = scaleAt(d);
  let calls = 0;
  const ctx = { c, rnd, objs, cull, d, Sc, f: c.f, TS: c.TS, inner: c.inner };
  const avail = (ids, dd) => ids.filter(id => BYID[id].from <= dd);
  // pick one of ids that is far enough out to appear here
  ctx.pick = (ids, rn = rnd, dd = d) => { const a = avail(ids, dd); return a.length ? a[Math.floor(rn() * a.length)] : null; };
  // put one thing down: size by where it stands (or o.s), turned to o.yaw (or at random). null if it does not fit: it
  // must be wholly inside the plot (o.out: or on its road, for lamps, cars and the like), not on the start, not in a
  // pond (o.water: ducks and reeds), and not overlap anything already down. Things smaller than cull
  // are kept as ghosts, so the choices are the same however much is left out.
  ctx.add = (id, x, z, o = {}, rn = rnd) => {
    const q1 = rn(), q2 = rn(), q3 = rn(), ty = BYID[id];
    if (!ty) throw new Error('no such thing: ' + id);
    const dd = Math.hypot(x, z);
    if (dd < ty.from || tierOf(dd) !== c.t) return null;
    const m = model(ty), yaw = o.yaw !== undefined ? o.yaw : q2 * Math.PI * 2;
    let s = o.s !== undefined ? o.s : scaleAt(dd) * (0.85 + 0.35 * q1);
    if (o.maxW !== undefined && 2 * m.hw * s > o.maxW) { s = o.maxW / (2 * m.hw); if (s < 0.6 * scaleAt(dd)) return null; }
    const cs = Math.abs(Math.cos(yaw)), sn = Math.abs(Math.sin(yaw)), ex = (m.hw * cs + m.hd * sn) * s, ez = (m.hw * sn + m.hd * cs) * s, r = ty.b * s;
    if (x - ex < c.x0 || x + ex > c.x1 || z - ez < c.z0 || z + ez > c.z1 || dd - r < SPAWN_CLEAR) return null;
    const ci = c.inner;
    if (!o.out && (x - ex < ci.x0 - 1e-6 || x + ex > ci.x1 + 1e-6 || z - ez < ci.z0 - 1e-6 || z + ez > ci.z1 + 1e-6)) return null;   // on the road or its verge
    if (c.pond && !o.water && Math.hypot(x - c.pond.x, z - c.pond.z) < c.pond.r * 1.05 + Math.max(ex, ez) * 0.5) return null;       // in the water
    for (const a of objs) if (Math.abs(a.x - x) < (a.ex + ex) * 0.9 && Math.abs(a.z - z) < (a.ez + ez) * 0.9) return null;
    const ob = { x, z, ty: ty.i, s, r, h: m.h * s, yaw, ex, ez, br: 0.88 + 0.22 * q3, state: 0, slot: -1, ghost: r < cull };
    if (o.pen) ob.pen = o.pen;
    objs.push(ob);
    return ob;
  };
  // tries to put n of ids (one chosen each time) at random places in rect; the count is per 100 m2 at the start's scale
  ctx.scatter = (ids, per100, rect, o = {}) => {
    ids = Array.isArray(ids) ? ids : [ids];
    const rn = rng(hash(SEED, c.t, c.i, c.j, 1000 + (calls++)));
    const area = Math.max(0, rect.x1 - rect.x0) * Math.max(0, rect.z1 - rect.z0), want = per100 * DENSITY / 100 * area / (Sc * Sc);
    const n = Math.floor(want + rn());
    for (let k = 0; k < n; k++) {
      const x = rect.x0 + rn() * (rect.x1 - rect.x0), z = rect.z0 + rn() * (rect.z1 - rect.z0), id = ctx.pick(ids, rn);
      if (id) ctx.add(id, x, z, o, rn);
    }
  };
  // n of ids evenly round a circle
  ctx.ring = (ids, cx, cz, rad, n, o = {}) => {
    for (let k = 0; k < n; k++) { const a = (k + 0.5) / n * Math.PI * 2 + (o.turn || 0), id = ctx.pick(Array.isArray(ids) ? ids : [ids]); if (id) ctx.add(id, cx + Math.cos(a) * rad, cz + Math.sin(a) * rad, { ...o, yaw: o.facing ? yawOf(-Math.cos(a), -Math.sin(a)) : o.yaw }); }
  };
  // a row of fence round a rectangle, with a gap (gate) in one side: gate { side, at, w }
  ctx.fence = (r, gate) => {
    const s = Sc, m = model(BYID.fence), seg = 2 * m.hw * s * 0.98;
    for (const [sd, a0, a1, fix] of [['n', r.x0, r.x1, r.z0], ['s', r.x0, r.x1, r.z1], ['w', r.z0, r.z1, r.x0], ['e', r.z0, r.z1, r.x1]]) {
      const n = Math.max(1, Math.floor((a1 - a0) / seg)), step = (a1 - a0) / n;
      for (let k = 0; k < n; k++) {
        const a = a0 + step * (k + 0.5);
        if (gate && sd === gate.side && Math.abs(a - gate.at) < gate.w / 2) continue;
        if (sd === 'n' || sd === 's') ctx.add('fence', a, fix, { yaw: 0, s }); else ctx.add('fence', fix, a, { yaw: Math.PI / 2, s });
      }
    }
  };
  // a plot's own frame, with the front on side sd: u along the front (0 to 1), v inward (0 at the front to 1 at the back)
  ctx.frame = sd => {
    const r = c.inner, horiz = sd === 'n' || sd === 's', W = horiz ? r.x1 - r.x0 : r.z1 - r.z0, D = horiz ? r.z1 - r.z0 : r.x1 - r.x0;
    const at = (u, v) => sd === 'n' ? [r.x0 + u * W, r.z0 + v * D] : sd === 's' ? [r.x0 + u * W, r.z1 - v * D] : sd === 'w' ? [r.x0 + v * D, r.z0 + u * W] : [r.x1 - v * D, r.z0 + u * W];
    const rect = (u0, v0, u1, v1) => { const p = at(u0, v0), q = at(u1, v1); return { x0: Math.min(p[0], q[0]), x1: Math.max(p[0], q[0]), z0: Math.min(p[1], q[1]), z1: Math.max(p[1], q[1]) }; };
    return { W, D, at, rect, yaw: yawOf(...FACE[sd]), face: FACE[sd], sd };
  };
  // the side a plot faces: one with a road if it has one, else south (towards the camera)
  ctx.front = () => { const roads = ['s', 'e', 'w', 'n'].filter(sd => c.road[sd]); return roads.length ? roads[Math.floor(hash(SEED, c.t, c.i, c.j, 21) / TWO32 * roads.length)] : 's'; };
  return ctx;
}
const rectOf = o => ({ x0: o.x - o.ex, x1: o.x + o.ex, z0: o.z - o.ez, z1: o.z + o.ez });
const grow = (r, a) => ({ x0: r.x0 - a, x1: r.x1 + a, z0: r.z0 - a, z1: r.z1 + a });
const shrink = (r, a) => ({ x0: r.x0 + a, x1: r.x1 - a, z0: r.z0 + a, z1: r.z1 - a });
const within = (r, c) => ({ x0: Math.max(r.x0, c.x0), x1: Math.min(r.x1, c.x1), z0: Math.max(r.z0, c.z0), z1: Math.min(r.z1, c.z1) });
const FLOWERS = ['flower0', 'flower1', 'flower2', 'flower3'];

// ------------------------------------------------------------------ the city: streets, pavements, blocks
// Streets run along every cell edge. Each plot is a block with a pavement all round: lamps and street trees and bins
// and benches on the pavement, a traffic light at each corner, cars in the lanes (on the left, as in Britain),
// then buildings in a row on every side, all facing the street, with a courtyard behind them. A block is built up,
// a park, a plaza or a car park. Built blocks are low (shops, terraces) near the start and get taller further out.
const CLASSES = [['shop0', 'shop1', 'shop2', 'terrace0', 'terrace1', 'terrace2'], ['flats', 'office'], ['tower', 'skyscraper']];
function pavementSide(ctx, sd) {                                  // the pavement strip along one side of a block
  const c = ctx.c, S = STYLES.street, wd = S.w * ctx.TS, pv = S.verge * ctx.TS, ins = INWARD[sd], r = c.inner;
  const horiz = sd === 'n' || sd === 's', a0 = horiz ? r.x0 : r.z0, a1 = horiz ? r.x1 : r.z1;
  const border = sd === 'w' ? c.x0 : sd === 'e' ? c.x1 : sd === 'n' ? c.z0 : c.z1;
  const at = (a, off) => horiz ? [a, border + ins[1] * off] : [border + ins[0] * off, a];   // off: distance in from the road's middle line
  return { a0, a1, at, wd, pv, face: FACE[sd], lane: LANE[sd] };
}
function cityStreets(ctx) {
  const c = ctx.c, rnd = ctx.rnd, TS = ctx.TS;
  for (const sd of ['w', 'e', 'n', 's']) {
    if (c.road[sd] !== 'street') continue;
    const g = pavementSide(ctx, sd), mid = g.wd / 2 + g.pv * 0.5, yaw = yawOf(...g.face);
    for (let a = g.a0 + 2 * TS; a < g.a1 - TS; a += 5.5 * TS * (0.85 + 0.3 * rnd())) { const p = g.at(a, mid); ctx.add('lamp', p[0], p[1], { yaw, s: ctx.Sc, out: true }); }
    for (let a = g.a0 + 3.5 * TS; a < g.a1 - TS; a += 3.6 * TS) {
      if (rnd() > 0.55) continue;
      const id = ctx.pick(['streettree', 'streettree', 'streettree', 'bin', 'bin', 'hydrant', 'citybench', 'citybench', 'phonebox', 'busstop'], rnd), p = g.at(a + (rnd() - 0.5) * TS, mid);
      if (id) ctx.add(id, p[0], p[1], { yaw: id === 'streettree' ? undefined : yaw, out: true });
    }
    // traffic in the lane on this side
    const lane = g.at(0, g.wd / 4), len = g.a1 - g.a0, lanes = Math.max(0, Math.round(len / (9 * TS) * (0.5 + rnd() * 0.7)));
    for (let k = 0; k < lanes; k++) {
      const a = g.a0 + (k + 0.15 + 0.7 * rnd()) / Math.max(lanes, 1) * len, p = g.at(a, g.wd / 4), q = rnd();
      ctx.add(ctx.pick(q < 0.7 ? ['car0', 'car1', 'car2', 'car3', 'car4'] : q < 0.85 ? ['van'] : ['bus'], rnd) || 'car0', p[0], p[1], { yaw: yawOf(...g.lane), maxW: g.wd / 2 * 0.8, out: true });
    }
    void lane;
  }
  // a traffic light at each corner where two streets cross
  for (const [a, b, xs, zs] of [['w', 'n', 1, 1], ['e', 'n', -1, 1], ['w', 's', 1, -1], ['e', 's', -1, -1]]) {
    if (c.road[a] !== 'street' || c.road[b] !== 'street') continue;
    const x = (xs > 0 ? c.x0 : c.x1) + xs * (STYLES.street.w / 2 + STYLES.street.verge * 0.35) * TS, z = (zs > 0 ? c.z0 : c.z1) + zs * (STYLES.street.w / 2 + STYLES.street.verge * 0.35) * TS;
    ctx.add('trafficlight', x, z, { s: ctx.Sc, yaw: yawOf(-xs, -zs), out: true });
  }
}
// a row of buildings along one side of the block, facing the street; returns how deep they are
function frontage(ctx, sd, list, from, to) {
  const c = ctx.c, r = c.inner, rnd = ctx.rnd, sb = 0.25 * ctx.TS, fc = FACE[sd], yaw = yawOf(...fc);
  let cur = from + 0.2 * ctx.TS * rnd(), depth = 0;
  for (let guard = 0; guard < 40 && cur < to - 2 * ctx.TS; guard++) {
    const id = ctx.pick(list, rnd, ctx.d);
    if (!id) break;
    const m = model(BYID[id]), s0 = ctx.Sc * (0.9 + 0.3 * rnd());
    const width = 2 * m.hw * Math.min(s0, (to - cur) / (2 * m.hw)), sUse = Math.min(s0, (to - cur) / (2 * m.hw));
    if (sUse < 0.6 * ctx.Sc) break;
    const dep = 2 * m.hd * sUse, a = cur + width / 2;
    const [x, z] = sd === 'n' ? [a, r.z0 + sb + dep / 2] : sd === 's' ? [a, r.z1 - sb - dep / 2] : sd === 'w' ? [r.x0 + sb + dep / 2, a] : [r.x1 - sb - dep / 2, a];
    const ob = ctx.add(id, x, z, { s: sUse, yaw });
    if (ob) depth = Math.max(depth, dep + sb);
    cur += width + 0.06 * width * rnd();
  }
  return depth;
}
LAYOUTS.city.built = ctx => {
  const c = ctx.c, r = c.inner, h = hash(SEED, c.t, c.i, c.j, 8) / TWO32;
  let k = h < 0.42 ? 0 : h < 0.82 ? 1 : 2;
  while (k > 0 && !CLASSES[k].some(id => BYID[id].from <= ctx.d)) k--;
  const list = CLASSES[k];
  cityStreets(ctx);
  const dN = frontage(ctx, 'n', list, r.x0, r.x1), dS = frontage(ctx, 's', list, r.x0, r.x1);
  const dW = frontage(ctx, 'w', list, r.z0 + dN, r.z1 - dS), dE = frontage(ctx, 'e', list, r.z0 + dN, r.z1 - dS);
  const yard = { x0: r.x0 + dW + 0.4 * ctx.TS, x1: r.x1 - dE - 0.4 * ctx.TS, z0: r.z0 + dN + 0.4 * ctx.TS, z1: r.z1 - dS - 0.4 * ctx.TS };
  if (yard.x1 - yard.x0 > 2 * ctx.TS && yard.z1 - yard.z0 > 2 * ctx.TS) {   // the courtyard: trees, benches, bins, pigeons
    ctx.scatter('streettree', 4, yard); ctx.scatter('citybench', 1.2, yard); ctx.scatter('bin', 2, yard); ctx.scatter('pigeon', 3, yard); ctx.scatter('hydrant', 0.6, yard);
  }
};
LAYOUTS.city.park = ctx => {
  const c = ctx.c, r = shrink(c.inner, 0.3 * ctx.TS), mx = (r.x0 + r.x1) / 2, mz = (r.z0 + r.z1) / 2;
  cityStreets(ctx);
  if (ctx.rnd() < 0.6) ctx.add('fountain', mx, mz, { s: ctx.Sc * 1.1 });
  ctx.scatter('parktree', 3.2, r); ctx.scatter('streettree', 2, r); ctx.scatter('citybench', 1.2, r); ctx.scatter('lamp', 0.8, r);
  ctx.scatter(FLOWERS, 7, r); ctx.scatter('pigeon', 3, r); ctx.scatter('rabbit', 0.5, r);
};
LAYOUTS.city.plaza = ctx => {
  const c = ctx.c, r = shrink(c.inner, 0.3 * ctx.TS), mx = (r.x0 + r.x1) / 2, mz = (r.z0 + r.z1) / 2, rad = Math.min(r.x1 - r.x0, r.z1 - r.z0) * 0.32;
  cityStreets(ctx);
  ctx.add('fountain', mx, mz, { s: ctx.Sc * 1.3 });
  ctx.ring('citybench', mx, mz, rad, 8, { facing: true, s: ctx.Sc });
  ctx.ring('lamp', mx, mz, rad * 1.5, 4, { turn: Math.PI / 4, s: ctx.Sc });
  ctx.scatter('streettree', 1.2, r); ctx.scatter('pigeon', 7, r); ctx.scatter('bin', 1, r);
};
LAYOUTS.city.lot = ctx => {                                       // a car park: rows of cars either side of an aisle
  const c = ctx.c, r = shrink(c.inner, 0.3 * ctx.TS), m = model(BYID.car0), s = ctx.Sc, len = 2 * m.hd * s * 1.12, wid = 2 * m.hw * s * 1.25;
  cityStreets(ctx);
  const rows = Math.floor((r.z1 - r.z0) / wid), cols = Math.floor((r.x1 - r.x0) / len);
  for (let a = 0; a < rows; a++) {
    if (a % 3 === 2) continue;                                    // an aisle after every two rows
    for (let b = 0; b < cols; b++) if (ctx.rnd() < 0.65) ctx.add(ctx.pick(['car0', 'car1', 'car2', 'car3', 'car4']), r.x0 + (b + 0.5) * len, r.z0 + (a + 0.5) * wid, { yaw: a % 3 === 0 ? Math.PI / 2 : -Math.PI / 2, s });
  }
  ctx.scatter('cone', 1.5, r); ctx.scatter('bin', 0.5, r);
};

// ------------------------------------------------------------------ the village
// Lanes along some plot edges. A plot is a homestead (a house with a fenced garden, a postbox at the gate), a farm (barn,
// farmhouse, silo, a fenced paddock, hay, chickens in the yard), a pasture (a fenced field of animals), a field of
// crops with a scarecrow, an orchard in rows, a green with a well and benches, a pond with ducks, or a meadow. Houses
// face the lane. Flowers and rabbits are in every plot's grass.
function villageGrass(ctx, rect) { ctx.scatter(FLOWERS, 11, rect); ctx.scatter('rabbit', 1, rect); }
LAYOUTS.village.homestead = ctx => {
  const c = ctx.c, F = ctx.frame(ctx.front()), rnd = ctx.rnd, TS = ctx.TS;
  const id = ctx.pick(['house0', 'house1', 'house2', 'cottage', 'cottage'], rnd) || 'cottage', m = model(BYID[id]), s = ctx.Sc * 1.05;
  const dep = 2 * m.hd * s, wid = 2 * m.hw * s;
  const u = 0.32 + 0.36 * rnd(), p = F.at(u, 0), front = 0.14 * c.C, off = front + dep / 2;
  const hp = F.at(u, off / F.D);
  const house = ctx.add(id, hp[0], hp[1], { s, yaw: F.yaw });
  if (house) {
    const hr = rectOf(house), pad = 0.1 * c.C, fr = within(grow(hr, pad), c.inner);       // the garden fence
    const gate = { side: F.sd, at: F.sd === 'n' || F.sd === 's' ? house.x : house.z, w: 2.4 * ctx.Sc };
    ctx.fence(fr, gate);
    const g = shrink(fr, 0.4 * ctx.Sc), back = F.at(0.5, 0.95);
    const gp = F.sd === 'n' || F.sd === 's' ? [house.x, F.sd === 'n' ? fr.z0 - 0.7 * ctx.Sc : fr.z1 + 0.7 * ctx.Sc] : [F.sd === 'w' ? fr.x0 - 0.7 * ctx.Sc : fr.x1 + 0.7 * ctx.Sc, house.z];
    ctx.add('mailbox', gp[0] + (F.sd === 'n' || F.sd === 's' ? 2 * ctx.Sc : 0), gp[1] + (F.sd === 'w' || F.sd === 'e' ? 2 * ctx.Sc : 0), { s: ctx.Sc, yaw: F.yaw, out: true });
    if (rnd() < 0.55) { const sh = F.at(0.5, 0.86); ctx.add('shed', sh[0], sh[1], { s: ctx.Sc * 0.95, yaw: F.yaw }); }
    ctx.scatter('appletree', 0.8, g); ctx.scatter(['dog', 'cat', 'chicken'], 3, g, { pen: fr });
    ctx.scatter(['wheelbarrow', 'barrel', 'crate', 'bucket', 'bench'], 2.6, g); ctx.scatter('gnome', 2, g); ctx.scatter(FLOWERS, 26, g);
    void p; void back; void wid;
  }
  const out = c.inner; villageGrass(ctx, out); ctx.scatter(['hedge'], 1.2, out); ctx.scatter(['haybale'], 0.7, out); ctx.scatter(['sheep', 'chicken', 'duck'], 1.5, out);
};
LAYOUTS.village.farm = ctx => {
  const c = ctx.c, F = ctx.frame(ctx.front()), rnd = ctx.rnd;
  const barnP = F.at(0.28, 0.64), barn = ctx.add('barn', barnP[0], barnP[1], { s: ctx.Sc, yaw: F.yaw });
  const hp = F.at(0.74, 0.3), house = ctx.add(ctx.pick(['house0', 'house1', 'house2', 'cottage'], rnd) || 'cottage', hp[0], hp[1], { s: ctx.Sc * 1.05, yaw: F.yaw });
  const sp = F.at(0.9, 0.7); ctx.add('silo', sp[0], sp[1], { s: ctx.Sc });
  const pr = F.rect(0.08, 0.86, 0.6, 0.98);                       // a paddock behind the barn
  ctx.fence(pr, null);
  const pad = shrink(pr, 0.5 * ctx.Sc); ctx.scatter(['cow', 'horse', 'sheep', 'pig'], 6, pad, { pen: pr });
  const yard = F.rect(0.1, 0.3, 0.9, 0.9);
  if (barn) { const br = rectOf(barn), ring = grow(br, 0.9 * ctx.TS); ctx.scatter(['chicken', 'duck'], 22, within(ring, c.inner)); ctx.scatter(['barrel', 'crate', 'bucket', 'wheelbarrow', 'haybale'], 20, within(ring, c.inner)); }
  const tp = F.at(0.55, 0.45); ctx.add('tractor', tp[0], tp[1], { s: ctx.Sc, yaw: rnd() * 6.28 });
  ctx.scatter('haystack', 1.2, yard); ctx.scatter(['dog', 'cat'], 1.5, yard);
  if (ctx.d > 80 && rnd() < 0.3) { const wp = F.at(0.9, 0.12); ctx.add('windmill', wp[0], wp[1], { s: ctx.Sc }); }
  void house;
  villageGrass(ctx, c.inner);
};
LAYOUTS.village.pasture = ctx => {
  const c = ctx.c, F = ctx.frame(ctx.front()), rnd = ctx.rnd;
  const pr = within(shrink(c.inner, 0.05 * c.C), c.inner);
  ctx.fence(pr, { side: F.sd, at: (F.sd === 'n' || F.sd === 's' ? (pr.x0 + pr.x1) / 2 : (pr.z0 + pr.z1) / 2), w: 3 * ctx.Sc });
  const g = shrink(pr, 0.6 * ctx.Sc);
  if (rnd() < 0.5) { const sp = F.at(0.5, 0.8); ctx.add('shed', sp[0], sp[1], { s: ctx.Sc * 0.9, yaw: F.yaw }); }
  ctx.scatter(['cow', 'horse', 'sheep', 'pig'], 3.5, g, { pen: pr });
  ctx.scatter(['sheep', 'chicken'], 1.5, g, { pen: pr }); ctx.scatter(['haybale', 'haystack'], 0.9, g); ctx.scatter(FLOWERS, 7, g);
  ctx.scatter('hedge', 1.2, c.inner); ctx.scatter(FLOWERS, 8, c.inner);
};
LAYOUTS.village.field = ctx => {
  const c = ctx.c, r = c.inner, rnd = ctx.rnd;
  ctx.add('scarecrow', (r.x0 + r.x1) / 2 + (rnd() - 0.5) * 0.3 * c.C, (r.z0 + r.z1) / 2 + (rnd() - 0.5) * 0.3 * c.C, { s: ctx.Sc * 1.1 });
  ctx.scatter('tractor', 0.25, r); ctx.scatter('haystack', 0.5, r); ctx.scatter('haybale', 2.5, r); ctx.scatter(['crate', 'barrel'], 0.8, r);
  ctx.scatter('rabbit', 2.5, r); ctx.scatter('duck', 0.6, r); ctx.scatter(FLOWERS, 5, r);
};
LAYOUTS.village.orchard = ctx => {
  const c = ctx.c, r = shrink(c.inner, 0.06 * c.C), m = model(BYID.appletree), s = ctx.Sc * 1.0, pitch = 2 * m.hw * s * 1.45;
  const cols = Math.max(1, Math.floor((r.x1 - r.x0) / pitch)), rows = Math.max(1, Math.floor((r.z1 - r.z0) / pitch));
  for (let a = 0; a < cols; a++) for (let b = 0; b < rows; b++) ctx.add('appletree', r.x0 + (a + 0.5) * (r.x1 - r.x0) / cols, r.z0 + (b + 0.5) * (r.z1 - r.z0) / rows, { s, yaw: 0 });
  ctx.scatter('picnic', 0.5, r); ctx.scatter(['haybale', 'crate', 'barrel', 'bucket'], 3, r); ctx.scatter(['chicken', 'duck'], 1.5, r); ctx.scatter(FLOWERS, 9, r); ctx.scatter('rabbit', 1.5, r);
};
LAYOUTS.village.green = ctx => {
  const c = ctx.c, r = shrink(c.inner, 0.05 * c.C), mx = (r.x0 + r.x1) / 2, mz = (r.z0 + r.z1) / 2, rad = Math.min(r.x1 - r.x0, r.z1 - r.z0) * 0.3;
  if (ctx.d >= 150) { const F = ctx.frame(ctx.front()), cp = F.at(0.5, 0.82); ctx.add('church', cp[0], cp[1], { s: ctx.Sc, yaw: F.yaw }); }
  ctx.add('well', mx, mz, { s: ctx.Sc });
  ctx.ring('bench', mx, mz, rad, 6, { facing: true, s: ctx.Sc * 0.9 });
  ctx.ring('appletree', mx, mz, rad * 1.7, 6, { turn: 0.5, s: ctx.Sc });
  ctx.scatter('picnic', 0.5, r); ctx.scatter(['duck', 'chicken', 'cat', 'dog'], 2, r); ctx.scatter(['barrel', 'bucket', 'crate'], 0.8, r); ctx.scatter(FLOWERS, 12, r); ctx.scatter('rabbit', 1, r);
};
function pondLayout(ctx, plants) {                                // shared by village and forest: a pond with ducks, reeds and stones
  const c = ctx.c, p = c.pond, box = { x0: p.x - p.r, x1: p.x + p.r, z0: p.z - p.r, z1: p.z + p.r };
  ctx.ring('reed', p.x, p.z, p.r * 1.02, 22, { turn: 0.2, s: ctx.Sc, water: true }); ctx.ring('reed', p.x, p.z, p.r * 1.12, 16, { turn: 0.5, s: ctx.Sc, water: true });
  ctx.scatter('duck', 3.2, shrink(box, p.r * 0.25), { pen: box, water: true });
  ctx.ring(['rock', 'rock', 'bush'], p.x, p.z, p.r * 1.3, 8, { turn: 0.15 });
  plants(ctx, c.inner);
}
LAYOUTS.village.pond = ctx => pondLayout(ctx, (cx, r) => { cx.ring('bench', ctx.c.pond.x, ctx.c.pond.z, ctx.c.pond.r * 1.5, 2, { facing: true, s: ctx.Sc }); villageGrass(cx, r); cx.scatter(['sheep', 'chicken'], 1, r); });
LAYOUTS.village.meadow = ctx => { const r = ctx.c.inner; ctx.scatter(['bench', 'haybale', 'hedge'], 1.6, r); ctx.scatter(['sheep', 'chicken', 'duck', 'cat', 'dog'], 3, r); ctx.scatter(['bucket', 'crate', 'barrel', 'gnome', 'fence'], 3, r); villageGrass(ctx, r); };

// ------------------------------------------------------------------ the forest
// A plot is dense woodland, mixed woods, a clearing (a cabin with a campfire, logs round it, a woodpile, deer), rocky
// ground, a pond, or (far out) a grove of giant trees. Plants grow at the foot of the trees: ferns and mushrooms ring
// them, stumps and logs lie near, squirrels sit by them. Trails keep clear of trees.
function treeFeet(ctx, trees, per) {                              // plants and little animals round the trees just placed
  const rnd = ctx.rnd;
  for (const t of trees) {
    const n = Math.floor(per * rnd() + 0.5);
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.283, rr = t.r * (1.05 + 0.5 * rnd()), q = rnd();
      ctx.add(q < 0.4 ? 'fern' : q < 0.75 ? 'mushroom' : q < 0.88 ? 'stump' : q < 0.95 ? 'log' : 'squirrel', t.x + Math.cos(a) * rr, t.z + Math.sin(a) * rr);
    }
  }
}
function woods(ctx, pine, oak, extra) {
  const r = ctx.c.inner, before = ctx.objs.length;
  if (extra) for (const id of extra) ctx.scatter(id[0], id[1], r);
  ctx.scatter('oak', oak, r); ctx.scatter('pine', pine, r);
  treeFeet(ctx, ctx.objs.slice(before).filter(o => { const id = TYPES[o.ty].id; return id === 'pine' || id === 'oak' || id === 'giantoak' || id === 'redwood'; }), 1.1);
  ctx.scatter('bush', 3, r); ctx.scatter(['rock', 'log', 'stump'], 2, r); ctx.scatter(['fern', 'mushroom'], 5, r); ctx.scatter(['deer', 'fox'], 0.4, r); ctx.scatter('rabbit', 0.8, r);
}
LAYOUTS.forest.dense = ctx => woods(ctx, 10, 4, [['giantoak', 0.25]]);
LAYOUTS.forest.mixed = ctx => woods(ctx, 4, 2.5, [['giantoak', 0.15], ['boulder', 0.3]]);
LAYOUTS.forest.grove = ctx => woods(ctx, 2.5, 1.5, [['redwood', 0.8], ['giantoak', 0.8]]);
LAYOUTS.forest.rocky = ctx => { const r = ctx.c.inner; ctx.scatter('boulder', 1.6, r); ctx.scatter('pine', 2.5, r); ctx.scatter('rock', 5, r); ctx.scatter(['fern', 'mushroom', 'stump', 'log'], 4, r); ctx.scatter(['deer', 'fox'], 0.3, r); };
LAYOUTS.forest.clearing = ctx => {
  const c = ctx.c, r = c.inner, F = ctx.frame(ctx.front()), mx = (r.x0 + r.x1) / 2, mz = (r.z0 + r.z1) / 2, rnd = ctx.rnd;
  const cp = F.at(0.5, 0.7), cabin = ctx.add('cabin', cp[0], cp[1], { s: ctx.Sc, yaw: F.yaw });
  const fp = F.at(0.5, 0.3 + (cabin ? 0 : 0.1)); ctx.add('campfire', fp[0], fp[1], { s: ctx.Sc });
  ctx.ring('log', fp[0], fp[1], 2.2 * ctx.Sc, 4, { facing: true, s: ctx.Sc * 0.9 });
  const wp = F.at(0.82, 0.72); ctx.add('woodpile', wp[0], wp[1], { s: ctx.Sc, yaw: F.yaw });
  ctx.ring(['mushroom'], fp[0], fp[1], 3.4 * ctx.Sc, 7, { s: ctx.Sc });
  const rim = []; for (const q of [{ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z0 + 0.18 * c.C }, { x0: r.x0, x1: r.x1, z0: r.z1 - 0.18 * c.C, z1: r.z1 }, { x0: r.x0, x1: r.x0 + 0.18 * c.C, z0: r.z0, z1: r.z1 }, { x0: r.x1 - 0.18 * c.C, x1: r.x1, z0: r.z0, z1: r.z1 }]) rim.push(q);
  const before = ctx.objs.length;
  for (const q of rim) { ctx.scatter('oak', 4, q); ctx.scatter('pine', 8, q); }
  treeFeet(ctx, ctx.objs.slice(before).filter(o => { const id = TYPES[o.ty].id; return id === 'pine' || id === 'oak'; }), 1);
  ctx.scatter(['deer', 'fox', 'rabbit'], 1.2, r); ctx.scatter(['fern', 'mushroom', 'stump', 'rock'], 4, r); ctx.scatter('bush', 1.5, r);
  void mx; void mz; void rnd;
};
LAYOUTS.forest.pond = ctx => pondLayout(ctx, (cx, r) => { cx.scatter('oak', 1.5, r); cx.scatter('pine', 3.5, r); cx.scatter(['fern', 'mushroom', 'rock', 'log', 'stump'], 4, r); cx.scatter(['deer', 'rabbit'], 0.8, r); });

// ------------------------------------------------------------------ making a cell
// A cell is made from the seed alone, so it is the same each time it is made. cull: leave out things smaller than
// this radius (they would be specks next to the hole); the rest are exactly as they would be without it.
function genCell(t, i, j, cull = 0) {
  const c = cellInfo(t, i, j), ctx = makeCtx(c, cull);
  LAYOUTS[c.biome][c.kind](ctx);
  const objs = ctx.objs.filter(o => !o.ghost);
  let maxR = 0;
  for (const o of objs) if (o.r > maxR) maxR = o.r;
  return { t, i, j, x0: c.x0, z0: c.z0, C: c.C, objs, maxR, key: c.key, biome: c.biome, kind: c.kind };
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
  BIOMES, STYLES, FACE, LANE, yawOf, biomeAt, cellInfo, cellAt, groundColour, polar, LAYOUTS,
  TYPES, BIGGEST, BYID, byId, model, genCell, wantedCells, fmtLen,
};
})();
if (typeof module !== 'undefined') module.exports = WORLD;

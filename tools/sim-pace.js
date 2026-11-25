// How long does the climb take? For a hole of each level this looks at the food it would meet in an area the right size
// for it (found by making real map cells), and works out how long each level and the whole climb take if the player
// sweeps the ground steadily. It is an estimate of a steady, efficient player: real play has pauses, wrong turns and
// fights, so real times are longer. Run:  node tools/sim-pace.js [efficiency, default 0.6] [quick]
// With 'quick' it measures quick mode (one fixed scale, no level cap), where there is no 'right place' for a level: it
// samples map cells 300 to 1,500 m out in every area, and times every tenth level.
const W = require('../src/world.js');
const QUICKMODE = process.argv.includes('quick');
if (QUICKMODE) W.setMode('quick');
const eff = +process.argv[2] || 0.6, SPEED = 6.5;       // SPEED: hole radii per second (also in game.js)
const levels = [1, 5, 10, 25, 50, 75, 100, 150, 200, 300, 400, 500, 650, 800, 1000];
let cumMin = 0, last = 1;
const rows = [];
const timeForLevel = L => {                              // minutes to get from level L to L + 1
  const r = W.radiusAt(L, 0.5), S = QUICKMODE ? 1 : Math.max(1, r / W.R0), d = QUICKMODE ? 700 : W.D0 * (S - 1) + 20;
  const t = W.tierOf(d), C = W.cellSize(t);
  let area = 0, n = 0, xp = 0;
  for (const biome of Object.keys(W.BIOMES)) {   // up to 8 cells of each area at that ring
    let got = 0;
    for (let k = 0; k < 360 && got < 6; k++) {
      const ang = k * 0.0524 + 0.3, x = d * Math.cos(ang), z = d * Math.sin(ang);
      if (W.biomeAt(x, z) !== biome) continue;
      const c = W.genCell(t, Math.floor(x / C), Math.floor(z / C), r * 0.05);
      area += C * C; got++;
      for (const o of c.objs) if (W.canEat(o.r, r)) { n++; xp += W.xpFor(o.r, r); }
    }
  }
  const dens = n / Math.max(area, 1), perSec = dens * 2 * r * SPEED * r * eff, xpPerSec = (xp / Math.max(n, 1)) * perSec;
  return { min: W.need(L) / xpPerSec / 60, perSec, meanXp: xp / Math.max(n, 1), dens };
};
const out = [];
let tot = 0;
if (QUICKMODE) {                                         // no cap: time to reach each level, sampling every tenth level
  const marks = [1, 5, 10, 25, 50, 100, 200, 300, 500, 1000];
  let reached = {};
  for (let L = 1; L <= 1000; L += 10) {
    const a = timeForLevel(L), step = L === 1 ? 10 : 10;
    for (let k = 0; k < step; k++) { const lv = L + k; if (marks.includes(lv)) reached[lv] = { min: tot, r: W.radiusAt(lv, 0), perSec: a.perSec, meanXp: a.meanXp, minPerLevel: a.min }; tot += a.min; }
  }
  console.log('QUICK MODE   level  hole width   things/s  mean xp  min/level   minutes to get here   (efficiency ' + eff + ')');
  for (const m of marks) { const o = reached[m]; if (o) console.log(String(m).padStart(18), W.fmtLen(2 * o.r).padStart(10), o.perSec.toFixed(2).padStart(10), o.meanXp.toFixed(3).padStart(8), o.minPerLevel.toFixed(3).padStart(10), o.min.toFixed(1).padStart(14)); }
  process.exit(0);
}
for (let L = 1; L < W.MAXLV; L++) {
  const a = timeForLevel(L);
  tot += a.min;
  if (levels.includes(L)) out.push({ L, r: W.radiusAt(L, 0), width: 2 * W.radiusAt(L, 0), perSec: a.perSec, meanXp: a.meanXp, minPerLevel: a.min, hoursSoFar: tot / 60 });
}
console.log('level  hole width   things/s  mean xp  min/level  hours so far   (efficiency ' + eff + ')');
for (const o of out) console.log(String(o.L).padStart(5), W.fmtLen(o.width).padStart(10), o.perSec.toFixed(2).padStart(10), o.meanXp.toFixed(3).padStart(8), o.minPerLevel.toFixed(2).padStart(10), o.hoursSoFar.toFixed(2).padStart(13));
console.log('whole climb to level ' + W.MAXLV + ': about ' + tot.toFixed(0) + ' minutes (' + (tot / 60).toFixed(1) + ' hours)');

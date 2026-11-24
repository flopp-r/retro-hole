// Sound: with the volume up, eating, a level-up and a button start tones and nothing reaches the console; with the
// volume off nothing is started. (The tones themselves can only be judged by ear.)
const { launch, serve, watch, ok, ready, frames } = require('./lib.js');
(async () => {
  const site = await serve(), { b, newPage } = await launch();
  const run = async volume => {
    const p = await newPage({ viewport: { width: 480, height: 300 } }), log = []; watch(p, log);
    await p.addInitScript(v => { localStorage.setItem('retroHole.settings', JSON.stringify({ pixel: 4, levels: 8, volume: v })); window.__osc = 0; const o = AudioContext.prototype.createOscillator; AudioContext.prototype.createOscillator = function () { window.__osc++; return o.call(this); }; }, volume);
    await p.goto(site.url); await ready(p); await p.click('#bPlay'); await frames(p, 3);
    await p.evaluate(() => { __rh.setXp(__rh.W.CUM[2] - 0.001); const n = __rh.nearestEdible(); __rh.teleport(n.x, n.z); }); await frames(p, 30);
    const level = await p.evaluate(() => __rh.H.level), osc = await p.evaluate(() => window.__osc);
    await p.close();
    return { level, osc, log };
  };
  const loud = await run(1), mute = await run(0);
  ok(loud.level === 2 && loud.osc >= 5, 'eating and levelling up start tones when the volume is up (' + loud.osc + ')');
  ok(mute.level === 2 && mute.osc === 0, 'no tones start when the volume is off');
  ok(loud.log.length === 0 && mute.log.length === 0, 'the console stayed clean' + [...loud.log, ...mute.log].slice(0, 2).join(' | '));
  await b.close(); site.close();
})().catch(e => { console.error(e); process.exit(1); });

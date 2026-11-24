// Shared bits for the browser tests: Playwright, a small web server for the built game (so storage carries over
// reloads, as on GitHub Pages), and a check that nothing reaches the browser console.
const path = require('path'), os = require('os'), fs = require('fs'), http = require('http');

function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node-tools/node_modules/playwright'].filter(Boolean);
  for (const t of tries) { try { return require(t); } catch (e) {} }
  console.error('Playwright not found. Install it (npm install --no-save playwright), or set PLAYWRIGHT_MODULE to its folder.');
  process.exit(2);
}
const pw = loadPlaywright();
const ROOT = path.resolve(__dirname, '..', '..');
const WORK = process.env.RH_WORK || path.join(os.tmpdir(), 'retro-hole-browser-tests');
const shot = name => { const d = path.join(WORK, 'shots'); fs.mkdirSync(d, { recursive: true }); return path.join(d, name); };
const GL = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];   // software WebGL, as in a cloud session

// serves index.html at /retro-hole/ (like GitHub Pages) on a free port
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const f = path.join(ROOT, 'index.html');
      rsp.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); rsp.end(fs.readFileSync(f));
    });
    srv.listen(0, '127.0.0.1', () => res({ url: `http://127.0.0.1:${srv.address().port}/retro-hole/`, close: () => srv.close() }));
  });
}
// software drawing is slow: test pages start at 4x pixels and 8 shades unless a test brings its own settings
function quick() { try { if (!localStorage.getItem('retroHole.settings')) localStorage.setItem('retroHole.settings', JSON.stringify({ pixel: 4, levels: 8, volume: 0 })); } catch (e) {} }
async function launch() {
  const b = await pw.chromium.launch({ args: GL });
  const newPage = async (opt = {}) => { const c = await b.newContext(opt); await c.addInitScript(quick); return c.newPage(); };
  return { b, newPage };
}
function watch(p, log = []) {
  p.on('console', m => { if (!/GPU stall due to ReadPixels/.test(m.text())) log.push(`[${m.type()}] ${m.text()}`); });
  p.on('pageerror', e => log.push(`[pageerror] ${e.message}`));
  p.on('requestfailed', r => log.push(`[requestfailed] ${r.url()}`));
  return log;
}
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
const ready = (p, n = 4) => p.waitForFunction(k => window.__rh && window.__rh.frames > k, n, { timeout: 90000 });
const frames = (p, n) => p.evaluate(k => new Promise(r => { const f0 = __rh.frames; const t = () => __rh.frames >= f0 + k ? r() : setTimeout(t, 20); t(); }), n);
module.exports = { ...pw, ROOT, WORK, shot, serve, launch, watch, ok, ready, frames };

// Builds the game, then runs every *.test.js in this folder (or only those whose names contain the words given) in
// headless Chromium and prints a summary.  Run: node tests/browser/run-all.js [words]
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..', '..');
const b = spawnSync('node', [path.join(root, 'tools', 'build.js')], { stdio: 'inherit' });
if (b.status) process.exit(b.status);
const words = process.argv.slice(2);
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js') && (!words.length || words.some(w => f.includes(w)))).sort();
let failed = 0;
for (const f of files) {
  console.log('\n=== ' + f);
  const r = spawnSync('node', [path.join(__dirname, f)], { stdio: 'inherit' });
  if (r.status) failed++;
}
console.log(`\n${files.length - failed} of ${files.length} browser test files passed. Screenshots: ${require('./lib.js').WORK}/shots`);
process.exit(failed ? 1 : 0);

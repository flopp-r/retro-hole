// Retro Hole in the browser: drawing the world, the hole, eating, input, the camera and the screens. The rules and the
// map are in world.js (W here); this file only shows them and asks them.
(() => {
'use strict';
const W = WORLD;
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const BUILD = '__BUILD__';   // version: tools/build.js fills in a fingerprint of the game code
const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ------------------------------------------------------------------ settings
// pixel: game pixels are this many screen pixels across (0 is Max: one per real screen pixel); levels: shades per colour
// channel (256 is full colour; fewer turns on the dithering); dither and outline: the filters; volume: 0 to 1
const DEFAULTS = { pixel: 2, levels: 256, dither: true, outline: true, volume: 0.6 };
const S = { ...DEFAULTS };
try { Object.assign(S, JSON.parse(localStorage.getItem('retroHole.settings') || '{}')); } catch (e) {}
if (![0, 1, 2, 3, 4].includes(S.pixel)) S.pixel = DEFAULTS.pixel;
if (![256, 32, 16, 8].includes(S.levels)) S.levels = DEFAULTS.levels;
if (!(S.volume >= 0 && S.volume <= 1)) S.volume = DEFAULTS.volume;
const saveS = () => { try { localStorage.setItem('retroHole.settings', JSON.stringify(S)); } catch (e) {} };

// ------------------------------------------------------------------ renderer + post
// The scene is drawn small into a render target; a shader then adds outlines where the depth jumps, a vignette and, below
// full colour, Bayer dithering; the canvas is scaled up with hard pixel edges. Retro Set's pipeline, with a flat
// (isometric) camera, so depth is a straight line between the near and far planes.
const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
THREE.ColorManagement.enabled = false;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(1);
renderer.info.autoReset = false;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#1a1433');
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 100);
const AZ = Math.PI / 4, EL = 50 * Math.PI / 180;                  // the view: from the south-east, 50 degrees above the ground
const TO_CAM = new THREE.Vector3(Math.cos(EL) * Math.sin(AZ), Math.sin(EL), Math.cos(EL) * Math.cos(AZ));
const RIGHT = [Math.cos(AZ), -Math.sin(AZ)], FWD = [-Math.sin(AZ), -Math.cos(AZ)];   // on the ground: screen right, and screen up
scene.add(new THREE.AmbientLight(0xffffff, Math.PI * 0.5));
const sun = new THREE.DirectionalLight(0xfff4dc, Math.PI * 0.7);
sun.position.set(0.45, 1, 0.8);
scene.add(sun);

const postMat = new THREE.ShaderMaterial({
  uniforms: {
    tColor: { value: null }, tDepth: { value: null }, uRes: { value: new THREE.Vector2(1, 1) },
    uLevels: { value: 8 }, uDither: { value: 1 }, uOutline: { value: 1 }, uEdge: { value: 0.1 }, uRange: { value: 100 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 uRes;
    uniform float uLevels, uDither, uOutline, uEdge, uRange;
    varying vec2 vUv;
    float b2(vec2 v){ return mod(2.0*v.x + 3.0*v.y, 4.0); }
    float bayer4(vec2 p){ vec2 q = mod(floor(p), 4.0); return (4.0*b2(mod(q,2.0)) + b2(floor(q/2.0)) + 0.5)/16.0; }
    void main(){
      vec2 px = 1.0/uRes;
      vec3 col = texture2D(tColor, vUv).rgb;
      if (uOutline > 0.5) {
        float dc = texture2D(tDepth, vUv).x;
        float dl = texture2D(tDepth, vUv - vec2(px.x,0.0)).x, dr = texture2D(tDepth, vUv + vec2(px.x,0.0)).x;
        float dd = texture2D(tDepth, vUv - vec2(0.0,px.y)).x, du = texture2D(tDepth, vUv + vec2(0.0,px.y)).x;
        float lap = (abs(dl + dr - 2.0*dc) + abs(du + dd - 2.0*dc)) * uRange;
        float far = (max(max(dl,dr), max(du,dd)) - dc) * uRange;
        float edge = step(uEdge, lap) * step(uEdge * 1.4, far);
        if (dc >= 0.99999) edge = 0.0;
        col = mix(col, col*0.28 + vec3(0.03,0.02,0.06), edge*0.9);
      }
      vec2 c = vUv - 0.5; col *= 1.0 - 0.5*dot(c,c);
      if (uLevels < 200.0) {
        float t = (bayer4(gl_FragCoord.xy) - 0.5) * uDither;
        col = floor(col*(uLevels-1.0) + 0.5 + t) / (uLevels-1.0);
      }
      gl_FragColor = vec4(clamp(col,0.0,1.0), 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
const postScene = new THREE.Scene();
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
let rt = null, VW = 1, VH = 1;
const screenDpr = () => Math.min(3, Math.max(1, devicePixelRatio || 1));
function resize() {
  const px = S.pixel === 0 ? 1 / screenDpr() : S.pixel;
  VW = Math.max(80, Math.ceil(innerWidth / px)); VH = Math.max(60, Math.ceil(innerHeight / px));
  renderer.setSize(VW, VH, false);
  canvas.style.width = VW * px + 'px'; canvas.style.height = VH * px + 'px';
  if (rt) { rt.depthTexture.dispose(); rt.dispose(); }
  rt = new THREE.WebGLRenderTarget(VW, VH, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
  rt.depthTexture = new THREE.DepthTexture(VW, VH); rt.depthTexture.type = THREE.UnsignedIntType;
  postMat.uniforms.tColor.value = rt.texture; postMat.uniforms.tDepth.value = rt.depthTexture;
  postMat.uniforms.uRes.value.set(VW, VH);
}
function applyLook() {
  postMat.uniforms.uLevels.value = S.levels;
  postMat.uniforms.uDither.value = S.dither ? 1 : 0;
  postMat.uniforms.uOutline.value = S.outline ? 1 : 0;
}

// ------------------------------------------------------------------ materials
// Everything is lit flat (boxes), with colours as written. Two touches go into the shaders. The ground has the hole cut
// out of it (a round gap with a darker rim). Standing things lose every other pixel where they would hide the hole, so
// the hole can always be seen behind a tall building.
const UN = {
  uHoleW: { value: new THREE.Vector3() }, uHoleR: { value: 1 },
  uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) }, uView: { value: new THREE.Vector3(0, 0, 1) },
  uSinEl: { value: Math.sin(EL) },
};
const COMMON = 'varying vec3 vWP;\nuniform vec3 uHoleW; uniform float uHoleR; uniform vec3 uRight, uUp, uView; uniform float uSinEl;';
function hook(mat, fragmentMain, tail) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, UN);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (instanceMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + COMMON)
      .replace('void main() {', 'void main() {\n' + fragmentMain)
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n' + tail);
  };
}
const groundMat = new THREE.MeshLambertMaterial();
hook(groundMat, 'float dh = length(vWP.xz - uHoleW.xz); if (dh < uHoleR) discard;', 'if (dh < uHoleR * 1.12) gl_FragColor.rgb *= 0.55;');
const thingMat = new THREE.MeshLambertMaterial({ vertexColors: true });
hook(thingMat, `vec3 dp = vWP - uHoleW;
  if (dot(dp, uView) > 0.35 * uHoleR && vWP.y > 0.02 * uHoleR) {
    float qx = dot(dp, uRight) / (1.45 * uHoleR), qy = dot(dp, uUp) / (1.45 * uHoleR * uSinEl + 0.001);
    if (qx*qx + qy*qy < 1.0 && mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0) discard;
  }`, '');

// ------------------------------------------------------------------ the hole
// A round gap in the ground (see the ground's shader), a dark pit under it that things fall into, and a ring drawn over
// everything so the hole is never lost.
const H = { x: 0, z: 0, r: W.R0, rt: W.R0, xp: 0, level: 1, frac: 0, eaten: 0, vx: 0, vz: 0 };
const pitGeo = new THREE.CylinderGeometry(1, 1, 1, 40, 1, true);
pitGeo.translate(0, -0.5, 0);
{
  const pos = pitGeo.attributes.position, cols = [], top = new THREE.Color('#2e2250'), bot = new THREE.Color('#000000'), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { c.copy(top).lerp(bot, clamp(-pos.getY(i), 0, 1)); cols.push(c.r, c.g, c.b); }
  pitGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
}
const pit = new THREE.Group();
pit.add(new THREE.Mesh(pitGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
const pitFloor = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000 }));
pitFloor.position.y = -1;
pit.add(pitFloor);
scene.add(pit);
const ringMats = [new THREE.MeshBasicMaterial({ color: 0x1a1433, depthTest: false, depthWrite: false }), new THREE.MeshBasicMaterial({ color: 0xfff1b0, depthTest: false, depthWrite: false })];
const ringA = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.1, 48).rotateX(-Math.PI / 2), ringMats[1]);
const ringB = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.2, 48).rotateX(-Math.PI / 2), ringMats[0]);
for (const m of [ringA, ringB]) { m.renderOrder = 5; m.frustumCulled = false; scene.add(m); }

// ------------------------------------------------------------------ standing things
// One instanced mesh for each kind of thing (a house, a cow ...), shared by every cell; a thing is a slot in it.
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();
const Y = new THREE.Vector3(0, 1, 0);
const FACES = [
  [[1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]]], [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
  [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]], [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
  [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
];
function modelGeometry(m) {                                       // boxes (no undersides) with a colour on every corner
  const pos = [], nor = [], col = [], idx = [];
  for (const [cx, cy, cz, sx, sy, sz, hex] of m.parts) {
    _c.set(hex);
    for (const [n, corners] of FACES) {
      const base = pos.length / 3;
      for (const [a, b, c] of corners) { pos.push(cx + a * sx / 2, cy + b * sy / 2, cz + c * sz / 2); nor.push(n[0], n[1], n[2]); col.push(_c.r, _c.g, _c.b); }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}
class Pool {
  constructor(tyIndex) {
    this.ty = tyIndex; this.geo = modelGeometry(W.model(tyIndex)); this.cap = 0; this.n = 0; this.free = []; this.dirty = false; this.mesh = null;
    this.grow(256);
  }
  grow(cap) {
    const old = this.mesh, mesh = new THREE.InstancedMesh(this.geo, thingMat, cap);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    mesh.frustumCulled = false;
    if (old) { mesh.instanceMatrix.array.set(old.instanceMatrix.array); mesh.instanceColor.array.set(old.instanceColor.array); scene.remove(old); old.dispose(); }
    this.mesh = mesh; this.cap = cap; mesh.count = this.n; scene.add(mesh); this.dirty = true;
  }
  alloc() {
    if (this.free.length) return this.free.pop();
    if (this.n === this.cap) this.grow(this.cap * 2);
    this.mesh.count = ++this.n; return this.n - 1;
  }
  put(slot, x, y, z, q, s, br) {
    _p.set(x, y, z); _s.set(s, s, s); _m.compose(_p, q, _s); _m.toArray(this.mesh.instanceMatrix.array, slot * 16);
    if (br !== undefined) { const a = this.mesh.instanceColor.array; a[slot * 3] = a[slot * 3 + 1] = a[slot * 3 + 2] = br; }
    this.dirty = true;
  }
  hide(slot) { _m.makeScale(0, 0, 0).toArray(this.mesh.instanceMatrix.array, slot * 16); this.dirty = true; }
  release(slot) { this.hide(slot); this.free.push(slot); }
  flush() { if (!this.dirty) return; this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; this.dirty = false; }
}
const POOLS = [];
const pool = ty => POOLS[ty] || (POOLS[ty] = new Pool(ty));

// ------------------------------------------------------------------ the ground
// A field of flat tiles round the hole. A tile is about as wide as the hole, so the ground looks coarse and chunky at
// every size. Tiles keep their place in the field as it moves, and only the ones that come into view are rewritten.
const TILE_MAX = 90;
const tileMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), groundMat, TILE_MAX * TILE_MAX);
tileMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(TILE_MAX * TILE_MAX * 3), 3);
tileMesh.frustumCulled = false; tileMesh.count = 0;
scene.add(tileMesh);
const tkI = new Int32Array(TILE_MAX * TILE_MAX), tkJ = new Int32Array(TILE_MAX * TILE_MAX);
let tileSize = 0, tileN = 0;
function updateGround() {
  const r = H.r, size = Math.pow(2, Math.round(Math.log2(r * 1.5)));
  const n = Math.min(TILE_MAX, Math.ceil(2 * 28 * r / size) + 2);
  const force = size !== tileSize || n !== tileN;
  if (force) { tileSize = size; tileN = n; tkI.fill(2147483647); tkJ.fill(2147483647); tileMesh.count = n * n; }
  const i0 = Math.floor(H.x / size) - (n >> 1), j0 = Math.floor(H.z / size) - (n >> 1);
  const ma = tileMesh.instanceMatrix.array, ca = tileMesh.instanceColor.array;
  let changed = false;
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
    const ti = i0 + a, tj = j0 + b, slot = (((ti % n) + n) % n) + n * (((tj % n) + n) % n);
    if (tkI[slot] === ti && tkJ[slot] === tj) continue;
    tkI[slot] = ti; tkJ[slot] = tj; changed = true;
    const cx = (ti + 0.5) * size, cz = (tj + 0.5) * size, col = W.groundColour(cx, cz, ti, tj), o = slot * 16;
    ma.fill(0, o, o + 16); ma[o] = ma[o + 10] = size * 1.004; ma[o + 5] = 1; ma[o + 12] = cx; ma[o + 14] = cz; ma[o + 15] = 1;
    ca[slot * 3] = col[0]; ca[slot * 3 + 1] = col[1]; ca[slot * 3 + 2] = col[2];
  }
  if (changed) { tileMesh.instanceMatrix.needsUpdate = true; tileMesh.instanceColor.needsUpdate = true; }
}

// ------------------------------------------------------------------ cells: making and dropping the map round the hole
const CELLS = new Map();
let objTotal = 0, queue = [], planTimer = 0;
const OBJ_BUDGET = 14000;
function mount(c) {
  for (const o of c.objs) {
    const p = pool(o.ty); o.slot = p.alloc(); _q.setFromAxisAngle(Y, o.yaw); p.put(o.slot, o.x, 0, o.z, _q, o.s, o.br);
  }
  objTotal += c.objs.length; CELLS.set(c.key, c);
}
function unmount(c) {
  for (const o of c.objs) if (o.state < 2) { if (o.state === 1) dropFall(o); POOLS[o.ty].release(o.slot); o.state = 2; }
  objTotal -= c.objs.length; CELLS.delete(c.key);
}
function plan() {
  const R = 32 * H.rt, cull = 0.05 * H.rt;
  const want = W.wantedCells(H.x, H.z, R, cull), keep = new Set(W.wantedCells(H.x, H.z, R * 1.3, cull).map(c => c.t + ':' + c.i + ':' + c.j));
  for (const c of [...CELLS.values()]) if (!keep.has(c.key)) unmount(c);
  queue = want.filter(c => !CELLS.has(c.t + ':' + c.i + ':' + c.j));
}
function makeCells(maxMs) {
  const t0 = performance.now(); let n = 0;
  while (queue.length && objTotal < OBJ_BUDGET && (n === 0 || performance.now() - t0 < maxMs)) {
    const w = queue.shift(), key = w.t + ':' + w.i + ':' + w.j;
    if (CELLS.has(key)) continue;
    mount(W.genCell(w.t, w.i, w.j, 0.05 * H.rt)); n++;
  }
}
function clearWorld() {
  for (const c of [...CELLS.values()]) unmount(c);
  FALL.length = 0; queue = [];
}

// ------------------------------------------------------------------ eating
// A thing the hole can hold (up to 92% of its radius) falls once the hole's centre is close enough: it sinks, tips
// towards the middle, and is gone when it is below the ground.
const FALL = [];
let lastEatSound = 0;
function startFall(o, c) {
  o.state = 1;
  const f = { o, c, sx: o.x, sz: o.z, t: 0, T: clamp(0.35 + 0.22 * Math.sqrt(o.h / H.r), 0.35, 1.4), tilt: (Math.random() < 0.5 ? -1 : 1) * (0.35 + 0.5 * Math.random()) };
  o.fall = f; FALL.push(f);
  gain(W.xpFor(o.r, H.r), o.r / H.r);
}
function dropFall(o) { const i = FALL.indexOf(o.fall); if (i >= 0) { FALL[i] = FALL[FALL.length - 1]; FALL.pop(); } o.fall = null; }
function eatStep() {
  const r = H.r;
  for (const c of CELLS.values()) {
    const reach = r + c.maxR;
    if (H.x < c.x0 - reach || H.x > c.x0 + c.C + reach || H.z < c.z0 - reach || H.z > c.z0 + c.C + reach) continue;
    for (const o of c.objs) {
      if (o.state) continue;
      const dx = o.x - H.x, dz = o.z - H.z, d2 = dx * dx + dz * dz, lim = r + o.r;
      if (d2 > lim * lim || !W.canEat(o.r, r)) continue;
      const sw = W.swallowDist(o.r, r);
      if (d2 <= sw * sw) startFall(o, c);
    }
  }
}
function fallStep(dt) {
  for (let k = FALL.length - 1; k >= 0; k--) {
    const f = FALL[k], o = f.o, p = POOLS[o.ty];
    f.t += dt;
    const u = f.t / f.T;
    if (u >= 1) { p.release(o.slot); o.state = 2; o.fall = null; FALL[k] = FALL[FALL.length - 1]; FALL.pop(); continue; }
    const e = u * u, pull = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    const x = lerp(f.sx, H.x, pull * 0.92), z = lerp(f.sz, H.z, pull * 0.92), y = -(o.h + 0.25 * H.r) * e;
    const dx = H.x - o.x, dz = H.z - o.z, l = Math.hypot(dx, dz) || 1;
    _q.setFromAxisAngle(Y, o.yaw);
    _q2.setFromAxisAngle(_p.set(dz / l, 0, -dx / l), f.tilt * Math.min(1, u * 1.8)); _q.premultiply(_q2);
    p.put(o.slot, x, y, z, _q, o.s);
  }
}

// ------------------------------------------------------------------ levels
let toastTimer = 0;
function toast(msg, secs = 1.8) { const el = $('#toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), secs * 1000); }
function setXp(xp) {
  H.xp = Math.min(xp, W.MAXXP);
  const p = W.progress(H.xp), up = p.level > H.level;
  H.level = p.level; H.frac = p.frac; H.rt = W.radiusAt(H.level, H.frac);
  return up;
}
function gain(xp, rel) {
  H.eaten++;
  const up = setXp(H.xp + xp);
  if (state !== 'play') return;                                   // the title screen's hole plays silently
  const now = performance.now();
  if (now - lastEatSound > 70) { lastEatSound = now; sfx('eat', rel); }
  if (up) { toast(H.level >= W.MAXLV ? 'Level 1,000: maximum!' : 'Level ' + H.level, 1.6); sfx('level'); }
  progressHints();
}

// ------------------------------------------------------------------ sound (made from a few tones, no files)
let AC = null;
function ensureAudio() {
  try { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) { AC = null; }
}
function blip(f, d, type = 'square', v = 0.12, slide = 0, delay = 0) {
  if (!AC || S.volume <= 0) return;
  const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d);
  g.gain.setValueAtTime(v * S.volume, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + d + 0.03);
}
function sfx(kind, rel = 0.3) {
  if (kind === 'eat') blip(560 - 300 * clamp(rel, 0, 1), 0.12, 'square', 0.09, 0.5);
  else if (kind === 'level') [523, 659, 784, 1047].forEach((f, i) => blip(f, 0.16, 'square', 0.1, 0, i * 0.07));
  else if (kind === 'ui') blip(440, 0.06, 'square', 0.07);
}

// ------------------------------------------------------------------ steering
// The mouse steers towards the pointer (the hole stays in the middle of the screen), WASD and the arrow keys steer too,
// and on a touch screen you touch and drag. Directions are on the screen: up is away from the camera.
const IN = { mx: 0, my: 0, mouse: false, keys: {}, touch: null };
const onButton = e => !!(e.target.closest && e.target.closest('button'));
addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') { IN.mouse = !onButton(e); IN.mx = e.clientX; IN.my = e.clientY; }   // over a button the hole holds still
  else if (IN.touch && IN.touch.id === e.pointerId) { IN.touch.x = e.clientX; IN.touch.y = e.clientY; }
});
addEventListener('pointerdown', e => {
  ensureAudio();
  if (e.pointerType === 'mouse') { IN.mx = e.clientX; IN.my = e.clientY; IN.mouse = !onButton(e); return; }
  if (state !== 'play' || onButton(e)) return;
  IN.touch = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
  const st = $('#stick'); st.hidden = false; st.style.left = e.clientX + 'px'; st.style.top = e.clientY + 'px';
});
const endTouch = e => { if (IN.touch && IN.touch.id === e.pointerId) { IN.touch = null; $('#stick').hidden = true; } };
addEventListener('pointerup', endTouch); addEventListener('pointercancel', endTouch);
document.addEventListener('mouseleave', () => { IN.mouse = false; });
const KEYMAP = { w: 'u', arrowup: 'u', s: 'd', arrowdown: 'd', a: 'l', arrowleft: 'l', d: 'r', arrowright: 'r' };
addEventListener('keydown', e => {
  ensureAudio();
  const k = e.key.toLowerCase();
  if (k === 'escape') { e.preventDefault(); if (!$('#settings').hidden) closeSettings(); else if (state === 'play') openPause(); else if (state === 'pause') closePause(); return; }
  if (KEYMAP[k]) { IN.keys[KEYMAP[k]] = true; if (k.startsWith('arrow')) e.preventDefault(); }
});
addEventListener('keyup', e => { const k = KEYMAP[e.key.toLowerCase()]; if (k) IN.keys[k] = false; });
addEventListener('blur', () => { IN.keys = {}; IN.touch = null; $('#stick').hidden = true; });
function steer() {                                                // a push on the screen (right, up), each from -1 to 1
  const k = IN.keys;
  let ax = (k.r ? 1 : 0) - (k.l ? 1 : 0), ay = (k.u ? 1 : 0) - (k.d ? 1 : 0);
  if (ax || ay) { const l = Math.hypot(ax, ay); return [ax / l, ay / l]; }
  if (IN.touch) {
    const dx = IN.touch.x - IN.touch.x0, dy = -(IN.touch.y - IN.touch.y0), l = Math.hypot(dx, dy), m = clamp((l - 6) / 60, 0, 1);
    $('#stick i').style.transform = `translate(${clamp(dx, -40, 40)}px,${clamp(-dy, -40, 40)}px)`;
    return l ? [dx / l * m, dy / l * m] : [0, 0];
  }
  if (IN.mouse) {
    const dx = IN.mx - innerWidth / 2, dy = -(IN.my - innerHeight / 2), l = Math.hypot(dx, dy), m = clamp((l / Math.min(innerWidth, innerHeight) - 0.06) / 0.22, 0, 1);
    return l ? [dx / l * m, dy / l * m] : [0, 0];
  }
  return [0, 0];
}
const SPEED = 5.5;                                                // hole radii a second
// A hole far too small for where it is (everything there is huge) would take hours to walk home, so it is given the
// speed of a hole a quarter of the size the place suits.
const speedRef = () => Math.max(H.r, 0.25 * W.R0 * W.scaleAt(Math.hypot(H.x, H.z)));
function moveHole(dt, ax, ay) {
  const wx = RIGHT[0] * ax + FWD[0] * ay, wz = RIGHT[1] * ax + FWD[1] * ay, sp = SPEED * speedRef();
  const k = Math.min(1, dt * 9);
  H.vx += (wx * sp - H.vx) * k; H.vz += (wz * sp - H.vz) * k;
  H.x += H.vx * dt; H.z += H.vz * dt;
}
// on the title screen the hole plays itself, round the start
let auto = { ang: 0.6 };
function autopilot(dt) {
  let best = null, bd = 1e18;
  for (const c of CELLS.values()) for (const o of c.objs) {
    if (o.state || !W.canEat(o.r, H.r)) continue;
    const d = (o.x - H.x) ** 2 + (o.z - H.z) ** 2; if (d < bd) { bd = d; best = o; }
  }
  if (best && bd < (14 * H.r) ** 2) auto.ang = Math.atan2(best.z - H.z, best.x - H.x);
  else auto.ang += dt * 0.5;
  if (Math.hypot(H.x, H.z) > 60) auto.ang = Math.atan2(-H.z, -H.x);
  const wx = Math.cos(auto.ang), wz = Math.sin(auto.ang), sp = SPEED * H.r * 0.8, k = Math.min(1, dt * 5);
  H.vx += (wx * sp - H.vx) * k; H.vz += (wz * sp - H.vz) * k; H.x += H.vx * dt; H.z += H.vz * dt;
}

// ------------------------------------------------------------------ the camera
const CAM = { h: 7.6 * W.R0, k: 1 };                              // k: 1 on the title screen (the hole sits low and right, clear of the buttons), 0 in a game
const _right = new THREE.Vector3(), _up = new THREE.Vector3(), _view = new THREE.Vector3();
function updateCamera(dt, snap) {
  CAM.h = snap ? 7.6 * H.r : CAM.h + (7.6 * H.r - CAM.h) * Math.min(1, dt * 3);
  const goalK = state === 'title' ? 1 : 0;
  CAM.k = snap ? goalK : CAM.k + (goalK - CAM.k) * Math.min(1, dt * 4);
  const aspect = VW / VH, D = 200 * CAM.h, hw = CAM.h * aspect;
  const sh = CAM.k * (aspect > 1.2 ? 1 : 0.3), tx = H.x - RIGHT[0] * hw * 0.42 * sh + FWD[0] * CAM.h * 0.25 * CAM.k / Math.sin(EL), tz = H.z - RIGHT[1] * hw * 0.42 * sh + FWD[1] * CAM.h * 0.25 * CAM.k / Math.sin(EL);
  camera.left = -CAM.h * aspect; camera.right = CAM.h * aspect; camera.top = CAM.h; camera.bottom = -CAM.h;
  camera.near = D * 0.2; camera.far = D * 1.8; camera.updateProjectionMatrix();
  camera.position.set(tx + TO_CAM.x * D, TO_CAM.y * D, tz + TO_CAM.z * D);
  camera.lookAt(tx, 0, tz); camera.updateMatrixWorld();
  camera.matrixWorld.extractBasis(_right, _up, _view);
  UN.uRight.value.copy(_right); UN.uUp.value.copy(_up); UN.uView.value.copy(_view);
  UN.uHoleW.value.set(H.x, 0, H.z); UN.uHoleR.value = H.r;
  postMat.uniforms.uRange.value = camera.far - camera.near;
  postMat.uniforms.uEdge.value = 0.06 * H.r;
  pit.position.set(H.x, 0, H.z); pit.scale.set(H.r, 14 * H.r, H.r);
  for (const m of [ringA, ringB]) { m.position.set(H.x, 0.01 * H.r, H.z); m.scale.setScalar(H.r); }
}

// ------------------------------------------------------------------ screens
let state = 'title';                                              // title, play or pause
const SAVE_KEY = 'retroHole.save';
function readSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (s && s.v === 1 && isFinite(s.x) && isFinite(s.z) && s.xp >= 0) return s;
  } catch (e) {}
  return null;
}
function save() { if (state === 'title') return; try { localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, x: H.x, z: H.z, xp: H.xp, eaten: H.eaten })); } catch (e) {} }
const hintsSeen = {};
function hint(id, text, secs = 7) {
  if (hintsSeen[id]) return; hintsSeen[id] = 1;
  const el = $('#hint'); el.textContent = text; el.classList.add('on');
  clearTimeout(hint.t); hint.t = setTimeout(() => el.classList.remove('on'), secs * 1000);
}
let hungryT = 0, hungryCheck = 0;
function lostCheck(dt) {                                          // nothing small enough nearby for a while: say where to go
  hungryCheck -= dt; if (hungryCheck > 0) return; hungryCheck = 1;
  const R = 30 * H.r; let any = false;
  for (const c of CELLS.values()) { if (Math.abs(c.x0 + c.C / 2 - H.x) > R + c.C || Math.abs(c.z0 + c.C / 2 - H.z) > R + c.C) continue; for (const o of c.objs) if (!o.state && W.canEat(o.r, H.r) && Math.hypot(o.x - H.x, o.z - H.z) < R) { any = true; break; } if (any) break; }
  hungryT = any ? 0 : hungryT + 1;
  if (hungryT >= 6) { hintsSeen.lost = 0; hint('lost', Math.hypot(H.x, H.z) > 200 ? 'Nothing here is small enough to eat. Things are smaller nearer the start: use Menu, then Return to Start.' : 'Nothing nearby is small enough to eat. Try another direction: bigger things stay put until you have grown.', 9); hungryT = -20; }
}
function progressHints() {
  if (state !== 'play') return;
  if (H.eaten === 1) hint('first', 'Nicely done. Everything smaller than your hole falls in. Each thing eaten makes you bigger.');
  if (H.level >= 4) hint('far', 'Walking away from the start finds bigger things to eat. Things get bigger the further out you go.');
  if (H.level >= 12) hint('area', 'Villages, forests and cities each have their own things. Look for the gaps in the streets in the city.');
}
function startGame(fresh) {
  ensureAudio();
  clearWorld();
  const s = fresh ? null : readSave();
  Object.assign(H, { x: s ? s.x : 0, z: s ? s.z : 0, vx: 0, vz: 0, eaten: s ? s.eaten | 0 : 0 });
  setXp(s ? s.xp : 0); H.r = H.rt;
  state = 'play'; lastHud = ''; IN.mouse = false;                // the pointer is ignored until it moves, so the click on Play does not steer
  $('#title').hidden = true; $('#pause').hidden = true; $('#hud').hidden = false; $('#ver').hidden = true;
  plan(); makeCells(400); updateGround(); updateCamera(0, true);
  if (fresh) { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }
  hint('steer', 'Steer with the mouse, WASD or the arrow keys, or touch and drag. Eat things smaller than your hole.', 9);
  progressHints();
  save();
}
function returnToStart() { H.x = 0; H.z = 0; H.vx = H.vz = 0; clearWorld(); plan(); makeCells(400); updateGround(); updateCamera(0, true); save(); closePause(); toast('Back at the start', 1.6); }
function showTitle() {
  save();
  state = 'title';
  clearWorld();
  Object.assign(H, { x: 0, z: 0, vx: 0, vz: 0, eaten: 0 }); setXp(0); H.r = H.rt; auto = { ang: 0.6 };
  $('#hud').hidden = true; $('#pause').hidden = true; $('#title').hidden = false; $('#ver').hidden = false;
  const s = readSave();
  $('#bPlay').textContent = s ? 'Continue (Level ' + W.progress(s.xp).level + ')' : 'Play';
  $('#bNew').hidden = !s;
  plan(); makeCells(400); updateGround(); updateCamera(0, true);
}
function openPause() { if (state !== 'play') return; state = 'pause'; save(); $('#pause').hidden = false; IN.touch = null; $('#stick').hidden = true; }
function closePause() { if (state !== 'pause') return; state = 'play'; IN.mouse = false; $('#pause').hidden = true; }
let settingsFrom = null;
function openSettings() { settingsFrom = state; $('#settings').hidden = false; renderSettings(); }
function closeSettings() { $('#settings').hidden = true; }
const OPTIONS = [
  { key: 'pixel', label: 'Pixel Size', vals: [[1, '1x'], [2, '2x'], [3, '3x'], [4, '4x'], [0, 'Max']] },
  { key: 'levels', label: 'Colours', vals: [[256, 'Full'], [32, '32'], [16, '16'], [8, '8']] },
  { key: 'dither', label: 'Dithering', vals: [[true, 'On'], [false, 'Off']] },
  { key: 'outline', label: 'Outlines', vals: [[true, 'On'], [false, 'Off']] },
  { key: 'volume', label: 'Volume', vals: [[0, 'Off'], [0.3, 'Low'], [0.6, 'Medium'], [1, 'High']] },
];
function renderSettings() {
  const box = $('#setRows'); box.textContent = '';
  for (const o of OPTIONS) {
    const row = document.createElement('div'); row.className = 'row'; row.style.marginBottom = '8px';
    const lbl = document.createElement('div'); lbl.className = 'lbl'; lbl.textContent = o.label; row.appendChild(lbl);
    const seg = document.createElement('div'); seg.className = 'seg';
    for (const [v, t] of o.vals) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = t; b.dataset.key = o.key; b.dataset.v = String(v);
      b.setAttribute('aria-pressed', String(S[o.key] === v));
      b.onclick = () => { S[o.key] = v; saveS(); if (o.key === 'pixel') resize(); applyLook(); renderSettings(); sfx('ui'); };
      seg.appendChild(b);
    }
    row.appendChild(seg); box.appendChild(row);
  }
}
$('#bPlay').onclick = () => startGame(false);
$('#bNew').onclick = () => startGame(true);
$('#bSet').onclick = openSettings; $('#bSet2').onclick = openSettings; $('#bSetClose').onclick = closeSettings;
$('#bMenu').onclick = openPause; $('#bResume').onclick = closePause;
$('#bQuit').onclick = showTitle; $('#bHome').onclick = returnToStart;
document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); if (state === 'play') openPause(); } });
addEventListener('pagehide', save);
addEventListener('resize', resize);
$('#ver').textContent = 'Version ' + BUILD;

// ------------------------------------------------------------------ the screen's numbers
let lastHud = '';
function hud() {
  if (state === 'title') return;
  const p = H.level >= W.MAXLV ? 1 : H.frac, d = Math.hypot(H.x, H.z), b = W.BIOMES[W.biomeAt(H.x, H.z)].name;
  const key = [H.level, Math.round(p * 500), H.eaten, Math.round(H.r * 100), Math.round(d), b].join();
  if (key === lastHud) return; lastHud = key;
  $('#lvNum').textContent = 'Level ' + H.level.toLocaleString('en-GB');
  $('#lvSize').textContent = W.fmtLen(H.r * 2) + ' wide';
  $('#xpFill').style.width = (p * 100).toFixed(1) + '%';
  $('#lvEaten').textContent = 'Eaten ' + H.eaten.toLocaleString('en-GB');
  $('#lvNext').textContent = H.level >= W.MAXLV ? 'MAX' : Math.round(p * 100) + '%';
  $('#wArea').textContent = b; $('#wDist').textContent = d < 1 ? 'At the start' : W.fmtLen(d) + ' from start';
}

// ------------------------------------------------------------------ main loop
let last = performance.now(), frames = 0, drawn = { calls: 0, tris: 0 }, saveT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; frames++;
  if (state !== 'pause') {
    if (state === 'play') { const [ax, ay] = steer(); moveHole(dt, ax, ay); } else autopilot(dt);
    H.r += (H.rt - H.r) * Math.min(1, dt * 6);
    planTimer -= dt;
    if (planTimer <= 0 || queue.length) { if (planTimer <= 0) { plan(); planTimer = 0.25; } makeCells(5); }
    eatStep(); fallStep(dt); if (state === 'play') lostCheck(dt);
    saveT += dt; if (saveT > 5) { saveT = 0; save(); }
  }
  updateGround(); updateCamera(dt, false);
  for (const p of POOLS) if (p) p.flush();
  const pulse = 0.5 + 0.5 * Math.sin(now / 260);
  ringMats[1].color.setRGB(1, 0.9 + 0.1 * pulse, 0.55 + 0.3 * pulse);
  hud();
  renderer.info.reset();
  renderer.setRenderTarget(rt); renderer.render(scene, camera);
  drawn = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);
}

// ------------------------------------------------------------------ for the tests
window.__rh = {
  get state() { return state; }, H, S, CELLS, FALL, get frames() { return frames; }, get drawn() { return drawn; }, get objects() { return objTotal; },
  get queue() { return queue.length; }, get tile() { return { size: tileSize, n: tileN }; }, W, BUILD,
  start: startGame, title: showTitle, pause: openPause, resume: closePause, home: returnToStart, speedRef,
  teleport(x, z) { H.x = x; H.z = z; H.vx = H.vz = 0; plan(); makeCells(1000); },
  setXp(xp) { setXp(xp); H.r = H.rt; },
  nearestEdible() {
    let best = null, bd = 1e30;
    for (const c of CELLS.values()) for (const o of c.objs) { if (o.state || !W.canEat(o.r, H.r)) continue; const d = (o.x - H.x) ** 2 + (o.z - H.z) ** 2; if (d < bd) { bd = d; best = o; } }
    return best ? { x: best.x, z: best.z, r: best.r, type: W.TYPES[best.ty].id, d: Math.sqrt(bd) } : null;
  },
  standing() { let n = 0; for (const c of CELLS.values()) for (const o of c.objs) if (!o.state) n++; return n; },
  poolSlots() { return POOLS.reduce((a, p) => a + (p ? p.n - p.free.length : 0), 0); },
  steer(ax, ay) { IN.keys = { r: ax > 0, l: ax < 0, u: ay > 0, d: ay < 0 }; },
};

resize(); applyLook();
showTitle();
requestAnimationFrame(frame);
})();

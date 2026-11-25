// Retro Hole in the browser: drawing the world, the hole, eating, input, the camera and the screens. The rules and the
// map are in world.js (W here); this file only shows them and asks them.
(() => {
'use strict';
const W = WORLD, K = SKINS_MOD;
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const BUILD = '__BUILD__';   // version: tools/build.js fills in a fingerprint of the game code
const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ------------------------------------------------------------------ settings
// pixel: game pixels are this many screen pixels across (0 is Max: one per real screen pixel); levels: shades per colour
// channel (256 is full colour; fewer turns on the dithering); dither and outline: the filters; volume: 0 to 1; mouse:
// whether the hole follows the mouse pointer (the keyboard and touch always steer)
const DEFAULTS = { pixel: 2, levels: 256, dither: true, outline: true, volume: 0.6, mouse: true };
const S = { ...DEFAULTS };
try { Object.assign(S, JSON.parse(localStorage.getItem('retroHole.settings') || '{}')); } catch (e) {}
if (![0, 1, 2, 3, 4].includes(S.pixel)) S.pixel = DEFAULTS.pixel;
if (![256, 32, 16, 8].includes(S.levels)) S.levels = DEFAULTS.levels;
if (!(S.volume >= 0 && S.volume <= 1)) S.volume = DEFAULTS.volume;
if (typeof S.mouse !== 'boolean') S.mouse = DEFAULTS.mouse;
const saveS = () => { try { localStorage.setItem('retroHole.settings', JSON.stringify(S)); } catch (e) {} };

// ------------------------------------------------------------------ the profile
// Coins, the skins and effects owned and worn, and kills and deaths for good, kept in the browser (retroHole.profile).
// Coins are earned by levels, kills and coins found on the map (world.js, COINS) and spent on the Skins screen.
// Admin mode (for the owner, to try everything) keeps a separate test profile and test saves, so the real ones are never touched.
let ADMIN = false, GOD = false;
try { ADMIN = localStorage.getItem('retroHole.admin') === '1'; } catch (e) {}
const profileKey = () => ADMIN ? 'retroHole.profileAdmin' : 'retroHole.profile';
function loadProfile() {
  try { const raw = localStorage.getItem(profileKey()); if (raw) return K.validate(JSON.parse(raw)); } catch (e) {}
  return ADMIN ? K.full() : K.fresh();
}
let PROFILE = loadProfile();
let profileDirty = false;
function saveProfile() { profileDirty = false; try { localStorage.setItem(profileKey(), JSON.stringify(PROFILE)); } catch (e) {} }
let popSum = 0, popT = 0;
function earnCoins(n) { if (!(n > 0)) return; K.earn(PROFILE, n); profileDirty = true; popSum += n; popT = 1.6; }
const coinText = n => n >= 10 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
const stat = () => PROFILE.stats[MODE];                          // this game's kills and deaths for good

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
        col = mix(col, col*0.5 + vec3(0.02,0.015,0.04), edge*0.75);
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
// out of it (a round gap with a darker rim, one for each hole: yours and the bots'). A thing too big to eat that is over the hole, or in front of it, dissolves:
// it loses pixels in the pattern of the post filter, by an amount (aFade, 0 to 1) the game sets for each thing, so the
// hole and what is round it can always be seen and nothing blocks the camera.
const MAXH = 13;                                                  // the player's hole and up to 12 bots are drawn and cut out of the ground
const UN = { uHoles: { value: Array.from({ length: MAXH }, () => new THREE.Vector3()) }, uNH: { value: 1 } };   // each hole: x, z, radius
const groundMat = new THREE.MeshLambertMaterial();
groundMat.onBeforeCompile = sh => {
  Object.assign(sh.uniforms, UN);
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (instanceMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nuniform vec3 uHoles[13]; uniform int uNH;')
    .replace('void main() {', 'void main() {\nfloat rim = 0.0;\nfor (int i = 0; i < 13; i++) { if (i >= uNH) break; vec3 h = uHoles[i]; float dd = length(vWP.xz - h.xy); if (dd < h.z) discard; if (dd < h.z * 1.12) rim = 1.0; }')
    .replace('#include <dithering_fragment>', '#include <dithering_fragment>\nif (rim > 0.5) gl_FragColor.rgb *= 0.55;');
};
const thingMat = new THREE.MeshLambertMaterial({ vertexColors: true });
thingMat.onBeforeCompile = sh => {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aFade; varying float vFade;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvFade = aFade;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
    varying float vFade;
    float b2(vec2 v){ return mod(2.0*v.x + 3.0*v.y, 4.0); }
    float bayer4(vec2 p){ vec2 q = mod(floor(p), 4.0); return (4.0*b2(mod(q,2.0)) + b2(floor(q/2.0)) + 0.5)/16.0; }`)
    .replace('void main() {', 'void main() {\n  if (vFade > 0.01 && bayer4(gl_FragCoord.xy) < vFade) discard;');
};

// ------------------------------------------------------------------ the hole
// A round gap in the ground (see the ground's shader), a dark pit under it that things fall into, and a ring drawn over
// everything so the hole is never lost.
const H = { x: 0, z: 0, r: W.R0, rt: W.R0, xp: 0, level: 1, frac: 0, eaten: 0, vx: 0, vz: 0, prot: 0, kills: 0, deaths: 0, best: 1 };
const pitGeo = new THREE.CylinderGeometry(1, 1, 1, 40, 1, true);
pitGeo.translate(0, -0.5, 0);
{
  const pos = pitGeo.attributes.position, cols = [], top = new THREE.Color('#5a4a8c'), bot = new THREE.Color('#150e2a'), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { c.copy(top).lerp(bot, clamp(-pos.getY(i), 0, 1)); cols.push(c.r, c.g, c.b); }
  pitGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
}
const pitMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
const floorGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), floorMat = new THREE.MeshBasicMaterial({ color: 0x0c0818 });
const ringGeoA = new THREE.RingGeometry(1.0, 1.1, 48).rotateX(-Math.PI / 2), ringGeoB = new THREE.RingGeometry(1.1, 1.2, 48).rotateX(-Math.PI / 2);
const darkRing = new THREE.MeshBasicMaterial({ color: 0x1a1433, depthTest: false, depthWrite: false });
// The player's own ring and pit have their own geometry, coloured by the skin worn (applySkin): the ring cut into 48
// flat triangles pairs coloured one by one, the pit's colours from its top to its floor.
const RING_SEG = 48;
const ringSkinGeo = new THREE.RingGeometry(1.0, 1.25, RING_SEG).rotateX(-Math.PI / 2).toNonIndexed(), pitSkinGeo = pitGeo.clone();   // wider than a bot's ring, so the pattern shows
ringSkinGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(ringSkinGeo.attributes.position.count * 3).fill(1), 3));
const ringSegOf = [];                                             // for each triangle, which of the 48 segments it is in
{ const pos = ringSkinGeo.attributes.position; for (let i = 0; i < pos.count; i += 3) { const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3; ringSegOf.push(Math.floor((Math.atan2(z, x) / (2 * Math.PI) + 1) % 1 * RING_SEG)); } }
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
function ringColour(skin, k, out) {                               // the colour of segment k of the ring
  const c = skin.ring, n = c.length;
  switch (skin.pattern) {
    case 'stripes': return out.set(c[Math.floor(k / 3) % n]);
    case 'halves': return out.set(c[Math.floor(k / (RING_SEG / n)) % n]);
    case 'thirds': return out.set(c[Math.floor(k / (RING_SEG / Math.min(n, 3))) % n]);
    case 'checker': return out.set(c[k % n]);
    case 'dash': return out.set(c[k % 4 === 3 ? 1 % n : 0]);
    case 'gradient': { const u = k / RING_SEG * n, i = Math.floor(u); return out.set(c[i % n]).lerp(_c2.set(c[(i + 1) % n]), u - i); }
    default: return out.set(c[0]);
  }
}
function applySkin() {
  const s = K.find('skin', PROFILE.wear.skin) || K.SKINS[0], col = ringSkinGeo.attributes.color;
  for (let t = 0; t < ringSegOf.length; t++) { ringColour(s, ringSegOf[t], _c1); for (let v = 0; v < 3; v++) col.setXYZ(t * 3 + v, _c1.r, _c1.g, _c1.b); }
  col.needsUpdate = true;
  const pos = pitSkinGeo.attributes.position, pc = [], top = new THREE.Color(s.pit[0]), bot = new THREE.Color(s.pit[1]), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { c.copy(top).lerp(bot, clamp(-pos.getY(i), 0, 1)); pc.push(c.r, c.g, c.b); }
  pitSkinGeo.setAttribute('color', new THREE.Float32BufferAttribute(pc, 3));
}
function makeVisual(hex, own = false) {                           // a pit under the ground, and a coloured ring over everything
  const pit = new THREE.Group(), floor = new THREE.Mesh(floorGeo, floorMat);
  pit.add(new THREE.Mesh(own ? pitSkinGeo : pitGeo, pitMat)); floor.position.y = -1; pit.add(floor);
  const mat = new THREE.MeshBasicMaterial({ color: hex, depthTest: false, depthWrite: false, vertexColors: own });
  const a = new THREE.Mesh(own ? ringSkinGeo : ringGeoA, mat), b = new THREE.Mesh(ringGeoB, darkRing);
  for (const m of [a, b]) { m.renderOrder = 5; m.frustumCulled = false; }
  scene.add(pit, a, b);
  return { pit, a, b, mat, own };
}
const VIS = [makeVisual(0xffffff, true)];                               // 0 is the player's; the bots' are added as they are needed
applySkin();
function placeVisual(v, x, z, r, show) {
  v.pit.visible = v.a.visible = v.b.visible = show;
  if (!show) return;
  v.pit.position.set(x, 0, z); v.pit.scale.set(r, 14 * r, r);
  for (const m of [v.a, v.b]) { m.position.set(x, 0.01 * r, z); m.scale.setScalar(m === v.b && v.own ? 1.14 * r : r); }   // the player's dark outline sits outside its wider ring
}

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
const FADE_CAP = 16384;                                           // most of one kind of thing at once (the budget is 14,000 things in all)
class Pool {
  constructor(tyIndex) {
    this.ty = tyIndex; this.geo = modelGeometry(W.model(tyIndex)); this.cap = 0; this.n = 0; this.free = []; this.dirty = false; this.mesh = null;
    this.fade = new Float32Array(FADE_CAP); this.fadeAttr = new THREE.InstancedBufferAttribute(this.fade, 1); this.geo.setAttribute('aFade', this.fadeAttr); this.fadeDirty = false;
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
    if (this.n >= FADE_CAP) throw new Error('too many of one thing');
    this.mesh.count = ++this.n; return this.n - 1;
  }
  put(slot, x, y, z, q, s, br) {
    _p.set(x, y, z); _s.set(s, s, s); _m.compose(_p, q, _s); _m.toArray(this.mesh.instanceMatrix.array, slot * 16);
    if (br !== undefined) { const a = this.mesh.instanceColor.array; a[slot * 3] = a[slot * 3 + 1] = a[slot * 3 + 2] = br; }
    this.dirty = true;
  }
  hide(slot) { _m.makeScale(0, 0, 0).toArray(this.mesh.instanceMatrix.array, slot * 16); this.dirty = true; }
  release(slot) { this.hide(slot); this.setFade(slot, 0); this.free.push(slot); }
  setFade(slot, v) { if (this.fade[slot] !== v) { this.fade[slot] = v; this.fadeDirty = true; } }
  flush() {
    if (this.fadeDirty) { this.fadeAttr.needsUpdate = true; this.fadeDirty = false; }
    if (!this.dirty) return; this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; this.dirty = false;
  }
}
const POOLS = [];
const pool = ty => POOLS[ty] || (POOLS[ty] = new Pool(ty));

// ------------------------------------------------------------------ the ground
// A field of flat tiles round the hole. A tile is about three quarters as wide as the hole, so the ground looks
// the same at every size. Tiles keep their place in the field as it moves, and only the ones that come into view are rewritten.
const TILE_MAX = 100;
const tileMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), groundMat, TILE_MAX * TILE_MAX);
tileMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(TILE_MAX * TILE_MAX * 3), 3);
tileMesh.frustumCulled = false; tileMesh.count = 0;
scene.add(tileMesh);
const tkI = new Int32Array(TILE_MAX * TILE_MAX), tkJ = new Int32Array(TILE_MAX * TILE_MAX);
let tileSize = 0, tileN = 0;
function updateGround() {
  const r = H.r, size = Math.pow(2, Math.round(Math.log2(r * 0.75)));
  const n = Math.min(TILE_MAX, Math.ceil(2 * 24 * r / size) + 2);
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
  if (c.bot && state === 'play') BOTS.push(makeBot(c));          // a bot lives in its cell while the cell is loaded
}
function unmount(c) {
  for (const o of c.objs) if (o.state < 2) { if (o.state === 1) dropFall(o); FADING.delete(o); o.fd = 0; o.fading = false; POOLS[o.ty].release(o.slot); o.state = 2; }
  objTotal -= c.objs.length; CELLS.delete(c.key);
  for (let i = BOTS.length - 1; i >= 0; i--) if (BOTS[i].cell === c) BOTS.splice(i, 1);
}
// How far the nearest edge of a cell is from the hole: the same measure wantedCells() sorts by.
const cellDist = c => Math.hypot(H.x - Math.min(Math.max(H.x, c.x0), c.x0 + c.C), H.z - Math.min(Math.max(H.z, c.z0), c.z0 + c.C));
// Every quarter of a second: the cells within 32 hole radii are wanted, and a cell stays until it is beyond 1.3 times
// that. Everything wanted is always kept (the keep list is the wanted list plus a margin), so a cell can never be made
// and dropped again at the next look, which would regrow the things eaten there.
function plan() {
  const R = 32 * H.rt, cull = 0.05 * H.rt;
  const want = W.wantedCells(H.x, H.z, R, cull), keep = new Set(W.wantedCells(H.x, H.z, R * 1.3, cull).map(c => c.t + ':' + c.i + ':' + c.j));
  for (const c of want) keep.add(c.t + ':' + c.i + ':' + c.j);
  for (const c of [...CELLS.values()]) if (!keep.has(c.key)) unmount(c);
  queue = want.filter(c => !CELLS.has(c.t + ':' + c.i + ':' + c.j));
}
// Makes the wanted cells nearest first. When the budget of things is spent, a nearer cell takes the place of the
// farthest cell held, and only if that one is farther (so the held cells settle on the nearest ones and nothing is
// made and dropped in turn).
function makeCells(maxMs) {
  const t0 = performance.now(); let n = 0;
  while (queue.length && (n === 0 || performance.now() - t0 < maxMs)) {
    const w = queue[0], key = w.t + ':' + w.i + ':' + w.j;
    if (CELLS.has(key)) { queue.shift(); continue; }
    if (objTotal >= OBJ_BUDGET) {
      let far = null, fd = -1;
      for (const c of CELLS.values()) { const d = cellDist(c); if (d > fd) { fd = d; far = c; } }
      if (!far || fd <= w.dist) break;
      unmount(far);
      continue;
    }
    queue.shift();
    mount(W.genCell(w.t, w.i, w.j, 0.05 * H.rt)); n++;
  }
}
function clearWorld() {
  for (const c of [...CELLS.values()]) unmount(c);
  ACTIVE = []; dyingBots = [];
  FALL.length = 0; queue = [];
}

// ------------------------------------------------------------------ eating
// A thing the hole can hold (up to 92% of its radius) falls once the hole's centre is close enough: it sinks, tips
// towards the middle, and is gone when it is below the ground.
const FALL = [];
let lastEatSound = 0;
const COIN_TY = W.BYID.coin.i;
// Eating effects: little cubes thrown up where a thing falls in, in the colours of the effect worn (skins.js). They are
// sized by the hole's radius so they look the same at every level, and there are none with reduced motion.
const BITS_MAX = 240, BITS = Array.from({ length: BITS_MAX }, () => ({ life: 0 }));
const bitMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), BITS_MAX);
bitMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); bitMesh.frustumCulled = false; bitMesh.visible = false; bitMesh.renderOrder = 4;
for (let i = 0; i < BITS_MAX; i++) bitMesh.setColorAt(i, _c.set(0xffffff));
scene.add(bitMesh);
let bitHead = 0, bitsLive = 0, fxBudget = 0;
function spawnBits(x, z) {
  const fx = K.find('fx', PROFILE.wear.fx);
  if (!fx || !fx.n || reduceMotion || fxBudget >= 6) return;
  fxBudget++;
  for (let k = 0; k < fx.n; k++) {
    const b = BITS[bitHead]; bitHead = (bitHead + 1) % BITS_MAX;
    const a = Math.random() * 6.2832, sp = fx.speed * H.r * (0.4 + Math.random() * 0.8);
    b.x = x; b.y = 0.15 * H.r; b.z = z; b.vx = Math.cos(a) * sp; b.vz = Math.sin(a) * sp; b.vy = fx.up * H.r * (0.6 + Math.random() * 0.8); b.g = fx.g * H.r;
    b.max = b.life = fx.life * (0.7 + Math.random() * 0.6); b.size = fx.size * H.r;
    bitMesh.setColorAt(BITS.indexOf(b), _c.set(fx.bits[Math.floor(Math.random() * fx.bits.length)]));
  }
  bitMesh.instanceColor.needsUpdate = true;
}
function clearBits() { for (const b of BITS) b.life = 0; bitsLive = 0; bitMesh.visible = false; }
function bitsStep(dt) {
  fxBudget = 0;
  if (!bitsLive && !BITS.some(b => b.life > 0)) { bitMesh.visible = false; return; }
  let live = 0;
  for (let i = 0; i < BITS_MAX; i++) {
    const b = BITS[i];
    if (b.life > 0) {
      b.life -= dt; b.x += b.vx * dt; b.z += b.vz * dt; b.vy -= b.g * dt; b.y = Math.max(0, b.y + b.vy * dt);
      if (b.y === 0 && b.g > 0) b.vy = 0;
    }
    if (b.life > 0) { live++; const s = b.size * (0.35 + 0.65 * b.life / b.max); _m.makeScale(s, s, s); _m.setPosition(b.x, b.y + s / 2, b.z); }
    else _m.makeScale(0, 0, 0);
    bitMesh.setMatrixAt(i, _m);
  }
  bitMesh.instanceMatrix.needsUpdate = true; bitsLive = live; bitMesh.visible = live > 0;
}
function startFall(o, c, h) {
  o.state = 1;
  const f = { o, c, h, sx: o.x, sz: o.z, t: 0, T: clamp(0.35 + 0.22 * Math.sqrt(o.h / h.r), 0.35, 1.4), tilt: (Math.random() < 0.5 ? -1 : 1) * (0.35 + 0.5 * Math.random()) };
  o.fall = f; FALL.push(f);
  if (h === H) { gain(W.xpFor(o.r, H.r), o.r / H.r); if (state === 'play') { if (o.ty === COIN_TY) earnCoins(W.foundPay(H.r)); spawnBits(o.x, o.z); } }
  else botGain(h, W.xpFor(o.r, h.r) * BOT_XP);
}
function dropFall(o) { const i = FALL.indexOf(o.fall); if (i >= 0) { FALL[i] = FALL[FALL.length - 1]; FALL.pop(); } o.fall = null; }
function eatFor(h) {                                              // the player's hole and every bot eat by the same rule
  const r = h.r;
  for (const c of CELLS.values()) {
    const reach = r + c.maxR;
    if (h.x < c.x0 - reach || h.x > c.x0 + c.C + reach || h.z < c.z0 - reach || h.z > c.z0 + c.C + reach) continue;
    for (const o of c.objs) {
      if (o.state) continue;
      const dx = o.x - h.x, dz = o.z - h.z, d2 = dx * dx + dz * dz, lim = r + o.r;
      if (d2 > lim * lim || !W.canEat(o.r, r)) continue;
      const sw = W.swallowDist(o.r, r);
      if (d2 <= sw * sw) startFall(o, c, h);
    }
  }
}
function eatStep() { eatFor(H); for (const b of ACTIVE) eatFor(b); }
function fallStep(dt) {
  for (let k = FALL.length - 1; k >= 0; k--) {
    const f = FALL[k], o = f.o, p = POOLS[o.ty], h = f.h;
    f.t += dt;
    const u = f.t / f.T;
    if (u >= 1) { p.release(o.slot); o.state = 2; o.fall = null; FALL[k] = FALL[FALL.length - 1]; FALL.pop(); continue; }
    const e = u * u, pull = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    const x = lerp(f.sx, h.x, pull * 0.92), z = lerp(f.sz, h.z, pull * 0.92), y = -(o.h + 0.25 * h.r) * e;
    const dx = h.x - o.x, dz = h.z - o.z, l = Math.hypot(dx, dz) || 1;
    _q.setFromAxisAngle(Y, o.yaw);
    _q2.setFromAxisAngle(_p.set(dz / l, 0, -dx / l), f.tilt * Math.min(1, u * 1.8)); _q.premultiply(_q2);
    p.put(o.slot, x, y, z, _q, o.s);
  }
}

// ------------------------------------------------------------------ nothing blocks the view
// A thing too big to eat that stands over the hole, or between the camera and the hole (or just beside that line),
// dissolves while it is in the way. The test is a straight line from the hole's middle towards the camera, through the
// thing's box made a little bigger. A thing the hole can eat is never touched: it is small, and it is the point.
const FADING = new Set();
const FADE_TO = 0.8;
function inTheWay(o, m) {
  let t0 = 0, t1 = Infinity;
  for (const [d, lo, hi] of [[TO_CAM.x, o.x - o.ex - m - H.x, o.x + o.ex + m - H.x], [TO_CAM.z, o.z - o.ez - m - H.z, o.z + o.ez + m - H.z], [TO_CAM.y, -m, o.h + m]]) {
    const a = lo / d, b = hi / d;
    t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
    if (t1 < t0) return false;
  }
  return true;
}
function fadeStep(dt) {
  const m = 2.2 * H.r, reach = 1 / Math.tan(EL);
  for (const c of CELLS.values()) {
    if (c.maxH === undefined) { c.maxH = 0; for (const o of c.objs) if (o.h > c.maxH) c.maxH = o.h; }
    const rr = (c.maxH + m) * reach + m + c.C / 2;
    if (Math.abs(c.x0 + c.C / 2 - H.x) > rr || Math.abs(c.z0 + c.C / 2 - H.z) > rr) continue;
    for (const o of c.objs) {
      if (o.state || o.h < 0.8 * H.r || W.canEat(o.r, H.r)) continue;
      if (inTheWay(o, m)) { o.ft = 1; if (!o.fading) { o.fading = true; FADING.add(o); } }
    }
  }
  const k = Math.min(1, dt * 9);
  for (const o of FADING) {
    const goal = o.ft ? FADE_TO : 0;
    o.ft = 0;
    o.fd = (o.fd || 0) + (goal - (o.fd || 0)) * k;
    if (Math.abs(o.fd - goal) < 0.02) o.fd = goal;
    if (o.state === 2) { FADING.delete(o); continue; }
    POOLS[o.ty].setFade(o.slot, reduceMotion ? goal : o.fd);
    if (goal === 0 && o.fd === 0) { o.fading = false; FADING.delete(o); }
  }
}

// ------------------------------------------------------------------ animals
// Animals near the hole wander: they walk a little, stop, turn and go again, inside their own cell (or their pen). They are
// moved here, a frame at a time, only while the hole is near; far away they stand where the map put them.
const WALK = W.TYPES.map(t => t.walk);
function wander(dt, now) {
  const R = 22 * H.r;
  for (const c of CELLS.values()) {
    if (Math.abs(c.x0 + c.C / 2 - H.x) > R + c.C / 2 || Math.abs(c.z0 + c.C / 2 - H.z) > R + c.C / 2) continue;
    for (const o of c.objs) {
      const w = WALK[o.ty];
      if (!w || o.state) continue;
      if (o.mt === undefined) { o.mt = Math.random() * 3; o.mh = Math.random() * 6.283; o.mv = Math.random() < 0.6; o.mp = Math.random() * 6.283; o.my = 0; }
      o.mt -= dt;
      if (o.mt <= 0) { o.mv = !o.mv; o.mt = o.mv ? 1 + Math.random() * 3 : 0.8 + Math.random() * 2.5; if (o.mv) o.mh += (Math.random() - 0.5) * 3; }
      if (!o.mv) { if (o.my !== 0) { o.my = 0; _q.setFromAxisAngle(Y, o.yaw); POOLS[o.ty].put(o.slot, o.x, 0, o.z, _q, o.s); } continue; }
      const sp = w * o.s * dt, dx = Math.cos(o.mh), dz = Math.sin(o.mh);
      let x = o.x + dx * sp, z = o.z + dz * sp;
      const b = o.pen || { x0: c.x0, x1: c.x0 + c.C, z0: c.z0, z1: c.z0 + c.C };           // a penned animal stays in its pen
      const lo = b.x0 + o.ex, hi = b.x1 - o.ex, lz = b.z0 + o.ez, hz = b.z1 - o.ez;
      if (x < lo || x > hi || z < lz || z > hz) { o.mh += Math.PI; x = Math.min(Math.max(x, lo), hi); z = Math.min(Math.max(z, lz), hz); }
      o.x = x; o.z = z; o.yaw = Math.atan2(-dx, -dz);
      o.my = 0.12 * o.r * Math.abs(Math.sin(now * 0.012 + o.mp)) + 1e-9;   // a little hop at each step
      _q.setFromAxisAngle(Y, o.yaw); POOLS[o.ty].put(o.slot, x, o.my, z, _q, o.s);
    }
  }
}

// ------------------------------------------------------------------ rival holes
// A bot lives in a cell (world.js decides which, from the seed) while that cell is loaded. It eats the same way the
// player does, grows by the same rules, and is moved here. The bots nearest the player (at most 12) are the active
// ones: drawn, cut out of the ground and simulated; the others stand still and unseen. A bot hunts a hole it can
// swallow that is near, flees from one that could swallow it, and otherwise goes for the juiciest thing it can eat.
// A hole swallows another when it is at least about 8% wider and its middle is over it (the same rule as for things).
// If a bot swallows you, you lose half your xp and come back a little way off, protected for a few seconds.
const BOTS = [], MAXBOTS = MAXH - 1, BOT_XP = 0.2, RESPAWN = 25, BOT_SPEED = 0.6, BOT_CAP = 3;   // bots earn less xp a thing than you, and stop growing at BOT_CAP times the size their place suits
let ACTIVE = [], boardT = 0, dyingBots = [];
function botSetXp(b, xp) {                                        // a bot's level goes with its size, and stops at its cap: 1.4 times what the place suits near the start, BOT_CAP times further out
  const d = Math.hypot(b.spec.x, b.spec.z), cap = Math.max(W.R0 * W.botScale(d) * (d < 150 ? 1.4 : BOT_CAP), b.spec.r);
  b.xp = Math.min(xp, W.MAXXP, W.xpForRadius(cap)); const p = W.progress(b.xp); b.level = p.level; b.frac = p.frac; b.rt = W.radiusAt(p.level, p.frac);
}
function botGain(b, xp) { b.eaten++; botSetXp(b, b.xp + xp); }
function makeBot(c) {
  const s = c.bot, b = { isBot: true, id: s.id, name: s.name, hex: s.colour, aggr: s.aggr, spec: s, cell: c, x: s.x, z: s.z, vx: 0, vz: 0, r: s.r, rt: s.r, xp: 0, level: 1, frac: 0,
    eaten: 0, alive: true, dying: 0, respawn: 0, prot: 2, think: Math.random() * 0.2, ang: Math.random() * 6.283, dx: 0, dz: 0, sp: 0, mode: 'wander' };
  botSetXp(b, W.xpForRadius(s.r)); b.r = b.rt;
  return b;
}
function bestFood(b) {                                            // the thing worth most, for its distance, that b can eat and is near
  const reach = 14 * b.r; let best = null, bs = 0;
  for (const c of CELLS.values()) {
    if (b.x < c.x0 - reach || b.x > c.x0 + c.C + reach || b.z < c.z0 - reach || b.z > c.z0 + c.C + reach) continue;
    for (const o of c.objs) {
      if (o.state || !W.canEat(o.r, b.r)) continue;
      const d = Math.hypot(o.x - b.x, o.z - b.z);
      if (d > reach) continue;
      const score = W.xpFor(o.r, b.r) / ((d + b.r) * (d + b.r));
      if (score > bs) { bs = score; best = o; }
    }
  }
  return best;
}
function botThink(b) {
  let flee = null, chase = null, fd = 1e18, cd = 1e18;
  for (const o of [H, ...ACTIVE]) {
    if (o === b || (o === H && state !== 'play')) continue;
    const d = Math.hypot(o.x - b.x, o.z - b.z);
    if (o.r * W.EAT_MAX >= b.r) { if (!(o.prot > 0) && d < (7 + 3 * b.aggr) * o.r && d < fd) { fd = d; flee = o; } }
    else if (b.r * W.EAT_MAX >= o.r && !(o.prot > 0) && d < (4 + 9 * b.aggr) * b.r && d < cd) { cd = d; chase = o; }
  }
  let dx, dz;
  if (flee) { dx = b.x - flee.x; dz = b.z - flee.z; b.sp = 1.2; b.mode = 'flee'; }
  else if (chase) { dx = chase.x - b.x; dz = chase.z - b.z; b.sp = 1; b.mode = 'hunt'; }
  else {
    const f = bestFood(b);
    if (f) { dx = f.x - b.x; dz = f.z - b.z; b.sp = 0.9; b.mode = 'food'; }
    else { b.ang += (Math.random() - 0.5) * 1.6; dx = Math.cos(b.ang); dz = Math.sin(b.ang); b.sp = 0.6; b.mode = 'wander'; }
  }
  const l = Math.hypot(dx, dz) || 1; b.dx = dx / l; b.dz = dz / l;
  if (b.mode !== 'wander') b.ang = Math.atan2(b.dz, b.dx);
}
function botsStep(dt) {
  for (const b of BOTS) { b.d = Math.hypot(b.x - H.x, b.z - H.z); if (!b.alive && b.dying <= 0) { b.respawn -= dt; if (b.respawn <= 0) { const nb = makeBot(b.cell); Object.assign(b, nb, { prot: 3 }); } } }
  ACTIVE = BOTS.filter(b => b.alive).sort((p, q) => p.d - q.d).slice(0, MAXBOTS);
  dyingBots = BOTS.filter(b => b.dying > 0 && b.d < 40 * H.r);
  for (const b of dyingBots) b.dying = Math.max(0, b.dying - dt);
  for (const b of ACTIVE) {
    b.prot = Math.max(0, b.prot - dt);
    b.think -= dt; if (b.think <= 0) { b.think = 0.2 + Math.random() * 0.1; botThink(b); }
    const sp = SPEED * b.r * BOT_SPEED * b.sp, k = Math.min(1, dt * 6);
    b.vx += (b.dx * sp - b.vx) * k; b.vz += (b.dz * sp - b.vz) * k;
    b.x += b.vx * dt; b.z += b.vz * dt;
    b.r += (b.rt - b.r) * Math.min(1, dt * 6);
  }
  duels();
}
function duels() {                                                // one hole swallowing another, one a frame
  const hs = [H, ...ACTIVE];
  for (const a of hs) for (const b of hs) {
    if (a === b || b.prot > 0 || a.r * W.EAT_MAX < b.r) continue;
    if (Math.hypot(a.x - b.x, a.z - b.z) <= W.swallowDist(b.r, a.r)) { swallowHole(a, b); return; }
  }
}
function swallowHole(a, b) {
  if (b === H && ADMIN && GOD) return;                            // admin mode: you can't be swallowed
  const xp = 3 * W.xpFor(b.r, a.r);
  const times = b.deaths | 0;                                     // how often this bot has been swallowed before
  if (b === H) killPlayer(a);
  else { b.alive = false; b.dying = 0.6; b.respawn = RESPAWN; b.deaths = times + 1; }
  if (a === H) {
    gain(xp, 1); H.kills++; stat().kills++; profileDirty = true;
    const pay = W.killPay(b.r, times); earnCoins(pay);
    toast('You swallowed ' + b.name + '  +' + coinText(pay) + ' coins', 1.8); sfx('bot');
  } else botGain(a, xp * BOT_XP);
}
function killPlayer(by) {
  H.deaths++; stat().deaths++; profileDirty = true;
  setXp(H.xp / 2); H.r = H.rt;
  const ang = Math.atan2(H.z - by.z, H.x - by.x), away = 10 * by.r;
  H.x += Math.cos(ang) * away; H.z += Math.sin(ang) * away; H.vx = H.vz = 0; H.prot = 4;
  plan(); makeCells(200);
  toast('Swallowed by ' + by.name + '. You lost half your xp.', 3.2); sfx('lose');
}
const _v = new THREE.Vector3();
function updateHoles() {                                          // the holes the ground is cut out for, and their pits and rings
  const list = [H, ...ACTIVE];
  for (let i = 0; i < list.length; i++) UN.uHoles.value[i].set(list[i].x, list[i].z, list[i].r);
  UN.uNH.value = list.length;
  placeVisual(VIS[0], H.x, H.z, H.r, true);
  const show = [...ACTIVE, ...dyingBots.filter(b => ACTIVE.indexOf(b) < 0)].slice(0, MAXBOTS);
  while (VIS.length <= show.length) VIS.push(makeVisual(0xffffff));
  for (let i = 0; i < show.length; i++) { const b = show[i], v = VIS[i + 1]; v.mat.color.set(b.hex); placeVisual(v, b.x, b.z, b.r * (b.alive ? 1 : b.dying / 0.6), true); }
  for (let i = show.length + 1; i < VIS.length; i++) placeVisual(VIS[i], 0, 0, 1, false);
}
const LB = [];
function updateLabels() {                                         // a name and level above each active bot; red if it could swallow you, green if you could swallow it
  const box = $('#labels');
  for (let i = 0; i < MAXBOTS; i++) {
    let el = LB[i];
    if (!el) { el = LB[i] = document.createElement('div'); el.className = 'botLabel'; box.appendChild(el); }
    const b = ACTIVE[i];
    if (!b || state === 'title') { el.hidden = true; continue; }
    _v.set(b.x, 0, b.z).project(camera);
    const x = (_v.x * 0.5 + 0.5) * innerWidth, y = (-_v.y * 0.5 + 0.5) * innerHeight, sr = b.r / CAM.h * innerHeight / 2;
    if (x < -60 || x > innerWidth + 60 || y < -30 || y > innerHeight + 30) { el.hidden = true; continue; }
    el.hidden = false; el.style.left = x + 'px'; el.style.top = (y - sr * 0.9 - 14) + 'px';
    const txt = b.name + ' ' + b.level; if (el.textContent !== txt) el.textContent = txt;
    el.style.color = b.hex; el.dataset.danger = b.r * W.EAT_MAX >= H.r ? '1' : H.r * W.EAT_MAX >= b.r ? '2' : '0';
  }
}
function updateBoard(dt) {                                        // the biggest holes near you
  boardT -= dt; if (boardT > 0) return; boardT = 0.5;
  const box = $('#board');
  if (state !== 'play' || !ACTIVE.length) { box.hidden = true; return; }
  const rows = [{ name: 'You', level: H.level, r: H.r, you: true }, ...ACTIVE.map(b => ({ name: b.name, level: b.level, r: b.r, hex: b.hex }))].sort((p, q) => q.r - p.r).slice(0, 6);
  box.hidden = false; box.textContent = '';
  rows.forEach((o, i) => { const d = document.createElement('div'); d.className = o.you ? 'you' : ''; d.textContent = (i + 1) + '. ' + o.name + '  ' + o.level; if (o.hex) d.style.color = o.hex; box.appendChild(d); });
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
  if (H.level > H.best) { let c = 0; for (let L = H.best + 1; L <= H.level && L <= H.best + 3000; L++) c += W.levelPay(L); H.best = H.level; earnCoins(c); }   // only levels you have not reached before pay, so dying and climbing again earns nothing
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
  else if (kind === 'bot') [660, 880, 1100].forEach((f, i) => blip(f, 0.1, 'square', 0.1, 0, i * 0.05));
  else if (kind === 'lose') [330, 247, 185, 139].forEach((f, i) => blip(f, 0.2, 'sawtooth', 0.1, 0.8, i * 0.1));
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
  if (k === 'escape') { e.preventDefault(); if (!$('#admin').hidden) closeAdmin(); else if (!$('#skins').hidden) closeSkins(); else if (!$('#settings').hidden) closeSettings(); else if (state === 'play') openPause(); else if (state === 'pause') closePause(); return; }
  if (KEYMAP[k]) { IN.keys[KEYMAP[k]] = true; if (k.startsWith('arrow')) e.preventDefault(); }
  if (k === 'm' && !e.repeat && (state === 'play' || state === 'pause') && $('#settings').hidden && $('#skins').hidden && $('#admin').hidden) { setMouse(!S.mouse); if (state === 'play') toast('Mouse steering ' + (S.mouse ? 'on' : 'off'), 1.4); }
});
addEventListener('keyup', e => { const k = KEYMAP[e.key.toLowerCase()]; if (k) IN.keys[k] = false; });
addEventListener('blur', () => { IN.keys = {}; IN.touch = null; $('#stick').hidden = true; });
function setMouse(on) { S.mouse = !!on; if (!S.mouse) IN.mouse = false; saveS(); if (!$('#settings').hidden) renderSettings(); }
function steer() {                                                // a push on the screen (right, up), each from -1 to 1
  const k = IN.keys;
  let ax = (k.r ? 1 : 0) - (k.l ? 1 : 0), ay = (k.u ? 1 : 0) - (k.d ? 1 : 0);
  if (ax || ay) { const l = Math.hypot(ax, ay); return [ax / l, ay / l]; }
  if (IN.touch) {
    const dx = IN.touch.x - IN.touch.x0, dy = -(IN.touch.y - IN.touch.y0), l = Math.hypot(dx, dy), m = clamp((l - 6) / 60, 0, 1);
    $('#stick i').style.transform = `translate(${clamp(dx, -40, 40)}px,${clamp(-dy, -40, 40)}px)`;
    return l ? [dx / l * m, dy / l * m] : [0, 0];
  }
  if (IN.mouse && S.mouse) {
    const dx = IN.mx - innerWidth / 2, dy = -(IN.my - innerHeight / 2), l = Math.hypot(dx, dy), m = clamp((l / Math.min(innerWidth, innerHeight) - 0.06) / 0.22, 0, 1);
    return l ? [dx / l * m, dy / l * m] : [0, 0];
  }
  return [0, 0];
}
const SPEED = 6.5;                                                // hole radii a second
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
  postMat.uniforms.uRange.value = camera.far - camera.near;
  postMat.uniforms.uEdge.value = 0.1 * H.r;
  updateHoles();
}

// ------------------------------------------------------------------ screens
let state = 'title';                                              // title, play or pause
let MODE = 'normal';                                              // the game being played: 'normal' (the endless map) or 'quick' (one fixed scale, no level cap, extremely fast growth)
const SAVE_KEYS = { normal: 'retroHole.save', quick: 'retroHole.saveQuick' };
const saveKey = mode => SAVE_KEYS[mode] + (ADMIN ? 'Admin' : '');
function readSave(mode = MODE) {
  try {
    const s = JSON.parse(localStorage.getItem(saveKey(mode)) || 'null');
    if (s && s.v === 1 && isFinite(s.x) && isFinite(s.z) && s.xp >= 0) return s;
  } catch (e) {}
  return null;
}
function save() {
  if (profileDirty) saveProfile();
  if (state === 'title') return;
  try { localStorage.setItem(saveKey(MODE), JSON.stringify({ v: 1, x: H.x, z: H.z, xp: H.xp, eaten: H.eaten, k: H.kills, d: H.deaths, b: H.best })); } catch (e) {}
}
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
  if (ACTIVE.length) hint('bots', 'Other holes are competing with you. A bigger hole can swallow you, and you can swallow a smaller one: red names are bigger, green are smaller.', 9);
  if (H.eaten === 1) hint('first', 'Nicely done. Everything smaller than your hole falls in. Each thing eaten makes you bigger.');
  if (H.level >= 4) hint('far', MODE === 'quick' ? 'Everything is the same size everywhere. The biggest things (towers, dinosaurs, giants) are further from the start.' : 'Walking away from the start finds bigger things to eat. Things get bigger the further out you go.');
  if (H.level >= 12) hint('area', 'Villages, forests and cities each have their own things. Big things that block your view fade out while you are under them.');
}
function startGame(fresh, mode = 'normal') {
  ensureAudio();
  clearWorld();
  W.setMode(mode); MODE = mode;                                   // the mode is set before any cell is made
  const s = fresh ? null : readSave(mode);
  Object.assign(H, { x: s ? s.x : 0, z: s ? s.z : 0, vx: 0, vz: 0, eaten: s ? s.eaten | 0 : 0, kills: s ? s.k | 0 : 0, deaths: s ? s.d | 0 : 0 });
  setXp(s ? s.xp : 0); H.r = H.rt; H.best = Math.max(H.level, s ? s.b | 0 : 0); clearBits(); popT = popSum = 0; $('#coinPop').classList.remove('on');
  state = 'play'; lastHud = ''; IN.mouse = false; H.prot = 8; ACTIVE = []; dyingBots = [];   // a few seconds before bots can swallow you                // the pointer is ignored until it moves, so the click on Play does not steer
  $('#title').hidden = true; $('#pause').hidden = true; $('#hud').hidden = false; $('#ver').hidden = true;
  plan(); makeCells(400); updateGround(); updateCamera(0, true);
  if (fresh) { try { localStorage.removeItem(saveKey(mode)); } catch (e) {} }
  $('#wMode').hidden = mode !== 'quick'; $('#wAdmin').hidden = !ADMIN;
  hint('steer', 'Steer with the mouse, WASD or the arrow keys, or touch and drag. Eat things smaller than your hole.', 9);
  progressHints();
  save();
}
function rebuildWorld() {                                         // the cells made again round the hole; a bot is only made while the game is 'play', so a paused game counts as playing for this
  const s = state; if (s === 'pause') state = 'play';
  clearWorld(); plan(); makeCells(400); updateGround(); updateCamera(0, true);
  state = s;
}
function returnToStart() { H.x = 0; H.z = 0; H.vx = H.vz = 0; rebuildWorld(); save(); closePause(); toast('Back at the start', 1.6); }
function showTitle() {
  save();
  state = 'title';
  clearWorld();
  W.setMode('quick'); const q = readSave('quick'), ql = q ? W.progress(q.xp).level : 0;     // the title shows each game's level
  W.setMode('normal'); MODE = 'normal';                            // and its own world is the normal one
  Object.assign(H, { x: 0, z: 0, vx: 0, vz: 0, eaten: 0, kills: 0, deaths: 0 }); setXp(0); H.r = H.rt; H.best = 1; clearBits(); auto = { ang: 0.6 };
  $('#hud').hidden = true; $('#pause').hidden = true; $('#title').hidden = false; $('#ver').hidden = false;
  const s = readSave();
  $('#bPlay').textContent = s ? 'Continue (Level ' + W.progress(s.xp).level + ')' : 'Play';
  $('#bNew').hidden = !s;
  $('#bQuick').textContent = q ? 'Continue Quick (Level ' + ql.toLocaleString('en-GB') + ')' : 'Quick Game';
  $('#bQuickNew').hidden = !q;
  $('#bSkins').textContent = 'Skins (' + Math.floor(PROFILE.coins).toLocaleString('en-GB') + ' coins)';
  plan(); makeCells(400); updateGround(); updateCamera(0, true);
}
function openPause() { if (state !== 'play') return; state = 'pause'; save(); $('#bAdmin').hidden = !ADMIN; $('#pause').hidden = false; IN.touch = null; $('#stick').hidden = true; }
function closePause() { if (state !== 'pause') return; state = 'play'; IN.mouse = false; $('#pause').hidden = true; }
let settingsFrom = null;
function openSettings() { settingsFrom = state; $('#settings').hidden = false; renderSettings(); }
function closeSettings() { $('#settings').hidden = true; }
const OPTIONS = [
  { key: 'mouse', label: 'Mouse Steering', vals: [[true, 'On'], [false, 'Off']] },
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
      b.onclick = () => { S[o.key] = v; if (o.key === 'mouse') IN.mouse = false; saveS(); if (o.key === 'pixel') resize(); applyLook(); renderSettings(); sfx('ui'); };
      seg.appendChild(b);
    }
    row.appendChild(seg); box.appendChild(row);
  }
}
// ------------------------------------------------------------------ the Skins screen
// Skins (the hole's ring and pit), Effects (what flies up when something falls in) and Stats. Bought with coins; buying
// puts it on at once. Opened from the title screen and the menu.
let skTab = 'skin';
const kdText = s => (s.deaths ? (s.kills / s.deaths).toFixed(1) : String(s.kills));
function drawPreview(cv, kind, it) {                              // a small picture of a skin or an effect, a pixel at a time
  const N = 28, g = cv.getContext('2d'); cv.width = cv.height = N;
  g.fillStyle = '#0d0a1c'; g.fillRect(0, 0, N, N);
  if (kind === 'skin') {
    const top = new THREE.Color(it.pit[0]), bot = new THREE.Color(it.pit[1]), c = new THREE.Color();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = x + 0.5 - N / 2, dy = y + 0.5 - N / 2, d = Math.hypot(dx, dy);
      if (d <= 8.5) c.copy(top).lerp(bot, d / 8.5);
      else if (d <= 12.5) ringColour(it, Math.floor((Math.atan2(dy, dx) / (2 * Math.PI) + 1) % 1 * RING_SEG), c);
      else continue;
      g.fillStyle = '#' + c.getHexString(); g.fillRect(x, y, 1, 1);
    }
  } else if (it.n) {
    const spots = [[6, 20], [11, 9], [15, 17], [19, 6], [22, 14], [9, 15], [17, 11], [21, 21], [13, 4], [5, 8], [24, 9], [12, 23]];
    spots.forEach(([x, y], i) => { g.fillStyle = it.bits[i % it.bits.length]; const s = it.size > 0.25 ? 3 : 2; g.fillRect(x, y, s, s); });
  } else { g.strokeStyle = '#6a5a8c'; g.lineWidth = 1; g.strokeRect(4.5, 4.5, N - 9, N - 9); g.beginPath(); g.moveTo(6, 22); g.lineTo(22, 6); g.stroke(); }
}
function renderSkins() {
  $('#skCoins').textContent = Math.floor(PROFILE.coins).toLocaleString('en-GB') + ' coins';
  const tabs = $('#skTabs'); tabs.textContent = '';
  for (const [id, label] of [['skin', 'Skins'], ['fx', 'Effects'], ['stats', 'Stats']]) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = label; b.dataset.tab = id; b.setAttribute('aria-pressed', String(skTab === id));
    b.onclick = () => { skTab = id; renderSkins(); sfx('ui'); }; tabs.appendChild(b);
  }
  const grid = $('#skGrid'), stats = $('#skStats'); grid.textContent = ''; stats.textContent = '';
  grid.hidden = skTab === 'stats'; stats.hidden = skTab !== 'stats';
  if (skTab === 'stats') {
    const card = (title, lines) => { const d = document.createElement('div'); d.className = 'skCard'; const h = document.createElement('div'); h.className = 'skName'; h.textContent = title; d.appendChild(h); const r = document.createElement('div'); lines.forEach(([k, v], i) => { if (i) r.append('  '); r.append(k + ' '); const b = document.createElement('b'); b.textContent = v; r.appendChild(b); }); d.appendChild(r); stats.appendChild(d); };
    for (const [m, label] of [['normal', 'Normal Game'], ['quick', 'Quick Game']]) { const s = PROFILE.stats[m]; card(label, [['Kills', s.kills.toLocaleString('en-GB')], ['Deaths', s.deaths.toLocaleString('en-GB')], ['K/D', kdText(s)]]); }
    if (state === 'pause') card('This Run', [['Kills', String(H.kills)], ['Deaths', String(H.deaths)], ['K/D', kdText({ kills: H.kills, deaths: H.deaths })]]);
    card('Collection', [['Skins', PROFILE.owned.skin.length + ' of ' + K.SKINS.length], ['Effects', PROFILE.owned.fx.length + ' of ' + K.EFFECTS.length]]);
    return;
  }
  for (const it of K.KINDS[skTab]) {
    const owned = K.owns(PROFILE, skTab, it.id), worn = PROFILE.wear[skTab] === it.id, rar = K.RARITY[it.rarity];
    const card = document.createElement('div'); card.className = 'skCard'; card.dataset.id = it.id; card.style.borderColor = rar.colour;
    const cv = document.createElement('canvas'); drawPreview(cv, skTab, it);
    const info = document.createElement('div'); info.className = 'skInfo';
    const nm = document.createElement('div'); nm.className = 'skName'; nm.textContent = it.name;
    const rr = document.createElement('div'); rr.className = 'skRar'; rr.textContent = rar.name; rr.style.color = rar.colour;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn';
    if (worn) { b.textContent = 'Worn'; b.setAttribute('aria-pressed', 'true'); }
    else if (owned) { b.textContent = 'Wear'; b.onclick = () => { K.wear(PROFILE, skTab, it.id); saveProfile(); applySkin(); renderSkins(); sfx('ui'); }; }
    else { b.textContent = 'Buy ' + it.price.toLocaleString('en-GB'); b.disabled = PROFILE.coins < it.price; b.onclick = () => { if (K.buy(PROFILE, skTab, it.id)) { saveProfile(); applySkin(); renderSkins(); sfx('level'); } }; }
    info.append(nm, rr, b); card.append(cv, info); grid.appendChild(card);
  }
}
function openSkins() { $('#skins').hidden = false; renderSkins(); }
function closeSkins() { $('#skins').hidden = true; if (state === 'title') showTitleLabels(); }
function showTitleLabels() { $('#bSkins').textContent = 'Skins (' + Math.floor(PROFILE.coins).toLocaleString('en-GB') + ' coins)'; }
// ------------------------------------------------------------------ admin mode
// For the owner, to try everything. The word is never in this file, only the SHA-256 fingerprint of 'retroRack:' plus
// the word in lower case (the same fingerprint as Retro Rack's and Retro Set's, so one word opens all three). Typing the
// word on the title screen, with no box to type it in, switches admin mode on or off. While it is on the game uses a test
// profile (all skins, 100,000 coins) and test saves, and the menu has an Admin panel: set the level, add coins, a hole
// that cannot be swallowed, and a jump to any area.
const ADMINW = { print: 'f5fbd99c8a9a458d2267847deb9aab64fd2f699c0746cea014e74f8cc48e6ee5' };
let typed = '';
async function isAdminWord(v) {
  if (!v || v.length > 40 || !(window.crypto && crypto.subtle)) return false;
  try { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('retroRack:' + v.trim().toLowerCase())); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('') === ADMINW.print; } catch (e) { return false; }
}
let verTimer = 0;
function setAdmin(on) {
  if (profileDirty) saveProfile();                                // anything unsaved in the profile in use now is kept before the other one is loaded
  ADMIN = !!on; GOD = false;
  try { localStorage.setItem('retroHole.admin', ADMIN ? '1' : '0'); } catch (e) {}
  PROFILE = loadProfile(); applySkin();
  showTitle();
  $('#ver').textContent = ADMIN ? 'Admin mode on: a test profile and test saves are in use.' : 'Admin mode off: your own profile and saves are back.';
  clearTimeout(verTimer); verTimer = setTimeout(() => { $('#ver').textContent = verText(); }, 4000);
}
addEventListener('keydown', async e => {                          // every key typed on the title screen goes into a short buffer; any ending of it may be the word
  if (state !== 'title' || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || !$('#settings').hidden || !$('#skins').hidden) return;
  typed = (typed + e.key).slice(-40);
  const s = typed;
  for (let i = 0; i < s.length; i++) if (await isAdminWord(s.slice(i))) { if (state === 'title' && typed === s) { typed = ''; setAdmin(!ADMIN); } return; }
});
const AREAS = Object.keys(W.BIOMES);
function findArea(area) {                                         // the nearest point of an area, searching outwards in rings
  for (let rho = 0; rho < 40000; rho += Math.max(30, rho * 0.08)) {
    const n = Math.max(1, Math.ceil(2 * Math.PI * rho / 50));
    for (let k = 0; k < n; k++) { const a = k / n * 6.2832, x = H.x + rho * Math.cos(a), z = H.z + rho * Math.sin(a); if (W.biomeAt(x, z) === area) return { x, z }; }
  }
  return null;
}
function jumpTo(x, z) { H.x = x; H.z = z; H.vx = H.vz = 0; rebuildWorld(); save(); }
function adminSetLevel(L) {
  L = clamp(Math.floor(+L) || 1, 1, W.MAXLV === Infinity ? 100000 : W.MAXLV);
  setXp(W.cum(L)); H.r = H.rt; H.best = Math.max(H.best, L); lastHud = ''; rebuildWorld(); save();   // the cells are made again for the new size (cells made for a much bigger hole lack the small things)
  return L;
}
function renderAdmin() {
  const go = $('#adGo'); go.textContent = '';
  for (const a of AREAS) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = W.BIOMES[a].name; b.dataset.area = a; b.onclick = () => { const f = findArea(a); if (!f) { toast('No ' + W.BIOMES[a].name + ' found', 1.6); return; } closeAdmin(); jumpTo(f.x, f.z); closePause(); toast(W.BIOMES[a].name, 1.4); }; go.appendChild(b); }
  const s = document.createElement('button'); s.type = 'button'; s.className = 'btn'; s.textContent = 'Start'; s.dataset.area = 'start'; s.onclick = () => { closeAdmin(); jumpTo(0, 0); closePause(); }; go.appendChild(s);
  for (const b of $('#adGod').children) b.setAttribute('aria-pressed', String((b.dataset.v === '1') === GOD));
  $('#adLevel').max = W.MAXLV === Infinity ? 100000 : W.MAXLV; $('#adLevel').value = H.level;
}
function openAdmin() { if (!ADMIN) return; $('#admin').hidden = false; renderAdmin(); }
function closeAdmin() { $('#admin').hidden = true; }
$('#bAdmin').onclick = openAdmin; $('#bAdminClose').onclick = closeAdmin;
$('#adSetLevel').onclick = () => { $('#adLevel').value = adminSetLevel($('#adLevel').value); sfx('ui'); };
$('#adLevel').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') $('#adSetLevel').click(); if (e.key === 'Escape') closeAdmin(); });
$('#adCoins').onclick = () => { earnCoins(100000); sfx('level'); };
for (const b of $('#adGod').children) b.onclick = () => { GOD = b.dataset.v === '1'; renderAdmin(); sfx('ui'); };
$('#bPlay').onclick = () => startGame(false);
$('#bNew').onclick = () => startGame(true);
$('#bQuick').onclick = () => startGame(false, 'quick');
$('#bQuickNew').onclick = () => startGame(true, 'quick');
$('#bSkins').onclick = $('#bSkins2').onclick = openSkins; $('#bSkinsClose').onclick = closeSkins;
$('#bSet').onclick = openSettings; $('#bSet2').onclick = openSettings; $('#bSetClose').onclick = closeSettings;
$('#bMenu').onclick = openPause; $('#bResume').onclick = closePause;
$('#bQuit').onclick = showTitle; $('#bHome').onclick = returnToStart;
document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); if (state === 'play') openPause(); } });
addEventListener('pagehide', save);
addEventListener('resize', () => { resize(); lastHud = ''; });
const verText = () => 'Version ' + BUILD + (ADMIN ? '  /  Admin mode' : '');
$('#ver').textContent = verText();

// ------------------------------------------------------------------ the screen's numbers
let lastHud = '';
function hud() {
  if (state === 'title') return;
  const p = H.level >= W.MAXLV ? 1 : H.frac, d = Math.hypot(H.x, H.z), b = W.BIOMES[W.biomeAt(H.x, H.z)].name;
  const key = [H.level, Math.round(p * 500), H.eaten, Math.round(H.r * 100), Math.round(d), b, H.kills, H.deaths, Math.floor(PROFILE.coins)].join();
  if (key === lastHud) return; lastHud = key;
  $('#lvNum').textContent = 'Level ' + H.level.toLocaleString('en-GB');
  $('#lvSize').textContent = W.fmtLen(H.r * 2) + ' wide';
  $('#xpFill').style.width = (p * 100).toFixed(1) + '%';
  $('#lvEaten').textContent = 'Eaten ' + H.eaten.toLocaleString('en-GB');
  $('#lvKD').textContent = 'Kills ' + H.kills.toLocaleString('en-GB') + ' / Deaths ' + H.deaths.toLocaleString('en-GB');
  $('#lvCoins').textContent = Math.floor(PROFILE.coins).toLocaleString('en-GB') + ' coins';
  { const l = $('#lvl'); $('#board').style.top = (l.offsetTop + l.offsetHeight + 8) + 'px'; }   // the scoreboard sits under the level panel, whatever height that has (on a narrow screen the kills line wraps)
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
    H.prot = Math.max(0, H.prot - dt);
    wander(dt, now); if (state === 'play') botsStep(dt); eatStep(); fallStep(dt); fadeStep(dt); bitsStep(dt); if (state === 'play' && MODE !== 'quick') lostCheck(dt);
    if (popT > 0) { popT -= dt; $('#coinPop').textContent = '+' + coinText(popSum); $('#coinPop').classList.toggle('on', popT > 0); if (popT <= 0) popSum = 0; }
    saveT += dt; if (saveT > 5) { saveT = 0; save(); }
  }
  updateGround(); updateCamera(dt, false);
  for (const p of POOLS) if (p) p.flush();
  const pulse = 0.5 + 0.5 * Math.sin(now / 260);
  { const br = 0.88 + 0.12 * pulse; VIS[0].mat.color.setRGB(br, br, br); }
  { const sp = (K.find('skin', PROFILE.wear.skin) || K.SKINS[0]).spin; if (sp && !reduceMotion) VIS[0].a.rotation.y += sp * dt; }
  VIS[0].a.visible = H.prot <= 0 || Math.floor(now / 110) % 2 === 0;   // your ring blinks while you are protected
  hud(); updateLabels(); updateBoard(dt);
  renderer.info.reset();
  renderer.setRenderTarget(rt); renderer.render(scene, camera);
  drawn = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);
}

// ------------------------------------------------------------------ for the tests
window.__rh = {
  wanderOnce(dt) { wander(dt, performance.now()); }, get fading() { return FADING.size; }, BOTS, get active() { return ACTIVE; }, get dying() { return dyingBots; }, VIS, UN,
  get state() { return state; }, H, S, CELLS, FALL, get frames() { return frames; }, get drawn() { return drawn; }, get objects() { return objTotal; },
  get queue() { return queue.length; }, get tile() { return { size: tileSize, n: tileN }; }, W, BUILD,
  get mode() { return MODE; }, ADMINW, get admin() { return ADMIN; }, get god() { return GOD; }, openAdmin, closeAdmin, adminSetLevel, findArea, isAdminWord, get profile() { return PROFILE; }, K, openSkins, closeSkins, saveProfile, applySkin, earnCoins, get bits() { return bitsLive; }, spawnBits, COIN_TY, start: startGame, title: showTitle, pause: openPause, resume: closePause, home: returnToStart, speedRef,
  teleport(x, z) { H.x = x; H.z = z; H.vx = H.vz = 0; plan(); makeCells(1000); },
  setXp(xp) { setXp(xp); H.r = H.rt; },
  nearestEdible(re) {                                              // the nearest thing the hole can eat (only types matching re, if given)
    let best = null, bd = 1e30;
    for (const c of CELLS.values()) for (const o of c.objs) { if (o.state || !W.canEat(o.r, H.r) || (re && !re.test(W.TYPES[o.ty].id))) continue; const d = (o.x - H.x) ** 2 + (o.z - H.z) ** 2; if (d < bd) { bd = d; best = o; } }
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

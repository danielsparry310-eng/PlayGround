import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createTextureSet } from './textures.js';
import { createWorld } from './world.js';
import { Effects } from './effects.js';
import { EnemyManager } from './enemies.js';
import { Player } from './player.js';
import { WeaponSystem } from './weapons.js';
import { AudioEngine } from './audio.js';
import { UI } from './ui.js';
import { clamp, pick, rand, formatScore, formatTime } from './utils.js';

const canvas = document.getElementById('game-canvas');
const params = new URLSearchParams(location.search);
const autostart = params.get('autostart') === '1';

// ------------------------------------------------------------------ renderer
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
} catch (error) {
  document.getElementById('load-status').textContent = 'WEBGL2 IS REQUIRED — ENABLE HARDWARE ACCELERATION';
  throw error;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setClearColor(0x0a0f15, 1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0f15);
const camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.05, 700);
camera.position.set(0, 1.72, 30);
scene.add(camera);

// The viewmodel lives in its own scene so it can be lit independently of the
// world and never clips into level geometry.
const viewScene = new THREE.Scene();
const viewCamera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.01, 10);
viewScene.add(viewCamera);

// -------------------------------------------------------------------- audio
const audio = new AudioEngine();

// -------------------------------------------------------------------- state
const G = {
  started: false,
  running: false,
  paused: false,
  over: false,
  dying: false,
  win: false,
  time: 0,
  wave: 1,
  totalWaves: 5,
  waveState: 'idle',
  waveTimer: 0,
  spawnQueue: [],
  spawnTimer: 0,
  spawnInterval: 0.55,
  score: 0,
  kills: 0,
  headshots: 0,
  best: 0,
  pickups: [],
  finishTimer: 0,
  finishWin: false,
  hadLock: false,
  fps: 60,
  minimapTimer: 0,
  lastShotHit: false,
  bossSpawned: false,
};

const WAVES = [
  [['grunt', 4]],
  [['grunt', 6], ['rusher', 2]],
  [['grunt', 7], ['rusher', 3], ['heavy', 1]],
  [['grunt', 9], ['rusher', 4], ['heavy', 2]],
  [['boss', 1], ['grunt', 8], ['rusher', 4], ['heavy', 2]],
];

// ---------------------------------------------------------------------- UI
const ui = new UI({
  onStart: () => startGame(),
  onResume: () => resumeGame(),
  onRestart: () => startGame(),
  onQuit: () => quitToMenu(),
  onAgain: () => startGame(),
  onMenu: () => quitToMenu(),
  onPause: () => pauseGame(),
  onSettings: (s) => {
    audio.setVolume(s.volume);
    if (typeof player !== 'undefined' && player) {
      player.sensitivity = s.sensitivity;
      player.invertY = Boolean(s.invert);
    }
    applyQuality(s.quality);
  },
  onUIHover: () => { if (audio.ctx) audio.ui(false); },
  onUIClick: () => { if (audio.ctx) audio.ui(true); },
});

try { G.best = Number(localStorage.getItem('blacksite.best') || 0); } catch {}
ui.updateBest(G.best);

let T = null;
let world = null;
let effects = null;
let enemies = null;
let player = null;
let weapons = null;
let composer = null;
let bloomPass = null;
let gradePass = null;
let renderPass = null;

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uDamage: { value: 0 },
    uVignette: { value: 1 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uDamage;
    uniform float uVignette;
    uniform vec2 uResolution;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float d = dot(c, c);
      float ab = 0.0009 + uDamage * 0.006;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ab).b;
      // subtle filmic grade: cool shadows, warm highlights
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, 1.14);
      col = (col - 0.5) * 1.04 + 0.5;
      col.rgb *= vec3(1.035, 1.0, 0.965);
      col.rgb += vec3(0.004, 0.009, 0.018) * (1.0 - l);
      col.rgb -= vec3(0.012, 0.006, 0.0) * smoothstep(0.55, 1.0, l);
      // vignette
      float vig = smoothstep(0.92, 0.14, d);
      col *= mix(1.0 - 0.52 * uVignette, 1.0, vig);
      // damage bloom at the edges
      float edge = smoothstep(0.06, 0.36, d);
      col += vec3(0.55, 0.025, 0.005) * uDamage * edge;
      // grain
      float n = fract(sin(dot(uv * uResolution + uTime * 13.0, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * 0.012;
      gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
    }`,
};

// ------------------------------------------------------------------- input
const keys = Object.create(null);
const input = {
  forward: false, back: false, left: false, right: false,
  jump: false, crouch: false, sprint: false,
  fire: false, aim: false, reload: false,
};
const touch = {
  forward: 0, right: 0, fire: false, sprint: false,
  reloadQueued: false, jumpQueued: false,
};
let mouseFire = false;
let mouseAim = false;
let stickPointer = null;
let stickCenter = { x: 0, y: 0 };
let lookPointer = null;
let lookLast = { x: 0, y: 0 };

function readInput() {
  const left = keys.KeyA || keys.ArrowLeft;
  const right = keys.KeyD || keys.ArrowRight;
  const fwd = keys.KeyW || keys.ArrowUp;
  const back = keys.KeyS || keys.ArrowDown;
  input.forward = Boolean(fwd) || touch.forward > 0.18;
  input.back = Boolean(back) || touch.forward < -0.18;
  input.left = Boolean(left) || touch.right < -0.18;
  input.right = Boolean(right) || touch.right > 0.18;
  input.crouch = Boolean(keys.ControlLeft || keys.ControlRight || keys.KeyC);
  input.sprint = Boolean(keys.ShiftLeft || keys.ShiftRight) || touch.sprint;
  input.jump = Boolean(keys.Space) || touch.jumpQueued;
  input.fire = mouseFire || touch.fire;
  input.aim = mouseAim;
  input.reload = Boolean(keys.KeyR) || touch.reloadQueued;
}

function requestLock() {
  if (ui.isTouch) return;
  try {
    const result = canvas.requestPointerLock?.();
    if (result && result.catch) result.catch(() => {});
  } catch {}
}

function pauseGame() {
  if (!G.started || !G.running || G.paused || G.over || G.dying) return;
  G.paused = true;
  readInput();
  input.fire = false;
  mouseFire = false;
  mouseAim = false;
  touch.fire = false;
  ui.showPause();
  ui.updatePauseStats(stats(), Math.round(G.fps));
  try { document.exitPointerLock?.(); } catch {}
  if (audio.ctx) audio.ui(true);
}

function resumeGame() {
  if (!G.started || G.over) return;
  G.paused = false;
  ui.hidePause();
  lastFrame = performance.now();
  if (!ui.isTouch) requestLock();
  if (audio.ctx) audio.resume();
}

function quitToMenu() {
  G.started = false;
  G.running = false;
  G.paused = false;
  G.over = false;
  G.dying = false;
  G.waveState = 'idle';
  G.finishTimer = 0;
  if (enemies) enemies.clear();
  if (effects) effects.clear();
  clearPickups();
  if (player) player.reset(world.playerSpawn);
  if (weapons) weapons.reset();
  ui.showMenu();
  ui.hint(false);
  try { document.exitPointerLock?.(); } catch {}
  if (audio.ctx) audio.ui(true);
}

function stats() {
  const accuracy = weapons && weapons.shots ? Math.round((weapons.hits / weapons.shots) * 100) : 0;
  return {
    wave: G.wave, score: G.score, kills: G.kills, headshots: G.headshots,
    accuracy, time: G.time, best: Math.max(G.best, G.score), win: G.win,
  };
}

// ------------------------------------------------------------------- start
function startGame() {
  audio.init();
  audio.resume();
  audio.setVolume(ui.settings.volume);
  audio.ui(true);

  G.started = true;
  G.running = true;
  G.paused = false;
  G.over = false;
  G.dying = false;
  G.win = false;
  G.time = 0;
  G.wave = 1;
  G.waveState = 'pre';
  G.waveTimer = 0.85;
  G.spawnQueue = [];
  G.spawnTimer = 0;
  G.spawnInterval = 0.55;
  G.score = 0;
  G.kills = 0;
  G.headshots = 0;
  G.bossSpawned = false;
  G.minimapTimer = 0;
  G.finishTimer = 0;

  enemies.clear();
  effects.clear();
  clearPickups();
  resetBarrels();
  player.reset(world.playerSpawn);
  player.sensitivity = ui.settings.sensitivity;
  player.invertY = Boolean(ui.settings.invert);
  weapons.reset();
  applyQuality(ui.settings.quality);

  ui.showHUD();
  ui.hidePause();
  ui.setHealth(player.health, player.maxHealth, player.stamina);
  ui.setWave(1, 5, 0);
  ui.setScore(0, 0, 0);
  ui.hint(!ui.isTouch && !document.pointerLockElement);
  if (!ui.isTouch) requestLock();
  lastFrame = performance.now();
}

function finish(win) {
  if (!G.started) return;
  G.win = win;
  G.over = true;
  G.dying = false;
  G.running = false;
  G.paused = false;
  G.waveState = 'idle';
  G.best = Math.max(G.best, G.score);
  try { localStorage.setItem('blacksite.best', String(Math.floor(G.best))); } catch {}
  ui.updateBest(G.best);
  const s = stats();
  ui.showResult(win, s);
  ui.hint(false);
  try { document.exitPointerLock?.(); } catch {}
  if (win) audio.victory(); else audio.defeat();
}

function resetBarrels() {
  for (const b of world.barrels) {
    b.alive = true;
    b.group.visible = true;
    if (!world.colliders.includes(b.collider)) {
      world.colliders.push(b.collider);
      world.occluders.push(b.collider);
    }
  }
}

// ------------------------------------------------------------------- waves
function startWave(n) {
  G.wave = n;
  G.waveState = 'active';
  G.spawnQueue = [];
  const comp = WAVES[Math.min(n, WAVES.length) - 1];
  for (const [type, count] of comp) {
    for (let i = 0; i < count; i++) G.spawnQueue.push(type);
  }
  // shuffle, but make the boss the opening statement of the final wave
  for (let i = G.spawnQueue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [G.spawnQueue[i], G.spawnQueue[j]] = [G.spawnQueue[j], G.spawnQueue[i]];
  }
  if (n === 5) {
    const bi = G.spawnQueue.indexOf('boss');
    if (bi > 0) { G.spawnQueue.splice(bi, 1); G.spawnQueue.unshift('boss'); }
    G.bossSpawned = true;
  }
  G.spawnTimer = n === 5 ? 0.6 : 0.35;
  G.spawnInterval = n === 5 ? 0.7 : 0.55;
  ui.setWave(n, 5, G.spawnQueue.length);
  ui.waveBanner(n, n === 5 ? 'WARDEN PRIME INBOUND' : 'HOSTILES INBOUND');
  audio.waveStart();
}

function chooseSpawn(type) {
  const px = player.position.x, pz = player.position.z;
  let best = null, bestScore = -1;
  for (let attempt = 0; attempt < 10; attempt++) {
    const p = pick(world.spawnPoints);
    const d = Math.hypot(p.x - px, p.z - pz);
    if (d < 13) continue;
    let crowded = false;
    for (const e of enemies.enemies) {
      if (e.state !== 'dead' && Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < 2.2) { crowded = true; break; }
    }
    if (crowded) continue;
    const score = d + rand(0, 8);
    if (score > bestScore) { best = p; bestScore = score; }
  }
  return best || pick(world.spawnPoints);
}

function updateWaves(dt) {
  if (G.dying) return;
  if (G.waveState === 'pre') {
    G.waveTimer -= dt;
    if (G.waveTimer <= 0) startWave(1);
    return;
  }
  if (G.waveState === 'active') {
    if (G.spawnQueue.length > 0) {
      G.spawnTimer -= dt;
      const alive = enemies.aliveCount;
      const maxAlive = G.wave === 5 ? 12 : 10;
      if (G.spawnTimer <= 0 && alive < maxAlive) {
        const type = G.spawnQueue.shift();
        const p = chooseSpawn(type);
        enemies.spawn(type, p, G.wave);
        G.spawnTimer = type === 'boss' ? 1.4 : G.spawnInterval * rand(0.7, 1.15);
      }
    } else if (enemies.aliveCount === 0) {
      // wave clear
      G.waveState = 'clear';
      G.waveTimer = G.wave >= 5 ? 2.2 : 5.4;
      const bonus = 250 * G.wave;
      G.score += bonus;
      ui.toast(`WAVE ${G.wave} CLEARED  //  +${bonus}`, 3000);
      if (G.wave >= 5) {
        ui.waveBanner(5, 'EXTRACTION WINDOW OPEN');
        G.win = true;
      } else {
        spawnSupplies();
        ui.waveBanner(G.wave, 'SECTOR CLEARED — RESUPPLY');
      }
    }
  } else if (G.waveState === 'clear') {
    G.waveTimer -= dt;
    if (G.waveTimer <= 0) {
      if (G.wave >= 5) finish(true);
      else startWave(G.wave + 1);
    }
  }
}

// ----------------------------------------------------------------- pickups
function makePickupMesh(type) {
  const g = new THREE.Group();
  const baseMat = type === 'health'
    ? new THREE.MeshStandardMaterial({ color: 0xd7e4e8, roughness: 0.5, metalness: 0.2 })
    : new THREE.MeshStandardMaterial({ color: 0x4a5136, roughness: 0.65, metalness: 0.35 });
  const accent = type === 'health'
    ? new THREE.MeshStandardMaterial({ color: 0x0c2a18, emissive: 0x55ff9a, emissiveIntensity: 3.2, roughness: 0.3 })
    : new THREE.MeshStandardMaterial({ color: 0x2a2414, emissive: 0xffb030, emissiveIntensity: 3.0, roughness: 0.3 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.36, 0.42), baseMat);
  box.castShadow = true;
  g.add(box);
  if (type === 'health') {
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.43), accent);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.43), accent);
    g.add(c1); g.add(c2);
  } else {
    for (let i = 0; i < 3; i++) {
      const round = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.24, 6), accent);
      round.rotation.z = Math.PI / 2;
      round.position.set(-0.12 + i * 0.12, 0.24, 0);
      g.add(round);
    }
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.glow, color: type === 'health' ? 0x6dffb0 : 0xffb040,
    transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  glow.scale.set(1.4, 1.4, 1);
  g.add(glow);
  return g;
}

function spawnPickup(type, x, z) {
  const mesh = makePickupMesh(type);
  mesh.position.set(x, 0.55, z);
  scene.add(mesh);
  G.pickups.push({ type, mesh, x, z, phase: rand(0, Math.PI * 2), life: 40 });
}

function spawnSupplies() {
  const points = [...world.pickupPoints].sort(() => Math.random() - 0.5);
  const count = player.health < 55 ? 3 : 2;
  for (let i = 0; i < count && i < points.length; i++) {
    const p = points[i];
    const type = i === 0 && player.health < 70 ? 'health' : i % 2 === 0 ? 'ammo' : 'health';
    spawnPickup(type, p.x + rand(-1.5, 1.5), p.z + rand(-1.5, 1.5));
  }
}

function clearPickups() {
  for (const p of G.pickups) scene.remove(p.mesh);
  G.pickups = [];
}

function updatePickups(dt) {
  for (const p of G.pickups) {
    p.life -= dt;
    p.phase += dt;
    p.mesh.rotation.y += dt * 1.5;
    p.mesh.position.y = 0.55 + Math.sin(p.phase * 2) * 0.08;
    p.mesh.children[p.mesh.children.length - 1].material.opacity = 0.4 + Math.sin(p.phase * 3) * 0.15;
    const d = Math.hypot(p.mesh.position.x - player.position.x, p.mesh.position.z - player.position.z);
    if (d < 1.35 && !player.dead) {
      if (p.type === 'health') {
        if (player.health >= player.maxHealth) continue;
        player.heal(38);
        ui.toast('+38 HEALTH', 1600);
      } else {
        let gained = false;
        for (const w of weapons.weapons) {
          const add = Math.ceil(w.def.reserveMax * 0.22);
          if (w.reserve < w.def.reserveMax) { w.reserve = Math.min(w.def.reserveMax, w.reserve + add); gained = true; }
        }
        if (!gained) continue;
        weapons.onAmmo();
        ui.toast('+AMMO RESERVE', 1600);
      }
      G.score += 50;
      audio.pickup();
      scene.remove(p.mesh);
      p.life = 0;
      p.collected = true;
    }
  }
  G.pickups = G.pickups.filter(p => p.life > 0);
}

// ---------------------------------------------------------------- explosions
function explodeBarrel(barrel, depth = 0) {
  if (!barrel || !barrel.alive) return;
  barrel.alive = false;
  barrel.group.visible = false;
  const pos = new THREE.Vector3(barrel.x, 0.6, barrel.z);
  effects.explosion(pos, 6);
  const distToPlayer = Math.hypot(player.position.x - barrel.x, player.position.z - barrel.z);
  audio.explosion(Math.sin(Math.atan2(barrel.x - player.position.x, barrel.z - player.position.z)) * 0.6, distToPlayer);
  player.shake = Math.min(1.6, player.shake + 0.7);
  // remove the physical collider so the wreck is passable
  for (const list of [world.colliders, world.occluders]) {
    const i = list.indexOf(barrel.collider);
    if (i >= 0) list.splice(i, 1);
  }
  // player splash
  if (distToPlayer < 5.6) {
    const dmg = 48 * (1 - distToPlayer / 6.2);
    player.takeDamage(Math.max(6, dmg), pos, 'explosion');
  }
  // enemies
  for (const e of enemies.enemies) {
    if (e.state === 'dead') continue;
    const d = Math.hypot(e.pos.x - barrel.x, e.pos.z - barrel.z);
    if (d < 7) {
      const dmg = 190 * (1 - d / 7.5);
      enemies.damage(e, dmg, false, new THREE.Vector3(e.pos.x, 1.1, e.pos.z), new THREE.Vector3(e.pos.x - barrel.x, 0, e.pos.z - barrel.z).normalize());
    }
  }
  // chain reaction
  if (depth < 3) {
    for (const other of world.barrels) {
      if (!other.alive) continue;
      if (Math.hypot(other.x - barrel.x, other.z - barrel.z) < 4.6) {
        setTimeout(() => explodeBarrel(other, depth + 1), 100 + rand(0, 120));
      }
    }
  }
}

// ------------------------------------------------------------------- combat
function onEnemyDeath(e, headshot) {
  G.kills++;
  if (headshot) G.headshots++;
  const mult = headshot ? 1.5 : 1;
  const points = Math.round(e.type.score * mult * (1 + (G.wave - 1) * 0.05));
  G.score += points;
  ui.killfeed(e.type.name, headshot);
  audio.kill();
  if (e.type.boss) {
    G.score += 1000;
    ui.toast('WARDEN PRIME DESTROYED  //  +1000', 3000);
  }
  if (Math.random() < (e.type.boss ? 1 : 0.15)) {
    const type = player.health < 55 ? 'health' : Math.random() < 0.55 ? 'ammo' : 'health';
    spawnPickup(type, e.pos.x + rand(-0.6, 0.6), e.pos.z + rand(-0.6, 0.6));
  }
}

function onPlayerDamage(amount, angle, kind) {
  ui.damageDirection(angle, amount);
  audio.hurt(Math.sin(angle) * 0.7);
}

function onPlayerDeath() {
  if (G.over || G.dying) return;
  G.dying = true;
  G.finishTimer = 1.5;
  ui.hint(false);
  audio.defeat();
}

// ------------------------------------------------------------------- quality
function applyQuality(quality) {
  const dpr = window.devicePixelRatio || 1;
  const ratio = quality === 'low' ? Math.min(1, dpr) : quality === 'medium' ? Math.min(1.4, dpr) : Math.min(2, dpr);
  renderer.setPixelRatio(ratio);
  if (composer) {
    composer.setPixelRatio(ratio);
    composer.setSize(window.innerWidth, window.innerHeight);
  }
  if (bloomPass) bloomPass.strength = quality === 'low' ? 0.25 : quality === 'medium' ? 0.42 : 0.55;
  if (world?.sun) {
    const want = quality !== 'low';
    if (renderer.shadowMap.enabled !== want) {
      renderer.shadowMap.enabled = want;
      scene.traverse((o) => {
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) m.needsUpdate = true;
        }
      });
    }
  }
}

// -------------------------------------------------------------------- loop
let lastFrame = performance.now();
let fpsAccum = 0, fpsFrames = 0;

function updateGame(dt, now) {
  G.time += dt;
  readInput();
  player.update(dt, input);
  weapons.update(dt, input);
  enemies.update(dt, G.time, player, world);
  effects.update(dt);
  world.update(dt, G.time);
  updatePickups(dt);
  updateWaves(dt);
  if (G.dying) {
    G.finishTimer -= dt;
    if (G.finishTimer <= 0) finish(false);
  }
  audio.update(dt, { health: player.health, playing: true });

  // HUD
  ui.setHealth(player.health, player.maxHealth, player.stamina);
  ui.setWave(G.wave, G.totalWaves, enemies.aliveCount + G.spawnQueue.length);
  const acc = weapons.shots ? Math.round((weapons.hits / weapons.shots) * 100) : 0;
  ui.setScore(G.score, G.kills, acc);
  ui.updateCompass(player.yaw);
  G.minimapTimer -= dt;
  if (G.minimapTimer <= 0) {
    G.minimapTimer = 0.1;
    ui.updateMinimap(player, enemies.enemies, world, world.barrels);
  }
  ui.hint(!ui.isTouch && !document.pointerLockElement && !G.paused && !G.over);
  if (gradePass) {
    gradePass.uniforms.uDamage.value = clamp(player.damageFlash * 0.7 + (player.health < 30 ? 0.18 : 0), 0, 1);
    gradePass.uniforms.uTime.value = now / 1000;
  }

  // one-shot mobile inputs are consumed after the systems read them
  touch.jumpQueued = false;
  touch.reloadQueued = false;
}

function render(now) {
  if (composer) composer.render();
  else renderer.render(scene, camera);
}

function loop(now) {
  requestAnimationFrame(loop);
  const dtRaw = (now - lastFrame) / 1000;
  lastFrame = now;
  const dt = Math.min(0.05, Math.max(0.0001, dtRaw));
  fpsAccum += dtRaw; fpsFrames++;
  if (fpsAccum > 0.5) {
    G.fps = fpsFrames / fpsAccum;
    fpsAccum = 0; fpsFrames = 0;
  }

  if (G.started && !G.paused && !G.over) {
    updateGame(dt, now);
  } else {
    // idle world animation keeps the scene alive under menus / pause
    if (world) world.update(dt, now / 1000);
    if (effects) effects.update(dt);
    if (player && !G.started) {
      // gentle menu camera drift
      player.updateCamera(dt, 0);
    }
    if (gradePass) {
      gradePass.uniforms.uTime.value = now / 1000;
      gradePass.uniforms.uDamage.value = 0;
    }
  }
  render(now);
}

// ------------------------------------------------------------------ events
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  viewCamera.aspect = w / h;
  viewCamera.updateProjectionMatrix();
  renderer.setSize(w, h);
  if (composer) composer.setSize(w, h);
  if (gradePass) gradePass.uniforms.uResolution.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
  ui.updateRotateNotice();
}
window.addEventListener('resize', onResize);

document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (G.paused) { e.preventDefault(); resumeGame(); return; }
    if (G.running && !G.over) { e.preventDefault(); pauseGame(); return; }
  }
  if (!G.started) {
    if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); startGame(); }
    return;
  }
  if (e.code === 'Space') e.preventDefault();
  keys[e.code] = true;
  if (e.code === 'KeyR') { e.preventDefault(); }
  if (e.code === 'Digit1' || e.code === 'Numpad1') weapons?.switchTo(0);
  if (e.code === 'Digit2' || e.code === 'Numpad2') weapons?.switchTo(1);
  if (e.code === 'KeyQ') weapons?.switchTo(weapons.index === 0 ? 1 : 0);
  if (e.code === 'KeyP') { if (G.paused) resumeGame(); else pauseGame(); }
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; });

document.addEventListener('mousemove', (e) => {
  if (!G.started || G.paused || G.over) return;
  if (ui.isTouch) return;
  if (document.pointerLockElement === canvas) {
    player.look(e.movementX || 0, e.movementY || 0);
  }
});

document.addEventListener('mousedown', (e) => {
  if (!G.started) return;
  if (ui.isTouch) return;
  if (G.paused || G.over) return;
  if (document.pointerLockElement !== canvas) {
    requestLock();
    return;
  }
  if (e.button === 0) mouseFire = true;
  if (e.button === 2) mouseAim = true;
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseFire = false;
  if (e.button === 2) mouseAim = false;
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('wheel', (e) => {
  if (!G.started || G.paused || G.over || !weapons) return;
  e.preventDefault();
  weapons.switchTo(weapons.index === 0 ? 1 : 0);
}, { passive: false });

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) {
    G.hadLock = true;
    ui.hint(false);
  } else if (G.hadLock && G.running && !G.paused && !G.over) {
    pauseGame();
  }
});

canvas.addEventListener('click', () => {
  if (G.started && !G.paused && !G.over && !ui.isTouch && document.pointerLockElement !== canvas) requestLock();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.running && !G.paused && !G.over) pauseGame();
});

// ------------------------------------------------------------ mobile controls
function setupMobile() {
  if (!ui.isTouch) return;
  const stick = ui.els['move-stick'];
  const knob = ui.els['move-knob'];
  const look = ui.els['look-zone'];
  const fireBtn = ui.els['btn-fire'];
  const reloadBtn = ui.els['btn-reload'];
  const jumpBtn = ui.els['btn-jump'];
  const sprintBtn = ui.els['btn-sprint'];
  const swapBtn = ui.els['btn-swap'];

  const setStick = (e) => {
    const dx = e.clientX - stickCenter.x;
    const dy = e.clientY - stickCenter.y;
    const max = 42;
    const len = Math.hypot(dx, dy);
    const k = len > max ? max / len : 1;
    const nx = dx * k, ny = dy * k;
    knob.style.transform = `translate(${nx}px, ${ny}px)`;
    touch.right = clamp(nx / max, -1, 1);
    touch.forward = clamp(-ny / max, -1, 1);
    if (Math.hypot(touch.right, touch.forward) < 0.18) { touch.right = 0; touch.forward = 0; }
  };
  stick.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    stickPointer = e.pointerId;
    const r = stick.getBoundingClientRect();
    stickCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    stick.setPointerCapture?.(e.pointerId);
    setStick(e);
  });
  stick.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickPointer) return;
    e.preventDefault();
    setStick(e);
  });
  const endStick = (e) => {
    if (e.pointerId !== stickPointer) return;
    stickPointer = null;
    touch.forward = 0; touch.right = 0;
    knob.style.transform = 'translate(0px, 0px)';
  };
  stick.addEventListener('pointerup', endStick);
  stick.addEventListener('pointercancel', endStick);

  look.addEventListener('pointerdown', (e) => {
    if (lookPointer !== null) return;
    lookPointer = e.pointerId;
    lookLast = { x: e.clientX, y: e.clientY };
    look.setPointerCapture?.(e.pointerId);
  });
  look.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lookPointer) return;
    const dx = e.clientX - lookLast.x;
    const dy = e.clientY - lookLast.y;
    lookLast = { x: e.clientX, y: e.clientY };
    if (G.started && !G.paused && !G.over) player.look(dx * 1.45, dy * 1.45);
  });
  const endLook = (e) => { if (e.pointerId === lookPointer) lookPointer = null; };
  look.addEventListener('pointerup', endLook);
  look.addEventListener('pointercancel', endLook);

  const bindHold = (el, down, up) => {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.classList.add('down'); down(); });
    const end = (e) => { e.preventDefault(); el.classList.remove('down'); up?.(); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', (e) => { if (e.buttons === 0) end(e); });
  };
  bindHold(fireBtn, () => { touch.fire = true; }, () => { touch.fire = false; });
  bindHold(sprintBtn, () => { touch.sprint = true; }, () => { touch.sprint = false; });
  reloadBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); touch.reloadQueued = true; });
  jumpBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); touch.jumpQueued = true; });
  swapBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (weapons) weapons.switchTo(weapons.index === 0 ? 1 : 0);
  });
}

// -------------------------------------------------------------------- boot
function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 16)));
}

async function boot() {
  try {
    ui.setLoading(6, 'GENERATING SURFACE DATA…');
    await nextFrame();
    T = createTextureSet();
    ui.setLoading(32, 'BUILDING BLACKSITE 07…');
    await nextFrame();
    world = createWorld(scene, renderer, T, ui.settings.quality);
    viewScene.environment = scene.environment;
    viewScene.environmentIntensity = 0.55;
    ui.setLoading(55, 'CALIBRATING LIGHTING…');
    await nextFrame();
    effects = new Effects(scene, camera, T);
    enemies = new EnemyManager(scene, effects, audio, T, {
      onDeath: (e, headshot) => onEnemyDeath(e, headshot),
      onPlayerDamage: (amount, pos, kind) => player.takeDamage(amount, pos, kind),
      onEnemyShoot: () => {},
      onEnemyMelee: () => {},
    });
    player = new Player(camera, world, {
      onDamage: (amount, angle, kind) => onPlayerDamage(amount, angle, kind),
      onDeath: () => onPlayerDeath(),
      onFootstep: (index, sprint) => { if (audio.ctx) audio.footstep(sprint); },
    });
    weapons = new WeaponSystem({
      camera, scene, viewScene, viewCamera, player, enemies, world, effects, audio, T,
      callbacks: {
        onAmmo: (mag, reserve, max) => ui.setAmmo(mag, reserve, max),
        onWeapon: (def, mag, reserve) => ui.setWeapon(def, mag, reserve),
        onSpread: (px, ads, reloadProgress, reloading) => ui.setSpread(px, ads, reloadProgress, reloading),
        onReloadStart: () => {},
        onReloadEnd: () => {},
        onShot: (result) => {
          if (result.hit) ui.hitmarker(result.headshot);
          if (result.killed) ui.hitmarker(result.headshot);
          if (result.killed) ui.flashHit();
        },
        onBarrelHit: (barrel, point) => explodeBarrel(barrel),
      },
    });
    player.sensitivity = ui.settings.sensitivity;
    player.invertY = Boolean(ui.settings.invert);
    setupMobile();

    // post-processing
    composer = new EffectComposer(renderer);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(window.innerWidth, window.innerHeight);
    composer.renderTarget1.samples = 4;
    composer.renderTarget2.samples = 4;
    renderPass = new RenderPass(scene, camera);
    bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.55, 0.88);
    gradePass = new ShaderPass(GradeShader);
    gradePass.uniforms.uResolution.value.set(window.innerWidth * renderer.getPixelRatio(), window.innerHeight * renderer.getPixelRatio());
    const outputPass = new OutputPass();
    composer.addPass(renderPass);
    const viewPass = new RenderPass(viewScene, viewCamera);
    viewPass.clear = false;
    viewPass.clearDepth = true;
    composer.addPass(viewPass);
    composer.addPass(bloomPass);
    composer.addPass(gradePass);
    composer.addPass(outputPass);
    applyQuality(ui.settings.quality);

    ui.setLoading(88, 'DEPLOYING SENTINEL UNITS…');
    await nextFrame();
    ui.setLoading(100, 'READY FOR DEPLOYMENT');
    await nextFrame();
    ui.hideLoading();
    ui.showMenu();
    ui.updateRotateNotice();
    onResize();
    requestAnimationFrame(loop);

    // debug / automation surface
    window.__blacksite = {
      game: G, start: startGame, pause: pauseGame, resume: resumeGame, finish,
      player, weapons, enemies, world, effects, audio, ui, scene, camera, renderer, composer,
      look: (dx, dy) => player.look(dx, dy),
      fire: () => weapons.tryFire(),
      spawn: (type, x, z) => enemies.spawn(type, { x, z }, G.wave),
      explode: (i = 0) => explodeBarrel(world.barrels[i]),
      damage: (n) => player.takeDamage(n, null),
      win: () => finish(true),
      lose: () => finish(false),
      setQuality: applyQuality,
      step: (dt = 1 / 60) => { updateGame(dt, performance.now()); },
      renderOnce: () => render(performance.now()),
    };

    if (autostart) setTimeout(() => startGame(), 250);
  } catch (error) {
    console.error(error);
    ui.setLoading(100, `BOOT FAILURE: ${error.message}`);
    const status = document.getElementById('load-status');
    if (status) status.textContent = `BOOT FAILURE — ${error.message}`;
  }
}

boot();

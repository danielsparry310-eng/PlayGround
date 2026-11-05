import * as THREE from 'three';
import { seededRandom, clamp } from './utils.js';

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  // Most procedural texture passes read pixels back for noise/normal generation.
  c.getContext('2d', { willReadFrequently: true });
  return c;
}

function tex(c, repeatX = 1, repeatY = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function noiseOverlay(ctx, w, h, rng, amount, alpha = 0.5) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * amount;
    d[i] = clamp(d[i] + n, 0, 255);
    d[i + 1] = clamp(d[i + 1] + n, 0, 255);
    d[i + 2] = clamp(d[i + 2] + n, 0, 255);
  }
  ctx.putImageData(img, 0, 0);
}

function normalMapFrom(source, strength = 2.2) {
  const w = source.width, h = source.height;
  const sctx = source.getContext('2d');
  const src = sctx.getImageData(0, 0, w, h).data;
  const out = canvas(w, h);
  const octx = out.getContext('2d');
  const img = octx.createImageData(w, h);
  const d = img.data;
  const lum = (x, y) => {
    x = (x + w) % w; y = (y + h) % h;
    const i = (y * w + x) * 4;
    return (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) / 255;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (lum(x + 1, y) - lum(x - 1, y)) * strength;
      const dy = (lum(x, y + 1) - lum(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      d[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      d[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      d[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

function splotches(ctx, w, h, rng, count, colors, radiusMin, radiusMax, alpha = 0.2) {
  for (let i = 0; i < count; i++) {
    const x = rng() * w, y = rng() * h;
    const r = radiusMin + rng() * (radiusMax - radiusMin);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const col = colors[Math.floor(rng() * colors.length)];
    g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${alpha})`);
    g.addColorStop(0.55, `rgba(${col[0]},${col[1]},${col[2]},${alpha * 0.45})`);
    g.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function cracks(ctx, w, h, rng, count, color, width = 1.2) {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    let x = rng() * w, y = rng() * h;
    let angle = rng() * Math.PI * 2;
    ctx.lineWidth = width * (0.4 + rng() * 0.9);
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 8 + Math.floor(rng() * 18);
    for (let s = 0; s < steps; s++) {
      angle += (rng() - 0.5) * 0.9;
      x += Math.cos(angle) * (4 + rng() * 11);
      y += Math.sin(angle) * (4 + rng() * 11);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- concrete
export function concreteTexture(seed = 1, size = 512) {
  const rng = seededRandom(seed);
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#615c54';
  ctx.fillRect(0, 0, size, size);
  splotches(ctx, size, size, rng, 46, [[40, 38, 34], [124, 118, 106], [76, 72, 64], [150, 140, 120]], size * 0.02, size * 0.17, 0.24);
  // panel seams
  ctx.strokeStyle = 'rgba(28,27,25,.5)';
  ctx.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo((i * size) / 4, 0); ctx.lineTo((i * size) / 4, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, (i * size) / 4); ctx.lineTo(size, (i * size) / 4); ctx.stroke();
  }
  cracks(ctx, size, size, rng, 22, 'rgba(34,32,29,.55)', 1.1);
  noiseOverlay(ctx, size, size, rng, 28);
  // pitting
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = rng() > 0.5 ? 'rgba(30,28,25,.35)' : 'rgba(170,162,145,.22)';
    ctx.fillRect(rng() * size, rng() * size, 1 + rng() * 2, 1 + rng() * 2);
  }
  return c;
}

// -------------------------------------------------------------------- sand
export function sandTexture(seed = 2, size = 512) {
  const rng = seededRandom(seed);
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#736349';
  ctx.fillRect(0, 0, size, size);
  splotches(ctx, size, size, rng, 40, [[56, 48, 34], [139, 120, 87], [92, 79, 57]], size * 0.03, size * 0.2, 0.2);
  // wind ripples
  for (let i = 0; i < 90; i++) {
    const y = rng() * size;
    ctx.strokeStyle = `rgba(${rng() > 0.5 ? '170,151,112' : '73,63,46'},${0.08 + rng() * 0.1})`;
    ctx.lineWidth = 1 + rng() * 2;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 12) {
      const yy = y + Math.sin(x * 0.025 + i) * (2 + rng() * 4);
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  noiseOverlay(ctx, size, size, rng, 34);
  for (let i = 0; i < 700; i++) {
    ctx.fillStyle = rng() > 0.5 ? 'rgba(40,35,26,.4)' : 'rgba(190,172,133,.3)';
    const r = 0.5 + rng() * 1.8;
    ctx.beginPath(); ctx.arc(rng() * size, rng() * size, r, 0, Math.PI * 2); ctx.fill();
  }
  return c;
}

// ------------------------------------------------------------------- metal
export function metalTexture(seed = 3, size = 512, color = [72, 78, 82], corrugated = false) {
  const rng = seededRandom(seed);
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
  ctx.fillRect(0, 0, size, size);
  if (corrugated) {
    const period = size / 24;
    for (let x = 0; x < size; x++) {
      const v = Math.sin((x / period) * Math.PI * 2);
      const shade = Math.round(v * 17);
      ctx.fillStyle = `rgba(${clamp(color[0] + shade, 0, 255)},${clamp(color[1] + shade, 0, 255)},${clamp(color[2] + shade, 0, 255)},.9)`;
      ctx.fillRect(x, 0, 1, size);
    }
  }
  splotches(ctx, size, size, rng, 34, [[30, 24, 20], [120, 60, 30], [150, 145, 130]], size * 0.02, size * 0.14, 0.18);
  // rust streaks
  for (let i = 0; i < 26; i++) {
    const x = rng() * size, y = rng() * size * 0.7;
    const w = 2 + rng() * 8, h = 20 + rng() * 110;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(120,55,24,.34)');
    g.addColorStop(1, 'rgba(120,55,24,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }
  // scratches
  for (let i = 0; i < 70; i++) {
    ctx.strokeStyle = `rgba(${rng() > 0.5 ? '200,200,190' : '20,22,22'},${0.06 + rng() * 0.12})`;
    ctx.lineWidth = 0.6 + rng();
    const x = rng() * size, y = rng() * size;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rng() - 0.5) * 90, y + (rng() - 0.5) * 16); ctx.stroke();
  }
  // rivets
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = 'rgba(20,22,22,.4)';
    ctx.beginPath(); ctx.arc(rng() * size, rng() * size, 1.6, 0, Math.PI * 2); ctx.fill();
  }
  noiseOverlay(ctx, size, size, rng, 20);
  return c;
}

// -------------------------------------------------------------------- wood
export function woodTexture(seed = 4, size = 256) {
  const rng = seededRandom(seed);
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#6b4c2c';
  ctx.fillRect(0, 0, size, size);
  for (let p = 0; p < 6; p++) {
    const x0 = (p * size) / 6;
    ctx.fillStyle = `rgba(${90 + rng() * 30},${60 + rng() * 22},${30 + rng() * 16},.55)`;
    ctx.fillRect(x0 + 1, 0, size / 6 - 2, size);
    ctx.strokeStyle = 'rgba(35,22,12,.5)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, size); ctx.stroke();
  }
  for (let i = 0; i < 120; i++) {
    ctx.strokeStyle = `rgba(${rng() > 0.5 ? '40,26,14' : '140,100,60'},${0.05 + rng() * 0.12})`;
    ctx.lineWidth = 0.7 + rng() * 1.6;
    const y = rng() * size;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 8) {
      const yy = y + Math.sin(x * 0.04 + i) * 2;
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  noiseOverlay(ctx, size, size, rng, 24);
  return c;
}

// --------------------------------------------------------- warning stripes
export function warningTexture(size = 256) {
  const rng = seededRandom(9);
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#17181a';
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(-Math.PI / 4);
  const step = size / 7;
  for (let x = -size * 2; x < size * 2; x += step * 2) {
    ctx.fillStyle = '#d9a01c';
    ctx.fillRect(x, -size * 2, step, size * 4);
  }
  ctx.restore();
  splotches(ctx, size, size, rng, 20, [[30, 28, 24], [100, 80, 40]], 4, 30, 0.24);
  for (let i = 0; i < 220; i++) {
    ctx.fillStyle = `rgba(${rng() > 0.5 ? '20,20,20' : '120,110,90'},${0.1 + rng() * 0.25})`;
    ctx.fillRect(rng() * size, rng() * size, 1 + rng() * 2, 1 + rng() * 2);
  }
  return c;
}

// -------------------------------------------------------------------- signs
export function signTexture(title, sub = '', opts = {}) {
  const w = 1024, h = 256;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const bg = opts.bg || 'rgba(12,14,15,0.92)';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = opts.border || 'rgba(255,176,46,0.55)';
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  ctx.fillStyle = opts.color || '#e9e3d2';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${opts.titleSize || 104}px "Arial Narrow", Impact, sans-serif`;
  ctx.fillText(title, w / 2, sub ? h / 2 - 24 : h / 2);
  if (sub) {
    ctx.fillStyle = opts.subColor || '#ffb02e';
    ctx.font = '400 30px "Courier New", monospace';
    ctx.letterSpacing = '8px';
    ctx.fillText(sub, w / 2, h / 2 + 62);
  }
  // wear
  const rng = seededRandom(title.length * 77 + 13);
  for (let i = 0; i < 280; i++) {
    ctx.fillStyle = `rgba(${rng() > 0.5 ? '10,10,10' : '180,170,150'},${0.04 + rng() * 0.16})`;
    ctx.fillRect(rng() * w, rng() * h, 1 + rng() * 3, 1 + rng() * 3);
  }
  return c;
}

// --------------------------------------------------------------- sprites
export function bulletHoleTexture(size = 128) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.95)');
  g.addColorStop(0.18, 'rgba(10,9,8,0.9)');
  g.addColorStop(0.42, 'rgba(30,28,25,0.55)');
  g.addColorStop(1, 'rgba(40,38,34,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const rng = seededRandom(42);
  ctx.strokeStyle = 'rgba(22,20,18,.55)';
  for (let i = 0; i < 9; i++) {
    let a = rng() * Math.PI * 2;
    let x = size / 2, y = size / 2;
    ctx.lineWidth = 0.6 + rng() * 1.2;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 5; s++) {
      a += (rng() - 0.5) * 0.8;
      x += Math.cos(a) * (4 + rng() * 7);
      y += Math.sin(a) * (4 + rng() * 7);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return c;
}

export function flashTexture(size = 128) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.translate(size / 2, size / 2);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size / 2);
  g.addColorStop(0, 'rgba(255,255,240,1)');
  g.addColorStop(0.18, 'rgba(255,220,120,0.95)');
  g.addColorStop(0.45, 'rgba(255,140,30,0.35)');
  g.addColorStop(1, 'rgba(255,90,10,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  const spikes = 9;
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? size * 0.5 : size * 0.16;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.95)';
  ctx.beginPath(); ctx.arc(0, 0, size * 0.09, 0, Math.PI * 2); ctx.fill();
  return c;
}

export function glowTexture(size = 128, color = [255, 170, 70]) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},0.9)`);
  g.addColorStop(0.28, `rgba(${color[0]},${color[1]},${color[2]},0.36)`);
  g.addColorStop(1, `rgba(${color[0]},${color[1]},${color[2]},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

export function smokeTexture(size = 128) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const rng = seededRandom(15);
  for (let i = 0; i < 22; i++) {
    const x = size / 2 + (rng() - 0.5) * size * 0.5;
    const y = size / 2 + (rng() - 0.5) * size * 0.5;
    const r = size * (0.12 + rng() * 0.22);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(210,208,200,${0.06 + rng() * 0.07})`);
    g.addColorStop(1, 'rgba(180,178,170,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return c;
}

// ------------------------------------------------------------- environment
export function skyEquirectTexture(w = 1024, h = 512) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const rng = seededRandom(31);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#071321');
  g.addColorStop(0.32, '#1b3348');
  g.addColorStop(0.52, '#7b6c74');
  g.addColorStop(0.62, '#e09a5e');
  g.addColorStop(0.7, '#b9703f');
  g.addColorStop(0.8, '#3d3733');
  g.addColorStop(1, '#171512');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // sun glow
  const sx = w * 0.72, sy = h * 0.64;
  const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, w * 0.23);
  sg.addColorStop(0, 'rgba(255,238,190,.95)');
  sg.addColorStop(0.04, 'rgba(255,214,140,.9)');
  sg.addColorStop(0.22, 'rgba(255,150,70,.34)');
  sg.addColorStop(1, 'rgba(255,120,50,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,248,225,.98)';
  ctx.beginPath(); ctx.arc(sx, sy, w * 0.018, 0, Math.PI * 2); ctx.fill();
  // clouds
  for (let i = 0; i < 34; i++) {
    const x = rng() * w;
    const y = h * (0.18 + rng() * 0.34);
    const rx = w * (0.04 + rng() * 0.13);
    const ry = h * (0.012 + rng() * 0.035);
    const cg = ctx.createRadialGradient(x, y, 0, x, y, rx);
    const dark = 40 + rng() * 35;
    cg.addColorStop(0, `rgba(${dark + 30},${dark + 22},${dark + 20},${0.2 + rng() * 0.25})`);
    cg.addColorStop(1, `rgba(${dark},${dark},${dark},0)`);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    ctx.translate(-x, -y);
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(x, y, rx, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // ground haze
  const hg = ctx.createLinearGradient(0, h * 0.68, 0, h);
  hg.addColorStop(0, 'rgba(200,130,80,0)');
  hg.addColorStop(1, 'rgba(10,10,10,1)');
  ctx.fillStyle = hg;
  ctx.fillRect(0, h * 0.68, w, h * 0.32);
  return c;
}

export function createTextureSet() {
  const concreteCanvas = concreteTexture(1);
  const sandCanvas = sandTexture(2);
  const metalCanvas = metalTexture(3, 512, [74, 80, 84], false);
  const containerCanvas = metalTexture(5, 512, [78, 88, 82], true);
  const woodCanvas = woodTexture(4);
  const warningCanvas = warningTexture(256);

  const concreteNormal = normalMapFrom(concreteCanvas, 2.0);
  const metalNormal = normalMapFrom(metalCanvas, 1.6);
  const sandNormal = normalMapFrom(sandCanvas, 1.2);

  return {
    concrete: tex(concreteCanvas, 1, 1),
    concreteWall: tex(concreteCanvas, 4, 2),
    concreteNormal: tex(concreteNormal, 1, 1, false),
    concreteWallNormal: tex(concreteNormal, 4, 2, false),
    sand: tex(sandCanvas, 24, 24),
    sandNormal: tex(sandNormal, 24, 24, false),
    metal: tex(metalCanvas, 1, 1),
    metalNormal: tex(metalNormal, 1, 1, false),
    container: tex(containerCanvas, 2, 1),
    containerNormal: tex(metalNormal, 2, 1, false),
    wood: tex(woodCanvas, 1, 1),
    warning: tex(warningCanvas, 1, 1),
    bulletHole: tex(bulletHoleTexture(), 1, 1),
    flash: tex(flashTexture(), 1, 1),
    glow: tex(glowTexture(128, [255, 160, 60]), 1, 1),
    glowCyan: tex(glowTexture(128, [90, 220, 255]), 1, 1),
    smoke: tex(smokeTexture(), 1, 1),
    sky: tex(skyEquirectTexture(), 1, 1),
  };
}

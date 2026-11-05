// Small math / utility helpers shared by the game modules.
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (min = 0, max = 1) => min + Math.random() * (max - min);
export const randInt = (min, max) => Math.floor(rand(min, max + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const TAU = Math.PI * 2;

export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Ray -> sphere. Returns distance along ray or Infinity.
export function raySphere(origin, dir, center, radius) {
  const ox = origin.x - center.x, oy = origin.y - center.y, oz = origin.z - center.z;
  const b = ox * dir.x + oy * dir.y + oz * dir.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const h = b * b - c;
  if (h < 0) return Infinity;
  const t = -b - Math.sqrt(h);
  return t >= 0 ? t : Infinity;
}

// Ray -> vertical capsule approximated with a cylinder plus two caps.
export function rayCapsule(origin, dir, base, height, radius) {
  // Infinite vertical cylinder test, then clip y range.
  const ox = origin.x - base.x, oz = origin.z - base.z;
  const a = dir.x * dir.x + dir.z * dir.z;
  if (a < 1e-8) return Infinity;
  const b = 2 * (ox * dir.x + oz * dir.z);
  const c = ox * ox + oz * oz - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return Infinity;
  const sq = Math.sqrt(disc);
  const t0 = (-b - sq) / (2 * a);
  const t1 = (-b + sq) / (2 * a);
  for (const t of [t0, t1]) {
    if (t < 0) continue;
    const y = origin.y + dir.y * t;
    if (y >= base.y && y <= base.y + height) return t;
  }
  // caps
  const capA = raySphere(origin, dir, { x: base.x, y: base.y, z: base.z }, radius);
  const capB = raySphere(origin, dir, { x: base.x, y: base.y + height, z: base.z }, radius);
  return Math.min(capA, capB);
}

// Ray -> axis aligned box (slab method). Box: {minX,maxX,minY,maxY,minZ,maxZ}
export function rayAABB(origin, dir, box) {
  let tmin = 0;
  let tmax = Infinity;
  const axes = [
    ['x', box.minX, box.maxX],
    ['y', box.minY, box.maxY],
    ['z', box.minZ, box.maxZ],
  ];
  for (const [axis, lo, hi] of axes) {
    const o = origin[axis], d = dir[axis];
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return Infinity;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

// Circle vs expanded AABB resolution. Returns corrected {x,z}.
export function resolveCircleBox(x, z, radius, box) {
  const nx = clamp(x, box.minX, box.maxX);
  const nz = clamp(z, box.minZ, box.maxZ);
  const dx = x - nx, dz = z - nz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return null;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    return { x: nx + (dx / d) * radius, z: nz + (dz / d) * radius };
  }
  // center inside the box: push out through the nearest face
  const left = x - box.minX, right = box.maxX - x;
  const back = z - box.minZ, front = box.maxZ - z;
  const m = Math.min(left, right, back, front);
  if (m === left) return { x: box.minX - radius, z };
  if (m === right) return { x: box.maxX + radius, z };
  if (m === back) return { x, z: box.minZ - radius };
  return { x, z: box.maxZ + radius };
}

export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

export function formatScore(n) {
  return String(Math.max(0, Math.floor(n))).padStart(6, '0');
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

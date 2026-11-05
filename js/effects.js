import * as THREE from 'three';
import { rand, pick, clamp } from './utils.js';

const PARTICLE_VERT = `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (420.0 / max(0.1, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;
const PARTICLE_FRAG = `
  uniform sampler2D uMap;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    if (t.a * vAlpha < 0.004) discard;
    gl_FragColor = vec4(vColor, t.a * vAlpha);
  }
`;

class ParticlePool {
  constructor(scene, map, capacity, additive) {
    this.capacity = capacity;
    this.items = new Array(capacity).fill(null).map(() => ({ life: 0, max: 1, vel: new THREE.Vector3(), gravity: 0, drag: 1, grow: 0 }));
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.cursor = 0;
    for (let i = 0; i < capacity; i++) this.pos[i * 3 + 1] = -999;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: map } },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);
  }

  spawn(p) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const it = this.items[i];
    it.life = p.life;
    it.max = p.life;
    it.vel.copy(p.vel);
    it.gravity = p.gravity ?? 0;
    it.drag = p.drag ?? 1;
    it.grow = p.grow ?? 0;
    it.baseSize = p.size;
    this.pos[i * 3] = p.pos.x;
    this.pos[i * 3 + 1] = p.pos.y;
    this.pos[i * 3 + 2] = p.pos.z;
    this.col[i * 3] = p.color.r;
    this.col[i * 3 + 1] = p.color.g;
    this.col[i * 3 + 2] = p.color.b;
    this.size[i] = p.size;
    this.alpha[i] = p.alpha ?? 1;
  }

  update(dt) {
    for (let i = 0; i < this.capacity; i++) {
      const it = this.items[i];
      if (it.life <= 0) continue;
      it.life -= dt;
      if (it.life <= 0) {
        this.alpha[i] = 0;
        this.pos[i * 3 + 1] = -999;
        continue;
      }
      it.vel.y += it.gravity * dt;
      const drag = Math.pow(it.drag, dt * 60);
      it.vel.multiplyScalar(drag);
      this.pos[i * 3] += it.vel.x * dt;
      this.pos[i * 3 + 1] += it.vel.y * dt;
      this.pos[i * 3 + 2] += it.vel.z * dt;
      if (this.pos[i * 3 + 1] < 0.02 && it.gravity < 0) {
        this.pos[i * 3 + 1] = 0.02;
        it.vel.y *= -0.28;
        it.vel.x *= 0.5;
        it.vel.z *= 0.5;
      }
      const t = it.life / it.max;
      this.alpha[i] = t * t;
      if (it.grow) this.size[i] = it.baseSize * (1 + (1 - t) * it.grow);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aAlpha.needsUpdate = true;
    this.points.geometry.attributes.aSize.needsUpdate = true;
    this.points.geometry.attributes.aColor.needsUpdate = true;
  }

  clear() {
    for (let i = 0; i < this.capacity; i++) {
      this.items[i].life = 0;
      this.alpha[i] = 0;
      this.pos[i * 3 + 1] = -999;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aAlpha.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene, camera, T) {
    this.scene = scene;
    this.camera = camera;
    this.T = T;
    this.sparks = new ParticlePool(scene, T.glow, 700, true);
    this.smoke = new ParticlePool(scene, T.smoke, 260, false);
    this.decals = [];
    this.decalCursor = 0;
    this.decalMat = new THREE.MeshBasicMaterial({ map: T.bulletHole, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false });
    for (let i = 0; i < 100; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.decalMat);
      m.visible = false;
      m.renderOrder = 2;
      scene.add(m);
      this.decals.push(m);
    }
    this.tracers = [];
    for (let i = 0; i < 36; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 5, 1, true), mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.tracers.push({ mesh, life: 0, max: 0.08 });
    }
    this.tracerCursor = 0;
    this.flashes = [];
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.SpriteMaterial({ map: T.flash, color: 0xffc070, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const s = new THREE.Sprite(mat);
      s.visible = false;
      scene.add(s);
      this.flashes.push({ sprite: s, life: 0, max: 0.08, base: 1 });
    }
    this.flashCursor = 0;
    this.shockwaves = [];
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffa050, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.78, 40), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      scene.add(mesh);
      this.shockwaves.push({ mesh, life: 0, max: 0.55 });
    }
    this.shockCursor = 0;
    this.shells = [];
    for (let i = 0; i < 20; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.045), new THREE.MeshStandardMaterial({ color: 0xc9a15a, roughness: 0.35, metalness: 0.9 }));
      mesh.visible = false;
      mesh.castShadow = false;
      scene.add(mesh);
      this.shells.push({ mesh, vel: new THREE.Vector3(), life: 0, spin: new THREE.Vector3() });
    }
    this.shellCursor = 0;
    this.lights = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xff9040, 0, 18, 1.8);
      scene.add(l);
      this.lights.push({ light: l, life: 0, max: 0.25, peak: 0 });
    }
    this.lightCursor = 0;
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  spawnSparks(pos, normal, count = 10, color = new THREE.Color(0xffb060), speed = 4, size = 0.09, life = 0.5) {
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
      if (normal) dir.multiplyScalar(0.5).add(normal).normalize();
      const v = dir.multiplyScalar(speed * rand(0.25, 1.1));
      const c = color.clone().offsetHSL(rand(-0.02, 0.02), 0, rand(-0.08, 0.08));
      this.sparks.spawn({
        pos: this._v.copy(pos).add(new THREE.Vector3(rand(-0.05, 0.05), rand(-0.05, 0.05), rand(-0.05, 0.05))),
        vel: v,
        color: c,
        size: size * rand(0.5, 1.5),
        life: life * rand(0.5, 1.3),
        gravity: -11,
        drag: 0.965,
      });
    }
  }

  spawnDust(pos, normal, count = 5) {
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(rand(-1, 1), rand(0.1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(0.4, 1.6));
      if (normal) v.add(normal.clone().multiplyScalar(0.8));
      this.smoke.spawn({
        pos: this._v.copy(pos).add(new THREE.Vector3(rand(-0.1, 0.1), rand(-0.1, 0.1), rand(-0.1, 0.1))),
        vel: v,
        color: new THREE.Color(0x8a8175),
        size: rand(0.4, 0.9),
        life: rand(0.7, 1.5),
        gravity: 0.4,
        drag: 0.94,
        alpha: 0.35,
        grow: 2.4,
      });
    }
  }

  spawnBlood(pos, dir, count = 12) {
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(rand(-1, 1), rand(-0.4, 1.4), rand(-1, 1)).normalize().multiplyScalar(rand(1, 4));
      if (dir) v.add(dir.clone().multiplyScalar(rand(0.5, 2)));
      this.sparks.spawn({
        pos: this._v.copy(pos),
        vel: v,
        color: new THREE.Color(pick([0xff3018, 0xb00d08, 0xff6a40])),
        size: rand(0.04, 0.11),
        life: rand(0.25, 0.7),
        gravity: -14,
        drag: 0.96,
      });
    }
  }

  tracer(from, to, color = 0xffd9a0) {
    const t = this.tracers[this.tracerCursor];
    this.tracerCursor = (this.tracerCursor + 1) % this.tracers.length;
    const dir = this._v.copy(to).sub(from);
    const len = dir.length();
    if (len < 0.01) return;
    dir.normalize();
    t.mesh.position.copy(from).addScaledVector(dir, len / 2);
    t.mesh.quaternion.setFromUnitVectors(this._up, dir);
    t.mesh.scale.set(1, len, 1);
    t.mesh.material.color.setHex(color);
    t.mesh.material.opacity = 0.9;
    t.mesh.visible = true;
    t.life = 0.075;
    t.max = 0.075;
  }

  muzzleFlash(pos, scale = 1, color = 0xffb050) {
    const f = this.flashes[this.flashCursor];
    this.flashCursor = (this.flashCursor + 1) % this.flashes.length;
    f.sprite.position.copy(pos);
    f.sprite.material.color.setHex(color);
    f.sprite.material.rotation = rand(0, Math.PI * 2);
    f.sprite.scale.setScalar(scale * rand(0.7, 1.15));
    f.sprite.material.opacity = 1;
    f.sprite.visible = true;
    f.life = 0.06;
    f.max = 0.06;
    f.base = scale;
    const l = this.lights[this.lightCursor];
    this.lightCursor = (this.lightCursor + 1) % this.lights.length;
    l.light.position.copy(pos);
    l.light.color.setHex(color);
    l.light.intensity = 40 * scale;
    l.life = 0.08;
    l.max = 0.08;
    l.peak = 40 * scale;
  }

  decal(point, normal, scale = 1) {
    const m = this.decals[this.decalCursor];
    this.decalCursor = (this.decalCursor + 1) % this.decals.length;
    m.position.copy(point).addScaledVector(normal, 0.012);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    m.rotateZ(rand(0, Math.PI * 2));
    const s = rand(0.12, 0.2) * scale;
    m.scale.set(s, s, s);
    m.visible = true;
    m.userData.life = 26;
  }

  impact(point, normal, kind = 'wall') {
    if (kind === 'enemy') {
      this.spawnBlood(point, normal, 10);
      this.spawnSparks(point, normal, 4, new THREE.Color(0xff7040), 2.5, 0.06, 0.3);
    } else {
      this.spawnSparks(point, normal, 8, new THREE.Color(0xffc070), 3.4, 0.07, 0.45);
      this.spawnDust(point, normal, 3);
      if (normal.y < 0.7) this.decal(point, normal);
    }
  }

  explosion(pos, radius = 5) {
    // fireball
    const f = this.flashes[this.flashCursor];
    this.flashCursor = (this.flashCursor + 1) % this.flashes.length;
    f.sprite.position.copy(pos);
    f.sprite.material.color.setHex(0xffa040);
    f.sprite.scale.setScalar(radius * 1.3);
    f.sprite.material.opacity = 1;
    f.sprite.visible = true;
    f.life = 0.24;
    f.max = 0.24;
    f.base = radius * 1.3;
    const l = this.lights[this.lightCursor];
    this.lightCursor = (this.lightCursor + 1) % this.lights.length;
    l.light.position.copy(pos).add(new THREE.Vector3(0, 1, 0));
    l.light.color.setHex(0xff8030);
    l.light.intensity = 900;
    l.life = 0.4;
    l.max = 0.4;
    l.peak = 900;
    this.spawnSparks(pos, null, 46, new THREE.Color(0xffa040), 13, 0.16, 0.9);
    this.spawnSparks(pos, null, 20, new THREE.Color(0xfff0c0), 18, 0.08, 0.5);
    for (let i = 0; i < 14; i++) {
      const v = new THREE.Vector3(rand(-1, 1), rand(0.2, 1.4), rand(-1, 1)).normalize().multiplyScalar(rand(1, 5));
      this.smoke.spawn({
        pos: this._v.copy(pos).add(new THREE.Vector3(rand(-0.5, 0.5), rand(0, 1), rand(-0.5, 0.5))),
        vel: v,
        color: new THREE.Color(pick([0x2b2824, 0x3d3831, 0x1e1c19])),
        size: rand(1.5, 3.5),
        life: rand(1.6, 3.2),
        gravity: 0.7,
        drag: 0.93,
        alpha: 0.55,
        grow: 2.6,
      });
    }
    const s = this.shockwaves[this.shockCursor];
    this.shockCursor = (this.shockCursor + 1) % this.shockwaves.length;
    s.mesh.position.copy(pos);
    s.mesh.position.y = 0.06;
    s.mesh.scale.setScalar(1);
    s.mesh.material.opacity = 0.8;
    s.mesh.visible = true;
    s.life = 0.5;
    s.max = 0.5;
  }

  shell(pos, dir) {
    const s = this.shells[this.shellCursor];
    this.shellCursor = (this.shellCursor + 1) % this.shells.length;
    s.mesh.position.copy(pos);
    s.vel.copy(dir).multiplyScalar(rand(1.8, 3.2));
    s.vel.y += rand(1.2, 2.4);
    s.spin.set(rand(-18, 18), rand(-18, 18), rand(-18, 18));
    s.mesh.visible = true;
    s.life = 1.6;
  }

  update(dt) {
    this.sparks.update(dt);
    this.smoke.update(dt);
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / t.max) * 0.9;
      if (t.life <= 0) t.mesh.visible = false;
    }
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      const k = Math.max(0, f.life / f.max);
      f.sprite.material.opacity = k;
      f.sprite.scale.setScalar(f.base * (1 + (1 - k) * 0.8));
      if (f.life <= 0) f.sprite.visible = false;
    }
    for (const l of this.lights) {
      if (l.life <= 0) continue;
      l.life -= dt;
      l.light.intensity = Math.max(0, l.life / l.max) * l.peak;
    }
    for (const s of this.shockwaves) {
      if (s.life <= 0) continue;
      s.life -= dt;
      const k = 1 - s.life / s.max;
      s.mesh.scale.setScalar(1 + k * 7);
      s.mesh.material.opacity = Math.max(0, 1 - k) * 0.8;
      if (s.life <= 0) s.mesh.visible = false;
    }
    for (const s of this.shells) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.vel.y -= 14 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += s.spin.x * dt;
      s.mesh.rotation.y += s.spin.y * dt;
      s.mesh.rotation.z += s.spin.z * dt;
      if (s.mesh.position.y < 0.03) {
        s.mesh.position.y = 0.03;
        s.vel.y *= -0.35;
        s.vel.x *= 0.7; s.vel.z *= 0.7;
      }
      if (s.life <= 0) s.mesh.visible = false;
    }
    for (const m of this.decals) {
      if (!m.visible) continue;
      m.userData.life -= dt;
      if (m.userData.life <= 0) m.visible = false;
    }
  }

  clear() {
    this.sparks.clear();
    this.smoke.clear();
    for (const t of this.tracers) { t.life = 0; t.mesh.visible = false; }
    for (const f of this.flashes) { f.life = 0; f.sprite.visible = false; }
    for (const s of this.shockwaves) { s.life = 0; s.mesh.visible = false; }
    for (const s of this.shells) { s.life = 0; s.mesh.visible = false; }
    for (const m of this.decals) m.visible = false;
    for (const l of this.lights) { l.life = 0; l.light.intensity = 0; }
  }
}

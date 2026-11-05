import * as THREE from 'three';
import { clamp, lerp, rand, angleDelta, resolveCircleBox, rayAABB, raySphere, rayCapsule } from './utils.js';

const TYPES = {
  grunt: {
    name: 'SENTINEL GRUNT', hp: 60, speed: 3.1, radius: 0.38, scale: 1.0, score: 100,
    damage: 7, fireRate: 1.35, accuracy: 0.58, range: 38, color: 0x5a656e, trim: 0xff3a24,
    preferred: 11, strafe: 1.0, height: 1.9,
  },
  rusher: {
    name: 'SENTINEL RUSHER', hp: 45, speed: 5.2, radius: 0.34, scale: 0.93, score: 150,
    damage: 16, fireRate: 1.0, accuracy: 0.85, range: 2.2, color: 0x6a5142, trim: 0xff7a20,
    preferred: 0.8, strafe: 1.7, height: 1.8, melee: true,
  },
  heavy: {
    name: 'SENTINEL HEAVY', hp: 160, speed: 2.05, radius: 0.48, scale: 1.2, score: 260,
    damage: 8, fireRate: 2.35, accuracy: 0.66, range: 34, color: 0x4c5963, trim: 0xffb020,
    preferred: 10, strafe: 0.6, height: 2.2, burst: 3,
  },
  boss: {
    name: 'WARDEN PRIME', hp: 720, speed: 1.75, radius: 0.62, scale: 1.55, score: 1800,
    damage: 10, fireRate: 2.0, accuracy: 0.72, range: 40, color: 0x3c474f, trim: 0xffd24a,
    preferred: 9, strafe: 0.8, height: 2.8, burst: 5, boss: true,
  },
};

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

export class EnemyManager {
  constructor(scene, effects, audio, T, callbacks = {}) {
    this.scene = scene;
    this.effects = effects;
    this.audio = audio;
    this.T = T;
    this.callbacks = callbacks;
    this.enemies = [];
    this.rings = [];
    this.time = 0;
  }

  get aliveCount() { return this.enemies.filter(e => e.state !== 'dead').length; }

  spawn(typeName, pos, wave = 1) {
    const type = TYPES[typeName] || TYPES.grunt;
    const e = {
      typeName, type, state: 'spawn', pos: new THREE.Vector3(pos.x, 0, pos.z),
      hp: type.hp * (1 + (wave - 1) * 0.06), maxHp: type.hp * (1 + (wave - 1) * 0.06),
      radius: type.radius, scale: type.scale, yaw: 0, targetYaw: 0,
      walkPhase: rand(0, Math.PI * 2), walkAmount: 0, fireTimer: rand(1.2, 2.6),
      burstLeft: 0, burstTimer: 0, flash: 0, deathTime: 0, spawnTime: 0,
      strafeDir: Math.random() > 0.5 ? 1 : -1, strafeTimer: rand(1.5, 3.5),
      alert: 0, hitTimer: 0, removed: false, lastDamageAt: -10,
    };
    e.group = this.buildModel(type, e);
    e.group.position.copy(e.pos);
    e.group.position.y = -2.4;
    e.group.scale.setScalar(type.scale);
    e.group.rotation.y = rand(0, Math.PI * 2);
    this.scene.add(e.group);
    this.enemies.push(e);
    // spawn ring
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff3a20, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.72, 32), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.04, pos.z);
    this.scene.add(ring);
    this.rings.push({ mesh: ring, life: 0.9, max: 0.9 });
    this.effects.spawnSparks(new THREE.Vector3(pos.x, 0.3, pos.z), new THREE.Vector3(0, 1, 0), 14, new THREE.Color(0xff4a20), 2.4, 0.1, 0.7);
    return e;
  }

  buildModel(type, e) {
    const g = new THREE.Group();
    const armor = new THREE.MeshStandardMaterial({ color: type.color, roughness: 0.48, metalness: 0.68 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x15191c, roughness: 0.4, metalness: 0.85 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: type.trim, emissiveIntensity: 2.4, roughness: 0.35, metalness: 0.4 });
    const visor = new THREE.MeshStandardMaterial({ color: 0x050505, emissive: type.trim, emissiveIntensity: 4.2, roughness: 0.2, metalness: 0.6 });
    e.materials = [armor, dark, trim, visor];
    e.armorMat = armor;
    e.visorMat = visor;

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.36), armor);
    torso.position.y = 1.24;
    torso.castShadow = true; torso.receiveShadow = true;
    g.add(torso);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.36, 0.16), dark);
    chest.position.set(0, 1.28, 0.22);
    chest.castShadow = true;
    g.add(chest);
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.05), trim);
    core.position.set(0, 1.3, 0.31);
    g.add(core);
    // pelvis
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.24, 0.32), dark);
    pelvis.position.y = 0.86;
    pelvis.castShadow = true;
    g.add(pelvis);
    // shoulders
    for (const s of [-1, 1]) {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.34), armor);
      pad.position.set(s * 0.4, 1.48, 0);
      pad.rotation.z = s * 0.16;
      pad.castShadow = true;
      g.add(pad);
    }
    // head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.3), armor);
    head.position.y = 1.7;
    head.castShadow = true;
    g.add(head);
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.34), dark);
    helmet.position.y = 1.84;
    g.add(helmet);
    const visorBar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.03), visor);
    visorBar.position.set(0, 1.72, 0.16);
    g.add(visorBar);
    // antenna
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 4), dark);
    ant.position.set(0.12, 1.98, -0.06);
    ant.rotation.z = -0.18;
    g.add(ant);
    // visor glow
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.T.glow, color: type.trim, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(0.7, 0.7, 1);
    glow.position.set(0, 1.72, 0.2);
    g.add(glow);
    e.visorGlow = glow;

    // hostile threat marker (multiplayer-style dorito)
    if (!this.markerTex) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const cx = c.getContext('2d');
      cx.translate(32, 32);
      cx.rotate(Math.PI / 4);
      cx.fillStyle = '#ff2f18';
      cx.fillRect(-12, -12, 24, 24);
      cx.strokeStyle = 'rgba(255,236,210,0.95)';
      cx.lineWidth = 3;
      cx.strokeRect(-12, -12, 24, 24);
      this.markerTex = new THREE.CanvasTexture(c);
      this.markerTex.colorSpace = THREE.SRGBColorSpace;
    }
    const marker = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.markerTex, transparent: true, opacity: 0.9, depthWrite: false,
      toneMapped: false, sizeAttenuation: true,
    }));
    marker.scale.set(0.24, 0.24, 1);
    marker.position.set(0, 2.3, 0);
    g.add(marker);
    e.marker = marker;

    // emissive armour strips help silhouettes read against the dusk haze
    for (const s of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.03), trim);
      strip.position.set(s * 0.33, 1.3, 0.16);
      g.add(strip);
    }

    // limbs
    const limbs = {};
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.4, 1.44, 0);
      g.add(shoulder);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.42, 0.16), armor);
      upper.position.y = -0.2;
      upper.castShadow = true;
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.42;
      shoulder.add(elbow);
      const lower = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.38, 0.14), dark);
      lower.position.y = -0.18;
      lower.castShadow = true;
      elbow.add(lower);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.14), armor);
      hand.position.y = -0.4;
      elbow.add(hand);
      limbs[s < 0 ? 'leftArm' : 'rightArm'] = shoulder;
      limbs[s < 0 ? 'leftElbow' : 'rightElbow'] = elbow;

      const hip = new THREE.Group();
      hip.position.set(s * 0.16, 0.84, 0);
      g.add(hip);
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.46, 0.21), armor);
      thigh.position.y = -0.22;
      thigh.castShadow = true;
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.45;
      hip.add(knee);
      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.38, 0.18), dark);
      shin.position.y = -0.18;
      shin.castShadow = true;
      knee.add(shin);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.3), armor);
      boot.position.set(0, -0.38, 0.05);
      knee.add(boot);
      limbs[s < 0 ? 'leftLeg' : 'rightLeg'] = hip;
      limbs[s < 0 ? 'leftKnee' : 'rightKnee'] = knee;
    }
    e.limbs = limbs;

    // weapon
    const muzzle = new THREE.Object3D();
    if (type.melee) {
      for (const s of [-1, 1]) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.62), trim);
        blade.position.set(s * 0.24, 1.1, 0.42);
        blade.rotation.x = 0.18;
        g.add(blade);
      }
      muzzle.position.set(0, 1.2, 0.72);
      g.add(muzzle);
    } else {
      const gun = new THREE.Group();
      gun.position.set(0.32, 1.3, 0.34);
      g.add(gun);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.62), dark);
      body.position.z = 0.18;
      body.castShadow = true;
      gun.add(body);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.5, 6), armor);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.z = 0.65;
      gun.add(barrel);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.12), armor);
      mag.position.set(0, -0.14, 0.12);
      mag.rotation.x = 0.2;
      gun.add(mag);
      if (type.burst) {
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 10), dark);
        drum.rotation.z = Math.PI / 2;
        drum.position.set(0, -0.13, 0.3);
        gun.add(drum);
      }
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.08, 6), trim);
      tip.rotation.x = Math.PI / 2;
      tip.position.z = 0.91;
      gun.add(tip);
      muzzle.position.set(0.32, 1.3, 0.95);
      g.add(muzzle);
    }
    e.muzzle = muzzle;

    if (type.boss) {
      // heavy shoulder pods and crown
      for (const s of [-1, 1]) {
        const pod = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.44), dark);
        pod.position.set(s * 0.5, 1.56, -0.1);
        pod.castShadow = true;
        g.add(pod);
        const light = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.05), trim);
        light.position.set(s * 0.5, 1.56, 0.13);
        g.add(light);
      }
      const crown = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.1), trim);
      crown.position.set(0, 1.94, 0);
      g.add(crown);
    } else if (e.typeName === 'heavy') {
      const shield = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.1), armor);
      shield.position.set(0, 1.25, 0.31);
      shield.castShadow = true;
      g.add(shield);
    }
    return g;
  }

  hasLOS(from, to, colliders) {
    const dir = _v1.copy(to).sub(from);
    const dist = dir.length();
    if (dist < 0.001) return true;
    dir.multiplyScalar(1 / dist);
    for (const c of colliders) {
      const t = rayAABB(from, dir, c);
      if (t < dist - 0.15) return false;
    }
    return true;
  }

  update(dt, time, player, world) {
    this.time = time;
    const colliders = world.colliders;
    const playerPos = player.position;
    const playerChest = _v2.set(playerPos.x, playerPos.y + player.eyeHeight * 0.72, playerPos.z);

    for (const ring of this.rings) {
      ring.life -= dt;
      const k = 1 - ring.life / ring.max;
      ring.mesh.scale.setScalar(1 + k * 5);
      ring.mesh.material.opacity = Math.max(0, 1 - k) * 0.8;
      if (ring.life <= 0) { ring.mesh.visible = false; }
    }
    this.rings = this.rings.filter(r => r.life > 0);

    for (const e of this.enemies) {
      if (e.removed) continue;
      if (e.flash > 0) e.flash -= dt;
      e.armorMat.emissive.setHex(0xff2a10);
      e.armorMat.emissiveIntensity = e.flash > 0 ? (e.flash / 0.12) * 1.6 : 0;
      if (e.visorGlow) {
        const pulse = 0.65 + Math.sin(time * 4 + e.walkPhase) * 0.18;
        e.visorGlow.material.opacity = e.state === 'dead' ? 0 : pulse;
      }
      if (e.marker) {
        const distToPlayer = Math.hypot(e.pos.x - playerPos.x, e.pos.z - playerPos.z);
        e.marker.material.opacity = e.state === 'dead' ? 0 : clamp(1.15 - distToPlayer / 60, 0.28, 0.92);
        e.marker.position.y = 2.3 + Math.sin(time * 2 + e.walkPhase) * 0.035;
      }

      if (e.state === 'dead') {
        e.deathTime += dt;
        const t = Math.min(1, e.deathTime / 0.65);
        e.group.rotation.z = -t * Math.PI * 0.52;
        e.group.position.y = -Math.max(0, e.deathTime - 1.4) * 0.8;
        if (e.deathTime > 0.15) {
          const fade = clamp(1 - (e.deathTime - 0.15) / 1.8, 0, 1);
          for (const m of e.materials) { m.transparent = true; m.opacity = fade; }
          if (e.visorGlow) e.visorGlow.material.opacity = fade * 0.6;
        }
        if (e.deathTime > 2.2) {
          this.scene.remove(e.group);
          e.removed = true;
        }
        continue;
      }

      if (e.state === 'spawn') {
        e.spawnTime += dt;
        const k = clamp(e.spawnTime / 0.75, 0, 1);
        const ease = 1 - Math.pow(1 - k, 3);
        e.group.position.y = lerp(-2.4, 0, ease);
        e.group.rotation.y += dt * 2;
        if (k >= 1) {
          e.state = 'active';
          e.group.position.y = 0;
          e.group.rotation.y = Math.atan2(playerPos.x - e.pos.x, playerPos.z - e.pos.z);
        }
        continue;
      }

      // ------------------------------------------------------------ active
      const dx = playerPos.x - e.pos.x;
      const dz = playerPos.z - e.pos.z;
      const dist = Math.hypot(dx, dz);
      e.targetYaw = Math.atan2(dx, dz);
      const turn = angleDelta(e.yaw, e.targetYaw);
      e.yaw += turn * Math.min(1, dt * 5.5);
      e.group.rotation.y = e.yaw;

      const from = _v1.set(e.pos.x, 1.35 * e.scale, e.pos.z);
      const los = this.hasLOS(from, playerChest, colliders);

      // movement
      let moveX = 0, moveZ = 0;
      const pref = e.type.preferred;
      const toPlayer = _v3.set(dx, 0, dz);
      if (dist > 0.01) toPlayer.multiplyScalar(1 / dist);
      e.strafeTimer -= dt;
      if (e.strafeTimer <= 0) {
        e.strafeTimer = rand(1.2, 3.2);
        e.strafeDir *= Math.random() > 0.35 ? 1 : -1;
      }
      let moveSpeed = e.type.speed;
      if (!los || dist > pref + 2.5) {
        moveX = toPlayer.x;
        moveZ = toPlayer.z;
      } else if (dist < pref - 2.0) {
        moveX = -toPlayer.x;
        moveZ = -toPlayer.z;
      } else {
        moveX = -toPlayer.z * e.strafeDir * 0.75;
        moveZ = toPlayer.x * e.strafeDir * 0.75;
        moveSpeed *= 0.55;
      }
      if (e.type.melee) {
        if (dist > 1.6) { moveX = toPlayer.x; moveZ = toPlayer.z; moveSpeed = e.type.speed; }
        else { moveX = 0; moveZ = 0; }
      }
      // separation
      for (const other of this.enemies) {
        if (other === e || other.removed || other.state === 'dead') continue;
        const ox = e.pos.x - other.pos.x;
        const oz = e.pos.z - other.pos.z;
        const od = Math.hypot(ox, oz);
        const minD = e.radius + other.radius + 0.5;
        if (od < minD && od > 0.001) {
          moveX += (ox / od) * (1 - od / minD) * 1.6;
          moveZ += (oz / od) * (1 - od / minD) * 1.6;
        }
      }
      const mlen = Math.hypot(moveX, moveZ);
      if (mlen > 0.001) {
        moveX /= mlen; moveZ /= mlen;
        const step = moveSpeed * dt;
        e.pos.x += moveX * step;
        e.pos.z += moveZ * step;
        e.walkAmount = lerp(e.walkAmount, 1, dt * 8);
      } else {
        e.walkAmount = lerp(e.walkAmount, 0, dt * 8);
      }
      // resolve collisions
      for (const c of colliders) {
        if (e.pos.y + 0.2 > c.maxY) continue;
        const r = resolveCircleBox(e.pos.x, e.pos.z, e.radius, c);
        if (r) { e.pos.x = r.x; e.pos.z = r.z; }
      }
      e.pos.x = clamp(e.pos.x, -42.4, 42.4);
      e.pos.z = clamp(e.pos.z, -42.4, 42.4);
      e.group.position.x = e.pos.x;
      e.group.position.z = e.pos.z;
      e.group.position.y = 0;

      // walk animation
      e.walkPhase += dt * (2.4 + moveSpeed * 0.85) * (0.35 + e.walkAmount);
      const sw = Math.sin(e.walkPhase) * 0.62 * e.walkAmount;
      const sw2 = Math.sin(e.walkPhase + Math.PI) * 0.62 * e.walkAmount;
      e.limbs.leftLeg.rotation.x = sw;
      e.limbs.rightLeg.rotation.x = sw2;
      e.limbs.leftKnee.rotation.x = Math.max(0, -sw) * 0.7;
      e.limbs.rightKnee.rotation.x = Math.max(0, -sw2) * 0.7;
      if (e.type.melee) {
        e.limbs.leftArm.rotation.x = -0.7 + Math.sin(time * 8) * 0.1;
        e.limbs.rightArm.rotation.x = -0.7 - Math.sin(time * 8) * 0.1;
        e.limbs.leftArm.rotation.z = 0.25;
        e.limbs.rightArm.rotation.z = -0.25;
      } else {
        e.limbs.leftArm.rotation.x = -0.55 + sw2 * 0.35;
        e.limbs.rightArm.rotation.x = -0.55 + sw * 0.35;
        e.limbs.leftArm.rotation.z = 0.12;
        e.limbs.rightArm.rotation.z = -0.12;
      }
      e.limbs.leftElbow.rotation.x = -0.35;
      e.limbs.rightElbow.rotation.x = -0.35;

      // attack
      e.fireTimer -= dt;
      if (e.burstLeft > 0) {
        e.burstTimer -= dt;
        if (e.burstTimer <= 0) {
          this.fire(e, player, playerChest, los, dist);
          e.burstLeft--;
          e.burstTimer = 0.11;
        }
      } else if (e.fireTimer <= 0 && los && dist < e.type.range) {
        if (e.type.melee) {
          if (dist < 2.1) {
            this.melee(e, player, dist);
            e.fireTimer = e.type.fireRate;
          } else {
            e.fireTimer = 0.2;
          }
        } else {
          e.burstLeft = e.type.burst || 1;
          e.burstTimer = 0;
          e.fireTimer = e.type.fireRate * rand(0.85, 1.2);
        }
      } else if (e.fireTimer <= 0) {
        e.fireTimer = 0.3;
      }
    }
    this.enemies = this.enemies.filter(e => !e.removed);
  }

  fire(e, player, playerChest, los, dist) {
    const muzzlePos = e.muzzle.getWorldPosition(new THREE.Vector3());
    const accuracy = clamp(1.12 - dist / 55, 0.28, 0.92) * e.type.accuracy;
    const hit = Math.random() < accuracy && los;
    const target = playerChest.clone();
    if (!hit) {
      target.x += rand(-2.4, 2.4);
      target.y += rand(-1.2, 1.6);
      target.z += rand(-2.4, 2.4);
    } else {
      target.x += rand(-0.12, 0.12);
      target.y += rand(-0.18, 0.18);
      target.z += rand(-0.12, 0.12);
    }
    this.effects.tracer(muzzlePos, target, 0xff8a50);
    this.effects.muzzleFlash(muzzlePos, 0.55, 0xff8a40);
    this.audio.shot('enemy', 0);
    if (hit) {
      const dmg = e.type.damage * (e.type.boss ? 1.15 : 1);
      this.callbacks.onPlayerDamage?.(dmg, e.pos.clone(), e.typeName);
    }
    this.callbacks.onEnemyShoot?.(e, muzzlePos, target);
  }

  melee(e, player, dist) {
    this.effects.spawnSparks(new THREE.Vector3(e.pos.x, 1.1, e.pos.z), new THREE.Vector3(0, 0.4, 1), 8, new THREE.Color(0xff7a30), 3, 0.09, 0.4);
    this.callbacks.onPlayerDamage?.(e.type.damage, e.pos.clone(), 'melee');
    this.callbacks.onEnemyMelee?.(e);
    e.flash = 0.08;
  }

  raycast(origin, dir, maxDist, colliders) {
    let wallT = maxDist;
    for (const c of colliders) {
      const t = rayAABB(origin, dir, c);
      if (t < wallT) wallT = t;
    }
    let best = null;
    for (const e of this.enemies) {
      if (e.state === 'dead' || e.state === 'spawn') continue;
      const s = e.scale;
      const headCenter = new THREE.Vector3(e.pos.x, 1.71 * s, e.pos.z);
      const headT = raySphere(origin, dir, headCenter, 0.2 * s);
      const bodyT = rayCapsule(origin, dir, new THREE.Vector3(e.pos.x, 0.62 * s, e.pos.z), 0.95 * s, 0.34 * s);
      let t = Infinity, head = false;
      if (headT < t) { t = headT; head = true; }
      if (bodyT < t) { t = bodyT; head = false; }
      if (t < wallT && t < maxDist && (!best || t < best.t)) {
        best = { enemy: e, t, headshot: head, point: origin.clone().addScaledVector(dir, t) };
      }
    }
    if (best) {
      best.normal = dir.clone().negate();
      return best;
    }
    if (wallT < maxDist) {
      const point = origin.clone().addScaledVector(dir, wallT);
      const normal = this.estimateNormal(point, dir);
      return { wall: true, t: wallT, point, normal };
    }
    return null;
  }

  estimateNormal(point, dir) {
    // pick the axis with the smallest overshoot relative to the hit point
    const n = dir.clone().negate();
    if (Math.abs(n.x) > Math.abs(n.y) && Math.abs(n.x) > Math.abs(n.z)) return new THREE.Vector3(Math.sign(n.x), 0, 0);
    if (Math.abs(n.z) > Math.abs(n.y)) return new THREE.Vector3(0, 0, Math.sign(n.z));
    return new THREE.Vector3(0, Math.sign(n.y) || 1, 0);
  }

  damage(e, amount, headshot, point, dir) {
    if (!e || e.state === 'dead' || e.state === 'spawn') return false;
    const dmg = amount * (headshot ? 2.35 : 1);
    e.hp -= dmg;
    e.flash = 0.12;
    e.alert = 1;
    this.effects.spawnBlood(point, dir, headshot ? 18 : 9);
    if (headshot) this.effects.spawnSparks(point, dir, 6, new THREE.Color(0xffd080), 3.5, 0.06, 0.4);
    if (e.hp <= 0) {
      this.kill(e, headshot);
      return true;
    }
    return false;
  }

  kill(e, headshot) {
    e.state = 'dead';
    e.deathTime = 0;
    e.hp = 0;
    e.group.position.y = 0;
    this.effects.spawnBlood(new THREE.Vector3(e.pos.x, 1.1, e.pos.z), null, 22);
    this.effects.spawnSparks(new THREE.Vector3(e.pos.x, 1.2, e.pos.z), new THREE.Vector3(0, 1, 0), 14, new THREE.Color(e.type.trim), 4, 0.1, 0.6);
    this.callbacks.onDeath?.(e, headshot);
  }

  clear() {
    for (const e of this.enemies) {
      this.scene.remove(e.group);
      e.removed = true;
    }
    this.enemies = [];
    for (const r of this.rings) { this.scene.remove(r.mesh); }
    this.rings = [];
  }
}

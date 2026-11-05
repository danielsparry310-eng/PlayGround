import * as THREE from 'three';
import { clamp, lerp, damp, rand, rayCapsule } from './utils.js';

const _v = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _eye = new THREE.Vector3();

const WEAPONS = [
  {
    id: 'rifle', name: 'MK-17 VANGUARD', mode: 'AUTO', fireMode: 'FULL AUTO', slot: '1 / 2',
    magSize: 30, reserveMax: 210, damage: 23, rpm: 720, reload: 1.85, auto: true,
    spread: 0.0075, adsSpread: 0.0016, moveSpread: 0.008, recoil: 0.0125, recoilYaw: 0.0028,
    range: 110, color: 0xffc070, adsFov: 54,
  },
  {
    id: 'pistol', name: 'P-9 SIDEWINDER', mode: 'SEMI', fireMode: 'SEMI AUTO', slot: '2 / 2',
    magSize: 12, reserveMax: 84, damage: 36, rpm: 330, reload: 1.55, auto: false,
    spread: 0.009, adsSpread: 0.0022, moveSpread: 0.01, recoil: 0.019, recoilYaw: 0.004,
    range: 80, color: 0x9fe8ff, adsFov: 58,
  },
];

function bevelBoxGeo(w, h, d, r = 0.006) {
  r = Math.min(r, w * 0.24, h * 0.24, d * 0.24);
  const x = -w / 2 + r;
  const y = -h / 2 + r;
  const shape = new THREE.Shape();
  shape.moveTo(x, y);
  shape.lineTo(x + w - 2 * r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - 2 * r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, d - 2 * r), bevelEnabled: true, bevelSegments: 1,
    steps: 1, bevelSize: r, bevelThickness: r, curveSegments: 2,
  });
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

export class WeaponSystem {
  constructor({ camera, scene, viewScene, viewCamera, player, enemies, world, effects, audio, T, callbacks = {} }) {
    this.camera = camera;
    this.scene = scene;
    this.viewScene = viewScene;
    this.viewCamera = viewCamera;
    this.player = player;
    this.enemies = enemies;
    this.world = world;
    this.effects = effects;
    this.audio = audio;
    this.T = T;
    this.callbacks = callbacks;
    this.weapons = WEAPONS.map((def) => ({ def, mag: def.magSize, reserve: Math.floor(def.reserveMax * 0.7) }));
    this.index = 0;
    this.cooldown = 0;
    this.reloading = false;
    this.reloadTime = 0;
    this.triggerPrev = false;
    this.ads = false;
    this.adsAmount = 0;
    this.muzzleTimer = 0;
    this.switchTimer = 0;
    this.pendingIndex = -1;
    this.shots = 0;
    this.hits = 0;
    this.headshots = 0;
    this.time = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.lastYaw = player.yaw;
    this.lastPitch = player.pitch;
    this.kick = 0;
    this.shellTimer = 0;

    this.group = new THREE.Group();
    this.group.position.set(0.3, -0.26, -0.52);
    this.viewCamera.add(this.group);

    this.models = [this.buildRifle(), this.buildPistol()];
    for (const m of this.models) this.group.add(m);
    this.models[1].visible = false;

    // Dedicated viewmodel lighting (the world lights cannot reach this scene).
    const vmHemi = new THREE.HemisphereLight(0xcfe3f5, 0x24272c, 1.05);
    this.viewScene.add(vmHemi);
    const vmKey = new THREE.DirectionalLight(0xffdcb6, 2.4);
    vmKey.position.set(-0.8, 1.4, 0.6);
    vmKey.target.position.set(0.15, -0.15, -0.9);
    this.viewScene.add(vmKey, vmKey.target);
    const vmFill = new THREE.DirectionalLight(0xa8c8e8, 1.1);
    vmFill.position.set(0.3, 0.25, 1.6);
    vmFill.target.position.set(0.15, -0.15, -0.8);
    this.viewScene.add(vmFill, vmFill.target);
    const vmRim = new THREE.DirectionalLight(0x78b6ff, 1.35);
    vmRim.position.set(1.1, 0.35, -1.4);
    vmRim.target.position.set(0.1, -0.1, -0.6);
    this.viewScene.add(vmRim, vmRim.target);
    const vmFillLeft = new THREE.DirectionalLight(0xffe6cc, 1.5);
    vmFillLeft.position.set(-1.3, 0.3, 1.1);
    vmFillLeft.target.position.set(0.2, -0.12, -0.65);
    this.viewScene.add(vmFillLeft, vmFillLeft.target);

    this.muzzleLight = new THREE.PointLight(0xffa040, 0, 4, 2);
    this.muzzleLight.position.set(0, 0.02, -0.85);
    this.group.add(this.muzzleLight);

    this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: T.flash, color: 0xffc070, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    }));
    this.flashSprite.scale.set(0.18, 0.18, 1);
    this.flashSprite.position.set(0, 0.02, -0.95);
    this.flashSprite.visible = false;
    this.group.add(this.flashSprite);

    this.onAmmo();
    this.onWeapon();
  }

  // --------------------------------------------------------------- models
  makeMats() {
    return {
      metal: new THREE.MeshStandardMaterial({ color: 0x4a565f, roughness: 0.44, metalness: 0.58, envMapIntensity: 0.9 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x222a2f, roughness: 0.5, metalness: 0.62, envMapIntensity: 0.8 }),
      polymer: new THREE.MeshStandardMaterial({ color: 0x3c474a, roughness: 0.7, metalness: 0.12, envMapIntensity: 0.7 }),
      accent: new THREE.MeshStandardMaterial({ color: 0x182126, emissive: 0x53d8ff, emissiveIntensity: 2.0, roughness: 0.32, metalness: 0.6 }),
      brass: new THREE.MeshStandardMaterial({ color: 0xc9a05a, roughness: 0.28, metalness: 0.95 }),
      glove: new THREE.MeshStandardMaterial({ color: 0x2d2d28, roughness: 0.9, metalness: 0.03 }),
      gloveLight: new THREE.MeshStandardMaterial({ color: 0x48463d, roughness: 0.86, metalness: 0.03 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x111518, roughness: 0.94, metalness: 0.02 }),
      lensGlass: new THREE.MeshStandardMaterial({ color: 0x050b0e, emissive: 0x0a3a44, emissiveIntensity: 0.35, roughness: 0.06, metalness: 0.85 }),
      lens: new THREE.MeshStandardMaterial({ color: 0x0a1a20, emissive: 0x67e8ff, emissiveIntensity: 2.0, roughness: 0.1, metalness: 0.5 }),
    };
  }

  addBox(parent, w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  }

  addBevel(parent, w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0, r = 0.006) {
    const m = new THREE.Mesh(bevelBoxGeo(w, h, d, r), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  }

  addCyl(parent, r1, r2, len, mat, x, y, z, rx = 0, ry = 0, rz = 0, seg = 10) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, seg), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  }

  buildRifle() {
    const g = new THREE.Group();
    const M = this.makeMats();

    // ---- receiver / upper ----
    this.addBevel(g, 0.072, 0.098, 0.42, M.metal, 0, 0, 0.04, 0, 0, 0, 0.007);
    this.addBevel(g, 0.062, 0.032, 0.4, M.dark, 0, 0.066, 0.03, 0, 0, 0, 0.005);
    for (let i = 0; i < 9; i++) {
      this.addBox(g, 0.056, 0.008, 0.016, M.metal, 0, 0.084, -0.14 + i * 0.041);
    }
    // ejection port + bolt
    this.addBox(g, 0.004, 0.038, 0.075, M.dark, 0.037, 0.012, 0.075);
    this.addBox(g, 0.006, 0.018, 0.03, M.brass, 0.039, 0.012, 0.05);
    // charging handle
    this.addBevel(g, 0.07, 0.016, 0.02, M.dark, 0.042, 0.043, 0.185, 0, 0, 0, 0.003);
    // side panels / bolts
    for (const s of [-1, 1]) {
      this.addBevel(g, 0.004, 0.05, 0.16, M.polymer, s * 0.037, 0.005, -0.02, 0, 0, 0, 0.002);
      for (let i = 0; i < 3; i++) {
        this.addCyl(g, 0.004, 0.004, 0.006, M.dark, s * 0.039, 0.03 - i * 0.03, 0.12, 0, 0, Math.PI / 2, 6);
      }
    }

    // ---- handguard ----
    this.addBevel(g, 0.062, 0.078, 0.34, M.polymer, 0, 0.002, -0.36, 0, 0, 0, 0.008);
    this.addBox(g, 0.052, 0.012, 0.3, M.dark, 0, 0.049, -0.36);
    for (let i = 0; i < 6; i++) {
      this.addBox(g, 0.052, 0.007, 0.014, M.metal, 0, 0.058, -0.23 - i * 0.045);
    }
    for (const s of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        this.addBox(g, 0.003, 0.022, 0.04, M.dark, s * 0.033, 0.005, -0.24 - i * 0.055);
      }
      this.addBox(g, 0.004, 0.006, 0.3, M.dark, s * 0.034, 0.036, -0.36);
    }
    // side laser / light module
    this.addBevel(g, 0.03, 0.03, 0.09, M.dark, 0.046, -0.006, -0.42, 0, 0, 0, 0.004);
    this.addCyl(g, 0.012, 0.012, 0.008, M.lens, 0.046, -0.006, -0.468, Math.PI / 2, 0, 0, 10);

    // ---- barrel / suppressor ----
    this.addCyl(g, 0.011, 0.011, 0.24, M.dark, 0, 0.008, -0.61, Math.PI / 2, 0, 0, 10);
    this.addCyl(g, 0.026, 0.025, 0.2, M.metal, 0, 0.008, -0.79, Math.PI / 2, 0, 0, 14);
    for (let i = 0; i < 4; i++) {
      this.addCyl(g, 0.029, 0.029, 0.008, M.dark, 0, 0.008, -0.71 - i * 0.045, Math.PI / 2, 0, 0, 14);
    }
    this.addCyl(g, 0.031, 0.029, 0.035, M.dark, 0, 0.008, -0.905, Math.PI / 2, 0, 0, 12);
    this.addCyl(g, 0.03, 0.03, 0.006, M.accent, 0, 0.008, -0.925, Math.PI / 2, 0, 0, 12);

    // ---- stock ----
    this.addBevel(g, 0.048, 0.09, 0.12, M.polymer, 0, -0.005, 0.29, 0, 0, 0, 0.006);
    for (const s of [-1, 1]) {
      this.addBevel(g, 0.03, 0.022, 0.22, M.dark, s * 0.018, s * 0.026, 0.41, 0, 0, 0, 0.004);
    }
    this.addBevel(g, 0.055, 0.11, 0.04, M.polymer, 0, -0.015, 0.475, 0.06, 0, 0, 0.008);
    this.addBox(g, 0.058, 0.12, 0.012, M.rubber || M.dark, 0, -0.015, 0.498, 0.06);
    this.addBevel(g, 0.052, 0.028, 0.14, M.polymer, 0, 0.07, 0.39, 0, 0, 0, 0.006);
    // sling loop
    this.addCyl(g, 0.012, 0.012, 0.004, M.dark, -0.03, -0.04, 0.48, 0, Math.PI / 2, 0, 8);

    // ---- pistol grip / trigger ----
    this.addBevel(g, 0.046, 0.16, 0.062, M.polymer, 0, -0.125, 0.175, -0.3, 0, 0, 0.007);
    for (let i = 0; i < 3; i++) {
      this.addBox(g, 0.048, 0.007, 0.012, M.dark, 0, -0.08 - i * 0.03, 0.19 - i * 0.009, -0.3);
    }
    this.addBox(g, 0.02, 0.012, 0.09, M.dark, 0, -0.072, 0.105);
    this.addBox(g, 0.02, 0.05, 0.012, M.dark, 0, -0.095, 0.065);
    this.addBox(g, 0.016, 0.05, 0.012, M.dark, 0, -0.095, 0.148);
    this.addBox(g, 0.012, 0.018, 0.03, M.dark, 0, -0.095, 0.108, 0.3);

    // ---- magazine ----
    const mag = new THREE.Group();
    mag.position.set(0, -0.13, 0.025);
    g.add(mag);
    this.addBevel(mag, 0.046, 0.15, 0.09, M.polymer, 0, 0, 0, 0.18, 0, 0, 0.006);
    this.addBevel(mag, 0.046, 0.07, 0.088, M.polymer, 0, -0.09, 0.02, 0.38, 0, 0, 0.006);
    this.addBox(mag, 0.05, 0.014, 0.095, M.dark, 0, -0.128, 0.04, 0.38);
    for (let i = 0; i < 3; i++) {
      this.addBox(mag, 0.048, 0.006, 0.09, M.dark, 0, -0.02 - i * 0.035, 0.006 + i * 0.008, 0.25);
    }

    // ---- optic ----
    this.addBevel(g, 0.036, 0.024, 0.08, M.dark, 0, 0.1, 0.0, 0, 0, 0, 0.004);
    this.addCyl(g, 0.028, 0.028, 0.15, M.dark, 0, 0.13, -0.01, Math.PI / 2, 0, 0, 14);
    this.addCyl(g, 0.024, 0.024, 0.012, M.lens, 0, 0.13, -0.09, Math.PI / 2, 0, 0, 14);
    this.addCyl(g, 0.022, 0.022, 0.012, M.lens, 0, 0.13, 0.068, Math.PI / 2, 0, 0, 14);
    this.addBox(g, 0.04, 0.012, 0.04, M.dark, 0, 0.108, -0.055);
    this.addBox(g, 0.04, 0.012, 0.04, M.dark, 0, 0.108, 0.035);
    // iron sights
    this.addBox(g, 0.012, 0.04, 0.012, M.dark, 0, 0.095, -0.52);
    this.addBox(g, 0.028, 0.01, 0.012, M.dark, 0, 0.11, -0.52);
    this.addBox(g, 0.026, 0.012, 0.01, M.dark, 0, 0.1, 0.2);

    // ---- hands / sleeves ----
    const rightHand = new THREE.Group();
    rightHand.position.set(0.012, -0.115, 0.19);
    rightHand.rotation.x = -0.28;
    g.add(rightHand);
    this.addBevel(rightHand, 0.075, 0.095, 0.1, M.glove, 0, -0.005, 0, 0, 0, 0, 0.012);
    for (let i = 0; i < 4; i++) {
      this.addBevel(rightHand, 0.019, 0.06, 0.024, M.gloveLight, 0.04, 0.02, -0.042 + i * 0.025, -0.35, 0, 0, 0.005);
    }
    this.addBevel(rightHand, 0.022, 0.05, 0.028, M.gloveLight, -0.038, 0.005, 0.01, 0, 0, 0.35, 0.005);
    this.addBevel(g, 0.075, 0.075, 0.24, M.glove, 0.06, -0.19, 0.32, 0.38, 0.24, 0, 0.015);
    this.addBox(g, 0.08, 0.018, 0.05, M.dark, 0.075, -0.155, 0.25, 0.38, 0.24, 0);

    const leftHand = new THREE.Group();
    leftHand.position.set(0.005, -0.072, -0.34);
    g.add(leftHand);
    this.addBevel(leftHand, 0.082, 0.072, 0.12, M.glove, 0, 0, 0, 0, 0, 0, 0.012);
    for (let i = 0; i < 4; i++) {
      this.addBevel(leftHand, 0.02, 0.055, 0.022, M.gloveLight, 0.04, 0.036, -0.045 + i * 0.028, 0.3, 0, 0, 0.005);
    }
    this.addBevel(leftHand, 0.024, 0.045, 0.03, M.gloveLight, -0.042, 0.02, 0.02, 0, 0, -0.3, 0.005);
    this.addBevel(g, 0.075, 0.075, 0.22, M.glove, -0.035, -0.17, -0.52, -0.22, -0.18, 0, 0.015);
    this.addBox(g, 0.08, 0.018, 0.05, M.dark, -0.03, -0.14, -0.44, -0.22, -0.18, 0);

    // muzzle marker
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.008, -0.94);
    g.add(muzzle);
    g.userData.muzzle = muzzle;
    g.userData.mag = mag;
    g.userData.lens = null;
    return g;
  }

  buildPistol() {
    const g = new THREE.Group();
    const M = this.makeMats();
    this.addBox(g, 0.045, 0.055, 0.24, M.metal, 0, 0.02, -0.02);
    this.addBox(g, 0.04, 0.03, 0.22, M.dark, 0, 0.055, -0.02);
    this.addCyl(g, 0.014, 0.014, 0.07, M.dark, 0, 0.02, -0.16, Math.PI / 2);
    this.addCyl(g, 0.019, 0.019, 0.055, M.metal, 0, 0.02, -0.21, Math.PI / 2);
    // grip
    this.addBox(g, 0.042, 0.16, 0.07, M.polymer, 0, -0.09, 0.08, -0.2);
    // trigger guard
    this.addBox(g, 0.015, 0.055, 0.07, M.dark, 0, -0.055, 0.015);
    // sights
    this.addBox(g, 0.008, 0.02, 0.008, M.accent, 0, 0.075, -0.11);
    this.addBox(g, 0.026, 0.01, 0.01, M.dark, 0, 0.075, 0.09);
    // hands
    const hand = new THREE.Group();
    hand.position.set(0, -0.09, 0.09);
    g.add(hand);
    this.addBox(hand, 0.08, 0.09, 0.1, M.glove, 0, 0, 0, -0.2);
    for (let i = 0; i < 4; i++) this.addBox(hand, 0.018, 0.06, 0.02, M.gloveLight, 0.04, 0.015, -0.04 + i * 0.024, -0.3);
    this.addBox(g, 0.07, 0.07, 0.24, M.glove, 0.03, -0.18, 0.24, 0.3, 0.25);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.02, -0.24);
    g.add(muzzle);
    g.userData.muzzle = muzzle;
    g.userData.mag = null;
    return g;
  }

  // ------------------------------------------------------------- callbacks
  onAmmo() {
    const w = this.weapons[this.index];
    this.callbacks.onAmmo?.(w.mag, w.reserve, w.def.magSize);
  }
  onWeapon() {
    const w = this.weapons[this.index];
    this.callbacks.onWeapon?.(w.def, w.mag, w.reserve);
  }

  get current() { return this.weapons[this.index]; }

  startReload() {
    if (this.reloading || this.switchTimer > 0) return;
    const w = this.current;
    if (w.mag >= w.def.magSize || w.reserve <= 0) return;
    this.reloading = true;
    this.reloadTime = 0;
    this.audio.reload(0);
    setTimeout(() => { if (this.reloading) this.audio.reload(1); }, 450);
    this.callbacks.onReloadStart?.(w.def.reload);
  }

  cancelReload() {
    this.reloading = false;
    this.reloadTime = 0;
    this.callbacks.onReloadCancel?.();
  }

  switchTo(index) {
    if (index === this.index || this.switchTimer > 0) return;
    this.pendingIndex = index;
    this.switchTimer = 0.42;
    this.cancelReload();
    this.audio.swap();
  }

  update(dt, input) {
    this.time += dt;
    const w = this.current;
    const def = w.def;
    this.cooldown = Math.max(0, this.cooldown - dt);

    // ads
    const wantAds = input.aim && !this.reloading && this.switchTimer <= 0;
    this.ads = wantAds;
    this.adsAmount = damp(this.adsAmount, wantAds ? 1 : 0, 13, dt);

    // switching
    if (this.switchTimer > 0) {
      this.switchTimer -= dt;
      if (this.pendingIndex >= 0 && this.switchTimer <= 0.21) {
        this.models[this.index].visible = false;
        this.index = this.pendingIndex;
        this.models[this.index].visible = true;
        this.pendingIndex = -1;
        this.onAmmo();
        this.onWeapon();
      }
    }

    // reload
    if (this.reloading) {
      this.reloadTime += dt;
      if (this.reloadTime >= def.reload) {
        const need = def.magSize - w.mag;
        const take = Math.min(need, w.reserve);
        w.mag += take;
        w.reserve -= take;
        this.reloading = false;
        this.reloadTime = 0;
        this.onAmmo();
        this.callbacks.onReloadEnd?.();
      }
    }

    // trigger
    const trigger = input.fire;
    if (trigger && !this.triggerPrev && !this.ads) {
      // first click can also start ADS if right mouse is not pressed; handled elsewhere
    }
    if (trigger && !this.reloading && this.switchTimer <= 0) {
      if (def.auto || !this.triggerPrev) this.tryFire();
    }
    this.triggerPrev = trigger;

    if (input.reload && !this.reloading) this.startReload();

    // muzzle flash
    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= dt;
      const k = Math.max(0, this.muzzleTimer / 0.055);
      this.flashSprite.material.opacity = k;
      this.flashSprite.visible = true;
      this.flashSprite.material.rotation = rand(0, Math.PI * 2);
      this.flashSprite.scale.setScalar(0.14 + rand(0, 0.06));
      this.muzzleLight.intensity = k * 8;
      if (this.muzzleTimer <= 0) {
        this.flashSprite.visible = false;
        this.muzzleLight.intensity = 0;
      }
    }

    // sway from look delta
    const dyaw = this.player.yaw - this.lastYaw;
    const dpitch = this.player.pitch - this.lastPitch;
    this.lastYaw = this.player.yaw;
    this.lastPitch = this.player.pitch;
    this.swayX = damp(this.swayX, clamp(-dyaw * 3.2, -0.06, 0.06), 10, dt);
    this.swayY = damp(this.swayY, clamp(dpitch * 3.2, -0.05, 0.05), 10, dt);

    // recoil kick (visual)
    this.kick = damp(this.kick, 0, 18, dt);

    // weapon position
    const bob = this.player.bobAmount;
    const bobX = Math.sin(this.player.bobPhase) * 0.012 * bob;
    const bobY = Math.abs(Math.cos(this.player.bobPhase)) * 0.01 * bob;
    const ads = this.adsAmount;
    const baseX = lerp(0.225, 0, ads);
    const baseY = lerp(-0.235, -0.115, ads);
    const baseZ = lerp(-0.82, -0.56, ads);
    let x = baseX + bobX + this.swayX * (1 - ads * 0.7);
    let y = baseY + bobY + this.swayY * (1 - ads * 0.7) - this.kick * 0.02;
    let z = baseZ + this.kick * 0.08;
    let rx = -0.005 + this.kick * 0.28 + this.swayY * 0.5;
    let ry = 0.1 - this.swayX * 0.7;
    let rz = bobX * 0.5;
    // reload dip
    if (this.reloading) {
      const t = this.reloadTime / def.reload;
      const dip = Math.sin(Math.min(1, t * 1.05) * Math.PI);
      y -= dip * 0.15;
      rx += dip * 0.55;
      rz += dip * 0.18;
      const mag = this.models[this.index].userData.mag;
      if (mag) {
        const drop = t > 0.35 && t < 0.78 ? Math.sin(((t - 0.35) / 0.43) * Math.PI) * 0.22 : 0;
        mag.position.y = -0.13 - drop;
        mag.visible = !(t > 0.4 && t < 0.7);
      }
    } else {
      const mag = this.models[this.index].userData.mag;
      if (mag) { mag.position.y = -0.13; mag.visible = true; }
    }
    // switch dip
    if (this.switchTimer > 0) {
      const t = 1 - Math.abs(this.switchTimer / 0.42 - 0.5) * 2;
      y -= Math.sin(t * Math.PI) * 0.2;
      rx += Math.sin(t * Math.PI) * 0.6;
    }
    this.group.position.set(x, y, z);
    this.group.rotation.set(rx, ry, rz);
    // model scale slightly down in ads for framing
    for (const m of this.models) m.scale.setScalar(lerp(0.76, 0.68, ads));

    // camera fov
    const targetFov = lerp(76, def.adsFov, ads);
    this.camera.fov = damp(this.camera.fov, targetFov, 12, dt);
    this.camera.updateProjectionMatrix();
    if (this.viewCamera) {
      this.viewCamera.fov = this.camera.fov;
      this.viewCamera.updateProjectionMatrix();
    }

    // crosshair spread px
    const moveFactor = clamp(this.player.speed / 8.4, 0, 1);
    const spread = lerp(def.spread, def.adsSpread, ads) + def.moveSpread * moveFactor * (1 - ads * 0.7) + this.kick * 0.12;
    const px = clamp(spread * 1800, 2, 32);
    this.callbacks.onSpread?.(px, this.adsAmount, this.reloading ? this.reloadTime / def.reload : 0, this.reloading);

    // shell timer
    if (this.shellTimer > 0) this.shellTimer -= dt;
  }

  tryFire() {
    const w = this.current;
    const def = w.def;
    if (this.cooldown > 0) return;
    if (this.reloading || this.switchTimer > 0) return;
    if (w.mag <= 0) {
      this.audio.dryFire();
      this.cooldown = 0.3;
      this.startReload();
      return;
    }
    w.mag--;
    this.cooldown = 60 / def.rpm;
    this.shots++;
    this.kick = Math.min(1.6, this.kick + 1);
    this.muzzleTimer = 0.055;
    this.audio.shot(def.id === 'pistol' ? 'pistol' : 'rifle', 0);
    this.player.addRecoil(def.recoil, rand(-def.recoilYaw, def.recoilYaw));

    // muzzle world position
    const model = this.models[this.index];
    const muzzle = model.userData.muzzle;
    muzzle.getWorldPosition(_muzzle);
    this.flashSprite.position.set(muzzle.position.x, muzzle.position.y, muzzle.position.z - 0.02);

    // aim ray with spread
    this.player.getForward(_dir);
    _right.crossVectors(_dir, new THREE.Vector3(0, 1, 0)).normalize();
    if (_right.lengthSq() < 0.01) _right.set(1, 0, 0);
    _up.crossVectors(_right, _dir).normalize();
    const moveFactor = clamp(this.player.speed / 8.4, 0, 1);
    const spread = lerp(def.spread, def.adsSpread, this.adsAmount) + def.moveSpread * moveFactor * (1 - this.adsAmount * 0.75);
    _dir.addScaledVector(_right, rand(-spread, spread));
    _dir.addScaledVector(_up, rand(-spread, spread));
    _dir.normalize();

    this.player.getEye(_eye);
    const hit = this.enemies.raycast(_eye, _dir, def.range, this.world.colliders);
    let end = _eye.clone().addScaledVector(_dir, def.range);
    let hitEnemy = false;
    let headshot = false;
    let killed = false;

    // explosive barrels take priority when they are closer than the first hit
    let barrelHit = null;
    for (const b of this.world.barrels) {
      if (!b.alive) continue;
      const t = rayCapsule(_eye, _dir, new THREE.Vector3(b.x, 0.05, b.z), 1.02, 0.46);
      if (t < def.range && (!hit || t < hit.t - 0.01) && (!barrelHit || t < barrelHit.t)) {
        barrelHit = { barrel: b, t, point: _eye.clone().addScaledVector(_dir, t) };
      }
    }

    if (barrelHit) {
      end = barrelHit.point;
      this.callbacks.onBarrelHit?.(barrelHit.barrel, barrelHit.point, _dir.clone().negate());
      this.audio.hit(false);
    } else if (hit) {
      end = hit.point;
      if (hit.enemy) {
        hitEnemy = true;
        headshot = hit.headshot;
        this.hits++;
        if (headshot) this.headshots++;
        killed = this.enemies.damage(hit.enemy, def.damage, headshot, hit.point, _dir);
        this.effects.impact(hit.point, hit.normal, 'enemy');
        this.audio.hit(headshot);
      } else {
        this.effects.impact(hit.point, hit.normal, 'wall');
        this.audio.hit(false);
      }
    }
    this.effects.tracer(_muzzle, end, def.color);
    // eject shell
    if (this.shellTimer <= 0) {
      this.shellTimer = 0.1;
      const side = new THREE.Vector3(1, 0.4, 0).applyQuaternion(this.camera.quaternion);
      this.effects.shell(_muzzle.clone().addScaledVector(side, 0.12), side);
    }
    this.callbacks.onShot?.({ hit: hitEnemy, headshot, killed, ammo: w.mag, reserve: w.reserve, magSize: def.magSize });
    this.onAmmo();
  }

  reset() {
    for (const w of this.weapons) {
      w.mag = w.def.magSize;
      w.reserve = Math.floor(w.def.reserveMax * 0.7);
    }
    this.index = 0;
    this.models[0].visible = true;
    this.models[1].visible = false;
    this.reloading = false;
    this.reloadTime = 0;
    this.switchTimer = 0;
    this.pendingIndex = -1;
    this.cooldown = 0;
    this.shots = 0;
    this.hits = 0;
    this.headshots = 0;
    this.ads = false;
    this.adsAmount = 0;
    this.onAmmo();
    this.onWeapon();
  }
}

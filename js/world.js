import * as THREE from 'three';
import { seededRandom, clamp, rand, TAU } from './utils.js';
import { signTexture } from './textures.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();

function rep(t, x, y) {
  const c = t.clone();
  c.needsUpdate = true;
  c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.repeat.set(x, y);
  return c;
}

function boxGeo(w, h, d) { return new THREE.BoxGeometry(w, h, d); }

// Collapse the static level dressing into a handful of draw calls. Each unique
// opaque material becomes one merged mesh; animated / destructible props are
// opted out with userData.noMerge.
function mergeStaticMeshes(root, scene) {
  const buckets = new Map();
  const blocked = new Set();
  const meshes = [];

  root.traverse((node) => {
    if (node.userData.noMerge) blocked.add(node);
  });
  root.traverse((node) => {
    if (!node.isMesh) return;
    let p = node;
    while (p) {
      if (blocked.has(p)) return;
      p = p.parent;
    }
    const material = Array.isArray(node.material) ? null : node.material;
    if (!material || material.transparent || material.isShaderMaterial) return;
    const key = `${material.uuid}|${node.castShadow ? 1 : 0}|${node.receiveShadow ? 1 : 0}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(node);
  });

  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    let total = 0;
    const parts = [];
    for (const mesh of list) {
      mesh.updateWorldMatrix(true, false);
      let geo = mesh.geometry.clone();
      geo.applyMatrix4(mesh.matrixWorld);
      if (geo.index) {
        const nonIndexed = geo.toNonIndexed();
        geo.dispose();
        geo = nonIndexed;
      }
      parts.push(geo);
      total += geo.attributes.position.count;
    }
    const pos = new Float32Array(total * 3);
    const nor = new Float32Array(total * 3);
    const uv = new Float32Array(total * 2);
    let offset = 0;
    for (const geo of parts) {
      const count = geo.attributes.position.count;
      pos.set(geo.attributes.position.array, offset * 3);
      if (geo.attributes.normal) nor.set(geo.attributes.normal.array, offset * 3);
      if (geo.attributes.uv) uv.set(geo.attributes.uv.array, offset * 2);
      offset += count;
      geo.dispose();
    }
    const mergedGeo = new THREE.BufferGeometry();
    mergedGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    mergedGeo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    mergedGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    mergedGeo.computeBoundingSphere();
    const merged = new THREE.Mesh(mergedGeo, list[0].material);
    merged.castShadow = list[0].castShadow;
    merged.receiveShadow = list[0].receiveShadow;
    merged.matrixAutoUpdate = false;
    scene.add(merged);
    meshes.push(merged);
    for (const mesh of list) {
      mesh.parent?.remove(mesh);
      mesh.geometry.dispose();
    }
  }
  return meshes;
}

export function createWorld(scene, renderer, T, quality = 'high') {
  const high = quality === 'high';
  const med = quality !== 'low';
  const colliders = [];
  const occluders = [];
  const barrels = [];
  const spawnPoints = [
    { x: 0, z: -20, yaw: Math.PI },
    { x: -20, z: -18, yaw: Math.PI * 0.75 },
    { x: 21, z: -16, yaw: -Math.PI * 0.75 },
    { x: -32, z: 2, yaw: Math.PI * 0.5 },
    { x: 33, z: 2, yaw: -Math.PI * 0.5 },
    { x: -20, z: 24, yaw: Math.PI * 0.2 },
    { x: 22, z: 24, yaw: -Math.PI * 0.2 },
    { x: 0, z: 38, yaw: 0 },
  ];
  const pickupPoints = [
    { x: -6, z: 12 }, { x: 7, z: 8 }, { x: -14, z: -6 },
    { x: 14, z: -10 }, { x: 0, z: -20 }, { x: 18, z: 18 },
  ];

  const envSource = T.sky.clone();
  envSource.mapping = THREE.EquirectangularReflectionMapping;
  envSource.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromEquirectangular(envSource);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.75;
  pmrem.dispose();
  envSource.dispose();

  scene.fog = new THREE.FogExp2(0x54565c, 0.0072);

  // ------------------------------------------------------------- materials
  const M = {};
  M.concrete = new THREE.MeshStandardMaterial({
    map: rep(T.concrete, 4, 2), normalMap: rep(T.concreteNormal, 4, 2),
    normalScale: new THREE.Vector2(0.75, 0.75), roughness: 0.96, metalness: 0.02,
    color: 0xb5ada0,
  });
  M.concreteSmall = new THREE.MeshStandardMaterial({
    map: rep(T.concrete, 1.6, 1), normalMap: rep(T.concreteNormal, 1.6, 1),
    normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.95, metalness: 0.02, color: 0xaaa296,
  });
  M.ground = new THREE.MeshStandardMaterial({
    map: T.sand, normalMap: T.sandNormal, normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 1, metalness: 0, color: 0x8d8270,
  });
  M.metal = new THREE.MeshStandardMaterial({
    map: rep(T.metal, 1, 1), normalMap: rep(T.metalNormal, 1, 1),
    normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.48, metalness: 0.72, color: 0x8b9296,
  });
  M.darkMetal = new THREE.MeshStandardMaterial({ color: 0x272c2f, roughness: 0.42, metalness: 0.82 });
  M.gunmetal = new THREE.MeshStandardMaterial({ color: 0x191d20, roughness: 0.35, metalness: 0.9 });
  M.rust = new THREE.MeshStandardMaterial({ color: 0x6b3c26, roughness: 0.85, metalness: 0.35 });
  M.wood = new THREE.MeshStandardMaterial({ map: rep(T.wood, 1, 1), roughness: 0.9, metalness: 0.02, color: 0xa88a64 });
  M.woodDark = new THREE.MeshStandardMaterial({ map: rep(T.wood, 1, 1), roughness: 0.92, metalness: 0.02, color: 0x6f573d });
  M.warning = new THREE.MeshStandardMaterial({ map: T.warning, roughness: 0.8, metalness: 0.1 });
  M.sandbag = new THREE.MeshStandardMaterial({ map: rep(T.sand, 2, 1), roughness: 1, metalness: 0, color: 0xa2916f });
  M.rubber = new THREE.MeshStandardMaterial({ color: 0x111315, roughness: 0.92, metalness: 0.02 });
  M.olive = new THREE.MeshStandardMaterial({ color: 0x4a5140, roughness: 0.72, metalness: 0.25 });
  M.containerRed = new THREE.MeshStandardMaterial({ map: T.container, normalMap: T.containerNormal, color: 0x9a4d38, roughness: 0.62, metalness: 0.5 });
  M.containerGreen = new THREE.MeshStandardMaterial({ map: T.container, normalMap: T.containerNormal, color: 0x5e6f56, roughness: 0.66, metalness: 0.45 });
  M.containerBlue = new THREE.MeshStandardMaterial({ map: T.container, normalMap: T.containerNormal, color: 0x4a6475, roughness: 0.64, metalness: 0.48 });
  M.glass = new THREE.MeshStandardMaterial({ color: 0x16303c, emissive: 0x2f7f93, emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.4 });
  M.lamp = new THREE.MeshStandardMaterial({ color: 0xfff1cc, emissive: 0xffd28a, emissiveIntensity: 4.5, roughness: 0.4 });
  M.redLamp = new THREE.MeshStandardMaterial({ color: 0x3a0705, emissive: 0xff1a10, emissiveIntensity: 5, roughness: 0.4 });
  M.cyanLamp = new THREE.MeshStandardMaterial({ color: 0x06222a, emissive: 0x5ce4ff, emissiveIntensity: 4, roughness: 0.4 });
  M.mountain = new THREE.MeshStandardMaterial({ color: 0x39332d, roughness: 1, metalness: 0, flatShading: true });
  M.rock = new THREE.MeshStandardMaterial({ color: 0x4c4439, roughness: 1, metalness: 0, flatShading: true });
  M.coneLight = new THREE.MeshBasicMaterial({
    color: 0xffc070, transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  M.redCone = new THREE.MeshBasicMaterial({
    color: 0xff3a20, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false,
  });

  function texSign(title, sub, opts) {
    const c = signTexture(title, sub, opts);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }
  const ammoStencilTex = texSign('AMMO', '', { bg: 'rgba(0,0,0,0)', border: 'rgba(0,0,0,0)', color: '#d8c9a8', titleSize: 150 });
  const explosiveMarkTex = texSign('!', '', { bg: 'rgba(0,0,0,0)', border: 'rgba(0,0,0,0)', color: '#ffd24a', titleSize: 210 });

  const root = new THREE.Group();
  scene.add(root);

  function addBox(w, h, d, mat, x, y, z, opts = {}) {
    const m = new THREE.Mesh(boxGeo(w, h, d), mat);
    m.position.set(x, y, z);
    if (opts.rx) m.rotation.x = opts.rx;
    if (opts.ry) m.rotation.y = opts.ry;
    if (opts.rz) m.rotation.z = opts.rz;
    m.castShadow = opts.cast !== false;
    m.receiveShadow = opts.receive !== false;
    (opts.parent || root).add(m);
    return m;
  }

  function addCollider(x, z, w, d, h = 6, y0 = 0) {
    const c = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: y0, maxY: y0 + h };
    colliders.push(c);
    occluders.push(c);
    return c;
  }

  function addRotatedCollider(x, z, w, d, h, ry) {
    const cw = Math.abs(Math.cos(ry)) * w + Math.abs(Math.sin(ry)) * d;
    const cd = Math.abs(Math.sin(ry)) * w + Math.abs(Math.cos(ry)) * d;
    return addCollider(x, z, cw, cd, h);
  }

  // ---------------------------------------------------------------- ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120, 1, 1), M.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // subtle ground elevation variation outside the compound (visual only)
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), new THREE.MeshStandardMaterial({ color: 0x5e5140, roughness: 1 }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.06;
  scene.add(outer);

  // -------------------------------------------------------------- sky dome
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x0a1a2b) },
      uMid: { value: new THREE.Color(0x3a4256) },
      uHorizon: { value: new THREE.Color(0xd58a52) },
      uSun: { value: new THREE.Color(0xffd9a0) },
      uSunDir: { value: new THREE.Vector3(-0.52, 0.3, -0.8).normalize() },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uTop, uMid, uHorizon, uSun, uSunDir;
      uniform float uTime;
      varying vec3 vDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
      }
      float fbm(vec2 p){
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.03; a *= 0.5; }
        return v;
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.24, h));
        col = mix(col, uTop, smoothstep(0.18, 0.78, h));
        float sun = max(dot(d, uSunDir), 0.0);
        col += uSun * pow(sun, 900.0) * 3.0;
        col += uSun * pow(sun, 14.0) * 0.28;
        col += uSun * pow(sun, 3.0) * 0.05;
        vec2 uv = d.xz / max(d.y + 0.16, 0.06);
        float f = fbm(uv * 1.1 + vec2(uTime * 0.002, 0.0));
        f = smoothstep(0.54, 0.86, f);
        float band = smoothstep(-0.02, 0.18, d.y) * (1.0 - smoothstep(0.48, 0.72, d.y));
        col = mix(col, vec3(0.13, 0.125, 0.14), f * band * 0.5);
        float star = step(0.9985, hash(floor(d.xz * 700.0 + d.y * 200.0))) * smoothstep(0.3, 0.75, d.y);
        col += vec3(star) * 0.55;
        col = mix(col, uHorizon * 0.8, smoothstep(0.1, -0.06, d.y) * 0.6);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(430, 40, 24), skyMat);
  sky.renderOrder = -10;
  scene.add(sky);

  // ---------------------------------------------------------------- lights
  const hemi = new THREE.HemisphereLight(0x9dc0e6, 0x3a3026, 1.15);
  scene.add(hemi);
  scene.add(new THREE.AmbientLight(0x34404d, 0.38));

  const sun = new THREE.DirectionalLight(0xffc794, 3.0);
  sun.position.set(-42, 36, -30);
  sun.castShadow = true;
  const shadowSize = high ? 2048 : 1024;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 150;
  sun.shadow.camera.left = -56;
  sun.shadow.camera.right = 56;
  sun.shadow.camera.top = 56;
  sun.shadow.camera.bottom = -56;
  sun.shadow.bias = -0.0007;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);

  // cool bounce from the sky, warm bounce from the horizon
  const bounce = new THREE.DirectionalLight(0x7fa6cc, 0.32);
  bounce.position.set(35, 8, -40);
  scene.add(bounce);
  const bounceWarm = new THREE.DirectionalLight(0xff7d3d, 0.32);
  bounceWarm.position.set(-10, 5, 40);
  scene.add(bounceWarm);

  // ------------------------------------------------------------ perimeter
  const wallH = 7.2;
  addBox(92, wallH, 1.6, M.concrete, 0, wallH / 2, -44);
  addBox(92, wallH, 1.6, M.concrete, 0, wallH / 2, 44);
  addBox(1.6, wallH, 92, M.concrete, -44, wallH / 2, 0);
  addBox(1.6, wallH, 92, M.concrete, 44, wallH / 2, 0);
  addCollider(0, -44, 92, 1.6, wallH);
  addCollider(0, 44, 92, 1.6, wallH);
  addCollider(-44, 0, 1.6, 92, wallH);
  addCollider(44, 0, 1.6, 92, wallH);

  // wall cap + buttresses
  for (const side of [-1, 1]) {
    addBox(92.4, 0.35, 2.0, M.concreteSmall, 0, wallH + 0.15, side * 44);
    addBox(2.0, 0.35, 92.4, M.concreteSmall, side * 44, wallH + 0.15, 0);
  }
  for (let i = -36; i <= 36; i += 12) {
    if (Math.abs(i) > 32) continue;
    addBox(0.9, wallH, 2.4, M.concreteSmall, i, wallH / 2, -43.2);
    addBox(0.9, wallH, 2.4, M.concreteSmall, i, wallH / 2, 43.2);
  }
  // razor wire
  if (med) {
    const wireMat = new THREE.MeshStandardMaterial({ color: 0x2a2d2e, roughness: 0.6, metalness: 0.8 });
    for (let side = -1; side <= 1; side += 2) {
      for (let i = -40; i <= 40; i += 1.6) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.025, 4, 8), wireMat);
        ring.position.set(i, wallH + 0.55, side * 44);
        ring.rotation.y = Math.PI / 2;
        root.add(ring);
      }
    }
  }

  // ----------------------------------------------------------- back bunker
  const bunkerZ = -30;
  addBox(23, 7.5, 11, M.concrete, 0, 3.75, bunkerZ);
  addCollider(0, bunkerZ, 23, 11, 7.5);
  addBox(24, 0.4, 12, M.concreteSmall, 0, 7.65, bunkerZ);
  // entrance recess
  addBox(4.2, 4.6, 0.35, M.darkMetal, 0, 2.3, bunkerZ + 5.6);
  addBox(3.2, 3.8, 0.2, M.gunmetal, 0, 1.9, bunkerZ + 5.78);
  addBox(0.16, 3.2, 0.12, M.cyanLamp, 1.35, 1.9, bunkerZ + 5.9);
  addBox(0.16, 3.2, 0.12, M.cyanLamp, -1.35, 1.9, bunkerZ + 5.9);
  // slit windows
  for (const x of [-8.2, -5.5, 5.5, 8.2]) {
    addBox(2.2, 0.55, 0.22, M.glass, x, 4.4, bunkerZ + 5.55);
    addBox(2.5, 0.22, 0.34, M.darkMetal, x, 4.75, bunkerZ + 5.6);
  }
  // roof antenna + dishes
  const mast = addBox(0.14, 7, 0.14, M.darkMetal, -7, 11.2, bunkerZ - 2);
  addBox(3.2, 0.12, 0.12, M.darkMetal, -7, 13.8, bunkerZ - 2);
  addBox(0.12, 0.12, 2.4, M.darkMetal, -7, 13.1, bunkerZ - 2);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(1.5, 20, 10, 0, TAU, 0, Math.PI / 2.6), M.metal);
  dish.position.set(7.2, 9.2, bunkerZ - 1);
  dish.rotation.set(-0.8, 0.5, 0);
  dish.castShadow = true;
  root.add(dish);
  addBox(0.22, 2.4, 0.22, M.darkMetal, 7.2, 8.2, bunkerZ - 1);
  // bunker sign
  const bunkerSign = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 2.1), new THREE.MeshBasicMaterial({ map: texSign('BLACKSITE 07', 'AUTHORIZED PERSONNEL ONLY'), transparent: true, toneMapped: true }));
  bunkerSign.position.set(0, 5.95, bunkerZ + 5.58);
  root.add(bunkerSign);
  addBox(8.9, 0.1, 0.14, M.amberLamp || M.lamp, 0, 7.02, bunkerZ + 5.62);

  // -------------------------------------------------------- left warehouse
  const whX = -31, whZ = -18;
  addBox(17, 9.5, 20, M.concrete, whX, 4.75, whZ);
  addCollider(whX, whZ, 17, 20, 9.5);
  addBox(18, 0.5, 21, M.metal, whX, 9.6, whZ);
  // roof lip
  addBox(18.2, 0.35, 0.4, M.darkMetal, whX, 9.9, whZ + 10.2);
  // corrugated accent bands
  for (let z = -27; z <= -9; z += 2.2) {
    addBox(0.18, 7.5, 1.7, M.metal, whX + 8.55, 4.2, z);
  }
  // windows
  for (let z = -25; z <= -11; z += 4.6) {
    addBox(0.18, 1.1, 2.6, M.glass, whX + 8.56, 6.3, z);
    addBox(0.24, 0.16, 3.0, M.darkMetal, whX + 8.6, 6.95, z);
  }
  // loading bay door
  addBox(0.3, 5.4, 6.2, M.darkMetal, whX + 8.6, 2.7, -14.5);
  addBox(0.14, 5.0, 5.8, M.rust, whX + 8.78, 2.6, -14.5);
  for (let y = 0.5; y < 5; y += 0.55) addBox(0.1, 0.06, 5.6, M.gunmetal, whX + 8.88, y, -14.5);
  // big sign
  const whSign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), new THREE.MeshBasicMaterial({ map: texSign('BAY 03', 'LOGISTICS // RESTRICTED'), transparent: true, toneMapped: true }));
  whSign.position.set(whX + 8.62, 7.7, -20);
  whSign.rotation.y = Math.PI / 2;
  root.add(whSign);
  // pipes on wall
  for (const [y, r] of [[3.2, 0.09], [3.5, 0.06]]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 19.5, 8), M.metal);
    pipe.position.set(whX + 8.7, y, whZ);
    pipe.rotation.x = Math.PI / 2;
    pipe.castShadow = true;
    root.add(pipe);
  }
  // rooftop AC units
  for (const z of [-24, -16]) {
    addBox(2.6, 1.1, 2.2, M.metal, whX - 2, 10.4, z);
    addBox(2.2, 0.12, 1.8, M.darkMetal, whX - 2, 10.98, z);
  }

  // ----------------------------------------------------------- containers
  function container(x, y, z, len, ry, mat) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    root.add(g);
    const w = 2.9, h = 2.9;
    const body = new THREE.Mesh(boxGeo(len, h, w), mat);
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    // frames
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const f = new THREE.Mesh(boxGeo(0.16, h + 0.12, 0.16), M.darkMetal);
        f.position.set(sx * (len / 2 - 0.05), 0, sz * (w / 2 - 0.05));
        f.castShadow = true;
        g.add(f);
      }
    }
    // door end
    const end = new THREE.Mesh(boxGeo(0.12, h * 0.9, w * 0.9), M.gunmetal);
    end.position.set(len / 2 + 0.02, 0, 0);
    g.add(end);
    for (const sz of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, h * 0.86, 6), M.metal);
      bar.position.set(len / 2 + 0.1, 0, sz * w * 0.26);
      g.add(bar);
    }
    const cw = Math.abs(Math.cos(ry)) * len + Math.abs(Math.sin(ry)) * w;
    const cd = Math.abs(Math.sin(ry)) * len + Math.abs(Math.cos(ry)) * w;
    addCollider(x, z, cw, cd, h, y - h / 2);
    return g;
  }
  container(24, 1.45, -18, 12, 0, M.containerRed);
  container(24, 4.35, -18, 12, 0, M.containerGreen);
  container(28.2, 1.45, -18, 12, 0, M.containerBlue);
  container(19.5, 1.45, -5.5, 9, Math.PI / 2, M.containerGreen);
  container(31, 1.45, -5.5, 9, Math.PI / 2, M.containerRed);
  container(35.5, 1.45, 16, 11, 0, M.containerBlue);
  // container props
  addBox(0.6, 0.6, 0.6, M.wood, 16.8, 0.3, -2.8, { ry: 0.4 });
  addBox(0.5, 0.5, 0.5, M.wood, 17.4, 0.8, -3.1, { ry: 0.9 });

  // -------------------------------------------------------- watchtower
  function tower(x, z, h = 7.4, withLight = true) {
    const legMat = M.darkMetal;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, h, 6), legMat);
      leg.position.set(x + sx * 2.2, h / 2, z + sz * 2.2);
      leg.castShadow = true;
      root.add(leg);
      addCollider(x + sx * 2.2, z + sz * 2.2, 0.5, 0.5, h);
    }
    for (let y = 1.6; y < h; y += 2.2) {
      addBox(4.7, 0.1, 0.1, legMat, x, y, z - 2.2, { rz: 0.18 });
      addBox(4.7, 0.1, 0.1, legMat, x, y, z + 2.2, { rz: -0.18 });
      addBox(0.1, 0.1, 4.7, legMat, x - 2.2, y, z, { rx: 0.18 });
      addBox(0.1, 0.1, 4.7, legMat, x + 2.2, y, z, { rx: -0.18 });
    }
    addBox(6.4, 0.35, 6.4, M.metal, x, h, z);
    addBox(5.4, 2.6, 5.4, M.olive, x, h + 1.5, z);
    addBox(5.9, 0.25, 5.9, M.darkMetal, x, h + 2.9, z);
    // windows
    for (const [dx, dz, ry] of [[0, 2.72, 0], [2.72, 0, Math.PI / 2], [-2.72, 0, Math.PI / 2], [0, -2.72, 0]]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), M.glass);
      win.position.set(x + dx, h + 1.9, z + dz);
      win.rotation.y = ry + (dz > 0 ? 0 : Math.PI);
      root.add(win);
    }
    // railing
    for (let i = -2.8; i <= 2.8; i += 1.4) {
      addBox(0.08, 1.0, 0.08, M.darkMetal, x + i, h + 0.8, z + 3.0);
      addBox(0.08, 1.0, 0.08, M.darkMetal, x + i, h + 0.8, z - 3.0);
    }
    addBox(6.2, 0.08, 0.08, M.darkMetal, x, h + 1.3, z + 3.0);
    addBox(6.2, 0.08, 0.08, M.darkMetal, x, h + 1.3, z - 3.0);
    // beacon
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), M.redLamp);
    beacon.position.set(x + 2.4, h + 3.2, z + 2.4);
    root.add(beacon);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: 0xff2a18, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(1.5, 1.5, 1);
    glow.position.copy(beacon.position);
    root.add(glow);
    beacons.push({ mesh: beacon, glow, phase: Math.random() * TAU });
    if (withLight && high) {
      const spot = new THREE.SpotLight(0xffd8a8, 260, 70, 0.46, 0.55, 1.4);
      spot.position.set(x, h + 3.2, z);
      spot.target.position.set(x - 6, 0, z + 18);
      scene.add(spot);
      scene.add(spot.target);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(12, 24, 20, 1, true), M.coneLight);
      cone.position.set(x - 3, h + 3.2 - 12, z + 9);
      cone.rotation.z = 0.22;
      cone.rotation.x = 0.12;
      root.add(cone);
      return spot;
    }
    return null;
  }
  const beacons = [];
  const spot = tower(34, -34, 7.4, true);
  tower(-34, -34, 7.4, false);

  // -------------------------------------------------------- flood lights
  function floodlight(x, z, ry = 0) {
    addBox(0.18, 7.2, 0.18, M.darkMetal, x, 3.6, z);
    addBox(1.4, 0.12, 0.12, M.darkMetal, x, 7.0, z);
    const head = addBox(0.8, 0.45, 0.45, M.darkMetal, x, 7.15, z, { ry });
    const lamp = addBox(0.62, 0.3, 0.1, M.lamp, x + Math.sin(ry) * 0.22, 7.15, z + Math.cos(ry) * 0.22, { ry, cast: false });
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: 0xffc070, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(3.2, 3.2, 1);
    glow.position.set(x + Math.sin(ry) * 0.35, 7.15, z + Math.cos(ry) * 0.35);
    root.add(glow);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(7, 14, 18, 1, true), M.coneLight);
    cone.position.set(x + Math.sin(ry) * 3.5, 0.2, z + Math.cos(ry) * 3.5);
    cone.rotation.x = Math.PI + Math.cos(ry) * 0.35;
    cone.rotation.z = -Math.sin(ry) * 0.35;
    root.add(cone);
    if (high) {
      const pl = new THREE.PointLight(0xffb060, 22, 20, 1.6);
      pl.position.set(x, 6.9, z);
      scene.add(pl);
    }
    addCollider(x, z, 0.5, 0.5, 7.2);
  }
  floodlight(-13, 17, 0.5);
  floodlight(20, 13, -0.6);
  floodlight(-25, -4, 0.2);
  floodlight(12, -22, Math.PI);

  // ------------------------------------------------------------- cover
  function jerseyBarrier(x, z, ry = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    root.add(g);
    const base = new THREE.Mesh(boxGeo(3.2, 0.34, 0.9), M.concreteSmall);
    base.position.y = 0.17;
    base.castShadow = base.receiveShadow = true;
    g.add(base);
    const mid = new THREE.Mesh(boxGeo(3.0, 0.55, 0.62), M.concreteSmall);
    mid.position.y = 0.6;
    mid.castShadow = true;
    g.add(mid);
    const top = new THREE.Mesh(boxGeo(2.8, 0.3, 0.42), M.concreteSmall);
    top.position.y = 1.02;
    top.castShadow = true;
    g.add(top);
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 0.22), M.warning);
    stripe.position.set(0, 1.02, 0.215);
    g.add(stripe);
    const stripe2 = stripe.clone();
    stripe2.rotation.y = Math.PI;
    stripe2.position.z = -0.215;
    g.add(stripe2);
    addRotatedCollider(x, z, 3.2, 0.9, 1.1, ry);
  }
  jerseyBarrier(0, 11, 0.12);
  jerseyBarrier(-7.5, 3.5, -0.55);
  jerseyBarrier(7.5, 4.5, 0.45);
  jerseyBarrier(-4.5, -5.5, 0.1);
  jerseyBarrier(7, -9.5, -0.3);
  jerseyBarrier(14, 8, 0.7);
  jerseyBarrier(-14, 11, -0.2);
  jerseyBarrier(17, -18, 0.15);
  jerseyBarrier(-18, -14, 0.2);

  function sandbagWall(x, z, len, ry = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    root.add(g);
    const rng = seededRandom(Math.floor(x * 31 + z * 17) + 5);
    const rows = 3;
    for (let r = 0; r < rows; r++) {
      const count = Math.max(3, Math.floor(len / 0.72));
      for (let i = 0; i < count; i++) {
        const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.42, 4, 8), M.sandbag);
        bag.rotation.z = Math.PI / 2;
        bag.rotation.y = (rng() - 0.5) * 0.16;
        bag.scale.set(1, 1, 0.9);
        bag.position.set((i - count / 2) * 0.72 + (rng() - 0.5) * 0.06, 0.2 + r * 0.34, (rng() - 0.5) * 0.1);
        bag.castShadow = true;
        bag.receiveShadow = true;
        g.add(bag);
      }
    }
    addRotatedCollider(x, z, len, 0.65, 1.05, ry);
  }
  sandbagWall(-13, 6.5, 5.2, 0.15);
  sandbagWall(12.5, 2.5, 4.4, -0.4);
  sandbagWall(2, -14, 5.6, 0.05);
  sandbagWall(-21, 22, 4.4, 1.1);

  function crate(x, z, size = 1.2, y = 0, ry = 0) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    root.add(g);
    const body = new THREE.Mesh(boxGeo(size, size, size), M.wood);
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    const t = size * 0.075;
    for (const sx of [-1, 1]) {
      const frame = new THREE.Mesh(boxGeo(t, size + 0.02, t), M.woodDark);
      frame.position.set(sx * (size / 2 - t / 2), 0, size / 2 - t / 2);
      g.add(frame);
      const frame2 = frame.clone(); frame2.position.z = -size / 2 + t / 2; g.add(frame2);
    }
    for (const sy of [-1, 1]) {
      const band = new THREE.Mesh(boxGeo(size + 0.02, t * 0.8, size + 0.02), M.woodDark);
      band.position.y = sy * (size / 2 - t / 2);
      g.add(band);
    }
    const stencil = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.55, size * 0.16), new THREE.MeshBasicMaterial({ map: ammoStencilTex, transparent: true }));
    stencil.position.set(0, 0, size / 2 + 0.012);
    g.add(stencil);
    addCollider(x, z, size * 1.05, size * 1.05, size + y, y);
  }
  crate(3.5, 15, 1.2, 0, 0.2);
  crate(4.8, 14.6, 0.9, 0, -0.4);
  crate(3.8, 15.1, 1.0, 1.2, 0.1);
  crate(-10.5, -2.5, 1.3, 0, 0.4);
  crate(-9.4, -3.2, 0.9, 0, 0.8);
  crate(-10.1, -2.8, 1.0, 1.3, -0.2);
  crate(15.5, -1.2, 1.1, 0, 0.3);
  crate(16.4, -2.2, 0.85, 0, 0.9);
  crate(-2.5, -18.5, 1.2, 0, 0.2);
  crate(-1.2, -18.8, 0.95, 0, -0.5);
  crate(20.5, 22, 1.4, 0, 0.6);
  crate(19.2, 22.6, 1.0, 0, 0.2);
  crate(-27, 20, 1.2, 0, 0.3);

  // pallets
  function pallet(x, z, ry = 0, stack = 1) {
    for (let s = 0; s < stack; s++) {
      addBox(1.5, 0.12, 1.1, M.wood, x, 0.07 + s * 0.16, z, { ry });
      for (let i = -2; i <= 2; i++) addBox(0.12, 0.1, 1.1, M.woodDark, x + i * 0.32, 0.14 + s * 0.16, z, { ry });
    }
    addCollider(x, z, 1.6, 1.2, 0.4 * stack);
  }
  pallet(9.5, 16.5, 0.3, 2);
  pallet(-16.5, -1.5, -0.2, 1);
  pallet(25.5, 8, 0.7, 3);
  pallet(-6, 21, 0.1, 1);

  // tires
  function tireStack(x, z, n = 3) {
    for (let i = 0; i < n; i++) {
      const tire = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.16, 8, 14), M.rubber);
      tire.rotation.x = Math.PI / 2;
      tire.position.set(x + (Math.random() - 0.5) * 0.1, 0.17 + i * 0.3, z + (Math.random() - 0.5) * 0.1);
      tire.castShadow = true;
      root.add(tire);
    }
    addCollider(x, z, 0.9, 0.9, 0.3 * n);
  }
  tireStack(-17.5, -2.5, 4);
  tireStack(17, 16, 3);
  tireStack(9, -17, 2);

  // cable spools
  for (const [x, z, r] of [[-21, 13, 0.9], [22, 6, 0.7]]) {
    const spool = new THREE.Group();
    spool.position.set(x, 0.9, z);
    root.add(spool);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, 1.1, 14), M.woodDark);
    core.rotation.z = Math.PI / 2;
    core.castShadow = true;
    spool.add(core);
    for (const s of [-1, 1]) {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.12, 18), M.wood);
      disc.rotation.z = Math.PI / 2;
      disc.position.x = s * 0.58;
      disc.castShadow = true;
      spool.add(disc);
    }
    addCollider(x, z, 1.4, r * 2, 1.8);
  }

  // --------------------------------------------------------- explosive barrels
  function barrel(x, z, explosive = true) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.userData.noMerge = true;
    root.add(g);
    const mat = explosive ? new THREE.MeshStandardMaterial({ color: 0x8f2f20, roughness: 0.6, metalness: 0.45 }) : M.olive;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.05, 16), mat);
    body.position.y = 0.53;
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    for (const y of [0.18, 0.53, 0.88]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.385, 0.035, 5, 16), M.darkMetal);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      g.add(ring);
    }
    if (explosive) {
      const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.38), new THREE.MeshBasicMaterial({ map: explosiveMarkTex, transparent: true }));
      mark.position.set(0, 0.55, 0.386);
      g.add(mark);
    }
    const collider = addCollider(x, z, 0.85, 0.85, 1.1);
    const b = { group: g, x, z, y: 0.55, radius: 0.42, alive: true, explosive, collider };
    barrels.push(b);
    return b;
  }
  barrel(-16.2, 13.8, true);
  barrel(-15.1, 14.5, true);
  barrel(-16.8, 15.1, true);
  barrel(19.5, -3.4, true);
  barrel(20.4, -2.6, true);
  barrel(8.5, -20.5, true);
  barrel(-23.5, 7.5, false);
  barrel(12.5, 19.5, true);

  // -------------------------------------------------------------- wrecked APC
  const apc = new THREE.Group();
  apc.position.set(22, 0, 20);
  apc.rotation.y = -0.55;
  root.add(apc);
  const hull = new THREE.Mesh(boxGeo(4.6, 1.5, 2.3), M.olive);
  hull.position.y = 1.05; hull.castShadow = hull.receiveShadow = true; apc.add(hull);
  const upper = new THREE.Mesh(boxGeo(2.6, 0.9, 2.0), M.olive);
  upper.position.set(-0.3, 2.05, 0); upper.castShadow = true; apc.add(upper);
  const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.8, 0.55, 10), M.darkMetal);
  turret.position.set(0.8, 2.7, 0); turret.castShadow = true; apc.add(turret);
  const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.8, 8), M.gunmetal);
  gun.position.set(2.2, 2.8, 0); gun.rotation.z = Math.PI / 2; apc.add(gun);
  for (const sx of [-1.55, 1.55]) for (const sz of [-1.15, 1.15]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.36, 14), M.rubber);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(sx, 0.52, sz);
    wheel.castShadow = true;
    apc.add(wheel);
  }
  const apcWindow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.35), M.glass);
  apcWindow.position.set(2.31, 2.1, 0);
  apcWindow.rotation.y = Math.PI / 2;
  apc.add(apcWindow);
  addCollider(22, 20, 5.6, 3.4, 2.8);

  // --------------------------------------------------- wrecked technical
  function wreckTruck(x, z, ry = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    root.add(g);
    const chassis = new THREE.Mesh(boxGeo(2.1, 0.45, 4.7), M.rust);
    chassis.position.y = 0.68; chassis.castShadow = chassis.receiveShadow = true; g.add(chassis);
    const cab = new THREE.Mesh(boxGeo(2.0, 1.05, 1.7), M.rust);
    cab.position.set(0, 1.35, 1.2); cab.castShadow = true; g.add(cab);
    const roof = new THREE.Mesh(boxGeo(2.05, 0.12, 1.75), M.olive);
    roof.position.set(0, 1.9, 1.2); g.add(roof);
    const hood = new THREE.Mesh(boxGeo(1.9, 0.35, 1.1), M.rust);
    hood.position.set(0, 1.05, 2.45); hood.rotation.x = -0.08; g.add(hood);
    const bed = new THREE.Mesh(boxGeo(1.95, 0.55, 2.2), M.darkMetal);
    bed.position.set(0, 1.0, -1.05); bed.castShadow = true; g.add(bed);
    const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 0.55), M.glass);
    windshield.position.set(0, 1.55, 2.08); windshield.rotation.x = -0.18; g.add(windshield);
    for (const sx of [-1.02, 1.02]) for (const sz of [-1.55, 1.55]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.3, 14), M.rubber);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx, 0.44, sz);
      wheel.castShadow = true;
      g.add(wheel);
    }
    // cargo spill
    const crate = new THREE.Mesh(boxGeo(0.7, 0.7, 0.7), M.wood);
    crate.position.set(1.6, 0.35, -1.1);
    crate.rotation.y = 0.5;
    crate.castShadow = true;
    g.add(crate);
    addRotatedCollider(x, z, 2.5, 5.2, 2.0, ry);
  }
  wreckTruck(-10.5, 22.5, 0.38);

  // foreground cover so the spawn lane has readable depth
  jerseyBarrier(-5.8, 24.5, 0.1);
  jerseyBarrier(6.2, 22.8, -0.22);
  sandbagWall(-7.5, 17.5, 4.2, 0.1);
  crate(7.4, 24.4, 1.15, 0, 0.35);
  crate(8.5, 23.9, 0.9, 0, -0.2);
  crate(7.8, 24.1, 0.95, 1.2, 0.1);
  barrel(-8.6, 20.8, true);
  barrel(8.2, 27.5, false);

  // ------------------------------------------------------------- ground decals
  function decalPlane(tex, x, z, w, h, ry = 0, opacity = 1) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, toneMapped: true }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = ry;
    m.position.set(x, 0.015, z);
    m.renderOrder = 1;
    root.add(m);
    return m;
  }
  // helipad
  const heli = document.createElement('canvas');
  heli.width = heli.height = 512;
  const hctx = heli.getContext('2d');
  hctx.clearRect(0, 0, 512, 512);
  hctx.strokeStyle = 'rgba(224,190,92,.72)';
  hctx.lineWidth = 14;
  hctx.beginPath(); hctx.arc(256, 256, 224, 0, TAU); hctx.stroke();
  hctx.lineWidth = 4;
  hctx.beginPath(); hctx.arc(256, 256, 196, 0, TAU); hctx.stroke();
  hctx.fillStyle = 'rgba(224,190,92,.7)';
  hctx.font = '700 210px "Arial Narrow", Impact, sans-serif';
  hctx.textAlign = 'center'; hctx.textBaseline = 'middle';
  hctx.fillText('H', 256, 262);
  const heliTex = new THREE.CanvasTexture(heli);
  heliTex.colorSpace = THREE.SRGBColorSpace;
  heliTex.anisotropy = 8;
  decalPlane(heliTex, 8, 21, 13, 13, 0.2, 0.9);
  // hazard stripes near bunker
  decalPlane(T.warning, 0, -20.5, 9, 1.1, 0, 0.55);
  decalPlane(T.warning, -10, 24, 6, 0.8, 0.5, 0.4);
  decalPlane(T.warning, 18, -14, 4, 0.7, 1.1, 0.35);
  // oil stains
  const oil = document.createElement('canvas');
  oil.width = oil.height = 256;
  const octx = oil.getContext('2d');
  const og = octx.createRadialGradient(128, 128, 4, 128, 128, 120);
  og.addColorStop(0, 'rgba(8,8,8,.65)');
  og.addColorStop(0.5, 'rgba(12,12,10,.35)');
  og.addColorStop(1, 'rgba(0,0,0,0)');
  octx.fillStyle = og; octx.fillRect(0, 0, 256, 256);
  const oilTex = new THREE.CanvasTexture(oil);
  oilTex.colorSpace = THREE.SRGBColorSpace;
  decalPlane(oilTex, -8, 16, 5, 3, 0.4, 0.8);
  decalPlane(oilTex, 20, -4, 4, 3, 1.2, 0.7);
  decalPlane(oilTex, -22, -7, 6, 4, 0.1, 0.6);
  // painted lane lines
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xd2a33c, transparent: true, opacity: 0.22, depthWrite: false });
  for (let z = 6; z < 34; z += 4.5) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 2.4), lineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(-4.5, 0.016, z);
    root.add(line);
  }

  // ---------------------------------------------------------- rocks / shrubs
  const rng = seededRandom(99);
  for (let i = 0; i < 60; i++) {
    const a = rng() * TAU;
    const r = 45 + rng() * 70;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const s = 0.3 + rng() * 1.8;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), M.rock);
    rock.position.set(x, s * 0.35, z);
    rock.rotation.set(rng() * TAU, rng() * TAU, rng() * TAU);
    rock.scale.y = 0.55 + rng() * 0.5;
    rock.castShadow = true;
    rock.receiveShadow = true;
    root.add(rock);
  }
  // desert shrubs (simple crossed dark planes)
  const shrubMat = new THREE.MeshStandardMaterial({ color: 0x4a4530, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 26; i++) {
    const a = rng() * TAU, r = 20 + rng() * 55;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < 42 && Math.abs(z) < 42) continue;
    const g = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.7 + rng(), 0.5 + rng() * 0.5), shrubMat);
      p.rotation.y = rng() * Math.PI;
      p.position.y = 0.3;
      g.add(p);
    }
    g.position.set(x, 0, z);
    root.add(g);
  }

  // ---------------------------------------------------------- distant ridges
  const mtnRng = seededRandom(123);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU + mtnRng() * 0.2;
    const r = 145 + mtnRng() * 70;
    const h = 18 + mtnRng() * 38;
    const mtn = new THREE.Mesh(new THREE.ConeGeometry(35 + mtnRng() * 35, h, 5, 1), M.mountain);
    mtn.position.set(Math.cos(a) * r, h / 2 - 5, Math.sin(a) * r);
    mtn.rotation.y = mtnRng() * TAU;
    mtn.scale.z = 0.6 + mtnRng() * 0.7;
    root.add(mtn);
  }
  // radio masts in the distance
  for (const [x, z, h] of [[-95, -110, 34], [120, -80, 28]]) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.9, h, 5), M.darkMetal);
    mast.position.set(x, h / 2, z);
    root.add(mast);
    for (let y = 6; y < h; y += 7) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(4, 0.18, 0.18), M.darkMetal);
      bar.position.set(x, y, z);
      root.add(bar);
    }
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), M.redLamp);
    light.position.set(x, h, z);
    root.add(light);
  }

  // ------------------------------------------------------------ cables
  function cable(x1, z1, y1, x2, z2, y2, sag = 2) {
    const mid = new THREE.Vector3((x1 + x2) / 2, Math.min(y1, y2) - sag, (z1 + z2) / 2);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x1, y1, z1), mid, new THREE.Vector3(x2, y2, z2));
    const geo = new THREE.TubeGeometry(curve, 16, 0.035, 4, false);
    const m = new THREE.Mesh(geo, M.darkMetal);
    root.add(m);
  }
  cable(-13, 17, 7, 20, 13, 7, 2.6);
  cable(20, 13, 7, 34, -34, 10.5, 3.5);
  cable(-13, 17, 7, -34, -34, 10.5, 3.5);
  cable(-13, 17, 7, -25, -4, 7, 2.2);

  // ------------------------------------------------------------ fires/smoke
  const fireSprites = [];
  const fireLight = new THREE.PointLight(0xff6a20, 30, 16, 1.7);
  fireLight.position.set(-16, 1.2, 14);
  scene.add(fireLight);
  const smokeSprites = [];
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.smoke, transparent: true, opacity: 0.0, depthWrite: false, color: 0x7f7a72 }));
    s.position.set(-16, 1.5 + i * 0.7, 14);
    s.scale.set(2 + i * 0.6, 2 + i * 0.6, 1);
    root.add(s);
    smokeSprites.push({ sprite: s, phase: i / 7 });
  }
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: i % 2 ? 0xffb040 : 0xff5a20, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.set(-16 + (Math.random() - 0.5) * 0.5, 1.0 + i * 0.35, 14 + (Math.random() - 0.5) * 0.5);
    s.scale.set(0.9, 1.4, 1);
    root.add(s);
    fireSprites.push({ sprite: s, phase: Math.random() * TAU });
  }

  // -------------------------------------------------------------- dust
  const dustCount = high ? 650 : 320;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(dustCount * 3);
  const dustSeed = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 100;
    dustPos[i * 3 + 1] = Math.random() * 14;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 100;
    dustSeed[i] = Math.random() * TAU;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({
    map: T.glow, color: 0xffd7a0, size: 0.075, transparent: true, opacity: 0.5,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  root.add(dust);

  // ground mist
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.smoke, transparent: true, opacity: 0.06, depthWrite: false, color: 0xb59a7a }));
    const a = Math.random() * TAU, r = 15 + Math.random() * 35;
    s.position.set(Math.cos(a) * r, 0.6 + Math.random() * 0.5, Math.sin(a) * r);
    s.scale.set(18, 5, 1);
    root.add(s);
  }

  // --------------------------------------------------------------- signs
  // south gate sign
  const gateSign = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), new THREE.MeshBasicMaterial({ map: texSign('SECTOR 07', 'RESTRICTED AREA // USE OF FORCE AUTHORIZED'), transparent: true, toneMapped: true }));
  gateSign.position.set(0, 5.3, 43.15);
  gateSign.rotation.y = Math.PI;
  root.add(gateSign);

  // small hazard lamps on bunker
  for (const x of [-10, 10]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), M.redLamp);
    lamp.position.set(x, 7.3, bunkerZ + 5.5);
    root.add(lamp);
  }

  // --------------------------------------------------------------- update
  const tmpColor = new THREE.Color();
  let elapsed = 0;
  function update(dt, time) {
    elapsed = time;
    skyMat.uniforms.uTime.value = time;
    // beacons
    for (const b of beacons) {
      const pulse = 0.35 + 0.65 * Math.pow(Math.max(0, Math.sin(time * 2.2 + b.phase)), 8);
      b.glow.material.opacity = pulse * 0.8;
      b.glow.scale.setScalar(1.2 + pulse * 0.8);
      b.mesh.material.emissiveIntensity = 2 + pulse * 4;
    }
    // fire flicker
    if (fireLight) fireLight.intensity = 22 + Math.sin(time * 17) * 7 + Math.sin(time * 7.3) * 5;
    for (const f of fireSprites) {
      const s = 0.8 + Math.sin(time * 13 + f.phase) * 0.16 + Math.sin(time * 23 + f.phase) * 0.1;
      f.sprite.scale.set(s * 0.8, s * 1.5, 1);
      f.sprite.material.opacity = 0.5 + Math.sin(time * 19 + f.phase) * 0.22;
      f.sprite.position.y = 0.9 + Math.sin(time * 3 + f.phase) * 0.1;
    }
    for (const sm of smokeSprites) {
      const p = ((time * 0.06 + sm.phase) % 1);
      sm.sprite.position.y = 1.4 + p * 8;
      sm.sprite.position.x = -16 + Math.sin(p * 6 + sm.phase * 8) * (0.4 + p * 1.5);
      sm.sprite.scale.setScalar(1.5 + p * 5.5);
      sm.sprite.material.opacity = Math.sin(p * Math.PI) * 0.13;
    }
    // dust drift
    const pos = dust.geometry.attributes.position.array;
    for (let i = 0; i < dustCount; i++) {
      const i3 = i * 3;
      pos[i3] += Math.sin(time * 0.22 + dustSeed[i]) * dt * 0.18;
      pos[i3 + 1] += Math.cos(time * 0.3 + dustSeed[i] * 1.7) * dt * 0.05;
      pos[i3 + 2] += dt * 0.16;
      if (pos[i3 + 2] > 50) pos[i3 + 2] = -50;
      if (pos[i3 + 1] > 15) pos[i3 + 1] = 0.2;
      if (pos[i3] > 50) pos[i3] = -50;
    }
    dust.geometry.attributes.position.needsUpdate = true;
    // slow sweeping spotlight
    if (spot) {
      const a = time * 0.12;
      spot.target.position.set(Math.cos(a) * 22, 0, Math.sin(a) * 22);
    }
  }

  function dispose() {
    envRT.dispose();
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose?.();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { m.map?.dispose?.(); m.normalMap?.dispose?.(); m.dispose?.(); }
      }
    });
  }

  // Consolidate static dressing into merged draw calls.
  mergeStaticMeshes(root, scene);

  return {
    root, colliders, occluders, barrels, spawnPoints, pickupPoints,
    playerSpawn: { x: 0, z: 30, yaw: 0 },
    update, dispose,
    bounds: { minX: -43, maxX: 43, minZ: -43, maxZ: 43 },
    sun,
  };
}

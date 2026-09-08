import * as THREE from 'three';
import { at, TRACK, LENGTH, WIDTH, COLORS } from './physics.js';
import {
  material,
  addMesh,
  box,
  mergeStatic,
  createKart,
  labelTexture,
} from './models.js';
export function createWorld(canvas, race) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.setClearColor('#6cbbed');
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#9ad4ea', 190, 490);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 900);
  scene.add(new THREE.HemisphereLight('#ddf4ff', '#778345', 2.15));
  const sun = new THREE.DirectionalLight('#fff2d1', 3.4);
  sun.position.set(-100, 190, -70);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -110,
    right: 110,
    top: 110,
    bottom: -110,
    near: 1,
    far: 410,
  });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);
  const statics = new THREE.Group();
  scene.add(statics);
  const roadMat = material('#3c4053', { roughness: 0.95 }),
    grass = material('#79bd36', { flatShading: true }),
    grassTop = material('#93d438', { flatShading: true }),
    orangeRock = material('#c67839', { flatShading: true }),
    rockLight = material('#e8a554', { flatShading: true }),
    bark = material('#655039', { flatShading: true }),
    leaf = material('#63ab2b', { flatShading: true }),
    leafLight = material('#8ecb35', { flatShading: true }),
    cream = material('#fff3bd'),
    red = material('#fb6c40'),
    dark = material('#273743'),
    yellow = material('#f7da34'),
    white = material('#fffbea'),
    sand = material('#e8c67e'),
    blue = material('#3b93ce');
  let seed = 37;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  // Fine road aggregate is a repeatable procedural game texture, not an external asset.
  const texCanvas = document.createElement('canvas');
  texCanvas.width = texCanvas.height = 128;
  const ctx = texCanvas.getContext('2d'),
    data = ctx.createImageData(128, 128);
  for (let i = 0; i < data.data.length; i += 4) {
    const n = 155 + rand() * 38;
    data.data[i] = n;
    data.data[i + 1] = n;
    data.data[i + 2] = n;
    data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  const asphalt = new THREE.CanvasTexture(texCanvas);
  asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping;
  asphalt.repeat.set(3, 130);
  asphalt.colorSpace = THREE.SRGBColorSpace;
  asphalt.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  roadMat.map = asphalt;
  const floor = addMesh(
    statics,
    new THREE.CylinderGeometry(360, 370, 4, 96),
    grass,
    0,
    -2.3,
    0,
  );
  floor.scale.z = 0.85;
  function ribbon(inner, outer, mat, y) {
    const v = [],
      uv = [],
      idx = [];
    for (let i = 0; i < TRACK.length; i++) {
      const p = at(TRACK[i].s === LENGTH ? 0 : TRACK[i].s);
      for (const [j, o] of [inner, outer].entries()) {
        v.push(p.x + p.nx * o, y, p.z + p.nz * o);
        uv.push(j, i / (TRACK.length - 1));
      }
      if (i < TRACK.length - 1) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    mat.side = THREE.DoubleSide;
    return addMesh(statics, g, mat);
  }
  ribbon(-WIDTH - 3, WIDTH + 3, sand, 0);
  ribbon(-WIDTH - 1, WIDTH + 1, yellow, 0.06);
  ribbon(-WIDTH, WIDTH, roadMat, 0.1);
  for (let s = 0; s < LENGTH; s += 4) {
    const p = at(s);
    for (const side of [-1, 1]) {
      const o = side * (WIDTH + 0.45),
        c = box(
          statics,
          0.9,
          0.17,
          3.97,
          Math.floor(s / 4) % 2 ? cream : red,
          p.x + p.nx * o,
          0.14,
          p.z + p.nz * o,
        );
      c.rotation.y = p.angle;
    }
    if (Math.floor(s / 4) % 3 === 0) {
      const line = box(statics, 0.24, 0.018, 3.8, yellow, p.x, 0.125, p.z);
      line.rotation.y = p.angle;
    }
  }
  // Terraced sandstone cliffs frame the circuit; crowns and ground have broad, clean facets.
  for (let i = 0; i < 57; i++) {
    const p = at((i / 57) * LENGTH),
      o = WIDTH + 15 + rand() * 12,
      h = 7 + rand() * 9,
      r = 9 + rand() * 7;
    const g = new THREE.Group();
    g.position.set(p.x + p.nx * o, 0, p.z + p.nz * o);
    g.rotation.y = rand() * 6;
    statics.add(g);
    addMesh(
      g,
      new THREE.CylinderGeometry(r * 0.92, r * 1.1, h, 5),
      i % 3 ? orangeRock : rockLight,
      0,
      h / 2,
      0,
    );
    addMesh(
      g,
      new THREE.CylinderGeometry(r, r * 0.95, 1.25, 5),
      grassTop,
      0,
      h + 0.1,
      0,
    );
    if (i % 4 === 0) {
      addMesh(
        g,
        new THREE.CylinderGeometry(r * 0.7, r * 0.8, 5, 5),
        rockLight,
        0,
        h + 2,
        0,
      );
      addMesh(
        g,
        new THREE.CylinderGeometry(r * 0.74, r * 0.7, 0.9, 5),
        leafLight,
        0,
        h + 4.7,
        0,
      );
    }
  }
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * Math.PI * 2,
      r = 245 + rand() * 30,
      h = 30 + rand() * 65;
    const mountain = addMesh(
      statics,
      new THREE.ConeGeometry(45 + rand() * 20, h, 5),
      i % 2 ? blue : material('#70abc3', { flatShading: true }),
      Math.cos(t) * r,
      h / 2 - 10,
      Math.sin(t) * r,
    );
    mountain.rotation.y = rand() * 6;
  }
  function tree(x, z, size = 1) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.scale.setScalar(size);
    g.rotation.y = rand() * 6;
    statics.add(g);
    const trunk = addMesh(
      g,
      new THREE.CylinderGeometry(0.4, 0.75, 7, 6),
      bark,
      0,
      3.5,
      0,
    );
    trunk.rotation.z = 0.06;
    for (let j = 0; j < 3; j++) {
      const branch = addMesh(
        g,
        new THREE.CylinderGeometry(0.22, 0.35, 3.4, 5),
        bark,
        (j - 1) * 1.1,
        6.1,
        0,
      );
      branch.rotation.z = (j - 1) * -0.6;
    }
    const crowns = [
      [-2.2, 8, 0, 3.2],
      [1.8, 8.9, 0.4, 3.6],
      [0, 10, -0.5, 3.7],
      [0, 7.9, 2.4, 2.9],
    ];
    crowns.forEach(([x, y, z, r], i) => {
      const crown = addMesh(
        g,
        new THREE.IcosahedronGeometry(r, 1),
        i % 2 ? leaf : leafLight,
        x,
        y,
        z,
      );
      crown.scale.y = 0.83;
    });
  }
  for (let i = 0; i < 62; i++) {
    const p = at((i / 62) * LENGTH),
      o = -(WIDTH + 7 + rand() * 17);
    tree(p.x + p.nx * o, p.z + p.nz * o, 0.75 + rand() * 0.8);
  }
  for (let i = 0; i < 18; i++) {
    const x = (rand() - 0.5) * 100,
      z = (rand() - 0.5) * 75;
    const hill = addMesh(
      statics,
      new THREE.IcosahedronGeometry(12 + rand() * 9, 1),
      i % 2 ? grass : grassTop,
      x,
      0,
      z,
    );
    hill.scale.y = 0.5;
  }
  // Thick directional boards make the upcoming turns readable at racing speed.
  for (const fraction of [0.12, 0.29, 0.45, 0.62, 0.8, 0.92]) {
    const p = at(fraction * LENGTH),
      g = new THREE.Group();
    g.position.set(p.x + p.nx * (WIDTH + 3.5), 0, p.z + p.nz * (WIDTH + 3.5));
    g.rotation.y = p.angle + Math.PI;
    statics.add(g);
    for (const x of [-2.5, 2.5]) box(g, 0.18, 3.5, 0.18, dark, x, 1.7, 0);
    addMesh(
      g,
      new THREE.PlaneGeometry(6.5, 1.7),
      new THREE.MeshStandardMaterial({
        map: labelTexture('❯ ❯ ❯', '#fff8db', '#ee6339'),
        side: THREE.DoubleSide,
      }),
      0,
      3,
      0,
    );
  }
  for (let s = 45; s < 125; s += 4) {
    const p = at(s),
      o = -(WIDTH + 3);
    const post = box(
      statics,
      0.18,
      1.1,
      0.18,
      white,
      p.x + p.nx * o,
      0.55,
      p.z + p.nz * o,
    );
    post.rotation.y = p.angle;
    const rail = box(
      statics,
      0.18,
      0.18,
      4.2,
      white,
      p.x + p.nx * o,
      0.9,
      p.z + p.nz * o,
    );
    rail.rotation.y = p.angle;
  }
  // Puffy clouds are distant 3D scenery, with a blue sky behind them.
  const cloudMat = new THREE.MeshBasicMaterial({ color: '#f9f4dc' });
  for (let i = 0; i < 20; i++) {
    const g = new THREE.Group();
    g.position.set(
      Math.cos(i * 2.399) * 300,
      68 + rand() * 30,
      Math.sin(i * 2.399) * 300,
    );
    statics.add(g);
    for (let j = 0; j < 5; j++) {
      const c = addMesh(
        g,
        new THREE.SphereGeometry(9 + rand() * 8, 10, 7),
        cloudMat,
        j * 12 - 24,
        rand() * 8,
        rand() * 6,
      );
      c.scale.y = 0.65;
      c.castShadow = false;
    }
  }
  const start = at(0),
    gate = new THREE.Group();
  gate.position.set(start.x, 0, start.z);
  gate.rotation.y = start.angle;
  statics.add(gate);
  for (const x of [-14, 14]) {
    box(gate, 1.1, 9, 1.1, red, x, 4.5, 0, 0.1);
    box(gate, 1.8, 0.6, 1.8, cream, x, 0.35, 0, 0.1);
  }
  box(gate, 29, 2.3, 1, dark, 0, 9, 0, 0.12);
  const gateMat = new THREE.MeshStandardMaterial({
    map: labelTexture('KART DO ALONCINHO', '#283746', '#fff1b6', 1024, 128),
    side: THREE.DoubleSide,
  });
  addMesh(gate, new THREE.PlaneGeometry(26, 1.75), gateMat, 0, 9, -0.515);
  for (let x = -12; x < 12; x += 1.5)
    for (let z = -1.5; z < 1.5; z += 1.5)
      box(
        gate,
        1.5,
        0.02,
        1.5,
        Math.round(x / 1.5 + z / 1.5) % 2 ? dark : white,
        x + 0.75,
        0.13,
        z + 0.75,
      );
  mergeStatic(statics);
  const karts = COLORS.map((c, i) => {
    const k = createKart(c, i);
    scene.add(k.root);
    return k;
  });
  const itemMap = labelTexture('?', '#ffcf37', '#fffbea', 128, 128),
    itemMat = new THREE.MeshStandardMaterial({
      map: itemMap,
      emissive: '#b46b00',
      emissiveIntensity: 0.25,
      roughness: 0.3,
    });
  const pickups = race.pickups.map((p) => {
    const t = at(p.s),
      g = new THREE.Group();
    g.position.set(t.x + t.nx * p.offset, 1.65, t.z + t.nz * p.offset);
    scene.add(g);
    box(g, 1.5, 1.5, 1.5, itemMat, 0, 0, 0, 0.12);
    const halo = addMesh(
      g,
      new THREE.TorusGeometry(1.1, 0.04, 6, 24),
      yellow,
      0,
      -1.45,
      0,
    );
    halo.rotation.x = Math.PI / 2;
    return g;
  });
  const oilMat = material('#172037', { roughness: 0.12, metalness: 0.5 });
  const hazards = Array.from({ length: 30 }, () => {
    const h = addMesh(
      scene,
      new THREE.CylinderGeometry(1.7, 1.7, 0.026, 24),
      oilMat,
    );
    h.visible = false;
    return h;
  });
  const skidMat = new THREE.MeshBasicMaterial({
    color: '#141923',
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const skids = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.22, 0.9),
    skidMat,
    400,
  );
  skids.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  skids.frustumCulled = false;
  scene.add(skids);
  const dummy = new THREE.Object3D();
  dummy.scale.set(0, 0, 0);
  dummy.updateMatrix();
  for (let i = 0; i < 400; i++) skids.setMatrixAt(i, dummy.matrix);
  let skidIndex = 0,
    skidTime = 0;
  let lastW = 0,
    lastH = 0,
    initialized = false;
  const target = new THREE.Vector3(),
    look = new THREE.Vector3(),
    smoothLook = new THREE.Vector3();
  return {
    render(r, time, dt, localIndex = 0) {
      const w = canvas.clientWidth,
        h = canvas.clientHeight;
      if (w !== lastW || h !== lastH) {
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        lastW = w;
        lastH = h;
      }
      r.racers.forEach((p, i) => {
        const t = at(p.s),
          k = karts[i];
        k.root.position.set(
          t.x + t.nx * p.offset,
          0.04 + Math.sin(time * 18 + i) * 0.018 * (p.speed / 45),
          t.z + t.nz * p.offset,
        );
        k.root.rotation.y =
          t.angle + p.yaw + (p.stun > 0 ? Math.sin(time * 20) * 0.45 : 0);
        k.root.rotation.z = p.yaw * 0.065;
        k.animate(p, time);
      });
      pickups.forEach((g, i) => {
        g.visible = r.pickups[i].cooldown <= 0;
        g.rotation.y = time;
        g.position.y = 1.65 + Math.sin(time * 2 + i) * 0.18;
      });
      hazards.forEach((g, i) => {
        const h = r.hazards[i];
        g.visible = !!h;
        if (h) {
          const p = at(h.s);
          g.position.set(p.x + p.nx * h.offset, 0.14, p.z + p.nz * h.offset);
        }
      });
      skidTime += dt;
      if (skidTime > 0.04) {
        skidTime = 0;
        for (const p of r.racers)
          if (p.drifting) {
            const k = karts[p.id].root;
            for (const x of [-1.24, 1.24]) {
              dummy.position.copy(
                k.localToWorld(new THREE.Vector3(x, 0.105, -1)),
              );
              dummy.position.y = 0.135;
              dummy.rotation.set(-Math.PI / 2, 0, -k.rotation.y);
              dummy.scale.set(1, 1, 1);
              dummy.updateMatrix();
              skids.setMatrixAt(skidIndex++ % 400, dummy.matrix);
            }
          }
        skids.instanceMatrix.needsUpdate = true;
      }
      const p = r.racers[localIndex],
        t = at(p.s),
        k = karts[localIndex].root.position;
      if (r.state === 'menu') {
        const base = at(-16);
        target.set(base.x - base.nx * 10, 5.3, base.z - base.nz * 10);
        look.set(start.x, 1.3, start.z);
      } else {
        const a = t.angle + p.yaw * 0.65;
        target.set(k.x - Math.sin(a) * 8.7, k.y + 4.7, k.z - Math.cos(a) * 8.7);
        look.set(k.x + Math.sin(a) * 8, 1.25, k.z + Math.cos(a) * 8);
      }
      if (!initialized) {
        camera.position.copy(target);
        smoothLook.copy(look);
        initialized = true;
      } else {
        camera.position.lerp(target, 1 - Math.exp(-dt * 8));
        smoothLook.lerp(look, 1 - Math.exp(-dt * 12));
      }
      camera.lookAt(smoothLook);
      sun.position.set(k.x - 70, 130, k.z - 70);
      sun.target.position.set(k.x, 0, k.z);
      const fov = p.boost > 0 ? 68 : 58;
      camera.fov += (fov - camera.fov) * Math.min(1, dt * 5);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    },
    dispose() {
      const geos = new Set(),
        mats = new Set(),
        textures = new Set();
      scene.traverse((o) => {
        if (o.geometry) geos.add(o.geometry);
        for (const m of o.material
          ? Array.isArray(o.material)
            ? o.material
            : [o.material]
          : []) {
          mats.add(m);
          if (m.map) textures.add(m.map);
        }
      });
      geos.forEach((g) => g.dispose());
      textures.forEach((t) => t.dispose());
      mats.forEach((m) => m.dispose());
      renderer.dispose();
    },
  };
}

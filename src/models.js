import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
export const material = (color, options = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.72, ...options });
export function addMesh(parent, geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
export function box(parent, w, h, d, mat, x = 0, y = 0, z = 0, r = 0) {
  return addMesh(
    parent,
    r ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d),
    mat,
    x,
    y,
    z,
  );
}
export function mergeStatic(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert(),
    byMat = new Map(),
    remove = [];
  group.traverse((o) => {
    if (o.isMesh && !Array.isArray(o.material)) {
      const g = o.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      if (g.index) g.setIndex(g.index);
      const list = byMat.get(o.material) || [];
      list.push(g.index ? g.toNonIndexed() : g.clone());
      byMat.set(o.material, list);
      g.dispose();
      remove.push(o);
    }
  });
  for (const o of remove) o.removeFromParent();
  for (const [m, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    if (merged) addMesh(group, merged, m);
    for (const g of geos) g.dispose();
  }
}
export function labelTexture(
  text,
  bg = '#203545',
  fg = '#fff8db',
  w = 512,
  h = 128,
) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${h * 0.56}px Arial`;
  ctx.fillText(text, w / 2, h / 2, w - 20);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function limb(parent, a, b, r, mat) {
  const start = new THREE.Vector3(...a),
    end = new THREE.Vector3(...b),
    delta = end.clone().sub(start);
  const m = addMesh(
    parent,
    new THREE.CapsuleGeometry(r, Math.max(0.01, delta.length() - r * 2), 4, 8),
    mat,
  );
  m.position.copy(start.add(end).multiplyScalar(0.5));
  m.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    delta.normalize(),
  );
  return m;
}
export function createKart(color, index) {
  const root = new THREE.Group(),
    body = new THREE.Group();
  root.add(body);
  const paint = material(color, { roughness: 0.3, metalness: 0.18 }),
    trim = material('#fff1c3', { roughness: 0.4 }),
    dark = material('#222533'),
    rubber = material('#1c202d', { roughness: 1 }),
    chrome = material('#9cbed0', { metalness: 0.65, roughness: 0.28 }),
    engine = material('#48495e', { metalness: 0.45 }),
    skin = material('#edaf77'),
    suit = material('#2b3664'),
    visorMat = material('#163d53', { roughness: 0.12, metalness: 0.5 }),
    gold = material('#ffe857', { metalness: 0.3, roughness: 0.3 });
  // Low sculpted tub, rounded sidepods, pointed nose and separate front splitter.
  box(body, 2.1, 0.23, 3.6, dark, 0, 0.38, 0, 0.09);
  box(body, 1.85, 0.55, 2.9, paint, 0, 0.67, -0.25, 0.19);
  for (const x of [-0.96, 0.96]) {
    box(body, 0.5, 0.58, 2.5, paint, x, 0.69, -0.22, 0.18);
    box(body, 0.51, 0.09, 2.1, trim, x, 0.9, -0.1, 0.035);
    for (let i = 0; i < 3; i++)
      box(
        body,
        0.025,
        0.22,
        0.19,
        dark,
        x + Math.sign(x) * 0.25,
        0.64,
        -0.72 + i * 0.3,
        0.015,
      );
  }
  const shape = new THREE.Shape();
  shape.moveTo(-0.65, -1.9);
  shape.quadraticCurveTo(0, -2.15, 0.65, -1.9);
  shape.lineTo(0.85, -0.75);
  shape.lineTo(-0.85, -0.75);
  shape.closePath();
  const nose = addMesh(
    body,
    new THREE.ExtrudeGeometry(shape, {
      depth: 0.32,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.12,
      bevelThickness: 0.08,
    }),
    paint,
    0,
    0.61,
    0,
  );
  nose.rotation.x = -Math.PI / 2;
  box(body, 0.2, 0.025, 1.4, trim, 0, 1.03, 1.07, 0.01);
  box(body, 2.4, 0.18, 0.4, trim, 0, 0.39, 1.85, 0.06);
  for (const x of [-1.07, 1.07])
    box(body, 0.14, 0.24, 0.7, paint, x, 0.53, 1.7, 0.06);
  // Engine and twin chrome exhausts sit visibly behind the driver.
  box(body, 1.12, 0.72, 0.8, engine, 0, 0.92, -1.26, 0.1);
  for (let i = 0; i < 5; i++)
    box(body, 1.14, 0.045, 0.065, chrome, 0, 1.29, -1.55 + i * 0.13);
  box(body, 0.45, 0.22, 0.45, gold, 0, 1.4, -1.25, 0.04);
  for (const x of [-0.76, 0.76]) {
    const exhaust = addMesh(
      body,
      new THREE.CylinderGeometry(0.14, 0.19, 0.7, 12),
      chrome,
      x,
      0.65,
      -1.85,
    );
    exhaust.rotation.x = Math.PI / 2;
    const hole = addMesh(
      body,
      new THREE.CircleGeometry(0.12, 12),
      dark,
      x,
      0.65,
      -2.21,
    );
    hole.rotation.y = Math.PI;
    box(body, 0.13, 0.62, 0.16, dark, x, 1.25, -1.47);
  }
  box(body, 2.45, 0.16, 0.55, paint, 0, 1.57, -1.55, 0.065);
  box(body, 1.45, 0.03, 0.4, trim, 0, 1.67, -1.55, 0.025);
  // Bucket seat, boots, gloved arms and expressive oversized racing helmet.
  box(body, 0.94, 0.85, 0.37, dark, 0, 1.22, -0.65, 0.1);
  box(body, 0.75, 0.58, 0.62, suit, 0, 1.22, -0.28, 0.15);
  for (const side of [-1, 1]) {
    limb(
      body,
      [side * 0.23, 1.05, -0.1],
      [side * 0.29, 0.98, 0.75],
      0.16,
      suit,
    );
    box(body, 0.32, 0.22, 0.5, trim, side * 0.3, 0.92, 0.82, 0.08);
    limb(body, [side * 0.4, 1.49, -0.28], [side * 0.52, 1.27, 0.1], 0.16, suit);
    limb(body, [side * 0.52, 1.27, 0.1], [side * 0.3, 1.39, 0.44], 0.12, skin);
    addMesh(
      body,
      new THREE.SphereGeometry(0.16, 12, 8),
      trim,
      side * 0.3,
      1.39,
      0.44,
    );
  }
  const steering = addMesh(
    body,
    new THREE.TorusGeometry(0.37, 0.055, 8, 24),
    dark,
    0,
    1.36,
    0.48,
  );
  steering.rotation.x = -0.65;
  limb(body, [0, 0.7, 0.62], [0, 1.36, 0.48], 0.045, chrome);
  addMesh(body, new THREE.SphereGeometry(0.49, 20, 14), skin, 0, 1.83, -0.21);
  const helmet = addMesh(
    body,
    new THREE.SphereGeometry(0.66, 24, 18),
    trim,
    0,
    2.07,
    -0.29,
  );
  helmet.scale.set(0.93, 1, 0.96);
  const face = addMesh(
    body,
    new THREE.SphereGeometry(0.48, 20, 12),
    skin,
    0,
    1.91,
    0.12,
  );
  face.scale.set(1, 0.72, 0.62);
  const visor = addMesh(
    root,
    new THREE.SphereGeometry(0.51, 20, 12),
    visorMat,
    0,
    2.08,
    0.16,
  );
  visor.scale.set(1, 0.54, 0.52);
  // Side roundels and three stripes are changed by the garage options.
  for (const x of [-0.615, 0.615]) {
    const roundel = addMesh(
      body,
      new THREE.CylinderGeometry(0.23, 0.23, 0.05, 20),
      paint,
      x,
      2.11,
      -0.27,
    );
    roundel.rotation.z = Math.PI / 2;
  }
  const stripes = new THREE.Group();
  root.add(stripes);
  for (const x of [-0.18, 0, 0.18]) {
    const st = addMesh(
      stripes,
      new THREE.TorusGeometry(0.663, 0.035, 6, 32, Math.PI * 1.23),
      paint,
      x,
      2.07,
      -0.29,
    );
    st.rotation.y = Math.PI / 2;
    st.rotation.z = -0.35;
  }
  const badge = addMesh(
    body,
    new THREE.PlaneGeometry(0.55, 0.32),
    new THREE.MeshStandardMaterial({
      map: labelTexture(String(index + 1), '#fff1c3', '#262838', 128, 80),
      roughness: 0.5,
    }),
    0,
    1.05,
    1.5,
  );
  badge.rotation.x = -Math.PI / 2;
  const wheels = [];
  for (const x of [-1.24, 1.24])
    for (const z of [-1.05, 1.23]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.48, z);
      root.add(pivot);
      const spin = new THREE.Group();
      pivot.add(spin);
      const tire = addMesh(
        spin,
        new THREE.CylinderGeometry(0.48, 0.48, 0.43, 24),
        rubber,
      );
      tire.rotation.z = Math.PI / 2;
      const ring = addMesh(
        spin,
        new THREE.TorusGeometry(0.34, 0.055, 8, 20),
        paint,
        Math.sign(x) * 0.23,
        0,
        0,
      );
      ring.rotation.y = Math.PI / 2;
      const hub = addMesh(
        spin,
        new THREE.CylinderGeometry(0.25, 0.25, 0.47, 12),
        chrome,
      );
      hub.rotation.z = Math.PI / 2;
      for (let j = 0; j < 5; j++) {
        const spoke = box(
          spin,
          0.025,
          0.38,
          0.06,
          trim,
          Math.sign(x) * 0.244,
          0,
          0,
          0.01,
        );
        spoke.rotation.x = (j / 5) * Math.PI;
      }
      mergeStatic(spin);
      wheels.push({ pivot, spin, front: z > 0 });
    }
  const flameMat = new THREE.MeshBasicMaterial({
    color: '#ffcb41',
    transparent: true,
    opacity: 0.95,
  });
  const flames = [];
  for (const x of [-0.76, 0.76]) {
    const f = addMesh(
      root,
      new THREE.ConeGeometry(0.22, 1.4, 12),
      flameMat,
      x,
      0.66,
      -2.75,
    );
    f.rotation.x = -Math.PI / 2;
    f.visible = false;
    flames.push(f);
  }
  const shield = addMesh(
    root,
    new THREE.SphereGeometry(2.4, 24, 16),
    new THREE.MeshBasicMaterial({
      color: '#64eaff',
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
    }),
    0,
    1.1,
    0,
  );
  shield.visible = false;
  const sparkMat = material('#4bdfff', {
    emissive: '#1ea9ff',
    emissiveIntensity: 3,
  });
  const sparks = [];
  for (let i = 0; i < 6; i++) {
    const s = addMesh(
      root,
      new THREE.OctahedronGeometry(0.085),
      sparkMat,
      (i % 2 ? 1 : -1) * 1.35,
      0.17,
      -1.2,
    );
    s.visible = false;
    sparks.push(s);
  }
  mergeStatic(body);
  mergeStatic(stripes);
  return {
    root,
    paint,
    visor,
    stripes,
    wheels,
    flames,
    shield,
    sparks,
    sparkMat,
    animate(p, t) {
      paint.color.set(p.color || color);
      visor.scale.y = p.helmet === 'visor' ? 0.85 : 0.54;
      stripes.visible = p.helmet !== 'classic';
      wheels.forEach((w) => {
        w.spin.rotation.x = t * p.speed * 1.6;
        w.pivot.rotation.y = w.front ? p.yaw * 0.5 : 0;
      });
      flames.forEach((f) => {
        f.visible = p.boost > 0;
        f.scale.y = 0.8 + Math.sin(t * 45) * 0.35;
      });
      shield.visible = p.shield > 0;
      sparkMat.color.set(p.drift > 1.7 ? '#ffd33a' : '#49dfff');
      sparkMat.emissive.set(p.drift > 1.7 ? '#ff9600' : '#27aaff');
      sparks.forEach((s, i) => {
        s.visible = p.drifting;
        s.position.z = -1.1 - ((t * 7 + i * 0.19) % 1) * 1.4;
        s.position.y = 0.15 + Math.sin(t * 24 + i) * 0.15;
      });
    },
  };
}

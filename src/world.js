import * as THREE from 'three';
import {
  at,
  TRACK,
  LENGTH,
  WIDTH,
  COLORS,
  OBSTACLES,
  TRACK_FEATURES,
} from './physics.js';
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
    new THREE.CylinderGeometry(470, 480, 4, 96),
    grass,

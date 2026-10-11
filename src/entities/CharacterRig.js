import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeToonMaterial, makeOutlineMaterial } from '../world/materials.js';
import { makeRng, lerp, clamp } from '../core/MathUtils.js';

/**
 * CharacterRig — builds a fully rigged humanoid (or beast, or skeleton, or
 * wall) out of primitives and returns the joint groups the Animator drives.
 *
 * Design notes:
 *  • Every joint group owns ONE merged, vertex-coloured mesh, so a whole
 *    character is ~16 draw calls with a single material. That is what makes
 *    twenty-foe fights viable in a browser.
 *  • Silhouette first: shoulders, headgear, weapons and tails are exaggerated
 *    because from fifteen metres that's all the player actually reads.
 *  • The same builder runs for the player, every enemy archetype, and NPCs —
 *    variety comes from `config`, not from new code.
 */

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

function paint(geo, hex) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  _c.setHex(hex);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

const G = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  cyl: (rt, rb, h, seg = 7) => new THREE.CylinderGeometry(rt, rb, h, seg),
  cone: (r, h, seg = 6) => new THREE.ConeGeometry(r, h, seg),
  sph: (r, seg = 7) => new THREE.SphereGeometry(r, seg, Math.max(4, seg >> 1)),
  plane: (w, h) => new THREE.PlaneGeometry(w, h),
};

/** Accumulates fragments per joint and merges them at the end. */
class RigBuilder {
  constructor() {
    this.groups = new Map();
    this.order = [];
  }

  add(joint, geo, color, t = {}) {
    const g = geo.clone();
    if (t.s !== undefined) {
      if (typeof t.s === 'number') g.scale(t.s, t.s, t.s);
      else g.scale(t.s[0], t.s[1], t.s[2]);
    }
    if (t.rx) g.rotateX(t.rx);
    if (t.ry) g.rotateY(t.ry);
    if (t.rz) g.rotateZ(t.rz);
    g.translate(t.x || 0, t.y || 0, t.z || 0);
    paint(g, color);
    if (!this.groups.has(joint)) { this.groups.set(joint, []); this.order.push(joint); }
    this.groups.get(joint).push(g);
    return this;
  }
}

const DEFAULT_CONFIG = {
  height: 1.75,
  build: 'lean',               // lean | heavy | squat | gaunt | beast | quadruped | bird | wall | skeletal
  skin: 0xd0a887,
  cloth: 0x2f3a4a,
  accent: 0xb03a2e,
  hair: 0x14110f,
  metal: 0xb8bcc4,
  eye: 0x101014,
  head: 'human',
  horns: null,                 // bull | short | great | null
  tusks: false,
  mask: null,                  // kitsune | oni | hannya | namahage | mempo | tengu
  tails: 0,
  wings: null,                 // crow | tengu
  beak: false,
  antlers: false,
  shell: false,
  wispy: false,
  float: false,
  longHair: false,
  noose: false,
  armor: false,
  bald: false,
  topknot: false,
  hood: false,
  rag: false,
  strawCape: false,
  spiderLegs: false,
  serpent: false,
  bundle: false,
  bells: false,
  crowns: 0,
  giant: false,
  weapon: 'none',
  aura: null,
  outline: true,
  seed: 1,
};

/**
 * @param {object} config see DEFAULT_CONFIG
 * @returns {{root:THREE.Group, joints:Object, materials:Array, height:number,
 *            weaponMount:THREE.Group, headMount:THREE.Group, tailSegments:Array,
 *            auraMesh:THREE.Mesh|null, config:object}}
 */
export function buildCharacter(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const rng = makeRng(cfg.seed || 1);
  const B = new RigBuilder();

  const scale = cfg.height / 1.75;
  const build = cfg.build;
  const bulk = build === 'heavy' ? 1.45 : build === 'squat' ? 1.25 : build === 'gaunt' ? 0.78
    : build === 'skeletal' ? 0.8 : build === 'beast' ? 1.1 : 1;
  const limb = build === 'gaunt' ? 0.72 : build === 'skeletal' ? 0.75 : bulk;

  // ── measurements (metres, pre-scale) ───────────────────────────────────
  const legLen = 0.86 * (build === 'squat' ? 0.62 : 1);
  const thighLen = 0.46 * (build === 'squat' ? 0.62 : 1);
  const shinLen = legLen - thighLen;
  const torsoLen = 0.62 * (build === 'squat' ? 0.8 : 1);
  const shoulderW = 0.46 * bulk;
  const headSize = 0.23 * (build === 'skeletal' ? 1.05 : 1) * (cfg.giant ? 2.6 : 1);

  // ── joints ─────────────────────────────────────────────────────────────
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = legLen;
  const spine = new THREE.Group(); spine.position.y = 0.08;
  const chest = new THREE.Group(); chest.position.y = torsoLen * 0.62;
  const neck = new THREE.Group(); neck.position.y = torsoLen * 0.42;
  const head = new THREE.Group(); head.position.y = 0.16;
  const shoulderL = new THREE.Group(); shoulderL.position.set(shoulderW, torsoLen * 0.34, 0);
  const shoulderR = new THREE.Group(); shoulderR.position.set(-shoulderW, torsoLen * 0.34, 0);
  const armL = new THREE.Group(); const armR = new THREE.Group();
  const foreL = new THREE.Group(); foreL.position.y = -0.30;
  const foreR = new THREE.Group(); foreR.position.y = -0.30;
  const handL = new THREE.Group(); handL.position.y = -0.28;
  const handR = new THREE.Group(); handR.position.y = -0.28;
  const upLegL = new THREE.Group(); upLegL.position.set(0.17 * bulk, 0, 0);
  const upLegR = new THREE.Group(); upLegR.position.set(-0.17 * bulk, 0, 0);
  const legL = new THREE.Group(); legL.position.y = -thighLen;
  const legR = new THREE.Group(); legR.position.y = -thighLen;
  const footL = new THREE.Group(); footL.position.y = -shinLen;
  const footR = new THREE.Group(); footR.position.y = -shinLen;

  root.add(hips);
  hips.add(spine);
  spine.add(chest);
  chest.add(neck, shoulderL, shoulderR);
  neck.add(head);
  shoulderL.add(armL); armL.add(foreL); foreL.add(handL);
  shoulderR.add(armR); armR.add(foreR); foreR.add(handR);
  hips.add(upLegL, upLegR);
  upLegL.add(legL); legL.add(footL);
  upLegR.add(legR); legR.add(footR);

  // ── torso ──────────────────────────────────────────────────────────────
  const cloth = cfg.cloth;
  const skin = cfg.skin;
  B.add('hips', G.box(0.42 * bulk, 0.32, 0.28 * bulk), cloth, { y: -0.06 });
  B.add('hips', G.box(0.48 * bulk, 0.46, 0.34 * bulk), cfg.accent, { y: -0.34 });   // hakama / skirt
  if (cfg.armor) {
    B.add('hips', G.box(0.52 * bulk, 0.24, 0.36 * bulk), 0x3a3a44, { y: -0.02 });
  }
  B.add('spine', G.box(0.40 * bulk, torsoLen * 0.7, 0.26 * bulk), cloth, { y: torsoLen * 0.32 });
  B.add('chest', G.box(0.52 * bulk, torsoLen * 0.5, 0.30 * bulk), cloth, { y: torsoLen * 0.06 });
  if (cfg.armor) {
    B.add('chest', G.box(0.56 * bulk, 0.34, 0.34 * bulk), 0x454550, { y: torsoLen * 0.1 });
    B.add('chest', G.box(0.18, 0.06, 0.36 * bulk), cfg.accent, { y: torsoLen * 0.24 });
  }
  // haori / shoulder mantle — the strongest silhouette cue in the game
  B.add('chest', G.box(0.66 * bulk, 0.10, 0.42 * bulk), cfg.accent, { y: torsoLen * 0.24 });
  B.add('chest', G.box(0.13, 0.34, 0.34 * bulk), cloth, { x: 0.30 * bulk, y: torsoLen * 0.06 });
  B.add('chest', G.box(0.13, 0.34, 0.34 * bulk), cloth, { x: -0.30 * bulk, y: torsoLen * 0.06 });
  if (cfg.strawCape) {
    B.add('chest', G.box(0.72 * bulk, 0.5, 0.30), 0xb8a060, { y: torsoLen * 0.05, z: -0.20 });
  }
  if (cfg.rag) {
    B.add('hips', G.box(0.46 * bulk, 0.30, 0.10), 0x6a5a44, { y: -0.42, z: -0.16 });
  }
  // neck + head
  B.add('chest', G.cyl(0.075, 0.085, 0.12, 6), skin, { y: torsoLen * 0.34 });

  // ── head ───────────────────────────────────────────────────────────────
  const hs = headSize;
  switch (cfg.head) {
    case 'oni':
      B.add('head', G.box(hs * 2.0, hs * 2.0, hs * 1.9), skin);
      B.add('head', G.box(hs * 1.0, hs * 0.5, hs * 0.6), 0xf0e6d2, { y: -hs * 0.5, z: hs * 0.85 });
      B.add('head', G.box(hs * 0.24, hs * 0.3, hs * 0.2), 0xf0e6d2, { x: -hs * 0.5, y: -hs * 0.2, z: hs * 0.95 });
      B.add('head', G.box(hs * 0.24, hs * 0.3, hs * 0.2), 0xf0e6d2, { x: hs * 0.5, y: -hs * 0.2, z: hs * 0.95 });
      break;
    case 'skull':
      B.add('head', G.sph(hs * 1.05, 7), 0xe8e0d0, { s: [1, 1.1, 1.05] });
      B.add('head', G.box(hs * 0.9, hs * 0.55, hs * 0.7), 0xe8e0d0, { y: -hs * 0.85, z: hs * 0.3 });
      B.add('head', G.box(hs * 0.5, hs * 0.5, hs * 0.24), 0x1a161a, { y: -hs * 0.05, z: hs * 0.92 });
      break;
    case 'kitsune':
      B.add('head', G.sph(hs * 0.95, 7), skin, { s: [1, 1.05, 1.1] });
      B.add('head', G.cone(hs * 0.42, hs * 0.9, 5), skin, { y: -hs * 0.55, z: hs * 0.75, rx: 1.35 });
      B.add('head', G.cone(hs * 0.3, hs * 0.55, 4), skin, { x: -hs * 0.55, y: hs * 0.85, z: 0, rz: 0.35 });
      B.add('head', G.cone(hs * 0.3, hs * 0.55, 4), skin, { x: hs * 0.55, y: hs * 0.85, z: 0, rz: -0.35 });
      B.add('head', G.box(hs * 0.2, hs * 0.16, hs * 0.2), cfg.accent, { y: -hs * 0.1, z: hs * 0.95 });
      break;
    case 'tengu':
      B.add('head', G.sph(hs * 0.95, 7), skin, { s: [1, 1.1, 1] });
      B.add('head', G.cone(hs * 0.32, hs * 1.1, 5), 0xe8c86a, { y: -hs * 0.1, z: hs * 1.0, rx: 1.5 });
      break;
    case 'crow':
      B.add('head', G.sph(hs * 0.8, 6), 0x1c1a20);
      B.add('head', G.cone(hs * 0.25, hs * 0.8, 5), 0xd8a050, { z: hs * 0.9, rx: 1.5 });
      break;
    case 'deer':
      B.add('head', G.box(hs * 0.9, hs * 0.9, hs * 1.6), skin);
      B.add('head', G.box(hs * 0.55, hs * 0.45, hs * 0.7), 0xf0e6d2, { y: -hs * 0.2, z: hs * 1.3 });
      if (cfg.antlers) {
        B.add('head', G.cyl(0.02, 0.03, hs * 1.3, 4), 0xd8c8a0, { x: -hs * 0.3, y: hs * 1.1, rz: 0.4 });
        B.add('head', G.cyl(0.02, 0.03, hs * 1.3, 4), 0xd8c8a0, { x: hs * 0.3, y: hs * 1.1, rz: -0.4 });
      }
      break;
    case 'boar':
      B.add('head', G.box(hs * 1.1, hs * 0.9, hs * 1.5), skin);
      B.add('head', G.box(hs * 0.7, hs * 0.4, hs * 0.6), 0x6a5a4a, { y: -hs * 0.15, z: hs * 1.2 });
      if (cfg.tusks) {
        B.add('head', G.cone(0.05, 0.26, 4), 0xe8d8c0, { x: -hs * 0.4, y: -hs * 0.2, z: hs * 1.1, rx: -0.9, rz: 0.3 });
        B.add('head', G.cone(0.05, 0.26, 4), 0xe8d8c0, { x: hs * 0.4, y: -hs * 0.2, z: hs * 1.1, rx: -0.9, rz: -0.3 });
      }
      break;
    case 'tanuki':
      B.add('head', G.sph(hs * 0.9, 6), skin);
      B.add('head', G.box(hs * 0.5, hs * 0.35, hs * 0.5), 0x3a2a1a, { y: -hs * 0.15, z: hs * 0.85 });
      B.add('head', G.sph(hs * 0.22, 5), 0x3a2a1a, { x: -hs * 0.42, y: -hs * 0.1, z: hs * 0.5 });
      B.add('head', G.sph(hs * 0.22, 5), 0x3a2a1a, { x: hs * 0.42, y: -hs * 0.1, z: hs * 0.5 });
      break;
    case 'kappa':
      B.add('head', G.sph(hs * 1.0, 7), skin, { s: [1.1, 0.95, 1.1] });
      B.add('head', G.cyl(hs * 0.55, hs * 0.6, hs * 0.2, 8), 0xe8d8a0, { y: hs * 0.72 });
      B.add('head', G.cone(hs * 0.24, hs * 0.5, 5), 0xa8d8ff, { y: -hs * 0.1, z: hs * 0.95, rx: 1.5 });
      if (cfg.shell) B.add('spine', G.sph(0.34, 7), 0x4a6a4a, { y: torsoLen * 0.3, z: -0.24, s: [1, 1, 0.6] });
      break;
    case 'giant_head':
      B.add('head', G.sph(hs * 2.6, 8), 0xc9a184);
      B.add('head', G.box(hs * 1.2, hs * 0.5, hs * 0.5), 0x20181c, { y: -hs * 0.4, z: hs * 2.4 });
      break;
    case 'none':
      break;
    default: // human
      B.add('head', G.box(hs * 1.55, hs * 1.75, hs * 1.5), skin);
      B.add('head', G.box(hs * 1.0, hs * 0.55, hs * 0.4), skin, { y: -hs * 0.35, z: hs * 0.72 });
      break;
  }

  // eyes (everyone gets eyes; they're what reads at distance)
  if (cfg.head !== 'none') {
    const ez = cfg.head === 'human' ? hs * 0.76 : hs * 0.85;
    B.add('head', G.box(hs * 0.26, hs * 0.14, hs * 0.1), cfg.eye, { x: -hs * 0.36, y: hs * 0.12, z: ez });
    B.add('head', G.box(hs * 0.26, hs * 0.14, hs * 0.1), cfg.eye, { x: hs * 0.36, y: hs * 0.12, z: ez });
  }

  // hair / headgear
  if (!cfg.bald && cfg.head === 'human') {
    B.add('head', G.box(hs * 1.62, hs * 0.5, hs * 1.56), cfg.hair, { y: hs * 0.9 });
    B.add('head', G.box(hs * 1.66, hs * 1.0, hs * 0.4), cfg.hair, { y: hs * 0.1, z: -hs * 0.72 });
    if (cfg.topknot) B.add('head', G.cyl(0.03, 0.05, hs * 0.9, 5), cfg.hair, { y: hs * 1.4, z: -hs * 0.4, rx: -0.5 });
  }
  if (cfg.longHair) {
    B.add('head', G.box(hs * 1.5, hs * 2.4, hs * 0.5), cfg.hair || 0x14110f, { y: -hs * 1.1, z: -hs * 0.7 });
    B.add('chest', G.box(hs * 1.2, 0.5, hs * 0.4), cfg.hair || 0x14110f, { y: torsoLen * 0.1, z: -0.2 });
  }
  if (cfg.hood) {
    B.add('head', G.cone(hs * 1.3, hs * 1.8, 6), cloth, { y: hs * 0.5 });
  }
  if (cfg.horns) {
    const big = cfg.horns === 'great' ? 1.5 : cfg.horns === 'bull' ? 1.15 : 0.75;
    B.add('head', G.cone(hs * 0.24, hs * 1.2 * big, 5), 0xe8dcc8, { x: -hs * 0.55, y: hs * 0.95, rz: 0.42 });
    B.add('head', G.cone(hs * 0.24, hs * 1.2 * big, 5), 0xe8dcc8, { x: hs * 0.55, y: hs * 0.95, rz: -0.42 });
  }
  if (cfg.tusks && cfg.head !== 'boar') {
    B.add('head', G.cone(0.04, 0.18, 4), 0xe8dcc8, { x: -hs * 0.4, y: -hs * 0.6, z: hs * 0.7, rx: 3.0 });
    B.add('head', G.cone(0.04, 0.18, 4), 0xe8dcc8, { x: hs * 0.4, y: -hs * 0.6, z: hs * 0.7, rx: 3.0 });
  }
  if (cfg.mask) {
    const mc = cfg.mask === 'kitsune' ? 0xf0e6d2 : cfg.mask === 'hannya' ? 0xd8c0a0
      : cfg.mask === 'namahage' ? 0x3a5a7a : cfg.mask === 'tengu' ? 0xb03a2e : 0x3a3a44;
    B.add('head', G.box(hs * 1.62, hs * 1.2, hs * 0.24), mc, { y: hs * 0.05, z: hs * 0.82 });
    if (cfg.mask === 'kitsune') {
      B.add('head', G.box(hs * 0.5, hs * 0.3, hs * 0.24), cfg.accent, { y: hs * 0.45, z: hs * 0.86 });
      B.add('head', G.box(hs * 0.34, hs * 0.2, hs * 0.24), cfg.accent, { x: -hs * 0.5, y: -hs * 0.3, z: hs * 0.86 });
      B.add('head', G.box(hs * 0.34, hs * 0.2, hs * 0.24), cfg.accent, { x: hs * 0.5, y: -hs * 0.3, z: hs * 0.86 });
    }
    if (cfg.mask === 'hannya' || cfg.mask === 'namahage') {
      B.add('head', G.cone(hs * 0.2, hs * 0.7, 5), 0xe8dcc8, { x: -hs * 0.45, y: hs * 0.6, z: hs * 0.8, rz: 0.3 });
      B.add('head', G.cone(hs * 0.2, hs * 0.7, 5), 0xe8dcc8, { x: hs * 0.45, y: hs * 0.6, z: hs * 0.8, rz: -0.3 });
      B.add('head', G.box(hs * 1.0, hs * 0.22, hs * 0.2), 0x20181c, { y: -hs * 0.42, z: hs * 0.9 });
    }
  }
  if (cfg.noose) {
    B.add('head', G.cyl(hs * 1.1, hs * 1.1, 0.07, 8), 0x8a7a5a, { y: -hs * 1.1 });
    B.add('head', G.cyl(0.03, 0.03, 0.7, 5), 0x8a7a5a, { y: hs * 1.6 });
  }
  if (cfg.bells) {
    for (let i = 0; i < Math.min(9, cfg.crowns || 3); i++) {
      B.add('chest', G.sph(0.05, 5), 0xe8c86a, { x: -0.22 + (i % 3) * 0.22, y: torsoLen * 0.2 - Math.floor(i / 3) * 0.14, z: 0.22 });
    }
  }
  if (cfg.crowns) {
    for (let i = 0; i < Math.min(9, cfg.crowns); i++) {
      B.add('head', G.cone(0.04, 0.18, 4), 0xe8c86a, {
        x: Math.cos((i / cfg.crowns) * 6.28) * hs * 0.9,
        y: hs * 1.15, z: Math.sin((i / cfg.crowns) * 6.28) * hs * 0.9,
      });
    }
  }

  // ── arms ───────────────────────────────────────────────────────────────
  const upperArm = 0.30 * (build === 'squat' ? 0.8 : 1);
  for (const [side, shoulder, arm, fore, hand] of [
    [1, shoulderL, armL, foreL, handL], [-1, shoulderR, armR, foreR, handR],
  ]) {
    B.add(shoulder === shoulderL ? 'shoulderL' : 'shoulderR',
      G.sph(0.13 * bulk, 6), cloth, { x: side * 0.02 });
    B.add(arm === armL ? 'armL' : 'armR',
      G.cyl(0.075 * limb, 0.085 * limb, upperArm, 6), skin, { y: -upperArm / 2 });
    B.add(arm === armL ? 'armL' : 'armR',
      G.cyl(0.095 * limb, 0.10 * limb, upperArm * 0.55, 6), cloth, { y: -upperArm * 0.28 });
    B.add(fore === foreL ? 'foreL' : 'foreR',
      G.cyl(0.060 * limb, 0.072 * limb, 0.28, 6), skin, { y: -0.14 });
    B.add(hand === handL ? 'handL' : 'handR',
      G.box(0.10, 0.14, 0.07), skin, { y: -0.06 });
  }

  // ── legs ───────────────────────────────────────────────────────────────
  for (const [up, leg, foot, side] of [
    [upLegL, legL, footL, 1], [upLegR, legR, footR, -1],
  ]) {
    const jn = up === upLegL ? ['upLegL', 'legL', 'footL'] : ['upLegR', 'legR', 'footR'];
    B.add(jn[0], G.cyl(0.105 * bulk, 0.09 * bulk, thighLen, 6), cloth, { y: -thighLen / 2 });
    B.add(jn[1], G.cyl(0.075 * limb, 0.06 * limb, shinLen, 6), build === 'skeletal' ? 0xe8e0d0 : skin, { y: -shinLen / 2 });
    B.add(jn[1], G.box(0.14, 0.20, 0.15), cloth, { y: -shinLen * 0.55 });   // greave / puttee
    B.add(jn[2], G.box(0.13, 0.08, 0.30), 0x3a3028, { y: -0.04, z: 0.05 });
    B.add(jn[2], G.box(0.14, 0.05, 0.10), cfg.accent, { y: 0.02, z: 0.02 });
  }

  // ── weapon ─────────────────────────────────────────────────────────────
  const weaponMount = new THREE.Group();
  handR.add(weaponMount);
  weaponMount.position.set(0, -0.10, 0.02);
  addWeapon(B, weaponMount, cfg, { metal: cfg.metal, accent: cfg.accent });

  // ── tails / wings / extras ─────────────────────────────────────────────
  const tailSegments = [];
  if (cfg.tails > 0) {
    const tailRoot = new THREE.Group();
    tailRoot.position.set(0, -0.05, -0.22 * bulk);
    hips.add(tailRoot);
    let parent = tailRoot;
    const segLen = 0.34;
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Group();
      seg.position.y = i === 0 ? 0 : segLen;
      if (i === 0) seg.position.z = -0.05;
      parent.add(seg);
      const r = 0.16 - i * 0.018;
      const geo = mergeGeometries([
        paint(G.cyl(r * 0.8, r, segLen, 6).translate(0, segLen * 0.4, 0), cfg.skin),
        paint(G.sph(r * 0.9, 6).translate(0, segLen * 0.85, 0), i === 4 ? 0xf0e6d2 : cfg.skin),
      ], false);
      const mesh = new THREE.Mesh(geo, null);
      seg.add(mesh);
      tailSegments.push(seg);
      parent = seg;
    }
    tailSegments.userCount = cfg.tails;
    root.userData.tailRoots = [tailRoot];
  }

  if (cfg.wings) {
    for (const side of [1, -1]) {
      const wing = new THREE.Group();
      wing.position.set(side * 0.22 * bulk, torsoLen * 0.2, -0.16);
      chest.add(wing);
      const featherColor = cfg.wings === 'tengu' ? 0x2a2430 : 0x1c1a20;
      for (let i = 0; i < 5; i++) {
        const len = 0.9 - i * 0.1;
        const geo = mergeGeometries([
          paint(G.box(0.09, len, 0.05), featherColor),
        ], false);
        const f = new THREE.Mesh(geo, null);
        f.position.set(side * (0.16 + i * 0.13), -len * 0.25, -0.05 - i * 0.02);
        f.rotation.z = side * (-0.35 - i * 0.16);
        wing.add(f);
      }
      root.userData[side > 0 ? 'wingL' : 'wingR'] = wing;
    }
  }

  if (cfg.spiderLegs) {
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? 1 : -1;
      const k = i % 4;
      const legG = new THREE.Group();
      legG.position.set(side * 0.22, torsoLen * 0.1, -0.1 + k * 0.08);
      chest.add(legG);
      const geo = mergeGeometries([
        paint(G.cyl(0.02, 0.04, 0.9, 4), 0x2a1f2a),
        paint(G.cyl(0.015, 0.03, 0.8, 4).translate(side * 0.35, -0.6, 0), 0x2a1f2a),
      ], false);
      const m = new THREE.Mesh(geo, null);
      m.rotation.z = side * (0.5 + k * 0.15);
      legG.add(m);
    }
  }

  if (cfg.serpent) {
    let parent = hips;
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.Group();
      seg.position.set(0, -0.16, i === 0 ? -0.2 : -0.34);
      parent.add(seg);
      const geo = mergeGeometries([paint(G.sph(0.16 - i * 0.015, 6), 0x2a3a4a)], false);
      seg.add(new THREE.Mesh(geo, null));
      parent = seg;
      (root.userData.serpent ||= []).push(seg);
    }
  }

  if (cfg.bundle) {
    const geo = mergeGeometries([paint(G.box(0.4, 0.3, 0.28), 0xf0e6d2)], false);
    const m = new THREE.Mesh(geo, null);
    m.position.set(0.1, -0.1, 0.34);
    chest.add(m);
    root.userData.bundle = m;
  }

  // ── merge each joint into a single mesh ────────────────────────────────
  const jointMap = {
    hips, spine, chest, neck, head,
    shoulderL, shoulderR, armL, armR, foreL, foreR, handL, handR,
    upLegL, upLegR, legL, legR, footL, footR,
  };
  const material = makeToonMaterial(0xffffff, {
    rim: new THREE.Color(cfg.aura ?? 0x8ad8ff),
    rimStrength: cfg.aura ? 0.9 : 0.45,
  });
  material.vertexColors = true;
  material.needsUpdate = true;

  const materials = [material];
  const merged = [];
  for (const joint of B.order) {
    const frags = B.groups.get(joint);
    const group = jointMap[joint];
    if (!frags || !group) continue;
    const list = frags.map((g) => (g.index ? g.toNonIndexed() : g));
    const geo = mergeGeometries(list, false);
    for (const f of frags) f.dispose?.();
    if (!geo) continue;
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    merged.push(mesh);

    if (cfg.outline) {
      const outline = new THREE.Mesh(geo, makeOutlineMaterial(0x120c10, 0.012 * scale));
      outline.castShadow = false;
      outline.receiveShadow = false;
      group.add(outline);
      merged.push(outline);
    }
  }

  // attach tail/wing/extra meshes to the same material
  root.traverse((o) => { if (o.isMesh && o.material === null) o.material = material; });

  root.scale.setScalar(scale);
  root.userData.rig = true;

  // aura shell (rendered for bosses / possessed / devil form states)
  let auraMesh = null;
  if (cfg.aura) {
    const geo = new THREE.SphereGeometry(0.9, 16, 12);
    auraMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: cfg.aura, transparent: true, opacity: 0.12, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    auraMesh.scale.set(0.9, 1.5, 0.9);
    auraMesh.position.y = 1.0;
    auraMesh.visible = false;
    root.add(auraMesh);
    materials.push(auraMesh.material);
  }

  return {
    root, joints: jointMap, material, materials, merged,
    weaponMount, headMount: head, tailSegments, auraMesh,
    config: cfg,
    metrics: { legLen, thighLen, shinLen, torsoLen, shoulderW, headSize, scale, handY: legLen + torsoLen * 0.62 - 0.66 },
  };
}

// ───────────────────────────────────────────────────────────────── weapons
function addWeapon(B, mount, cfg, { metal, accent }) {
  const g = new THREE.Group();
  g.rotation.set(-0.25, 0, 0.1);
  mount.add(g);
  const steel = 0xc8ccd4;
  switch (cfg.weapon) {
    case 'katana': {
      const blade = mergeGeometries([
        paint(G.box(0.035, 1.05, 0.012).translate(0, 0.52, 0), steel),
        paint(G.box(0.045, 0.06, 0.02).translate(0, 1.07, 0), 0xe8f0ff),
        paint(G.box(0.05, 0.24, 0.03).translate(0, -0.1, 0), 0x2a2018),
        paint(G.box(0.13, 0.02, 0.05).translate(0, 0.03, 0), accent),
      ], false);
      const m = new THREE.Mesh(blade, null);
      m.rotation.x = Math.PI;                 // blade points down when sheathed
      g.add(m);
      mount.userData.blade = m;
      break;
    }
    case 'naginata': {
      const pole = mergeGeometries([
        paint(G.cyl(0.022, 0.026, 2.1, 6).translate(0, 0.85, 0), 0x3a2a1c),
        paint(G.box(0.02, 0.5, 0.09).translate(0, 2.1, 0.02), steel),
        paint(G.box(0.03, 0.12, 0.03).translate(0, 1.86, 0), accent),
      ], false);
      const m = new THREE.Mesh(pole, null);
      m.rotation.x = -0.15;
      m.position.y = -0.85;
      g.add(m);
      mount.userData.blade = m;
      break;
    }
    case 'spear': {
      const pole = mergeGeometries([
        paint(G.cyl(0.02, 0.024, 2.4, 6).translate(0, 1.0, 0), 0x4a3a2c),
        paint(G.cone(0.05, 0.34, 5).translate(0, 2.3, 0), steel),
        paint(G.box(0.06, 0.06, 0.06).translate(0, 2.08, 0), accent),
      ], false);
      const m = new THREE.Mesh(pole, null);
      m.rotation.x = 0.1;
      m.position.y = -1.0;
      g.add(m);
      mount.userData.blade = m;
      break;
    }
    case 'bow': {
      const bow = mergeGeometries([
        paint(new THREE.TorusGeometry(0.55, 0.028, 4, 10, Math.PI * 1.1), 0x5a4432),
        paint(G.box(0.006, 1.0, 0.006).translate(0.0, 0, 0), 0xe8e0c8),
      ], false);
      const m = new THREE.Mesh(bow, null);
      m.rotation.set(0, Math.PI / 2, -0.4);
      m.position.set(0, -0.2, 0);
      g.add(m);
      mount.userData.blade = m;
      break;
    }
    case 'club': case 'kanabo': {
      const size = cfg.weapon === 'kanabo' ? 1.5 : 1.0;
      const club = mergeGeometries([
        paint(G.cyl(0.045, 0.06, size * 1.1, 6).translate(0, size * 0.45, 0), 0x4a3a2c),
      ], false);
      const m = new THREE.Mesh(club, null);
      m.position.y = -0.3;
      g.add(m);
      mount.userData.blade = m;
      break;
    }
    case 'knife': {
      const k = mergeGeometries([
        paint(G.box(0.03, 0.34, 0.01).translate(0, 0.17, 0), steel),
        paint(G.box(0.04, 0.14, 0.02).translate(0, -0.06, 0), 0x2a2018),
      ], false);
      const m = new THREE.Mesh(k, null);
      m.rotation.x = Math.PI;
      g.add(m);
      mount.userData.blade = m;
      break;
    }
    case 'kiseru': {
      const k = mergeGeometries([
        paint(G.cyl(0.014, 0.016, 0.6, 5).translate(0, 0.3, 0), 0x3a2a1c),
        paint(G.cyl(0.03, 0.03, 0.06, 6).translate(0, 0.62, 0), 0xc8a060),
      ], false);
      const m = new THREE.Mesh(k, null);
      g.add(m);
      mount.userData.blade = m;
      break;
    }
    case 'claws': {
      for (let i = 0; i < 3; i++) {
        const cl = mergeGeometries([paint(G.cone(0.022, 0.22, 4).translate(0, 0.1, 0), 0xd8d0c0)], false);
        const m = new THREE.Mesh(cl, null);
        m.position.set((i - 1) * 0.045, -0.06, 0.03);
        m.rotation.x = 0.3;
        g.add(m);
      }
      break;
    }
    default: break;
  }
  for (const child of g.children) child.castShadow = true;
  root_userDataHack(mount, g);
}

function root_userDataHack(mount, g) {
  mount.userData.group = g;
}

/** Weapon world-space tip position — used for slash trails and hit tests. */
export function weaponTip(rig, out = new THREE.Vector3()) {
  const m = rig.weaponMount.userData.blade;
  if (!m) return out.set(0, 0, 0);
  const box = m.geometry.boundingBox;
  if (box) {
    out.set(0, box.max.y, 0);
  } else out.set(0, 1, 0);
  m.localToWorld(out);
  return out;
}

/** Convert an enemy definition into a rig config. */
export function configFromEnemy(def, level = 1) {
  const a = def.appearance || {};
  return {
    height: (a.height || 1.0) * 1.75,
    build: a.build || 'lean',
    skin: a.skin ?? 0xd0a887,
    cloth: a.cloth ?? 0x2f3a4a,
    accent: a.accent ?? 0xb03a2e,
    hair: a.hair ?? 0x14110f,
    metal: 0xb8bcc4,
    eye: a.wispy ? 0xa8d8ff : 0x101014,
    head: a.head || 'human',
    horns: a.horns || null,
    tusks: !!a.tusks,
    mask: a.mask || null,
    tails: a.tails || 0,
    wings: a.wings || null,
    beak: !!a.beak,
    antlers: !!a.antlers,
    shell: !!a.shell,
    wispy: !!a.wispy,
    float: !!a.float,
    longHair: !!a.longHair,
    noose: !!a.noose,
    armor: !!a.armor,
    bald: !!a.bald,
    topknot: !!a.topknot,
    hood: !!a.hood,
    rag: !!a.rag,
    strawCape: !!a.strawCape,
    spiderLegs: !!a.spiderLegs,
    serpent: !!a.serpent,
    bundle: !!a.bundle,
    bells: !!a.bells,
    crowns: a.crowns || 0,
    giant: !!a.giant,
    weapon: a.weapon || 'none',
    aura: a.aura ?? null,
    outline: true,
    seed: (def.id || 'x').split('').reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7) + level,
  };
}

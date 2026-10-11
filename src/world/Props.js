import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeRng, lerp, clamp01 } from '../core/MathUtils.js';

/**
 * Procedural props. Every model in the world that isn't the fox is built here
 * from primitives, then merged into a single vertex-coloured geometry so a
 * whole village is one draw call per material.
 *
 * The look is deliberately low-poly + flat-shaded: hard silhouettes, strong
 * palette (vermilion, charcoal, bone, cedar green), no textures to download.
 */

const _c = new THREE.Color();

function paint(geo, color) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  _c.setHex(color);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!geo.attributes.uv) {
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  return geo;
}

function at(geo, color, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  if (sx !== 1 || sy !== 1 || sz !== 1) geo.scale(sx, sy, sz);
  if (rx) geo.rotateX(rx);
  if (ry) geo.rotateY(ry);
  if (rz) geo.rotateZ(rz);
  geo.translate(x, y, z);
  return paint(geo, color);
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 7) => new THREE.CylinderGeometry(rt, rb, h, seg);
const cone = (r, h, seg = 7) => new THREE.ConeGeometry(r, h, seg);
const sph = (r, seg = 6) => new THREE.SphereGeometry(r, seg, Math.max(3, seg >> 1));
const plane = (w, h) => new THREE.PlaneGeometry(w, h);
const torus = (r, t, seg = 8) => new THREE.TorusGeometry(r, t, 4, seg);

/**
 * Curved Japanese hip roof: concave slope with a lifted eave, optional ridge
 * beam and corner ornaments. This one function is 80% of why the buildings
 * read as Japanese rather than as boxes with pyramids on them.
 */
function roof(w, d, h, color, { overhang = 0.5, curve = 1.9, lift = 0.14, ridgeColor = null, segs = 7 } = {}) {
  const hw = w / 2 + overhang;
  const hd = d / 2 + overhang;
  const pos = [];
  const idx = [];
  const rw = w * 0.16;                        // flat ridge length along x
  const heightAt = (u, v) => {                // u,v in [-1,1] over the footprint
    const m = Math.min(1, Math.max(Math.abs(u), Math.abs(v)));
    let y = h * (1 - m ** curve);
    const edge = clamp01((m - 0.82) / 0.18);
    y += h * lift * edge * edge;              // eave flicks upward
    return y;
  };
  for (let j = 0; j <= segs; j++) {
    for (let i = 0; i <= segs; i++) {
      const u = (i / segs) * 2 - 1;
      const v = (j / segs) * 2 - 1;
      // squash the ridge into a short flat line rather than a point
      const sx = u * hw;
      const sz = v * hd;
      const m = Math.min(1, Math.max(Math.abs(u), Math.abs(v)));
      const t = clamp01((m - 0.001) / (1 - 0.001));
      const ridgeX = lerp(u * rw, u * hw, t);
      pos.push(lerp(u * rw, sx, t), heightAt(u, v), lerp(0, sz, t));
    }
  }
  for (let j = 0; j < segs; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * (segs + 1) + i, b = a + 1, c2 = a + segs + 1, d2 = c2 + 1;
      idx.push(a, c2, b, b, c2, d2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const parts = [paint(geo, color)];
  if (ridgeColor !== null) {
    parts.push(at(box(w * 0.34, 0.16, 0.28), ridgeColor, { y: h + 0.02 }));
    parts.push(at(box(0.22, 0.3, 0.3), ridgeColor, { x: -w * 0.18, y: h + 0.12 }));
    parts.push(at(box(0.22, 0.3, 0.3), ridgeColor, { x: w * 0.18, y: h + 0.12 }));
  }
  return merge(parts);
}

function merge(parts) {
  // mergeGeometries needs uniform indexing; de-index everything for safety.
  const list = [];
  for (const p of parts) {
    if (!p) continue;
    list.push(p.index ? p.toNonIndexed() : p);
  }
  const g = mergeGeometries(list, false);
  for (const p of parts) p?.dispose?.();
  return g;
}

// ─────────────────────────────────────────────────────────────── trees
function treeCone(layers, trunkH, trunkR, leafColor, trunkColor, rnd) {
  const parts = [at(cyl(trunkR * 0.75, trunkR, trunkH, 6), trunkColor, { y: trunkH / 2 })];
  let y = trunkH;
  for (let i = 0; i < layers; i++) {
    const t = i / layers;
    const r = lerp(2.6, 0.9, t) * (0.85 + rnd() * 0.3);
    const h = lerp(2.4, 1.4, t);
    parts.push(at(cone(r, h, 7), leafColor, { y: y + h * 0.45, ry: rnd() * 3 }));
    y += h * 0.52;
  }
  return merge(parts);
}

const BUILDERS = {
  cedar: (r) => treeCone(3, 5.2 + r() * 2, 0.34 + r() * 0.1, 0x2c442c, 0x4a3a2c, r),
  pine: (r) => treeCone(2, 4.4 + r() * 2.4, 0.3, 0x35502f, 0x4a3a2c, r),
  snow_pine: (r) => {
    const g = treeCone(3, 5.0, 0.32, 0x2c3a3a, 0x3a2f26, r);
    const cap = merge([
      at(cone(2.3, 1.5, 7), 0xe8f0f8, { y: 7.4 }),
      at(cone(1.8, 1.2, 7), 0xe8f0f8, { y: 6.2 }),
    ]);
    return merge([g, cap]);
  },
  sakura: (r) => {
    const parts = [at(cyl(0.24, 0.4, 3.4, 6), 0x4a3a34, { y: 1.7 })];
    for (let i = 0; i < 5; i++) {
      parts.push(at(sph(1.5 + r() * 0.7, 6), 0xf0a8b8, {
        x: (r() - 0.5) * 2.8, y: 3.6 + r() * 1.6, z: (r() - 0.5) * 2.8,
      }));
    }
    return merge(parts);
  },
  maple: (r) => {
    const parts = [at(cyl(0.22, 0.36, 3.6, 6), 0x4a3a2c, { y: 1.8 })];
    for (let i = 0; i < 4; i++) {
      parts.push(at(sph(1.4 + r() * 0.6, 6), 0xc4562a, {
        x: (r() - 0.5) * 2.4, y: 3.8 + r() * 1.4, z: (r() - 0.5) * 2.4,
      }));
    }
    return merge(parts);
  },
  bamboo: (r) => {
    const parts = [];
    const n = 3 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const h = 7 + r() * 7;
      const x = (r() - 0.5) * 2.4;
      const z = (r() - 0.5) * 2.4;
      parts.push(at(cyl(0.09, 0.12, h, 5), 0x6a9a4a, { x, y: h / 2, z, rz: (r() - 0.5) * 0.06 }));
      for (let k = 0; k < 3; k++) {
        parts.push(at(box(1.1, 0.05, 0.05), 0x8fb45a, {
          x: x + (r() - 0.5) * 0.8, y: h * (0.55 + k * 0.14), z, ry: r() * 3,
        }));
      }
    }
    return merge(parts);
  },
  dead_tree: (r) => {
    const parts = [at(cyl(0.16, 0.42, 5.4, 6), 0x3a3028, { y: 2.7 })];
    for (let i = 0; i < 4; i++) {
      const len = 1.6 + r() * 1.6;
      parts.push(at(cyl(0.05, 0.11, len, 5), 0x3a3028, {
        x: (r() - 0.5) * 1.4, y: 4 + r() * 1.4, z: (r() - 0.5) * 1.4,
        rz: (r() - 0.5) * 1.5, rx: (r() - 0.5) * 1.2,
      }));
    }
    return merge(parts);
  },
  willow: (r) => {
    const parts = [at(cyl(0.26, 0.44, 3.8, 6), 0x4a3a2c, { y: 1.9 })];
    for (let i = 0; i < 6; i++) {
      parts.push(at(box(0.16, 2.6 + r(), 0.16), 0x5a7a3a, {
        x: (r() - 0.5) * 3.2, y: 2.4, z: (r() - 0.5) * 3.2, rz: (r() - 0.5) * 0.3,
      }));
    }
    parts.push(at(sph(1.9, 6), 0x5a7a3a, { y: 4.4 }));
    return merge(parts);
  },

  // ── ground cover ─────────────────────────────────────────────────────
  grass: (r) => {
    const parts = [];
    for (let i = 0; i < 5; i++) {
      const h = 0.35 + r() * 0.5;
      parts.push(at(plane(0.34, h), 0x6f7f4a, {
        x: (r() - 0.5) * 0.7, y: h / 2, z: (r() - 0.5) * 0.7, ry: r() * 3.14,
        rz: (r() - 0.5) * 0.35,
      }));
      parts.push(at(plane(0.34, h), 0x6f7f4a, {
        x: (r() - 0.5) * 0.7, y: h / 2, z: (r() - 0.5) * 0.7, ry: r() * 3.14 + 1.57,
        rz: (r() - 0.5) * 0.35,
      }));
    }
    return merge(parts);
  },
  reed: (r) => {
    const parts = [];
    for (let i = 0; i < 7; i++) {
      const h = 1.3 + r() * 1.5;
      parts.push(at(cyl(0.02, 0.05, h, 4), 0x7a8a4a, {
        x: (r() - 0.5) * 1.2, y: h / 2, z: (r() - 0.5) * 1.2, rz: (r() - 0.5) * 0.25,
      }));
      parts.push(at(cyl(0.02, 0.06, 0.4, 4), 0x8a6a3a, {
        x: (r() - 0.5) * 1.2, y: h + 0.1, z: (r() - 0.5) * 1.2,
      }));
    }
    return merge(parts);
  },
  bush: (r) => merge([
    at(sph(0.7, 6), 0x4a6a3c, { y: 0.5, sx: 1.2 }),
    at(sph(0.5, 6), 0x4a6a3c, { x: 0.5, y: 0.4, z: 0.3 }),
    at(sph(0.45, 6), 0x4a6a3c, { x: -0.4, y: 0.35, z: -0.3 }),
  ]),
  fern: (r) => {
    const parts = [];
    for (let i = 0; i < 6; i++) {
      parts.push(at(plane(0.28, 0.9), 0x4a6a3c, {
        x: (r() - 0.5) * 0.5, y: 0.45, z: (r() - 0.5) * 0.5, ry: (i / 6) * 3.14,
      }));
    }
    return merge(parts);
  },

  // ── rocks ────────────────────────────────────────────────────────────
  rock_small: (r) => merge([
    at(sph(0.6, 5), 0x6b6b63, { y: 0.3, sx: 1.2, sy: 0.7, sz: 1.0, ry: r() * 3 }),
  ]),
  rock_medium: (r) => merge([
    at(sph(1.3, 6), 0x6b6b63, { y: 0.7, sx: 1.2, sy: 0.85, sz: 1.1, ry: r() * 3 }),
    at(sph(0.7, 5), 0x5f5f58, { x: 0.9, y: 0.4, z: -0.5, ry: r() * 3 }),
  ]),
  boulder: (r) => merge([
    at(sph(2.6, 7), 0x6b6b63, { y: 1.4, sx: 1.1, sy: 0.9, sz: 1.2, ry: r() * 3 }),
    at(sph(1.4, 6), 0x5f5f58, { x: 1.9, y: 0.8, z: 1.0, ry: r() * 3 }),
    at(sph(1.1, 6), 0x5f5f58, { x: -1.8, y: 0.6, z: -0.8, ry: r() * 3 }),
  ]),
  stone_lantern: () => merge([
    at(cyl(0.28, 0.34, 0.9, 6), 0x8a827a, { y: 0.45 }),
    at(box(0.9, 0.12, 0.9), 0x8a827a, { y: 0.95 }),
    at(box(0.62, 0.6, 0.62), 0xd8c8a0, { y: 1.3 }),
    at(box(1.0, 0.14, 1.0), 0x6a625a, { y: 1.66 }),
    at(cone(0.62, 0.34, 4), 0x6a625a, { y: 1.9, ry: Math.PI / 4 }),
  ]),

  // ── structures ───────────────────────────────────────────────────────
  torii: () => merge([
    at(cyl(0.3, 0.36, 6.4, 8), 0xc8392c, { x: -2.6, y: 3.2 }),
    at(cyl(0.3, 0.36, 6.4, 8), 0xc8392c, { x: 2.6, y: 3.2 }),
    at(box(7.4, 0.36, 0.7), 0xc8392c, { y: 6.5, rz: 0.02 }),
    at(box(8.4, 0.28, 0.5), 0xa82e24, { y: 5.9 }),
    at(box(6.4, 0.24, 0.42), 0xc8392c, { y: 5.2 }),
    at(box(0.5, 0.7, 0.6), 0xe8d8b0, { y: 5.55 }),
  ]),
  torii_small: () => merge([
    at(cyl(0.2, 0.24, 3.6, 7), 0xc8392c, { x: -1.5, y: 1.8 }),
    at(cyl(0.2, 0.24, 3.6, 7), 0xc8392c, { x: 1.5, y: 1.8 }),
    at(box(4.0, 0.24, 0.5), 0xc8392c, { y: 3.6 }),
    at(box(3.2, 0.18, 0.34), 0xc8392c, { y: 3.1 }),
  ]),
  shrine: () => {
    const parts = [
      at(box(9, 0.5, 7), 0x6a5240, { y: 0.25 }),
      at(box(8, 0.3, 6), 0x8a6a4a, { y: 0.55 }),
      at(cyl(0.28, 0.28, 3.4, 8), 0xc8392c, { x: -3.2, y: 2.2, z: 2.4 }),
      at(cyl(0.28, 0.28, 3.4, 8), 0xc8392c, { x: 3.2, y: 2.2, z: 2.4 }),
      at(cyl(0.28, 0.28, 3.4, 8), 0xc8392c, { x: -3.2, y: 2.2, z: -2.4 }),
      at(cyl(0.28, 0.28, 3.4, 8), 0xc8392c, { x: 3.2, y: 2.2, z: -2.4 }),
      at(box(7.6, 3.2, 5.6), 0xd8cbb0, { y: 5.4 }),
      at(box(7.8, 0.2, 5.8), 0x3a2f26, { y: 3.9 }),
      at(box(2.2, 2.6, 0.2), 0x2a2018, { y: 5.2, z: 2.85 }),
      at(box(6.4, 0.22, 0.5), 0xc8392c, { y: 7.1, z: 2.9 }),
    ];
    const r = roof(9.6, 7.6, 3.0, 0x3f3a34, { ridgeColor: 0x6a625a });
    r.translate(0, 7.0, 0);
    parts.push(r);
    // offering box + two fox statues
    parts.push(at(box(1.6, 0.9, 1.0), 0x5a4432, { y: 1.2, z: 4.2 }));
    parts.push(at(sph(0.4, 6), 0xe8e0d0, { x: -4.0, y: 1.2, z: 3.6 }));
    parts.push(at(sph(0.4, 6), 0xe8e0d0, { x: 4.0, y: 1.2, z: 3.6 }));
    return merge(parts);
  },
  house_small: () => {
    const parts = [
      at(box(6.4, 0.4, 5.4), 0x6a5240, { y: 0.2 }),
      at(box(6.0, 2.6, 5.0), 0xd8cbb0, { y: 1.7 }),
      at(box(6.2, 0.24, 5.2), 0x4a3a2c, { y: 3.05 }),
      at(box(1.6, 2.0, 0.16), 0x8a6a4a, { y: 1.0, z: 2.6 }),
      at(box(1.3, 1.3, 0.1), 0xe8e0c8, { x: 1.8, y: 2.0, z: 2.55 }),
      at(box(1.3, 1.3, 0.1), 0xe8e0c8, { x: -1.8, y: 2.0, z: 2.55 }),
      at(box(6.1, 0.5, 0.16), 0x2a2018, { y: 0.9, z: 2.52 }),
    ];
    const r = roof(7.2, 6.4, 2.4, 0x4a4238, { ridgeColor: 0x2f2a24 });
    r.translate(0, 3.05, 0);
    parts.push(r);
    return merge(parts);
  },
  house_large: () => {
    const parts = [
      at(box(11, 0.5, 8), 0x6a5240, { y: 0.25 }),
      at(box(10.4, 3.2, 7.4), 0xd8cbb0, { y: 2.1 }),
      at(box(10.6, 0.28, 7.6), 0x4a3a2c, { y: 3.7 }),
      at(box(2.4, 2.6, 0.2), 0x8a6a4a, { y: 1.3, z: 3.8 }),
      at(box(1.4, 1.6, 0.1), 0xe8e0c8, { x: 3.0, y: 2.2, z: 3.72 }),
      at(box(1.4, 1.6, 0.1), 0xe8e0c8, { x: -3.0, y: 2.2, z: 3.72 }),
      at(box(10.5, 0.6, 0.18), 0x2a2018, { y: 1.0, z: 3.72 }),
    ];
    const r = roof(12, 9.2, 3.0, 0x4a4238, { ridgeColor: 0x2f2a24 });
    r.translate(0, 3.7, 0);
    parts.push(r);
    parts.push(at(cyl(0.2, 0.2, 1.2, 6), 0x4a4238, { x: 4.6, y: 5.4, z: 3.2 }));
    return merge(parts);
  },
  hut: () => {
    const parts = [
      at(box(4.4, 2.0, 4.0), 0xa89070, { y: 1.0 }),
      at(box(1.4, 1.6, 0.16), 0x6a5240, { y: 0.8, z: 2.05 }),
      at(box(4.6, 0.2, 4.2), 0x6a5240, { y: 2.05 }),
    ];
    const r = roof(5.2, 4.8, 1.9, 0x8a7248, { ridgeColor: 0x5a4a30, lift: 0.05 });
    r.translate(0, 2.05, 0);
    parts.push(r);
    return merge(parts);
  },
  barn: () => {
    const parts = [
      at(box(8, 3.0, 6), 0x8a6a4a, { y: 1.5 }),
      at(box(2.6, 2.6, 0.2), 0x5a4432, { y: 1.3, z: 3.05 }),
    ];
    const r = roof(9, 7, 2.4, 0x6a5240, { ridgeColor: 0x4a3a2c, lift: 0.06 });
    r.translate(0, 3.0, 0);
    parts.push(r);
    return merge(parts);
  },
  pagoda: () => {
    const parts = [at(box(9, 1.0, 9), 0x6a625a, { y: 0.5 })];
    let y = 1.0;
    for (let i = 0; i < 5; i++) {
      const s = 8 - i * 1.1;
      parts.push(at(box(s * 0.8, 2.6, s * 0.8), 0xc8392c, { y: y + 1.3 }));
      parts.push(at(box(s * 0.86, 0.24, s * 0.86), 0x3a2f26, { y: y + 2.5 }));
      const r = roof(s * 1.15, s * 1.15, 1.5, 0x3f3a34, { ridgeColor: 0x6a625a, lift: 0.2, overhang: 0.7 });
      r.translate(0, y + 2.5, 0);
      parts.push(r);
      y += 4.0;
    }
    parts.push(at(cyl(0.14, 0.14, 4, 6), 0xd8c8a0, { y: y + 1.4 }));
    parts.push(at(torus(0.9, 0.09, 10), 0xe8c86a, { y: y + 3.0, rx: Math.PI / 2 }));
    return merge(parts);
  },
  gate: () => merge([
    at(box(1.2, 7, 1.2), 0x4a3a2c, { x: -3.4, y: 3.5 }),
    at(box(1.2, 7, 1.2), 0x4a3a2c, { x: 3.4, y: 3.5 }),
    at(box(8.4, 1.0, 1.6), 0x3f3a34, { y: 7.4 }),
    at(box(9.2, 0.4, 2.0), 0x2f2a24, { y: 8.0 }),
    at(box(5.6, 5.2, 0.3), 0x6a5240, { x: -3.0, y: 2.9 }),
    at(box(5.6, 5.2, 0.3), 0x6a5240, { x: 3.0, y: 2.9 }),
  ]),
  bridge: () => {
    const parts = [];
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const y = 3.2 - Math.sin(t * Math.PI) * 1.1;
      parts.push(at(box(2.0, 0.28, 8.0), 0x8a6a4a, { x: -9 + i * 3, y }));
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i < 8; i++) {
        const t = i / 7;
        const y = 3.2 - Math.sin(t * Math.PI) * 1.1;
        parts.push(at(box(0.2, 1.1, 0.2), 0xc8392c, { x: -10.5 + i * 3, y: y + 0.65, z: side * 3.7 }));
      }
      for (let i = 0; i < 7; i++) {
        const t = (i + 0.5) / 7;
        const y = 3.2 - Math.sin(t * Math.PI) * 1.1;
        parts.push(at(box(3.0, 0.12, 0.12), 0xc8392c, { x: -9 + i * 3, y: y + 1.1, z: side * 3.7 }));
      }
    }
    return merge(parts);
  },
  fence: (r) => {
    const parts = [];
    for (let i = 0; i < 4; i++) {
      parts.push(at(cyl(0.09, 0.11, 1.5, 5), 0x6a5240, { x: -3 + i * 2, y: 0.75 }));
    }
    parts.push(at(box(6.4, 0.12, 0.12), 0x6a5240, { y: 1.2 }));
    parts.push(at(box(6.4, 0.12, 0.12), 0x6a5240, { y: 0.6 }));
    return merge(parts);
  },
  watchtower: () => merge([
    at(cyl(0.24, 0.34, 9, 4), 0x6a5240, { x: -1.8, y: 4.5, z: -1.8, ry: Math.PI / 4 }),
    at(cyl(0.24, 0.34, 9, 4), 0x6a5240, { x: 1.8, y: 4.5, z: -1.8, ry: Math.PI / 4 }),
    at(cyl(0.24, 0.34, 9, 4), 0x6a5240, { x: -1.8, y: 4.5, z: 1.8, ry: Math.PI / 4 }),
    at(cyl(0.24, 0.34, 9, 4), 0x6a5240, { x: 1.8, y: 4.5, z: 1.8, ry: Math.PI / 4 }),
    at(box(5.2, 0.3, 5.2), 0x8a6a4a, { y: 6.0 }),
    at(box(4.6, 1.1, 4.6), 0x8a6a4a, { y: 6.7 }),
    at(box(5.4, 0.24, 5.4), 0x5a4432, { y: 7.3 }),
    roof(6.4, 6.4, 1.6, 0x4a4238, { ridgeColor: 0x2f2a24 }),
    at(box(0.9, 0.9, 0.2), 0x2a2018, { y: 9.0, z: 2.4 }),
  ]),
  dojo: () => {
    const parts = [
      at(box(14, 0.5, 10), 0x6a625a, { y: 0.25 }),
      at(box(13, 4.0, 9), 0xe0d6bc, { y: 2.4 }),
      at(box(13.4, 0.3, 9.4), 0x3a2f26, { y: 4.5 }),
      at(box(3.0, 3.0, 0.2), 0x8a6a4a, { y: 1.5, z: 4.6 }),
      at(box(12.6, 0.4, 0.3), 0xc8392c, { y: 4.2, z: 4.6 }),
    ];
    const r = roof(15.4, 11.4, 3.2, 0x3f3a34, { ridgeColor: 0x6a625a });
    r.translate(0, 4.5, 0);
    parts.push(r);
    return merge(parts);
  },
  forge: () => {
    const parts = [
      at(box(7, 0.4, 6), 0x4a4238, { y: 0.2 }),
      at(box(6.4, 2.8, 5.4), 0x7a6a5a, { y: 1.6 }),
      at(box(2.6, 1.4, 2.0), 0x3a3028, { y: 1.0, z: 1.6 }),
      at(box(2.0, 0.6, 1.4), 0xff7a2a, { y: 1.1, z: 1.9 }),
      at(cyl(0.5, 0.7, 3.4, 6), 0x5a4a3a, { x: 2.2, y: 3.4, z: -2.2 }),
    ];
    const r = roof(8, 7, 2.2, 0x3a342c, { ridgeColor: 0x2a241c });
    r.translate(0, 3.0, 0);
    parts.push(r);
    return merge(parts);
  },
  market_stall: () => {
    const parts = [
      at(cyl(0.12, 0.14, 2.6, 5), 0x6a5240, { x: -1.6, y: 1.3, z: -1.2 }),
      at(cyl(0.12, 0.14, 2.6, 5), 0x6a5240, { x: 1.6, y: 1.3, z: -1.2 }),
      at(cyl(0.12, 0.14, 2.6, 5), 0x6a5240, { x: -1.6, y: 1.3, z: 1.2 }),
      at(cyl(0.12, 0.14, 2.6, 5), 0x6a5240, { x: 1.6, y: 1.3, z: 1.2 }),
      at(box(3.8, 0.2, 3.0), 0x8a6a4a, { y: 1.0 }),
      at(box(4.0, 0.12, 3.2), 0x6a5240, { y: 2.6 }),
      at(box(0.9, 0.4, 0.9), 0xc8392c, { x: -1.0, y: 1.2 }),
      at(box(0.9, 0.4, 0.9), 0x3a5a7a, { x: 0.2, y: 1.2 }),
      at(box(0.9, 0.4, 0.9), 0x8a6a3a, { x: 1.2, y: 1.2, z: 0.6 }),
    ];
    const r = roof(4.6, 3.8, 1.0, 0xc8392c, { lift: 0.1, curve: 1.4 });
    r.translate(0, 2.6, 0);
    parts.push(r);
    return merge(parts);
  },
  pavilion: () => {
    const parts = [
      at(box(6, 0.4, 6), 0x6a625a, { y: 0.2 }),
      at(cyl(0.18, 0.2, 3.2, 6), 0xc8392c, { x: -2.4, y: 1.8, z: -2.4 }),
      at(cyl(0.18, 0.2, 3.2, 6), 0xc8392c, { x: 2.4, y: 1.8, z: -2.4 }),
      at(cyl(0.18, 0.2, 3.2, 6), 0xc8392c, { x: -2.4, y: 1.8, z: 2.4 }),
      at(cyl(0.18, 0.2, 3.2, 6), 0xc8392c, { x: 2.4, y: 1.8, z: 2.4 }),
      at(box(5.6, 0.24, 5.6), 0x8a6a4a, { y: 3.45 }),
    ];
    const r = roof(7.4, 7.4, 2.2, 0x3f3a34, { ridgeColor: 0x6a625a, lift: 0.22 });
    r.translate(0, 3.45, 0);
    parts.push(r);
    return merge(parts);
  },

  // ── graveyard ────────────────────────────────────────────────────────
  grave: (r) => merge([
    at(box(0.7, 1.0, 0.22), 0x8a827a, { y: 0.5, rz: (r() - 0.5) * 0.16 }),
    at(cyl(0.35, 0.35, 0.18, 6), 0x8a827a, { y: 1.05, rz: (r() - 0.5) * 0.16 }),
    at(box(0.9, 0.14, 0.5), 0x6a625a, { y: 0.07 }),
  ]),
  gravestone_row: (r) => {
    const parts = [];
    for (let i = 0; i < 5; i++) {
      parts.push(at(box(0.62, 0.9 + r() * 0.5, 0.2), 0x8a827a, { x: -3 + i * 1.5, y: 0.5, rz: (r() - 0.5) * 0.12 }));
    }
    return merge(parts);
  },
  ossuary: () => merge([
    at(box(6, 0.5, 6), 0x5a5248, { y: 0.25 }),
    at(box(5.4, 3.0, 5.4), 0x8a827a, { y: 1.8 }),
    at(box(1.6, 2.0, 0.2), 0x2a2018, { y: 1.0, z: 2.75 }),
    roof(7.2, 7.2, 2.0, 0x3a342c, { ridgeColor: 0x5a5248 }),
    at(box(0.9, 0.9, 0.9), 0xe8e0d0, { x: 1.4, y: 3.6, z: 1.4 }),
    at(box(0.9, 0.9, 0.9), 0xe8e0d0, { x: -1.4, y: 3.6, z: -1.2 }),
  ]),
  coffin: (r) => merge([
    at(box(2.0, 0.6, 0.9), 0x5a4432, { y: 0.3, ry: r() * 0.6 }),
  ]),

  // ── set dressing ─────────────────────────────────────────────────────
  well: () => merge([
    at(cyl(1.0, 1.1, 1.2, 10), 0x8a827a, { y: 0.6 }),
    at(cyl(0.85, 0.85, 0.2, 10), 0x2a3038, { y: 1.15 }),
    at(cyl(0.1, 0.1, 2.4, 5), 0x6a5240, { x: -0.9, y: 1.9 }),
    at(cyl(0.1, 0.1, 2.4, 5), 0x6a5240, { x: 0.9, y: 1.9 }),
    at(box(0.3, 0.3, 2.2), 0x6a5240, { y: 3.0 }),
    at(box(2.4, 0.2, 0.3), 0xc8392c, { y: 3.0 }),
    at(cyl(0.06, 0.06, 1.0, 5), 0x8a827a, { y: 2.4 }),
    at(box(0.5, 0.5, 0.5), 0x8a6a4a, { y: 1.6 }),
  ]),
  dock: () => {
    const parts = [];
    for (let i = 0; i < 5; i++) {
      parts.push(at(box(4.0, 0.2, 1.6), 0x8a6a4a, { z: -i * 2.2, y: 1.4 }));
      parts.push(at(cyl(0.14, 0.14, 2.6, 5), 0x6a5240, { x: -1.6, y: 0.1, z: -i * 2.2 }));
      parts.push(at(cyl(0.14, 0.14, 2.6, 5), 0x6a5240, { x: 1.6, y: 0.1, z: -i * 2.2 }));
    }
    return merge(parts);
  },
  boat: () => merge([
    at(box(1.6, 0.5, 4.6), 0x7a5a3a, { y: 0.3 }),
    at(box(1.3, 0.3, 4.0), 0x2a3038, { y: 0.5 }),
    at(cyl(0.06, 0.06, 2.6, 5), 0x6a5240, { y: 1.4, z: -1.0, rx: 0.3 }),
    at(box(0.1, 1.4, 1.2), 0xe8e0c8, { y: 1.6 }),
  ]),
  camp_fire: () => merge([
    at(cyl(0.9, 1.0, 0.16, 8), 0x5a5248, { y: 0.08 }),
    at(cone(0.35, 1.0, 6), 0xff7a2a, { y: 0.6 }),
    at(cone(0.22, 0.6, 6), 0xffd08a, { y: 0.7 }),
    at(cyl(0.07, 0.09, 1.2, 5), 0x4a3a2c, { x: 0.5, y: 0.3, z: 0.4, rz: 1.0 }),
    at(cyl(0.07, 0.09, 1.2, 5), 0x4a3a2c, { x: -0.4, y: 0.3, z: -0.5, rz: -0.9 }),
  ]),
  camp_tent: () => {
    const parts = [
      at(box(3.4, 0.1, 3.0), 0x6a5240, { y: 0.05 }),
      at(box(0.1, 2.2, 0.1), 0x6a5240, { x: -1.6, y: 1.1, z: 1.4 }),
      at(box(0.1, 2.2, 0.1), 0x6a5240, { x: 1.6, y: 1.1, z: 1.4 }),
      at(box(0.1, 1.2, 0.1), 0x6a5240, { x: -1.6, y: 0.6, z: -1.4 }),
      at(box(0.1, 1.2, 0.1), 0x6a5240, { x: 1.6, y: 0.6, z: -1.4 }),
    ];
    const g = new THREE.BufferGeometry();
    const pos = [
      -1.7, 0, 1.5, 1.7, 0, 1.5, 1.7, 1.2, -1.5,
      -1.7, 0, 1.5, 1.7, 1.2, -1.5, -1.7, 1.2, -1.5,
      -1.7, 0, 1.5, -1.7, 1.2, -1.5, -1.7, 0, -1.5,
      1.7, 0, 1.5, 1.7, 0, -1.5, 1.7, 1.2, -1.5,
      -1.7, 1.2, -1.5, 1.7, 1.2, -1.5, -1.7, 0, -1.5,
      -1.7, 0, -1.5, 1.7, 1.2, -1.5, 1.7, 0, -1.5,
    ];
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    parts.push(paint(g, 0x8a6a4a));
    return merge(parts);
  },
  statue_jizo: () => merge([
    at(box(1.2, 0.3, 1.2), 0x8a827a, { y: 0.15 }),
    at(cyl(0.4, 0.5, 1.4, 7), 0x9a928a, { y: 0.95 }),
    at(sph(0.34, 7), 0x9a928a, { y: 1.85 }),
    at(cyl(0.42, 0.42, 0.2, 7), 0x9a928a, { y: 2.05 }),
    at(box(0.6, 0.5, 0.2), 0xc8392c, { y: 1.2, z: 0.36 }),
    at(box(0.5, 0.1, 0.1), 0x9a928a, { x: -0.5, y: 1.3, z: 0.2, rz: -0.5 }),
    at(box(0.5, 0.1, 0.1), 0x9a928a, { x: 0.5, y: 1.3, z: 0.2, rz: 0.5 }),
  ]),
  statue_fox: () => merge([
    at(box(1.0, 0.3, 1.0), 0x8a827a, { y: 0.15 }),
    at(box(0.7, 1.2, 0.5), 0xe8e0d0, { y: 0.9 }),
    at(sph(0.32, 7), 0xe8e0d0, { y: 1.7 }),
    at(cone(0.16, 0.4, 5), 0xe8e0d0, { y: 1.95, z: -0.1 }),
    at(cone(0.16, 0.4, 5), 0xe8e0d0, { x: -0.2, y: 2.0, z: 0.02 }),
    at(cone(0.16, 0.4, 5), 0xe8e0d0, { x: 0.2, y: 2.0, z: 0.02 }),
    at(box(0.3, 0.5, 0.3), 0xc8392c, { y: 1.65, z: 0.3 }),
    at(cyl(0.06, 0.14, 1.0, 5), 0xe8e0d0, { y: 1.5, z: -0.45, rx: -0.9 }),
    at(box(0.5, 0.06, 0.4), 0xd8b060, { y: 1.05, z: 0.42 }),
  ]),
  bell: () => merge([
    at(box(0.3, 4.0, 0.3), 0x6a5240, { x: -1.4, y: 2.0 }),
    at(box(0.3, 4.0, 0.3), 0x6a5240, { x: 1.4, y: 2.0 }),
    at(box(3.2, 0.3, 0.3), 0x6a5240, { y: 4.0 }),
    at(cyl(0.9, 1.4, 2.4, 10), 0x5a5248, { y: 2.6 }),
    at(cyl(1.4, 1.4, 0.2, 10), 0x4a4238, { y: 1.5 }),
    at(cyl(0.3, 0.3, 0.5, 6), 0x4a4238, { y: 3.85 }),
    at(cyl(0.14, 0.14, 2.2, 6), 0x8a6a4a, { y: 2.4, x: 1.9, rz: Math.PI / 2 }),
  ]),
  altar: () => merge([
    at(box(3.0, 0.5, 2.2), 0x6a625a, { y: 0.25 }),
    at(box(2.4, 0.9, 1.8), 0x8a827a, { y: 0.95 }),
    at(box(2.6, 0.16, 2.0), 0x5a5248, { y: 1.45 }),
    at(sph(0.3, 6), 0xe8c86a, { y: 1.7 }),
    at(box(0.4, 0.4, 0.4), 0xf0e6d2, { x: -0.7, y: 1.7 }),
    at(box(0.4, 0.4, 0.4), 0xf0e6d2, { x: 0.7, y: 1.7 }),
  ]),
  cairn: (r) => {
    const parts = [];
    for (let i = 0; i < 6; i++) {
      const s = 1.1 - i * 0.13;
      parts.push(at(sph(s * 0.7, 6), i % 2 ? 0x7a7268 : 0x8a827a, {
        y: 0.4 + i * 0.55, x: (r() - 0.5) * 0.3, z: (r() - 0.5) * 0.3, ry: r() * 3,
      }));
    }
    return merge(parts);
  },
  signpost: () => merge([
    at(cyl(0.1, 0.12, 2.6, 5), 0x6a5240, { y: 1.3 }),
    at(box(1.6, 0.5, 0.1), 0x8a6a4a, { y: 2.3, x: 0.5, rz: 0.05 }),
    at(box(1.6, 0.5, 0.1), 0x8a6a4a, { y: 1.8, x: -0.5, rz: -0.05 }),
  ]),
  barrel: () => merge([
    at(cyl(0.42, 0.42, 1.0, 8), 0x8a6a4a, { y: 0.5 }),
    at(cyl(0.44, 0.44, 0.1, 8), 0x5a4432, { y: 0.8 }),
    at(cyl(0.44, 0.44, 0.1, 8), 0x5a4432, { y: 0.25 }),
  ]),
  crate: () => merge([
    at(box(1.0, 0.9, 1.0), 0x9a7a4a, { y: 0.45 }),
    at(box(1.04, 0.12, 1.04), 0x6a5240, { y: 0.75 }),
    at(box(1.04, 0.12, 1.04), 0x6a5240, { y: 0.2 }),
  ]),
  cart: () => merge([
    at(box(2.4, 0.3, 1.4), 0x8a6a4a, { y: 0.9 }),
    at(box(2.4, 0.6, 0.12), 0x6a5240, { y: 1.2, z: 0.7 }),
    at(box(2.4, 0.6, 0.12), 0x6a5240, { y: 1.2, z: -0.7 }),
    at(cyl(0.6, 0.6, 0.16, 10), 0x5a4432, { x: -0.8, y: 0.6, z: 0.75, rx: Math.PI / 2 }),
    at(cyl(0.6, 0.6, 0.16, 10), 0x5a4432, { x: -0.8, y: 0.6, z: -0.75, rx: Math.PI / 2 }),
    at(cyl(0.6, 0.6, 0.16, 10), 0x5a4432, { x: 0.8, y: 0.6, z: 0.75, rx: Math.PI / 2 }),
    at(cyl(0.6, 0.6, 0.16, 10), 0x5a4432, { x: 0.8, y: 0.6, z: -0.75, rx: Math.PI / 2 }),
  ]),
  banner: () => merge([
    at(cyl(0.1, 0.12, 4.4, 5), 0x4a3a2c, { y: 2.2 }),
    at(box(0.1, 3.0, 1.4), 0xc8392c, { x: 0.12, y: 2.6 }),
    at(box(0.12, 0.5, 0.5), 0xf0e6d2, { x: 0.2, y: 3.4 }),
  ]),
  lantern_paper: () => merge([
    at(cyl(0.12, 0.12, 2.6, 5), 0x4a3a2c, { y: 1.3 }),
    at(cyl(0.34, 0.34, 0.7, 8), 0xf0d890, { y: 2.3 }),
    at(cyl(0.36, 0.36, 0.08, 8), 0x2a2018, { y: 2.68 }),
    at(cyl(0.36, 0.36, 0.08, 8), 0x2a2018, { y: 1.94 }),
  ]),
  throne: () => merge([
    at(box(5, 0.6, 4), 0x3a342c, { y: 0.3 }),
    at(box(4, 0.6, 3), 0x4a4238, { y: 0.9 }),
    at(box(4, 3.4, 0.6), 0x4a4238, { y: 2.6, z: -1.4 }),
    at(cone(0.5, 1.6, 5), 0x8a2a2a, { x: -2.6, y: 3.0, z: -1.2, rz: -0.3 }),
    at(cone(0.5, 1.6, 5), 0x8a2a2a, { x: 2.6, y: 3.0, z: -1.2, rz: 0.3 }),
    at(box(1.4, 0.4, 1.2), 0xe8c86a, { y: 1.3 }),
  ]),
  arena_ring: () => {
    const parts = [];
    const N = 24;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      parts.push(at(box(0.5, 1.6, 0.5), i % 3 === 0 ? 0xc8392c : 0x6a625a, {
        x: Math.cos(a) * 13, y: 0.8, z: Math.sin(a) * 13, ry: -a,
      }));
    }
    return merge(parts);
  },
  torii_path_marker: () => merge([
    at(cyl(0.16, 0.2, 3.0, 6), 0xc8392c, { x: -1.1, y: 1.5 }),
    at(cyl(0.16, 0.2, 3.0, 6), 0xc8392c, { x: 1.1, y: 1.5 }),
    at(box(3.0, 0.2, 0.4), 0xc8392c, { y: 3.0 }),
    at(box(2.4, 0.14, 0.3), 0xc8392c, { y: 2.6 }),
  ]),
};

const cache = new Map();

/**
 * Get (and cache) the geometry for a prop id. `variant` lets callers get a
 * differently-seeded version of the random props (trees, rocks, grass).
 */
export function getProp(id, variant = 0) {
  const key = `${id}:${variant}`;
  if (cache.has(key)) return cache.get(key);
  const builder = BUILDERS[id];
  if (!builder) {
    console.warn('[props] unknown prop', id);
    return null;
  }
  const geo = builder(makeRng(1000 + variant * 7919 + id.length * 31));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  cache.set(key, geo);
  return geo;
}

export const PROP_IDS = Object.keys(BUILDERS);

export function disposeProps() {
  for (const g of cache.values()) g.dispose?.();
  cache.clear();
}

/** Variants worth cycling through so a forest isn't three identical trees. */
export const VARIANTS = {
  cedar: 4, pine: 3, sakura: 3, maple: 3, bamboo: 4, dead_tree: 3, willow: 2, snow_pine: 3,
  grass: 4, reed: 3, bush: 3, fern: 3,
  rock_small: 4, rock_medium: 4, boulder: 3, grave: 4, cairn: 3, coffin: 2,
};

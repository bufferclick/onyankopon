import * as THREE from 'three';
import { fbm2, ridged2, noise2, clamp, clamp01, smoothstep, lerp, makeRng } from '../core/MathUtils.js';
import { WORLD, REGIONS, REGION_BY_ID } from '../data/regions.js';

/**
 * Terrain: an analytic height field (no heightmaps to ship) plus a chunk
 * streaming system that builds meshes and scatters props in the background so
 * the player never waits on a frame.
 *
 * Everything that needs to know "how high is the ground here" — entities,
 * camera collision, prop scatter, AI pathing — calls `heightAt(x, z)`.
 */

export const WATER_LEVEL = 1.6;

const RIVER_POINTS = [
  [-1500, 900], [-900, 760], [-640, 560], [-520, 420], [-300, 180],
  [-140, -60], [120, -300], [420, -520], [760, -780], [1150, -1180], [1520, -1500],
];

/** Squared distance to the river centreline polyline. */
function riverDistance(x, z) {
  let best = Infinity;
  for (let i = 0; i < RIVER_POINTS.length - 1; i++) {
    const [ax, az] = RIVER_POINTS[i];
    const [bx, bz] = RIVER_POINTS[i + 1];
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    let t = len2 > 0 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0;
    t = clamp01(t);
    const px = ax + dx * t, pz = az + dz * t;
    const d = (x - px) ** 2 + (z - pz) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

// Region-specific flattening so villages and arenas are actually buildable.
const FLATS = [
  { x: -620, z: 520, r: 90, h: 12 },     // Kawa village
  { x: -140, z: -60, r: 110, h: 14 },    // Inari sanctum
  { x: 200, z: 760, r: 60, h: 16 },      // Ashigaru shrine
  { x: 940, z: 700, r: 55, h: 15 },      // Bamboo grove
  { x: 240, z: -880, r: 40, h: 30 },     // Pass hut
  { x: -700, z: -900, r: 75, h: 22 },    // Haiji temple
  { x: 1120, z: -420, r: 70, h: 46 },    // Oni forge
  { x: 640, z: -1320, r: 110, h: 20 },   // Capital
  { x: 60, z: -1020, r: 45, h: 34 },     // Snow gate
  { x: 330, z: 840, r: 35, h: 15 },      // Ronin camp
  { x: 1080, z: 720, r: 35, h: 14 },     // Spear camp
  { x: -980, z: -180, r: 30, h: 8 },     // Herb hut
];

export class Terrain {
  constructor(seed = WORLD.seed) {
    this.seed = seed;
    this._cache = new Map();
  }

  /** Raw height, in metres, before any region flattening. */
  rawHeight(x, z) {
    const s = 0.00042;
    const hills = fbm2(x * s, z * s, { octaves: 5, gain: 0.5, seed: this.seed });
    const mask = smoothstep(0.34, 0.92, fbm2(x * 0.00013 + 40, z * 0.00013 - 20, { octaves: 2, seed: this.seed + 7 }) * 0.5 + 0.5);
    const ridge = ridged2(x * 0.00075 + 12, z * 0.00075 - 8, { octaves: 4, gain: 0.52, seed: this.seed + 31 });
    let h = 5 + hills * 26 + ridge * mask * 205;

    // Volcanic bulge on Oni Ridge + a caldera bite
    const dv = Math.hypot(x - 1120, z + 420);
    if (dv < 520) {
      const t = 1 - dv / 520;
      h += smoothstep(t) * 62;
      const dc = Math.hypot(x - 1180, z + 520);
      if (dc < 130) h -= (1 - dc / 130) ** 2 * 70;
    }
    // Snow plateau shoulder
    const ds = Math.hypot(x - 180, z + 960);
    if (ds < 600) h += smoothstep(1 - ds / 600) * 55;

    // River carve
    const rd = riverDistance(x, z);
    const carve = 1 - smoothstep(clamp01(rd / 78));
    h = lerp(h, Math.min(h, WATER_LEVEL - 2.4 - (1 - carve) * 3), carve * 0.96);

    // Coast: the map edge drops into water
    const edge = Math.max(Math.abs(x), Math.abs(z)) / WORLD.half;
    if (edge > 0.86) h -= (edge - 0.86) ** 2 * 900;

    return h;
  }

  /** Height with region/POI flattening applied. */
  heightAt(x, z) {
    let h = this.rawHeight(x, z);
    for (const f of FLATS) {
      const d = Math.hypot(x - f.x, z - f.z);
      if (d > f.r) continue;
      const t = smoothstep(1 - d / f.r);
      h = lerp(h, f.h, t * 0.92);
    }
    return h;
  }

  /** Surface normal from finite differences (used for slope checks + shading). */
  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 1.2;
    const hL = this.heightAt(x - e, z);
    const hR = this.heightAt(x + e, z);
    const hD = this.heightAt(x, z - e);
    const hU = this.heightAt(x, z + e);
    return out.set(hL - hR, 2 * e, hD - hU).normalize();
  }

  /** Gradient magnitude: 0 = flat, 1 = 45°, 2 = 63°. */
  slopeAt(x, z) {
    const n = this.normalAt(x, z, _tmpN);
    return Math.hypot(n.x, n.z) / Math.max(0.001, n.y);
  }

  /** Biome weights at a point: { forest: 0.7, snow: 0.2, ... } */
  biomeAt(x, z) {
    const h = this.heightAt(x, z);
    const out = {};
    let total = 0;
    for (const r of REGIONS) {
      const d = Math.hypot(x - r.center[0], z - r.center[1]);
      const w = 1 / (1 + (d / (r.r * 0.85)) ** 4);
      if (w > 0.001) { out[r.biome] = (out[r.biome] || 0) + w; total += w; }
    }
    for (const k of Object.keys(out)) out[k] /= total;
    // altitude overrides
    if (h > 118) out.snow = Math.max(out.snow || 0, clamp01((h - 118) / 40));
    if (h > 100) out.volcanic = ((out.volcanic || 0) + clamp01((h - 100) / 60)) / 2;
    if (h < WATER_LEVEL + 0.6) out.water = 1;
    return out;
  }

  /** Dominant biome id. */
  biomeIdAt(x, z) {
    const b = this.biomeAt(x, z);
    let best = 'fields', bw = -1;
    for (const [k, v] of Object.entries(b)) if (v > bw) { bw = v; best = k; }
    return best;
  }

  /** Blended ground colour for a point (used for terrain vertex colours). */
  colorAt(x, z, out = new THREE.Color()) {
    const h = this.heightAt(x, z);
    const slope = this.slopeAt(x, z);
    const b = this.biomeAt(x, z);
    let r = 0, g = 0, bl = 0, w = 0;
    for (const [biome, weight] of Object.entries(b)) {
      const region = REGIONS.find((rr) => rr.biome === biome);
      if (!region) continue;
      const p = region.palette;
      let c = p.grass;
      if (slope > 0.42) c = p.rock;
      else if (h < WATER_LEVEL + 1.2) c = p.dirt;
      const col = _tmpC.setHex(c);
      r += col.r * weight; g += col.g * weight; bl += col.b * weight; w += weight;
    }
    if (w > 0) out.setRGB(r / w, g / w, bl / w);
    // altitude: rock then snow
    if (h > 96) {
      const t = clamp01((h - 96) / 34);
      out.lerp(_tmpC.setHex(0x6a6a66), t * 0.75);
    }
    if (h > 128) {
      const t = clamp01((h - 128) / 30);
      out.lerp(_tmpC.setHex(0xe8f0f8), t * 0.9);
    }
    // variation so large flats never look like a solid fill
    const n = noise2(x * 0.06, z * 0.06, this.seed) * 0.5 + noise2(x * 0.21, z * 0.21, this.seed + 3) * 0.5;
    out.offsetHSL(0, n * 0.04, n * 0.045);
    return out;
  }

  /** True when the point is on open, buildable-ish ground. */
  isFlatEnough(x, z, maxSlope = 0.55) {
    return this.slopeAt(x, z) < maxSlope;
  }

  /** Find a nearby spot that satisfies a predicate (used for spawns/POIs). */
  findSpot(x, z, predicate, { min = 0, max = 40, step = 3, rng = Math.random } = {}) {
    for (let r = min; r <= max; r += step) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + rng() * 0.5;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        if (predicate(px, pz, this.heightAt(px, pz))) return { x: px, z: pz, y: this.heightAt(px, pz) };
      }
    }
    return { x, z, y: this.heightAt(x, z) };
  }

  /** Sea/river surface test. */
  isWater(x, z) {
    return this.heightAt(x, z) < WATER_LEVEL;
  }
}

const _tmpN = new THREE.Vector3();
const _tmpC = new THREE.Color();

// ────────────────────────────────────────────────────────── chunk streaming

export const CHUNK_SIZE = 80;

/**
 * One 80 m × 80 m tile: a terrain mesh plus instanced scatter for trees,
 * rocks, grass and bushes. Built in stages so a full ring of chunks never
 * blocks a frame.
 */
export class Chunk {
  constructor(cx, cz, terrain, opts = {}) {
    this.cx = cx; this.cz = cz;
    this.terrain = terrain;
    this.x = cx * CHUNK_SIZE;
    this.z = cz * CHUNK_SIZE;
    this.lod = opts.lod ?? 0;
    this.group = new THREE.Group();
    this.group.position.set(this.x, 0, this.z);
    this.group.matrixAutoUpdate = false;
    this.group.updateMatrix();
    this.built = false;
    this.disposed = false;
    this.objects = [];
    this.key = `${cx},${cz}`;
  }

  /** Deterministic per-chunk RNG so the world is identical every run. */
  rng() {
    return makeRng((this.cx * 73856093) ^ (this.cz * 19349663) ^ this.terrain.seed);
  }

  buildTerrain(material, res = 20) {
    const { terrain } = this;
    const size = CHUNK_SIZE;
    const verts = res + 1;
    const positions = new Float32Array(verts * verts * 3);
    const colors = new Float32Array(verts * verts * 3);
    const uvs = new Float32Array(verts * verts * 2);
    const col = new THREE.Color();
    let p = 0, c = 0, u = 0;
    for (let j = 0; j < verts; j++) {
      for (let i = 0; i < verts; i++) {
        const lx = (i / res) * size;
        const lz = (j / res) * size;
        const wx = this.x + lx;
        const wz = this.z + lz;
        const h = terrain.heightAt(wx, wz);
        positions[p++] = lx;
        positions[p++] = Math.max(h, WATER_LEVEL - 6);
        positions[p++] = lz;
        terrain.colorAt(wx, wz, col);
        colors[c++] = col.r; colors[c++] = col.g; colors[c++] = col.b;
        uvs[u++] = wx * 0.02; uvs[u++] = wz * 0.02;
      }
    }
    const indices = [];
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const a = j * verts + i;
        const b = a + 1;
        const d = a + verts;
        const e = d + 1;
        indices.push(a, d, b, b, d, e);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = this.lod === 0;
    mesh.castShadow = false;
    mesh.frustumCulled = true;
    mesh.userData.chunk = this;
    this.group.add(mesh);
    this.objects.push(mesh);
    this.terrainMesh = mesh;
    return mesh;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const o of this.objects) {
      o.geometry?.dispose?.();
      if (o.isInstancedMesh) o.dispose?.();
    }
    this.objects.length = 0;
    this.group.clear();
  }
}

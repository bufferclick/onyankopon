import * as THREE from 'three';
import { Terrain, Chunk, CHUNK_SIZE, WATER_LEVEL } from './Terrain.js';
import { getProp, VARIANTS } from './Props.js';
import { makeVertexMaterial, makeWaterMaterial, updateWind } from './materials.js';
import { makeRng, clamp, clamp01, lerp, smoothstep } from '../core/MathUtils.js';
import { WORLD, REGIONS, REGION_BY_ID, POIS, POI_BY_ID } from '../data/regions.js';

/**
 * World: chunk streaming, biome scatter, hand-placed landmarks, water and a
 * coarse collision grid.
 *
 * Chunks build incrementally (a budget per frame) so streaming never causes a
 * hitch; the loading screen drives a bigger budget while the world warms up.
 */

// Per-biome scatter rules. Densities are instances per square metre.
const SCATTER = {
  fields: {
    trees: [['cedar', 3], ['sakura', 2], ['maple', 1], ['pine', 1]], tree: 0.0016,
    grass: 0.020, bush: 0.0016, rock: 0.0005, reed: 0.0, fern: 0.002,
  },
  forest: {
    trees: [['cedar', 4], ['pine', 3], ['dead_tree', 1]], tree: 0.0042,
    grass: 0.012, bush: 0.003, rock: 0.0009, reed: 0.0, fern: 0.006,
  },
  bamboo: {
    trees: [['bamboo', 6], ['cedar', 1]], tree: 0.0040,
    grass: 0.008, bush: 0.001, rock: 0.0004, reed: 0.0, fern: 0.002,
  },
  swamp: {
    trees: [['willow', 3], ['dead_tree', 2]], tree: 0.0016,
    grass: 0.006, bush: 0.001, rock: 0.0003, reed: 0.014, fern: 0.0,
  },
  snow: {
    trees: [['snow_pine', 5], ['dead_tree', 2]], tree: 0.0022,
    grass: 0.0, bush: 0.0, rock: 0.0012, reed: 0.0, fern: 0.0,
  },
  graveyard: {
    trees: [['dead_tree', 5], ['pine', 1]], tree: 0.0024,
    grass: 0.006, bush: 0.0006, rock: 0.0006, reed: 0.0, fern: 0.001,
  },
  volcanic: {
    trees: [['dead_tree', 4]], tree: 0.0014,
    grass: 0.0, bush: 0.0, rock: 0.0022, reed: 0.0, fern: 0.0,
  },
  shrine: {
    trees: [['cedar', 3], ['sakura', 2], ['maple', 2]], tree: 0.0018,
    grass: 0.018, bush: 0.002, rock: 0.0004, reed: 0.0, fern: 0.002,
  },
  city: {
    trees: [['pine', 2], ['dead_tree', 1]], tree: 0.0008,
    grass: 0.004, bush: 0.0004, rock: 0.0003, reed: 0.0, fern: 0.0,
  },
};

const TIER_RADIUS = [1, 3, 5];        // chunk rings per LOD tier
const TIER_RES = [24, 12, 6];

export class World {
  constructor(scene, { seed = WORLD.seed, quality = {} } = {}) {
    this.scene = scene;
    this.terrain = new Terrain(seed);
    this.quality = quality;
    this.rng = makeRng(seed ^ 0x9e3779b9);

    this.terrainMaterial = makeVertexMaterial({ wind: 0 });
    this.foliageMaterial = makeVertexMaterial({ wind: 1 });
    this.propMaterial = makeVertexMaterial({ wind: 0 });

    this.chunkGroup = new THREE.Group();
    this.chunkGroup.name = 'chunks';
    scene.add(this.chunkGroup);

    this.poiGroup = new THREE.Group();
    this.poiGroup.name = 'pois';
    scene.add(this.poiGroup);

    this.chunks = new Map();
    this.pois = new Map();
    this.builtPois = new Set();
    this.colliders = new Map();     // cell key -> [{x,z,r}]
    this.pending = [];
    this.time = 0;
    this.lastChunk = { cx: 1e9, cz: 1e9 };
    this.stats = { chunks: 0, instances: 0, built: 0 };

    this.#buildWater();
  }

  // ───────────────────────────────────────────────────────────────── water
  #buildWater() {
    const geo = new THREE.PlaneGeometry(2600, 2600, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.waterMaterial = makeWaterMaterial(0x2e5a66, 0x10262e);
    this.water = new THREE.Mesh(geo, this.waterMaterial);
    this.water.position.y = WATER_LEVEL;
    this.water.renderOrder = 2;
    this.water.frustumCulled = false;
    this.scene.add(this.water);
  }

  setFogColor(color) {
    this.waterMaterial.uniforms.fogColor.value.copy(color);
  }

  // ─────────────────────────────────────────────────────────────── chunking
  #key(cx, cz) { return `${cx},${cz}`; }

  #ensureChunk(cx, cz, tier) {
    const key = this.#key(cx, cz);
    let chunk = this.chunks.get(key);
    if (chunk) {
      if (chunk.tier !== tier) this.pending.push({ cx, cz, tier, rebuild: true });
      return chunk;
    }
    chunk = new Chunk(cx, cz, this.terrain, { lod: tier });
    chunk.tier = tier;
    this.chunks.set(key, chunk);
    this.pending.push({ cx, cz, tier });
    return chunk;
  }

  /** Build a fixed number of queued chunks. Returns how many were built. */
  buildBudget(budget = 2) {
    let n = 0;
    while (this.pending.length && n < budget) {
      // nearest first so the world fills in around the player
      let bi = 0, bd = Infinity;
      for (let i = 0; i < this.pending.length; i++) {
        const p = this.pending[i];
        const d = (p.cx - this.lastChunk.cx) ** 2 + (p.cz - this.lastChunk.cz) ** 2;
        if (d < bd) { bd = d; bi = i; }
      }
      const job = this.pending.splice(bi, 1)[0];
      this.#buildChunk(job);
      n++;
    }
    return n;
  }

  #buildChunk({ cx, cz, tier, rebuild }) {
    const chunk = this.chunks.get(this.#key(cx, cz));
    if (!chunk || chunk.disposed) return;
    if (rebuild || chunk.built) {
      chunk.dispose();
      this.chunks.delete(this.#key(cx, cz));
      const fresh = new Chunk(cx, cz, this.terrain, { lod: tier });
      fresh.tier = tier;
      this.chunks.set(this.#key(cx, cz), fresh);
      return this.#buildChunk({ cx, cz, tier });
    }
    chunk.buildTerrain(this.terrainMaterial, TIER_RES[tier]);
    chunk.terrainMesh.castShadow = false;
    chunk.terrainMesh.receiveShadow = tier === 0;
    if (tier <= 1) this.#scatter(chunk, tier);
    chunk.built = true;
    chunk.group.updateMatrixWorld(true);
    this.chunkGroup.add(chunk.group);
    this.stats.built++;
  }

  #scatter(chunk, tier) {
    const { terrain } = this;
    const rng = chunk.rng();
    const size = CHUNK_SIZE;
    const biome = terrain.biomeIdAt(chunk.x + size / 2, chunk.z + size / 2);
    const rules = SCATTER[biome] || SCATTER.fields;
    const foliageDensity = (this.quality.foliage ?? 1);
    const area = size * size;

    const place = (propId, count, { minSlope = 0, maxSlope = 0.65, scale = [0.8, 1.3], snapWater = false, collider = 0 } = {}) => {
      if (count <= 0) return;
      const variants = VARIANTS[propId] || 1;
      const buckets = new Map();
      let placed = 0;
      let attempts = count * 8;
      while (placed < count && attempts-- > 0) {
        const x = chunk.x + rng() * size;
        const z = chunk.z + rng() * size;
        const h = terrain.heightAt(x, z);
        if (!snapWater && h < WATER_LEVEL + 0.25) continue;
        const slope = terrain.slopeAt(x, z);
        if (slope < minSlope || slope > maxSlope) continue;
        if (h > 150) continue;
        const v = Math.floor(rng() * variants);
        const s = lerp(scale[0], scale[1], rng());
        if (!buckets.has(v)) buckets.set(v, []);
        buckets.get(v).push({ x: x - chunk.x, y: h - 0.05, z: z - chunk.z, s, ry: rng() * Math.PI * 2 });
        placed++;
        if (collider) this.#addCollider(x, z, collider * s);
      }
      for (const [v, list] of buckets) {
        const geo = getProp(propId, v);
        if (!geo || !list.length) continue;
        const windy = propId === 'grass' || propId === 'reed' || propId === 'fern';
        const mat = windy ? this.foliageMaterial : (propId.includes('rock') || propId === 'boulder') ? this.propMaterial : this.foliageMaterial;
        const inst = new THREE.InstancedMesh(geo, mat, list.length);
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const pos = new THREE.Vector3();
        const scl = new THREE.Vector3();
        for (let i = 0; i < list.length; i++) {
          const it = list[i];
          q.setFromAxisAngle(_up, it.ry);
          pos.set(it.x, it.y, it.z);
          scl.set(it.s, it.s * (0.9 + (i % 5) * 0.04), it.s);
          m.compose(pos, q, scl);
          inst.setMatrixAt(i, m);
        }
        inst.instanceMatrix.needsUpdate = true;
        inst.castShadow = tier === 0 && !windy && list.length < 40;
        inst.receiveShadow = tier === 0;
        inst.frustumCulled = true;
        inst.computeBoundingSphere?.();
        chunk.group.add(inst);
        chunk.objects.push(inst);
        this.stats.instances += list.length;
      }
    };

    // weighted tree species
    const treeCount = Math.round(area * rules.tree * foliageDensity * (tier === 0 ? 1 : 0.85));
    for (const [species, weight] of rules.trees) {
      const share = weight / rules.trees.reduce((a, [, w]) => a + w, 0);
      place(species, Math.round(treeCount * share), { maxSlope: 0.7, scale: [0.75, 1.5], collider: 0.55 });
    }
    if (tier === 0) {
      place('grass', Math.round(area * rules.grass * foliageDensity), { maxSlope: 0.5, scale: [0.7, 1.4] });
      place('bush', Math.round(area * rules.bush * foliageDensity), { maxSlope: 0.6, scale: [0.7, 1.3] });
      place('fern', Math.round(area * rules.fern * foliageDensity), { maxSlope: 0.6, scale: [0.7, 1.2] });
    }
    if (rules.reed > 0) place('reed', Math.round(area * rules.reed * foliageDensity), { maxSlope: 0.4, scale: [0.7, 1.3], snapWater: false });
    place('rock_small', Math.round(area * rules.rock * foliageDensity * 2), { maxSlope: 0.9, scale: [0.6, 1.4] });
    place('rock_medium', Math.round(area * rules.rock * foliageDensity), { maxSlope: 0.9, scale: [0.7, 1.3], collider: 0.8 });
    place('boulder', Math.round(area * rules.rock * foliageDensity * 0.25), { maxSlope: 0.8, scale: [0.7, 1.2], collider: 1.8 });
  }

  #addCollider(x, z, r) {
    const key = `${Math.floor(x / 16)},${Math.floor(z / 16)}`;
    if (!this.colliders.has(key)) this.colliders.set(key, []);
    this.colliders.get(key).push({ x, z, r });
  }

  // ─────────────────────────────────────────────────────────────────── POIS
  /** Place every landmark. Cheap enough to do at world creation. */
  buildAllPois() {
    for (const poi of POIS) this.buildPoi(poi.id);
  }

  buildPoi(id) {
    const poi = POI_BY_ID[id];
    if (!poi || this.builtPois.has(id)) return null;
    this.builtPois.add(id);
    const group = new THREE.Group();
    group.name = `poi:${id}`;
    const rng = makeRng(hashStr(id));
    const tx = poi.pos[0], tz = poi.pos[1];

    const put = (propId, { x = 0, y = null, z = 0, ry = 0, s = 1, variant = 0, collider = 0, shadow = true, emissive = false } = {}) => {
      const geo = getProp(propId, variant);
      if (!geo) return null;
      const mesh = new THREE.Mesh(geo, this.propMaterial);
      const h = y === null ? this.terrain.heightAt(tx + x, tz + z) : y;
      mesh.position.set(x, h - 0.08, z);
      mesh.rotation.y = ry;
      mesh.scale.setScalar(s);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      mesh.userData.poi = id;
      if (emissive) mesh.userData.emissive = true;
      group.add(mesh);
      if (collider) this.#addCollider(tx + x, tz + z, collider * s);
      return mesh;
    };

    const ring = (propId, n, radius, opts = {}) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (opts.offset || 0);
        put(propId, { x: Math.cos(a) * radius, z: Math.sin(a) * radius, ry: -a + (opts.faceIn ? Math.PI : 0), ...opts });
      }
    };

    switch (poi.t) {
      case 'village': {
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2 + 0.4;
          const r = 26 + rng() * 30;
          put(i % 3 === 0 ? 'house_large' : 'house_small', {
            x: Math.cos(a) * r, z: Math.sin(a) * r, ry: -a + Math.PI / 2 + (rng() - 0.5) * 0.4,
            s: 0.9 + rng() * 0.35, collider: 3.4,
          });
        }
        put('well', { x: 0, z: 6, collider: 1.2 });
        put('shrine', { x: -34, z: -26, ry: 0.6, s: 0.9, collider: 4.5 });
        put('torii', { x: -26, z: -12, ry: 0.6, s: 1.0 });
        for (let i = 0; i < 4; i++) put('market_stall', { x: 8 + i * 9, z: -20, ry: -0.3, s: 0.9, collider: 2 });
        for (let i = 0; i < 3; i++) put('cart', { x: -12 + i * 12, z: 18, ry: rng() * 3, collider: 1.6 });
        for (let i = 0; i < 5; i++) put('barrel', { x: (rng() - 0.5) * 40, z: (rng() - 0.5) * 40, collider: 0.5 });
        for (let i = 0; i < 4; i++) put('crate', { x: (rng() - 0.5) * 40, z: (rng() - 0.5) * 40, collider: 0.6 });
        put('camp_fire', { x: 4, z: 10, emissive: true });
        for (let i = 0; i < 4; i++) put('lantern_paper', { x: -20 + i * 13, z: 2, emissive: true });
        for (let i = 0; i < 6; i++) put('fence', { x: -44 + i * 6, z: 40, ry: 0.1, s: 1.0 });
        break;
      }
      case 'shrine': {
        put('shrine', { x: 0, z: 0, s: 1.1, collider: 5 });
        put('torii', { x: 0, z: 16, s: 1.15 });
        ring('stone_lantern', 8, 13, { faceIn: true });
        put('statue_fox', { x: -7.5, z: 9, ry: 0.3, s: 1.2 });
        put('statue_fox', { x: 7.5, z: 9, ry: -0.3, s: 1.2 });
        for (let i = 0; i < 14; i++) {
          put('torii_small', { x: 0, z: 20 + i * 7, s: 0.9 + rng() * 0.2 });
        }
        break;
      }
      case 'torii_path': {
        for (let i = 0; i < 22; i++) {
          put('torii_small', { x: Math.sin(i * 0.4) * 3, z: i * 6.5, s: 0.95 });
        }
        break;
      }
      case 'torii': {
        put('torii', { s: 1.2 });
        put('stone_lantern', { x: -5, z: 2 });
        put('stone_lantern', { x: 5, z: 2 });
        break;
      }
      case 'camp': {
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          put('camp_tent', { x: Math.cos(a) * 9, z: Math.sin(a) * 9, ry: -a, s: 1.1, collider: 2 });
        }
        put('camp_fire', { x: 0, z: 0, emissive: true });
        for (let i = 0; i < 5; i++) put('crate', { x: (rng() - 0.5) * 18, z: (rng() - 0.5) * 18, collider: 0.6 });
        put('cart', { x: 10, z: -6, ry: 0.7, collider: 1.6 });
        ring('banner', 3, 12, {});
        break;
      }
      case 'bridge': {
        // Align across the river: pick the direction with the lowest ground.
        let bestA = 0, bestH = Infinity;
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          const h = Math.min(
            this.terrain.heightAt(tx + Math.cos(a) * 22, tz + Math.sin(a) * 22),
            this.terrain.heightAt(tx - Math.cos(a) * 22, tz - Math.sin(a) * 22)
          );
          if (h < bestH) { bestH = h; bestA = a; }
        }
        const mesh = put('bridge', { ry: -bestA, s: 1.0 });
        if (mesh) mesh.position.y = Math.max(bestH, WATER_LEVEL) + 1.4;
        break;
      }
      case 'arena': {
        put('arena_ring', { s: 1.0 });
        ring('banner', 8, 15, { faceIn: true });
        put('camp_fire', { x: 0, z: 0, emissive: true });
        break;
      }
      case 'temple': {
        put('house_large', { s: 1.6, collider: 6 });
        put('torii', { z: 18, s: 1.2 });
        ring('stone_lantern', 6, 14, { faceIn: true });
        for (let i = 0; i < 10; i++) put('grave', { x: (rng() - 0.5) * 40, z: (rng() - 0.5) * 40, variant: i % 4 });
        break;
      }
      case 'ossuary': {
        put('ossuary', { s: 1.2, collider: 4 });
        ring('grave', 10, 12, { variant: 1, offset: 0.2 });
        for (let i = 0; i < 6; i++) put('coffin', { x: (rng() - 0.5) * 26, z: (rng() - 0.5) * 26, ry: rng() * 3, variant: i % 2 });
        break;
      }
      case 'bell': {
        put('bell', { s: 1.0, collider: 2 });
        put('torii_small', { z: 6, s: 0.9 });
        break;
      }
      case 'pagoda': {
        put('pagoda', { s: 1.15, collider: 5 });
        ring('stone_lantern', 6, 11, { faceIn: true });
        break;
      }
      case 'gate': {
        put('gate', { s: 1.1, collider: 3 });
        ring('banner', 4, 9, {});
        break;
      }
      case 'market': {
        for (let i = 0; i < 8; i++) {
          put('market_stall', { x: -16 + (i % 4) * 11, z: -8 + Math.floor(i / 4) * 12, ry: (rng() - 0.5) * 0.3, collider: 2 });
        }
        for (let i = 0; i < 6; i++) put('crate', { x: (rng() - 0.5) * 30, z: (rng() - 0.5) * 20, collider: 0.6 });
        for (let i = 0; i < 4; i++) put('lantern_paper', { x: -14 + i * 9, z: 8, emissive: true });
        break;
      }
      case 'dojo': {
        put('dojo', { s: 1.0, collider: 6 });
        put('torii_small', { z: 10, s: 1.0 });
        ring('banner', 4, 10, { faceIn: true });
        break;
      }
      case 'forge': {
        put('forge', { s: 1.1, collider: 4 });
        for (let i = 0; i < 5; i++) put('crate', { x: -8 + i * 4, z: 6, collider: 0.6 });
        put('camp_fire', { x: 6, z: -5, s: 1.3, emissive: true });
        break;
      }
      case 'hut': {
        put('hut', { s: 1.1, collider: 2.5 });
        put('camp_fire', { x: 5, z: 4, emissive: true });
        put('barrel', { x: -4, z: 3, collider: 0.5 });
        break;
      }
      case 'dock': {
        put('dock', { ry: poi.rot ?? 0 });
        put('boat', { x: 6, z: -6, ry: 0.8 });
        for (let i = 0; i < 3; i++) put('crate', { x: -4 + i * 4, z: 3, collider: 0.6 });
        break;
      }
      case 'well': {
        put('well', { collider: 1.2 });
        put('stone_lantern', { x: 3, z: 2 });
        break;
      }
      case 'fields': {
        for (let i = 0; i < 10; i++) {
          for (let j = 0; j < 6; j++) {
            put('fence', { x: -30 + i * 6.5, z: -16 + j * 6.5, s: 1.0 });
          }
        }
        break;
      }
      case 'grove': {
        ring('stone_lantern', 4, 10, { faceIn: true });
        put('altar', { s: 1.0, collider: 1.5 });
        break;
      }
      case 'pavilion': {
        put('pavilion', { s: 1.1, collider: 3.5 });
        ring('stone_lantern', 4, 8, { faceIn: true });
        break;
      }
      case 'tower': case 'watchtower': {
        put('watchtower', { s: 1.0, collider: 2.5 });
        break;
      }
      case 'altar': {
        put('altar', { s: 1.3, collider: 2 });
        ring('stone_lantern', 5, 7, { faceIn: true });
        break;
      }
      case 'statue': {
        put('statue_jizo', { s: 1.4, collider: 1 });
        ring('stone_lantern', 4, 5, { faceIn: true });
        break;
      }
      case 'peak': {
        put('throne', { s: 1.3, collider: 3 });
        ring('banner', 6, 12, { faceIn: true });
        put('camp_fire', { x: -8, z: 8, s: 1.5, emissive: true });
        break;
      }
      case 'pool': {
        ring('stone_lantern', 6, 9, { faceIn: true });
        put('statue_fox', { z: 7, s: 1.1 });
        break;
      }
      case 'cave': {
        put('torii_small', { s: 0.8 });
        for (let i = 0; i < 6; i++) {
          put('boulder', { x: (rng() - 0.5) * 16, z: (rng() - 0.5) * 16, s: 0.8 + rng() * 0.6, variant: i % 3, collider: 1.8 });
        }
        break;
      }
      case 'cairn': {
        for (let i = 0; i < 7; i++) put('cairn', { x: (rng() - 0.5) * 16, z: (rng() - 0.5) * 16, variant: i % 3, collider: 0.9 });
        break;
      }
      case 'crossroads': {
        put('signpost', { s: 1.2 });
        for (let i = 0; i < 4; i++) put('torii_small', { x: Math.cos(i * 1.57) * 12, z: Math.sin(i * 1.57) * 12, ry: -i * 1.57, s: 0.8 });
        break;
      }
      case 'mark': {
        put('signpost', { s: 1.0 });
        put('cairn', { x: 3, z: 2, variant: 1 });
        break;
      }
      default: {
        put('torii_small');
        break;
      }
    }

    group.position.set(tx, 0, tz);
    this.poiGroup.add(group);
    this.pois.set(id, group);
    return group;
  }

  // ───────────────────────────────────────────────────────────────── update
  update(dt, playerPos, viewDistance = 280) {
    this.time += dt;
    updateWind(this.time, 1.0);
    this.waterMaterial.uniforms.uTime.value = this.time;
    this.water.position.x = Math.round(playerPos.x / 40) * 40;
    this.water.position.z = Math.round(playerPos.z / 40) * 40;

    const cx = Math.floor(playerPos.x / CHUNK_SIZE);
    const cz = Math.floor(playerPos.z / CHUNK_SIZE);
    const maxRing = Math.min(TIER_RADIUS[2], Math.ceil(viewDistance / CHUNK_SIZE));

    if (cx !== this.lastChunk.cx || cz !== this.lastChunk.cz) {
      this.lastChunk = { cx, cz };
      this.pending.length = 0;
      for (let dz = -maxRing; dz <= maxRing; dz++) {
        for (let dx = -maxRing; dx <= maxRing; dx++) {
          const d = Math.max(Math.abs(dx), Math.abs(dz));
          const tier = d <= TIER_RADIUS[0] ? 0 : d <= TIER_RADIUS[1] ? 1 : 2;
          if (d > maxRing) continue;
          this.#ensureChunk(cx + dx, cz + dz, tier);
        }
      }
      // unload far chunks
      for (const [key, chunk] of [...this.chunks]) {
        const d = Math.max(Math.abs(chunk.cx - cx), Math.abs(chunk.cz - cz));
        if (d > maxRing + 1) {
          chunk.dispose();
          this.chunkGroup.remove(chunk.group);
          this.chunks.delete(key);
          this.stats.chunks--;
        }
      }
    }

    this.buildBudget(this.buildPerFrame ?? 2);
    this.stats.chunks = this.chunks.size;
  }

  /** Warm the world around a point (used by the loading screen). */
  warmup(pos, chunks = 49) {
    this.lastChunk = { cx: Math.floor(pos.x / CHUNK_SIZE), cz: Math.floor(pos.z / CHUNK_SIZE) };
    const cx = this.lastChunk.cx, cz = this.lastChunk.cz;
    for (let dz = -3; dz <= 3; dz++) {
      for (let dx = -3; dx <= 3; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dz));
        this.#ensureChunk(cx + dx, cz + dz, d <= 1 ? 0 : d <= 3 ? 1 : 2);
      }
    }
    this.buildAllPois();
    const built = this.buildBudget(chunks);
    return built;
  }

  // ────────────────────────────────────────────────────────────── collision
  /** Push a circle out of every nearby collider. Returns corrected position. */
  resolveCollisions(pos, radius, out = new THREE.Vector3()) {
    out.copy(pos);
    const gx = Math.floor(pos.x / 16);
    const gz = Math.floor(pos.z / 16);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const list = this.colliders.get(`${gx + dx},${gz + dz}`);
        if (!list) continue;
        for (const c of list) {
          const ddx = out.x - c.x;
          const ddz = out.z - c.z;
          const min = c.r + radius;
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 >= min * min || d2 === 0) continue;
          const d = Math.sqrt(d2) || 0.001;
          const push = (min - d);
          out.x += (ddx / d) * push;
          out.z += (ddz / d) * push;
        }
      }
    }
    return out;
  }

  heightAt(x, z) { return this.terrain.heightAt(x, z); }

  /** Ground height + a small epsilon for entity placement. */
  groundAt(x, z) { return this.terrain.heightAt(x, z); }

  dispose() {
    for (const chunk of this.chunks.values()) chunk.dispose();
    this.chunks.clear();
    this.chunkGroup.clear();
    this.poiGroup.clear();
    this.water.geometry.dispose();
    this.scene.remove(this.water);
  }
}

const _up = new THREE.Vector3(0, 1, 0);

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

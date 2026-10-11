import * as THREE from 'three';
import { ENEMY_BY_ID } from '../data/enemies.js';
import { REGIONS, POI_BY_ID } from '../data/regions.js';
import { Enemy } from '../entities/Enemy.js';
import { clamp, clamp01, lerp, makeRng } from '../core/MathUtils.js';

/**
 * Population. Enemies are spawned in an annulus around the player (never on
 * screen), capped by the quality setting, and recycled as they die so the
 * province always feels inhabited without ever melting the frame rate.
 */
const MIN_DIST = 55;
const MAX_DIST = 165;

export class Spawner {
  constructor({ world, combat, game }) {
    this.world = world;
    this.combat = combat;
    this.game = game;
    this.enemies = [];
    this.rng = makeRng(0x5eed1);
    this.timer = 0;
    this.cap = game?.settings.get('video', 'maxEnemies') ?? 18;
    this.spawnedPoiBosses = new Set();
    this.totalSpawned = 0;
    this._v = new THREE.Vector3();
  }

  setCap(n) { this.cap = clamp(n, 4, 40); }

  /** Which region (if any) contains this point. */
  regionAt(x, z) {
    let best = null, bestScore = -1;
    for (const r of REGIONS) {
      const d = Math.hypot(x - r.center[0], z - r.center[1]);
      const score = 1 - d / (r.r * 1.6);
      if (score > bestScore) { bestScore = score; best = r; }
    }
    return bestScore > 0 ? best : null;
  }

  /** Pick an enemy id from a region table, weighted, scaled to the player. */
  #pick(region, playerLevel) {
    const table = region?.enemies || [['bandit', 1]];
    const pool = [];
    let total = 0;
    for (const [id, w] of table) {
      const def = ENEMY_BY_ID[id];
      if (!def) continue;
      if (def.boss) continue;
      // favour enemies near the player's level
      const mid = ((def.level?.[0] ?? 1) + (def.level?.[1] ?? 60)) / 2;
      const fit = clamp(1.4 - Math.abs(mid - playerLevel) / 26, 0.12, 1.6);
      const weight = w * fit;
      total += weight;
      pool.push([id, weight]);
    }
    let r = this.rng() * total;
    for (const [id, w] of pool) {
      r -= w;
      if (r <= 0) return id;
    }
    return pool[0]?.[0] || 'bandit';
  }

  spawn(id, level, position, opts = {}) {
    const def = ENEMY_BY_ID[id];
    if (!def) return null;
    const enemy = new Enemy({
      def, level, position,
      world: this.world,
      ctx: {
        combat: this.combat,
        vfx: this.game.vfx,
        audio: this.game.audio,
        projectiles: this.game.projectiles,
        world: this.world,
        player: this.game.player,
        difficulty: this.game.settings.get('gameplay', 'difficulty'),
        aggression: this.game.difficulty?.aggression ?? 1,
        spawnEnemy: (i, l, p, o) => this.spawn(i, l, p, o),
        onDeath: (e) => this.#onDeath(e),
        ...opts.ctx,
      },
    });
    enemy.ctx.ttl = opts.ttl || 0;
    if (opts.scale) enemy.root.scale.setScalar(opts.scale);
    this.game.scene.add(enemy.root);
    this.combat.add(enemy);
    this.enemies.push(enemy);
    this.totalSpawned++;
    return enemy;
  }

  /** Find a legal spawn position: flat, dry, not on top of the player. */
  findSpawn(playerPos, region) {
    for (let i = 0; i < 14; i++) {
      const a = this.rng() * Math.PI * 2;
      const d = lerp(MIN_DIST, MAX_DIST, this.rng());
      const x = playerPos.x + Math.cos(a) * d;
      const z = playerPos.z + Math.sin(a) * d;
      if (Math.abs(x) > 1500 || Math.abs(z) > 1500) continue;
      const t = this.world.terrain;
      if (t.isWater(x, z)) continue;
      if (!t.isFlatEnough(x, z, 0.7)) continue;
      const h = t.heightAt(x, z);
      if (h > 130) continue;
      // not inside a village
      let blocked = false;
      for (const poi of Object.values(POI_BY_ID)) {
        if (poi.t === 'village' || poi.t === 'camp') {
          if (Math.hypot(x - poi.pos[0], z - poi.pos[1]) < (poi.r || 40) + 25) { blocked = true; break; }
        }
      }
      if (blocked) continue;
      const y = this.world.heightAt(x, z);
      return new THREE.Vector3(x, y, z);
    }
    return null;
  }

  update(dt, playerPos, playerLevel) {
    this.cap = this.game.settings.get('video', 'maxEnemies');
    this.timer -= dt;
    const alive = this.enemies.filter((e) => e.alive);
    if (alive.length < this.cap && this.timer <= 0) {
      this.timer = 0.6 + this.rng() * 1.2;
      const region = this.regionAt(playerPos.x, playerPos.z);
      if (region) {
        const pos = this.findSpawn(playerPos, region);
        if (pos) {
          const id = this.#pick(region, playerLevel);
          const [lo, hi] = ENEMY_BY_ID[id].level || [1, 60];
          const rl = region.level || [1, 20];
          const level = Math.round(clamp(lerp(rl[0], rl[1], this.rng()), lo, Math.max(lo, hi)));
          this.spawn(id, level, pos, {});
        }
      }
    }
    // cull the long dead
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive && (e.deathSink > 14 || e.removed)) {
        this.game.scene.remove(e.root);
        this.combat.remove(e);
        e.dispose();
        this.enemies.splice(i, 1);
      } else if (e.alive && e.position.distanceTo(playerPos) > 420) {
        // recycle far-away wanderers so the cap is spent near the player
        if (!e.aggro) {
          this.game.scene.remove(e.root);
          this.combat.remove(e);
          e.dispose();
          this.enemies.splice(i, 1);
        }
      }
    }
  }

  /** Bosses live at POIs; spawn when the player gets close, once. */
  maybeSpawnPoiEnemies(playerPos) {
    for (const poi of Object.values(POI_BY_ID)) {
      if (!poi.boss) continue;
      if (this.spawnedPoiBosses.has(poi.id)) continue;
      const d = Math.hypot(playerPos.x - poi.pos[0], playerPos.z - poi.pos[1]);
      if (d > 70) continue;
      this.spawnedPoiBosses.add(poi.id);
      const pos = new THREE.Vector3(poi.pos[0], this.world.heightAt(poi.pos[0], poi.pos[1]), poi.pos[1]);
      this.spawn(poi.boss, poi.bossLevel || 40, pos, {});
    }
  }

  #onDeath(enemy) {
    this.game.onEnemyKilled?.(enemy);
  }

  clear() {
    for (const e of this.enemies) {
      this.game.scene.remove(e.root);
      this.combat.remove(e);
      e.dispose();
    }
    this.enemies.length = 0;
  }
}

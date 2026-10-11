import * as THREE from 'three';
import { Actor } from './Actor.js';
import { buildCharacter, configFromEnemy } from './CharacterRig.js';
import { scaleEnemy } from '../data/enemies.js';
import { beginAttack, updateAttack, ENEMY_ATTACKS, attackRange } from './enemyAttacks.js';
import { bus, EV } from '../core/EventBus.js';
import { clamp, clamp01, lerp, damp, dampAngle, makeRng } from '../core/MathUtils.js';
import { DIFFICULTIES } from '../core/Settings.js';

/**
 * A small director so a pack of eight bandits doesn't all swing at once —
 * only `max` enemies hold an attack token, rotated by proximity and cooldown.
 */
class AttackTokens {
  constructor(max = 3) { this.max = max; this.holders = new Set(); }
  setMax(n) { this.max = n; }
  request(enemy) {
    if (this.holders.has(enemy)) return true;
    if (this.holders.size >= this.max) return false;
    this.holders.add(enemy);
    return true;
  }
  release(enemy) { this.holders.delete(enemy); }
  clear() { this.holders.clear(); }
}

let director = new AttackTokens(3);

export class Enemy extends Actor {
  constructor({ def, level = 1, position, world, ctx }) {
    const lvl = clamp(Math.round(level), def.level?.[0] ?? 1, 999);
    const s = scaleEnemy(def, lvl);
    const diff = DIFFICULTIES[ctx?.difficulty] || DIFFICULTIES.adept;
    const healthMult = diff.enemyHealth * (def.boss ? 1 : 1) * (ctx?.healthMult ?? 1);
    const conf = configFromEnemy(def, lvl);
    const rig = buildCharacter(conf);

    super({
      rig,
      stats: {
        maxHealth: Math.round(s.maxHealth * healthMult),
        maxStamina: 100,
        maxFocus: 0,
        poise: Math.round(s.poise * diff.enemyPoise),
        defense: Math.round(lvl * 1.7 + (def.tier === 'boss' ? 22 : 0)),
        spiritDefense: Math.round(lvl * 1.3),
        critChance: def.boss ? 8 : 4,
        critDamage: 150,
        lifesteal: 0,
      },
      faction: 'enemy',
      name: def.name,
      level: lvl,
      def,
    });

    this.world = world;
    this.ctx = ctx;                      // { combat, vfx, audio, projectiles, world, player, spawnEnemy, aggression }
    this.ai = def.ai || { profile: 'melee', range: 2.2, aggression: 0.8, attackRate: 1.4 };
    this.damage = s.damage * diff.enemyDamage * (ctx?.damageMult ?? 1);
    this.xpValue = Math.round(s.xp * diff.xp);
    this.goldValue = s.gold;
    this.essenceValue = def.essence || Math.round(s.xp * 0.35);
    this.baseSpeed = (s.speed || 3.4) * (ctx?.speedMult ?? 1);
    this.height = conf.height * 1.8;
    this.radius = clamp(conf.height * 0.55, 0.35, 1.6);
    this.tier = def.tier || 'minion';
    this.isBoss = !!def.boss;
    this.kanji = def.kanji || '';

    this.state = 'idle';
    this.stateTime = 0;
    this.action = null;
    this.attackCooldown = 0.6 + Math.random() * 0.8;
    this.aggro = false;
    this.awareness = 0;
    this.aggroRange = this.ai.profile === 'archer' ? 34 : this.ai.profile === 'caster' ? 26 : 20;
    this.leash = this.isBoss ? 90 : 34;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeTimer = 1 + Math.random() * 2;
    this.root.position.copy(position);
    this.spawn = position.clone();
    this.facing = Math.random() * Math.PI * 2;
    this.targetFacing = this.facing;
    this.target = null;
    this.ttl = ctx?.ttl || 0;
    this.buffTags = [];
    this.enraged = false;
    this.flyMode = false;
    this.hover = this.ai.float ? 0.55 : 0;
    this.floats = !!this.ai.float || !!this.ai.fly;
    this.diveTarget = null;
    this.rng = makeRng((def.id.length * 977 + lvl * 31 + Math.floor(position.x * 7 + position.z)) | 0);
    this.homeRadius = this.ai.profile === 'archer' || this.ai.profile === 'caster' ? 18 : 12;
    this.wanderTarget = null;
    this.wanderTimer = 0;
    this.deathSink = 0;
    this.removed = false;
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();

    if (ctx?.scale) this.root.scale.setScalar(ctx.scale);
    this.root.rotation.y = this.facing;

    // raid-wide shout when one of a pack spots you
    this.alertRadius = this.isBoss ? 0 : 16;
  }

  get speedMult() { return this.buffTags.reduce((m, b) => m * (b.mods.speedMul || 1), 1); }
  get damageMult() { return this.buffTags.reduce((m, b) => m * (b.mods.damageMul || 1), 1) * (this.enraged ? 1.25 : 1); }

  addBuffTag(mods, duration) {
    this.buffTags.push({ mods, t: 0, duration });
    this.vfx?.aura?.(this.position, {});
  }

  shout(text) { bus.emit(EV.ENEMY_SHOUT, { actor: this, text }); }

  // ───────────────────────────────────────────────────────── perception
  #canSee(target) {
    if (!target || !target.alive) return false;
    const d = this.flatDistanceTo(target);
    if (d > this.aggroRange) return false;
    // cheap line-of-sight: walk the segment and look for terrain in the way
    const steps = Math.min(7, Math.max(2, Math.floor(d / 4)));
    const px = this.position.x, pz = this.position.z;
    const py = this.position.y + this.height * 0.6;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = lerp(px, target.position.x, t);
      const z = lerp(pz, target.position.z, t);
      const h = this.world.heightAt(x, z);
      const eye = lerp(py, target.position.y + target.height * 0.6, t);
      if (h > eye + 1.2) return false;
    }
    return true;
  }

  alertFrom(source) {
    if (this.aggro || !this.alive) return;
    if (this.position.distanceTo(source.position) > this.alertRadius) return;
    this.aggro = true;
    this.awareness = 1;
    this.state = 'chase';
    this.stateTime = 0;
    this.target = source;
    if (this.ai.telegraphs?.includes('roar')) this.shout(this.kanji);
  }

  // ──────────────────────────────────────────────────────────── brain
  /** Who this actor hunts: the player, or — for summoned allies — the nearest foe. */
  #focus() {
    if (!this.ctx.ally) return this.ctx.player;
    let best = null, bestD = 1e9;
    for (const a of this.ctx.combat.actors) {
      if (!a.alive || a.faction !== 'enemy') continue;
      const d = a.position.distanceToSquared(this.position);
      if (d < bestD) { bestD = d; best = a; }
    }
    return best || this.ctx.player;
  }

  #think(dt) {
    const player = this.ctx.ally ? this.#focus() : this.ctx.player;
    this.target = player;

    if (!player || !player.alive) { this.state = 'return'; return; }
    // summons heel to the player when there is nothing hostile left
    if (this.ctx.ally && player === this.ctx.player) {
      this.state = 'chase';
      this.aggro = false;
      return;
    }

    const dist = this.flatDistanceTo(player);
    const see = this.#canSee(player);

    if (!this.aggro) {
      if (see && dist < this.aggroRange) {
        this.awareness = clamp01(this.awareness + dt * (1.6 + this.ai.aggression));
        if (this.awareness >= 1) {
          this.aggro = true;
          this.state = 'chase';
          this.stateTime = 0;
          this.#alertPack();
          this.ctx.audio?.play(this.isBoss ? 'roar_boss' : 'enemy_alert', { volume: this.isBoss ? 1 : 0.5, position: this.position });
          if (this.ai.telegraphs?.includes('roar')) this.shout(this.kanji);
        }
      } else {
        this.awareness = Math.max(0, this.awareness - dt * 0.5);
      }
      return;
    }

    // leash (allies never run home)
    if (this.ctx.ally) return;
    if (this.flatDistanceTo(this.spawn) > this.leash && dist > 14) {
      this.state = 'return';
      this.aggro = false;
      this.awareness = 0;
      director.release(this);
      return;
    }
    if (!this.action) director.release(this);
  }

  #alertPack() {
    if (!this.alertRadius) return;
    for (const a of this.ctx.combat.actors) {
      if (a === this || a.faction !== 'enemy' || !a.alive || !a.alertFrom) continue;
      a.alertFrom(this);
    }
  }

  #chooseAttack(dist) {
    const a = this.ai;
    const pool = [];
    // melee always available in range
    const reach = a.range || 2.4;
    if (dist <= reach + 0.6) {
      pool.push({ id: 'melee_generic', w: 3 });
      if (a.profile === 'brute') pool.push({ id: 'heavy_slam', w: 2.2 }, { id: 'kanabo_slam', w: 1.1 });
      if (a.profile === 'spear') pool.push({ id: 'thrust', w: 3 });
      if (a.profile === 'skirmisher') pool.push({ id: 'quick_flurry', w: 2 }, { id: 'spirit_slash', w: 1.2 });
      if (a.grab) pool.push({ id: 'drown', w: 1.4 });
      if (a.abilities?.includes('bite')) pool.push({ id: 'bite', w: 2.4 });
      if (a.abilities?.includes('lash')) pool.push({ id: 'lash', w: 2 });
      if (a.abilities?.includes('nine_cut')) pool.push({ id: 'nine_cut', w: 1.6 });
      if (a.abilities?.includes('tail_sweep')) pool.push({ id: 'tail_sweep', w: 1.8 });
      if (a.abilities?.includes('rib_storm')) pool.push({ id: 'rib_storm', w: 1.2 });
      if (a.abilities?.includes('whirl')) pool.push({ id: 'whirl', w: 1.4 });
      if (a.abilities?.includes('bone_swipe')) pool.push({ id: 'bone_swipe', w: 2 });
    }
    // mid range
    if (dist > reach && dist < 14) {
      if (a.abilities?.includes('blink_strike')) pool.push({ id: 'blink_strike', w: 2.2 });
      if (a.abilities?.includes('spirit_slash')) pool.push({ id: 'spirit_slash', w: 1.6 });
      if (a.abilities?.includes('fox_fire')) pool.push({ id: 'fox_fire', w: 2 });
      if (a.abilities?.includes('water_whip')) pool.push({ id: 'water_whip', w: 1.8 });
      if (a.abilities?.includes('hair_sweep')) pool.push({ id: 'hair_sweep', w: 1.6 });
      if (a.abilities?.includes('wind_gust')) pool.push({ id: 'wind_gust', w: 1.5 });
      if (a.abilities?.includes('frost_breath')) pool.push({ id: 'frost_breath', w: 1.5 });
      if (a.abilities?.includes('sake_breath')) pool.push({ id: 'sake_breath', w: 1.5 });
      if (a.abilities?.includes('curse_gaze')) pool.push({ id: 'curse_gaze', w: 1.4 });
      if (a.abilities?.includes('wail')) pool.push({ id: 'wail', w: 1.4 });
      if (a.abilities?.includes('scream')) pool.push({ id: 'scream', w: 1.4 });
      if (a.abilities?.includes('lifedrain')) pool.push({ id: 'lifedrain', w: 1.3 });
      if (a.abilities?.includes('contract_steal')) pool.push({ id: 'contract_steal', w: 1.2 });
      if (a.profile === 'archer') pool.push({ id: 'arrow_shot', w: 4 });
      if (a.profile === 'caster') {
        if (a.abilities?.includes('web_shot')) pool.push({ id: 'web_shot', w: 2.4 });
        if (a.abilities?.includes('hand_bundle')) pool.push({ id: 'hand_bundle', w: 2 });
        if (a.abilities?.includes('curse')) pool.push({ id: 'curse', w: 2.2 });
      }
    }
    // long range
    if (dist >= 12) {
      if (a.profile === 'archer') pool.push({ id: 'arrow_shot', w: 5 });
      if (a.abilities?.includes('sky_dive')) pool.push({ id: 'sky_dive', w: 2.4 });
      if (a.abilities?.includes('fox_fire')) pool.push({ id: 'fox_fire', w: 2 });
      if (a.abilities?.includes('spiderlings')) pool.push({ id: 'spiderlings', w: 1.1 });
      if (a.abilities?.includes('summon_gaki')) pool.push({ id: 'summon_gaki', w: 1.1 });
      if (a.abilities?.includes('summon_oni')) pool.push({ id: 'summon_oni', w: 1.0 });
      if (a.abilities?.includes('mirror_self')) pool.push({ id: 'mirror_self', w: 1.0 });
      if (a.abilities?.includes('bell_ring')) pool.push({ id: 'bell_ring', w: 1.6 });
      if (a.abilities?.includes('spirit_torrent')) pool.push({ id: 'spirit_torrent', w: 1.4 });
      if (a.abilities?.includes('nine_tails_form') && !this.enraged) pool.push({ id: 'nine_tails_form', w: 3 });
      if (a.abilities?.includes('skull_laugh') && !this.enraged) pool.push({ id: 'skull_laugh', w: 2 });
      if (a.abilities?.includes('rib_storm')) pool.push({ id: 'rib_storm', w: 1.6 });
    }
    if (!pool.length) pool.push({ id: 'melee_generic', w: 1 });

    // weight by cooldown memory so bosses don't spam one move
    this.moveMemory = this.moveMemory || {};
    let total = 0;
    for (const p of pool) {
      const last = this.moveMemory[p.id] || -99;
      const age = clamp(this.time - last, 0, 20);
      p.w *= 0.35 + age / 20 * 0.65;
      total += p.w;
    }
    let r = this.rng() * total;
    for (const p of pool) {
      r -= p.w;
      if (r <= 0) {
        this.moveMemory[p.id] = this.time;
        return p.id;
      }
    }
    return pool[0].id;
  }

  #moveToward(target, dt, speed, keepDistance = 0, strafe = 0) {
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const d = Math.hypot(dx, dz) || 1;
    let nx = dx / d, nz = dz / d;
    if (keepDistance > 0 && d < keepDistance) { nx = -nx; nz = -nz; }
    else if (keepDistance > 0 && d < keepDistance + 1.5) { nx = 0; nz = 0; }
    if (strafe) {
      const sx = -nz * strafe, sz = nx * strafe;
      nx = nx * 0.45 + sx;
      nz = nz * 0.45 + sz;
      const l = Math.hypot(nx, nz) || 1;
      nx /= l; nz /= l;
    }
    const want = (keepDistance > 0 && d < keepDistance ? 0.7 : 1) * speed;
    this.velocity.x = damp(this.velocity.x, nx * want, 10, dt);
    this.velocity.z = damp(this.velocity.z, nz * want, 10, dt);
    return d;
  }

  #wander(dt) {
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      this.wanderTimer = 2.5 + this.rng() * 4;
      const a = this.rng() * Math.PI * 2;
      const r = 2 + this.rng() * this.homeRadius * 0.5;
      this.wanderTarget = new THREE.Vector3(
        this.spawn.x + Math.cos(a) * r, 0, this.spawn.z + Math.sin(a) * r,
      );
      this.wanderTarget.y = this.world.heightAt(this.wanderTarget.x, this.wanderTarget.z);
    }
    if (this.wanderTarget) {
      const d = this.#moveToward(this.wanderTarget, dt, this.baseSpeed * 0.4);
      if (d < 1.2) this.wanderTarget = null;
      this.animator.setState('walk');
      this.animator.speed = 0.6;
    } else {
      this.velocity.x = damp(this.velocity.x, 0, 6, dt);
      this.velocity.z = damp(this.velocity.z, 0, 6, dt);
      this.animator.setState('idle');
    }
  }

  // ───────────────────────────────────────────────────────────── update
  update(dt) {
    this.stateTime += dt;
    for (let i = this.buffTags.length - 1; i >= 0; i--) {
      const b = this.buffTags[i];
      b.t += dt;
      if (b.t >= b.duration) this.buffTags.splice(i, 1);
    }
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.ttl > 0) {
      this.ttl -= dt;
      if (this.ttl <= 0 && this.alive) {
        this.ctx.vfx?.burst(this.center(new THREE.Vector3()), 20, { color: [0x8a4bd8, 0xffffff], speed: 6, size: 0.4, life: 0.5 });
        this.alive = false;
        this.removed = true;
      }
    }

    if (!this.alive) {
      this.deathSink += dt;
      this.velocity.x = damp(this.velocity.x, 0, 8, dt);
      this.velocity.z = damp(this.velocity.z, 0, 8, dt);
      this.move(dt, this.world, { collide: !this.ai.phase });
      this.animator.update(dt, { speed: 0, grounded: this.grounded, velocity: this.velocity });
      return;
    }

    this.#think(dt);

    // ── action timeline ──────────────────────────────────────────────
    if (this.action) {
      const busy = updateAttack(this, dt, this.ctx);
      if (busy) {
        const a = this.action;
        if (a?.phase === 'windup') {
          this.velocity.x = damp(this.velocity.x, 0, 12, dt);
          this.velocity.z = damp(this.velocity.z, 0, 12, dt);
          // telegraph the windup so the player can read it
          if (this.rng() < 0.35) {
            this.ctx.vfx?.trail(this.center(this._v), this._v2.set(0, 1, 0), {
              color: a.def.type === 'fire' ? 0xff7a2a : 0xffd08a, size: 0.2, life: 0.3, speed: 1.2,
            });
          }
        }
      }
    }

    const player = this.ctx.player;
    const dist = player ? this.flatDistanceTo(player) : 999;

    if (!this.action) {
      switch (this.state) {
        case 'idle':
          this.#wander(dt);
          break;

        case 'chase': {
          const reach = (this.ai.range || 2.4);
          const keep = this.ai.keepDistance || 0;
          const strafe = this.strafeDir * (this.ai.profile === 'skirmisher' ? 0.9 : 0.45);
          this.strafeTimer -= dt;
          if (this.strafeTimer <= 0) { this.strafeDir *= -1; this.strafeTimer = 1.4 + this.rng() * 2.6; }
          const d = this.#moveToward(player.position, dt, this.baseSpeed * this.speedMult, keep, this.ai.profile === 'archer' || this.ai.profile === 'caster' ? 0 : strafe);
          this.animator.speed = clamp01(this.speed / this.baseSpeed) * 1.2;
          this.animator.setState(this.speed > this.baseSpeed * 0.95 ? 'run' : this.speed > 0.4 ? 'walk' : 'idle');

          // face the player unless strafing hard
          this.faceTowards(player.position.x, player.position.z, dt, 8);

          // block chance when idle-ish and player winds up
          if (this.ai.block && this.rng() < this.ai.block * dt * 2 && d < reach + 2) {
            this.state = 'guard';
            this.stateTime = 0;
            this.animator.setState('block');
          }

          if (this.attackCooldown <= 0) {
            const id = this.#chooseAttack(d);
            const def = ENEMY_ATTACKS[id];
            const range = def.range ?? reach;
            const inRange = d <= (range > 20 ? 40 : range + 0.8);
            if (inRange && director.request(this)) {
              beginAttack(this, id, this.ctx);
            } else if (!inRange && id === 'melee_generic') {
              // nothing in range: just keep closing
            }
          }
          break;
        }

        case 'guard': {
          this.velocity.x = damp(this.velocity.x, 0, 10, dt);
          this.velocity.z = damp(this.velocity.z, 0, 10, dt);
          this.blocking = true;
          this.faceTowards(player.position.x, player.position.z, dt, 6);
          if (this.stateTime > 0.8 + this.rng() * 0.8) {
            this.blocking = false;
            this.state = 'chase';
            this.animator.setState('idle');
          }
          break;
        }

        case 'return': {
          const d = this.#moveToward(this.spawn, dt, this.baseSpeed * 0.8);
          this.animator.setState(this.speed > 1 ? 'run' : 'idle');
          if (d < 2) { this.state = 'idle'; this.awareness = 0; }
          break;
        }

        default:
          this.state = 'idle';
      }
    }

    // ── physics ──────────────────────────────────────────────────────
    if (this.floats || this.flyMode) {
      const ground = this.world.heightAt(this.position.x, this.position.z);
      const wantY = ground + this.hover + (this.floats ? Math.sin(this.time * 1.7) * 0.18 : 2.5);
      this.position.y = damp(this.position.y, wantY, 4, dt);
      this.position.x += this.velocity.x * dt;
      this.position.z += this.velocity.z * dt;
      this.grounded = false;
      if (!this.ai.phase) {
        const r = this.world.resolveCollisions(this.position, this.radius, this._v);
        this.position.x = r.x; this.position.z = r.z;
      }
    } else {
      // dive: arc down at the target
      if (this.diveTarget) {
        this.velocity.y -= 26 * dt;
        this.position.x += this.velocity.x * dt;
        this.position.z += this.velocity.z * dt;
        this.position.y += this.velocity.y * dt;
        const ground = this.world.heightAt(this.position.x, this.position.z);
        if (this.position.y <= ground) {
          this.position.y = ground;
          this.diveTarget = null;
          this.velocity.set(0, 0, 0);
          this.grounded = true;
        }
      } else {
        this.move(dt, this.world, { collide: !this.ai.phase });
      }
    }

    super.update(dt);
    this.animator.update(dt, {
      speed: this.speed,
      grounded: this.grounded,
      velocity: this.velocity,
      blocking: this.blocking,
      lookTarget: this.aggro && player ? player.position : null,
    });

    if (this.health <= 0 && this.alive) {
      this.alive = false;
      this.onDeath();
    }
  }

  onDeath() {
    this.animator.setState('death', { force: true });
    this.blocking = false;
    this.action = null;
    director.release(this);
    this.ctx.audio?.play(this.isBoss ? 'boss_death' : 'enemy_death', { volume: this.isBoss ? 1 : 0.7, position: this.position });
    this.ctx.onDeath?.(this);
  }

  /** Dodge / i-frame helper used by the AI when a heavy is incoming. */
  tryDodge(dirX = 1) {
    this.invulnerable = 0.32;
    this.animator.setState('dash', { duration: 0.45, force: true });
    this.velocity.x = Math.cos(this.facing) * 7 * dirX;
    this.velocity.z = -Math.sin(this.facing) * 7 * dirX;
  }

  static setMaxAttackers(n) { director.setMax(n); }
  static clearTokens() { director.clear(); }
  static releaseTokens(e) { director.release(e); }
}

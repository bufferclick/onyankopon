import * as THREE from 'three';
import { bus, EV } from '../core/EventBus.js';
import { clamp, clamp01, lerp } from '../core/MathUtils.js';
import { DAMAGE_TYPES, STATUSES } from '../data/statuses.js';
import { DIFFICULTIES } from '../core/Settings.js';

/**
 * CombatSystem — damage resolution, blocking/parrying, posture, status ticks,
 * knockdowns, executions and all of the feedback that makes a hit land
 * (hitstop, shake, sparks, numbers, sound).
 */
export class CombatSystem {
  constructor({ world, vfx, audio, progression, settings, engine }) {
    this.world = world;
    this.vfx = vfx;
    this.audio = audio;
    this.progression = progression;
    this.settings = settings;
    this.engine = engine;
    this.actors = [];
    this.player = null;
    this.hitStop = 0;
    this.inCombat = 0;             // seconds since last hostile action
    this.killStreak = 0;
    this.lastKillTime = -99;
    this.recentHits = 0;
    this.recentHitTime = -99;
    this.difficulty = DIFFICULTIES.adept;
  }

  setDifficulty(id) { this.difficulty = DIFFICULTIES[id] || DIFFICULTIES.adept; }

  add(actor) {
    if (!this.actors.includes(actor)) this.actors.push(actor);
    if (actor.isPlayer) this.player = actor;
    actor.onStatusTick = (id, amount, type, st) => this.#statusTick(actor, id, amount, type, st);
    return actor;
  }

  remove(actor) {
    const i = this.actors.indexOf(actor);
    if (i >= 0) this.actors.splice(i, 1);
  }

  /** Living actors of a faction within radius of a point. */
  query(pos, radius, faction = 'enemy', out = []) {
    out.length = 0;
    const r2 = radius * radius;
    for (const a of this.actors) {
      if (!a.alive || a.faction !== faction) continue;
      if (a.position.distanceToSquared(pos) <= r2) out.push(a);
    }
    return out;
  }

  /** Nearest living hostile within a cone in front of `actor`. */
  nearestHostile(pos, faction, maxDist = 60, facing = null, fovCos = -1) {
    let best = null, bestD = maxDist * maxDist;
    for (const a of this.actors) {
      if (!a.alive || a.faction === faction) continue;
      const d = a.position.distanceToSquared(pos);
      if (d > bestD) continue;
      if (facing !== null && fovCos > -1) {
        const dx = a.position.x - pos.x;
        const dz = a.position.z - pos.z;
        const ang = Math.atan2(dx, dz);
        if (Math.cos(ang - facing) < fovCos) continue;
      }
      bestD = d;
      best = a;
    }
    return best;
  }

  // ────────────────────────────────────────────────────── attack resolution
  /**
   * @param {Actor} attacker
   * @param {Actor} target
   * @param {object} p { damage, type, posture, statuses, canBlock, canParry,
   *                     canDodge, critBonus, lifesteal, ability, position, direction }
   * @returns {{result:'hit'|'block'|'parry'|'dodge'|'miss', damage:number, crit:boolean}}
   */
  resolveAttack(attacker, target, p = {}) {
    if (!target || !target.alive) return { result: 'miss', damage: 0, crit: false };

    // dodge / i-frames
    if (p.canDodge !== false && target.invulnerable > 0) {
      bus.emit(EV.DODGE, { actor: target, attacker });
      return { result: 'dodge', damage: 0, crit: false };
    }

    // parry window (player only, via guard state)
    if (p.canParry !== false && target.parryWindow > 0 && target !== attacker) {
      this.#onParry(target, attacker, p);
      return { result: 'parry', damage: 0, crit: false };
    }

    // block
    if (p.canBlock !== false && target.blocking && target.facingTowards?.(attacker.position)) {
      const guard = clamp01(target.stats?.guardStrength ?? 0.6);
      const absorbed = (p.damage || 0) * (1 - guard);
      const staminaCost = Math.max(4, absorbed * 1.25);
      if (target.stamina >= staminaCost) {
        target.stamina -= staminaCost;
        target.staminaRegenDelay = 0.8;
        const chip = (p.damage || 0) * 0.12;
        if (chip > 0.5) this.applyDamage(target, { amount: chip, type: p.type, source: attacker, chip: true });
        this.#blockFeedback(target, attacker, p);
        bus.emit(EV.BLOCK, { actor: target, attacker, absorbed });
        return { result: 'block', damage: chip, crit: false, absorbed };
      }
      // guard broken
      target.stamina = 0;
      target.poise = 0;
      target.stagger(1.4);
      bus.emit(EV.BLOCK, { actor: target, attacker, guardBreak: true });
    }

    const res = this.applyDamage(target, {
      amount: p.damage ?? 10,
      type: p.type ?? 'physical',
      source: attacker,
      critBonus: p.critBonus,
      forcedCrit: p.forcedCrit,
      lifesteal: p.lifesteal,
      ability: p.ability,
      position: p.position,
      direction: p.direction,
      ignoreDefense: p.ignoreDefense,
      hitstop: p.hitstop,
    });

    // posture / poise
    const posture = (p.posture ?? (p.damage ?? 10) * 0.9) * (attacker?.stats?.postureDamage ?? 1);
    target.poise -= posture * this.difficulty.enemyPoise ** (target.isPlayer ? 0 : 1);
    if (target.poise <= 0) {
      target.poise = target.poiseMax * 0.6;
      target.postureBroken = true;
      target.postureBreakTime = this.time ?? 0;
      target.stagger(1.6);
      this.vfx.flash(target.center(_v1), { color: 0xffe9a8, size: 2.2 });
      bus.emit(EV.TOAST, { text: 'POSTURE BROKEN', kind: 'good' });
    }

    for (const st of p.statuses || []) {
      if (Math.random() < (st.chance ?? 1)) {
        target.addStatus(st.type, { duration: st.duration, power: st.power ?? 1, stacks: st.stacks ?? 1, source: attacker });
      }
    }
    for (const eff of p.onHit || []) {
      if (eff.k === 'knockback' || eff.k === 'knockdown' || eff.k === 'pull') {
        this.#displace(target, attacker?.position, eff);
      }
    }

    this.inCombat = 8;
    return res;
  }

  #onParry(defender, attacker, p) {
    defender.parryWindow = 0;
    defender.focus = Math.min(defender.maxFocus, defender.focus + 8);
    defender.stamina = Math.min(defender.maxStamina, defender.stamina + 12);
    attacker.poise -= 34 * (defender.stats?.postureDamage ?? 1);
    attacker.stagger(1.1);
    attacker.animator?.setState('hit', { force: true });
    this.hitStop(0.11);
    this.engine?.shake(0.55);
    this.engine?.aberration(0.9);
    const pos = defender.center(_v1).add(_v2.set(0, 0.2, 0));
    this.vfx.flash(pos, { color: 0xffffff, size: 2.4, dur: 0.28 });
    this.vfx.burst(pos, 26, { color: [0xffffff, 0xbfe6ff, 0xffe9a8], speed: 9, size: 0.32, life: 0.35, drag: 3 });
    this.audio?.play('parry_perfect', { volume: 1.0, position: pos, reverb: 0.4 });
    this.audio?.play('parry_clang', { volume: 0.7, position: pos, reverb: 0.5 });
    bus.emit(EV.PARRY, { defender, attacker });
  }

  #blockFeedback(target, attacker, p) {
    const pos = target.center(_v1);
    this.vfx.burst(pos, 10, { color: [0xdfe8ff, 0xffffff], speed: 5, size: 0.2, life: 0.25 });
    this.vfx.shockwave(pos, { color: 0xdfe8ff, radius: 1.6, dur: 0.3, opacity: 0.5 });
    this.audio?.play('block_impact', { volume: 0.6, position: pos });
    this.engine?.shake(0.2);
    this.hitStop(0.04);
  }

  #displace(target, from, eff) {
    if (!from) return;
    const dir = _v1.copy(target.position).sub(from).setY(0);
    const len = dir.length() || 1;
    dir.divideScalar(len);
    if (eff.k === 'pull') dir.multiplyScalar(-1);
    const strength = eff.strength ?? 5;
    target.velocity.x += dir.x * strength;
    target.velocity.z += dir.z * strength;
    if (eff.k === 'knockdown') {
      target.velocity.y += 4.5;
      target.stagger(1.2);
    }
  }

  // ─────────────────────────────────────────────────────────────── damage
  applyDamage(target, {
    amount = 10, type = 'physical', source = null, critBonus = 0, forcedCrit = false,
    lifesteal = null, ability = null, position = null, direction = null, chip = false,
    ignoreDefense = false, silent = false, hitstop = null,
  } = {}) {
    if (!target || !target.alive) return { result: 'miss', damage: 0, crit: false };
    if (target.invulnerable > 0 && !chip) return { result: 'dodge', damage: 0, crit: false };

    const attackerIsPlayer = source?.isPlayer;
    const diff = this.difficulty;
    let dmg = amount;

    // attacker-side scaling
    if (source && source.stats) {
      const power = type === 'physical' ? source.stats.physicalPower : source.stats.spiritPower;
      dmg = amount * (1 + power / 100) * (ability ? (source.stats.konDamage || 1) : 1);
      if (source.statusMod) dmg *= 1 + source.statusMod('damageDealt');
    }
    if (attackerIsPlayer) dmg *= diff.playerDamage;
    else if (source && !attackerIsPlayer) dmg *= diff.enemyDamage;

    // defence
    if (!ignoreDefense && target.stats) {
      const dtype = DAMAGE_TYPES[type] || DAMAGE_TYPES.physical;
      const defKey = dtype.defense;
      const def = defKey ? (target.stats[defKey] || 0) : 0;
      const mit = def / (def + 62 + (target.level || 1) * 5.5);
      dmg *= 1 - clamp(mit, 0, 0.82);
    }

    // crit
    const critChance = clamp01(((source?.stats?.critChance ?? 5) + critBonus) / 100);
    const crit = forcedCrit || Math.random() < critChance;
    if (crit) dmg *= ((source?.stats?.critDamage ?? 150) / 100);

    // target-side modifiers
    if (target.statusMod) dmg *= 1 + target.statusMod('damageTaken');
    dmg *= 1 + (target.def?.weaknesses?.includes?.(type) ? 0.35 : 0);
    dmg *= 1 - (target.def?.resistances?.includes?.(type) ? 0.4 : 0);

    dmg = Math.max(1, Math.round(dmg));
    target.health -= dmg;
    target.lastDamageTime = this.time ?? 0;

    // feedback
    if (!silent) this.#hitFeedback(target, { dmg, type, crit, source, position, direction, ability, chip, hitstop });

    // lifesteal
    if (source && source.stats) {
      const ls = lifesteal ?? source.stats.lifesteal ?? 0;
      if (ls > 0 && !target.isPlayer) {
        source.restoreHealth((dmg * ls) / 100);
      }
    }

    // hit reaction animation
    if (target.alive && !chip) {
      const dirVec = direction || (source ? _v2.copy(source.position).sub(target.position).normalize() : _v2.set(0, 0, 1));
      target.animator?.applyHit(dirVec, target.facing, clamp01(dmg / Math.max(1, target.maxHealth * 0.25)));
      if (!target.isStaggered && target.animator?.state !== 'attack' && target.animator?.state !== 'heavy') {
        if (dmg > target.maxHealth * 0.18 || crit) target.animator?.setState('hit', { force: true });
      }
    }

    if (target.health <= 0) this.kill(target, source);

    bus.emit(EV.DAMAGE, { target, source, dmg, type, crit });
    return { result: 'hit', damage: dmg, crit };
  }

  #hitFeedback(target, { dmg, type, crit, source, position, direction, ability, chip, hitstop }) {
    const pos = position ? _v3.copy(position) : target.center(_v3);
    const dir = direction ? _v4.copy(direction) : (source ? _v4.copy(pos).sub(source.position).setY(0).normalize() : _v4.set(0, 0, 1));
    const color = (DAMAGE_TYPES[type] || DAMAGE_TYPES.physical).color;

    if (!chip) {
      this.vfx.hitSpray(pos, dir, {
        color: type === 'fire' ? 0xff7a2a : type === 'spirit' || type === 'void' ? 0x8a4bd8 : 0xc8443c,
        count: crit ? 24 : 13,
        power: clamp(0.6 + dmg / 60, 0.6, 2.2),
      });
      if (crit) {
        this.vfx.flash(pos, { color: 0xffe9a8, size: 2.0, dur: 0.25 });
        this.engine?.shake(0.45);
        this.audio?.play('critical_hit', { volume: 0.9, position: pos });
      }
      this.hitStop(hitstop ?? (crit ? 0.09 : dmg > 40 ? 0.06 : 0.035));
      this.engine?.shake(clamp(dmg / 260, 0.04, 0.5));
      this.engine?.aberration(crit ? 0.5 : 0.2);
    }

    const sfxGroup = target.isPlayer ? 'player_hurt' : type === 'spirit' || type === 'void' ? 'spirit_impact'
      : type === 'fire' ? 'fire_impact' : 'hit_flesh';
    this.audio?.play(sfxGroup, { volume: chip ? 0.35 : 0.75, position: pos, pitch: crit ? 2 : 0 });

    // floating numbers (UI layer listens for this)
    bus.emit(EV.HIT, {
      target, dmg, crit, type, position: pos.clone(), color,
      isPlayerTarget: !!target.isPlayer, chip,
    });
  }

  /** Straight damage with no defence roll (fall damage, sacrifice, poison). */
  trueDamage(target, amount, source = null, opts = {}) {
    return this.applyDamage(target, { ...opts, amount, type: 'true', ignoreDefense: true, source });
  }

  // ───────────────────────────────────────────────────────────────── areas
  radial(origin, { radius = 5, damage = 20, type = 'spirit', source = null, statuses = null,
    posture = null, falloff = true, maxTargets = 99, vfx = null, onHit = null, y = null } = {}) {
    const hits = [];
    const center = _v5.copy(origin);
    if (y !== null) center.y = y;
    for (const a of this.actors) {
      if (!a.alive) continue;
      if (a === source) continue;
      if (source && a.faction === source.faction) continue;
      const d = Math.hypot(a.position.x - center.x, a.position.z - center.z);
      if (d > radius + a.radius) continue;
      const fall = falloff ? clamp(1 - (d / radius) ** 2 * 0.65, 0.35, 1) : 1;
      const res = this.resolveAttack(source, a, {
        damage: damage * fall, type, posture: (posture ?? damage * 0.8) * fall,
        statuses, canBlock: type !== 'true', canParry: false,
        position: a.center(_v6), direction: _v7.copy(a.position).sub(center).setY(0).normalize(),
      });
      hits.push({ actor: a, ...res });
      onHit?.(a, res);
      if (hits.length >= maxTargets) break;
    }
    if (vfx) this.vfx.shockwave(center, { radius, color: vfx.color ?? 0xffc46a, dur: vfx.dur ?? 0.5, opacity: vfx.opacity ?? 0.8 });
    return hits;
  }

  cone(origin, dir, { range = 12, angle = 50, damage = 20, type = 'fire', source = null, statuses = null } = {}) {
    const hits = [];
    const cosLimit = Math.cos((angle * Math.PI) / 180 / 2);
    const d = _v7.copy(dir).setY(0).normalize();
    for (const a of this.actors) {
      if (!a.alive || a === source) continue;
      if (source && a.faction === source.faction) continue;
      const to = _v6.copy(a.position).sub(origin).setY(0);
      const dist = to.length();
      if (dist > range + a.radius) continue;
      to.normalize();
      if (to.dot(d) < cosLimit) continue;
      const fall = clamp(1 - (dist / range) * 0.5, 0.5, 1);
      hits.push({ actor: a, ...this.resolveAttack(source, a, {
        damage: damage * fall, type, statuses, canBlock: true, canParry: false,
        position: a.center(_v5), direction: to,
      }) });
    }
    return hits;
  }

  line(from, to, { width = 1.5, damage = 20, type = 'spirit', source = null, statuses = null } = {}) {
    const hits = [];
    const dir = _v7.copy(to).sub(from);
    const len = dir.length();
    dir.normalize();
    for (const a of this.actors) {
      if (!a.alive || a === source) continue;
      if (source && a.faction === source.faction) continue;
      const rel = _v6.copy(a.position).sub(from);
      const t = rel.dot(dir);
      if (t < -a.radius || t > len + a.radius) continue;
      const perp = rel.clone().addScaledVector(dir, -t).length();
      if (perp > width + a.radius) continue;
      hits.push({ actor: a, ...this.resolveAttack(source, a, {
        damage, type, statuses, canBlock: true, canParry: false, position: a.center(_v5), direction: dir,
      }) });
    }
    return hits;
  }

  // ─────────────────────────────────────────────────────────────── death
  kill(target, source) {
    if (!target.alive) return;
    target.alive = false;
    target.health = 0;
    target.velocity.set(0, 0, 0);
    target.animator?.setState('death', { force: true });
    target.deathTime = 0;
    this.vfx.hitSpray(target.center(_v1), _v2.set(0, 1, 0), { color: 0xc8443c, count: 22, power: 1.6 });
    this.audio?.play('enemy_death', { volume: 0.8, position: target.position });

    const now = this.time ?? 0;
    if (now - this.lastKillTime < 5) this.killStreak++; else this.killStreak = 1;
    this.lastKillTime = now;

    bus.emit(EV.KILL, { target, source, streak: this.killStreak, isBoss: !!target.def?.boss });
  }

  /** Called by the ability system for finishing moves. */
  execute(target, source) {
    if (!target.alive) return false;
    const threshold = target.def?.boss ? 0.06 : 0.22;
    if (target.healthPct > threshold) return false;
    this.vfx.flash(target.center(_v1), { color: 0xff2e2e, size: 3, dur: 0.4 });
    this.vfx.hitSpray(target.center(_v1), _v2.set(0, 1, 0), { color: 0xff2e2e, count: 30, power: 2.2 });
    this.audio?.play('execution', { volume: 1, position: target.position });
    this.engine?.shake(1.0);
    this.hitStop(0.22);
    target.health = 0;
    this.kill(target, source);
    bus.emit(EV.EXECUTE, { target, source });
    return true;
  }

  hitStop(seconds) {
    if (!this.settings) return;
    const scale = clamp(this.settings.get('gameplay', 'hitStop'), 0, 2);
    this.hitStop = Math.max(this.hitStop, seconds * scale);
    this.engine?.hitStop(seconds * scale);
  }

  #statusTick(actor, id, amount, type, st) {
    const power = (actor.stats?.[type === 'physical' ? 'physicalPower' : 'spiritPower'] || 10);
    const dmg = amount * (1 + power / 260);
    this.applyDamage(actor, { amount: dmg, type, ignoreDefense: type === 'true', silent: false, chip: true });
    if (!actor.alive) return;
    const def = STATUSES[id];
    if (def?.vfx === 'burnFlame') {
      this.vfx.trail(actor.center(_v1), _v2.set(0, 1, 0), { color: 0xff7a2a, size: 0.28, life: 0.4, speed: 1.4 });
    } else if (def?.vfx === 'bloodDrip') {
      this.vfx.trail(actor.center(_v1), _v2.set(0, -1, 0), { color: 0xc8443c, size: 0.16, life: 0.3, gravity: 8 });
    } else if (def?.vfx === 'poisonBubble') {
      this.vfx.trail(actor.center(_v1), _v2.set(0, 1, 0), { color: 0x8fd18a, size: 0.2, life: 0.5, speed: 0.8 });
    }
  }

  update(dt) {
    this.time = (this.time ?? 0) + dt;
    if (this.hitStop > 0) this.hitStop -= dt;
    if (this.inCombat > 0) this.inCombat -= dt;
    for (const a of this.actors) {
      if (!a.alive) {
        a.deathTime = (a.deathTime || 0) + dt;
        continue;
      }
    }
  }

  /** 0..1 for the music director. */
  get intensity() {
    return clamp01(this.inCombat / 8);
  }
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v6 = new THREE.Vector3();
const _v7 = new THREE.Vector3();

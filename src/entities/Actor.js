import * as THREE from 'three';
import { Animator } from './Animator.js';
import { clamp, clamp01, lerp, damp, dampAngle } from '../core/MathUtils.js';
import { STATUSES } from '../data/statuses.js';
import { bus, EV } from '../core/EventBus.js';

/**
 * Actor — everything that can be hit, poisoned, staggered and killed.
 * Player, enemies, summons and NPCs all derive from this so combat code never
 * has to care which one it is holding.
 */
export class Actor {
  constructor({ rig, stats, faction = 'enemy', name = 'Actor', level = 1, def = null }) {
    this.rig = rig;
    this.root = rig.root;
    this.animator = new Animator(rig);
    this.faction = faction;          // 'player' | 'enemy' | 'neutral'
    this.name = name;
    this.def = def;
    this.level = level;

    this.stats = stats;
    this.maxHealth = stats.maxHealth;
    this.health = stats.maxHealth;
    this.maxStamina = stats.maxStamina ?? 100;
    this.stamina = this.maxStamina;
    this.maxFocus = stats.maxFocus ?? 0;
    this.focus = this.maxFocus;
    this.poiseMax = stats.poise ?? 20;
    this.poise = this.poiseMax;

    this.statuses = new Map();       // id -> { stacks, t, duration, power, source }
    this.alive = true;
    this.dead = false;
    this.invulnerable = 0;
    this.staggerTimer = 0;
    this.staminaRegenDelay = 0;
    this.focusRegenDelay = 0;
    this.hitStop = 0;

    this.velocity = new THREE.Vector3();
    this.desiredVelocity = new THREE.Vector3();
    this.facing = 0;
    this.targetFacing = 0;
    this.grounded = true;
    this.groundY = 0;
    this.radius = 0.55;
    this.height = 1.8;

    this.position = this.root.position;
    this.lastDamageTime = -99;
    this.time = 0;
    this.leader = null;              // possession / escort targets
    this.onEvent = null;
    this.animator.onEvent = (name) => this.emit(name);
    this._statusAccum = 0;
  }

  emit(name) { this.onEvent?.(name, this); }

  get isPlayer() { return this.faction === 'player'; }
  get isStaggered() { return this.staggerTimer > 0; }
  get healthPct() { return clamp01(this.health / Math.max(1, this.maxHealth)); }
  get posturePct() { return clamp01(this.poise / Math.max(1, this.poiseMax)); }

  setStats(stats) {
    this.stats = stats;
    const hpPct = this.healthPct;
    this.maxHealth = stats.maxHealth;
    this.health = Math.max(1, this.maxHealth * hpPct);
    this.maxStamina = stats.maxStamina ?? this.maxStamina;
    this.poiseMax = stats.poise ?? this.poiseMax;
  }

  // ───────────────────────────────────────────────────────── statuses
  addStatus(id, { stacks = 1, duration = null, power = 1, source = null } = {}) {
    const def = STATUSES[id];
    if (!def) return false;
    if (!this.alive && id !== 'possessed') return false;
    const resist = clamp01((this.stats?.statusResist || 0) / 160);
    if (def.kind !== 'buff' && resist > 0) duration = (duration ?? def.duration ?? 5) * (1 - resist * 0.6);
    const existing = this.statuses.get(id);
    const maxStacks = def.maxStacks || 1;
    if (existing) {
      existing.stacks = Math.min(maxStacks, existing.stacks + stacks);
      existing.t = 0;
      existing.duration = Math.max(existing.duration, duration ?? def.duration ?? 5);
      existing.power = Math.max(existing.power, power);
    } else {
      this.statuses.set(id, {
        id, stacks, t: 0, duration: duration ?? def.duration ?? 5, power, source,
      });
    }
    if (def.interrupt && this.alive) this.stagger(0.35 * power);
    if (def.flee) this.fleeing = true;
    bus.emit(EV.STATUS_APPLIED, { actor: this, id, def, stacks: this.statuses.get(id).stacks });
    return true;
  }

  removeStatus(id) { this.statuses.delete(id); }
  hasStatus(id) { return this.statuses.has(id); }
  statusStacks(id) { return this.statuses.get(id)?.stacks || 0; }

  /** Multipliers contributed by every active status, summed. */
  statusMod(key) {
    let total = 0;
    for (const st of this.statuses.values()) {
      const def = STATUSES[st.id];
      const v = def?.mods?.[key];
      if (v) total += v * st.stacks;
    }
    return total;
  }

  stagger(duration = 0.6) {
    if (this.isPlayer && this.stats && Math.random() < 0.15) return;   // player has poise grace
    this.staggerTimer = Math.max(this.staggerTimer, duration);
    if (this.alive && this.animator.state !== 'death') {
      this.animator.setState('hit', { force: true });
    }
  }

  // ───────────────────────────────────────────────────────── resources
  spendStamina(amount) {
    if (this.stamina < amount) return false;
    this.stamina -= amount;
    this.staminaRegenDelay = 0.65;
    return true;
  }

  spendFocus(amount) {
    if (this.focus < amount) return false;
    this.focus -= amount;
    this.focusRegenDelay = 1.0;
    return true;
  }

  restoreHealth(amount) {
    const mult = 1 + this.statusMod('healing');
    const healed = Math.min(this.maxHealth - this.health, amount * Math.max(0.15, mult));
    this.health += healed;
    return healed;
  }

  // ──────────────────────────────────────────────────────────── update
  update(dt) {
    this.time += dt;
    if (this.invulnerable > 0) this.invulnerable -= dt;
    if (this.staggerTimer > 0) this.staggerTimer -= dt;
    if (this.hitStop > 0) { this.hitStop -= dt; }

    // resource regen
    if (this.staminaRegenDelay > 0) this.staminaRegenDelay -= dt;
    else if (this.stamina < this.maxStamina) {
      this.stamina = Math.min(this.maxStamina, this.stamina + (this.stats?.staminaRegen ?? 14) * dt);
    }
    if (this.focusRegenDelay > 0) this.focusRegenDelay -= dt;
    else if (this.focus < this.maxFocus) {
      const curse = this.statusMod('focusRegen');
      this.focus = Math.min(this.maxFocus, this.focus + (this.stats?.focusRegen ?? 1) * Math.max(0, 1 + curse) * dt);
    }

    this.updateStatuses(dt);
    return this;
  }

  updateStatuses(dt) {
    if (!this.statuses.size) return;
    this._statusAccum += dt;
    const tick = this._statusAccum >= 0.5;
    if (tick) this._statusAccum = 0;
    for (const [id, st] of [...this.statuses]) {
      st.t += dt;
      const def = STATUSES[id];
      if (tick && def?.tick) {
        const dmg = def.tick.perSecond * st.power * st.stacks * 0.5 * (this.stats ? 1 : 1);
        if (dmg > 0 && this.onStatusTick) this.onStatusTick(id, dmg, def.tick.type || 'true', st);
      }
      if (def?.drain) {
        if (def.drain.focus) this.focus = Math.max(0, this.focus - def.drain.focus * dt);
      }
      if (st.t >= st.duration) {
        this.statuses.delete(id);
        if (def?.flee) this.fleeing = false;
      }
    }
  }

  /** Integrate velocity → position, with world collision + ground snapping. */
  move(dt, world, { gravity = -26, snap = true, collide = true } = {}) {
    const v = this.velocity;
    const pos = this.position;

    if (!this.grounded || v.y !== 0) {
      v.y += gravity * dt;
    }
    pos.x += v.x * dt;
    pos.z += v.z * dt;
    pos.y += v.y * dt;

    const ground = world.heightAt(pos.x, pos.z);
    if (collide) {
      const resolved = world.resolveCollisions(pos, this.radius, _tmp);
      pos.x = resolved.x;
      pos.z = resolved.z;
    }
    if (pos.y <= ground) {
      pos.y = ground;
      if (v.y < -8 && this.onHardLanding) this.onHardLanding(-v.y);
      v.y = 0;
      this.grounded = true;
    } else if (pos.y > ground + 0.05) {
      this.grounded = false;
    }
    this.groundY = ground;
    return this;
  }

  faceTowards(x, z, dt, lambda = 12) {
    const dx = x - this.position.x;
    const dz = z - this.position.z;
    if (Math.abs(dx) < 0.001 && Math.abs(dz) < 0.001) return;
    this.targetFacing = Math.atan2(dx, dz);
    this.facing = dampAngle(this.facing, this.targetFacing, lambda, dt);
    this.root.rotation.y = this.facing;
  }

  distanceTo(other) {
    return this.position.distanceTo(other.position ?? other);
  }

  /** True when `pos` is roughly in front of this actor (used for guard arcs). */
  facingTowards(pos, cosLimit = 0.1) {
    const dx = (pos.x ?? 0) - this.position.x;
    const dz = (pos.z ?? 0) - this.position.z;
    const len = Math.hypot(dx, dz) || 1;
    return (Math.sin(this.facing) * dx + Math.cos(this.facing) * dz) / len > cosLimit;
  }

  /** Horizontal distance to a point or actor. */
  flatDistanceTo(other) {
    const p = other.position ?? other;
    return Math.hypot(p.x - this.position.x, p.z - this.position.z);
  }

  /** World position of the chest — used for hit sparks and beams. */
  center(out = new THREE.Vector3()) {
    return out.copy(this.position).add(_up.set(0, this.height * 0.55, 0));
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
      }
    });
    if (Array.isArray(this.rig.materials)) {
      for (const m of this.rig.materials) m.dispose?.();
    } else this.rig.material?.dispose?.();
  }
}

const _tmp = new THREE.Vector3();
const _up = new THREE.Vector3();

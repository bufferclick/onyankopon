import * as THREE from 'three';
import { ABILITY_BY_ID } from '../data/abilities.js';
import { bus, EV } from '../core/EventBus.js';
import { clamp, clamp01, lerp, damp } from '../core/MathUtils.js';

/**
 * AbilitySystem — turns the 37 ability records into actual play.
 *
 * Every ability is: pay cost → cast pose → per-`kind` resolution → effects.
 * Ongoing things (zones, orbitals, channels, summons, decoys) register an
 * `active` object here and are ticked from `update()`.
 */
export class AbilitySystem {
  constructor({ player, fox, combat, vfx, audio, world, projectiles, progression, engine, cameraRig, spawnAlly }) {
    this.player = player;
    this.fox = fox;
    this.combat = combat;
    this.vfx = vfx;
    this.audio = audio;
    this.world = world;
    this.projectiles = projectiles;
    this.progression = progression;
    this.engine = engine;
    this.cameraRig = cameraRig;
    this.spawnAlly = spawnAlly;

    this.cooldowns = new Map();      // id -> seconds remaining
    this.charges = new Map();        // id -> charges left (rank 3 senko etc.)
    this.slots = ['kon', 'kitsunebi', 'iai', 'senko', 'kokonoe', 'onibi', 'pierce', 'hinokagutsuchi'];
    this.actives = [];               // zones/orbitals/channels/summons/decoys
    this.timers = [];                // { t, fn }
    this.casting = null;
    this.echo = null;                // { pct, until }
    this.freeCosts = 0;
    this.lastCast = new Map();
    this.castCount = 0;
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._targets = [];
  }

  // ───────────────────────────────────────────────────────────── helpers
  def(id) {
    return this.progression?.scaledAbility(id) || ABILITY_BY_ID[id];
  }

  cooldown(id) { return Math.max(0, this.cooldowns.get(id) || 0); }
  cooldownPct(id) {
    const d = this.def(id);
    if (!d) return 0;
    const total = d.scaled?.cooldown ?? d.cooldown ?? 6;
    return total > 0 ? clamp01(this.cooldown(id) / total) : 0;
  }

  cost(def) {
    const c = { ...(def.cost || {}) };
    if (this.freeCosts > 0) { c.focus = 0; c.stamina = 0; }
    if (this.progression?.hasFlag('tenko_grace')) {
      if (c.focus) c.focus *= 0.9;
    }
    return c;
  }

  canPay(def) {
    const c = this.cost(def);
    if (c.focus && this.player.focus < c.focus) return false;
    if (c.stamina && this.player.stamina < c.stamina) return false;
    if (c.health && this.player.health <= this.player.maxHealth * c.health + 1) return false;
    return true;
  }

  canCast(id) {
    const def = this.def(id);
    if (!def) return { ok: false, why: 'Unknown' };
    if (!this.progression?.hasAbility(id)) return { ok: false, why: 'Locked' };
    if (this.cooldown(id) > 0) return { ok: false, why: 'Cooldown' };
    if (!this.canPay(def)) return { ok: false, why: 'No resource' };
    if (!this.player.canAct || this.casting) return { ok: false, why: 'Busy' };
    return { ok: true };
  }

  /** Where the ability should go: locked target, else a point down the aim. */
  resolveAim(def) {
    const p = this.player;
    const locked = this.cameraRig?.lockTarget?.alive ? this.cameraRig.lockTarget : null;
    if (locked) return { target: locked, point: locked.position.clone(), dir: this._v.copy(locked.position).sub(p.position).setY(0).normalize().clone() };

    const fwd = this._v2.set(Math.sin(p.facing), 0, Math.cos(p.facing)).clone();
    const range = def.range || 12;
    // prefer the nearest hostile inside a generous forward cone
    let best = null, bestScore = -1;
    for (const a of this.combat.actors) {
      if (!a.alive || a.faction === 'player') continue;
      const to = this._v.copy(a.position).sub(p.position);
      const d = to.length();
      if (d > range + 6) continue;
      to.normalize();
      const dot = to.dot(fwd);
      if (dot < 0.55) continue;
      const score = dot * 2 - d / range;
      if (score > bestScore) { bestScore = score; best = a; }
    }
    const point = best ? best.position.clone() : p.position.clone().addScaledVector(fwd, Math.min(range, 10));
    return { target: best, point, dir: fwd.clone() };
  }

  /** Attribute-weighted damage for an ability record. */
  damageOf(def, scale = 1) {
    const d = def.damage;
    if (!d) return 0;
    const attrs = this.progression?.attributes || {};
    let power = 0;
    for (const [attr, w] of Object.entries(d.scaling || {})) power += (attrs[attr] || 0) * w;
    const rank = def.scaled?.damage ?? 1;
    return (d.base + power * 0.62) * rank * scale;
  }

  wait(seconds) {
    return new Promise((resolve) => {
      if (seconds <= 0) { resolve(); return; }
      this.timers.push({ t: seconds, fn: resolve });
    });
  }

  // ──────────────────────────────────────────────────────────────── cast
  async cast(id, opts = {}) {
    const check = this.canCast(id);
    if (!check.ok) {
      if (check.why !== 'Busy') {
        this.audio?.play('ui_error', { volume: 0.3, bus: 'ui' });
        bus.emit(EV.TOAST, { text: check.why, kind: 'warn' });
      }
      return false;
    }
    const def = this.def(id);
    const c = this.cost(def);
    if (c.focus) this.player.focus -= c.focus;
    if (c.stamina) { this.player.stamina -= c.stamina; this.player.staminaRegenDelay = 0.5; }
    if (c.health) {
      const amount = this.player.maxHealth * c.health;
      this.combat.trueDamage(this.player, amount * 0.35, null, { silent: true });
      this.vfx.hitSpray(this.player.center(new THREE.Vector3()), this._v.set(0, 1, 0), { color: 0xc8443c, count: 16, power: 1.2 });
    }

    this.casting = id;
    this.castCount++;
    this.cooldowns.set(id, (def.scaled?.cooldown ?? def.cooldown ?? 6) * (this.progression?.hasFlag('kuda_quick') ? 0.88 : 1));
    bus.emit(EV.ABILITY_USED, { id, def });

    const aim = this.resolveAim(def);
    const castTime = (def.cast || 0.2) / clamp(this.player.stats.attackSpeed || 1, 0.6, 2.2);

    // pose + pre-cast effects
    this.#pose(def);
    this.#preEffects(def, aim);

    await this.wait(castTime);
    if (!this.player.alive) { this.casting = null; return false; }

    await this.#resolve(id, def, aim, opts);
    this.#postEffects(def, aim);
    this.casting = null;
    return true;
  }

  #pose(def) {
    const p = this.player;
    if (['summon', 'orbital'].includes(def.kind)) p.playSummonPose(def.cast + 0.4);
    else if (['channel', 'buff', 'transform'].includes(def.kind)) p.playSummonPose(def.cast + 0.3);
    else if (['melee', 'dash', 'leap', 'execute'].includes(def.kind)) p.playCastPose(def.cast + 0.35);
    else p.playCastPose(def.cast + 0.25);
  }

  #preEffects(def, aim) {
    if (def.effects) {
      for (const e of def.effects) {
        if (e.k === 'iframes') this.player.invulnerable = Math.max(this.player.invulnerable, e.duration || 0.3);
        if (e.k === 'moveSpeed') this.player.progression.addBuff(`mv_${def.id}`, { mods: { statMul: { moveSpeed: e.mult - 1 } }, duration: def.duration || 1 });
        if (e.k === 'poise') this.player.poise = this.player.poiseMax * e.mult;
        if (e.k === 'transform') this.player.setDevilForm(true);
      }
    }
    if (def.sfx?.[0]) this.audio.play(def.sfx[0], { volume: 0.65, position: this.player.position });
  }

  #postEffects(def, aim) {
    if (def.sfx?.[1]) this.audio.play(def.sfx[1], { volume: 0.7, position: aim.point });
  }

  // ──────────────────────────────────────────────────────────── dispatch
  async #resolve(id, def, aim, opts) {
    const fn = this[`kind_${def.kind}`];
    if (typeof fn !== 'function') {
      console.warn('[abilities] unhandled kind', def.kind, id);
      return;
    }
    await fn.call(this, def, aim, opts);
  }

  // ───────────────────────────────────────────────────────────── kinds ──
  async kind_leap(def, aim) {
    const p = this.player;
    const konHead = def.effects?.find((e) => e.k === 'konHead');
    const heal = def.effects?.find((e) => e.k === 'heal');
    const knock = def.effects?.find((e) => e.k === 'knockdown');
    const radius = (def.radius || 3) * (def.scaled?.radius ?? 1);
    const dmg = this.damageOf(def);

    if (konHead && this.fox) {
      const heads = def.scaled?.rank >= 5 ? 3 : def.scaled?.rank >= 3 ? 2 : 1;
      for (let i = 0; i < heads; i++) {
        const at = aim.target
          ? aim.target.position.clone().add(new THREE.Vector3((i - (heads - 1) / 2) * 1.8, 0, 0))
          : aim.point.clone();
        at.y = this.world.heightAt(at.x, at.z);
        this.fox.kon({
          at, target: aim.target, scale: konHead.scale || 1,
          devour: !!def.effects.find((e) => e.k === 'heal' && e.pctOfDamage),
          onBite: (biteAt) => {
            const hits = this.combat.radial(biteAt, {
              radius, damage: dmg, type: def.damage?.type || 'spirit', source: this.player,
              statuses: def.status, falloff: false,
            });
            let total = 0;
            for (const h of hits) {
              total += h.damage;
              if (knock && Math.random() < (knock.chance || 0.3)) {
                h.actor.velocity.y += 5;
                h.actor.stagger(1.3);
              }
            }
            if (heal?.pctOfDamage) this.player.restoreHealth(total * heal.pctOfDamage);
            if (heal?.pctOfMax) this.player.restoreHealth(this.player.maxHealth * heal.pctOfMax);
            this.engine?.shake(def.vfx?.shake || 0.6);
          },
        });
        if (i < heads - 1) await this.wait(0.16);
      }
      await this.wait(0.75);
      return;
    }

    // non-fox leaps: byakko_pounce / shinra — the player vaults to the point
    const from = p.position.clone();
    const to = aim.point.clone();
    to.y = this.world.heightAt(to.x, to.z);
    p.faceTowards(to.x, to.z, 1, 40);
    this.audio.play(def.sfx?.[0] || 'jump', { volume: 0.7, position: from });
    await this.#hop(from, to, 0.42, 3.2);
    const hits = this.combat.radial(to, {
      radius, damage: this.damageOf(def), type: def.damage?.type || 'physical',
      source: this.player, statuses: def.status,
    });
    for (const h of hits) {
      const kd = def.effects?.find((e) => e.k === 'knockdown');
      if (kd && Math.random() < (kd.chance || 0.4)) { h.actor.velocity.y += 5; h.actor.stagger(1.4); }
    }
    this.vfx.shockwave(to, { radius: radius * 1.4, color: def.vfx?.color ?? 0xffbe4a, dur: 0.55 });
    this.engine?.shake(0.7);
  }

  async kind_melee(def, aim) {
    // mikuzure: a flurry of claw rakes while stepping forward
    const p = this.player;
    const hits = def.hits || 5;
    const tick = def.tickInterval || 0.09;
    const dmg = this.damageOf(def);
    for (let i = 0; i < hits; i++) {
      if (!p.alive) break;
      const t = aim.target?.alive ? aim.target : this.combat.nearestHostile(p.position, 'player', def.range || 8, p.facing, 0.2);
      if (t) p.faceTowards(t.position.x, t.position.z, 1, 30);
      const origin = p.position.clone().addScaledVector(this._v.set(Math.sin(p.facing), 0, Math.cos(p.facing)), 1.1);
      const at = origin.clone().addScaledVector(this._v.set(Math.sin(p.facing), 0, Math.cos(p.facing)), (def.radius || 3) * 0.5);
      at.y += 1.0;
      this.vfx.slashArc(at, p.facing + (i % 2 ? 0.7 : -0.7), { radius: def.radius || 3, color: def.vfx?.color ?? 0xff9a3a, dur: 0.18, tilt: 0.9 });
      this.combat.cone(origin, this._v.set(Math.sin(p.facing), 0, Math.cos(p.facing)), {
        range: (def.radius || 3) + 1.2, angle: 110, damage: dmg, type: def.damage?.type || 'spirit',
        source: this.player, statuses: def.status,
      });
      this.audio.play(def.sfx?.[1] || 'claw_slash', { volume: 0.45, pitch: i * 0.8, position: p.position });
      await this.wait(tick);
    }
  }

  async kind_projectile(def, aim) {
    const p = this.player;
    const dmg = this.damageOf(def);
    const from = p.position.clone().add(this._v.set(0, 1.2, 0)).addScaledVector(aim.dir, 0.8);
    const count = def.id === 'kitsunebi' && (def.scaled?.rank || 1) >= 4 ? 3 : 1;
    for (let i = 0; i < count; i++) {
      const dir = count === 1 ? aim.dir.clone()
        : aim.dir.clone().applyAxisAngle(UP, (i - (count - 1) / 2) * 0.24);
      this.projectiles.spawn({
        owner: p, faction: 'player', position: from, direction: dir,
        speed: def.speed || 26, damage: dmg, type: def.damage?.type || 'fire',
        statuses: def.status, shape: def.vfx?.shape === 'drill' ? 'shard' : 'fireball',
        color: def.vfx?.color ?? 0x63d6ff, homing: def.homing || 0, scale: def.vfx?.shape === 'drill' ? 1.4 : 1,
        life: 3, spin: def.vfx?.shape === 'drill' ? 22 : 6, sfx: def.sfx?.[0],
        onExpire: def.id === 'okuri_inu' ? (pr) => {
          this.combat.radial(pr.position, {
            radius: def.radius || 2.6, damage: dmg * 0.8, type: def.damage?.type || 'spirit',
            source: p, statuses: def.status,
          });
          this.vfx.shockwave(pr.position, { radius: def.radius || 2.6, color: def.vfx?.color ?? 0x8ad8ff, dur: 0.4 });
        } : null,
      });
    }
  }

  async kind_beam(def, aim) {
    const p = this.player;
    const dmg = this.damageOf(def);
    const from = p.position.clone().add(this._v.set(0, 1.15, 0));
    const to = aim.point.clone().addScaledVector(aim.dir, def.range || 20);
    to.y = this.world.heightAt(to.x, to.z) + 1.1;
    if (aim.target) to.copy(aim.target.center(new THREE.Vector3()));
    this.vfx.beam(from, to, { color: def.vfx?.color ?? 0xbfe6ff, width: (def.radius || 1.5) * 0.7, dur: 0.35 });
    const hits = def.id === 'pierce' && (def.scaled?.rank || 1) >= 4
      ? this.combat.line(from, to, { width: def.radius || 1.2, damage: dmg, type: def.damage?.type || 'physical', source: p, statuses: def.status })
      : this.combat.line(from, to, { width: def.radius || 1.2, damage: dmg, type: def.damage?.type || 'physical', source: p, statuses: def.status });
    for (const h of hits) {
      if (def.effects?.find((e) => e.k === 'armorPen')) {
        this.combat.trueDamage(h.actor, dmg * (def.effects.find((e) => e.k === 'armorPen').pct || 0.3), p, { type: def.damage?.type });
      }
    }
    this.audio.play(def.sfx?.[1] || def.sfx?.[0] || 'moon_slash', { volume: 0.7, position: from });
    // kamaitachi: three delayed slashes
    const extra = def.hits && def.hits > 1 ? def.hits - 1 : 0;
    for (let i = 1; i <= extra; i++) {
      await this.wait(def.tickInterval || 0.16);
      const t2 = aim.target?.alive ? aim.target.center(new THREE.Vector3()) : to;
      this.vfx.beam(from, t2, { color: def.vfx?.color ?? 0xbfe6ff, width: (def.radius || 1.5) * 0.6, dur: 0.25 });
      this.combat.line(from, t2, { width: def.radius || 1.5, damage: dmg * 0.8, type: def.damage?.type || 'physical', source: p });
    }
  }

  async kind_cone(def, aim) {
    const p = this.player;
    const from = p.position.clone().add(this._v.set(0, 1.1, 0));
    const hits = def.hits || 4;
    const dmg = this.damageOf(def);
    for (let i = 0; i < hits; i++) {
      const dir = aim.dir.clone();
      if (aim.target?.alive) dir.copy(this._v.copy(aim.target.position).sub(from).setY(0).normalize());
      this.vfx.beam(from, from.clone().addScaledVector(dir, def.range || 22), {
        color: def.vfx?.color ?? 0xff7a2a, width: (def.radius || 6) * 0.55, dur: 0.22,
      });
      this.combat.cone(from, dir, {
        range: def.range || 22, angle: 46, damage: dmg, type: def.damage?.type || 'fire',
        source: p, statuses: def.status,
      });
      this.audio.play(def.sfx?.[0] || 'dragon_fire', { volume: 0.5, position: from });
      await this.wait(def.tickInterval || 0.2);
    }
    if ((def.scaled?.rank || 1) >= 4) {
      this.vfx.firePatch(aim.point, def.radius || 6, 8);
    }
  }

  async kind_aoe(def, aim) {
    const p = this.player;
    const radius = (def.radius || 5) * (def.scaled?.radius ?? 1);
    const dmg = this.damageOf(def);
    const hits = def.hits || 1;
    const tick = def.tickInterval || 0;

    if (def.id === 'raijin_tail') {
      // chain lightning: jump between victims
      let from = p.position.clone();
      const struck = new Set();
      for (let i = 0; i < (def.hits || 6); i++) {
        const next = this.combat.actors
          .filter((a) => a.alive && a.faction === 'enemy' && !struck.has(a) && a.position.distanceTo(from) < (def.range || 30))
          .sort((a, b) => a.position.distanceTo(from) - b.position.distanceTo(from))[0];
        if (!next) break;
        struck.add(next);
        this.vfx.lightning(from.clone().setY(from.y + 1.2), next.center(new THREE.Vector3()), { color: def.vfx?.color ?? 0xa8d8ff, dur: 0.24 });
        this.combat.resolveAttack(p, next, {
          damage: dmg, type: 'shock', statuses: def.status, position: next.center(new THREE.Vector3()),
        });
        this.audio.play('lightning_crack', { volume: 0.5, position: next.position });
        from = next.position.clone();
        await this.wait(0.09);
      }
      return;
    }

    if (def.id === 'hinokagutsuchi') {
      for (let i = 0; i < 3; i++) {
        const at = aim.point.clone().add(new THREE.Vector3((i - 1) * 3.2, 0, 0));
        at.y = this.world.heightAt(at.x, at.z);
        this.vfx.flamePillar(at, { color: 0xff6a2a, height: 13, radius: def.radius || 5, dur: 0.9 });
        this.combat.radial(at, { radius, damage: dmg, type: 'fire', source: p, statuses: def.status });
        this.audio.play('flame_pillar', { volume: 0.8, position: at });
        await this.wait(0.16);
      }
      this.vfx.firePatch(aim.point, def.radius || 5, 6);
      return;
    }

    for (let i = 0; i < hits; i++) {
      this.vfx.shockwave(p.position, {
        radius, color: def.vfx?.color ?? 0xffbe4a, dur: 0.5, opacity: 0.85,
      });
      if (def.id === 'kokonoe') {
        const a0 = (i / hits) * Math.PI * 2;
        this.combat.radial(p.position, { radius, damage: dmg, type: def.damage?.type || 'physical', source: p, statuses: def.status });
        for (let t = 0; t < 9; t++) {
          const ang = a0 + (t / 9) * Math.PI * 2;
          this.vfx.slashArc(p.position.clone().setY(p.position.y + 0.9), ang, { radius, color: 0xffbe4a, dur: 0.3, tilt: 0.2 });
        }
      } else if (def.id === 'crescent') {
        const fwd = this._v.set(Math.sin(p.facing), 0, Math.cos(p.facing));
        this.combat.cone(p.position, fwd, { range: radius + 1, angle: 300, damage: dmg, type: def.damage?.type || 'physical', source: p, statuses: def.status });
        this.vfx.slashArc(p.position.clone().setY(p.position.y + 1.0), p.facing, { radius: radius * 1.1, color: def.vfx?.color ?? 0xe8f0ff, dur: 0.35, width: 1.1, tilt: 0.1 });
      } else {
        this.combat.radial(p.position, { radius, damage: dmg, type: def.damage?.type || 'physical', source: p, statuses: def.status });
      }
      this.audio.play(def.sfx?.[1] || def.sfx?.[0] || 'tail_sweep', { volume: 0.6, position: p.position });
      for (const e of def.effects || []) {
        if (e.k === 'knockback') {
          for (const a of this.combat.actors) {
            if (a.faction === 'enemy' && a.alive && a.flatDistanceTo(p) < radius + 1) {
              a.velocity.add(this._v.copy(a.position).sub(p.position).setY(0).normalize().multiplyScalar(e.strength || 5));
            }
          }
        }
        if (e.k === 'guardBreak') {
          for (const a of this.combat.actors) {
            if (a.faction === 'enemy' && a.alive && a.flatDistanceTo(p) < radius + 1) { a.poise = 0; a.stagger(1.5); a.blocking = false; }
          }
        }
      }
      if (tick) await this.wait(tick);
    }
  }

  async kind_zone(def, aim) {
    const p = this.player;
    const radius = (def.radius || 5) * (def.scaled?.radius ?? 1);
    const at = aim.point.clone();
    at.y = this.world.heightAt(at.x, at.z);
    const duration = def.scaled?.duration || def.duration || 12;
    const dmg = this.damageOf(def);
    const isHeal = def.id === 'sogen';
    const isLantern = def.id === 'tamayura';
    const isDark = def.id === 'kurayami';

    if (isLantern) {
      this.vfx.orb(at.clone().setY(at.y + 0.9), { color: def.vfx?.color ?? 0xffd08a, radius: 0.7, dur: 0.6 });
      this.audio.play('lantern_place', { volume: 0.6, position: at });
    }
    this.vfx.zone(at, radius, {
      color: isDark ? 0x120c18 : isHeal ? 0x1e2a1a : 0x2a1810, dur: duration, height: isDark ? 5 : 2.2, opacity: isDark ? 0.75 : 0.4,
    });
    if (isHeal) this.audio.play('grass_grow', { volume: 0.6, position: at });
    if (isDark) this.audio.play('darkness_cast', { volume: 0.8, position: at });

    let tickAccum = 0;
    const zone = {
      t: 0, duration, radius, at: at.clone(), def,
      update: (dt) => {
        zone.t += dt;
        tickAccum += dt;
        const interval = def.tickInterval || 1.0;
        if (tickAccum >= interval) {
          tickAccum = 0;
          if (isHeal) {
            if (p.alive && p.flatDistanceTo(at) < radius) {
              p.restoreHealth(p.maxHealth * (def.effects?.find((e) => e.k === 'healZone')?.pctPerTick || 0.012));
              this.vfx.trail(p.position, this._v.set(0, 1, 0), { color: 0x8fd18a, size: 0.3, life: 0.6, speed: 1.4 });
            }
            this.combat.radial(at, { radius, damage: dmg, type: 'physical', source: p });
          } else if (isDark) {
            for (const a of this.combat.actors) {
              if (a.faction !== 'enemy' || !a.alive) continue;
              if (a.flatDistanceTo(at) < radius) {
                a.addStatus('blind', { duration: 2.5 });
                a.addStatus('slow', { duration: 2.5 });
                if ((def.scaled?.rank || 1) >= 3 && p.alive && p.flatDistanceTo(at) < radius) {
                  p.restoreHealth(p.maxHealth * 0.008);
                }
              }
            }
            if (def.effects?.find((e) => e.k === 'critUp') && p.flatDistanceTo(at) < radius) {
              this.#tmpBuff('kurayami_crit', { statMul: { critChance: 25 } }, 1.5);
            }
          } else if (isLantern) {
            this.combat.radial(at, { radius, damage: dmg * 0.35, type: 'spirit', source: p });
            this.vfx.trail(at.clone().setY(at.y + 0.9), this._v.set(0, 0.5, 0), { color: 0xffd08a, size: 0.25, life: 0.8, speed: 0.6 });
          }
        }
        // crit bonus while standing in our own darkness
        return zone.t < duration;
      },
    };
    this.actives.push(zone);
  }

  async kind_orbital(def, aim) {
    const p = this.player;
    const count = 3 + ((def.scaled?.rank || 1) >= 5 ? 2 : (def.scaled?.rank || 1) >= 3 ? 1 : 0);
    const duration = def.scaled?.duration || def.duration || 16;
    const radius = def.radius || 2;
    const orbitR = def.vfx?.orbit || 3.4;
    const dmg = this.damageOf(def);
    this.audio.play(def.sfx?.[0] || 'spirit_cast', { volume: 0.7, position: p.position });

    const wisps = [];
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 10, 8),
        new THREE.MeshBasicMaterial({ color: def.vfx?.color ?? 0x8fe3ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      this.vfx.scene?.add(mesh);
      wisps.push({ mesh, a: (i / count) * Math.PI * 2, hit: new Map() });
    }
    let tick = 0;
    const orb = {
      t: 0, duration,
      update: (dt) => {
        orb.t += dt;
        tick += dt;
        for (const w of wisps) {
          w.a += dt * 1.9;
          w.mesh.position.set(
            p.position.x + Math.cos(w.a) * orbitR,
            p.position.y + 1.0 + Math.sin(w.a * 1.7) * 0.25,
            p.position.z + Math.sin(w.a) * orbitR,
          );
          if (tick >= (def.tickInterval || 0.9)) {
            for (const a of this.combat.actors) {
              if (!a.alive || a.faction === 'player') continue;
              if (a.position.distanceTo(w.mesh.position) < radius) {
                const last = w.hit.get(a) || -99;
                if (orb.t - last < (def.tickInterval || 0.9)) continue;
                w.hit.set(a, orb.t);
                this.combat.resolveAttack(p, a, {
                  damage: dmg, type: def.damage?.type || 'spirit', statuses: def.status,
                  position: a.center(new THREE.Vector3()),
                });
                this.audio.play(def.sfx?.[1] || 'wisp_hit', { volume: 0.4, position: a.position });
              }
            }
          }
          this.vfx.trail(w.mesh.position, this._v.set(0, -0.3, 0), { color: def.vfx?.color ?? 0x8fe3ff, size: 0.2, life: 0.3 });
        }
        if (tick >= (def.tickInterval || 0.9)) tick = 0;
        return orb.t < duration;
      },
      dispose: () => {
        for (const w of wisps) { w.mesh.removeFromParent(); w.mesh.geometry.dispose(); w.mesh.material.dispose(); }
      },
    };
    this.actives.push(orb);
  }

  async kind_channel(def, aim) {
    const p = this.player;
    const duration = def.scaled?.duration || def.duration || 2;
    const radius = (def.radius || 4) * (def.scaled?.radius ?? 1);
    const dmg = this.damageOf(def);
    const hits = def.hits || 6;
    const interval = duration / hits;
    const isDance = def.id === 'kagura';

    this.audio.play(def.sfx?.[0] || 'kagura_loop', { volume: 0.6, position: p.position, loop: false });
    const chan = {
      t: 0, duration, acc: 0, i: 0,
      update: (dt) => {
        chan.t += dt;
        chan.acc += dt;
        if (isDance) {
          p.facing += dt * 5.5;
          p.root.rotation.y = p.facing;
          if (Math.random() < dt * 14) {
            this.vfx.trail(p.position.clone().setY(p.position.y + 0.6), this._v.set(0, 1, 0), {
              color: def.vfx?.color ?? 0xff7a2a, size: 0.35, life: 0.5, speed: 1.2,
            });
          }
        }
        if (chan.acc >= interval) {
          chan.acc = 0;
          chan.i++;
          this.combat.radial(p.position, {
            radius, damage: dmg, type: def.damage?.type || 'physical', source: p, statuses: def.status, falloff: false,
          });
          if (def.id === 'whirlwind') {
            this.vfx.slashArc(p.position.clone().setY(p.position.y + 1.0), p.facing + chan.i * 0.8, { radius: radius * 1.1, color: 0xe8f0ff, dur: 0.22, tilt: 0.15 });
          } else {
            this.vfx.shockwave(p.position, { radius: radius * 0.8, color: def.vfx?.color ?? 0xff7a2a, dur: 0.35, opacity: 0.6 });
          }
          this.audio.play(def.sfx?.[1] || 'hit_flesh', { volume: 0.35, position: p.position });
          if (isDance && (def.scaled?.rank || 1) >= 3) p.restoreHealth(p.maxHealth * 0.02);
        }
        return chan.t < duration;
      },
    };
    this.actives.push(chan);
    await this.wait(duration * 0.35);
  }

  async kind_dash(def, aim) {
    // iai: a draw-cut that passes through the target, with a counter stance
    const p = this.player;
    const from = p.position.clone();
    const to = aim.target?.alive
      ? aim.target.position.clone().addScaledVector(aim.dir, -1.6)
      : from.clone().addScaledVector(aim.dir, def.range || 12);
    to.y = this.world.heightAt(to.x, to.z);
    p.invulnerable = Math.max(p.invulnerable, 0.35);
    this.audio.play('draw_blade', { volume: 0.8, position: from });
    this.audio.play('slice', { volume: 0.6, position: from, delay: 0.12 });
    await this.#hop(from, to, 0.22, 0.4);
    const mid = from.clone().lerp(to, 0.6);
    this.vfx.slashArc(mid.setY(mid.y + 1.05), p.facing, { radius: (def.radius || 2.4) + 1.4, color: 0xffffff, dur: 0.3, width: 0.9, tilt: 0.05 });
    this.combat.line(from.clone().setY(1.0), to.clone().setY(1.0), {
      width: def.radius || 2.4, damage: this.damageOf(def), type: def.damage?.type || 'physical', source: p, statuses: def.status,
    });
    // counter window
    const counter = def.effects?.find((e) => e.k === 'counter');
    if (counter) {
      const window = (counter.window || 0.35) + ((def.scaled?.rank || 1) >= 4 ? 0.2 : 0);
      p.counterWindow = window;
      this.vfx.aura(p.position, { color: 0xbfe6ff, size: 1.6, dur: window });
    }
  }

  async kind_teleport(def, aim) {
    const p = this.player;
    const from = p.position.clone();
    this.vfx.summonCircle(from, { color: def.vfx?.color ?? 0x9be8ff, radius: 2, dur: 0.4 });
    this.audio.play(def.sfx?.[0] || 'blink', { volume: 0.7, position: from });
    let to;
    if (def.effects?.find((e) => e.k === 'behind') && aim.target?.alive) {
      const t = aim.target;
      to = t.position.clone().addScaledVector(this._v.set(Math.sin(t.facing), 0, Math.cos(t.facing)), -1.5);
      p.faceTowards(t.position.x, t.position.z, 1, 60);
    } else {
      to = from.clone().addScaledVector(aim.dir, def.range || 16);
    }
    to.y = this.world.heightAt(to.x, to.z);
    // don't blink into a wall of rock
    if (Math.abs(to.y - from.y) > 6) to.copy(from);
    p.position.copy(to);
    p.velocity.set(0, 0, 0);
    this.vfx.burst(from, 22, { color: [def.vfx?.color ?? 0x9be8ff, 0xffffff], speed: 8, size: 0.45, life: 0.45 });
    this.vfx.burst(to, 22, { color: [def.vfx?.color ?? 0x9be8ff, 0xffffff], speed: 8, size: 0.45, life: 0.45 });
    this.engine?.aberration(0.6);
    this.audio.play('blink', { volume: 0.6, position: to });

    const leaveFire = def.effects?.find((e) => e.k === 'leaveFire');
    if (leaveFire) {
      this.vfx.firePatch(from, leaveFire.radius || 3, leaveFire.duration || 4);
      this.combat.radial(from, { radius: leaveFire.radius || 3, damage: this.damageOf(def), type: 'fire', source: p, statuses: def.status });
    }
    const crit = def.effects?.find((e) => e.k === 'guaranteedCrit');
    if (crit) {
      const t = aim.target?.alive ? aim.target : this.combat.nearestHostile(p.position, 'player', 4, p.facing, 0.3);
      if (t) {
        const res = this.combat.resolveAttack(p, t, {
          damage: this.damageOf(def), type: def.damage?.type || 'physical', forcedCrit: true,
          position: t.center(new THREE.Vector3()), direction: this._v.copy(t.position).sub(p.position).setY(0).normalize(),
        });
        this.vfx.slashArc(t.position.clone().setY(t.position.y + 1.0), p.facing, { radius: 2.6, color: 0xffffff, dur: 0.28, tilt: 0.9 });
        this.audio.play('shadow_step', { volume: 0.7, position: t.position });
        if (res.damage > 0) this.engine?.hitStop(0.08);
      }
    }
  }

  async kind_summon(def, aim) {
    const p = this.player;
    const eff = def.effects?.find((e) => e.k === 'summon');
    const duration = def.scaled?.duration || def.duration || 20;
    const count = (eff?.count || 1) + ((def.scaled?.rank || 1) >= 5 ? 2 : (def.scaled?.rank || 1) >= 3 ? 1 : 0);
    this.audio.play('summon_circle', { volume: 0.8, position: p.position });
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const at = p.position.clone().add(new THREE.Vector3(Math.cos(a) * 3.4, 0, Math.sin(a) * 3.4));
      at.y = this.world.heightAt(at.x, at.z);
      this.vfx.summonCircle(at, { color: def.vfx?.color ?? 0xffa53c, radius: 2, dur: 0.9 });
      const ally = this.spawnAlly?.(eff?.id === 'scout_fox' ? 'scout' : 'spirit_fox', at, duration, this.damageOf(def));
      if (ally) {
        this.actives.push({
          t: 0, duration,
          update: (dt) => { this.vfx.trail(ally.position.clone().setY(ally.position.y + 0.4), this._v.set(0, 0.6, 0), { color: def.vfx?.color ?? 0xffa53c, size: 0.22, life: 0.35 }); return false; },
        });
      }
      await this.wait(0.12);
    }
  }

  async kind_mark(def, aim) {
    const t = aim.target;
    const eff = def.effects?.find((e) => e.k === 'damageTakenUp');
    if (!t) { bus.emit(EV.TOAST, { text: 'No target', kind: 'warn' }); return; }
    t.addStatus('marked', { duration: def.scaled?.duration || def.duration || 18, power: 1 });
    t.markBonus = (eff?.pct || 0.35) * (1 + ((def.scaled?.rank || 1) - 1) * 0.12);
    this.vfx.summonCircle(t.position, { color: 0xff9a3a, radius: 1.6, dur: 0.8 });
    this.vfx.beam(this.player.center(new THREE.Vector3()), t.center(new THREE.Vector3()), { color: 0xff9a3a, width: 0.4, dur: 0.4 });
    this.audio.play('mark_hit', { volume: 0.8, position: t.position });
    bus.emit(EV.TOAST, { text: `${t.name} marked`, kind: 'good' });
  }

  async kind_debuff(def, aim) {
    const t = aim.target;
    if (!t) return;
    this.vfx.beam(this.player.center(new THREE.Vector3()), t.center(new THREE.Vector3()), { color: 0x8a4bd8, width: 0.7, dur: 0.6 });
    this.audio.play('possess_cast', { volume: 0.85, position: t.position });
    t.addStatus('possessed', { duration: def.scaled?.duration || def.duration || 14, power: 1 });
    t.leader = this.player;
    const dmg = this.damageOf(def);
    this.combat.applyDamage(t, { amount: dmg, type: 'spirit', source: this.player });
    bus.emit(EV.TOAST, { text: `${t.name} is yours`, kind: 'good' });
  }

  async kind_pull(def, aim) {
    const p = this.player;
    const at = aim.point.clone();
    at.y = this.world.heightAt(at.x, at.z);
    const radius = (def.radius || 9) * (def.scaled?.radius ?? 1);
    this.vfx.zone(at, radius, { color: 0x2a0f3a, dur: def.duration || 3, height: 0.2, opacity: 0.7 });
    this.vfx.summonCircle(at, { color: 0x8a4bd8, radius: radius * 0.6, dur: 1 });
    this.audio.play('void_open', { volume: 0.9, position: at });
    const duration = def.duration || 3;
    const hits = def.hits || 6;
    const interval = duration / hits;
    const dmg = this.damageOf(def);
    let acc = 0;
    const rift = {
      t: 0, duration,
      update: (dt) => {
        rift.t += dt;
        acc += dt;
        for (const a of this.combat.actors) {
          if (!a.alive || a.faction === 'player') continue;
          const d = a.flatDistanceTo(at);
          if (d > radius) continue;
          const pull = this._v.copy(at).sub(a.position).setY(0).normalize().multiplyScalar((def.effects?.find((e) => e.k === 'pull')?.strength || 10) * dt * (1 - d / radius));
          a.velocity.add(pull);
        }
        if (acc >= interval) {
          acc = 0;
          this.combat.radial(at, { radius, damage: dmg, type: 'void', source: p, falloff: false });
          this.vfx.shockwave(at, { radius: radius * 0.7, color: 0x8a4bd8, dur: 0.4, opacity: 0.6 });
        }
        return rift.t < duration;
      },
    };
    this.actives.push(rift);
  }

  async kind_buff(def, aim) {
    const p = this.player;
    for (const e of def.effects || []) {
      if (e.k === 'buffStat') {
        this.#tmpBuff(`buff_${def.id}_${e.stat}`, { statMul: { [e.stat]: e.pct } }, e.duration || def.duration || 15);
      }
      if (e.k === 'echoNext') {
        this.echo = { pct: e.pct, delay: e.delay || 0.5, until: performance.now() / 1000 + 10, used: 0, max: (def.scaled?.rank || 1) >= 4 ? 2 : 1 };
        this.vfx.aura(p.position, { color: 0xbfe6ff, size: 2.4, dur: 0.8 });
      }
      if (e.k === 'freeCosts') this.freeCosts = e.duration || 15;
    }
    if (def.id === 'contract_sacrifice') {
      const lost = p.maxHealth * (def.cost?.health || 0.2);
      p.restoreHealth(-lost);
      this.vfx.burst(p.center(new THREE.Vector3()), 30, { color: [0xc8443c, 0x8a4bd8], speed: 7, size: 0.5, life: 0.7 });
      this.audio.play('sacrifice', { volume: 0.9, position: p.position });
      p.addStatus('sacrifice', { duration: 15, power: 1 });
      this.engine?.flashDamage(0.6);
    }
    this.vfx.aura(p.position, { color: def.vfx?.color ?? 0xffd08a, size: 2.6, dur: 0.9 });
    this.audio.play('buff_apply', { volume: 0.7, position: p.position });
    this.audio.play(def.sfx?.[0] || 'buff_apply', { volume: 0.5, position: p.position });
    bus.emit(EV.TOAST, { text: def.name, kind: 'good' });
  }

  async kind_transform(def, aim) {
    const p = this.player;
    p.setDevilForm(true);
    const radius = def.radius || 16;
    this.vfx.shockwave(p.position, { radius, color: 0xff2e2e, dur: 1.1, opacity: 1 });
    this.vfx.burst(p.center(new THREE.Vector3()), 60, { color: [0xff2e2e, 0x8a4bd8, 0xffffff], speed: 14, size: 0.7, life: 0.9 });
    this.audio.play('onryo_release', { volume: 1, position: p.position });
    this.audio.play('roar_boss', { volume: 0.8, position: p.position, delay: 0.2 });
    this.engine?.shake(1.4);
    this.engine?.aberration(2);
    this.engine?.radialBlur(1.5);
    this.combat.radial(p.position, {
      radius, damage: this.damageOf(def), type: 'void', source: p,
      statuses: [{ type: 'terrified', chance: 1, duration: 6 }],
    });
    const mult = def.effects?.find((e) => e.k === 'damageMult');
    if (mult) this.#tmpBuff('onryo_mult', { statMul: { spiritPower: mult.mult, physicalPower: mult.mult } }, mult.duration || 20);
    if ((def.scaled?.rank || 1) >= 3) {
      await this.wait(1.2);
      this.combat.radial(p.position, { radius: radius * 0.7, damage: this.damageOf(def) * 0.5, type: 'void', source: p });
    }
  }

  async kind_execute(def, aim) {
    const p = this.player;
    let t = aim.target;
    if (!t || t.healthPct > 0.24) {
      t = this.combat.actors.filter((a) => a.alive && a.faction === 'enemy' && a.flatDistanceTo(p) < (def.range || 10))
        .sort((a, b) => a.healthPct - b.healthPct)[0];
    }
    if (!t || t.healthPct > 0.3) {
      bus.emit(EV.TOAST, { text: 'No dying target', kind: 'warn' });
      return;
    }
    p.faceTowards(t.position.x, t.position.z, 1, 40);
    const at = t.position.clone();
    if (this.fox) {
      await this.fox.kon({
        at, target: t, scale: def.effects?.find((e) => e.k === 'konHead')?.scale || 1.8, devour: true,
        onBite: () => {
          this.combat.trueDamage(t, this.damageOf(def), p, { type: 'void' });
          const heal = def.effects?.find((e) => e.k === 'heal');
          if (heal?.pctOfMax) p.restoreHealth(p.maxHealth * heal.pctOfMax);
          if (t.alive && t.healthPct <= 0.3) this.combat.execute(t, p);
        },
      });
    } else {
      this.combat.trueDamage(t, this.damageOf(def), p, { type: 'void' });
      if (t.alive && t.healthPct <= 0.35) this.combat.execute(t, p);
    }
    this.engine?.shake(1.2);
  }

  async kind_multi(def, aim) {
    // kuzu_no_hoko: a line of slams walking toward the aim point
    const p = this.player;
    const hits = def.hits || 6;
    const dmg = this.damageOf(def);
    const step = (def.range || 30) / hits;
    for (let i = 0; i < hits; i++) {
      const at = p.position.clone().addScaledVector(aim.dir, step * (i + 1));
      at.y = this.world.heightAt(at.x, at.z);
      this.vfx.shockwave(at, { radius: def.radius || 4.2, color: def.vfx?.color ?? 0xffd08a, dur: 0.5 });
      this.vfx.burst(at, 18, { color: [0xd8c8a8, 0xffffff], speed: 8, size: 0.5, life: 0.5, gravity: -14 });
      this.audio.play('heavy_impact', { volume: 0.7, position: at });
      this.combat.radial(at, { radius: def.radius || 4.2, damage: dmg, type: def.damage?.type || 'physical', source: p, statuses: def.status });
      if (i === hits - 1) {
        for (const a of this.combat.actors) {
          if (a.faction === 'enemy' && a.alive && a.flatDistanceTo(at) < (def.radius || 4.2) + 1) {
            a.velocity.y += 5; a.stagger(1.5);
          }
        }
      }
      this.engine?.shake(0.4);
      await this.wait(def.tickInterval || 0.3);
    }
  }

  async kind_decoy(def, aim) {
    const p = this.player;
    const at = p.position.clone().addScaledVector(aim.dir, 3);
    at.y = this.world.heightAt(at.x, at.z);
    this.vfx.summonCircle(at, { color: def.vfx?.color ?? 0xd8e0f0, radius: 2, dur: 0.8 });
    this.audio.play('mirror_cast', { volume: 0.8, position: at });
    const duration = def.duration || 12;
    const decoy = {
      t: 0, duration, pos: at,
      update: (dt) => {
        decoy.t += dt;
        // the mirror double soaks one hit every couple of seconds
        for (const a of this.combat.actors) {
          if (!a.alive || a.faction !== 'enemy') continue;
          if (a.flatDistanceTo(decoy.pos) < 6 && a.target === p) a.target = null;
        }
        return decoy.t < duration;
      },
    };
    this.actives.push(decoy);
    this.#tmpBuff('mirror_reflect', { statMul: { reflect: 0.35 } }, duration);
    bus.emit(EV.TOAST, { text: 'Mirror double', kind: 'good' });
  }

  // ───────────────────────────────────────────────────────────── helpers
  #tmpBuff(id, mods, duration) {
    this.progression.addBuff(id, { mods, duration });
    this.timers.push({
      t: duration,
      fn: () => this.progression.removeBuff(id),
    });
  }

  async #hop(from, to, duration, height) {
    const p = this.player;
    await new Promise((resolve) => {
      let t = 0;
      const step = (dt) => {
        t += dt;
        const u = clamp01(t / duration);
        p.position.lerpVectors(from, to, u);
        p.position.y = lerp(from.y, to.y, u) + Math.sin(u * Math.PI) * height;
        p.velocity.set(0, 0, 0);
        if (u >= 1) { resolve(); return true; }
        return false;
      };
      this.actives.push({ t: 0, duration: duration + 0.1, update: step });
    });
  }

  // ─────────────────────────────────────────────────────────────── update
  update(dt) {
    for (const [id, t] of [...this.cooldowns]) {
      const next = t - dt;
      if (next <= 0) this.cooldowns.delete(id); else this.cooldowns.set(id, next);
    }
    if (this.freeCosts > 0) this.freeCosts -= dt;

    for (let i = this.timers.length - 1; i >= 0; i--) {
      const timer = this.timers[i];
      timer.t -= dt;
      if (timer.t <= 0) { this.timers.splice(i, 1); timer.fn(); }
    }

    for (let i = this.actives.length - 1; i >= 0; i--) {
      const a = this.actives[i];
      let alive = false;
      try { alive = a.update(dt); } catch (err) { console.error('[abilities] active failed', err); }
      if (!alive) {
        a.dispose?.();
        this.actives.splice(i, 1);
      }
    }

    if (this.echo && performance.now() / 1000 > this.echo.until) this.echo = null;
  }

  /** Called by CombatSystem after any player damage lands (for Yamabiko echo). */
  onDamageDealt(target, damage) {
    if (!this.echo || this.echo.used >= this.echo.max) return;
    this.echo.used++;
    this.timers.push({
      t: this.echo.delay,
      fn: () => {
        if (!target?.alive) return;
        this.combat.applyDamage(target, {
          amount: damage * this.echo.pct, type: 'spirit', source: this.player, silent: false,
        });
        this.vfx.burst(target.center(new THREE.Vector3()), 16, { color: [0xbfe6ff, 0xffffff], speed: 7, size: 0.4, life: 0.5 });
        this.audio.play('echo_cast', { volume: 0.6, position: target.position });
      },
    });
    if (this.echo.used >= this.echo.max) this.echo = null;
  }

  clear() {
    for (const a of this.actives) a.dispose?.();
    this.actives.length = 0;
    this.timers.length = 0;
    this.cooldowns.clear();
  }
}

const UP = new THREE.Vector3(0, 1, 0);

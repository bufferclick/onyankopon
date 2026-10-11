import * as THREE from 'three';
import { Actor } from './Actor.js';
import { buildCharacter } from './CharacterRig.js';
import { bus, EV } from '../core/EventBus.js';
import { clamp, clamp01, lerp, damp, dampAngle, ease } from '../core/MathUtils.js';

const WALK = 2.1;
const JUMP_V = 8.4;

/**
 * Player — input, movement, the melee kit (light chain, charged heavy, guard,
 * parry, dodge, riposte, execution) and the glue to every other system.
 *
 * Combat feel rules baked in here:
 *   • attacks buffer, so mashing still chains but never desyncs
 *   • i-frames start on frame 1 of a dodge and end before the roll does
 *   • the parry window is 220 ms and rewards you with posture damage back
 *   • heavy attacks can be charged, and the charge is visible and audible
 */
export class Player extends Actor {
  constructor({ world, cameraRig, input, settings, combat, vfx, audio, engine, progression }) {
    const rig = buildCharacter({
      height: 1.78, build: 'lean',
      skin: 0xdcb08c, cloth: 0x232228, accent: 0xc8392c, hair: 0x14110f,
      head: 'human', mask: 'kitsune', weapon: 'katana', topknot: true,
      aura: 0x8ad8ff, outline: true, seed: 7,
    });
    super({ rig, stats: progression.stats, faction: 'player', name: 'Contractor', level: progression.level });

    this.world = world;
    this.cameraRig = cameraRig;
    this.input = input;
    this.settings = settings;
    this.combat = combat;
    this.vfx = vfx;
    this.audio = audio;
    this.engine = engine;
    this.progression = progression;

    this.height = 1.8;
    this.radius = 0.42;
    this.state = 'idle';
    this.stateTime = 0;
    this.combo = 0;
    this.comboWindow = 0;
    this.chargeTime = 0;
    this.charging = false;
    this.blocking = false;
    this.parryWindow = 0;
    this.dodgeCooldown = 0;
    this.attackCooldown = 0;
    this.queuedAttack = null;
    this.lastAttackTime = -99;
    this.consecutiveHits = 0;
    this.lastHitTime = -99;
    this.abilitySystem = null;
    this.interactTarget = null;
    this.sheathed = false;
    this.canAirDodge = true;
    this.devilForm = false;
    this.gravityScale = 1;
    this.groundMaterial = 'grass';
    this.lastFootstep = 0;
    this.respawnTimer = 0;
    this.startPosition = new THREE.Vector3(-140, 0, 60);

    this.animator.onEvent = (name) => this.onAnimEvent(name);
    this._dir = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
  }

  get speed() { return Math.hypot(this.velocity.x, this.velocity.z); }

  get canAct() {
    return this.alive && !this.isStaggered && this.state !== 'death'
      && this.state !== 'execute' && !this.casting;
  }

  // ───────────────────────────────────────────────────────────────── input
  #readMovement(dt) {
    const axis = this.input.getMoveAxis();
    const inWater = this.world.heightAt(this.position.x, this.position.z) < 1.0;
    let targetSpeed = 0;
    let moveState = 'idle';
    const sprinting = this.input.isDown('sprint') && this.stamina > 5 && axis.magnitude > 0.2;
    const walking = this.input.isDown('walk');

    if (axis.magnitude > 0.08 && this.canAct) {
      this.cameraRig.moveDirection(axis.x, axis.y, this._dir);
      const base = walking ? WALK : this.stats.moveSpeed;
      targetSpeed = sprinting ? this.stats.sprintSpeed : base;
      if (inWater) targetSpeed *= 0.55;
      // face the movement direction unless locked on
      if (!this.cameraRig.lockTarget || sprinting) {
        this.targetFacing = Math.atan2(this._dir.x, this._dir.z);
      }
      moveState = sprinting ? 'sprint' : walking ? 'walk' : 'run';
      if (sprinting) {
        this.stamina -= 9 * dt;
        this.staminaRegenDelay = 0.35;
      }
    } else {
      this._dir.set(0, 0, 0);
    }

    // lock-on: always face the target
    if (this.cameraRig.lockTarget?.alive) {
      const t = this.cameraRig.lockTarget;
      this.targetFacing = Math.atan2(t.position.x - this.position.x, t.position.z - this.position.z);
    }

    const accel = this.grounded ? 18 : 5;
    const decel = this.grounded ? 22 : 3;
    const desiredX = this._dir.x * targetSpeed;
    const desiredZ = this._dir.z * targetSpeed;
    const k = this._dir.lengthSq() > 0 ? accel : decel;
    this.velocity.x = damp(this.velocity.x, desiredX, k, dt);
    this.velocity.z = damp(this.velocity.z, desiredZ, k, dt);
    if (Math.abs(this.velocity.x) < 0.02) this.velocity.x = 0;
    if (Math.abs(this.velocity.z) < 0.02) this.velocity.z = 0;

    this.facing = dampAngle(this.facing, this.targetFacing, 16, dt);
    this.root.rotation.y = this.facing;

    // animator state
    if (this.state === 'idle' || this.state === 'move') {
      const sp = this.speed;
      if (sp < 0.35) {
        if (this.state !== 'idle') { this.state = 'idle'; this.animator.setState('idle'); }
      } else {
        this.state = 'move';
        const normalized = clamp01(sp / this.stats.sprintSpeed) * 1.6;
        if (this.animator.speed !== normalized) this.animator.speed = normalized;
        const st = sp > this.stats.moveSpeed * 0.98 ? 'sprint' : sp > WALK * 1.1 ? 'run' : 'walk';
        if (this.animator.state !== st) this.animator.setState(st);
      }
    }
    this.animator.speed = clamp01(this.speed / this.stats.moveSpeed) * 1.35;
    return moveState === 'sprint';
  }

  #combatInput(dt) {
    const buf = this.settings.get('controls', 'buffering');

    // ── dodge ─────────────────────────────────────────────────────────
    if (this.input.consume('dodge', buf) && this.canAct && this.dodgeCooldown <= 0 && this.grounded) {
      this.#startDodge();
    }

    // ── guard / parry ─────────────────────────────────────────────────
    const guardDown = this.input.isDown('block') || (!this.settings.get('controls', 'holdToGuard') && this.input.wasPressed('block'));
    if (guardDown && this.canAct && this.stamina > 4) {
      if (!this.blocking) {
        this.blocking = true;
        this.parryWindow = 0.22 + (this.progression.hasFlag('parry_wide') ? 0.06 : 0);
        this.animator.setState('block');
        this.state = 'block';
      }
      // blocking drains slowly while holding, and drains on impact
      this.stamina -= 3.5 * dt;
    } else if (this.blocking) {
      this.blocking = false;
      if (this.state === 'block') this.state = 'idle';
      this.animator.setState('idle');
    }
    if (this.parryWindow > 0) this.parryWindow -= dt;

    // ── attacks ───────────────────────────────────────────────────────
    if (this.input.isDown('heavyAttack')) {
      if (this.canAct && (this.state === 'idle' || this.state === 'move' || this.state === 'attack')) {
        this.charging = true;
        this.chargeTime += dt;
        if (this.chargeTime > 0.25) {
          this.blocking = false;
          if (this.animator.state !== 'block') this.animator.setState('block');
        }
      }
    } else if (this.charging) {
      this.#startHeavy(Math.min(1, this.chargeTime / 1.15));
      this.charging = false;
      this.chargeTime = 0;
    }

    if (this.input.consume('lightAttack', buf) && this.canAct) {
      this.#startAttack();
    }

    // ── lock-on ───────────────────────────────────────────────────────
    if (this.input.wasPressed('lockOn')) this.cycleLock(1);
    if (this.input.wasPressed('switchTarget')) this.cycleLock(1);
    if (this.input.wasReleased('lockOn') && this.input.heldFor('lockOn') > 0.45) {
      this.cameraRig.setLockTarget(null);
    }

    // ── jump ──────────────────────────────────────────────────────────
    if (this.input.consume('jump', buf) && this.canAct && this.grounded) {
      this.velocity.y = JUMP_V;
      this.grounded = false;
      this.animator.setState('jump');
      this.state = 'jump';
      this.audio.play('jump', { volume: 0.35, position: this.position });
    }

    if (this.input.wasPressed('sheath')) {
      this.sheathed = !this.sheathed;
      this.audio.play(this.sheathed ? 'sheath' : 'draw_blade', { volume: 0.6, position: this.position });
      bus.emit(EV.TOAST, { text: this.sheathed ? 'Blade sheathed' : 'Blade drawn', kind: 'info' });
    }
  }

  #startDodge() {
    const cost = 16 * (this.settings.get('gameplay', 'difficulty') === 'disciple' ? 0.8 : 1);
    if (!this.spendStamina(cost)) return;
    this.state = 'dodge';
    this.stateTime = 0;
    this.dodgeCooldown = 0.42;
    this.invulnerable = this.stats.dodgeIFrames + (this.progression.hasFlag('airDash') ? 0.02 : 0);
    this.blocking = false;
    this.charging = false;
    this.animator.setState('dash', { duration: 0.55, force: true });
    const axis = this.input.getMoveAxis();
    if (axis.magnitude > 0.15) {
      this.cameraRig.moveDirection(axis.x, axis.y, this._dir);
    } else {
      this._dir.set(-Math.sin(this.facing), 0, -Math.cos(this.facing));
    }
    const dist = this.stats.dodgeDistance * (this.progression.hasFlag('airDash') ? 1.1 : 1);
    this.velocity.x = this._dir.x * dist * 1.5;
    this.velocity.z = this._dir.z * dist * 1.5;
    this.audio.play('dodge_whoosh', { volume: 0.55, position: this.position });
    this.vfx.footPuff(this.position, { count: 8 });
    bus.emit(EV.DODGE, { actor: this });
  }

  #startAttack() {
    if (this.sheathed) { this.sheathed = false; this.audio.play('draw_blade', { volume: 0.7 }); }
    const cost = 11;
    if (this.state === 'attack' && this.stateTime > this.attackDuration * 0.45) {
      this.queuedAttack = 'light';
      return;
    }
    if (!this.spendStamina(cost)) return;
    this.state = 'attack';
    this.stateTime = 0;
    this.combo = (this.combo + 1) % 3;
    this.attackDuration = 0.52 / clamp(this.stats.attackSpeed, 0.7, 2.4);
    this.animator.setState('attack', { variant: this.combo, duration: this.attackDuration, force: true });
    this.audio.play('slash', { volume: 0.5, pitch: this.combo * 1.5, position: this.position });
  }

  #startHeavy(charge = 0) {
    const cost = 26 + charge * 14;
    if (!this.spendStamina(cost)) return;
    this.state = 'heavy';
    this.stateTime = 0;
    this.attackDuration = (0.85 / clamp(this.stats.attackSpeed, 0.7, 2.4)) * (1 + charge * 0.35);
    this.heavyCharge = charge;
    this.animator.setState('heavy', { variant: this.combo, duration: this.attackDuration, force: true });
    if (charge > 0.5) {
      this.audio.play('charge', { volume: 0.4 });
      this.vfx.aura(this.position, { color: 0xff7a2a, size: 1.6, dur: 0.4 });
    }
  }

  // ─────────────────────────────────────────────────────────── animation
  onAnimEvent(name) {
    const now = performance.now() / 1000;
    if (name === 'footL' || name === 'footR') {
      if (now - this.lastFootstep > 0.16 && this.grounded) {
        this.lastFootstep = now;
        const mat = this.#groundMaterial();
        this.audio.play(`step_${mat}`, { volume: clamp01(this.speed / 8) * 0.5, position: this.position, jitter: true });
        if (this.speed > 4) this.vfx.footPuff(this.position, { count: 3, color: mat === 'snow' ? 0xe8f0f8 : 0x8a7a5a });
      }
    } else if (name === 'strike') {
      this.#strikeHit();
    } else if (name === 'swing') {
      this.audio.play('whoosh', { volume: 0.35, pitch: this.state === 'heavy' ? -3 : 0 });
    }
  }

  #groundMaterial() {
    const h = this.world.heightAt(this.position.x, this.position.z);
    const biome = this.world.terrain.biomeIdAt(this.position.x, this.position.z);
    if (h < 1.8) return 'dirt';
    if (biome === 'snow' || h > 120) return 'snow';
    if (biome === 'volcanic' || biome === 'graveyard') return 'stone';
    if (biome === 'swamp') return 'dirt';
    return 'grass';
  }

  #strikeHit() {
    const isHeavy = this.state === 'heavy';
    const charge = this.heavyCharge || 0;
    this.heavyCharge = 0;
    const reach = isHeavy ? 3.3 : 2.7;
    const arc = isHeavy ? 1.9 : 1.25;
    const power = this.stats.physicalPower;
    const base = power * (isHeavy ? 1.85 + charge * 0.9 : [0.95, 1.0, 1.28][this.combo] || 1);

    // blade arc VFX at the weapon tip
    const tip = this.rig.weaponMount.getWorldPosition(this._tmp.clone());
    const forward = this._tmp2.set(Math.sin(this.facing), 0, Math.cos(this.facing));
    const at = this.position.clone().addScaledVector(forward, reach * 0.62).setY(this.position.y + 1.0);
    this.vfx.slashArc(at, this.facing + (this.combo === 1 ? 0.6 : 0), {
      radius: isHeavy ? 3.1 : 2.5,
      color: isHeavy ? 0xffd08a : 0xe8f0ff,
      tilt: this.combo === 1 ? 1.0 : 0.35,
      dur: isHeavy ? 0.32 : 0.22,
    });

    const hits = [];
    const origin = this._tmp.copy(this.position).addScaledVector(forward, 0.9);
    for (const a of this.combat.actors) {
      if (!a.alive || a === this || a.faction === 'player') continue;
      const to = this._tmp2.copy(a.position).sub(origin).setY(0);
      const d = to.length();
      if (d > reach + a.radius) continue;
      to.normalize();
      if (to.dot(forward) < Math.cos(arc / 2)) continue;
      hits.push(a);
    }

    const now = performance.now() / 1000;
    if (hits.length) {
      this.consecutiveHits += hits.length;
      this.lastHitTime = now;
      if (this.progression.hasFlag('flurry') && this.consecutiveHits >= 8) {
        this.progression.addBuff('flurry_buff', { mods: { statMul: { attackSpeed: 0.2 } }, duration: 6 });
        this.consecutiveHits = 0;
      }
    } else if (now - this.lastHitTime > 1.2) {
      this.consecutiveHits = 0;
    }

    for (const target of hits) {
      const statuses = [];
      const weaponStatus = this.equipmentStatus;
      if (weaponStatus) statuses.push(weaponStatus);
      if (this.progression.hasFlag('crit_bleed')) statuses.push({ type: 'bleed', chance: 0.35, duration: 5 });
      this.combat.resolveAttack(this, target, {
        damage: base,
        type: 'physical',
        posture: base * (isHeavy ? 1.6 : 0.9),
        statuses,
        canBlock: true,
        canParry: false,
        position: target.center(new THREE.Vector3()),
        direction: forward,
      });
    }
    this.audio.play(hits.length ? 'hit_flesh' : 'whoosh', { volume: 0.6, position: this.position });
  }

  // ─────────────────────────────────────────────────────────── lock-on
  cycleLock(dir = 1) {
    const cur = this.cameraRig.lockTarget;
    const candidates = this.combat.actors
      .filter((a) => a.alive && a.faction === 'enemy' && a.position.distanceTo(this.position) < 42)
      .sort((a, b) => a.position.distanceTo(this.position) - b.position.distanceTo(this.position));
    if (!candidates.length) {
      this.cameraRig.setLockTarget(null);
      return;
    }
    if (!cur || !candidates.includes(cur)) {
      this.cameraRig.setLockTarget(candidates[0]);
    } else {
      const i = candidates.indexOf(cur);
      this.cameraRig.setLockTarget(candidates[(i + dir + candidates.length) % candidates.length]);
    }
    this.audio.play('ui_tick', { volume: 0.25, bus: 'ui' });
  }

  // ─────────────────────────────────────────────────────────────── death
  onDeath() {
    if (this.progression.hasFlag('second_wind') && !this.usedSecondWind) {
      this.usedSecondWind = true;
      this.health = Math.round(this.maxHealth * 0.25);
      this.alive = true;
      this.invulnerable = 2.5;
      this.animator.setState('idle', { force: true });
      this.vfx.aura(this.position, { color: 0xff7a2a, size: 3, dur: 1.2 });
      this.audio.play('second_wind', { volume: 1 });
      bus.emit(EV.TOAST, { text: 'SECOND WIND', kind: 'good' });
      if (this.progression.hasFlag('second_wind_nova')) {
        this.combat.radial(this.position, { radius: 9, damage: this.stats.spiritPower * 1.4, type: 'spirit', source: this });
      }
      return false;
    }
    if (this.progression.hasFlag('fox_revive') && !this.usedFoxRevive) {
      this.usedFoxRevive = true;
      this.health = this.maxHealth;
      this.alive = true;
      this.invulnerable = 3;
      this.animator.setState('idle', { force: true });
      this.vfx.aura(this.position, { color: 0xff7a2a, size: 4, dur: 1.6 });
      bus.emit(EV.TOAST, { text: 'THE FOX PAID YOUR DEBT', kind: 'good' });
      return false;
    }
    this.animator.setState('death', { force: true });
    this.state = 'death';
    this.respawnTimer = 3.2;
    this.audio.play('player_death', { volume: 1 });
    this.engine.fadeTo(0x120a0a, 0.75);
    bus.emit(EV.PLAYER_DIED, { player: this });
    return true;
  }

  respawn(pos) {
    this.health = this.maxHealth;
    this.stamina = this.maxStamina;
    this.focus = this.maxFocus;
    this.poise = this.poiseMax;
    this.alive = true;
    this.state = 'idle';
    this.velocity.set(0, 0, 0);
    this.statuses.clear();
    this.position.copy(pos);
    this.position.y = this.world.heightAt(pos.x, pos.z) + 0.1;
    this.animator.setState('idle', { force: true });
    this.animator.deathTime = 0;
    this.usedSecondWind = false;
    this.usedFoxRevive = false;
    this.invulnerable = 2.5;
    this.engine.fadeTo(0x000000, 0);
  }

  // ───────────────────────────────────────────────────────────── update
  update(dt) {
    this.stateTime += dt;
    if (this.dodgeCooldown > 0) this.dodgeCooldown -= dt;
    if (this.progression) {
      this.stats = this.progression.stats;
      this.maxHealth = this.stats.maxHealth;
      this.maxStamina = this.stats.maxStamina;
      this.maxFocus = this.stats.maxFocus;
      this.poiseMax = this.stats.poise;
    }

    if (!this.alive) {
      if (this.respawnTimer > 0) this.respawnTimer -= dt;
      this.velocity.x = damp(this.velocity.x, 0, 8, dt);
      this.velocity.z = damp(this.velocity.z, 0, 8, dt);
      this.move(dt, this.world);
      this.animator.update(dt, { speed: 0, grounded: this.grounded, velocity: this.velocity });
      return;
    }

    const wasAttacking = this.state === 'attack' || this.state === 'heavy';
    const sprinting = this.#readMovement(dt);
    if (this.canAct) this.#combatInput(dt);
    else { this.blocking = false; this.charging = false; }

    // attack state progression
    if (this.state === 'attack' || this.state === 'heavy') {
      if (this.stateTime >= this.attackDuration) {
        if (this.queuedAttack) {
          this.queuedAttack = null;
          this.#startAttack();
        } else {
          this.state = 'idle';
        }
      }
    }
    if (this.state === 'dodge' && this.stateTime >= 0.55) this.state = 'idle';
    if (this.state === 'block' && !this.blocking) this.state = 'idle';

    // gravity / movement integration
    this.move(dt, this.world, { gravity: -26 * this.gravityScale });

    // water: slow, splash, gentle bob
    const waterY = 1.6;
    const groundH = this.world.heightAt(this.position.x, this.position.z);
    if (groundH < waterY - 0.6 && this.position.y < waterY) {
      this.velocity.x *= 0.94;
      this.velocity.z *= 0.94;
      this.velocity.y = Math.max(this.velocity.y, -1.2);
      if (this.position.y < waterY - 1.6) this.position.y = waterY - 1.6;
      if (Math.random() < 0.04) this.audio.play('water_splash', { volume: 0.3, position: this.position });
    }

    // fall damage
    if (this.fallStart !== undefined && this.grounded) {
      const fall = this.fallStart - this.position.y;
      if (fall > 14 && !this.progression.hasFlag('noFallDamage')) {
        const dmg = (fall - 14) * 7;
        this.combat.trueDamage(this, dmg, null, { type: 'physical' });
        this.animator.setState('land', { force: true });
        this.audio.play('heavy_impact', { volume: 0.7 });
        this.engine.shake(0.5);
      } else if (fall > 4) {
        this.animator.setState('land', { force: true });
      }
      this.fallStart = undefined;
    }
    if (!this.grounded && this.velocity.y < 0 && this.fallStart === undefined) {
      this.fallStart = this.position.y;
    }
    if (this.grounded && this.state === 'jump') {
      this.state = 'idle';
      this.animator.setState('land', { force: true });
    }

    super.update(dt);
    this.animator.update(dt, {
      speed: this.speed,
      grounded: this.grounded,
      velocity: this.velocity,
      blocking: this.blocking,
      lookTarget: this.cameraRig.lockTarget?.position || null,
    });

    // devil form drain
    if (this.devilForm) {
      this.focus -= 3 * dt;
      if (this.focus <= 0) this.setDevilForm(false);
    }

    if (this.health <= 0 && this.alive) {
      this.alive = false;
      this.onDeath();
    }
  }

  setDevilForm(on) {
    if (on === this.devilForm) return;
    this.devilForm = on;
    if (on) {
      this.progression.addBuff('devilform', { mods: { statMul: { spiritPower: 0.6, physicalPower: 0.6, defense: 0.4 } }, duration: 20 });
      this.vfx.aura(this.position, { color: 0xff2e2e, size: 5, dur: 1.4 });
      this.audio.play('devil_form', { volume: 1 });
      this.engine.aberration(1.6);
      this.engine.radialBlur(1.2);
    } else {
      this.progression.removeBuff('devilform');
    }
  }

  /** Called by abilities to play the right pose. */
  playCastPose(duration = 0.6) {
    this.casting = true;
    this.animator.setState('cast', { force: true, duration });
    clearTimeout(this._castTimer);
    this._castTimer = setTimeout(() => { this.casting = false; this.animator.setState('idle'); }, duration * 1000);
  }

  playSummonPose(duration = 0.8) {
    this.casting = true;
    this.animator.setState('summon', { force: true, duration });
    clearTimeout(this._castTimer);
    this._castTimer = setTimeout(() => { this.casting = false; this.animator.setState('idle'); }, duration * 1000);
  }
}

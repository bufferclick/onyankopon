import * as THREE from 'three';
import { clamp, clamp01, lerp, damp, dampAngle, ease, TAU } from '../core/MathUtils.js';

/**
 * Animator — a hand-written, layered procedural animation system.
 *
 * Nothing here is a baked clip: every pose is evaluated per frame from the
 * character's state, its velocity, and a bit of noise, which is what makes the
 * movement feel alive — breathing never stops, tails lag behind turns, heavy
 * attacks have weight because the recovery is genuinely slower than the swing.
 *
 * Layers, applied in order:
 *   1. base pose for the state (locomotion / combat / reaction)
 *   2. additive: breathing, look-at, hit reaction, cloth + tail lag, wing flap
 *   3. critically damped per-joint springs toward the composed target
 */

const JOINTS = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'shoulderR', 'armL', 'armR', 'foreL', 'foreR', 'handL', 'handR',
  'upLegL', 'upLegR', 'legL', 'legR', 'footL', 'footR',
];

function blankPose() {
  const p = {};
  for (const j of JOINTS) p[j] = { x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0 };
  return p;
}

export class Animator {
  constructor(rig, opts = {}) {
    this.rig = rig;
    this.joints = rig.joints;
    this.state = 'idle';
    this.prevState = 'idle';
    this.stateTime = 0;
    this.time = opts.time || 0;
    this.phase = Math.random() * TAU;      // locomotion cycle
    this.speed = 0;                        // normalised 0..1 (walk) ..1.6 (sprint)
    this.velocity = new THREE.Vector3();
    this.grounded = true;
    this.attackVariant = 0;
    this.attackDuration = 0.6;
    this.pose = blankPose();
    this.current = blankPose();
    this.lookTarget = null;
    this.lookWeight = 1;
    this.hitReact = { x: 0, y: 0, decay: 0 };
    this.rootOffset = new THREE.Vector3();
    this.rootRotation = 0;
    this.targetRootY = 0;
    this.floatPhase = Math.random() * TAU;
    this.dead = false;
    this.deathTime = 0;
    this.blocking = false;
    this.castPose = 0;
    this.lambda = 12;
    this.sway = { x: 0, z: 0, vx: 0, vz: 0 };
    this.tailPhase = Math.random() * TAU;
    this.blend = 1;       // 0..1 crossfade weight when a new state starts
    this.onEvent = null;  // callback for animation events (footstep, strike…)
    this._fired = new Set();
    this.hipBaseY = rig.joints.hips.position.y;
  }

  setState(name, { variant = 0, duration = 0.6, force = false } = {}) {
    if (this.state === name && !force) return;
    this.prevState = this.state;
    this.state = name;
    this.stateTime = 0;
    this.attackVariant = variant;
    this.attackDuration = duration;
    this.blend = 0;
    this._fired.clear();
  }

  /** Fire a named event once per state cycle (footfalls, blade impacts). */
  #fire(name) {
    if (this._fired.has(name)) return;
    this._fired.add(name);
    this.onEvent?.(name, this.state);
  }

  /** Direction (world) the character was struck from — drives the recoil. */
  applyHit(dirWorld, facing, power = 1) {
    const local = Math.atan2(dirWorld.x, dirWorld.z) - facing;
    this.hitReact.x = clamp(Math.sin(local) * 0.5 * power, -0.55, 0.55);
    this.hitReact.y = clamp(-Math.cos(local) * 0.4 * power, -0.5, 0.5);
    this.hitReact.decay = 1;
  }

  update(dt, ctx = {}) {
    this.time += dt;
    this.stateTime += dt;
    this.speed = ctx.speed ?? this.speed;
    if (ctx.velocity) this.velocity.copy(ctx.velocity);
    this.grounded = ctx.grounded ?? true;
    this.lookTarget = ctx.lookTarget ?? null;
    this.blocking = !!ctx.blocking;

    // ── locomotion cycle advances with actual ground speed ───────────────
    const cadence = lerp(1.05, 2.9, clamp01(this.speed / 1.6));
    if (this.speed > 0.05) this.phase += dt * cadence * TAU;
    else this.phase += dt * 0.9;      // idle sway keeps breathing in phase

    const p = this.pose;
    this.#resetPose(p);

    switch (this.state) {
      case 'idle': this.#idle(p, dt); break;
      case 'walk': case 'run': case 'sprint': this.#locomotion(p, dt); break;
      case 'jump': this.#air(p, 1); break;
      case 'fall': this.#air(p, -1); break;
      case 'land': this.#land(p); break;
      case 'dash': this.#dash(p); break;
      case 'attack': this.#attack(p); break;
      case 'heavy': this.#attack(p, true); break;
      case 'block': this.#block(p); break;
      case 'parry': this.#parry(p); break;
      case 'hit': this.#hit(p); break;
      case 'death': this.#death(p, dt); break;
      case 'cast': this.#cast(p); break;
      case 'summon': this.#summon(p); break;
      case 'execute': this.#execute(p); break;
      case 'taunt': this.#taunt(p); break;
      case 'float': this.#float(p); break;
      case 'talk': this.#talk(p); break;
      case 'sit': this.#sit(p); break;
      default: this.#idle(p, dt); break;
    }

    this.#additive(p, dt);
    this.#apply(dt);
    return this.rootOffset;
  }

  // ─────────────────────────────────────────────────────────────── states
  #resetPose(p) {
    for (const j of JOINTS) { const t = p[j]; t.x = 0; t.y = 0; t.z = 0; t.px = 0; t.py = 0; t.pz = 0; }
    // relaxed stance: arms out a touch, knees soft
    p.armL.z = -0.14; p.armR.z = 0.14;
    p.foreL.x = 0.22; p.foreR.x = 0.22;
    p.upLegL.z = -0.04; p.upLegR.z = 0.04;
    p.legL.x = 0.10; p.legR.x = 0.10;
    p.shoulderL.z = -0.06; p.shoulderR.z = 0.06;
  }

  #idle(p, dt) {
    const b = Math.sin(this.time * 1.7);
    const b2 = Math.sin(this.time * 0.63);
    p.spine.x = 0.03 + b * 0.018;
    p.chest.x = -0.02 - b * 0.012;
    p.head.x = 0.04 + b2 * 0.03;
    p.head.y = b2 * 0.10;
    p.armL.x = b * 0.03; p.armR.x = -b * 0.03;
    p.armL.z = -0.14 - b * 0.02; p.armR.z = 0.14 + b * 0.02;
    p.foreL.x = 0.24 + b * 0.04; p.foreR.x = 0.24 - b * 0.04;
    p.hips.px = 0; p.hips.py = b * 0.006;
    p.upLegL.x = 0.02; p.upLegR.x = -0.02;
    p.legL.x = 0.08; p.legR.x = 0.08;
    if (this.blocking) this.#block(p, 0.6);
  }

  #locomotion(p, dt) {
    const s = clamp01(this.speed / 1.6);
    const running = this.state !== 'walk';
    const amp = lerp(0.42, 0.95, s);
    const knee = lerp(0.55, 1.35, s);
    const ph = this.phase;

    const swingL = Math.sin(ph);
    const swingR = Math.sin(ph + Math.PI);

    p.upLegL.x = swingL * amp;
    p.upLegR.x = swingR * amp;
    // knee bends only on the back half of the swing
    p.legL.x = Math.max(0, -Math.sin(ph - 0.7)) * knee + 0.08;
    p.legR.x = Math.max(0, -Math.sin(ph + Math.PI - 0.7)) * knee + 0.08;
    p.footL.x = -Math.sin(ph - 1.2) * 0.25;
    p.footR.x = -Math.sin(ph + Math.PI - 1.2) * 0.25;

    p.armL.x = swingR * amp * 0.75;
    p.armR.x = swingL * amp * 0.6;
    p.armL.z = -0.14 - s * 0.10;
    p.armR.z = 0.14 + s * 0.10;
    p.foreL.x = 0.25 + Math.max(0, Math.sin(ph)) * 0.55 * (running ? 1 : 0.4);
    p.foreR.x = 0.30 + Math.max(0, -Math.sin(ph)) * 0.35 * (running ? 1 : 0.4);

    // torso: bob, lean, counter-rotation
    const bob = Math.abs(Math.sin(ph)) ** 2;
    p.hips.py = bob * 0.045 * (0.4 + s);
    p.spine.x = 0.04 + s * 0.20;
    p.chest.y = -swingL * 0.10 * (0.4 + s);
    p.chest.x = -s * 0.06;
    p.head.x = -s * 0.16 + bob * 0.03;
    p.head.y = swingL * 0.03;

    // footfalls
    const stepPhase = ((ph / TAU) % 1 + 1) % 1;
    if (stepPhase < 0.06) this.#fire('footL');
    if (stepPhase > 0.5 && stepPhase < 0.56) this.#fire('footR');
  }

  #air(p, dir) {
    p.upLegL.x = dir > 0 ? -0.7 : 0.35;
    p.upLegR.x = dir > 0 ? -0.2 : 0.55;
    p.legL.x = dir > 0 ? 1.1 : 0.35;
    p.legR.x = dir > 0 ? 0.6 : 0.9;
    p.armL.x = -0.6; p.armR.x = -0.5;
    p.armL.z = -0.5; p.armR.z = 0.5;
    p.foreL.x = 0.6; p.foreR.x = 0.6;
    p.spine.x = dir > 0 ? -0.12 : 0.18;
    p.head.x = dir > 0 ? -0.15 : 0.2;
  }

  #land(p) {
    const t = clamp01(this.stateTime / 0.35);
    const e = ease.outCubic(t);
    p.upLegL.x = lerp(-0.7, 0, e); p.upLegR.x = lerp(0.5, 0, e);
    p.legL.x = lerp(1.1, 0.1, e); p.legR.x = lerp(0.9, 0.1, e);
    p.hips.py = lerp(-0.28, 0, e);
    p.spine.x = lerp(0.35, 0.04, e);
    p.armL.z = lerp(-0.7, -0.14, e); p.armR.z = lerp(0.7, 0.14, e);
    p.armL.x = lerp(-0.5, 0, e); p.armR.x = lerp(-0.4, 0, e);
    p.chest.x = lerp(0.25, 0, e);
    if (t >= 1) this.setState('idle');
  }

  #dash(p) {
    const t = clamp01(this.stateTime / Math.max(0.01, this.attackDuration));
    const e = ease.outCubic(t);
    p.spine.x = lerp(0.45, 0.12, e);
    p.chest.x = lerp(0.2, 0, e);
    p.hips.py = -0.12 * (1 - e) - 0.02;
    p.upLegL.x = lerp(-0.9, -0.25, e);
    p.upLegR.x = lerp(0.7, 0.15, e);
    p.legL.x = lerp(1.5, 0.4, e);
    p.legR.x = lerp(0.5, 0.2, e);
    p.armL.x = lerp(-1.1, -0.2, e);
    p.armR.x = lerp(-1.0, -0.2, e);
    p.armL.z = lerp(-0.8, -0.14, e);
    p.armR.z = lerp(0.8, 0.14, e);
    p.foreL.x = lerp(1.0, 0.3, e);
    p.foreR.x = lerp(1.0, 0.3, e);
    p.head.x = lerp(-0.3, -0.05, e);
    if (t >= 1) this.setState('idle');
  }

  #attack(p, heavy = false) {
    const dur = this.attackDuration;
    const t = clamp01(this.stateTime / dur);
    const v = this.attackVariant % 3;
    const windup = heavy ? 0.34 : 0.26;
    const strike = heavy ? 0.52 : 0.44;

    let swing;                              // -1 (wound up) → +1 (followed through)
    if (t < windup) swing = -ease.outQuad(t / windup);
    else if (t < strike) swing = lerp(-1, 1, ease.outQuart((t - windup) / (strike - windup)));
    else swing = lerp(1, 0, ease.inOutCubic((t - strike) / (1 - strike)));

    const power = heavy ? 1.35 : 1;

    if (v === 0) {                          // diagonal slash, right → left
      p.armR.x = lerp(-2.3, 0.75, (swing + 1) / 2) * power;
      p.armR.y = lerp(0.5, -0.7, (swing + 1) / 2);
      p.armR.z = lerp(0.5, -0.25, (swing + 1) / 2);
      p.foreR.x = lerp(-0.6, 0.15, (swing + 1) / 2);
      p.chest.y = lerp(0.45, -0.55, (swing + 1) / 2) * power;
      p.spine.y = lerp(0.22, -0.3, (swing + 1) / 2) * power;
      p.armL.x = lerp(0.3, -0.5, (swing + 1) / 2);
      p.armL.z = -0.3;
    } else if (v === 1) {                   // horizontal sweep
      p.armR.x = lerp(-1.5, -1.1, (swing + 1) / 2);
      p.armR.y = lerp(1.4, -1.3, (swing + 1) / 2);
      p.armR.z = 0.9;
      p.foreR.x = lerp(-0.8, 0.1, (swing + 1) / 2);
      p.chest.y = lerp(0.7, -0.7, (swing + 1) / 2) * power;
      p.spine.y = lerp(0.35, -0.35, (swing + 1) / 2) * power;
      p.armL.y = lerp(-0.4, 0.5, (swing + 1) / 2);
      p.armL.z = -0.55;
    } else {                                // thrust
      p.armR.x = lerp(-1.9, 0.25, (swing + 1) / 2);
      p.armR.y = lerp(0.35, -0.15, (swing + 1) / 2);
      p.armR.z = 0.25;
      p.foreR.x = lerp(-1.2, 0.05, (swing + 1) / 2);
      p.chest.y = lerp(0.3, -0.25, (swing + 1) / 2);
      p.spine.y = lerp(0.15, -0.12, (swing + 1) / 2);
      p.armL.x = lerp(0.2, -0.7, (swing + 1) / 2);
    }

    // weight shift + lunge
    p.spine.x = lerp(0.10, 0.28, (swing + 1) / 2) * power;
    p.hips.py = -0.06 * (1 - Math.abs(swing)) - 0.02;
    p.upLegL.x = lerp(-0.35, 0.45, (swing + 1) / 2) * power;
    p.upLegR.x = lerp(0.30, -0.35, (swing + 1) / 2) * power;
    p.legL.x = 0.28 + Math.abs(swing) * 0.2;
    p.legR.x = 0.34 + Math.abs(swing) * 0.2;
    p.head.y = lerp(0.25, -0.2, (swing + 1) / 2);

    // lunge distance the controller can consume
    const lunge = heavy ? 1.5 : 0.95;
    const lungeT = t < windup ? -0.15 * (t / windup) : t < strike ? lerp(-0.15, 1, ease.outQuart((t - windup) / (strike - windup))) : lerp(1, 0.7, (t - strike) / (1 - strike));
    this.rootOffset.set(0, 0, lungeT * lunge);

    if (t > strike - 0.04) this.#fire('strike');
    if (t > windup + 0.02 && t < windup + 0.1) this.#fire('swing');
    if (t >= 1) this.setState('idle');
  }

  #block(p, weight = 1) {
    p.armR.x = -1.15 * weight;
    p.armR.y = 0.55 * weight;
    p.armR.z = 0.35 * weight;
    p.foreR.x = -1.15 * weight;
    p.armL.x = -0.75 * weight;
    p.armL.y = -0.35 * weight;
    p.armL.z = -0.35 * weight;
    p.foreL.x = -1.0 * weight;
    p.spine.x = 0.14 * weight;
    p.chest.y = 0.2 * weight;
    p.hips.py = -0.08 * weight;
    p.upLegL.x = -0.22 * weight;
    p.upLegR.x = 0.22 * weight;
    p.legL.x = 0.32 * weight; p.legR.x = 0.32 * weight;
    p.head.x = 0.1 * weight;
  }

  #parry(p) {
    const t = clamp01(this.stateTime / 0.32);
    const e = ease.outBack(t);
    p.armR.x = lerp(-1.15, -1.5, e);
    p.armR.y = lerp(0.55, 0.15, e);
    p.foreR.x = lerp(-1.15, -0.5, e);
    p.armL.z = -0.6;
    p.chest.y = lerp(0.2, -0.15, e);
    p.spine.x = lerp(0.14, 0.05, e);
    p.hips.py = -0.05;
    if (t >= 1) this.setState('idle');
  }

  #hit(p) {
    const t = clamp01(this.stateTime / 0.36);
    const e = ease.outCubic(t);
    p.spine.x = lerp(-0.35, 0.03, e);
    p.chest.x = lerp(-0.25, 0, e);
    p.head.x = lerp(-0.4, 0.03, e);
    p.armL.x = lerp(-0.7, 0, e); p.armR.x = lerp(-0.6, 0, e);
    p.armL.z = lerp(-0.7, -0.14, e); p.armR.z = lerp(0.7, 0.14, e);
    p.hips.py = lerp(-0.1, 0, e);
    p.upLegL.x = lerp(-0.3, 0, e); p.upLegR.x = lerp(0.2, 0, e);
    p.legL.x = lerp(0.5, 0.1, e); p.legR.x = lerp(0.4, 0.1, e);
    if (t >= 1) this.setState('idle');
  }

  #death(p, dt) {
    this.deathTime += dt;
    const t = clamp01(this.deathTime / 1.25);
    const e = ease.inOutCubic(t);
    p.spine.x = lerp(0, -0.5, e);
    p.chest.x = lerp(0, -0.3, e);
    p.head.x = lerp(0, 0.6, e);
    p.hips.py = lerp(0, -this.hipBaseY * 0.92, e);
    p.hips.x = lerp(0, -1.35, e);
    p.armL.z = lerp(-0.14, -1.1, e); p.armR.z = lerp(0.14, 1.1, e);
    p.armL.x = lerp(0, -0.4, e); p.armR.x = lerp(0, -0.3, e);
    p.foreL.x = lerp(0.22, 0.5, e); p.foreR.x = lerp(0.22, 0.4, e);
    p.upLegL.x = lerp(0, -0.9, e); p.upLegR.x = lerp(0, -0.6, e);
    p.legL.x = lerp(0.1, 1.4, e); p.legR.x = lerp(0.1, 1.1, e);
    this.rootOffset.set(0, 0, 0);
  }

  #cast(p) {
    const t = this.stateTime;
    const rise = clamp01(t / 0.35);
    const hold = Math.sin(t * 5) * 0.03;
    p.armR.x = lerp(0, -1.5, ease.outCubic(rise)) + hold;
    p.armR.y = lerp(0, 0.5, rise);
    p.armR.z = lerp(0.14, 0.7, rise);
    p.foreR.x = lerp(0.22, -0.7, rise);
    p.armL.x = lerp(0, -1.2, ease.outCubic(rise)) - hold;
    p.armL.y = lerp(0, -0.5, rise);
    p.armL.z = lerp(-0.14, -0.7, rise);
    p.foreL.x = lerp(0.22, -0.6, rise);
    p.spine.x = lerp(0.03, -0.14, rise);
    p.head.x = lerp(0.04, -0.22, rise);
    p.hips.py = -0.03 * rise;
    p.upLegL.x = -0.12; p.upLegR.x = 0.12;
    p.legL.x = 0.2; p.legR.x = 0.2;
  }

  #summon(p) {
    // the Kon pose: knees bent, one arm thrown out, head tipped back
    const t = clamp01(this.stateTime / this.attackDuration);
    const e = ease.outExpo(clamp01(t / 0.4));
    const settle = t > 0.6 ? ease.inOutCubic((t - 0.6) / 0.4) : 0;
    p.armR.x = lerp(0, -2.2, e) * (1 - settle * 0.7);
    p.armR.y = lerp(0, 0.4, e);
    p.armR.z = lerp(0.14, 0.45, e);
    p.foreR.x = lerp(0.22, -0.35, e);
    p.armL.x = lerp(0, 0.5, e);
    p.armL.z = lerp(-0.14, -0.5, e);
    p.spine.x = lerp(0.03, -0.3, e);
    p.head.x = lerp(0.04, -0.4, e);
    p.hips.py = lerp(0, -0.18, e);
    p.upLegL.x = lerp(0, -0.5, e); p.upLegR.x = lerp(0, 0.42, e);
    p.legL.x = lerp(0.1, 0.9, e); p.legR.x = lerp(0.1, 0.7, e);
    if (t >= 1) this.setState('idle');
  }

  #execute(p) {
    const t = clamp01(this.stateTime / 0.9);
    const e = ease.outQuart(clamp01(t / 0.35));
    const back = t > 0.5 ? ease.inOutCubic((t - 0.5) / 0.5) : 0;
    p.armR.x = lerp(0, 0.9, e) * (1 - back * 0.6);
    p.armR.y = lerp(0, -0.5, e);
    p.foreR.x = lerp(0.22, 0.05, e);
    p.armL.x = lerp(0, 0.7, e);
    p.spine.x = lerp(0.03, 0.4, e) * (1 - back * 0.5);
    p.chest.y = lerp(0, 0.35, e) * (1 - back);
    p.hips.py = -0.05 * e;
    p.upLegL.x = lerp(0, 0.5, e); p.upLegR.x = lerp(0, -0.4, e);
    if (t >= 1) this.setState('idle');
  }

  #taunt(p) {
    const t = this.stateTime;
    p.armR.x = -0.4 + Math.sin(t * 2.2) * 0.15;
    p.armR.z = 1.2;
    p.armL.z = -0.5;
    p.head.x = -0.15;
    p.chest.y = Math.sin(t * 1.6) * 0.12;
    p.hips.py = Math.sin(t * 2.2) * 0.03;
  }

  #float(p) {
    this.floatPhase += 0.02;
    const b = Math.sin(this.time * 1.4);
    p.hips.py = b * 0.10;
    p.spine.x = 0.08 + b * 0.04;
    p.armL.z = -0.5 - b * 0.08;
    p.armR.z = 0.5 + b * 0.08;
    p.foreL.x = 0.5; p.foreR.x = 0.5;
    p.upLegL.x = -0.25 + b * 0.1;
    p.upLegR.x = 0.2 - b * 0.1;
    p.legL.x = 0.7; p.legR.x = 0.6;
    p.head.x = -0.1 + b * 0.05;
  }

  #talk(p) {
    const t = this.time;
    p.head.y = Math.sin(t * 0.9) * 0.18;
    p.head.x = 0.03 + Math.sin(t * 1.3) * 0.04;
    p.armR.x = -0.25 + Math.sin(t * 1.1) * 0.12;
    p.armR.y = 0.2;
    p.foreR.x = 0.5 + Math.sin(t * 1.7) * 0.15;
    p.armL.x = -0.1;
    p.chest.y = Math.sin(t * 0.7) * 0.06;
  }

  #sit(p) {
    p.hips.py = -0.52;
    p.upLegL.x = -1.5; p.upLegR.x = -1.5;
    p.legL.x = 1.8; p.legR.x = 1.8;
    p.spine.x = 0.12;
    p.armL.x = -0.3; p.armR.x = -0.3;
    p.foreL.x = 0.9; p.foreR.x = 0.9;
    p.head.x = 0.06;
  }

  // ────────────────────────────────────────────────────────────── additive
  #additive(p, dt) {
    // breathing (always, scaled down during exertion)
    const breath = Math.sin(this.time * 1.9) * 0.02 * (1 - clamp01(this.speed) * 0.4);
    p.chest.x += breath;
    p.spine.x += breath * 0.4;

    // look-at: head and a little chest follow
    if (this.lookTarget) {
      const local = this.joints.head.parent.worldToLocal(_v.copy(this.lookTarget));
      const yaw = clamp(Math.atan2(local.x, local.z), -1.1, 1.1) * this.lookWeight;
      const pitch = clamp(-Math.atan2(local.y, Math.hypot(local.x, local.z)), -0.5, 0.5) * this.lookWeight;
      p.head.y += yaw * 0.7;
      p.head.x += pitch * 0.6;
      p.chest.y += yaw * 0.18;
      p.neck.x += pitch * 0.2;
    }

    // hit reaction decay
    if (this.hitReact.decay > 0) {
      this.hitReact.decay = Math.max(0, this.hitReact.decay - dt * 3.4);
      const k = this.hitReact.decay ** 1.6;
      p.chest.x += this.hitReact.y * k;
      p.chest.z += this.hitReact.x * k;
      p.spine.z += this.hitReact.x * k * 0.5;
      p.head.x += this.hitReact.y * k * 0.8;
    }

    // cloth / body lag: the whole upper body trails turns and acceleration
    const lateral = clamp(this.velocity.x * 0.05, -0.5, 0.5);
    const forward = clamp(this.velocity.z * 0.03, -0.4, 0.4);
    this.sway.x = damp(this.sway.x, lateral, 6, dt);
    this.sway.z = damp(this.sway.z, forward, 5, dt);
    p.spine.z -= this.sway.x * 0.35;
    p.chest.z -= this.sway.x * 0.25;
    p.spine.x += this.sway.z * 0.5;
    p.head.z -= this.sway.x * 0.2;

    // tail / serpent / wing follow-through
    const rig = this.rig;
    this.tailPhase += dt * (2.2 + this.speed * 2.5);
    if (rig.tailSegments?.length) {
      const segs = rig.tailSegments;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        const k = (i + 1) / segs.length;
        const wave = Math.sin(this.tailPhase - i * 0.55) * 0.16 * k;
        const lag = this.sway.x * 0.5 * k;
        s.rotation.x = damp(s.rotation.x, -0.16 * k + Math.abs(this.sway.z) * 0.3 * k, 8, dt);
        s.rotation.y = damp(s.rotation.y, wave + lag, 6, dt);
        s.rotation.z = damp(s.rotation.z, Math.cos(this.tailPhase - i * 0.4) * 0.08 * k, 6, dt);
      }
    }
    const serpent = rig.root.userData.serpent;
    if (serpent) {
      for (let i = 0; i < serpent.length; i++) {
        const k = (i + 1) / serpent.length;
        serpent[i].rotation.y = damp(serpent[i].rotation.y, Math.sin(this.tailPhase * 0.7 - i * 0.6) * 0.3 * k, 6, dt);
        serpent[i].rotation.x = damp(serpent[i].rotation.x, -0.1 * k, 6, dt);
      }
    }
    const flap = Math.sin(this.time * (this.grounded ? 3 : 9));
    for (const key of ['wingL', 'wingR']) {
      const w = rig.root.userData[key];
      if (!w) continue;
      const dir = key === 'wingL' ? 1 : -1;
      w.rotation.z = damp(w.rotation.z, dir * (0.15 + flap * (this.grounded ? 0.12 : 0.55)), 9, dt);
      w.rotation.y = damp(w.rotation.y, dir * 0.1, 6, dt);
    }
  }

  // ──────────────────────────────────────────────────────────── blending
  #apply(dt) {
    // snappy for attacks, soft for idle: the lambda table is the "feel" dial
    const fast = ['attack', 'heavy', 'parry', 'dash', 'execute', 'hit'].includes(this.state);
    const lambda = fast ? 26 : this.state === 'death' ? 9 : this.speed > 0.1 ? 16 : 9;
    this.lambda = lambda;
    const p = this.pose;
    for (const j of JOINTS) {
      const joint = this.joints[j];
      if (!joint) continue;
      const t = p[j];
      const c = this.current[j];
      c.x = damp(c.x, t.x, lambda, dt);
      c.y = damp(c.y, t.y, lambda, dt);
      c.z = damp(c.z, t.z, lambda, dt);
      joint.rotation.set(c.x, c.y, c.z);
      if (t.px || t.py || t.pz) {
        joint.position.x = j === 'hips' ? 0 : joint.position.x;
        joint.position.y = j === 'hips' ? this.hipBaseY + t.py : joint.position.y;
      } else if (j === 'hips') {
        joint.position.y = damp(joint.position.y, this.hipBaseY, lambda, dt);
      }
    }
  }
}

const _v = new THREE.Vector3();

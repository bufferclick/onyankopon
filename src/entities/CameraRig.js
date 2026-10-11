import * as THREE from 'three';
import { clamp, clamp01, damp, dampAngle, lerp, Spring, Spring3 } from '../core/MathUtils.js';

/**
 * Third-person camera: spring arm with collision, lock-on framing, sprint FOV
 * kick, dodge lean, and a scripted "cinematic" mode for executions, Kon and
 * boss introductions.
 */
export class CameraRig {
  constructor(camera, world, settings) {
    this.camera = camera;
    this.world = world;
    this.settings = settings;
    this.yaw = 0;
    this.pitch = -0.16;
    this.target = new THREE.Vector3();
    this.smoothTarget = new THREE.Vector3();
    this.distance = 5.4;
    this.currentDistance = 5.4;
    this.height = 1.55;
    this.shoulder = 0.7;
    this.fovBase = settings.get('video', 'fov');
    this.fov = this.fovBase;
    this.lockTarget = null;
    this.lookAt = new THREE.Vector3();
    this.cinematic = null;
    this.shake = new Spring3(180, 22);
    this.roll = 0;
    this.lean = 0;
    this.mode = 'free';
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._ray = new THREE.Vector3();
  }

  applySettings() {
    this.fovBase = this.settings.get('video', 'fov');
    this.distanceScale = this.settings.get('controls', 'cameraDistance');
    this.heightScale = this.settings.get('controls', 'cameraHeight');
  }

  addLook(dx, dy) {
    const s = this.settings.data.controls;
    this.yaw -= dx * 0.0026 * s.sensitivityX;
    this.pitch -= dy * 0.0022 * s.sensitivityY * (s.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -1.15, 0.82);
  }

  /** Instantly place the camera behind the character (respawn / teleport). */
  snap(pos, facing) {
    this.yaw = facing;
    this.pitch = -0.16;
    this.smoothTarget.copy(pos);
    this.target.copy(pos);
    this.currentDistance = this.distance;
    this.#place(1);
  }

  setLockTarget(actor) {
    this.lockTarget = actor;
    this.mode = actor ? 'lock' : 'free';
  }

  /** Scripted camera move: {from, to, lookFrom, lookTo, duration, fov}. */
  playCinematic(cfg) {
    this.cinematic = { t: 0, ...cfg };
  }

  cancelCinematic() { this.cinematic = null; }

  update(dt, { position, velocity, speed, grounded, facing, engineShake = null, isAiming = false, sprinting = false }) {
    this.applySettings();
    const cs = this.settings.data.controls;

    // ── framing target ────────────────────────────────────────────────
    this.target.set(position.x, position.y + this.height * (this.heightScale || 1), position.z);
    this.smoothTarget.x = damp(this.smoothTarget.x, this.target.x, 18, dt);
    this.smoothTarget.y = damp(this.smoothTarget.y, this.target.y, 10, dt);
    this.smoothTarget.z = damp(this.smoothTarget.z, this.target.z, 18, dt);

    // ── lock-on framing ───────────────────────────────────────────────
    let desiredYaw = this.yaw;
    let desiredPitch = this.pitch;
    if (this.lockTarget && this.lockTarget.alive) {
      const mid = this._v.copy(this.lockTarget.position);
      mid.y += this.lockTarget.height * 0.6;
      const from = this._v2.copy(this.smoothTarget);
      from.y += 0.4;
      const dir = mid.clone().sub(from).normalize();
      desiredYaw = Math.atan2(-dir.x, -dir.z);
      desiredPitch = Math.asin(clamp(-dir.y, -1, 1)) * 0.55 - 0.06;
      this.distance = lerp(5.0, 6.6, clamp01(mid.distanceTo(from) / 22)) * (this.distanceScale || 1);
    } else {
      this.distance = (5.2 + clamp01(speed / 9) * 0.9) * (this.distanceScale || 1);
    }

    const lockLambda = this.lockTarget ? 9 : 60;
    this.yaw = dampAngle(this.yaw, desiredYaw, lockLambda, dt);
    this.pitch = damp(this.pitch, desiredPitch, 14, dt);

    // ── distance + collision ──────────────────────────────────────────
    const want = this.distance * (isAiming ? 0.78 : 1);
    this.currentDistance = damp(this.currentDistance, want, 8, dt);
    let dist = this.currentDistance;
    if (cs.cameraCollision !== false) dist = this.#collide(dist);

    // ── place ─────────────────────────────────────────────────────────
    this.#place(dt, dist, velocity, sprinting, speed);

    // ── fov + roll ────────────────────────────────────────────────────
    const speedFov = clamp01(speed / 10) * 7 + (sprinting ? 5 : 0);
    const targetFov = this.fovBase + speedFov + (this.cinematic?.fov ? this.cinematic.fov - this.fovBase : 0);
    this.fov = damp(this.fov, targetFov, 5, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  #place(dt, dist = this.currentDistance, velocity = null, sprinting = false, speed = 0) {
    const cam = this.camera;
    const cosP = Math.cos(this.pitch);
    const dirX = Math.sin(this.yaw) * cosP;
    const dirZ = Math.cos(this.yaw) * cosP;
    const dirY = Math.sin(this.pitch);

    let px = this.smoothTarget.x + dirX * dist;
    let py = this.smoothTarget.y - dirY * dist + 0.35;
    let pz = this.smoothTarget.z + dirZ * dist;

    // shoulder offset (slight, so the character sits left of centre)
    const sx = Math.cos(this.yaw) * this.shoulder * 0.5;
    const sz = -Math.sin(this.yaw) * this.shoulder * 0.5;
    px += sx; pz += sz;

    // never clip through the ground
    const ground = this.world.heightAt(px, pz) + 0.55;
    if (py < ground) py = ground;

    if (this.cinematic) {
      const c = this.cinematic;
      c.t += dt;
      const t = clamp01(c.t / (c.duration || 1));
      const e = t * t * (3 - 2 * t);
      if (c.from) {
        px = lerp(c.from.x, px, e); py = lerp(c.from.y, py, e); pz = lerp(c.from.z, pz, e);
      }
      if (t >= 1) this.cinematic = null;
    }

    // shake
    this.shake.update(dt);
    px += this.shake.x.value;
    py += this.shake.y.value;
    pz += this.shake.z.value;

    cam.position.set(px, py, pz);
    this.lookAt.copy(this.smoothTarget);
    if (this.lockTarget && this.lockTarget.alive) {
      this.lookAt.lerp(this._v.copy(this.lockTarget.position).setY(this.lockTarget.position.y + this.lockTarget.height * 0.55), 0.45);
    }
    cam.lookAt(this.lookAt);

    // lean into strafing: a small roll sells speed without motion sickness
    if (velocity) {
      const lateral = clamp(velocity.x * 0.02, -0.06, 0.06);
      this.lean = damp(this.lean, lateral, 6, dt);
      cam.rotateZ(this.lean);
    }
  }

  #collide(desired) {
    const origin = this.smoothTarget;
    const cosP = Math.cos(this.pitch);
    const dir = this._ray.set(Math.sin(this.yaw) * cosP, -Math.sin(this.pitch), Math.cos(this.yaw) * cosP).normalize();
    // sample a few points along the arm, stop at the first that's inside the world
    let best = desired;
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * desired;
      const x = origin.x + dir.x * t;
      const y = origin.y + dir.y * t + 0.35;
      const z = origin.z + dir.z * t;
      const h = this.world.heightAt(x, z);
      if (y < h + 0.45) {
        best = Math.max(1.1, t - 0.55);
        break;
      }
    }
    return best;
  }

  /** Direction the player should move for a given input axis. */
  moveDirection(x, y, out = new THREE.Vector3()) {
    const yaw = this.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    out.set(fx * y + rx * x, 0, fz * y + rz * x);
    if (out.lengthSq() > 1) out.normalize();
    return out;
  }
}

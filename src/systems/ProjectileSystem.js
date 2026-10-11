import * as THREE from 'three';
import { clamp01 } from '../core/MathUtils.js';
import { makeGlowTexture } from './VFX.js';

const SHAPES = {
  orb: () => new THREE.SphereGeometry(0.22, 12, 10),
  bigOrb: () => new THREE.SphereGeometry(0.45, 16, 12),
  arrow: () => new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6).rotateX(Math.PI / 2),
  shard: () => new THREE.ConeGeometry(0.12, 0.6, 5).rotateX(Math.PI / 2),
  fireball: () => new THREE.IcosahedronGeometry(0.3, 1),
  web: () => new THREE.IcosahedronGeometry(0.25, 0),
  hand: () => new THREE.BoxGeometry(0.22, 0.22, 0.3),
  water: () => new THREE.ConeGeometry(0.18, 0.7, 8).rotateX(Math.PI / 2),
  kunai: () => new THREE.OctahedronGeometry(0.16, 0),
  skull: () => new THREE.DodecahedronGeometry(0.26, 0),
};

/**
 * Every travelling thing: arrows, fox-fire orbs, web globs, severed hands,
 * water whips and the player's thrown weapons. Pooled, homing-capable, and it
 * reports hits back through the combat system so damage numbers stay honest.
 */
export class ProjectileSystem {
  constructor({ world, combat, vfx, audio }) {
    this.world = world;
    this.combat = combat;
    this.vfx = vfx;
    this.audio = audio;
    this.list = [];
    this.pool = new Map();      // shape -> array of meshes
    this.group = new THREE.Group();
    this.group.name = 'projectiles';
    this.geometries = {};
    for (const [k, make] of Object.entries(SHAPES)) this.geometries[k] = make();
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
  }

  #mesh(shape, color, scale) {
    const key = `${shape}:${color}`;
    if (!this.pool.has(key)) this.pool.set(key, []);
    const arr = this.pool.get(key);
    let m = arr.pop();
    if (!m) {
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.95, depthWrite: false,
        blending: THREE.AdditiveBlending, map: makeGlowTexture(),
      });
      m = new THREE.Mesh(this.geometries[shape] || this.geometries.orb, mat);
      m.userData.poolKey = key;
    }
    m.material.color.setHex(color);
    m.material.opacity = 0.95;
    m.scale.setScalar(scale);
    m.visible = true;
    this.group.add(m);
    return m;
  }

  #recycle(m) {
    this.group.remove(m);
    const arr = this.pool.get(m.userData.poolKey);
    if (arr && arr.length < 48) arr.push(m);
    else m.material.dispose();
  }

  spawn({
    owner = null, faction = 'enemy', position, direction, speed = 18, radius = 0.35,
    damage = 10, type = 'spirit', statuses = null, life = 3.2, homing = 0, pierce = 0,
    shape = 'orb', color = 0xff7a2a, scale = 1, gravity = 0, spin = 6, trail = true,
    trailColor = null, sfx = null, onHit = null, onExpire = null, wobble = 0,
  }) {
    const mesh = this.#mesh(shape, color, scale);
    mesh.position.copy(position);
    const dir = new THREE.Vector3().copy(direction).normalize();
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    const p = {
      owner, faction, position: mesh.position, velocity: dir.multiplyScalar(speed),
      radius, damage, type, statuses, life, t: 0, homing, pierce, hits: new Set(),
      gravity, spin, mesh, trail: trail && !!this.vfx, trailColor: trailColor ?? color,
      onHit, onExpire, wobble, dead: false, sfx,
    };
    this.list.push(p);
    if (sfx) this.audio?.play(sfx, { volume: 0.5, position: mesh.position });
    return p;
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;

      // homing: steer toward the nearest hostile
      if (p.homing > 0) {
        const target = this.combat.nearestHostile(p.position, p.faction, 40);
        if (target) {
          const want = this._v.copy(target.center(this._v2)).sub(p.position).normalize();
          const speed = p.velocity.length();
          p.velocity.lerp(want.multiplyScalar(speed), clamp01(p.homing * dt)).setLength(speed);
        }
      }
      if (p.gravity) p.velocity.y -= p.gravity * dt;
      p.position.addScaledVector(p.velocity, dt);
      if (p.wobble) {
        p.position.y += Math.sin(p.t * 22) * p.wobble * dt;
      }
      p.mesh.quaternion.setFromUnitVectors(_fwd, this._v.copy(p.velocity).normalize());
      if (p.spin) p.mesh.rotateZ(p.spin * dt);

      if (p.trail) {
        this.vfx.trail(p.position, this._v2.copy(p.velocity).multiplyScalar(-0.5), {
          color: p.trailColor, size: 0.22 * p.mesh.scale.x, life: 0.28, speed: 0.2,
        });
      }

      // actor collisions
      let hitSomething = false;
      for (const a of this.combat.actors) {
        if (!a.alive || a === p.owner || a.faction === p.faction) continue;
        if (p.hits.has(a)) continue;
        const dx = a.position.x - p.position.x;
        const dz = a.position.z - p.position.z;
        const dy = p.position.y - (a.position.y + a.height * 0.5);
        if (Math.abs(dy) > a.height * 0.9) continue;
        if (dx * dx + dz * dz > (p.radius + a.radius) ** 2) continue;
        p.hits.add(a);
        hitSomething = true;
        const res = this.combat.resolveAttack(p.owner, a, {
          damage: p.damage, type: p.type, statuses: p.statuses, canBlock: true, canParry: true,
          position: p.position.clone(), direction: this._v.copy(p.velocity).setY(0).normalize(),
        });
        p.onHit?.(a, res, p);
        if (p.pierce <= 0) break;
        p.pierce--;
      }

      // terrain / lifetime
      const ground = this.world.heightAt(p.position.x, p.position.z);
      const expired = p.t >= p.life;
      const underground = p.position.y <= ground || p.position.y > ground + 90;

      if (hitSomething && p.pierce <= 0 && p.hits.size > 0 && !p.pierce) {
        this.#impact(p, expired || underground);
      }
      if (underground || expired) {
        this.#impact(p, true);
      }
      if (p.dead) {
        this.#recycle(p.mesh);
        this.list.splice(i, 1);
      }
    }
  }

  #impact(p, hard) {
    if (p.dead) return;
    if (hard) p.onExpire?.(p);
    this.vfx?.burst(p.position, hard ? 14 : 8, {
      color: [p.trailColor, 0xffffff], speed: 6, size: 0.3, life: 0.4, drag: 4,
    });
    if (p.type === "fire") this.vfx?.firePatch(p.position, 1.6, 3.5);
    p.dead = true;
  }

  clear() {
    for (const p of this.list) this.#recycle(p.mesh);
    this.list.length = 0;
  }

  dispose() {
    this.clear();
    for (const g of Object.values(this.geometries)) g.dispose();
    for (const arr of this.pool.values()) for (const m of arr) m.material.dispose();
    this.pool.clear();
  }
}

const _fwd = new THREE.Vector3(0, 0, 1);

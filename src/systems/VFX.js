import * as THREE from 'three';
import { makeRng, clamp, clamp01, lerp, rand } from '../core/MathUtils.js';

/**
 * VFX — one pooled particle system, plus a set of mesh-based set-pieces
 * (slash arcs, shockwaves, beams, pillars, bolts, ghosts).
 *
 * Everything is pooled and reused: no allocation during a fight, no GC spikes
 * when nine abilities go off at once.
 */

const PARTICLE_VERT = /* glsl */`
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  attribute float aSpin;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSpin;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vSpin = aSpin;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (300.0 / max(-mv.z, 0.001));
    gl_Position = projectionMatrix * mv;
  }
`;

const PARTICLE_FRAG = /* glsl */`
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSpin;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float c = cos(vSpin), s = sin(vSpin);
    uv = mat2(c, -s, s, c) * uv;
    float d = length(uv);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.06, d);
    a *= a;
    gl_FragColor = vec4(vColor * (0.6 + a * 0.8), vAlpha * a);
  }
`;

class ParticlePool {
  constructor(scene, capacity = 2400) {
    this.capacity = capacity;
    this.count = 0;
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    this.alphas = new Float32Array(capacity);
    this.spins = new Float32Array(capacity);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.size0 = new Float32Array(capacity);
    this.size1 = new Float32Array(capacity);
    this.spinV = new Float32Array(capacity);
    this.mode = new Uint8Array(capacity);      // 0 = normal, 1 = ground-hugging flame, 2 = sparkle
    this.head = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    geo.setAttribute('aSpin', new THREE.BufferAttribute(this.spins, 1));
    geo.setDrawRange(0, 0);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    const mat = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT, fragmentShader: PARTICLE_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
    this.geo = geo;
  }

  spawn(o) {
    const i = this.head;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
    const i3 = i * 3;
    this.positions[i3] = o.x; this.positions[i3 + 1] = o.y; this.positions[i3 + 2] = o.z;
    this.vel[i3] = o.vx || 0; this.vel[i3 + 1] = o.vy || 0; this.vel[i3 + 2] = o.vz || 0;
    _c.set(o.color ?? 0xffffff);
    this.colors[i3] = _c.r; this.colors[i3 + 1] = _c.g; this.colors[i3 + 2] = _c.b;
    this.size0[i] = o.size ?? 0.4;
    this.size1[i] = o.size1 ?? (o.size ?? 0.4) * 0.1;
    this.sizes[i] = this.size0[i];
    this.alphas[i] = o.alpha ?? 1;
    this.spins[i] = Math.random() * 6.283;
    this.spinV[i] = o.spin ?? 0;
    this.life[i] = 0;
    this.maxLife[i] = o.life ?? 0.7;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 1.2;
    this.mode[i] = o.mode ?? 0;
    return i;
  }

  update(dt) {
    const n = this.count;
    let alive = 0;
    for (let i = 0; i < n; i++) {
      if (this.maxLife[i] <= 0) continue;
      this.life[i] += dt;
      const t = this.life[i] / this.maxLife[i];
      if (t >= 1) { this.maxLife[i] = 0; this.alphas[i] = 0; continue; }
      const i3 = i * 3;
      const d = 1 - Math.min(0.95, this.drag[i] * dt);
      this.vel[i3] *= d;
      this.vel[i3 + 1] = this.vel[i3 + 1] * d - this.grav[i] * dt;
      this.vel[i3 + 2] *= d;
      this.positions[i3] += this.vel[i3] * dt;
      this.positions[i3 + 1] += this.vel[i3 + 1] * dt;
      this.positions[i3 + 2] += this.vel[i3 + 2] * dt;
      this.sizes[i] = lerp(this.size0[i], this.size1[i], t);
      this.spins[i] += this.spinV[i] * dt;
      if (this.mode[i] === 2) {
        this.alphas[i] = (1 - t) * (0.4 + 0.6 * Math.abs(Math.sin(this.life[i] * 9)));
      } else {
        this.alphas[i] = (1 - t) * (this.mode[i] === 1 ? 1 : (1 - t * 0.2));
      }
      alive++;
    }
    this.geo.setDrawRange(0, this.count);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aSpin.needsUpdate = true;
    return alive;
  }
}

const _c = new THREE.Color();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export class VFX {
  constructor(scene) {
    this.scene = scene;
    this.pool = new ParticlePool(scene, 2600);
    this.rng = makeRng(0xa11ce);
    this.transient = [];       // {mesh, t, dur, update}
    this.decals = [];
    this.maxDecals = 48;
    this.quality = 1;

    // shared geometries / materials for set pieces
    this.geo = {
      quad: new THREE.PlaneGeometry(1, 1),
      ring: new THREE.RingGeometry(0.72, 1, 40),
      sphere: new THREE.SphereGeometry(1, 14, 10),
      cyl: new THREE.CylinderGeometry(1, 1, 1, 12, 1, true),
      torus: new THREE.TorusGeometry(1, 0.06, 6, 40),
    };
    this.glowTex = makeGlowTexture();
  }

  setQuality(q) { this.quality = q; }

  // ───────────────────────────────────────────────────────── particles
  burst(pos, count, opts = {}) {
    const n = Math.round(count * this.quality);
    const speed = opts.speed ?? 4;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283;
      const p = Math.acos(2 * Math.random() - 1);
      const s = speed * (0.35 + Math.random() * 0.9);
      const dir = opts.dir;
      let vx = Math.sin(p) * Math.cos(a) * s;
      let vy = Math.cos(p) * s;
      let vz = Math.sin(p) * Math.sin(a) * s;
      if (dir) {
        vx = lerp(vx, dir.x * s * 1.6, opts.bias ?? 0.6);
        vy = lerp(vy, dir.y * s * 1.6, opts.bias ?? 0.6);
        vz = lerp(vz, dir.z * s * 1.6, opts.bias ?? 0.6);
      }
      this.pool.spawn({
        x: pos.x + (Math.random() - 0.5) * (opts.spread ?? 0.3),
        y: pos.y + (Math.random() - 0.5) * (opts.spread ?? 0.3),
        z: pos.z + (Math.random() - 0.5) * (opts.spread ?? 0.3),
        vx, vy, vz,
        color: Array.isArray(opts.color) ? opts.color[(Math.random() * opts.color.length) | 0] : (opts.color ?? 0xffffff),
        size: (opts.size ?? 0.35) * (0.6 + Math.random() * 0.8),
        size1: opts.size1,
        life: (opts.life ?? 0.7) * (0.6 + Math.random() * 0.8),
        gravity: opts.gravity ?? 0,
        drag: opts.drag ?? 1.4,
        mode: opts.mode ?? 0,
        spin: (Math.random() - 0.5) * 8,
      });
    }
  }

  trail(pos, dir, opts = {}) {
    this.pool.spawn({
      x: pos.x, y: pos.y, z: pos.z,
      vx: (dir?.x ?? 0) * (opts.speed ?? 1) + (Math.random() - 0.5),
      vy: (dir?.y ?? 0) * (opts.speed ?? 1) + (Math.random() - 0.5),
      vz: (dir?.z ?? 0) * (opts.speed ?? 1) + (Math.random() - 0.5),
      color: opts.color ?? 0xffffff,
      size: opts.size ?? 0.3, life: opts.life ?? 0.35, gravity: opts.gravity ?? 0, drag: opts.drag ?? 2.4,
    });
  }

  // ──────────────────────────────────────────────────── mesh set pieces
  #add(mesh, dur, update, { fade = true } = {}) {
    this.scene.add(mesh);
    const rec = { mesh, t: 0, dur, update, fade, mat: mesh.material };
    this.transient.push(rec);
    return rec;
  }

  /** Crescent slash arc — the signature of every blade technique. */
  slashArc(pos, angleY, { radius = 2.2, color = 0xffffff, width = 0.55, dur = 0.24, tilt = 0.4, life = 1 } = {}) {
    const geo = new THREE.RingGeometry(radius * 0.42, radius, 24, 1, -1.1, 2.2);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.95, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.rotation.set(-Math.PI / 2 + tilt, 0, 0);
    mesh.rotation.z = -angleY;
    mesh.renderOrder = 8;
    this.#add(mesh, dur, (m, t) => {
      const e = 1 - (1 - t) ** 3;
      m.scale.setScalar(lerp(0.7, 1.35, e));
      m.material.opacity = 0.95 * (1 - t) ** 1.4 * life;
    });
    this.burst(pos, 10 * this.quality, { color, speed: 5, size: 0.25, life: 0.3, spread: 0.6, dir: _v1.set(Math.sin(angleY), 0.2, Math.cos(angleY)) });
  }

  /** Expanding ground ring (impacts, slams, tail sweeps). */
  shockwave(pos, { color = 0xffc46a, radius = 6, dur = 0.6, opacity = 0.9, tilt = 0 } = {}) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.geo.ring, mat.clone());
    mesh.position.copy(pos);
    mesh.rotation.x = -Math.PI / 2 + tilt;
    mesh.renderOrder = 7;
    this.#add(mesh, dur, (m, t) => {
      const e = easeOutRing(t);
      m.scale.setScalar(lerp(0.4, radius, e));
      m.material.opacity = opacity * (1 - t) ** 1.5;
    });
  }

  /** Instant beam between two points (Gengetsu, spirit lances). */
  beam(from, to, { color = 0xbfe6ff, width = 0.5, dur = 0.3 } = {}) {
    const dir = _v1.copy(to).sub(from);
    const len = dir.length();
    if (len < 0.01) return;
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.geo.cyl, mat);
    mesh.position.copy(from).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(UP, _v2.copy(dir).normalize());
    mesh.scale.set(width, len, width);
    mesh.renderOrder = 9;
    this.#add(mesh, dur, (m, t) => {
      m.material.opacity = 0.95 * (1 - t) ** 1.6;
      m.scale.x = width * (1 + t * 1.6);
      m.scale.z = width * (1 + t * 1.6);
    });
    for (let i = 0; i < 8 * this.quality; i++) {
      const p = Math.random();
      this.burst(_v2.copy(from).addScaledVector(dir, p), 2, { color, speed: 2, size: 0.3, life: 0.3 });
    }
  }

  /** Vertical pillar of fox-fire. */
  flamePillar(pos, { color = 0xff6a2a, height = 14, radius = 3, dur = 0.9 } = {}) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(this.geo.cyl, mat);
    mesh.position.copy(pos).add(_v1.set(0, height / 2, 0));
    mesh.scale.set(radius * 0.5, height, radius * 0.5);
    mesh.renderOrder = 9;
    this.#add(mesh, dur, (m, t) => {
      const e = t < 0.25 ? t / 0.25 : 1;
      m.scale.set(radius * (0.3 + e * 0.7) * (1 + t * 0.4), height * e, radius * (0.3 + e * 0.7) * (1 + t * 0.4));
      m.material.opacity = 0.85 * (1 - t) ** 1.2;
    });
    for (let i = 0; i < 60 * this.quality; i++) {
      this.pool.spawn({
        x: pos.x + (Math.random() - 0.5) * radius * 1.6,
        y: pos.y + Math.random() * 1.2,
        z: pos.z + (Math.random() - 0.5) * radius * 1.6,
        vx: (Math.random() - 0.5) * 3, vy: 6 + Math.random() * 12, vz: (Math.random() - 0.5) * 3,
        color: Math.random() < 0.4 ? 0xffd08a : color,
        size: 0.5 + Math.random() * 0.7, life: 0.6 + Math.random() * 0.6, gravity: -3, drag: 0.6, mode: 1,
      });
    }
    this.shockwave(pos, { color, radius: radius * 2.2, dur: 0.5, opacity: 0.7 });
  }

  /** Jagged bolt from A to B (Raijin's Tail). */
  lightning(from, to, { color = 0xa8d8ff, dur = 0.25, segments = 9, jag = 1.1 } = {}) {
    const pts = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const p = _v1.copy(from).lerp(to, t);
      if (i > 0 && i < segments) {
        p.x += (Math.random() - 0.5) * jag;
        p.y += (Math.random() - 0.5) * jag * 0.5;
        p.z += (Math.random() - 0.5) * jag;
      }
      pts.push(p.clone());
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    const line = new THREE.Line(geo, mat);
    line.renderOrder = 10;
    this.#add(line, dur, (m, t) => { m.material.opacity = (1 - t) ** 2; });
    this.burst(to, 14 * this.quality, { color, speed: 7, size: 0.3, life: 0.4 });
  }

  /** Swirling summon circle on the ground. */
  summonCircle(pos, { color = 0xffa53c, radius = 2.6, dur = 1.1 } = {}) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.geo.ring, mat);
    mesh.position.copy(pos).add(_v1.set(0, 0.06, 0));
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 6;
    this.#add(mesh, dur, (m, t) => {
      m.scale.setScalar(lerp(0.2, radius, t < 0.3 ? t / 0.3 : 1));
      m.rotation.z += 0.06;
      m.material.opacity = 0.8 * (1 - t) ** 1.4;
    });
    for (let i = 0; i < 34 * this.quality; i++) {
      const a = (i / 34) * 6.283;
      this.pool.spawn({
        x: pos.x + Math.cos(a) * radius, y: pos.y, z: pos.z + Math.sin(a) * radius,
        vx: -Math.cos(a) * 1.5, vy: 2.4 + Math.random() * 2.4, vz: -Math.sin(a) * 1.5,
        color, size: 0.4, life: 0.7 + Math.random() * 0.4, gravity: -1.5, drag: 0.8, mode: 1,
      });
    }
  }

  /** Glowing orb that lives on its own (fox-fire projectiles, wisps). */
  orb(pos, { color = 0x63d6ff, radius = 0.5, dur = 0.5 } = {}) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(this.geo.sphere, mat);
    mesh.position.copy(pos);
    mesh.scale.setScalar(radius);
    mesh.renderOrder = 9;
    this.#add(mesh, dur, (m, t) => {
      m.material.opacity = 0.9 * (1 - t) ** 1.5;
      m.scale.setScalar(radius * (1 + t * 0.8));
    });
  }

  /** Soft additive glow sprite that follows an entity (aura, charge-up). */
  glow(color = 0xff7a2a, size = 2) {
    const mat = new THREE.SpriteMaterial({
      map: this.glowTex, color, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.setScalar(size);
    sprite.renderOrder = 8;
    return sprite;
  }

  /** Burning ground patch left by fox-fire. */
  firePatch(pos, radius = 3, dur = 6) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff6a2a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(this.geo.ring, mat);
    mesh.position.copy(pos).add(_v1.set(0, 0.08, 0));
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.setScalar(radius);
    mesh.renderOrder = 5;
    mesh.userData.emit = 0;
    this.#add(mesh, dur, (m, t, dt) => {
      m.material.opacity = 0.45 * (1 - t * 0.4) * (0.7 + 0.3 * Math.sin(t * 30));
      m.userData.emit += dt;
      if (m.userData.emit > 0.05) {
        m.userData.emit = 0;
        const a = Math.random() * 6.283;
        const r = Math.random() * radius;
        this.pool.spawn({
          x: pos.x + Math.cos(a) * r, y: pos.y + 0.1, z: pos.z + Math.sin(a) * r,
          vx: 0, vy: 1.6 + Math.random() * 2.4, vz: 0,
          color: Math.random() < 0.5 ? 0xff6a2a : 0xffd08a,
          size: 0.35 + Math.random() * 0.4, life: 0.5 + Math.random() * 0.4, gravity: -2.2, drag: 0.8, mode: 1,
        });
      }
    }, { fade: false });
  }

  /** Persistent spirit zone (darkness curtain, fox grass). */
  zone(pos, radius, { color = 0x1a0f18, dur = 12, height = 6, opacity = 0.5 } = {}) {
    const geo = new THREE.CylinderGeometry(radius, radius, height, 20, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos).add(_v1.set(0, height / 2, 0));
    mesh.renderOrder = 4;
    this.#add(mesh, dur, (m, t) => {
      m.material.opacity = opacity * Math.min(1, t * 6) * (1 - Math.max(0, t - 0.85) / 0.15);
      m.rotation.y += 0.004;
    }, { fade: false });
  }

  /** Blood / spirit spray on a hit. */
  hitSpray(pos, dir, { color = 0xc8443c, count = 14, power = 1 } = {}) {
    this.burst(pos, count * this.quality, {
      color, speed: 6 * power, size: 0.22, life: 0.45, gravity: 9, drag: 2.2, dir, bias: 0.7, spread: 0.25,
    });
    this.burst(pos, 6 * this.quality, { color: 0xffd08a, speed: 7 * power, size: 0.16, life: 0.25, drag: 3, dir, bias: 0.8 });
  }

  /** Bright flash (crits, parries, executions). */
  flash(pos, { color = 0xffffff, size = 1.6, dur = 0.22 } = {}) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    sprite.position.copy(pos);
    sprite.renderOrder = 11;
    this.#add(sprite, dur, (m, t) => {
      m.material.opacity = (1 - t) ** 2;
      m.scale.setScalar(size * (0.6 + t * 1.8));
    });
    this.burst(pos, 12 * this.quality, { color, speed: 8, size: 0.3, life: 0.3, drag: 3 });
  }

  /** Dirt / snow puff under a footfall or landing. */
  footPuff(pos, { color = 0x8a7a5a, count = 6 } = {}) {
    this.burst(pos, count * this.quality, {
      color, speed: 1.6, size: 0.3, life: 0.5, gravity: 1.5, drag: 3, spread: 0.3,
    });
  }

  /** Leaving a mark: scorch decals, blood pools. */
  decal(pos, { color = 0x20181a, size = 2, dur = 20, normalY = 0 } = {}) {
    if (this.decals.length >= this.maxDecals) {
      const old = this.decals.shift();
      this.scene.remove(old.mesh);
      old.mesh.geometry.dispose();
      old.mesh.material.dispose();
    }
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false });
    const mesh = new THREE.Mesh(this.geo.quad, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.random() * 6.283;
    mesh.position.copy(pos).add(_v1.set(0, 0.05 + normalY, 0));
    mesh.scale.setScalar(size * (0.8 + Math.random() * 0.5));
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    const rec = { mesh, t: 0, dur, update: (m, t) => { m.material.opacity = 0.55 * (1 - Math.max(0, t - 0.8) / 0.2); }, fade: false, decal: true };
    this.transient.push(rec);
    this.decals.push(rec);
  }

  /** Spirit flame licking around a transformed/possessed body. */
  aura(pos, { color = 0xff2e2e, dur = 0.6, size = 2 } = {}) {
    for (let i = 0; i < 26 * this.quality; i++) {
      const a = Math.random() * 6.283;
      const r = size * (0.4 + Math.random() * 0.8);
      this.pool.spawn({
        x: pos.x + Math.cos(a) * r, y: pos.y + Math.random() * 1.8, z: pos.z + Math.sin(a) * r,
        vx: Math.cos(a) * 1.2, vy: 3 + Math.random() * 3, vz: Math.sin(a) * 1.2,
        color: Math.random() < 0.5 ? color : 0xffd08a,
        size: 0.4 + Math.random() * 0.5, life: dur * (0.6 + Math.random() * 0.6), gravity: -1.5, drag: 1.0, mode: 1,
      });
    }
  }

  /** Petals / leaves drifting (shrine ambience, Kagura). */
  petals(pos, { color = 0xf0a8b8, count = 12, radius = 3 } = {}) {
    for (let i = 0; i < count * this.quality; i++) {
      const a = Math.random() * 6.283;
      this.pool.spawn({
        x: pos.x + Math.cos(a) * radius * Math.random(),
        y: pos.y + 1 + Math.random() * 2,
        z: pos.z + Math.sin(a) * radius * Math.random(),
        vx: (Math.random() - 0.5) * 2, vy: -0.6 - Math.random(), vz: (Math.random() - 0.5) * 2,
        color, size: 0.28 + Math.random() * 0.2, life: 1.6 + Math.random(), gravity: 0.4, drag: 0.4, mode: 2, spin: 6,
      });
    }
  }

  update(dt) {
    this.pool.update(dt);
    for (let i = this.transient.length - 1; i >= 0; i--) {
      const rec = this.transient[i];
      rec.t += dt;
      const t = clamp01(rec.t / rec.dur);
      rec.update?.(rec.mesh, t, dt);
      if (rec.t >= rec.dur) {
        this.scene.remove(rec.mesh);
        rec.mesh.geometry?.dispose?.();
        if (rec.mesh.material?.map !== this.glowTex) rec.mesh.material?.dispose?.();
        else rec.mesh.material?.dispose?.();
        this.transient.splice(i, 1);
        if (rec.decal) {
          const di = this.decals.indexOf(rec);
          if (di >= 0) this.decals.splice(di, 1);
        }
      }
    }
  }

  clear() {
    for (const rec of this.transient) {
      this.scene.remove(rec.mesh);
      rec.mesh.geometry?.dispose?.();
      rec.mesh.material?.dispose?.();
    }
    this.transient.length = 0;
    this.decals.length = 0;
  }
}

function easeOutRing(t) { return 1 - (1 - t) ** 3; }

/** Soft radial gradient sprite, generated once. */
export function makeGlowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

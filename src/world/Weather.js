import * as THREE from 'three';
import { clamp, clamp01, lerp, makeRng } from '../core/MathUtils.js';
import { makeGlowTexture } from '../systems/VFX.js';

/**
 * Weather. One recycled particle cloud that follows the camera, plus a state
 * machine that leans on the Sky (cloudiness/dim/tint), the fog and the audio
 * ambience so a storm reads in every channel at once.
 */
const PRESETS = {
  clear:    { rain: 0, snow: 0, mist: 0.0, wind: 0.4, cloudiness: 0.22, dim: 0.0,  fogBoost: 1.0, ambience: 'day' },
  cloudy:   { rain: 0, snow: 0, mist: 0.05, wind: 0.7, cloudiness: 0.68, dim: 0.12, fogBoost: 1.15, ambience: 'wind' },
  mist:     { rain: 0, snow: 0, mist: 0.55, wind: 0.25, cloudiness: 0.5, dim: 0.16, fogBoost: 2.1, ambience: 'wind' },
  rain:     { rain: 0.85, snow: 0, mist: 0.22, wind: 0.9, cloudiness: 0.92, dim: 0.34, fogBoost: 1.5, ambience: 'rain' },
  storm:    { rain: 1.0, snow: 0, mist: 0.3, wind: 1.6, cloudiness: 1.0, dim: 0.5, fogBoost: 1.7, ambience: 'storm' },
  snow:     { rain: 0, snow: 0.8, mist: 0.18, wind: 0.5, cloudiness: 0.75, dim: 0.2, fogBoost: 1.35, ambience: 'wind' },
  blizzard: { rain: 0, snow: 1.0, mist: 0.4, wind: 1.8, cloudiness: 0.95, dim: 0.42, fogBoost: 2.2, ambience: 'wind' },
  petals:   { rain: 0, snow: 0.25, mist: 0.0, wind: 0.5, cloudiness: 0.3, dim: 0.02, fogBoost: 1.0, ambience: 'village', color: 0xf0a8b8 },
  embers:   { rain: 0, snow: 0.3, mist: 0.05, wind: 0.6, cloudiness: 0.4, dim: 0.1, fogBoost: 1.1, ambience: 'forge', color: 0xff7a2a },
};

export class Weather {
  constructor(scene, world, sky, audio) {
    this.scene = scene;
    this.world = world;
    this.sky = sky;
    this.audio = audio;
    this.current = 'clear';
    this.target = 'clear';
    this.blend = 1;
    this.time = 0;
    this.changeTimer = 90 + Math.random() * 120;
    this.rng = makeRng(0x9a11);
    this.vel = new THREE.Vector3();
    this.count = 2600;
    this.#build();
  }

  #build() {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(this.count * 3);
    const seeds = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 90;
      pos[i * 3 + 1] = Math.random() * 44;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 90;
      seeds[i] = Math.random();
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.mat = new THREE.PointsMaterial({
      color: 0xcfe4ff, size: 0.16, sizeAttenuation: true,
      transparent: true, opacity: 0, depthWrite: false,
      map: makeGlowTexture(), blending: THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.points.renderOrder = 6;
    this.scene.add(this.points);

    // a second, slower layer for snow/petals (bigger flakes, less of them)
    const geo2 = new THREE.BufferGeometry();
    const pos2 = new Float32Array(700 * 3);
    for (let i = 0; i < 700; i++) {
      pos2[i * 3] = (Math.random() - 0.5) * 90;
      pos2[i * 3 + 1] = Math.random() * 40;
      pos2[i * 3 + 2] = (Math.random() - 0.5) * 90;
    }
    geo2.setAttribute('position', new THREE.BufferAttribute(pos2, 3));
    geo2.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.mat2 = new THREE.PointsMaterial({
      color: 0xffffff, size: 0.42, sizeAttenuation: true,
      transparent: true, opacity: 0, depthWrite: false, map: makeGlowTexture(),
    });
    this.points2 = new THREE.Points(geo2, this.mat2);
    this.points2.frustumCulled = false;
    this.points2.visible = false;
    this.scene.add(this.points2);
  }

  set(name, { instant = false } = {}) {
    if (!PRESETS[name] || name === this.target) return;
    this.current = instant ? name : this.target;
    this.target = name;
    this.blend = instant ? 1 : 0;
    const p = PRESETS[name];
    if (p.color) {
      this.mat.color.setHex(p.color);
      this.mat2.color.setHex(p.color);
    } else {
      this.mat.color.setHex(0xcfe4ff);
      this.mat2.color.setHex(0xffffff);
    }
    this.audio?.setAmbience?.(p.ambience, { fade: instant ? 0.2 : 4 });
  }

  /** Region tables decide the odds; the state machine does the rest. */
  pickFor(region) {
    const w = region?.weather || { clear: 4, cloudy: 3, rain: 2 };
    let total = 0;
    for (const v of Object.values(w)) total += v;
    let r = Math.random() * total;
    for (const [k, v] of Object.entries(w)) {
      r -= v;
      if (r <= 0 && PRESETS[k]) return k;
    }
    return 'clear';
  }

  update(dt, camera, region) {
    this.time += dt;
    this.blend = Math.min(1, this.blend + dt / 6);

    this.changeTimer -= dt;
    if (this.changeTimer <= 0) {
      this.changeTimer = 150 + Math.random() * 220;
      if (Math.random() < 0.65) this.set(this.pickFor(region));
    }

    const a = PRESETS[this.current] || PRESETS.clear;
    const b = PRESETS[this.target] || PRESETS.clear;
    const t = this.blend;
    const p = {
      rain: lerp(a.rain, b.rain, t),
      snow: lerp(a.snow, b.snow, t),
      mist: lerp(a.mist, b.mist, t),
      wind: lerp(a.wind, b.wind, t),
      cloudiness: lerp(a.cloudiness, b.cloudiness, t),
      dim: lerp(a.dim, b.dim, t),
      fogBoost: lerp(a.fogBoost, b.fogBoost, t),
    };
    this.state = p;
    this.sky?.setWeather({ cloudiness: p.cloudiness, dim: p.dim });

    // ── particles ────────────────────────────────────────────────────
    const amount = Math.max(p.rain, p.snow);
    this.points.visible = amount > 0.02;
    this.points2.visible = p.snow > 0.05;
    if (!this.points.visible && !this.points2.visible) return;

    const cam = camera.position;
    const windX = Math.sin(this.time * 0.13) * 3.2 * p.wind + 2.4 * p.wind;
    const windZ = Math.cos(this.time * 0.11) * 2.0 * p.wind;

    const arr = this.points.geometry.attributes.position.array;
    const fallSpeed = p.rain > p.snow ? 46 : 3.4;
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      arr[i3] += (windX + (i % 7) * 0.2) * dt * (p.rain > p.snow ? 1.4 : 1);
      arr[i3 + 2] += windZ * dt;
      arr[i3 + 1] -= fallSpeed * dt * (0.7 + (i % 11) / 22);
      // wrap around the camera
      let dx = arr[i3] - cam.x;
      let dz = arr[i3 + 2] - cam.z;
      if (dx > 45) arr[i3] -= 90; else if (dx < -45) arr[i3] += 90;
      if (dz > 45) arr[i3 + 2] -= 90; else if (dz < -45) arr[i3 + 2] += 90;
      if (arr[i3 + 1] < cam.y - 12) arr[i3 + 1] = cam.y + 30;
      else if (arr[i3 + 1] > cam.y + 34) arr[i3 + 1] = cam.y - 8;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.mat.opacity = clamp01(amount * 0.75);
    this.mat.size = p.rain > p.snow ? 0.11 : 0.17;

    if (this.points2.visible) {
      const arr2 = this.points2.geometry.attributes.position.array;
      for (let i = 0; i < 700; i++) {
        const i3 = i * 3;
        arr2[i3] += (Math.sin(this.time * 0.7 + i) * 1.4 + windX * 0.6) * dt;
        arr2[i3 + 2] += (Math.cos(this.time * 0.6 + i * 1.7) * 1.1 + windZ * 0.6) * dt;
        arr2[i3 + 1] -= 1.9 * dt * (0.6 + (i % 9) / 18);
        const dx = arr2[i3] - cam.x;
        const dz = arr2[i3 + 2] - cam.z;
        if (dx > 45) arr2[i3] -= 90; else if (dx < -45) arr2[i3] += 90;
        if (dz > 45) arr2[i3 + 2] -= 90; else if (dz < -45) arr2[i3 + 2] += 90;
        if (arr2[i3 + 1] < cam.y - 6) arr2[i3 + 1] = cam.y + 26;
      }
      this.points2.geometry.attributes.position.needsUpdate = true;
      this.mat2.opacity = clamp01(p.snow * 0.85);
    }
  }

  dispose() {
    this.points.geometry.dispose();
    this.points2.geometry.dispose();
    this.mat.dispose();
    this.mat2.dispose();
    this.scene.remove(this.points, this.points2);
  }
}

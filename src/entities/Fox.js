import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { clamp, clamp01, lerp, damp, dampAngle, ease } from '../core/MathUtils.js';
import { makeToonMaterial } from '../world/materials.js';

/**
 * The Fox Devil.
 *
 * Two bodies, one contract:
 *   • the COMPANION — the real Fox.glb model, loping at your heel, growing with
 *     every mutation (bigger, more tails, brighter eyes, heavier footfalls)
 *   • the KON HEAD — a purpose-built, articulated head with a real jaw, because
 *     "Kon" is the game's signature verb and it has to bite on screen
 */
export class FoxDevil {
  constructor({ scene, assets, vfx, audio, world, progression }) {
    this.scene = scene;
    this.assets = assets;
    this.vfx = vfx;
    this.audio = audio;
    this.world = world;
    this.progression = progression;

    this.group = new THREE.Group();
    this.group.name = 'foxDevil';
    this.model = null;
    this.mixer = null;
    this.actions = {};
    this.current = 'Survey';
    this.tails = [];
    this.tailGroup = new THREE.Group();
    this.auraGroup = new THREE.Group();
    this.heads = [];
    this.stage = 0;
    this.scaleBase = 1;
    this.state = 'follow';
    this.stateTime = 0;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.facing = 0;
    this.homeOffset = new THREE.Vector3(-1.6, 0, -1.9);
    this.eyeColor = 0xff7a2a;
    this.coatColor = 0xd8622a;
    this.loaded = false;
    this.barkTimer = 6 + Math.random() * 8;
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();

    this.group.add(this.tailGroup, this.auraGroup);
    this.#buildHeads();
  }

  // ───────────────────────────────────────────────────────────── loading
  async load() {
    const buf = this.assets?.get?.('models/fox.glb');
    if (!buf) { console.warn('[fox] no fox.glb in asset bundle'); return false; }
    try {
      const loader = new GLTFLoader();
      const gltf = await loader.parseAsync(buf, '');
      this.model = gltf.scene;
      this.group.add(this.model);

      // the sample fox is a hair under 1 unit tall at the shoulder — fit it
      const box = new THREE.Box3().setFromObject(this.model);
      const h = box.max.y - box.min.y;
      this.scaleBase = 1.55 / Math.max(0.2, h);
      this.model.scale.setScalar(this.scaleBase);
      this.model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });

      if (gltf.animations?.length) {
        this.mixer = new THREE.AnimationMixer(this.model);
        for (const clip of gltf.animations) {
          const name = clip.name.replace(/\s+/g, '');
          this.actions[name] = this.mixer.clipAction(clip);
        }
        this.current = this.actions.Run ? 'Run' : this.actions.Walk ? 'Walk' : Object.keys(this.actions)[0];
        this.actions[this.current]?.play();
      }
      this.loaded = true;
      this.setStage(this.stage);
      return true;
    } catch (err) {
      console.warn('[fox] failed to parse fox.glb', err);
      return false;
    }
  }

  #play(name, fade = 0.25) {
    if (!this.mixer || !this.actions[name] || this.current === name) return;
    const next = this.actions[name];
    next.reset().play();
    this.actions[this.current]?.crossFadeTo(next, fade, false);
    this.current = name;
  }

  // ─────────────────────────────────────────────────────── mutation look
  setStage(stage) {
    this.stage = stage;
    const mut = this.progression?.mutation;
    const t = clamp01(stage / 6);
    this.coatColor = new THREE.Color().setHSL(lerp(0.06, 0.02, t), lerp(0.75, 0.95, t), lerp(0.45, 0.52, t)).getHex();
    this.eyeColor = [0xff7a2a, 0xff9a3a, 0xffc46a, 0x9be8ff, 0xb98bff, 0xff2e2e, 0xffe9a8][Math.min(6, stage)];

    if (this.model) {
      this.model.scale.setScalar(this.scaleBase * lerp(0.62, 2.35, t));
      this.model.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m.color) m.color.lerp(new THREE.Color(this.coatColor), 0.55);
          if (m.emissive) { m.emissive.setHex(this.eyeColor); m.emissiveIntensity = 0.12 + t * 0.5; }
        }
      });
    }
    this.#buildTails(Math.min(9, 1 + stage));
    this.#buildAura(stage);
  }

  #buildTails(count) {
    for (const t of this.tails) {
      this.tailGroup.remove(t.root);
      t.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    }
    this.tails.length = 0;
    const len = 0.5 + this.stage * 0.08;
    for (let i = 0; i < count; i++) {
      const spread = count === 1 ? 0 : lerp(-0.55, 0.55, i / (count - 1));
      const root = new THREE.Group();
      const segments = 5;
      let parent = root;
      const segs = [];
      for (let s = 0; s < segments; s++) {
        const r0 = lerp(0.16, 0.05, s / segments);
        const r1 = lerp(0.16, 0.05, (s + 1) / segments);
        const geo = new THREE.CylinderGeometry(r1, r0, len, 6, 1);
        geo.translate(0, len / 2, 0);
        const mat = makeToonMaterial(s === segments - 1 ? 0xf6efe2 : this.coatColor);
        const m = new THREE.Mesh(geo, mat);
        m.castShadow = true;
        parent.add(m);
        const next = new THREE.Group();
        next.position.y = len;
        m.add(next);
        parent = next;
        segs.push(m);
      }
      root.rotation.set(-0.6, 0, spread);
      root.position.set(0, 0.5, -0.55);
      this.tailGroup.add(root);
      this.tails.push({ root, segs, phase: i * 0.7, spread });
    }
  }

  #buildAura(stage) {
    this.auraGroup.clear();
    if (stage <= 0) return;
    const count = 3 + stage * 2;
    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(0.07 + stage * 0.01, 7, 6);
      const mat = new THREE.MeshBasicMaterial({ color: this.eyeColor, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
      const m = new THREE.Mesh(geo, mat);
      m.userData = { a: (i / count) * Math.PI * 2, r: 0.8 + stage * 0.06, y: 0.3 + (i % 3) * 0.35, sp: 0.6 + (i % 4) * 0.2 };
      this.auraGroup.add(m);
    }
  }

  // ────────────────────────────────────────────────────────── Kon head
  #buildHeads() {
    // pre-build two heads so a rank-3 Kon (three heads) never pops
    for (let i = 0; i < 3; i++) this.heads.push(this.#makeHead(i));
  }

  #makeHead(index) {
    const g = new THREE.Group();
    const coat = makeToonMaterial(this.coatColor);
    const bone = makeToonMaterial(0xf4ece0);
    const dark = makeToonMaterial(0x1a1214);
    const mats = [coat, bone, dark];

    const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), coat);
    skull.scale.set(1, 0.92, 1.05);
    g.add(skull);

    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.62, 1.5, 12), coat);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, -0.06, 1.28);
    g.add(snout);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), dark);
    nose.position.set(0, -0.02, 2.02);
    g.add(nose);

    // upper jaw group (the skull itself) + hinged lower jaw
    const jaw = new THREE.Group();
    jaw.position.set(0, -0.28, 0.5);
    g.add(jaw);

    const jawMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 1.5), coat);
    jawMesh.position.set(0, -0.1, 0.7);
    jaw.add(jawMesh);
    const jawTip = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), coat);
    jawTip.position.set(0, -0.05, 1.4);
    jaw.add(jawTip);

    // fangs
    for (const [x, up] of [[-0.2, 1], [0.2, 1], [-0.19, -1], [0.19, -1]]) {
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.42, 6), bone);
      fang.position.set(x, up > 0 ? -0.34 : 0.06, 1.55);
      fang.rotation.x = up > 0 ? Math.PI : 0;
      (up > 0 ? g : jaw).add(fang);
    }
    for (let i = 0; i < 5; i++) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 5), bone);
      t.position.set(-0.16 + i * 0.08, -0.3, 1.1 + (i % 2) * 0.16);
      t.rotation.x = Math.PI;
      g.add(t);
    }

    // ears
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.9, 5), coat);
      ear.position.set(0.52 * sx, 0.82, -0.1);
      ear.rotation.set(-0.15, 0, -0.28 * sx);
      g.add(ear);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 5), new THREE.MeshBasicMaterial({ color: this.eyeColor }));
      inner.position.set(0.52 * sx, 0.84, 0.02);
      inner.rotation.copy(ear.rotation);
      g.add(inner);
    }

    // eyes
    const eyes = [];
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), new THREE.MeshBasicMaterial({ color: this.eyeColor }));
      eye.position.set(0.43 * sx, 0.16, 0.82);
      g.add(eye);
      eyes.push(eye);
      const slint = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.1), dark);
      slint.position.set(0.43 * sx, 0.16, 0.86);
      g.add(slint);
    }

    // glowing muzzle marks
    for (const sx of [-1, 1]) {
      const mark = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.5), new THREE.MeshBasicMaterial({ color: this.eyeColor }));
      mark.position.set(0.34 * sx, 0.42, 0.7);
      mark.rotation.z = 0.3 * sx;
      g.add(mark);
    }

    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    g.visible = false;
    g.userData = { jaw, eyes, mats, index };
    this.group.add(g);
    return g;
  }

  /**
   * Kon. The head tears out of the ground at `at`, bites, and vanishes.
   * @returns {Promise<void>} resolves when the bite lands
   */
  async kon({ at, target, scale = 1, devour = false, damage = null, onBite = null, source = null, duration = 1.1 }) {
    const head = this.heads.find((h) => !h.visible) || this.heads[0];
    head.visible = true;
    head.userData.mats.forEach((m) => { m.transparent = true; m.opacity = 1; });
    const stage = this.stage;
    const s = scale * lerp(0.85, 1.9, clamp01(stage / 6));
    head.scale.setScalar(0.01);
    head.position.copy(at);
    head.position.y = this.world.heightAt(at.x, at.z) - 1.4 * s;
    // face the target
    const dir = this._v.copy(target ? target.position : at).sub(at).setY(0);
    if (dir.lengthSq() > 0.01) head.rotation.y = Math.atan2(dir.x, dir.z);

    const groundY = this.world.heightAt(at.x, at.z);
    this.vfx.summonCircle(new THREE.Vector3(at.x, groundY + 0.05, at.z), {
      color: this.eyeColor, radius: 2.4 * s, dur: 0.7,
    });
    this.audio.play('kon_summon', { volume: 0.9, position: at, reverb: 0.5 });
    this.audio.synth('spirit_hum', { volume: 0.25, position: at });

    const rise = 0.36;
    const bite = 0.22;
    const hold = devour ? 0.55 : 0.18;
    const total = rise + bite + hold + 0.45;

    await this.#animate(total, (t) => {
      const u = t / total;
      // emerge
      if (t < rise) {
        const e = ease.outCubic(t / rise);
        head.position.y = lerp(groundY - 1.6 * s, groundY + 1.1 * s, e);
        head.scale.setScalar(s * lerp(0.2, 1, e));
        head.userData.jaw.rotation.x = lerp(0.55, 0.75, e);
      } else if (t < rise + bite) {
        const e = ease.inExpo(Math.min(1, (t - rise) / bite));
        head.userData.jaw.rotation.x = lerp(0.75, -0.05, e);
        head.position.y = lerp(groundY + 1.1 * s, groundY + 0.55 * s, e);
        head.position.z += 0;
        if (target) {
          head.position.x = lerp(at.x, target.position.x, e * 0.55);
          head.position.z = lerp(at.z, target.position.z, e * 0.55);
        }
      } else if (t < rise + bite + hold) {
        head.userData.jaw.rotation.x = -0.05 + Math.sin(t * 40) * 0.03;
      } else {
        const e = ease.inCubic((t - rise - bite - hold) / 0.45);
        head.position.y = lerp(groundY + 0.55 * s, groundY - 2.2 * s, e);
        head.scale.setScalar(s * (1 - e * 0.5));
        head.userData.mats.forEach((m) => { m.opacity = 1 - e; });
      }
    }, { at, head, s, target, groundY });

    // impact
    return new Promise((resolve) => {
      const biteAt = head.position.clone();
      this.vfx.flash(biteAt, { color: 0xffffff, size: 2.6 * s, dur: 0.3 });
      this.vfx.burst(biteAt, 34, { color: [this.eyeColor, 0xffffff, 0xc8443c], speed: 11, size: 0.6, life: 0.6, drag: 3.5 });
      this.vfx.shockwave(new THREE.Vector3(biteAt.x, groundY + 0.1, biteAt.z), { radius: 5 * s, color: this.eyeColor, dur: 0.5 });
      this.audio.play('kon_bite', { volume: 1, position: biteAt, reverb: 0.6 });
      if (devour) this.audio.play('devour', { volume: 0.9, position: biteAt, delay: 0.12 });
      onBite?.(biteAt);
      head.visible = false;
      head.userData.mats.forEach((m) => { m.opacity = 1; m.transparent = false; });
      setTimeout(resolve, 60);
    });
  }

  #animate(duration, step, ctx) {
    return new Promise((resolve) => {
      let t = 0;
      let last = performance.now();
      const tick = () => {
        const now = performance.now();
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        t += dt;
        step(Math.min(t, duration));
        if (t >= duration || this.dead) { resolve(); return; }
        this._raf = requestAnimationFrame(tick);
      };
      this._raf = requestAnimationFrame(tick);
    });
  }

  /** The fox itself charges through a line (used by pounce/charge abilities). */
  async charge({ from, to, duration = 0.55, color = null, onHit = null, scale = 1 }) {
    if (!this.model) return;
    const ghost = cloneSkinned(this.model);
    ghost.scale.setScalar(this.model.scale.x * scale);
    ghost.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        o.material.transparent = true;
        o.material.opacity = 0.75;
        if (o.material.emissive) { o.material.emissive.setHex(color ?? this.eyeColor); o.material.emissiveIntensity = 0.8; }
      }
    });
    this.scene.add(ghost);
    const dir = this._v.copy(to).sub(from);
    ghost.position.copy(from);
    ghost.rotation.y = Math.atan2(dir.x, dir.z);
    await this.#animate(duration, (t) => {
      const u = t / duration;
      ghost.position.lerpVectors(from, to, ease.inOutCubic(u));
      ghost.position.y = this.world.heightAt(ghost.position.x, ghost.position.z) + Math.sin(u * Math.PI) * 0.7;
      this.vfx.trail(ghost.position, this._v2.set(0, 0.4, 0), { color: color ?? this.eyeColor, size: 0.35, life: 0.3 });
    });
    onHit?.();
    this.scene.remove(ghost);
    ghost.traverse((o) => { if (o.isMesh) o.material.dispose(); });
  }

  bark(position) { this.audio.play('fox_bark', { volume: 0.6, position }); }

  // ───────────────────────────────────────────────────────────── update
  update(dt, player, combat) {
    if (!this.loaded) return;

    // companion follow: sits at the player's left heel, sprints to catch up
    const want = this._v.copy(player.position).add(
      this._v2.copy(this.homeOffset).applyAxisAngle(UP, player.facing),
    );
    want.y = this.world.heightAt(want.x, want.z);
    const dist = this.position.distanceTo(want);
    const speed = clamp(dist * 3.2, 1.2, 14);
    const step = clamp01(speed * dt / Math.max(0.001, dist));
    this.position.lerp(want, clamp01(step * 1.6));
    this.position.y = damp(this.position.y, this.world.heightAt(this.position.x, this.position.z), 12, dt);
    this.group.position.copy(this.position);

    // face travel direction, else the player's facing
    const moved = this._v.copy(want).sub(this.position).setY(0);
    if (moved.lengthSq() > 0.0004) {
      this.facing = dampAngle(this.facing, Math.atan2(moved.x, moved.z), 8, dt);
    } else {
      this.facing = dampAngle(this.facing, player.facing, 3, dt);
    }
    this.group.rotation.y = this.facing;

    // animation blend from actual ground speed
    const groundSpeed = dist > 6 ? 1 : dist > 1.2 ? 0.6 : 0;
    if (this.mixer) {
      this.mixer.update(dt);
      const wantClip = groundSpeed > 0.8 ? 'Run' : groundSpeed > 0.3 ? 'Walk' : 'Survey';
      if (this.actions[wantClip]) this.#play(wantClip, 0.3);
      this.mixer.timeScale = 0.9 + groundSpeed * 0.5;
    }

    // tails: lazy follow-through, faster when moving
    const t = performance.now() / 1000;
    for (const tail of this.tails) {
      for (let i = 0; i < tail.segs.length; i++) {
        const seg = tail.segs[i];
        const ph = t * (2.4 + groundSpeed * 2) - i * 0.45 + tail.phase;
        seg.rotation.x = Math.sin(ph) * (0.09 + i * 0.03);
        seg.rotation.z = Math.cos(ph * 0.7) * (0.07 + i * 0.02) + (i === 0 ? tail.spread : 0);
      }
    }

    // aura motes
    for (const m of this.auraGroup.children) {
      const u = m.userData;
      u.a += dt * u.sp;
      m.position.set(Math.cos(u.a) * u.r, u.y + Math.sin(t * 1.5 + u.a) * 0.12, Math.sin(u.a) * u.r);
      m.material.opacity = 0.5 + Math.sin(t * 3 + u.a) * 0.3;
    }

    // occasional idle bark / step dust
    this.barkTimer -= dt;
    if (this.barkTimer <= 0) {
      this.barkTimer = 12 + Math.random() * 20;
      if (!combat?.intensity) this.bark(this.position);
    }
    if (groundSpeed > 0.8 && Math.random() < dt * 6) {
      this.vfx.footPuff(this.position, { count: 2, color: 0x8a7a5a });
    }
  }

  setVisible(v) { this.group.visible = v; }

  dispose() {
    this.dead = true;
    cancelAnimationFrame(this._raf);
    this.group.removeFromParent();
  }
}

const UP = new THREE.Vector3(0, 1, 0);

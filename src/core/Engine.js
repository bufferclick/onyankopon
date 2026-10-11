import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { clamp, clamp01, damp } from './MathUtils.js';

/**
 * Engine — renderer, post-processing stack, frame loop and adaptive quality.
 *
 * Post chain:  scene ─▶ bloom ─▶ grade (vignette / grain / aberration / radial
 * blur / colour-blind LUT) ─▶ FXAA ─▶ output(tonemap + sRGB)
 *
 * When the frame budget is missed for a while, the engine silently walks render
 * scale down and only reports it — it never stutters while the player fights.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.55 },
    uGrain: { value: 0.035 },
    uAberration: { value: 0.0 },
    uRadial: { value: 0.0 },
    uExposure: { value: 1.0 },
    uLift: { value: 0.0 },
    uTime: { value: 0 },
    uContrast: { value: 1.06 },
    uSaturation: { value: 1.04 },
    uDamage: { value: 0.0 },
    uHeal: { value: 0.0 },
    uColorBlind: { value: 0 },
    uFade: { value: 0.0 },
    uFadeColor: { value: new THREE.Color(0x08060a) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uVignette, uGrain, uAberration, uRadial, uExposure, uLift, uTime;
    uniform float uContrast, uSaturation, uDamage, uHeal, uFade, uColorBlind;
    uniform vec3 uFadeColor;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

    vec3 grade(vec3 c) {
      c *= uExposure;
      c = (c - 0.5) * uContrast + 0.5;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSaturation);
      c += uLift * (1.0 - c) * 0.9;
      // filmic-ish shoulder keeps spirit fire from clipping to white mush
      c = c / (1.0 + max(vec3(0.0), c - 0.86) * 0.9);
      return c;
    }

    vec3 daltonize(vec3 c, float mode) {
      if (mode < 0.5) return c;
      mat3 sim = mat3(1.0);
      if (mode < 1.5) sim = mat3(0.567, 0.433, 0.0, 0.558, 0.442, 0.0, 0.0, 0.242, 0.758);      // protanopia
      else if (mode < 2.5) sim = mat3(0.625, 0.375, 0.0, 0.70, 0.30, 0.0, 0.0, 0.30, 0.70);     // deuteranopia
      else sim = mat3(0.95, 0.05, 0.0, 0.0, 0.433, 0.567, 0.0, 0.475, 0.525);                  // tritanopia
      vec3 s = sim * c;
      vec3 err = c - s;
      return clamp(c + mat3(0.0, 0.7, 0.7, 0.7, 0.0, 0.7, 0.0, 0.0, 0.0) * err * 0.85, 0.0, 1.0);
    }

    void main() {
      vec2 uv = vUv;
      vec2 dir = uv - 0.5;
      vec3 col;

      if (uRadial > 0.001) {
        // speed-line zoom blur, used on dash / devil form entry
        vec3 acc = vec3(0.0);
        const int N = 8;
        for (int i = 0; i < N; i++) {
          float t = float(i) / float(N - 1);
          vec2 suv = uv - dir * t * uRadial * 0.16;
          acc += texture2D(tDiffuse, suv).rgb;
        }
        col = acc / float(N);
      } else {
        col = texture2D(tDiffuse, uv).rgb;
      }

      if (uAberration > 0.0005) {
        float a = uAberration;
        col.r = texture2D(tDiffuse, uv + dir * a * 0.012).r;
        col.b = texture2D(tDiffuse, uv - dir * a * 0.012).b;
      }

      col = grade(col);

      // vignette (softens further when the player is hurt)
      float v = 1.0 - uVignette * dot(dir, dir) * (1.55 + uDamage * 1.4);
      col *= clamp(v, 0.0, 1.0);

      // red-out / blue-in feedback pulses
      col = mix(col, vec3(dot(col, vec3(0.3)) * 1.25, col.g * 0.35, col.b * 0.3), uDamage * 0.45);
      col = mix(col, col + vec3(0.05, 0.16, 0.12), uHeal * 0.5);

      col = daltonize(col, uColorBlind);

      // grain
      float n = hash(uv * vec2(1024.0, 768.0) + fract(uTime) * 91.7) - 0.5;
      col += n * uGrain;

      col = mix(col, uFadeColor, uFade);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class Engine {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.clock = new THREE.Clock();
    this.time = 0;
    this.frame = 0;
    this.running = false;
    this.timeScale = 1;
    this.hitStopTimer = 0;
    this.fps = 60;
    this.frameMs = 16.7;
    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this.updateHooks = [];
    this.renderHooks = [];
    this.adaptive = { enabled: true, level: 1.0, cooldown: 0 };

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: settings.get('video', 'antialias'),
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
      // Needed for the screenshot button and for the Electron shell's snapshots.
      preserveDrawingBuffer: true,
    });
    this.renderer.setClearColor(0x0b0708, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = settings.get('video', 'exposure');
    this.renderer.shadowMap.enabled = settings.get('video', 'shadows');
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(settings.get('video', 'fov'), 1, 0.12, 3000);
    this.camera.position.set(0, 6, 12);

    this.composer = null;
    this.scene = null;

    this.#resize();
    window.addEventListener('resize', () => this.#resize());
    this.settings.onChange((section, key) => this.#onSettings(section, key));

    // Screen-space feedback state, driven by gameplay events.
    this.fx = {
      aberration: 0, radial: 0, damage: 0, heal: 0, fade: 0, fadeColor: new THREE.Color(0x08060a),
      shake: 0, shakeDecay: 3.2,
    };
    this.shakeOffset = new THREE.Vector3();
    this.shakeRot = 0;
  }

  setScene(scene) {
    this.scene = scene;
    this.buildComposer();
  }

  buildComposer() {
    if (!this.scene) return;
    const v = this.settings.data.video;
    if (this.composer) { this.composer.dispose?.(); this.composer = null; }
    if (!v.postFX) return;

    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const composer = new EffectComposer(this.renderer);
    composer.setSize(size.x, size.y);

    const renderPass = new RenderPass(this.scene, this.camera);
    composer.addPass(renderPass);

    if (v.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.62, 0.62, 0.82);
      composer.addPass(this.bloom);
    } else this.bloom = null;

    this.gradePass = new ShaderPass(GradeShader);
    this.gradePass.uniforms.uExposure.value = v.exposure;
    this.gradePass.uniforms.uLift.value = v.darkness;
    const cb = this.settings.data.accessibility.colorBlind;
    this.gradePass.uniforms.uColorBlind.value = cb === 'protanopia' ? 1 : cb === 'deuteranopia' ? 2 : cb === 'tritanopia' ? 3 : 0;
    composer.addPass(this.gradePass);

    if (v.antialias) {
      this.fxaa = new ShaderPass(FXAAShader);
      composer.addPass(this.fxaa);
    } else this.fxaa = null;

    composer.addPass(new OutputPass());
    this.composer = composer;
    this.#resize();
  }

  #onSettings(section, key) {
    const v = this.settings.data.video;
    if (section === 'video') {
      if (key === 'exposure') { this.renderer.toneMappingExposure = v.exposure; if (this.gradePass) this.gradePass.uniforms.uExposure.value = v.exposure; }
      else if (key === 'darkness' && this.gradePass) this.gradePass.uniforms.uLift.value = v.darkness;
      else if (key === 'shadows') { this.renderer.shadowMap.enabled = v.shadows; this.renderer.shadowMap.needsUpdate = true; }
      else if (key === 'fov') { this.camera.fov = v.fov; this.camera.updateProjectionMatrix(); }
      else if (key === 'postFX' || key === 'bloom' || key === 'antialias') this.buildComposer();
      else if (key === 'renderScale') this.#resize();
    } else if (section === 'accessibility' && key === 'colorBlind' && this.gradePass) {
      const cb = this.settings.data.accessibility.colorBlind;
      this.gradePass.uniforms.uColorBlind.value = cb === 'protanopia' ? 1 : cb === 'deuteranopia' ? 2 : cb === 'tritanopia' ? 3 : 0;
    }
  }

  #resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const scale = clamp(this.settings.get('video', 'renderScale'), 0.5, 2) * this.adaptive.level;
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * scale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio?.(dpr);
      this.composer.setSize(w, h);
      const buf = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.bloom?.setSize(buf.x, buf.y);
      if (this.fxaa) {
        this.fxaa.material.uniforms.resolution.value.set(1 / buf.x, 1 / buf.y);
      }
    }
  }

  onUpdate(fn) { this.updateHooks.push(fn); return () => { this.updateHooks = this.updateHooks.filter((f) => f !== fn); }; }
  onRender(fn) { this.renderHooks.push(fn); return () => { this.renderHooks = this.renderHooks.filter((f) => f !== fn); }; }

  /** Freeze the world for `t` seconds — the punch of a heavy hit. */
  hitStop(t = 0.06) { this.hitStopTimer = Math.max(this.hitStopTimer, t * clamp(this.settings.get('gameplay', 'hitStop'), 0, 2)); }

  shake(amount = 0.5) { this.fx.shake = Math.min(2.4, this.fx.shake + amount * clamp(this.settings.get('controls', 'cameraShake'), 0, 2)); }
  flashDamage(a = 1) { this.fx.damage = Math.min(1.6, this.fx.damage + a); }
  flashHeal(a = 1) { this.fx.heal = Math.min(1.4, this.fx.heal + a); }
  aberration(a = 1) { this.fx.aberration = Math.min(2.5, this.fx.aberration + a); }
  radialBlur(a = 1) { this.fx.radial = Math.min(2.0, this.fx.radial + a); }
  fadeTo(color, v = 1) { this.fx.fadeColor.set(color); this.fx.fade = v; }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.#frame();
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() { this.running = false; cancelAnimationFrame(this.raf); }

  #frame() {
    const raw = Math.min(this.clock.getDelta(), 0.1);
    this.frameMs = damp(this.frameMs, raw * 1000, 6, raw);
    this._fpsAccum += raw; this._fpsFrames++;
    if (this._fpsAccum > 0.35) {
      this.fps = this._fpsFrames / this._fpsAccum;
      this._fpsAccum = 0; this._fpsFrames = 0;
      this.#adaptQuality();
    }

    let dt = raw;
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= raw;
      dt = raw * 0.06;            // world nearly frozen, UI still smooth
    }
    dt *= this.timeScale;
    this.time += dt;

    for (const fn of this.updateHooks) fn(dt, this.time);

    this.#updateScreenFx(raw);
    for (const fn of this.renderHooks) fn(dt, this.time);
    this.frame++;
  }

  #updateScreenFx(dt) {
    const f = this.fx;
    f.aberration = damp(f.aberration, 0, 5.5, dt);
    f.radial = damp(f.radial, 0, 6.5, dt);
    f.damage = damp(f.damage, 0, 3.4, dt);
    f.heal = damp(f.heal, 0, 3.0, dt);
    f.shake = damp(f.shake, 0, f.shakeDecay, dt);
    if (this.gradePass) {
      const u = this.gradePass.uniforms;
      u.uAberration.value = f.aberration;
      u.uRadial.value = f.radial;
      u.uDamage.value = f.damage;
      u.uHeal.value = f.heal;
      u.uFade.value = f.fade;
      u.uFadeColor.value.copy(f.fadeColor);
      u.uTime.value = this.time;
      u.uVignette.value = 0.5 + f.damage * 0.35;
    }
  }

  /** Camera shake offset, applied by the camera controller each frame. */
  consumeShake(dt, out = new THREE.Vector3()) {
    const s = this.fx.shake;
    if (s < 0.001) return out.set(0, 0, 0);
    const t = this.time * 34;
    return out.set(
      Math.sin(t * 1.13) * s * 0.12 + (Math.random() - 0.5) * s * 0.05,
      Math.cos(t * 1.71) * s * 0.10 + (Math.random() - 0.5) * s * 0.05,
      Math.sin(t * 0.91) * s * 0.06
    );
  }

  #adaptQuality() {
    if (!this.adaptive.enabled) return;
    const cap = this.settings.get('video', 'fpsCap');
    const target = cap > 0 ? cap : 55;
    if (this.adaptive.cooldown > 0) { this.adaptive.cooldown -= 1; return; }
    if (this.fps < target * 0.72 && this.adaptive.level > 0.62) {
      this.adaptive.level = clamp01(this.adaptive.level - 0.08);
      this.adaptive.cooldown = 6;
      this.#resize();
    } else if (this.fps > target * 1.15 && this.adaptive.level < 1) {
      this.adaptive.level = clamp01(this.adaptive.level + 0.04);
      this.adaptive.cooldown = 10;
      this.#resize();
    }
  }

  render() {
    if (!this.scene) return;
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  /** Download a PNG of the current frame (bound to the screenshot key). */
  screenshot() {
    this.render();
    try {
      const url = this.renderer.domElement.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `kitsuna-${Date.now()}.png`;
      a.click();
      return true;
    } catch { return false; }
  }

  get drawCalls() { return this.renderer.info.render.calls; }
  get triangles() { return this.renderer.info.render.triangles; }
  get geometries() { return this.renderer.info.memory.geometries; }
  get textures() { return this.renderer.info.memory.textures; }
}

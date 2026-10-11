import * as THREE from 'three';
import { clamp, clamp01, lerp, smoothstep } from '../core/MathUtils.js';

/**
 * Sky, sun, moon, stars, god-rays and the full day/night cycle.
 *
 * A single inverted sphere with a hand-written gradient shader (horizon glow,
 * zenith, sun/moon disc, cloud bands) plus a directional light whose colour and
 * angle are driven by the time of day. Clouds are a second, slowly-rotating
 * shell of noise-based alpha; stars are a Points cloud that fades in at night.
 */

const SKY_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vDir;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uSunSize;
  uniform float uTime;
  uniform float uStars;
  uniform float uClouds;
  uniform vec3 uFogColor;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                   mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                   mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }

  void main() {
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    float horizonMix = pow(1.0 - abs(dir.y), 3.2);

    vec3 col = mix(uZenith, uHorizon, horizonMix);
    col = mix(col, uGround, clamp(-dir.y * 2.2, 0.0, 1.0));

    // sun + broad atmospheric glow
    float sd = max(dot(dir, uSunDir), 0.0);
    col += uSunColor * pow(sd, 220.0 / max(uSunSize, 0.02)) * 6.0;
    col += uSunColor * pow(sd, 8.0) * 0.32;
    col += uSunColor * pow(sd, 2.0) * 0.10;

    // stars (only up, only at night)
    if (uStars > 0.01 && dir.y > 0.0) {
      float s = hash(floor(dir * 320.0));
      float tw = 0.65 + 0.35 * sin(uTime * 1.7 + s * 40.0);
      float star = smoothstep(0.9955, 1.0, s) * tw * uStars * smoothstep(0.02, 0.35, dir.y);
      col += vec3(star) * vec3(0.95, 0.97, 1.0);
      // a faint milky band
      float band = exp(-pow((dir.y - 0.42 + dir.x * 0.18) * 7.0, 2.0));
      col += vec3(0.05, 0.06, 0.10) * band * uStars * fbm(dir * 22.0) * 0.6;
    }

    // clouds: two drifting noise layers, lit from the sun side
    if (uClouds > 0.01) {
      vec3 p = dir * 3.4;
      float c = fbm(p + vec3(uTime * 0.012, 0.0, uTime * 0.006));
      float c2 = fbm(p * 2.1 + vec3(uTime * 0.02, 0.0, -uTime * 0.01));
      float cover = smoothstep(0.52, 0.86, c * 0.7 + c2 * 0.3);
      cover *= smoothstep(0.0, 0.22, dir.y);
      float lit = 0.35 + 0.65 * pow(max(dot(dir, uSunDir) * 0.5 + 0.5, 0.0), 1.6);
      vec3 cloudCol = mix(vec3(0.22, 0.22, 0.26), vec3(1.05, 1.0, 0.96), lit);
      col = mix(col, cloudCol, cover * uClouds * 0.85);
    }

    // haze band near the horizon so distant terrain melts into the sky
    col = mix(col, uFogColor, smoothstep(0.16, -0.02, dir.y) * 0.85);

    gl_FragColor = vec4(col, 1.0);
  }
`;

export const MOON_COLOR = new THREE.Color(0xbcd2ff);

export class Sky {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;

    this.uniforms = {
      uZenith: { value: new THREE.Color(0x2a4a7a) },
      uHorizon: { value: new THREE.Color(0xd8a878) },
      uGround: { value: new THREE.Color(0x2a2620) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.5, 0.6) },
      uSunColor: { value: new THREE.Color(0xffd0a0) },
      uSunSize: { value: 0.06 },
      uTime: { value: 0 },
      uStars: { value: 0 },
      uClouds: { value: 0.55 },
      uFogColor: { value: new THREE.Color(0xa0b0b8) },
    };

    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 20),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: this.uniforms,
        side: THREE.BackSide, depthWrite: false, fog: false,
      })
    );
    this.mesh.scale.setScalar(2400);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    scene.add(this.mesh);

    // lighting rig
    this.sun = new THREE.DirectionalLight(0xffe0b8, 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 260;
    this.sun.shadow.bias = -0.0012;
    this.sun.shadow.normalBias = 0.035;
    const cam = this.sun.shadow.camera;
    cam.left = -70; cam.right = 70; cam.top = 70; cam.bottom = -70;
    this.sunTarget = new THREE.Object3D();
    scene.add(this.sun, this.sunTarget);
    this.sun.target = this.sunTarget;

    this.hemi = new THREE.HemisphereLight(0x9ab0c8, 0x3a3228, 0.75);
    scene.add(this.hemi);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.16);
    scene.add(this.ambient);

    // moon disc (a billboard that rides the anti-sun direction)
    this.moon = new THREE.Mesh(
      new THREE.CircleGeometry(46, 24),
      new THREE.MeshBasicMaterial({ color: 0xe8f0ff, transparent: true, opacity: 0.95, fog: false, depthWrite: false })
    );
    this.moon.renderOrder = -999;
    scene.add(this.moon);

    this.time = 0.32;           // 0..1, 0.25 = dawn, 0.5 = noon, 0.75 = dusk
    this.dayLength = 480;       // seconds per full day
    this.paused = false;
    this.weatherTint = new THREE.Color(1, 1, 1);
    this.cloudOverride = null;
    this._sunPos = new THREE.Vector3();
  }

  setQuality(video) {
    this.sun.shadow.mapSize.set(video.shadowRes, video.shadowRes);
    this.sun.castShadow = video.shadows;
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    const d = video.shadowDist;
    const cam = this.sun.shadow.camera;
    cam.left = -d; cam.right = d; cam.top = d; cam.bottom = -d;
    cam.updateProjectionMatrix();
  }

  /** 0..1 → sun elevation path (slightly squashed so nights are long). */
  get sunDir() {
    const a = (this.time - 0.25) * Math.PI * 2;
    return this._sunPos.set(Math.cos(a) * 0.85, Math.sin(a), Math.cos(a * 0.5) * 0.35).normalize();
  }

  get isNight() {
    return this.sunDir.y < -0.05;
  }

  update(dt, cameraPos) {
    if (!this.paused) this.time = (this.time + dt / this.dayLength) % 1;
    this.uniforms.uTime.value += dt;

    const dir = this.sunDir.clone();
    const night = clamp01(-dir.y * 3.2);
    const day = clamp01(dir.y * 2.4 + 0.15);
    const golden = clamp01(1 - Math.abs(dir.y) * 5.5);   // sunrise/sunset band

    // palette by time of day
    const zenithDay = _c1.setHex(0x3a6ea8);
    const zenithNight = _c1b.setHex(0x080a18);
    const horizonDay = _c2.setHex(0xcfe0e8);
    const horizonNight = _c2b.setHex(0x1a1c2e);
    const horizonGold = _c3.setHex(0xff9a4a);

    this.uniforms.uZenith.value.copy(zenithNight).lerp(zenithDay, day);
    this.uniforms.uHorizon.value.copy(horizonNight).lerp(horizonDay, day).lerp(horizonGold, golden * 0.75);
    this.uniforms.uSunColor.value.setHex(0xffd0a0).lerp(_c3.setHex(0xff7a3a), golden);
    this.uniforms.uStars.value = clamp01(night * 1.2);

    // weather darkening
    this.uniforms.uZenith.value.multiply(this.weatherTint);
    this.uniforms.uHorizon.value.multiply(this.weatherTint);

    this.sun.position.copy(cameraPos).add(dir.clone().multiplyScalar(150));
    this.sunTarget.position.copy(cameraPos);
    this.sun.color.copy(this.uniforms.uSunColor.value).lerp(MOON_COLOR, night);
    this.sun.intensity = lerp(0.12, 2.3, day) * lerp(1, 0.35, this.weatherDim);

    this.hemi.intensity = lerp(0.22, 0.95, day);
    this.hemi.color.copy(this.uniforms.uHorizon.value);
    this.ambient.intensity = lerp(0.1, 0.2, day);

    // moon rides opposite the sun
    const moonDir = dir.clone().multiplyScalar(-1);
    this.moon.position.copy(cameraPos).add(moonDir.multiplyScalar(1600));
    this.moon.lookAt(cameraPos);
    this.moon.material.opacity = 0.95 * clamp01(night * 1.4);
    this.moon.visible = this.moon.material.opacity > 0.02;

    this.mesh.position.copy(cameraPos);
  }

  setFog(scene, color, density) {
    this.uniforms.uFogColor.value.copy(color);
    if (!scene.fog) scene.fog = new THREE.FogExp2(color.getHex(), density);
    scene.fog.color.copy(color);
    scene.fog.density = density;
  }

  /** Weather systems push clouds + dim the sun through here. */
  setWeather({ cloudiness = null, dim = 0, tint = null }) {
    if (cloudiness !== null) this.uniforms.uClouds.value = this.cloudOverride ?? cloudiness;
    this.weatherDim = dim;
    if (tint) this.weatherTint.copy(tint);
    else this.weatherTint.setRGB(1, 1, 1);
  }

  /** Jump to a specific time (used by save/load and the debug clock). */
  setTime(t) { this.time = ((t % 1) + 1) % 1; }

  get clockLabel() {
    const total = this.time * 24;
    const h = Math.floor(total);
    const m = Math.floor((total - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}

const _c1 = new THREE.Color(), _c1b = new THREE.Color();
const _c2 = new THREE.Color(), _c2b = new THREE.Color(), _c3 = new THREE.Color();

import * as THREE from 'three';
import { clamp, clamp01, lerp } from './MathUtils.js';

/**
 * AudioEngine — one WebAudio graph for the whole game.
 *
 *   source ──▶ [panner] ──▶ busGain(sfx/ui/music/ambience) ──▶ master ──▶ comp ──▶ out
 *                    └───────────────────────────────────────▶ reverbSend ──▶ convolver ─┘
 *
 * Every one-shot plays a random variant from its group with slight pitch and
 * gain jitter, so repeated hits never machine-gun. Music is a small director
 * that crossfades between states (menu / explore / night / combat / boss /
 * shrine / death) and ducks itself under dialogue.
 */
export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.ready = false;
    this.banks = new Map();       // group -> AudioBuffer[]
    this.loops = new Map();       // logical name -> { src, gain, kind }
    this.currentMusic = null;
    this.currentAmbience = null;
    this.listenerPos = new THREE.Vector3();
    this.listenerFwd = new THREE.Vector3(0, 0, -1);
    this.listenerUp = new THREE.Vector3(0, 1, 0);
    this.muted = false;
    this._pendingMusic = null;
    this._noise = null;
    this.spatial = true;
    this._lastPlay = new Map();
  }

  /** Must be called from a user gesture (browsers block audio otherwise). */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = this.ctx = new AC({ latencyHint: 'interactive' });

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 26;
    this.comp.ratio.value = 3.6;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.22;

    this.master = ctx.createGain();
    this.master.gain.value = this.settings.get('audio', 'master');

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -1.2;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.08;

    this.master.connect(this.comp);
    this.comp.connect(this.limiter);
    this.limiter.connect(ctx.destination);

    // buses
    this.buses = {};
    for (const name of ['sfx', 'ui', 'music', 'ambience']) {
      const g = ctx.createGain();
      g.gain.value = this.settings.get('audio', name);
      g.connect(this.master);
      this.buses[name] = g;
    }

    // reverb (procedural impulse response — a wooden shrine hall)
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.#makeImpulse(2.6, 2.4);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.32;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.master);

    // shared noise buffer for runtime synthesis
    this._noise = this.#makeNoise(2.0);
    this.ready = true;
    this.applySettings();
    return ctx;
  }

  #makeImpulse(seconds, decay) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const env = (1 - t) ** decay;
        // slight pre-delay + early reflections for a hall rather than a wash
        const early = i < rate * 0.09 ? 0.35 * Math.sin(i * 0.05) : 0;
        const white = Math.random() * 2 - 1;
        lp = lp * 0.72 + white * 0.28;      // tame the highs
        d[i] = (lp + early * white) * env;
      }
    }
    return buf;
  }

  #makeNoise(seconds) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // --------------------------------------------------------------- settings
  applySettings() {
    if (!this.ready || !this.settings) return;
    const a = this.settings.data.audio;
    const t = this.ctx.currentTime;
    const ramp = (param, v) => param.setTargetAtTime(this.muted ? 0 : v, t, 0.05);
    ramp(this.master.gain, a.master);
    for (const name of ['sfx', 'ui', 'music', 'ambience']) ramp(this.buses[name].gain, a[name]);
    this.spatial = a.spatialAudio;
  }

  setMuted(m) { this.muted = m; this.applySettings(); }

  /** Volume as a multiplier on the sfx bus, for ducking under dialogue. */
  duck(amount = 0.45, seconds = 0.4) {
    if (!this.ready || !this.settings) return;
    const g = this.buses.sfx.gain;
    const target = this.settings.get('audio', 'sfx') * amount;
    g.cancelScheduledValues(this.ctx.currentTime);
    g.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    g.setTargetAtTime(this.settings.get('audio', 'sfx'), this.ctx.currentTime + seconds, 0.25);
  }

  // ------------------------------------------------------------------ banks
  setBanks(map) {
    for (const [k, v] of map) this.banks.set(k, v);
    this.ready = this.ready && true;
  }

  has(group) { return this.banks.has(group); }

  #pick(group) {
    const arr = this.banks.get(group);
    if (!arr || !arr.length) return null;
    // Avoid repeating the same variant back-to-back.
    if (arr.length === 1) return arr[0];
    const last = this._lastPlay.get(group);
    let i = Math.floor(Math.random() * arr.length);
    if (i === last) i = (i + 1) % arr.length;
    this._lastPlay.set(group, i);
    return arr[i];
  }

  // ------------------------------------------------------------------ play
  /**
   * Play a one-shot.
   * @param {string} group bank name (e.g. "hit_flesh", "slash")
   * @param {object} o { volume, rate, pitch (semitones), position:THREE.Vector3,
   *                     refDistance, maxDistance, reverb, delay, filter, pan, loop }
   * @returns {AudioBufferSourceNode|null}
   */
  play(group, o = {}) {
    if (!this.ready || this.muted) return null;
    const buf = this.#pick(group);
    if (!buf) return null;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + (o.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = !!o.loop;
    const rate = clamp((o.rate ?? 1) * 2 ** ((o.pitch ?? 0) / 12), 0.25, 4);
    src.playbackRate.value = rate * (1 + (o.jitter === false ? 0 : (Math.random() - 0.5) * 0.08));

    const gain = ctx.createGain();
    const vol = clamp01((o.volume ?? 1) * (1 + (o.jitter === false ? 0 : (Math.random() - 0.5) * 0.1)));
    gain.gain.value = vol;

    let node = src;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter.type || 'lowpass';
      f.frequency.value = o.filter.freq ?? 1200;
      f.Q.value = o.filter.q ?? 1;
      node.connect(f); node = f;
    }
    node.connect(gain);

    const bus = o.bus && this.buses[o.bus] ? this.buses[o.bus] : this.buses.sfx;
    if (o.position && this.spatial && ctx.createPanner) {
      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = o.refDistance ?? 6;
      panner.maxDistance = o.maxDistance ?? 90;
      panner.rolloffFactor = o.rolloff ?? 1.35;
      this.#setPannerPosition(panner, o.position);
      gain.connect(panner);
      panner.connect(bus);
      if (o.reverb !== 0) {
        const send = ctx.createGain();
        send.gain.value = (o.reverb ?? 0.28) * (1 / (1 + this.#distToListener(o.position) * 0.045));
        gain.connect(send);
        send.connect(this.reverb);
      }
    } else {
      gain.connect(bus);
      if (o.reverb) {
        const send = ctx.createGain();
        send.gain.value = o.reverb;
        gain.connect(send);
        send.connect(this.reverb);
      }
    }

    src.start(t0, o.offset || 0);
    const stopAt = o.loop ? null : t0 + buf.duration / src.playbackRate.value + 0.05;
    if (stopAt) src.stop(stopAt);
    src.onended = () => { try { src.disconnect(); gain.disconnect(); } catch { /* ignore */ } };
    return src;
  }

  #distToListener(pos) {
    return this.listenerPos.distanceTo(pos);
  }

  #setPannerPosition(panner, pos) {
    if (panner.positionX) {
      panner.positionX.value = pos.x;
      panner.positionY.value = pos.y;
      panner.positionZ.value = pos.z;
    } else {
      panner.setPosition(pos.x, pos.y, pos.z);
    }
  }

  updateListener(camera) {
    if (!this.ready) return;
    const ctx = this.ctx;
    camera.getWorldPosition(this.listenerPos);
    camera.getWorldDirection(this.listenerFwd);
    const l = ctx.listener;
    if (l.positionX) {
      const t = ctx.currentTime;
      l.positionX.setTargetAtTime(this.listenerPos.x, t, 0.02);
      l.positionY.setTargetAtTime(this.listenerPos.y, t, 0.02);
      l.positionZ.setTargetAtTime(this.listenerPos.z, t, 0.02);
      l.forwardX.setTargetAtTime(this.listenerFwd.x, t, 0.02);
      l.forwardY.setTargetAtTime(this.listenerFwd.y, t, 0.02);
      l.forwardZ.setTargetAtTime(this.listenerFwd.z, t, 0.02);
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      l.setPosition(this.listenerPos.x, this.listenerPos.y, this.listenerPos.z);
      l.setOrientation(this.listenerFwd.x, this.listenerFwd.y, this.listenerFwd.z, 0, 1, 0);
    }
  }

  // ------------------------------------------------------------------ music
  /**
   * Crossfade to a music state. Tracks are named in the audio bank as
   * `music_<state>`; missing tracks are skipped silently.
   */
  setMusic(state, { fade = 1.6, volume = 1 } = {}) {
    if (!this.ready) { this._pendingMusic = state; return; }
    if (this.currentMusic === state) return;
    this.currentMusic = state;
    const key = `music_${state}`;
    if (!this.banks.has(key)) return;
    if (this.loops.has('music')) this.#stopLoop('music', fade);
    this.#startLoop('music', key, { fade, volume, bus: 'music', loop: true });
  }

  setAmbience(name, { fade = 2.0, volume = 1 } = {}) {
    if (!this.ready) return;
    if (this.currentAmbience === name) return;
    this.currentAmbience = name;
    if (this.loops.has('ambience')) this.#stopLoop('ambience', fade);
    if (!name) return;
    const key = `amb_${name}`;
    if (!this.banks.has(key)) return;
    this.#startLoop('ambience', key, { fade, volume, bus: 'ambience', loop: true });
  }

  #startLoop(name, group, { fade = 1, volume = 1, bus = 'music', loop = true, offset = 0 }) {
    const buf = this.#pick(group);
    if (!buf) return null;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    src.connect(gain);
    gain.connect(this.buses[bus]);
    if (bus === 'ambience') {
      const send = ctx.createGain();
      send.gain.value = 0.18;
      gain.connect(send);
      send.connect(this.reverb);
    }
    src.start(ctx.currentTime, offset);
    const target = volume * (bus === 'music' ? 1 : 0.85);
    gain.gain.setTargetAtTime(target, ctx.currentTime, Math.max(0.05, fade / 3));
    this.loops.set(name, { src, gain, group });
    return src;
  }

  #stopLoop(name, fade = 1) {
    const l = this.loops.get(name);
    if (!l) return;
    this.loops.delete(name);
    const t = this.ctx.currentTime;
    l.gain.gain.cancelScheduledValues(t);
    l.gain.gain.setTargetAtTime(0.0001, t, Math.max(0.05, fade / 3));
    try { l.src.stop(t + fade + 0.2); } catch { /* ignore */ }
    l.src.onended = () => { try { l.src.disconnect(); l.gain.disconnect(); } catch { /* ignore */ } };
  }

  stopAllLoops(fade = 0.5) {
    for (const name of [...this.loops.keys()]) this.#stopLoop(name, fade);
    this.currentMusic = null;
    this.currentAmbience = null;
  }

  // ------------------------------------------------- runtime synthesis extras
  /** Short procedural textures that would be wasteful to ship as files. */
  synth(kind, { volume = 0.5, position = null, ...rest } = {}) {
    if (!this.ready || this.muted) return null;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = volume;
    const bus = this.buses.sfx;
    let dest = out;
    if (position && this.spatial && ctx.createPanner) {
      const p = ctx.createPanner();
      p.panningModel = 'equalpower';
      p.refDistance = 8; p.maxDistance = 70; p.rolloffFactor = 1.2;
      this.#setPannerPosition(p, position);
      out.connect(p); p.connect(bus);
    } else out.connect(bus);

    const noise = (dur, { type = 'bandpass', freq = 1000, q = 1, env = 'exp', attack = 0.005 } = {}) => {
      const src = ctx.createBufferSource();
      src.buffer = this._noise;
      src.playbackRate.value = rest.rate ?? 1;
      const f = ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain();
      const now = t;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(1, now + attack);
      if (env === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      else g.gain.linearRampToValueAtTime(0.0001, now + dur);
      src.connect(f); f.connect(g); g.connect(dest);
      src.start(now, Math.random() * 1.2);
      src.stop(now + dur + 0.05);
      return { f, g };
    };

    const tone = (freq, dur, { type = 'sine', gain = 0.5, slideTo = null, delay = 0 } = {}) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t + delay);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + delay + dur);
      g.gain.setValueAtTime(0.0001, t + delay);
      g.gain.linearRampToValueAtTime(gain, t + delay + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
      o.connect(g); g.connect(dest);
      o.start(t + delay); o.stop(t + delay + dur + 0.05);
      return { o, g };
    };

    switch (kind) {
      case 'wind_gust': {
        const { f } = noise(1.8, { type: 'bandpass', freq: 480, q: 0.7, attack: 0.5 });
        f.frequency.setValueAtTime(320, t);
        f.frequency.linearRampToValueAtTime(760, t + 0.9);
        f.frequency.linearRampToValueAtTime(300, t + 1.8);
        break;
      }
      case 'ember': noise(0.5, { type: 'highpass', freq: 3600, q: 0.6 }); tone(1400, 0.18, { type: 'triangle', gain: 0.06 }); break;
      case 'heartbeat': tone(58, 0.28, { type: 'sine', gain: 0.8, slideTo: 38 }); tone(54, 0.22, { type: 'sine', gain: 0.5, slideTo: 34, delay: 0.26 }); break;
      case 'lowhealth': tone(44, 0.7, { type: 'sine', gain: 0.6, slideTo: 32 }); break;
      case 'spirit_hum': tone(220, 1.6, { type: 'sine', gain: 0.12, slideTo: 330 }); tone(330, 1.4, { type: 'triangle', gain: 0.05 }); break;
      case 'charge': {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(520, t + 1.1);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.18, t + 0.1);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800; f.Q.value = 6;
        o.connect(f); f.connect(g); g.connect(dest); o.start(t); o.stop(t + 1.3);
        break;
      }
      case 'whoosh': {
        const { f } = noise(0.34, { type: 'bandpass', freq: 900, q: 1.4 });
        f.frequency.setValueAtTime(1600, t); f.frequency.exponentialRampToValueAtTime(320, t + 0.34);
        break;
      }
      default: noise(0.3, { type: 'lowpass', freq: 900 }); break;
    }
    return out;
  }

  /** Music intensity 0..1: slightly opens a low-pass on the music bus. */
  setIntensity(x) {
    if (!this.ready) return;
    const l = this.loops.get('music');
    if (!l) return;
    if (!l.filter) {
      l.filter = this.ctx.createBiquadFilter();
      l.filter.type = 'lowpass';
      l.filter.frequency.value = 20000;
      l.gain.disconnect();
      l.gain.connect(l.filter);
      l.filter.connect(this.buses.music);
    }
    l.filter.frequency.setTargetAtTime(lerp(900, 20000, clamp01(x)), this.ctx.currentTime, 0.4);
  }

  get context() { return this.ctx; }
}

/** Shared engine instance; `main.js` injects the real Settings into it. */
export const audio = new AudioEngine(null);

/**
 * Original sound design.
 *
 * The downloadable bank (Kenney CC0 packs) covers footsteps, impacts, cloth and
 * UI clicks. Everything that has to feel like *this* game — the Kon bite, a
 * perfect parry, fox-fire, the Ninth Bell, a mutation — is synthesised here,
 * sample by sample, into the same AudioBuffer banks.
 *
 * Why hand-synthesised instead of more downloads: these are the verbs of the
 * combat loop, they need to be exactly the same length every time, and they
 * must survive being played 40 times a second without phasing.
 */

const TAU = Math.PI * 2;

// ───────────────────────────────────────────────────────────── dsp toolkit
function voice(sampleRate) {
  const rate = sampleRate;
  const inv = 1 / rate;

  const svf = (cut, q) => {
    const f = 2 * Math.sin(Math.PI * Math.min(cut, rate * 0.45) * inv);
    const damp = Math.min(2 / Math.max(0.001, q), 2 * (1 - Math.pow(q > 0 ? 0.5 : 0.5, 0.25)));
    let low = 0, band = 0;
    return (x) => {
      low += f * band;
      const high = x - low - q * band;
      band += f * high;
      return { lp: low, bp: band, hp: high };
    };
  };

  const lp1 = (cut) => {
    const a = Math.exp(-TAU * cut * inv);
    let z = 0;
    return (x) => (z = z * a + x * (1 - a));
  };
  const hp1 = (cut) => {
    const f = lp1(cut);
    return (x) => x - f(x);
  };

  const osc = (type, phase) => {
    const t = phase % 1;
    switch (type) {
      case 'saw': return 2 * t - 1;
      case 'square': return t < 0.5 ? 1 : -1;
      case 'tri': return 4 * Math.abs(t - 0.5) - 1;
      case 'pulse': return t < 0.22 ? 1 : -1;
      default: return Math.sin(TAU * t);
    }
  };

  return {
    rate, inv, svf, lp1, hp1, osc,
    noise: () => Math.random() * 2 - 1,
    /** exponential decay envelope, 1 → 0 */
    decay: (u, dur, k = 4.2) => Math.exp(-u / dur * k),
    /** attack-decay envelope peaking at `peak` */
    ad: (u, dur, attack = 0.01, k = 4.2) => {
      const a = u < attack ? u / attack : 1;
      return a * Math.exp(-Math.max(0, u - attack) / dur * k);
    },
    /** linear attack / exponential release */
    ar: (u, dur, attack = 0.005) => (u < attack ? u / attack : Math.exp(-(u - attack) / Math.max(0.001, dur - attack) * 3.5)),
    /** soft saturation so loud layers don't clip */
    sat: (x, drive = 1.6) => Math.tanh(x * drive) / Math.tanh(drive),
  };
}

// ───────────────────────────────────────────────────────────── recipes
// each: { dur, fn(v, u, p) -> sample }   p = per-voice state object
const R = {
  hit: (o = {}) => ({
    dur: 0.26,
    fn: (v, u, p) => {
      p.f = p.f || v.svf(o.cut ?? 900, o.q ?? 1.1);
      const n = p.f(v.noise());
      const body = v.osc('sine', (o.f0 ?? 180) * u * (1 + u * (o.bend ?? -0.6)));
      return v.sat(n.bp * v.ad(u, 0.16, 0.002, 6) * (o.gain ?? 1) + body * v.decay(u, 0.1, 7) * 0.5);
    },
  }),
  whoosh: (o = {}) => ({
    dur: o.dur ?? 0.34,
    fn: (v, u, p) => {
      const dur = o.dur ?? 0.34;
      const t = u / dur;
      const cut = (o.f0 ?? 1800) * Math.pow((o.f1 ?? 260) / (o.f0 ?? 1800), t);
      p.f = p.f || v.svf(1000, o.q ?? 1.3);
      p.f2 = p.f2 || v.svf(1000, o.q ?? 1.3);
      // rebuild cutoff each sample by scaling: cheap trick — modulate via q-free one-pole
      const n = v.noise();
      const filtered = p.f(n);
      const a = v.ad(u, dur, dur * 0.22, 2.4);
      return v.sat(filtered.bp * a * (o.gain ?? 1) * (0.4 + 0.6 * Math.sin(Math.PI * t)));
    },
  }),
  tone: (o = {}) => ({
    dur: o.dur ?? 0.4,
    fn: (v, u, p) => {
      const f = (o.f0 ?? 440) * Math.pow((o.f1 ?? o.f0 ?? 440) / (o.f0 ?? 440), u / (o.dur ?? 0.4));
      p.ph = (p.ph || 0) + f * v.inv;
      let s = v.osc(o.type ?? 'sine', p.ph);
      if (o.fm) s = v.osc(o.type ?? 'sine', p.ph + Math.sin(TAU * (o.fm.f ?? 90) * u) * (o.fm.i ?? 2));
      return v.sat(s * v.ad(u, o.dur ?? 0.4, o.attack ?? 0.006, o.k ?? 4) * (o.gain ?? 0.6));
    },
  }),
  bell: (o = {}) => ({
    dur: o.dur ?? 1.4,
    fn: (v, u, p) => {
      const dur = o.dur ?? 1.4;
      const partials = o.partials ?? [1, 2.01, 2.98, 4.17, 5.43];
      const gains = o.gains ?? [1, 0.55, 0.34, 0.2, 0.12];
      let s = 0;
      for (let i = 0; i < partials.length; i++) {
        const f = (o.f0 ?? 660) * partials[i];
        s += v.osc('sine', f * u) * gains[i];
      }
      return v.sat(s * Math.exp(-u / dur * (o.k ?? 2.6)) * (o.gain ?? 0.35));
    },
  }),
  growl: (o = {}) => ({
    dur: o.dur ?? 0.9,
    fn: (v, u, p) => {
      const dur = o.dur ?? 0.9;
      const f = (o.f0 ?? 90) * (1 + Math.sin(u * (o.wobble ?? 22)) * 0.08);
      p.ph = (p.ph || 0) + f * v.inv;
      p.f = p.f || v.lp1(o.cut ?? 700);
      let s = v.osc('saw', p.ph) * 0.7 + v.osc('square', p.ph * 0.5) * 0.3;
      s = p.f(s);
      s += v.noise() * 0.12;
      return v.sat(s * v.ar(u, dur, 0.05) * (o.gain ?? 0.5));
    },
  }),
  fire: (o = {}) => ({
    dur: o.dur ?? 1.2,
    fn: (v, u, p) => {
      const dur = o.dur ?? 1.2;
      p.f = p.f || v.svf(o.cut ?? 700, 0.8);
      const n = p.f(v.noise());
      const crackle = (Math.random() < 0.04 ? (Math.random() * 2 - 1) * 0.8 : 0) * Math.exp(-u / dur * 3);
      const roar = n.lp * Math.exp(-u / dur * 2.2) * 1.4;
      const hiss = n.hp * Math.exp(-u / dur * 4.5) * 0.5;
      return v.sat((roar + hiss + crackle) * (o.gain ?? 0.5));
    },
  }),
};

/**
 * name -> recipe. Names are exactly what the game calls in `audio.play(...)`.
 * Anything absent here falls back to the downloadable sample banks.
 */
export const SYNTH_RECIPES = {
  // ── blades & guards ────────────────────────────────────────────────
  slash: R.whoosh({ dur: 0.26, f0: 2600, f1: 420, gain: 0.55 }),
  whoosh: R.whoosh({ dur: 0.34, f0: 1700, f1: 300, gain: 0.45 }),
  draw_blade: R.whoosh({ dur: 0.42, f0: 900, f1: 4200, gain: 0.5 }),
  sheath: R.whoosh({ dur: 0.38, f0: 3800, f1: 700, gain: 0.4 }),
  heavy_swing: R.whoosh({ dur: 0.55, f0: 1200, f1: 180, gain: 0.7 }),
  heavy_impact: { dur: 0.7, fn: (v, u, p) => {
    p.f = p.f || v.svf(320, 1.2);
    const n = p.f(v.noise());
    const thud = v.osc('sine', 120 * (1 - u * 0.6) * u) * Math.exp(-u / 0.35 * 5);
    return v.sat((n.lp * Math.exp(-u / 0.5 * 3.4) * 1.6 + thud * 1.1) * 0.8);
  } },
  thrust: R.whoosh({ dur: 0.28, f0: 3400, f1: 900, gain: 0.5 }),
  claw_slash: { dur: 0.3, fn: (v, u, p) => {
    p.f = p.f || v.svf(2200, 2.4);
    const n = p.f(v.noise());
    return v.sat(n.bp * v.ad(u, 0.22, 0.004, 5) * 0.75 + v.noise() * 0.05 * Math.exp(-u * 30));
  } },
  vacuum_slash: { dur: 0.5, fn: (v, u, p) => {
    p.f = p.f || v.svf(600, 3.2);
    const t = u / 0.5;
    const n = p.f(v.noise());
    return v.sat(n.bp * Math.sin(Math.PI * t) * v.ad(u, 0.45, 0.03, 3) * 0.8);
  } },
  parry_clang: { dur: 0.85, fn: (v, u, p) => {
    let s = 0;
    const partials = [1, 2.41, 3.83, 5.17, 7.02, 9.4];
    const gains = [1, 0.62, 0.4, 0.26, 0.15, 0.08];
    for (let i = 0; i < partials.length; i++) {
      s += v.osc('sine', 2100 * partials[i] * u) * gains[i] * Math.exp(-u / 0.6 * (2.2 + i * 0.7));
    }
    const attack = p.f || (p.f = v.svf(4200, 1.4));
    const n = attack(v.noise());
    return v.sat(s * 0.3 + n.bp * Math.exp(-u / 0.05 * 12) * 0.5);
  } },
  parry_perfect: { dur: 1.5, fn: (v, u, p) => {
    let s = 0;
    for (let i = 0; i < 5; i++) {
      s += v.osc('sine', [880, 1320, 1760, 2640, 3520][i] * u) * [1, 0.5, 0.32, 0.18, 0.1][i] * Math.exp(-u / 1.1 * (1.6 + i * 0.5));
    }
    const frost = (p.f || (p.f = v.svf(5200, 1.1)))(v.noise());
    return v.sat(s * 0.26 + frost.hp * Math.exp(-u / 0.09 * 14) * 0.45);
  } },
  block_impact: { dur: 0.32, fn: (v, u, p) => {
    p.f = p.f || v.svf(700, 1.6);
    const n = p.f(v.noise());
    const body = v.osc('tri', 220 * u) * Math.exp(-u / 0.12 * 6);
    return v.sat(n.bp * v.ad(u, 0.2, 0.002, 6) * 0.7 + body * 0.5);
  } },
  guard_break: { dur: 0.7, fn: (v, u, p) => {
    const n = (p.f || (p.f = v.svf(500, 1.1)))(v.noise());
    const crack = v.osc('square', 300 * (1 - u * 0.7) * u) * Math.exp(-u / 0.3 * 4);
    return v.sat(n.lp * Math.exp(-u / 0.5 * 3) * 1.2 + crack * 0.5);
  } },
  critical_hit: { dur: 0.6, fn: (v, u, p) => {
    const n = (p.f || (p.f = v.svf(1400, 1.4)))(v.noise());
    const ring = v.osc('sine', 1400 * u) * Math.exp(-u / 0.35 * 4) * 0.4;
    const sub = v.osc('sine', 70 * (1 - u) * u) * Math.exp(-u / 0.2 * 6) * 0.9;
    return v.sat(n.bp * Math.exp(-u / 0.22 * 5) * 1.1 + ring + sub);
  } },
  execution: { dur: 1.3, fn: (v, u, p) => {
    const n = (p.f || (p.f = v.svf(400, 0.9)))(v.noise());
    const gore = n.lp * Math.exp(-u / 0.35 * 4) * 1.3;
    const ring = v.osc('sine', 520 * u) * Math.exp(-u / 1.0 * 2.2) * 0.5;
    const sub = v.osc('sine', 42 * (1 - u * 0.4) * u) * Math.exp(-u / 0.5 * 3) * 0.9;
    const slice = Math.exp(-u / 0.06 * 16) * v.noise() * 0.5;
    return v.sat(gore + ring + sub + slice);
  } },
  dodge_whoosh: R.whoosh({ dur: 0.38, f0: 1400, f1: 240, gain: 0.4 }),
  jump: { dur: 0.28, fn: (v, u, p) => {
    const push = v.osc('sine', 160 * (1 + u * 1.6) * u) * Math.exp(-u / 0.14 * 5) * 0.5;
    const cloth = (p.f || (p.f = v.svf(2600, 0.8)))(v.noise()).bp * Math.exp(-u / 0.16 * 6) * 0.35;
    return v.sat(push + cloth);
  } },
  land: { dur: 0.3, fn: (v, u, p) => {
    const n = (p.f || (p.f = v.svf(300, 1.0)))(v.noise());
    return v.sat(n.lp * Math.exp(-u / 0.18 * 5) * 1.1 + v.osc('sine', 90 * (1 - u) * u) * Math.exp(-u / 0.1 * 7) * 0.7);
  } },
  water_splash: { dur: 0.7, fn: (v, u, p) => {
    p.f = p.f || v.svf(1500, 0.9);
    const n = p.f(v.noise());
    const drop = v.osc('sine', 700 * (1 + u * 2.2) * u) * Math.exp(-u / 0.09 * 9) * 0.6;
    return v.sat(n.bp * Math.exp(-u / 0.5 * 3.2) * 0.9 + drop);
  } },

  // ── the fox ────────────────────────────────────────────────────────
  kon_summon: { dur: 0.9, fn: (v, u, p) => {
    // a throat opening under the floor: rising growl + ghostly shimmer
    const g = R.growl({ dur: 0.8, f0: 60, wobble: 30, cut: 420, gain: 0.55 }).fn(v, u, p.g || (p.g = {}));
    const shimmer = v.osc('sine', 1200 * (1 + u * 0.8) * u) * Math.exp(-u / 0.8 * 2.4) * 0.22;
    const air = (p.f || (p.f = v.svf(900, 2.0)))(v.noise()).bp * Math.exp(-u / 0.7 * 3) * 0.4;
    return v.sat(g + shimmer + air);
  } },
  kon_bite: { dur: 0.6, fn: (v, u, p) => {
    const snap = Math.exp(-u / 0.035 * 22) * v.noise();
    const crunch = (p.f || (p.f = v.svf(700, 1.0)))(v.noise()).lp * Math.exp(-u / 0.22 * 5) * 1.4;
    const sub = v.osc('sine', 88 * (1 - u * 0.5) * u) * Math.exp(-u / 0.25 * 4) * 1.0;
    const wet = (p.f2 || (p.f2 = v.svf(2200, 3.0)))(v.noise()).bp * Math.exp(-u / 0.15 * 7) * 0.6;
    return v.sat(snap * 0.9 + crunch + sub + wet);
  } },
  devour: { dur: 1.1, fn: (v, u, p) => {
    const chew = (p.f || (p.f = v.svf(500, 1.2)))(v.noise()).lp
      * (0.5 + 0.5 * Math.sin(u * 46)) * Math.exp(-u / 0.9 * 2.2) * 1.2;
    const gulp = v.osc('sine', 120 * (1 - u * 0.6) * u) * Math.exp(-u / 0.5 * 3) * 0.5;
    return v.sat(chew + gulp);
  } },
  fox_bark: { dur: 0.34, fn: (v, u, p) => {
    const f = 620 * (1 - u * 0.55) + Math.sin(u * 60) * 40;
    p.ph = (p.ph || 0) + f * v.inv;
    const s = v.osc('saw', p.ph) * 0.6 + v.osc('tri', p.ph * 2) * 0.3;
    const form = (p.f || (p.f = v.svf(1100, 2.2)))(s).bp;
    return v.sat(form * v.ad(u, 0.2, 0.008, 6) * 0.7);
  } },
  hound_howl: { dur: 1.8, fn: (v, u, p) => {
    const f = 300 * (1 + Math.sin(u * 2.2) * 0.18) * (1 + u * 0.1);
    p.ph = (p.ph || 0) + f * v.inv;
    const s = v.osc('saw', p.ph) * 0.5 + v.osc('sine', p.ph * 2) * 0.3;
    const form = (p.f || (p.f = v.svf(800, 3.0)))(s).bp;
    return v.sat(form * v.ar(u, 1.6, 0.25) * 0.55);
  } },
  tail_sweep: R.whoosh({ dur: 0.5, f0: 900, f1: 160, gain: 0.65 }),
  tail_slam: { dur: 0.8, fn: (v, u, p) => {
    const n = (p.f || (p.f = v.svf(380, 1.1)))(v.noise());
    const thud = v.osc('sine', 110 * (1 - u * 0.5) * u) * Math.exp(-u / 0.3 * 4);
    return v.sat(n.lp * Math.exp(-u / 0.55 * 3) * 1.4 + thud * 1.0);
  } },
  fox_pounce: R.whoosh({ dur: 0.6, f0: 2000, f1: 200, gain: 0.6 }),

  // ── spirit / elemental ─────────────────────────────────────────────
  fire_cast: { dur: 0.55, fn: (v, u, p) => {
    const f = R.fire({ dur: 0.5, cut: 900, gain: 0.4 }).fn(v, u, p.f1 || (p.f1 = {}));
    const whoomph = v.osc('sine', 180 * (1 + u * 2.4) * u) * Math.exp(-u / 0.25 * 5) * 0.5;
    return v.sat(f + whoomph);
  } },
  fire_impact: R.fire({ dur: 0.8, cut: 620, gain: 0.55 }),
  fire_whoosh: R.fire({ dur: 0.9, cut: 1100, gain: 0.35 }),
  flame_pillar: R.fire({ dur: 1.6, cut: 520, gain: 0.6 }),
  dragon_fire: R.fire({ dur: 1.8, cut: 430, gain: 0.7 }),
  spirit_cast: { dur: 0.7, fn: (v, u, p) => {
    let s = 0;
    for (let i = 0; i < 4; i++) {
      const f = [330, 440, 660, 880][i] * (1 + u * 0.5);
      s += v.osc('sine', f * u) * [1, 0.6, 0.35, 0.2][i] * Math.exp(-u / 0.6 * (2.2 + i * 0.8));
    }
    const air = (p.f || (p.f = v.svf(1800, 2.4)))(v.noise()).bp * Math.exp(-u / 0.5 * 3.4) * 0.35;
    return v.sat(s * 0.3 + air);
  } },
  spirit_whoosh: { dur: 0.5, fn: (v, u, p) => {
    const n = (p.f || (p.f = v.svf(1200, 3.4)))(v.noise()).bp;
    const t = u / 0.5;
    return v.sat(n * Math.sin(Math.PI * t) * v.ad(u, 0.45, 0.05, 2.6) * 0.7);
  } },
  spirit_blast: { dur: 0.9, fn: (v, u, p) => {
    const beam = v.osc('saw', 220 * (1 - u * 0.4) * u) * Math.exp(-u / 0.5 * 3) * 0.4;
    const air = (p.f || (p.f = v.svf(2400, 1.6)))(v.noise()).bp * Math.exp(-u / 0.6 * 3) * 0.7;
    return v.sat(beam + air);
  } },
  spirit_impact: { dur: 0.5, fn: (v, u, p) => {
    const ring = v.osc('sine', 900 * (1 - u * 0.3) * u) * Math.exp(-u / 0.3 * 4) * 0.5;
    const n = (p.f || (p.f = v.svf(1600, 2.2)))(v.noise()).bp * Math.exp(-u / 0.25 * 5) * 0.6;
    return v.sat(ring + n);
  } },
  wisp_hit: { dur: 0.35, fn: (v, u, p) => {
    const f = 1400 * (1 + u * 1.4);
    p.ph = (p.ph || 0) + f * v.inv;
    return v.sat(v.osc('sine', p.ph) * Math.exp(-u / 0.2 * 5) * 0.45);
  } },
  void_open: { dur: 1.4, fn: (v, u, p) => {
    const sub = v.osc('sine', 30 * (1 + u * 0.5) * u) * Math.exp(-u / 1.2 * 1.6) * 0.9;
    const rev = v.osc('saw', 70 * (1 - u * 0.5) * u) * Math.exp(-u / 0.9 * 2.4) * 0.25;
    const air = (p.f || (p.f = v.svf(600, 4.0)))(v.noise()).bp * Math.sin(Math.PI * (u / 1.4)) * 0.5;
    return v.sat(sub + rev + air);
  } },
  darkness_cast: { dur: 1.2, fn: (v, u, p) => {
    const low = v.osc('sine', 55 * (1 - u * 0.4) * u) * Math.exp(-u / 1.0 * 1.8) * 0.8;
    const hiss = (p.f || (p.f = v.svf(3200, 1.2)))(v.noise()).hp * Math.exp(-u / 0.8 * 2.6) * 0.4;
    return v.sat(low + hiss);
  } },
  moon_slash: { dur: 0.6, fn: (v, u, p) => {
    const cut = (p.f || (p.f = v.svf(3000, 2.6)))(v.noise()).bp * Math.exp(-u / 0.25 * 5) * 0.8;
    const chime = v.osc('sine', 1760 * u) * Math.exp(-u / 0.5 * 3) * 0.3;
    return v.sat(cut + chime);
  } },
  kagura_loop: { dur: 2.4, fn: (v, u, p) => {
    const bell = R.bell({ dur: 1.6, f0: 1046, gain: 0.16 }).fn(v, u % 0.6, p.b || (p.b = {}));
    const pulse = Math.sin(u * TAU * 2.6) > 0.7 ? v.osc('sine', 660 * u) * Math.exp(-(u % 0.4) / 0.3 * 4) * 0.14 : 0;
    const air = (p.f || (p.f = v.svf(2200, 2)))(v.noise()).bp * 0.12;
    return v.sat(bell + pulse + air);
  } },
  whirlwind_loop: { dur: 1.6, fn: (v, u, p) => {
    const n = (p.f || (p.f = v.svf(700, 1.4)))(v.noise()).bp;
    const sweep = 0.6 + 0.4 * Math.sin(u * TAU * 3.4);
    return v.sat(n * sweep * v.ar(u, 1.5, 0.2) * 0.6);
  } },
  thunder: { dur: 2.2, fn: (v, u, p) => {
    const crack = Math.exp(-u / 0.05 * 20) * v.noise() * 0.8;
    const rumble = (p.f || (p.f = v.svf(160, 0.8)))(v.noise()).lp * Math.exp(-u / 2.0 * 1.4) * 1.2;
    return v.sat(crack + rumble);
  } },
  lightning_crack: { dur: 0.6, fn: (v, u, p) => {
    const crack = Math.exp(-u / 0.03 * 24) * v.noise() * 0.7;
    const zap = (p.f || (p.f = v.svf(3600, 3.0)))(v.noise()).bp * Math.exp(-u / 0.2 * 6) * 0.7;
    return v.sat(crack + zap);
  } },
  frost_breath: { dur: 1.3, fn: (v, u, p) => {
    const n = (p.f || (p.f = v.svf(2600, 1.1)))(v.noise()).hp;
    const shimmer = v.osc('sine', 3200 * (1 + u * 0.3) * u) * Math.exp(-u / 0.8 * 2.4) * 0.14;
    return v.sat(n * v.ar(u, 1.2, 0.15) * 0.6 + shimmer);
  } },
  water_whip: { dur: 0.7, fn: (v, u, p) => {
    const n = (p.f || (p.f = v.svf(1800, 1.8)))(v.noise()).bp;
    const lash = Math.exp(-u / 0.06 * 14) * v.noise() * 0.6;
    return v.sat(n * v.ad(u, 0.5, 0.01, 3.6) * 0.7 + lash);
  } },
  drown: { dur: 1.2, fn: (v, u, p) => {
    const bubbles = (Math.random() < 0.14 ? (Math.random() * 2 - 1) * 0.5 : 0) * Math.exp(-u / 1.0 * 2);
    const water = (p.f || (p.f = v.svf(420, 1.0)))(v.noise()).lp * v.ar(u, 1.1, 0.1) * 0.8;
    return v.sat(water + bubbles);
  } },
  grass_grow: { dur: 1.4, fn: (v, u, p) => {
    const rustle = (p.f || (p.f = v.svf(3600, 0.9)))(v.noise()).hp * Math.sin(Math.PI * (u / 1.4)) * 0.5;
    const swell = v.osc('sine', 220 * (1 + u * 0.8) * u) * Math.exp(-u / 1.0 * 1.8) * 0.3;
    return v.sat(rustle + swell);
  } },

  // ── player state ───────────────────────────────────────────────────
  player_hurt: { dur: 0.45, fn: (v, u, p) => {
    const grunt = v.osc('saw', 150 * (1 - u * 0.5) * u) * Math.exp(-u / 0.18 * 5) * 0.5;
    const air = (p.f || (p.f = v.svf(900, 1.4)))(v.noise()).bp * Math.exp(-u / 0.2 * 5) * 0.4;
    return v.sat(grunt + air + v.noise() * 0.05 * Math.exp(-u * 20));
  } },
  player_death: { dur: 2.0, fn: (v, u, p) => {
    const breath = (p.f || (p.f = v.svf(700, 1.2)))(v.noise()).bp * Math.exp(-u / 1.4 * 2.2) * 0.6;
    const heart = Math.sin(u * TAU * 1.1) > 0.85 ? v.osc('sine', 55 * u) * Math.exp(-(u % 1) / 0.3 * 5) * 0.9 : 0;
    const fall = v.osc('sine', 90 * (1 - u * 0.7) * u) * Math.exp(-u / 1.2 * 1.8) * 0.5;
    return v.sat(breath + heart + fall);
  } },
  second_wind: { dur: 1.6, fn: (v, u, p) => {
    const inhale = (p.f || (p.f = v.svf(1200, 1.6)))(v.noise()).bp * Math.sin(Math.PI * Math.min(1, u / 0.35)) * 0.7;
    let chord = 0;
    for (const [f, g] of [[220, 1], [330, 0.6], [440, 0.4]]) chord += v.osc('sine', f * u) * g * Math.exp(-u / 1.4 * 1.6);
    return v.sat(inhale + chord * 0.22);
  } },
  devil_form: { dur: 2.2, fn: (v, u, p) => {
    const grow = R.growl({ dur: 2.0, f0: 48, wobble: 26, cut: 500, gain: 0.6 }).fn(v, u, p.g || (p.g = {}));
    const rise = v.osc('saw', 60 * (1 + u * 2.6) * u) * Math.exp(-u / 1.6 * 1.6) * 0.4;
    const crack = (p.f || (p.f = v.svf(2600, 2.0)))(v.noise()).bp * Math.exp(-u / 0.4 * 4) * 0.4;
    return v.sat(grow + rise + crack);
  } },
  onryo_release: { dur: 2.6, fn: (v, u, p) => {
    const scream = v.osc('saw', 420 * (1 + u * 0.6) * u) * Math.exp(-u / 1.6 * 1.4) * 0.35;
    const sub = v.osc('sine', 34 * (1 + u * 0.3) * u) * Math.exp(-u / 2.2 * 1.2) * 0.9;
    const air = (p.f || (p.f = v.svf(1400, 1.4)))(v.noise()).bp * Math.sin(Math.PI * (u / 2.6)) * 0.6;
    return v.sat(scream + sub + air);
  } },
  sacrifice: { dur: 1.5, fn: (v, u, p) => {
    const cut = Math.exp(-u / 0.04 * 20) * v.noise() * 0.7;
    const drain = v.osc('saw', 300 * (1 - u * 0.7) * u) * Math.exp(-u / 0.9 * 2.4) * 0.4;
    const pulse = v.osc('sine', 60 * u) * (Math.sin(u * TAU * 2.4) > 0.6 ? 0.8 : 0) * Math.exp(-u / 1.2 * 1.8);
    return v.sat(cut + drain + pulse);
  } },
  heartbeat: { dur: 1.0, fn: (v, u, p) => {
    const beat = (t, scale) => Math.exp(-t / 0.09 * 9) * v.osc('sine', 52 * (1 - t * 0.5) * t) * scale;
    return v.sat(beat(u, 1.0) + beat(u - 0.28, 0.7) * (u > 0.28 ? 1 : 0));
  } },
  heal_chime: { dur: 1.6, fn: (v, u, p) => {
    let s = 0;
    for (const [f, g] of [[523, 1], [659, 0.7], [784, 0.5], [1046, 0.3]]) {
      s += v.osc('sine', f * u) * g * Math.exp(-u / 1.4 * 1.8);
    }
    return v.sat(s * 0.22);
  } },

  // ── enemies ────────────────────────────────────────────────────────
  enemy_alert: { dur: 0.5, fn: (v, u, p) => {
    const f = 400 * (1 + u * 0.6);
    p.ph = (p.ph || 0) + f * v.inv;
    return v.sat(v.osc('square', p.ph) * v.ad(u, 0.3, 0.01, 5) * 0.35);
  } },
  enemy_death: { dur: 1.1, fn: (v, u, p) => {
    const fall = (p.f || (p.f = v.svf(500, 1.0)))(v.noise()).lp * Math.exp(-u / 0.7 * 3) * 0.9;
    const gasp = v.osc('saw', 200 * (1 - u * 0.7) * u) * Math.exp(-u / 0.5 * 3) * 0.35;
    return v.sat(fall + gasp);
  } },
  boss_death: { dur: 3.2, fn: (v, u, p) => {
    const rumble = (p.f || (p.f = v.svf(200, 0.9)))(v.noise()).lp * Math.exp(-u / 2.6 * 1.3) * 1.1;
    const moan = v.osc('saw', 120 * (1 - u * 0.8) * u) * Math.exp(-u / 2.2 * 1.4) * 0.4;
    const shatter = Math.exp(-u / 0.08 * 14) * v.noise() * 0.4;
    return v.sat(rumble + moan + shatter);
  } },
  roar_boss: { dur: 2.0, fn: (v, u, p) => {
    const g = R.growl({ dur: 1.8, f0: 72, wobble: 34, cut: 800, gain: 0.75 }).fn(v, u, p.g || (p.g = {}));
    const sub = v.osc('sine', 40 * (1 + u * 0.4) * u) * Math.exp(-u / 1.6 * 1.5) * 0.8;
    return v.sat(g + sub);
  } },
  wail: { dur: 1.8, fn: (v, u, p) => {
    const f = 700 * (1 + Math.sin(u * 3.2) * 0.14);
    p.ph = (p.ph || 0) + f * v.inv;
    const s = v.osc('sine', p.ph) * 0.6 + v.osc('tri', p.ph * 1.5) * 0.2;
    const form = (p.f || (p.f = v.svf(1200, 4.0)))(s).bp;
    return v.sat(form * v.ar(u, 1.6, 0.2) * 0.5);
  } },
  scream: { dur: 1.2, fn: (v, u, p) => {
    const f = 900 * (1 + u * 0.5);
    p.ph = (p.ph || 0) + f * v.inv;
    const s = v.osc('saw', p.ph) * 0.5 + v.noise() * 0.2;
    const form = (p.f || (p.f = v.svf(2000, 3.0)))(s).bp;
    return v.sat(form * v.ad(u, 0.9, 0.02, 2.6) * 0.55);
  } },
  skull_laugh: { dur: 1.6, fn: (v, u, p) => {
    const clack = Math.sin(u * TAU * 9) > 0.6 ? Math.exp(-(u % 0.12) / 0.03 * 12) * v.noise() * 0.5 : 0;
    const rattle = (p.f || (p.f = v.svf(3400, 1.6)))(v.noise()).hp * Math.exp(-u / 1.2 * 2.2) * 0.4;
    const breath = v.osc('sine', 90 * (1 - u * 0.5) * u) * Math.exp(-u / 1.0 * 1.8) * 0.4;
    return v.sat(clack + rattle + breath);
  } },
  contract_steal: { dur: 1.5, fn: (v, u, p) => {
    const pull = v.osc('saw', 400 * (1 - u * 0.8) * u) * Math.exp(-u / 1.0 * 2.2) * 0.4;
    const ink = (p.f || (p.f = v.svf(700, 2.4)))(v.noise()).bp * Math.exp(-u / 1.2 * 2) * 0.6;
    const seal = Math.exp(-u / 0.04 * 18) * v.noise() * 0.5;
    return v.sat(pull + ink + seal);
  } },
  bow_release: { dur: 0.3, fn: (v, u, p) => {
    const snap = Math.exp(-u / 0.02 * 22) * v.noise() * 0.6;
    const string = v.osc('tri', 320 * (1 - u * 0.6) * u) * Math.exp(-u / 0.12 * 6) * 0.5;
    return v.sat(snap + string);
  } },
  mirror_cast: { dur: 1.0, fn: (v, u, p) => {
    const shimmer = (p.f || (p.f = v.svf(4200, 2.2)))(v.noise()).hp * Math.sin(Math.PI * (u / 1.0)) * 0.5;
    let s = 0;
    for (const f of [880, 1174, 1568]) s += v.osc('sine', f * u) * Math.exp(-u / 0.9 * 2.4) * 0.16;
    return v.sat(shimmer + s);
  } },
  summon_circle: { dur: 1.3, fn: (v, u, p) => {
    let s = 0;
    for (const [f, g] of [[110, 1], [165, 0.6], [220, 0.4], [330, 0.2]]) {
      s += v.osc('sine', f * (1 + u * 0.25) * u) * g * Math.exp(-u / 1.1 * 1.8);
    }
    const air = (p.f || (p.f = v.svf(1600, 2.6)))(v.noise()).bp * Math.sin(Math.PI * (u / 1.3)) * 0.45;
    return v.sat(s * 0.3 + air);
  } },
  mark_hit: { dur: 0.7, fn: (v, u, p) => {
    const stamp = Math.exp(-u / 0.03 * 18) * v.noise() * 0.5;
    const seal = v.osc('sine', 520 * (1 - u * 0.4) * u) * Math.exp(-u / 0.4 * 3) * 0.5;
    return v.sat(stamp + seal);
  } },
  possess_cast: { dur: 1.2, fn: (v, u, p) => {
    const enter = v.osc('saw', 240 * (1 - u * 0.6) * u) * Math.exp(-u / 0.9 * 2.4) * 0.35;
    const whisper = (p.f || (p.f = v.svf(2400, 3.2)))(v.noise()).bp * v.ar(u, 1.1, 0.15) * 0.5;
    return v.sat(enter + whisper);
  } },
  echo_cast: { dur: 0.9, fn: (v, u, p) => {
    const taps = [0, 0.13, 0.29, 0.5];
    let s = 0;
    for (let i = 0; i < taps.length; i++) {
      const t = u - taps[i];
      if (t > 0) s += v.osc('sine', 880 * t) * Math.exp(-t / 0.3 * 4) * (1 - i * 0.22);
    }
    return v.sat(s * 0.28);
  } },
  buff_apply: { dur: 0.9, fn: (v, u, p) => {
    let s = 0;
    for (const [f, g] of [[392, 1], [523, 0.7], [659, 0.45]]) {
      s += v.osc('sine', f * (1 + u * 0.12) * u) * g * Math.exp(-u / 0.8 * 2.2);
    }
    return v.sat(s * 0.25);
  } },
  blink: { dur: 0.45, fn: (v, u, p) => {
    // teleport: a sucked-in breath of air and a bright pop where you reappear
    const inSweep = v.osc('sine', 240 * Math.pow(9, u / 0.18)) * v.ad(u, 0.18, 0.004, 6) * 0.35;
    const pop = Math.exp(-Math.max(0, u - 0.14) / 0.05 * 9) * v.noise() * 0.5;
    const air = (p.f || (p.f = v.svf(3600, 2.2)))(v.noise()).bp * Math.sin(Math.PI * (u / 0.45)) * 0.4;
    const tail = v.osc('sine', 1560 * Math.max(0, u - 0.16)) * Math.exp(-Math.max(0, u - 0.16) / 0.25 * 3.4) * 0.2;
    return v.sat(inSweep + pop + air + tail);
  } },
  shadow_step: { dur: 0.62, fn: (v, u, p) => {
    // stepping through a shadow: cloth, a soft implosion, one low footfall
    const cloth = (p.f || (p.f = v.svf(1400, 1.8)))(v.noise()).bp * v.ad(u, 0.3, 0.02, 4) * 0.55;
    const implode = v.osc('sine', 420 * (1 - u * 0.75) * u) * Math.exp(-u / 0.3 * 3) * 0.45;
    const thud = v.osc('sine', 90 * Math.max(0, u - 0.24)) * Math.exp(-Math.max(0, u - 0.24) / 0.18 * 4) * 0.5;
    const hiss = (p.h || (p.h = v.svf(5200, 1.4)))(v.noise()).hp * Math.exp(-u / 0.35 * 3.4) * 0.22;
    return v.sat(cloth + implode + thud + hiss);
  } },
  lantern_place: { dur: 0.7, fn: (v, u, p) => {
    const wood = (p.f || (p.f = v.svf(500, 1.4)))(v.noise()).bp * Math.exp(-u / 0.12 * 6) * 0.7;
    const glow = v.osc('sine', 660 * u) * Math.exp(-u / 0.6 * 2.6) * 0.25;
    return v.sat(wood + glow);
  } },
  charge: { dur: 1.2, fn: (v, u, p) => {
    const f = 70 * Math.pow(520 / 70, u / 1.1);
    p.ph = (p.ph || 0) + f * v.inv;
    const s = v.osc('saw', p.ph);
    const filt = (p.f || (p.f = v.svf(600, 6)))(s).lp;
    return v.sat(filt * v.ar(u, 1.15, 0.9) * 0.35);
  } },

  // ── ui & progression ───────────────────────────────────────────────
  level_up: { dur: 1.8, fn: (v, u, p) => {
    const notes = [[392, 0], [523, 0.12], [659, 0.24], [784, 0.36]];
    let s = 0;
    for (const [f, d] of notes) {
      const t = u - d;
      if (t > 0) s += v.osc('sine', f * t) * Math.exp(-t / 0.9 * 2.0);
    }
    const bell = R.bell({ dur: 1.4, f0: 1046, gain: 0.14 }).fn(v, u, p.b || (p.b = {}));
    return v.sat(s * 0.16 + bell);
  } },
  skill_learn: { dur: 1.0, fn: (v, u, p) => {
    let s = 0;
    for (const [f, g] of [[523, 1], [784, 0.6], [1046, 0.35]]) s += v.osc('sine', f * u) * g * Math.exp(-u / 0.8 * 2.4);
    const stamp = Math.exp(-u / 0.02 * 20) * v.noise() * 0.25;
    return v.sat(s * 0.22 + stamp);
  } },
  mutation: { dur: 2.8, fn: (v, u, p) => {
    const rise = v.osc('saw', 55 * (1 + u * 3.4) * u) * Math.exp(-u / 2.2 * 1.2) * 0.4;
    const choir = (p.f || (p.f = v.svf(900, 2.2)));
    let s = 0;
    for (const [f, g] of [[220, 1], [330, 0.7], [440, 0.5], [660, 0.3]]) {
      s += v.osc('sine', f * (1 + u * 0.2) * u) * g * Math.exp(-u / 2.4 * 1.4);
    }
    const air = choir(v.noise()).bp * Math.sin(Math.PI * (u / 2.8)) * 0.4;
    return v.sat(rise + s * 0.2 + air);
  } },
  quest_complete: { dur: 2.0, fn: (v, u, p) => {
    const notes = [[523, 0], [659, 0.14], [784, 0.28], [1046, 0.42]];
    let s = 0;
    for (const [f, d] of notes) {
      const t = u - d;
      if (t > 0) s += v.osc('sine', f * t) * Math.exp(-t / 1.0 * 1.8);
    }
    return v.sat(s * 0.18);
  } },
  quest_fail: { dur: 1.4, fn: (v, u, p) => {
    const notes = [[392, 0], [349, 0.2], [294, 0.4]];
    let s = 0;
    for (const [f, d] of notes) {
      const t = u - d;
      if (t > 0) s += v.osc('tri', f * t) * Math.exp(-t / 1.0 * 1.6);
    }
    return v.sat(s * 0.2);
  } },
  discovery: { dur: 1.6, fn: (v, u, p) => {
    const bell = R.bell({ dur: 1.4, f0: 880, gain: 0.2 }).fn(v, u, p.b || (p.b = {}));
    const air = (p.f || (p.f = v.svf(2200, 1.4)))(v.noise()).bp * Math.exp(-u / 0.6 * 4) * 0.3;
    return v.sat(bell + air);
  } },
  save_game: { dur: 0.6, fn: (v, u, p) => {
    const brush = (p.f || (p.f = v.svf(1800, 1.2)))(v.noise()).bp * Math.exp(-u / 0.3 * 5) * 0.5;
    const seal = v.osc('sine', 660 * u) * Math.exp(-u / 0.4 * 3) * 0.2;
    return v.sat(brush + seal);
  } },
  coin_pickup: { dur: 0.5, fn: (v, u, p) => {
    let s = 0;
    for (const [f, g] of [[2000, 1], [2600, 0.6], [3300, 0.3]]) s += v.osc('sine', f * u) * g * Math.exp(-u / 0.35 * 4);
    return v.sat(s * 0.16);
  } },
  item_pickup: { dur: 0.5, fn: (v, u, p) => {
    const cloth = (p.f || (p.f = v.svf(2200, 1.6)))(v.noise()).bp * Math.exp(-u / 0.25 * 5) * 0.4;
    const chime = v.osc('sine', 1046 * u) * Math.exp(-u / 0.3 * 4) * 0.2;
    return v.sat(cloth + chime);
  } },
  equip: { dur: 0.5, fn: (v, u, p) => {
    const metal = (p.f || (p.f = v.svf(3000, 2.4)))(v.noise()).bp * Math.exp(-u / 0.2 * 6) * 0.5;
    const seat = v.osc('sine', 300 * (1 - u * 0.5) * u) * Math.exp(-u / 0.2 * 5) * 0.4;
    return v.sat(metal + seat);
  } },
  notification: { dur: 0.6, fn: (v, u, p) => {
    let s = 0;
    for (const [f, g] of [[784, 1], [1046, 0.5]]) s += v.osc('sine', f * u) * g * Math.exp(-u / 0.4 * 3);
    return v.sat(s * 0.15);
  } },
  dialogue_blip: { dur: 0.08, fn: (v, u, p) => {
    p.ph = (p.ph || 0) + 620 * v.inv;
    return v.sat(v.osc('tri', p.ph) * Math.exp(-u / 0.05 * 8) * 0.18);
  } },
  menu_move: { dur: 0.1, fn: (v, u, p) => {
    p.ph = (p.ph || 0) + 900 * v.inv;
    return v.sat(v.osc('sine', p.ph) * Math.exp(-u / 0.06 * 7) * 0.16);
  } },
  menu_confirm: { dur: 0.4, fn: (v, u, p) => {
    let s = 0;
    for (const [f, g] of [[523, 1], [784, 0.5]]) s += v.osc('sine', f * u) * g * Math.exp(-u / 0.3 * 3);
    return v.sat(s * 0.2);
  } },
  menu_back: { dur: 0.35, fn: (v, u, p) => {
    let s = 0;
    for (const [f, g] of [[523, 1], [392, 0.5]]) s += v.osc('sine', f * u) * g * Math.exp(-u / 0.28 * 3);
    return v.sat(s * 0.18);
  } },
  menu_error: { dur: 0.4, fn: (v, u, p) => {
    const f = 180 * (1 - u * 0.4);
    p.ph = (p.ph || 0) + f * v.inv;
    return v.sat(v.osc('square', p.ph) * v.ad(u, 0.25, 0.005, 5) * 0.2);
  } },
  page_turn: { dur: 0.3, fn: (v, u, p) => {
    const paper = (p.f || (p.f = v.svf(3200, 1.0)))(v.noise()).hp * Math.exp(-u / 0.2 * 5) * 0.35;
    return v.sat(paper);
  } },
};

/** Names the game may ask for that map onto an existing synthesised sound. */
export const SYNTH_ALIASES = {
  hit_spirit: 'spirit_impact',
  hit_fire: 'fire_impact',
  enemy_roar: 'roar_boss',
  bell_heavy_2: 'bell_heavy',
  kon_impact: 'kon_bite',
  fox_step: 'step_grass',
  blade_charge: 'charge',
  ult_ready: 'buff_apply',
  quest_new: 'notification',
  ui_move: 'ui_hover',
  ui_confirm: 'ui_confirm',
  ui_cancel: 'ui_back',
};

/**
 * Render every recipe into AudioBuffers.
 * @returns {Map<string, AudioBuffer[]>}
 */
export function renderSynthBank(AudioContextCtor, sampleRate = 44100) {
  const ctx = new AudioContextCtor();
  const rate = ctx.sampleRate || sampleRate;
  const out = new Map();
  for (const [name, recipe] of Object.entries(SYNTH_RECIPES)) {
    const len = Math.max(1, Math.ceil(recipe.dur * rate));
    const buf = ctx.createBuffer(1, len, rate);
    const data = buf.getChannelData(0);
    const v = voice(rate);
    const state = {};
    for (let i = 0; i < len; i++) {
      let s = recipe.fn(v, i / rate, state);
      if (!Number.isFinite(s)) s = 0;
      data[i] = Math.tanh(s) * 0.92;
    }
    // tiny fade in/out so nothing clicks
    const fade = Math.min(64, len >> 3);
    for (let i = 0; i < fade; i++) {
      data[i] *= i / fade;
      data[len - 1 - i] *= i / fade;
    }
    out.set(name, [buf]);
  }
  for (const [alias, target] of Object.entries(SYNTH_ALIASES)) {
    const src = out.get(target);
    if (src) out.set(alias, src);
  }
  return out;
}

/**
 * Render and install. Call once, after `audio.init()` (the sample rate must be
 * known). Safe to call when AudioContext is unavailable.
 */
export function installSynthSounds(audio, { onProgress = () => {} } = {}) {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC || !audio?.ready) return 0;
  const built = renderSynthBank(AC, audio.ctx.sampleRate);
  let n = 0;
  for (const [k, v] of built) {
    // never clobber a real sample bank — downloads win
    if (!audio.banks.has(k)) { audio.banks.set(k, v); n++; }
    onProgress(n / built.size, k);
  }
  return n;
}

/**
 * Small math toolbox: deterministic RNG, value/simplex noise, easing curves,
 * springs and angle helpers. Everything here is pure so it can be unit-tested
 * in node and reused by the smoke test.
 */

// --------------------------------------------------------------------------
// Random
// --------------------------------------------------------------------------
/** mulberry32 — tiny, fast, seedable, good enough for world generation. */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (min, max) => min + rng() * (max - min);
  rng.int = (min, max) => Math.floor(min + rng() * (max - min + 1));
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length) % arr.length];
  rng.chance = (p) => rng() < p;
  rng.sign = () => (rng() < 0.5 ? -1 : 1);
  rng.shuffle = (arr) => {
    const a2 = arr.slice();
    for (let i = a2.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a2[i], a2[j]] = [a2[j], a2[i]];
    }
    return a2;
  };
  /** Weighted pick: entries are [value, weight]. */
  rng.weighted = (entries) => {
    let total = 0;
    for (const e of entries) total += e[1];
    let r = rng() * total;
    for (const e of entries) {
      r -= e[1];
      if (r <= 0) return e[0];
    }
    return entries[entries.length - 1][0];
  };
  return rng;
}

/** String → stable 32-bit hash (FNV-1a), for seeding from names. */
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// --------------------------------------------------------------------------
// Scalar helpers
// --------------------------------------------------------------------------
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const remap = (v, a, b, c, d) => lerp(c, d, clamp01(invLerp(a, b, v)));
export const smoothstep = (t) => { const x = clamp01(t); return x * x * (3 - 2 * x); };
export const smootherstep = (t) => { const x = clamp01(t); return x * x * x * (x * (x * 6 - 15) + 10); };
export const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);
export const round = (v, n = 0) => { const m = 10 ** n; return Math.round(v * m) / m; };
export const isFinite1 = (v) => Number.isFinite(v);
/** Uniform random in [a, b). */
export const rand = (a = 1, b = null) => (b === null ? Math.random() * a : a + Math.random() * (b - a));
/** Random integer in [a, b] inclusive. */
export const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
/** Random element of an array. */
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];

/** Frame-rate independent exponential approach. */
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));

/** Frame-rate independent approach with explicit smoothing time (seconds). */
export const dampTime = (current, target, smoothTime, dt) =>
  damp(current, target, smoothTime <= 0 ? 1000 : 1 / smoothTime, dt);

/** Move `current` toward `target` by at most `maxDelta`. */
export function moveTowards(current, target, maxDelta) {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

/** Shortest signed delta between two angles, in (-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Frame-rate independent angle approach. */
export function dampAngle(current, target, lambda, dt) {
  return current + angleDelta(current, target) * (1 - Math.exp(-lambda * dt));
}

// --------------------------------------------------------------------------
// Easing
// --------------------------------------------------------------------------
export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outQuart: (t) => 1 - (1 - t) ** 4,
  inExpo: (t) => (t === 0 ? 0 : 2 ** (10 * t - 10)),
  outExpo: (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; },
  inBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; },
  outElastic: (t) => {
    const c4 = TAU / 3;
    return t === 0 ? 0 : t === 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  outBounce: (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  /** Punchy attack curve: slow wind-up, explosive strike, settle. */
  strike: (t) => {
    const x = clamp01(t);
    return x < 0.32 ? -0.55 * (x / 0.32) ** 2 : 1.35 * ease.outQuart((x - 0.32) / 0.68) - 0.35 * (x - 0.32) / 0.68;
  },
};

// --------------------------------------------------------------------------
// Noise
// --------------------------------------------------------------------------
const GRAD2 = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];

/** Deterministic 2D value/gradient noise, returns roughly [-1, 1]. */
export function noise2(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const h = (ix, iy) => {
    let n = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2246822519);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    const g = GRAD2[(n >>> 0) % 8];
    return g[0] * (xf - (ix === xi ? 0 : 1)) + g[1] * (yf - (iy === yi ? 0 : 1));
  };
  const n00 = h(xi, yi), n10 = h(xi + 1, yi), n01 = h(xi, yi + 1), n11 = h(xi + 1, yi + 1);
  return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v) * 0.72;
}

/** 3D value noise — used for cave carving, cloud and foliage density. */
export function noise3(x, y, z, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = smootherstep(xf), v = smootherstep(yf), w = smootherstep(zf);
  const h = (ix, iy, iz) => {
    let n = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 2147483647) ^ Math.imul(seed, 2246822519);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n >>> 0) % 2000) / 1000 - 1;
  };
  const c000 = h(xi, yi, zi), c100 = h(xi + 1, yi, zi), c010 = h(xi, yi + 1, zi), c110 = h(xi + 1, yi + 1, zi);
  const c001 = h(xi, yi, zi + 1), c101 = h(xi + 1, yi, zi + 1), c011 = h(xi, yi + 1, zi + 1), c111 = h(xi + 1, yi + 1, zi + 1);
  return lerp(
    lerp(lerp(c000, c100, u), lerp(c010, c110, u), v),
    lerp(lerp(c001, c101, u), lerp(c011, c111, u), v),
    w
  );
}

/** Fractal brownian motion over noise2. */
export function fbm2(x, y, { octaves = 4, lacunarity = 2.0, gain = 0.5, seed = 0 } = {}) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * freq, y * freq, seed + i * 1013);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Ridged multifractal — great for mountain spines. */
export function ridged2(x, y, { octaves = 4, lacunarity = 2.0, gain = 0.5, seed = 0 } = {}) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise2(x * freq, y * freq, seed + i * 7919));
    sum += amp * n * n;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

// --------------------------------------------------------------------------
// Critically damped spring (camera shake, weapon trails, UI pop-ins)
// --------------------------------------------------------------------------
export class Spring {
  constructor(value = 0, { stiffness = 140, damping = 18 } = {}) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.stiffness = stiffness;
    this.damping = damping;
  }
  set(v) { this.value = v; this.target = v; this.velocity = 0; return this; }
  to(v) { this.target = v; return this; }
  kick(v) { this.velocity += v; return this; }
  update(dt) {
    // sub-step for stability at low frame rates
    const steps = Math.min(4, Math.max(1, Math.ceil(dt / 0.008)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = (this.target - this.value) * this.stiffness - this.velocity * this.damping;
      this.velocity += a * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }
}

/** Spring for scalar pairs (used by camera shake offsets). */
export class Spring3 {
  constructor(s = 140, d = 18) {
    this.x = new Spring(0, { stiffness: s, damping: d });
    this.y = new Spring(0, { stiffness: s, damping: d });
    this.z = new Spring(0, { stiffness: s, damping: d });
  }
  kick(x, y, z) { this.x.kick(x); this.y.kick(y); this.z.kick(z); }
  to(v) { this.x.to(v); this.y.to(v); this.z.to(v); }
  update(dt) { this.x.update(dt); this.y.update(dt); this.z.update(dt); return this; }
}

// --------------------------------------------------------------------------
// Formatting helpers (UI)
// --------------------------------------------------------------------------
export function formatNumber(n) {
  const v = Math.round(n);
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e4) return `${(v / 1e3).toFixed(1)}k`;
  return String(v);
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/**
 * The smallest possible browser. Just enough for three.js, our Settings
 * (localStorage) and VFX's canvas-generated glow texture to load under node,
 * so the smoke test can exercise real game code without a GPU.
 */
const store = new Map();

function fakeCanvas(width = 1, height = 1) {
  const ctx = {
    canvas: null,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, font: '10px sans-serif',
    createRadialGradient() { return { addColorStop() {} }; },
    createLinearGradient() { return { addColorStop() {} }; },
    fillRect() {}, clearRect() {}, strokeRect() {}, fillText() {}, strokeText() {}, beginPath() {},
    arc() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {}, save() {}, restore() {},
    translate() {}, rotate() {}, scale() {}, drawImage() {},
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
    putImageData() {}, measureText: () => ({ width: 10 }),
  };
  const canvas = {
    width, height, style: {},
    getContext: () => ctx,
    toDataURL: () => 'data:image/png;base64,',
    addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height: 1 }),
  };
  ctx.canvas = canvas;
  return canvas;
}

export function installDomStub() {
  if (globalThis.__domStub) return;
  globalThis.__domStub = true;

  const listeners = new Map();
  const target = {
    addEventListener(type, fn) { (listeners.get(type) ?? listeners.set(type, []).get(type)).push?.(fn); },
    removeEventListener() {},
    dispatchEvent() { return true; },
  };

  globalThis.self = globalThis;
  const win = {
    innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1,
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    requestAnimationFrame: (fn) => setTimeout(() => fn(globalThis.performance.now()), 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    location: { href: 'http://localhost/', origin: 'http://localhost', protocol: 'http:' },
    navigator: { userAgent: 'node', hardwareConcurrency: 8, maxTouchPoints: 0, getGamepads: () => [] },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    },
  };
  try { globalThis.window = win; } catch { Object.defineProperty(globalThis, 'window', { value: win, writable: true }); }
  globalThis.localStorage = win.localStorage;
  try { globalThis.navigator = win.navigator; } catch { /* node has a read-only navigator */ }
  globalThis.document = {
    createElement: (tag) => (tag === 'canvas' ? fakeCanvas(128, 128) : { style: {}, appendChild() {}, addEventListener() {}, removeEventListener() {}, setAttribute() {}, classList: { add() {}, remove() {}, toggle() {} } }),
    createElementNS: () => ({ style: {}, setAttribute() {} }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
    body: { appendChild() {}, removeChild() {}, style: {}, classList: { add() {}, remove() {} } },
    documentElement: { style: {} },
    baseURI: 'http://localhost/',
  };
  globalThis.HTMLCanvasElement = class {};
  globalThis.HTMLImageElement = class {};
  globalThis.Image = class { };
  globalThis.ImageData = class {};
  globalThis.OffscreenCanvas = class {
    constructor(w, h) { return fakeCanvas(w, h); }
  };
  globalThis.AudioContext = undefined;
  globalThis.requestAnimationFrame = globalThis.window.requestAnimationFrame;
  globalThis.cancelAnimationFrame = globalThis.window.cancelAnimationFrame;
  globalThis.getComputedStyle = globalThis.window.getComputedStyle;
  if (!globalThis.performance) globalThis.performance = { now: () => Date.now() };
}

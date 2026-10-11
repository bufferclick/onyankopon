#!/usr/bin/env node
/**
 * DOM-level UI harness.
 *
 * No GPU, but jsdom is a real DOM: we can mount the actual HUD, panels, title
 * screen, settings screens and ability wheel against a live (headless) Game and
 * assert every view renders without throwing and actually produces markup.
 *
 *   node tools/ui-run.mjs
 */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── browser-ish globals ──────────────────────────────────────────────────
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
const { window } = dom;

// canvases have no 2d backend in jsdom; the HUD minimap needs only the shape
const ctx2d = new Proxy({}, {
  get(_t, k) {
    if (k === 'canvas') return null;
    if (k === 'measureText') return () => ({ width: 8 });
    if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
    if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h });
    return () => {};
  },
  set() { return true; },
});
window.HTMLCanvasElement.prototype.getContext = function () { return ctx2d; };
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);

const define = (k, v) => {
  try { globalThis[k] = v; }
  catch { Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true }); }
};
define('window', window);
define('document', window.document);
define('navigator', window.navigator);
define('self', window);
globalThis.localStorage = window.localStorage;
globalThis.HTMLCanvasElement = window.HTMLCanvasElement;
globalThis.HTMLImageElement = window.HTMLImageElement;
globalThis.Image = window.Image;
globalThis.ImageData = window.ImageData;
globalThis.OffscreenCanvas = class { constructor(w, h) { const c = window.document.createElement('canvas'); c.width = w; c.height = h; return c; } };
globalThis.requestAnimationFrame = window.requestAnimationFrame;
globalThis.cancelAnimationFrame = window.cancelAnimationFrame;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.performance = window.performance;
globalThis.DOMParser = window.DOMParser;
globalThis.Element = window.Element;
globalThis.HTMLElement = window.HTMLElement;
globalThis.CustomEvent = window.CustomEvent;
globalThis.Event = window.Event;
globalThis.KeyboardEvent = window.KeyboardEvent;

let failures = 0;
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  else { failures++; console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`); }
};

// ── game (stub renderer) ─────────────────────────────────────────────────
function fakeEngine() {
  const camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.1, 3000);
  return {
    camera,
    renderer: { capabilities: { getMaxAnisotropy: () => 4 }, shadowMap: {}, info: { render: {} }, setSize() {}, render() {}, getSize: (v) => v.set(1920, 1080) },
    timeScale: 1, fx: {},
    onUpdate() { return () => {}; }, setScene() {}, start() {}, stop() {}, render() {},
    shake() {}, aberration() {}, fadeTo() {}, hitStop() {}, updateListener() {},
    setMusic() {}, setAmbience() {}, setIntensity() {}, screenshot: () => 'data:,',
  };
}

const { settings } = await import('../src/core/Settings.js');
const { Input } = await import('../src/core/Input.js');
const { audio } = await import('../src/core/AudioEngine.js');
const { AssetManager } = await import('../src/core/AssetManager.js');
const { Game } = await import('../src/game/Game.js');
const { Hud } = await import('../src/ui/Hud.js');
const { Panels } = await import('../src/ui/Panels.js');
const { UI } = await import('../src/ui/UI.js');

audio.settings = settings;
const engine = fakeEngine();
const input = new Input(window);
input.setBindings(settings.bindings);
const assets = new AssetManager({ baseUrl: 'assets/' });
const game = new Game({ engine, settings, input, assets, audio });
await game.init(null);

console.log('\x1b[1mUI run\x1b[0m');

// give the player something to show
game.start();
for (let i = 0; i < 90; i++) game.update(1 / 60);
game.progression.addXp(400);
game.quests.start('q_kon_first_hunt');
game.spawnAlly('spirit_fox', game.player.position.clone().add(new THREE.Vector3(3, 0, 3)), 9, 12);
game.giveItem('rice_ball', 4);
const { bus, EV } = await import('../src/core/EventBus.js');
bus.emit(EV.TOAST, { text: 'Testing the HUD', kind: 'epic' });

let ui, hud, panels;
try {
  hud = new Hud(game);
  hud.setVisible(true);
  ok('HUD mounts', !!document.getElementById('hud').innerHTML.length);
} catch (err) { ok('HUD mounts', false, err.stack?.split('\n').slice(0, 2).join(' | ')); }

try {
  ui = new UI(game, settings, input);
  panels = ui.panels;
  ok('UI + panels mount', !!document.getElementById('title').innerHTML.length
    && !!document.getElementById('panels').innerHTML.length);
} catch (err) { ok('UI + panels mount', false, err.stack?.split('\n').slice(0, 3).join(' | ')); }

// ── HUD frames ───────────────────────────────────────────────────────────
try {
  for (let i = 0; i < 70; i++) { game.update(1 / 60); hud.update(1 / 60); ui.update(1 / 60); }
  hud.spawnDamage({ amount: 42, kind: 'fire', crit: true, position: game.player.position.clone() });
  hud.toast({ text: 'Kon.', kind: 'good' });
  for (let i = 0; i < 40; i++) { game.update(1 / 60); hud.update(1 / 60); }
  ok('HUD renders 110 frames', true);
} catch (err) { ok('HUD renders 110 frames', false, err.stack?.split('\n').slice(0, 3).join(' | ')); }

// lock-on + boss banner + interact prompt
try {
  const e = game.spawner.spawn('oni_warrior', 40, game.player.position.clone().add(new THREE.Vector3(12, 0, 12)), {});
  game.cameraRig.lockTarget = e;
  game.player.position.y = 40; // force some falling damage numbers
  for (let i = 0; i < 40; i++) { game.update(1 / 60); hud.update(1 / 60); }
  ok('HUD survives lock-on + boss', true);
} catch (err) { ok('HUD survives lock-on + boss', false, err.message); }

// ── every panel tab ──────────────────────────────────────────────────────
for (const name of ['character', 'inventory', 'journal', 'map', 'codex']) {
  try {
    panels.open(name);
    const out = document.getElementById('panels').innerHTML;
    ok(`panel: ${name}`, out.length > 200, `${out.length} chars`);
  } catch (err) { ok(`panel: ${name}`, false, err.stack?.split('\n').slice(0, 3).join(' | ')); }
}

for (const tab of ['attributes', 'skills', 'abilities', 'fox']) {
  try { panels.open('character'); panels.setTab(tab); ok(`character tab: ${tab}`, true); }
  catch (err) { ok(`character tab: ${tab}`, false, err.message); }
}
for (const tab of ['items', 'crafting']) {
  try { panels.open('inventory'); panels.setTab(tab); ok(`inventory tab: ${tab}`, true); }
  catch (err) { ok(`inventory tab: ${tab}`, false, err.message); }
}
for (const tab of ['active', 'completed']) {
  try { panels.open('journal'); panels.setTab(tab); ok(`journal tab: ${tab}`, true); }
  catch (err) { ok(`journal tab: ${tab}`, false, err.message); }
}
for (const tab of ['bestiary', 'lore', 'statuses']) {
  try { panels.open('codex'); panels.setTab(tab); ok(`codex tab: ${tab}`, true); }
  catch (err) { ok(`codex tab: ${tab}`, false, err.message); }
}

// ── dialogue + shop ──────────────────────────────────────────────────────
try {
  const npcId = (await import('../src/data/npcs.js')).NPCS.find((n) => n.stock?.length)?.id
    || (await import('../src/data/npcs.js')).NPCS[0].id;
  panels.open('dialogue', npcId);
  const out = document.getElementById('panels').innerHTML;
  ok('dialogue renders', out.length > 120, `${out.length} chars`);
  const host = document.getElementById('panels');
  const tradeBtn = [...host.querySelectorAll('button.entry')].find((b) => /Trade/.test(b.textContent));
  if (tradeBtn) tradeBtn.click();
  ok('shop renders from dialogue', /Trade — /.test(host.textContent) || !tradeBtn, 'no Trade button');
} catch (err) { ok('dialogue renders', false, err.stack?.split('\n').slice(0, 3).join(' | ')); }

// ── settings sections ────────────────────────────────────────────────────
if (ui) {
  for (const sec of ['video', 'audio', 'controls', 'gameplay', 'accessibility', 'cloudflare']) {
    try { ui.openSettings(sec); ui.renderSettings(sec); ok(`settings: ${sec}`, document.getElementById('settings').innerHTML.length > 150); }
    catch (err) { ok(`settings: ${sec}`, false, err.stack?.split('\n').slice(0, 3).join(' | ')); }
  }
  try { ui.openWheel(0); ok('ability wheel opens', document.getElementById('wheel').innerHTML.length > 100); ui.closeWheel?.(); }
  catch (err) { ok('ability wheel opens', false, err.message); }
  try { ui.showTitle?.(); ok('title screen renders', document.getElementById('title').innerHTML.length > 300); }
  catch (err) { ok('title screen renders', false, err.message); }
  try { ui.pause?.(); ok('pause menu renders', document.getElementById('pause').innerHTML.length > 100); ui.resume?.(); }
  catch (err) { ok('pause menu renders', false, err.message); }
}

// ── no leftover NaN in the DOM ───────────────────────────────────────────
try {
  panels.open('character'); panels.setTab('attributes');
  const text = document.getElementById('panels').textContent;
  ok('no NaN/undefined in panel text', !/NaN|undefined|\[object/.test(text),
    (text.match(/.{0,24}(NaN|undefined|\[object).{0,24}/) || [''])[0]);
} catch (err) { ok('no NaN/undefined in panel text', false, err.message); }

console.log(`\n\x1b[1m${failures === 0 ? 'UI run passed' : `${failures} failures`}\x1b[0m`);
process.exit(failures ? 1 : 0);

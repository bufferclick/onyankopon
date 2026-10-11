#!/usr/bin/env node
/**
 * Headless gameplay harness.
 *
 * There is no browser and no GPU here, so instead of pixels this runs the real
 * game loop against a stub renderer and asserts that the *simulation* stays
 * sane: no exceptions, no NaN in the player transform, enemies actually spawn
 * and fight, every ability in the game can be cast end to end.
 *
 *   node tools/headless-run.mjs            # standard run
 *   node tools/headless-run.mjs --frames 2000
 */
import { installDomStub } from './dom-stub.mjs';
installDomStub();

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? Number(process.argv[i + 1]) : d;
};
const FRAMES = arg('--frames', 900);

const { settings } = await import('../src/core/Settings.js');
const { Input } = await import('../src/core/Input.js');
const { audio } = await import('../src/core/AudioEngine.js');
const { AssetManager } = await import('../src/core/AssetManager.js');
const { Game } = await import('../src/game/Game.js');
const { ABILITIES } = await import('../src/data/abilities.js');

let failures = 0;
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  else { failures++; console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────────────────────────────────────────────────────── fake renderer
function fakeEngine() {
  const camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.1, 3000);
  return {
    camera,
    renderer: {
      capabilities: { getMaxAnisotropy: () => 4, isWebGL2: true },
      shadowMap: { enabled: false, type: 0 },
      info: { render: { calls: 0, triangles: 0 }, memory: {} },
      getSize: (v) => v.set(1920, 1080),
      setSize() {}, setPixelRatio() {}, render() {}, dispose() {},
    },
    timeScale: 1,
    fx: { shake: 0, aberration: 0, radial: 0, damage: 0, fade: 0 },
    hooks: [],
    onUpdate(fn) { this.hooks.push(fn); return () => {}; },
    setScene() {}, start() {}, stop() {}, render() {},
    shake() {}, aberration() {}, radialBlur() {}, hitStop() {},
    flashDamage() {}, flashHeal() {}, fadeTo() {}, consumeShake() {},
    updateListener() {}, setMusic() {}, setAmbience() {}, setIntensity() {},
    screenshot: () => 'data:,',
  };
}

// ───────────────────────────────────────────────────────── scripted input
function scriptedInput(input) {
  const down = new Set();
  const fire = new Set();
  input.isDown = (id) => down.has(id);
  input.consume = (id) => (fire.has(id) ? (fire.delete(id), true) : false);
  input.wasPressed = () => false;
  input.wasReleased = () => false;
  input.heldFor = () => 0;
  input.getMoveAxis = () => ({ x: 0, y: down.has('moveForward') ? 1 : 0, magnitude: down.has('moveForward') ? 1 : 0 });
  input.takeLook = () => ({ dx: 0, dy: 0 });
  input.update = () => {};
  input.endFrame = () => {};
  return { down, fire };
}

// ───────────────────────────────────────────────────────────────── boot
console.log('\x1b[1mHeadless run\x1b[0m');
audio.settings = settings;
const engine = fakeEngine();
const input = new Input(globalThis.window);
const ctl = scriptedInput(input);

const assets = new AssetManager({ baseUrl: 'assets/' });
const foxPath = path.join(ROOT, 'public', 'assets', 'models', 'fox.glb');
if (fs.existsSync(foxPath)) {
  const buf = fs.readFileSync(foxPath);
  assets.files.set('models/fox.glb', buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

const game = new Game({ engine, settings, input, assets, audio });
await game.init(null);
game.start();
ok('game builds', true);
ok('fox model parsed', game.fox.loaded, 'fox.glb missing?');

console.log(`\n  simulating ${FRAMES} frames…`);
let errors = [];
const t0 = Date.now();
for (let f = 0; f < FRAMES; f++) {
  // wander: mostly forward, occasionally attack / dodge / block
  if (f % 220 < 150) ctl.down.add('moveForward'); else ctl.down.delete('moveForward');
  if (f % 47 === 0) ctl.fire.add('lightAttack');
  if (f % 131 === 0) ctl.fire.add('dodge');
  if (f % 300 < 40) ctl.down.add('block'); else ctl.down.delete('block');
  if (f % 97 === 0) ctl.fire.add('kon');
  try {
    game.update(1 / 60);
  } catch (err) {
    errors.push(`frame ${f}: ${err.stack?.split('\n').slice(0, 3).join(' | ')}`);
    if (errors.length > 4) break;
  }
}
const ms = Date.now() - t0;

ok('no exceptions during play', errors.length === 0, errors[0] || '');
const p = game.player;
ok('player transform finite', Number.isFinite(p.position.x + p.position.y + p.position.z)
  && Number.isFinite(p.velocity.x + p.velocity.y + p.velocity.z),
  `${p.position.toArray()} / ${p.velocity.toArray()}`);
ok('player on the ground', Math.abs(p.position.y - game.world.heightAt(p.position.x, p.position.z)) < 12,
  `y=${p.position.y.toFixed(2)} ground=${game.world.heightAt(p.position.x, p.position.z).toFixed(2)}`);
ok('enemies spawned', game.spawner.totalSpawned > 0, `${game.spawner.totalSpawned}`);
ok('enemies alive near player', game.spawner.enemies.length > 0, `${game.spawner.enemies.length}`);
ok('combat happened', game.combat.killStreak > 0 || p.health < p.maxHealth || game.kills > 0,
  `kills=${game.kills} hp=${p.health.toFixed(0)}`);
ok('xp was earned', game.progression.xp > 0, `${game.progression.xp}`);
ok('region resolved', !!game.region, game.region?.id);
console.log(`  \x1b[2m${FRAMES} frames in ${ms}ms — ${(ms / FRAMES).toFixed(2)} ms/frame (sim only)\x1b[0m`);

// ───────────────────────────────────────────────────────── ability sweep
console.log('\n  casting every ability…');
const sweepErrors = [];
for (const a of ABILITIES) {
  game.progression.unlockedAbilities.add(a.id);
  game.progression.abilityRanks[a.id] = a.maxRank || 1;
  game.player.health = game.player.maxHealth;
  game.player.focus = game.player.maxFocus;
  game.player.stamina = game.player.maxStamina;
  game.abilities.cooldowns.clear();
  try {
    const started = game.abilities.cast(a.id);
    for (let i = 0; i < 26; i++) {
      game.update(1 / 60);
      if (i % 6 === 0) await sleep(1);
    }
    if (!started) sweepErrors.push(`${a.id}: refused to start`);
  } catch (err) {
    sweepErrors.push(`${a.id}: ${err.message}`);
  }
}
ok(`all ${ABILITIES.length} abilities cast cleanly`, sweepErrors.length === 0, sweepErrors.slice(0, 6).join(' | '));

// ───────────────────────────────────────────────────────── enemy sweep
console.log('\n  spawning every enemy…');
const spawnErrors = [];
const { ENEMIES } = await import('../src/data/enemies.js');
const pos = new THREE.Vector3();
for (const def of ENEMIES) {
  try {
    pos.set(p.position.x + 30, 0, p.position.z + 30);
    pos.y = game.world.heightAt(pos.x, pos.z);
    const e = game.spawner.spawn(def.id, def.level?.[0] || 1, pos.clone(), { ttl: 8 });
    for (let i = 0; i < 40; i++) game.update(1 / 60);
    if (!e) spawnErrors.push(`${def.id}: null`);
  } catch (err) {
    spawnErrors.push(`${def.id}: ${err.message}`);
  }
}
ok(`all ${ENEMIES.length} enemies update cleanly`, spawnErrors.length === 0, spawnErrors.slice(0, 6).join(' | '));

// ───────────────────────────────────────────────────────────── save/load
let saveOk = false;
try {
  saveOk = game.save() && !!Game.load();
} catch (err) { saveOk = false; }
ok('save + load round-trips', saveOk);

console.log(`\n\x1b[1m${failures === 0 ? 'headless run passed' : `${failures} failures`}\x1b[0m`);
process.exit(failures ? 1 : 0);

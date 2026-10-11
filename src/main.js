import './ui/styles.css';
import * as THREE from 'three';
import { settings } from './core/Settings.js';
import { Input } from './core/Input.js';
import { Engine } from './core/Engine.js';
import { audio } from './core/AudioEngine.js';
import { AssetManager, registerServiceWorker } from './core/AssetManager.js';
import { installSynthSounds } from './audio/soundDesign.js';
import { Game } from './game/Game.js';
import { UI } from './ui/UI.js';
import { bus, EV } from './core/EventBus.js';
import { clamp01 } from './core/MathUtils.js';

/**
 * Boot sequence.
 *
 *  1. preload every asset (byte-accurate progress bar, so gameplay never stutters)
 *  2. decode audio, then synthesise the original SFX that aren't downloaded
 *  3. build the world and warm the streaming chunks
 *  4. hand over to the title screen
 *
 * Nothing streams during play: by the time you can move, every model and every
 * sound is already in memory (and in the offline cache).
 */

const TIPS = [
  'Say "Kon". The fox has been waiting all day for you to say it.',
  'Guard the instant a blow lands, not before — that is the parry.',
  'Dodging costs stamina. Rolling into a wall costs more.',
  'Fox-fire follows its target. So does a grudge.',
  'Rending armour makes every later hit bite deeper.',
  'The fox grows by eating what you kill. Feed it.',
  'Bosses telegraph. Watch the hands, not the weapon.',
  'Mark a target with Inari’s Gaze, then spend everything on it.',
  'Rest at shrines — the world gets louder at night.',
  'Executions heal you. Finish things.',
  'Snow hides footprints. So does a crowded street.',
  'You can parry arrows. You cannot parry the ground.',
];

const loading = document.getElementById('loading');
const bar = loading.querySelector('.load-bar i');
const status = loading.querySelector('.load-status');
const statusLeft = status.querySelector('.l');
const statusRight = status.querySelector('.r');
const tip = loading.querySelector('.load-tip');

function setProgress(p, text = '') {
  bar.style.width = `${Math.round(clamp01(p) * 100)}%`;
  if (text) statusLeft.textContent = text;
}
function setBytes(done, total) {
  statusRight.textContent = `${(done / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB`;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot() {
  // ── engine & input ──────────────────────────────────────────────────
  const canvas = document.getElementById('game');
  audio.settings = settings;
  const engine = new Engine(canvas, settings);
  const input = new Input(window);
  input.setBindings(settings.bindings);

  let tipIdx = Math.floor(Math.random() * TIPS.length);
  tip.textContent = TIPS[tipIdx];
  const tipTimer = setInterval(() => {
    tipIdx = (tipIdx + 1) % TIPS.length;
    tip.style.opacity = 0;
    setTimeout(() => { tip.textContent = TIPS[tipIdx]; tip.style.opacity = 1; }, 300);
  }, 5200);
  tip.style.transition = 'opacity 0.3s';

  // ── assets ──────────────────────────────────────────────────────────
  setProgress(0.02, 'Reading manifest');
  const assets = new AssetManager({ baseUrl: settings.get('cloudflare', 'assetBaseUrl') || 'assets/' });
  let manifest = null;
  try {
    manifest = await assets.loadManifest();
  } catch (err) {
    console.error(err);
    setProgress(1, 'Assets missing — run `npm run assets`');
    statusLeft.textContent = 'Assets missing — run `npm run assets`';
    return;
  }

  setProgress(0.05, 'Downloading');
  await assets.preloadAll(({ loaded, total, file }) => {
    setProgress(0.05 + 0.55 * clamp01(loaded / Math.max(1, total)), `Fetching ${file.split('/').pop()}`);
    setBytes(loaded, total);
  });

  // ── audio (needs a user gesture; the title button provides it) ───────
  setProgress(0.62, 'Preparing audio');
  const startAudio = () => {
    const ctx = audio.init();
    if (!ctx) return;
    assets.ctx = ctx;
    assets.decodeAudio(({ index, total, group }) => {
      setProgress(0.62 + 0.14 * clamp01(index / Math.max(1, total)), `Decoding ${group}`);
      statusRight.textContent = `${index}/${total}`;
    }).then(() => {
      audio.setBanks(assets.audio);
      const built = installSynthSounds(audio);
      console.info(`[audio] ${audio.banks.size} banks (${built} synthesised)`);
      audio.setMusic('menu', { fade: 2.4, volume: 0.7 });
    });
    window.removeEventListener('pointerdown', startAudio);
    window.removeEventListener('keydown', startAudio);
  };
  window.addEventListener('pointerdown', startAudio, { once: false });
  window.addEventListener('keydown', startAudio, { once: false });

  // ── world ───────────────────────────────────────────────────────────
  setProgress(0.78, 'Carving the province');
  await sleep(16);
  const game = new Game({ engine, settings, input, assets, audio });
  await game.init(Game.hasSave() ? null : null);

  // warm the streaming world in slices so the browser keeps painting
  const startPos = game.player.position.clone();
  game.world.lastChunk = { cx: 1e9, cz: 1e9 };
  let warmed = 0;
  for (let i = 0; i < 26; i++) {
    warmed += game.world.buildBudget(2);
    setProgress(0.78 + 0.2 * clamp01((i + 1) / 26), `Building terrain ${warmed} chunks`);
    await sleep(8);
  }
  game.world.update(0.016, startPos, settings.get('video', 'viewDistance'));

  // ── ui ──────────────────────────────────────────────────────────────
  setProgress(0.99, 'Lighting the lanterns');
  const ui = new UI(game, settings, input);
  window.__kitsuna = { game, ui, engine, settings, audio, assets };

  engine.onUpdate((dt) => ui.update(dt));
  engine.render();     // one frame so the title screen has something behind it

  await sleep(220);
  clearInterval(tipTimer);
  setProgress(1, 'Ready');
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 900);

  // ── misc: offline cache, resize, visibility ─────────────────────────
  if (settings.get('cloudflare', 'enableOfflineCache')) registerServiceWorker();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && settings.get('audio', 'muteOnBlur')) audio.setMuted(true);
    else audio.setMuted(false);
  });
  window.addEventListener('beforeunload', () => {
    if (game.started && settings.get('gameplay', 'autoSave')) game.save();
  });
  bus.on(EV.TOAST, (t) => { if (t.kind === 'epic') audio.play('notification', { volume: 0.5, bus: 'ui' }); });

  // keyboard: pause works even before the game starts
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && ui.state === 'title') ui.titleEl.classList.contains('hidden') && ui.resume();
  });
}

boot().catch((err) => {
  console.error(err);
  statusLeft.textContent = `Failed to start: ${err.message}`;
  statusRight.textContent = '';
});

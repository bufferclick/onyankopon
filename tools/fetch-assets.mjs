#!/usr/bin/env node
/**
 * Kitsuna no Akuma — asset pipeline.
 *
 * Everything the game ships is fetched here, from public, verifiably-licensed
 * sources (Creative Commons Zero). Nothing is vendored into git: run
 * `npm run assets` (it runs automatically before `npm run dev`) and the
 * pipeline populates `public/assets/`.
 *
 *   models/fox.glb ......... "Fox" by PixelMannen, CC0, via KhronosGroup/glTF-Sample-Assets
 *   audio/*.ogg ............ Kenney audio packs (Impact / Interface / RPG / Digital /
 *                            Sci-Fi sounds), CC0, via Daarko/sparkstream-sounds
 *   audio/synth/*.ogg ...... original synthesis (tools/build-audio.py)
 *
 * The pipeline writes `public/assets/manifest.json`, which the loading screen
 * reads so it can download + cache every byte before the first frame of play.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache', 'assets');
const OUT = path.join(ROOT, 'public', 'assets');
const AUDIO_OUT = path.join(OUT, 'audio');
const MODEL_OUT = path.join(OUT, 'models');

const log = (...a) => console.log('[assets]', ...a);

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'pipe', ...opts });
  if (r.status !== 0) {
    throw new Error(`command failed: ${cmd} ${args.join(' ')}\n${r.stderr?.toString().slice(0, 4000)}`);
  }
  return r.stdout?.toString() ?? '';
}

function have(bin) {
  try { execFileSync(bin, ['--version'], { stdio: 'pipe' }); return true; } catch { return false; }
}

/** Sparse, blobless clone of a single folder inside a GitHub repo. */
function sparseFetch(name, repo, ref, folders, dest) {
  if (fs.existsSync(path.join(dest, '.git'))) {
    log(`${name}: cache present`);
    return dest;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  log(`${name}: fetching ${repo} (sparse) …`);
  try {
    sh('git', ['clone', '--filter=blob:none', '--no-checkout', '--depth', '1',
      ...(ref ? ['--branch', ref] : []), repo, dest]);
  } catch (e) {
    if (!ref) throw e;
    log(`${name}: branch "${ref}" not found, falling back to the default branch`);
    sh('git', ['clone', '--filter=blob:none', '--no-checkout', '--depth', '1', repo, dest]);
  }
  sh('git', ['-C', dest, 'sparse-checkout', 'init', '--cone']);
  sh('git', ['-C', dest, 'sparse-checkout', 'set', ...folders]);
  sh('git', ['-C', dest, 'checkout', '--quiet']);
  return dest;
}

// ---------------------------------------------------------------------------
// 1. Models
// ---------------------------------------------------------------------------
function fetchModels() {
  fs.mkdirSync(MODEL_OUT, { recursive: true });
  const foxRepo = sparseFetch(
    'fox.glb',
    'https://github.com/KhronosGroup/glTF-Sample-Assets.git',
    'main',
    ['Models/Fox'],
    path.join(CACHE, 'gltf-sample-assets')
  );
  const src = path.join(foxRepo, 'Models/Fox/glTF-Binary/Fox.glb');
  const dst = path.join(MODEL_OUT, 'fox.glb');
  fs.copyFileSync(src, dst);
  fs.copyFileSync(path.join(foxRepo, 'Models/Fox/LICENSE.md'), path.join(MODEL_OUT, 'fox-LICENSE.md'));
  log(`fox.glb -> ${(fs.statSync(dst).size / 1048576).toFixed(2)} MB`);
  return { fox: 'models/fox.glb' };
}

// ---------------------------------------------------------------------------
// 2. Audio (CC0 Kenney packs, mirrored on GitHub)
// ---------------------------------------------------------------------------
const AUDIO_REPO = 'https://github.com/Daarko/sparkstream-sounds.git';

/** Curated picks: [category, file, output name] — only what the game actually uses. */
const PICKS = [
  // --- footsteps / movement -------------------------------------------------
  ['impacts', 'footstep_grass_000', 'step_grass_0'], ['impacts', 'footstep_grass_001', 'step_grass_1'],
  ['impacts', 'footstep_grass_002', 'step_grass_2'], ['impacts', 'footstep_grass_003', 'step_grass_3'],
  ['impacts', 'footstep_wood_000', 'step_wood_0'], ['impacts', 'footstep_wood_002', 'step_wood_1'],
  ['impacts', 'footstep_wood_004', 'step_wood_2'],
  ['impacts', 'footstep_concrete_000', 'step_stone_0'], ['impacts', 'footstep_concrete_002', 'step_stone_1'],
  ['impacts', 'footstep_concrete_004', 'step_stone_2'],
  ['impacts', 'footstep_snow_000', 'step_snow_0'], ['impacts', 'footstep_snow_002', 'step_snow_1'],
  ['impacts', 'footstep_carpet_000', 'step_dirt_0'], ['impacts', 'footstep_carpet_003', 'step_dirt_1'],
  ['rpg-quest', 'footstep00', 'step_dirt_2'], ['rpg-quest', 'footstep03', 'step_dirt_3'],
  ['rpg-quest', 'footstep06', 'step_dirt_4'],

  // --- melee impacts --------------------------------------------------------
  ['impacts', 'impactPunch_heavy_000', 'hit_flesh_0'], ['impacts', 'impactPunch_heavy_001', 'hit_flesh_1'],
  ['impacts', 'impactPunch_heavy_002', 'hit_flesh_2'], ['impacts', 'impactPunch_medium_003', 'hit_flesh_3'],
  ['impacts', 'impactSoft_heavy_000', 'hit_soft_0'], ['impacts', 'impactSoft_medium_002', 'hit_soft_1'],
  ['impacts', 'impactMetal_heavy_000', 'hit_metal_0'], ['impacts', 'impactMetal_medium_001', 'hit_metal_1'],
  ['impacts', 'impactMetal_light_003', 'hit_metal_2'],
  ['impacts', 'impactWood_heavy_000', 'hit_wood_0'], ['impacts', 'impactWood_medium_002', 'hit_wood_1'],
  ['impacts', 'impactPlate_heavy_000', 'hit_armor_0'], ['impacts', 'impactPlate_medium_001', 'hit_armor_1'],
  ['impacts', 'impactPlate_light_003', 'hit_armor_2'],
  ['impacts', 'impactBell_heavy_000', 'bell_heavy'], ['impacts', 'impactBell_heavy_002', 'bell_heavy_2'],
  ['impacts', 'impactGlass_heavy_000', 'hit_glass_0'], ['impacts', 'impactGlass_light_002', 'hit_glass_1'],
  ['impacts', 'impactTin_medium_000', 'hit_tin_0'], ['impacts', 'impactPlank_medium_001', 'hit_plank_0'],
  ['impacts', 'impactMining_000', 'hit_mining_0'], ['impacts', 'impactGeneric_light_000', 'hit_generic_0'],

  // --- blades / leather / cloth --------------------------------------------
  ['rpg-quest', 'knifeSlice', 'slice_0'], ['rpg-quest', 'knifeSlice2', 'slice_1'],
  ['rpg-quest', 'drawKnife1', 'draw_blade_0'], ['rpg-quest', 'drawKnife2', 'draw_blade_1'],
  ['rpg-quest', 'cloth1', 'cloth_0'], ['rpg-quest', 'cloth2', 'cloth_1'],
  ['rpg-quest', 'clothBelt', 'cloth_2'], ['rpg-quest', 'dropLeather', 'leather_0'],
  ['rpg-quest', 'handleSmallLeather', 'leather_1'], ['rpg-quest', 'handleCoins', 'coins_0'],
  ['rpg-quest', 'handleCoins2', 'coins_1'], ['rpg-quest', 'metalClick', 'metal_click'],
  ['rpg-quest', 'metalLatch', 'metal_latch'], ['rpg-quest', 'chop', 'chop_0'],
  ['rpg-quest', 'bookFlip1', 'page_flip_0'], ['rpg-quest', 'bookFlip2', 'page_flip_1'],
  ['rpg-quest', 'doorOpen_1', 'door_open'], ['rpg-quest', 'doorClose_1', 'door_close'],
  ['rpg-quest', 'creak1', 'creak_0'], ['rpg-quest', 'creak2', 'creak_1'],
  ['rpg-quest', 'beltHandle1', 'belt_0'],

  // --- ui -------------------------------------------------------------------
  ['ui-clicks', 'interface-sounds-click_001', 'ui_click_0'],
  ['ui-clicks', 'interface-sounds-click_003', 'ui_click_1'],
  ['ui-clicks', 'interface-sounds-select_002', 'ui_select_0'],
  ['ui-clicks', 'interface-sounds-select_005', 'ui_select_1'],
  ['ui-clicks', 'interface-sounds-switch_002', 'ui_switch_0'],
  ['ui-clicks', 'interface-sounds-toggle_001', 'ui_toggle_0'],
  ['ui-clicks', 'interface-sounds-open_001', 'ui_open'],
  ['ui-clicks', 'interface-sounds-close_001', 'ui_close'],
  ['ui-clicks', 'interface-sounds-back_001', 'ui_back'],
  ['ui-clicks', 'interface-sounds-confirmation_002', 'ui_confirm'],
  ['ui-clicks', 'interface-sounds-error_003', 'ui_error'],
  ['ui-clicks', 'interface-sounds-scroll_002', 'ui_scroll'],
  ['ui-clicks', 'interface-sounds-tick_001', 'ui_tick'],
  ['ui-clicks', 'interface-sounds-pluck_002', 'ui_pluck'],
  ['ui-clicks', 'interface-sounds-bong_001', 'ui_bong'],
  ['ui-clicks', 'ui-audio-rollover2', 'ui_hover_0'],
  ['ui-clicks', 'ui-audio-rollover5', 'ui_hover_1'],

  // --- digital / spirit fx --------------------------------------------------
  ['digital-beeps', 'digital-audio-powerUp7', 'spirit_up_0'],
  ['digital-beeps', 'digital-audio-powerUp11', 'spirit_up_1'],
  ['digital-beeps', 'digital-audio-phaserUp4', 'spirit_riser'],
  ['digital-beeps', 'digital-audio-phaserDown2', 'spirit_fall'],
  ['digital-beeps', 'digital-audio-zap1', 'spirit_zap'],
  ['digital-beeps', 'sci-fi-sounds-thrusterFire_000', 'fire_burst'],
  ['digital-beeps', 'sci-fi-sounds-thrusterFire_002', 'fire_burst_2'],
  ['digital-beeps', 'sci-fi-sounds-explosionCrunch_000', 'boom_0'],
  ['digital-beeps', 'sci-fi-sounds-explosionCrunch_003', 'boom_1'],
  ['digital-beeps', 'sci-fi-sounds-lowFrequency_explosion_000', 'boom_low'],
  ['digital-beeps', 'sci-fi-sounds-forceField_000', 'field_0'],
  ['digital-beeps', 'sci-fi-sounds-slime_000', 'slime_0'],
  ['digital-beeps', 'sci-fi-sounds-laserRetro_001', 'beam_0'],
  ['digital-beeps', 'sci-fi-sounds-impactMetal_002', 'clang_0'],
];

function fetchAudio() {
  fs.mkdirSync(AUDIO_OUT, { recursive: true });
  const repo = sparseFetch('audio', AUDIO_REPO, null, ['sounds', 'credits'], path.join(CACHE, 'cc0-audio'));
  // Preserve attributions.
  const creditsDir = path.join(repo, 'credits');
  if (fs.existsSync(creditsDir)) {
    const lines = ['# Audio credits', '', 'All audio in `audio/` is Creative Commons Zero (CC0 1.0 Universal).', ''];
    for (const f of fs.readdirSync(creditsDir)) {
      lines.push(`## ${f.replace(/-License\.txt/, '')}`, '```', fs.readFileSync(path.join(creditsDir, f), 'utf8').trim(), '```', '');
    }
    fs.writeFileSync(path.join(AUDIO_OUT, 'CREDITS.md'), lines.join('\n'));
  }

  const staging = path.join(CACHE, 'wav');
  fs.mkdirSync(staging, { recursive: true });
  let missing = 0;
  const seen = new Set();
  // Files inside each pack carry the pack's own prefix; accept either form.
  const PREFIXES = {
    impacts: ['impact-sounds'],
    'ui-clicks': ['interface-sounds', 'ui-audio'],
    'rpg-quest': ['rpg-audio'],
    'digital-beeps': ['digital-audio', 'sci-fi-sounds'],
  };
  for (const [cat, file, out] of PICKS) {
    const dir = path.join(repo, 'sounds', cat);
    const candidates = [file, ...(PREFIXES[cat] || []).map((p) => `${p}-${file}`)]
      .map((n) => path.join(dir, `${n}.wav`));
    const src = candidates.find((c) => fs.existsSync(c));
    if (!src) { missing++; log(`  ! missing ${cat}/${file}`); continue; }
    if (seen.has(out)) { log(`  ! duplicate output name ${out}`); continue; }
    seen.add(out);
    fs.copyFileSync(src, path.join(staging, `${out}.wav`));
  }
  log(`audio: staged ${seen.size} wav clips${missing ? ` (${missing} missing)` : ''}`);
  return { count: seen.size, staged: staging };
}

/** Downmix to mono, normalise, trim silence and encode Ogg Vorbis. */
function encodeAudio() {
  const script = path.join(ROOT, 'tools', 'encode-audio.py');
  const venv = path.join(CACHE, 'venv');
  let py = 'python3';
  if (!fs.existsSync(venv)) {
    try {
      sh('python3', ['-m', 'venv', venv]);
      sh(path.join(venv, 'bin', 'pip'), ['install', '--quiet', 'numpy', 'soundfile']);
    } catch (e) {
      log('could not create audio venv:', e.message.split('\n')[0]);
    }
  }
  if (fs.existsSync(path.join(venv, 'bin', 'python'))) py = path.join(venv, 'bin', 'python');
  try {
    sh(py, ['-c', 'import numpy, soundfile']);
  } catch {
    log('numpy/soundfile unavailable — shipping WAV source clips instead of OGG');
    for (const f of fs.readdirSync(path.join(CACHE, 'wav')).filter((f) => f.endsWith('.wav'))) {
      fs.copyFileSync(path.join(CACHE, 'wav', f), path.join(AUDIO_OUT, f));
    }
    return false;
  }
  log('audio: encoding to Ogg Vorbis …');
  console.log(sh(py, [script, path.join(CACHE, 'wav'), AUDIO_OUT]));
  return true;
}

// ---------------------------------------------------------------------------
// 3. Manifest
// ---------------------------------------------------------------------------
function buildManifest(models) {
  const audio = {};
  let audioBytes = 0;
  for (const f of fs.readdirSync(AUDIO_OUT).sort()) {
    if (!/\.(ogg|wav|mp3)$/i.test(f)) continue;
    const st = fs.statSync(path.join(AUDIO_OUT, f));
    audioBytes += st.size;
    const base = f.replace(/\.(ogg|wav|mp3)$/i, '');
    const group = base.replace(/_\d+$/, '');
    (audio[group] ||= []).push({ url: `audio/${f}`, bytes: st.size });
  }
  const modelList = [];
  let modelBytes = 0;
  for (const f of fs.readdirSync(MODEL_OUT)) {
    if (!/\.(glb|gltf)$/i.test(f)) continue;
    const st = fs.statSync(path.join(MODEL_OUT, f));
    modelBytes += st.size;
    modelList.push({ url: `models/${f}`, bytes: st.size });
  }
  const textures = [];
  const texDir = path.join(OUT, 'textures');
  if (fs.existsSync(texDir)) {
    for (const f of fs.readdirSync(texDir)) {
      const st = fs.statSync(path.join(texDir, f));
      textures.push({ url: `textures/${f}`, bytes: st.size });
    }
  }
  const files = [...modelList, ...textures, ...Object.values(audio).flat()];
  const manifest = {
    version: 3,
    generated: new Date().toISOString(),
    totalBytes: files.reduce((a, f) => a + f.bytes, 0),
    fileCount: files.length,
    models: modelList,
    textures,
    audio,
    note: 'Byte sizes let the loading screen show real progress and cache estimates.',
  };
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  log(`manifest: ${files.length} files, ${(manifest.totalBytes / 1048576).toFixed(2)} MB ` +
      `(models ${(modelBytes / 1048576).toFixed(2)} MB, audio ${(audioBytes / 1048576).toFixed(2)} MB)`);
  return manifest;
}

export function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const models = fetchModels();
  fetchAudio();
  const encoded = encodeAudio();
  buildManifest(models);
  log(`done (audio encoded: ${encoded}). Assets live in public/assets/ (gitignored).`);
}

if (process.argv[1] && process.argv[1].endsWith('fetch-assets.mjs')) main();

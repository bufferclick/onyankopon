#!/usr/bin/env node
/**
 * ensure-assets — called by `predev` / `prebuild`.
 *
 * The generated asset bundle (public/assets) is not committed: it is CC0 media
 * downloaded from source repos and packed into .ogg + .glb. This script builds
 * it when missing and prints what it did. Never fails the build if the assets
 * already exist, and never fails silently when they can't be fetched — an
 * empty asset folder means a black screen, so we want it loud.
 */
import { existsSync, statSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = path.join(root, 'public', 'assets', 'manifest.json');

function run(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
    p.on('close', (code) => resolve(code ?? 1));
  });
}

function fresh() {
  if (!existsSync(manifest)) return false;
  try {
    const m = JSON.parse(readFileSync(manifest, 'utf8'));
    if (!m.fileCount || !m.totalBytes) return false;
    // spot-check the biggest file
    const model = m.models?.[0];
    if (model && !existsSync(path.join(root, 'public', 'assets', model.url))) return false;
    return true;
  } catch {
    return false;
  }
}

const force = process.argv.includes('--force');
if (!force && fresh()) {
  const m = JSON.parse(readFileSync(manifest, 'utf8'));
  console.log(`[assets] present: ${m.fileCount} files, ${(m.totalBytes / 1048576).toFixed(2)} MB — skipping download`);
  process.exit(0);
}

console.log('[assets] building asset bundle (CC0 models + Kenney SFX)…');
let code = await run(process.execPath, [path.join('tools', 'fetch-assets.mjs')]);
if (code !== 0) {
  console.warn('[assets] build-assets.mjs failed (offline?) — trying the audio encoder only');
  code = await run('python3', [path.join('tools', 'encode-audio.py')]);
}
if (code !== 0) {
  console.error('[assets] FAILED. The game needs its asset bundle; check your network or commit public/assets.');
  process.exit(1);
}
console.log('[assets] done');

#!/usr/bin/env node
/**
 * build-desktop — one command from source to a running (or packaged) desktop
 * build.
 *
 *   node electron/build-desktop.mjs --start     # vite build, then launch
 *   node electron/build-desktop.mjs --build     # package for this platform
 *   node electron/build-desktop.mjs --build --platform win
 *
 * Cross-compiling Windows from macOS/Linux needs wine for the NSIS step; the
 * unpacked `--dir` build (used by CI artefacts) does not.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const value = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };

function run(cmd, cmdArgs, opts = {}) {
  console.log(`\x1b[2m$ ${cmd} ${cmdArgs.join(' ')}\x1b[0m`);
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, cmdArgs, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32', ...opts });
    p.on('close', (code) => (code === 0 ? resolve(code) : reject(new Error(`${cmd} exited ${code}`))));
  });
}

const platform = value('--platform', null);   // win | linux | mac | null (host)

if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
  console.log('[desktop] dist/ missing — building the web bundle first');
  await run(process.execPath, [path.join('node_modules', 'vite', 'bin', 'vite.js'), 'build']);
}

if (flag('--start')) {
  const electron = process.platform === 'win32' ? 'electron.cmd' : 'electron';
  const bin = path.join(ROOT, 'node_modules', '.bin', electron);
  await run(bin, [path.join(ROOT, 'electron')], {
    env: { ...process.env, ELECTRON_DISABLE_SANDBOX: '1' },
  });
} else if (flag('--build')) {
  const cmdArgs = [];
  if (platform) cmdArgs.push(`--${platform}`);
  if (platform === 'win') cmdArgs.push('--x64');
  if (flag('--dir')) cmdArgs.push('--dir');
  await run(path.join(ROOT, 'node_modules', '.bin', 'electron-builder'), cmdArgs);
} else {
  console.log('usage: node electron/build-desktop.mjs [--start | --build [--platform win|linux|mac] [--dir]]');
}

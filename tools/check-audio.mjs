#!/usr/bin/env node
/**
 * Every sound the code asks for must exist somewhere: in the downloaded CC0
 * bundle (public/assets/manifest.json) or as a synthesised recipe in
 * src/audio/soundDesign.js. A missing key means a silent moment.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js')) files.push(p);
  }
})(path.join(ROOT, 'src'));

const used = new Map();
const add = (k, f) => { if (!used.has(k)) used.set(k, new Set()); used.get(k).add(path.relative(ROOT, f)); };
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/\.play\(\s*[`'"]([a-z0-9_]+)[`'"]/g)) add(m[1], f);
  for (const m of s.matchAll(/\bSFX\(\s*[`'"]([a-z0-9_]+)[`'"]/g)) add(m[1], f);
  for (const m of s.matchAll(/playSfx\(\s*[`'"]([a-z0-9_]+)[`'"]/g)) add(m[1], f);
}

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/manifest.json'), 'utf8'));
const downloaded = new Set(Object.keys(manifest.audio || {}));

const { SYNTH_RECIPES, SYNTH_ALIASES } = await import('../src/audio/soundDesign.js');
const synth = new Set([...Object.keys(SYNTH_RECIPES), ...Object.keys(SYNTH_ALIASES || {})]);

const missing = [...used.keys()].filter((k) => !downloaded.has(k) && !synth.has(k));
const unusedDownloaded = [...downloaded].filter((k) => !used.has(k) && !synth.has(k));

if (missing.length) {
  console.log('\x1b[31mMissing sounds\x1b[0m (played in code, produced nowhere):');
  for (const k of missing) console.log(`  ${k}  ← ${[...used.get(k)].join(', ')}`);
} else {
  console.log(`  \x1b[32m✓\x1b[0m all ${used.size} referenced sounds exist (${downloaded.size} downloaded + ${synth.size} synthesised)`);
}
const orphans = unusedDownloaded.length;
console.log(`  \x1b[2m${orphans} downloaded banks not directly referenced (they back multi-sample groups)\x1b[0m`);
process.exit(missing.length ? 1 : 0);

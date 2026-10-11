#!/usr/bin/env node
/**
 * Paints the NSIS installer bitmaps straight out of the source emblem, so the
 * Windows installer looks like the game instead of like an electron app:
 *
 *   resources/nsis-header.bmp    150×57   — top-right of every wizard page
 *   resources/nsis-sidebar.bmp   164×314  — welcome / finish page
 *   resources/installer-splash.bmp  164×314 — portable.exe splash
 *
 * 24-bit BMP, bottom-up rows, no external image libraries.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// reuse the png decoder from make-icons by asking it to emit raw sizes

// ── minimal png read (RGB/RGBA 8-bit) ────────────────────────────────────
import zlib from 'node:zlib';
function decodePng(buf) {
  let off = 8, w = 0, h = 0, type = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const tag = buf.toString('ascii', off + 4, off + 8);
    const d = buf.subarray(off + 8, off + 8 + len);
    if (tag === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); type = d[9]; }
    else if (tag === 'IDAT') idat.push(d);
    else if (tag === 'IEND') break;
    off += 12 + len;
  }
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[type];
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(w * h * 4);
  const prev = Buffer.alloc(stride);
  const line = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++];
    raw.copy(line, 0, p, p + stride); p += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      if (f === 1) line[i] = (line[i] + a) & 255;
      else if (f === 2) line[i] = (line[i] + b) & 255;
      else if (f === 3) line[i] = (line[i] + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    line.copy(prev);
    for (let x = 0; x < w; x++) {
      const s = x * ch, d = (y * w + x) * 4;
      if (type === 6) { out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2]; out[d + 3] = line[s + 3]; }
      else if (type === 2) { out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2]; out[d + 3] = 255; }
      else if (type === 0) { out[d] = out[d + 1] = out[d + 2] = line[s]; out[d + 3] = 255; }
      else if (type === 4) { out[d] = out[d + 1] = out[d + 2] = line[s]; out[d + 3] = line[s + 1]; }
    }
  }
  return { w, h, data: out };
}

// ── bmp encode ───────────────────────────────────────────────────────────
function encodeBmp(w, h, rgb) {
  const rowSize = Math.ceil((w * 3) / 4) * 4;
  const pix = Buffer.alloc(rowSize * h, 0);
  for (let y = 0; y < h; y++) {
    const src = (h - 1 - y) * w * 3;
    rgb.copy(pix, y * rowSize, src, src + w * 3);
  }
  const head = Buffer.alloc(14);
  head.write('BM', 0);
  head.writeUInt32LE(14 + 40 + pix.length, 2);
  head.writeUInt32LE(14 + 40, 10);
  const dib = Buffer.alloc(40);
  dib.writeUInt32LE(40, 0); dib.writeInt32LE(w, 4); dib.writeInt32LE(h, 8);
  dib.writeUInt16LE(1, 12); dib.writeUInt16LE(24, 14);
  dib.writeUInt32LE(0, 16); dib.writeUInt32LE(pix.length, 20);
  return Buffer.concat([head, dib, pix]);
}

// ── compositing ──────────────────────────────────────────────────────────
function sample(img, u, v) {           // bilinear, u/v in 0..1
  const x = Math.min(img.w - 1, Math.max(0, u * (img.w - 1)));
  const y = Math.min(img.h - 1, Math.max(0, v * (img.h - 1)));
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(img.w - 1, x0 + 1), y1 = Math.min(img.h - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const g = (xx, yy, k) => img.data[(yy * img.w + xx) * 4 + k];
  const out = [0, 0, 0, 0];
  for (let k = 0; k < 4; k++) {
    out[k] = (g(x0, y0, k) * (1 - fx) + g(x1, y0, k) * fx) * (1 - fy)
           + (g(x0, y1, k) * (1 - fx) + g(x1, y1, k) * fx) * fy;
  }
  return out;
}

/** Draw `img` centred at (cx, cy) with size `size`, over a background painter. */
function drawEmblem(w, h, img, cx, cy, size, bg) {
  const rgb = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let [r, g, b] = bg(x, y, w, h);
      const u = (x - (cx - size / 2)) / size;
      const v = (y - (cy - size / 2)) / size;
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
        const [sr, sg, sb, sa] = sample(img, u, v);
        const a = sa / 255;
        r = r * (1 - a) + sr * a;
        g = g * (1 - a) + sg * a;
        b = b * (1 - a) + sb * a;
      }
      const o = (y * w + x) * 3;
      rgb[o] = Math.max(0, Math.min(255, Math.round(r)));
      rgb[o + 1] = Math.max(0, Math.min(255, Math.round(g)));
      rgb[o + 2] = Math.max(0, Math.min(255, Math.round(b)));
    }
  }
  return rgb;
}

// ink-wash background: near-black with a warm ember glow at the bottom
const inkBg = (tint) => (x, y, w, h) => {
  const nx = x / w, ny = y / h;
  const glow = Math.max(0, 1 - Math.hypot(nx - 0.5, (ny - 0.82) * 1.6) * 1.9);
  const base = 11 + ny * 6;
  return [
    base + glow * glow * 90 + tint[0] * 0.06,
    base * 0.78 + glow * 28 + tint[1] * 0.05,
    base * 0.85 + glow * 14 + tint[2] * 0.04,
  ];
};

const srcPath = path.join(ROOT, 'art', 'emblem.png');
if (!fs.existsSync(srcPath)) { console.error('missing art/emblem.png'); process.exit(1); }
const img = decodePng(fs.readFileSync(srcPath));
fs.mkdirSync(path.join(ROOT, 'resources'), { recursive: true });

const write = (name, buf) => {
  const p = path.join(ROOT, 'resources', name);
  fs.writeFileSync(p, buf);
  console.log(`  resources/${name}  ${(buf.length / 1024).toFixed(1)} kB`);
};

// 150×57 header — emblem on the right, gradient to black on the left
{
  const w = 150, h = 57;
  const rgb = drawEmblem(w, h, img, w - 30, h / 2, 46, (x, y) => {
    const t = x / w;
    const k = Math.pow(t, 1.6);
    return [11 + k * 26, 7 + k * 8, 8 + k * 10];
  });
  // hard 1px baseline like a sumi-e rule
  for (let x = 0; x < w; x++) {
    const o = ((h - 1) * w + x) * 3;
    rgb[o] = 120; rgb[o + 1] = 52; rgb[o + 2] = 38;
  }
  write('nsis-header.bmp', encodeBmp(w, h, rgb));
}

// 164×314 sidebar — big emblem, vermillion seal mark, ink gradient
{
  const w = 164, h = 314;
  const rgb = drawEmblem(w, h, img, w / 2, h * 0.38, 132, inkBg([44, 18, 14]));
  // vermillion rule under the emblem
  const y0 = Math.round(h * 0.63);
  for (let x = 24; x < w - 24; x++) {
    for (let y = y0; y < y0 + 2; y++) {
      const o = (y * w + x) * 3;
      rgb[o] = 214; rgb[o + 1] = 74; rgb[o + 2] = 44;
    }
  }
  write('nsis-sidebar.bmp', encodeBmp(w, h, rgb));
  write('installer-splash.bmp', encodeBmp(w, h, rgb));
}
console.log('installer art written');

#!/usr/bin/env node
/**
 * make-icons — turn the source emblem into every icon the build needs.
 *
 * No image libraries on purpose: this is a ~200 line PNG decoder (inflate +
 * un-filter) and encoder (deflate + filter 0) so the repo stays dependency
 * light and `npm run icons` works on any machine with node.
 *
 *   in   art/emblem.png      (source art, 1024²)
 *   out  resources/icon.ico      (Windows installer / taskbar / desktop shortcut)
 *        resources/icon.png      (electron-builder linux + mac)
 *        public/icon-512.png (PWA manifest)
 *        public/apple-touch-icon.png
 *        public/favicon-32.png
 *        public/art/emblem-*.png (game UI: title screen + loading mark)
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'art', 'emblem.png');

// ─────────────────────────────────────────────────────────── png decoding
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let off = 8;
  let w = 0, h = 0, depth = 0, type = 0;
  const idat = [];
  let plte = null, trns = null;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const tag = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (tag === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; type = data[9];
      if (depth !== 8) throw new Error(`unsupported bit depth ${depth}`);
      if (data[12] !== 0) throw new Error('interlaced png not supported');
    } else if (tag === 'PLTE') plte = data;
    else if (tag === 'tRNS') trns = data;
    else if (tag === 'IDAT') idat.push(data);
    else if (tag === 'IEND') break;
    off += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!channels) throw new Error(`unsupported colour type ${type}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = Buffer.alloc(w * h * 4, 0);
  const prev = Buffer.alloc(stride, 0);
  const line = Buffer.alloc(stride, 0);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    raw.copy(line, 0, p, p + stride);
    p += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      switch (filter) {
        case 0: break;
        case 1: line[i] = (line[i] + a) & 255; break;
        case 2: line[i] = (line[i] + b) & 255; break;
        case 3: line[i] = (line[i] + ((a + b) >> 1)) & 255; break;
        case 4: {
          const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
          line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
          break;
        }
        default: throw new Error(`bad filter ${filter}`);
      }
    }
    line.copy(prev);
    // → RGBA
    for (let x = 0; x < w; x++) {
      const s = x * channels, d = (y * w + x) * 4;
      if (type === 6) { out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2]; out[d + 3] = line[s + 3]; }
      else if (type === 2) { out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2]; out[d + 3] = 255; }
      else if (type === 0) { out[d] = out[d + 1] = out[d + 2] = line[s]; out[d + 3] = 255; }
      else if (type === 4) { out[d] = out[d + 1] = out[d + 2] = line[s]; out[d + 3] = line[s + 1]; }
      else if (type === 3) {
        const idx = line[s];
        out[d] = plte[idx * 3]; out[d + 1] = plte[idx * 3 + 1]; out[d + 2] = plte[idx * 3 + 2];
        out[d + 3] = trns && idx < trns.length ? trns[idx] : 255;
      }
    }
  }
  return { width: w, height: h, data: out };
}

// ─────────────────────────────────────────────────────────── png encoding
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(tag, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(tag, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(img) {
  const { width: w, height: h, data } = img;
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    data.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Box-filtered resize. Straight average, good enough for icons. */
function resize(img, size) {
  const { width: w, height: h, data } = img;
  const out = Buffer.alloc(size * size * 4);
  const step = w / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      const x0 = Math.floor(x * step), x1 = Math.min(w, Math.ceil((x + 1) * step));
      const y0 = Math.floor(y * step), y1 = Math.min(h, Math.ceil((y + 1) * step));
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * w + xx) * 4;
          const al = data[i + 3] / 255;
          r += data[i] * al; g += data[i + 1] * al; b += data[i + 2] * al; a += data[i + 3]; n++;
        }
      }
      const aa = a / Math.max(1, n);
      const o = (y * size + x) * 4;
      out[o] = Math.round(n && aa ? r / (n * aa / 255) / 255 * 255 : r / Math.max(1, n));
      out[o + 1] = Math.round(n && aa ? g / (n * aa / 255) / 255 * 255 : g / Math.max(1, n));
      out[o + 2] = Math.round(n && aa ? b / (n * aa / 255) / 255 * 255 : b / Math.max(1, n));
      out[o + 3] = Math.round(aa);
    }
  }
  return { width: size, height: size, data: out };
}

/** .ico with PNG payloads (supported by every Windows since Vista). */
function encodeIco(sizes, pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  const entries = [];
  let offset = 6 + sizes.length * 16;
  for (let i = 0; i < sizes.length; i++) {
    const e = Buffer.alloc(16);
    e[0] = sizes[i] >= 256 ? 0 : sizes[i];
    e[1] = sizes[i] >= 256 ? 0 : sizes[i];
    e[2] = 0; e[3] = 0;
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(pngs[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...pngs]);
}

// ────────────────────────────────────────────────────────────────── main
if (!fs.existsSync(SRC)) {
  console.error('missing art/emblem.png — put the source emblem there first');
  process.exit(1);
}
const src = decodePng(fs.readFileSync(SRC));
console.log(`source: ${src.width}×${src.height}`);

const write = (p, buf) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); console.log(`  ${path.relative(ROOT, p)}  ${(buf.length / 1024).toFixed(1)} kB`); };

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const icoPngs = ICO_SIZES.map((s) => encodePng(resize(src, s)));
write(path.join(ROOT, 'resources', 'icon.ico'), encodeIco(ICO_SIZES, icoPngs));
write(path.join(ROOT, 'resources', 'icon.png'), encodePng(resize(src, 512)));
write(path.join(ROOT, 'public', 'icon-512.png'), encodePng(resize(src, 512)));
write(path.join(ROOT, 'public', 'apple-touch-icon.png'), encodePng(resize(src, 180)));
write(path.join(ROOT, 'public', 'favicon-32.png'), encodePng(resize(src, 32)));
write(path.join(ROOT, 'public', 'art', 'emblem-512.png'), encodePng(resize(src, 512)));
write(path.join(ROOT, 'public', 'art', 'emblem-256.png'), encodePng(resize(src, 256)));
console.log('icons written');

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { formatBytes } from './MathUtils.js';

const CACHE_NAME = 'kitsuna-assets-v3';
const DB_NAME = 'kitsuna-assets';
const STORE = 'files';

/**
 * AssetManager — downloads every model/audio byte the game needs *before*
 * gameplay starts, reports honest per-file progress, and stores everything in
 * the Cache API (with an IndexedDB fallback) so the second run is instant and
 * works offline.
 *
 * Progress is byte-accurate: each file streams in and reports chunks, so the
 * loading bar never lies the way "3 of 91 files" bars do.
 */
export class AssetManager {
  constructor({ baseUrl = 'assets/', audioContext = null } = {}) {
    this.base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    this.ctx = audioContext;
    this.manifest = null;
    this.files = new Map();       // url -> ArrayBuffer | Blob
    this.audio = new Map();       // group -> AudioBuffer[]
    this.models = new Map();      // url -> GLTF
    this.cache = null;
    this.db = null;
    this.bytesLoaded = 0;
    this.bytesTotal = 0;
    this.stats = { fromCache: 0, downloaded: 0, failed: 0, ms: 0 };
    this.concurrency = 6;
    this.aborted = false;
  }

  get assetUrl() { return new URL(this.base, document.baseURI).href; }

  async #openCache() {
    if (this.cache !== null) return this.cache;
    try {
      if ('caches' in window) this.cache = await caches.open(CACHE_NAME);
    } catch { this.cache = false; }
    return this.cache;
  }

  async #openDb() {
    if (this.db !== null) return this.db;
    if (!('indexedDB' in window)) { this.db = false; return false; }
    this.db = await new Promise((resolve) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(false);
    });
    return this.db;
  }

  async #dbGet(url) {
    const db = await this.#openDb();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const g = tx.objectStore(STORE).get(url);
      g.onsuccess = () => resolve(g.result || null);
      g.onerror = () => resolve(null);
    });
  }

  async #dbPut(url, blob) {
    const db = await this.#openDb();
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(blob, url);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  // -------------------------------------------------------------- manifest
  async loadManifest() {
    const url = `${this.base}manifest.json`;
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`manifest missing at ${url} — run \`npm run assets\``);
    this.manifest = await res.json();
    this.bytesTotal = this.manifest.totalBytes || 0;
    return this.manifest;
  }

  /** All file records flattened, models first (the loading screen shows them). */
  #allFiles() {
    const m = this.manifest;
    if (!m) return [];
    return [
      ...(m.models || []).map((f) => ({ ...f, kind: 'model' })),
      ...(m.textures || []).map((f) => ({ ...f, kind: 'texture' })),
      ...Object.values(m.audio || {}).flat().map((f) => ({ ...f, kind: 'audio' })),
    ];
  }

  // ------------------------------------------------------------- download
  /**
   * Download (or rehydrate from cache) every asset.
   * @param {(p:{loaded:number,total:number,file:string,index:number,count:number,percent:number})=>void} onProgress
   */
  async preloadAll(onProgress = () => {}) {
    const t0 = performance.now();
    const files = this.#allFiles();
    const count = files.length;
    this.bytesLoaded = 0;
    this.concurrency = Math.max(3, Math.min(8, (navigator.hardwareConcurrency || 4) + 1));

    let index = 0;
    const report = (file) => {
      onProgress({
        loaded: this.bytesLoaded,
        total: this.bytesTotal,
        file: file?.url || '',
        index, count,
        percent: this.bytesTotal ? (this.bytesLoaded / this.bytesTotal) * 100 : 100,
      });
    };

    const worker = async () => {
      while (!this.aborted) {
        const i = index++;
        if (i >= count) return;
        const file = files[i];
        try {
          await this.#fetchOne(file, (deltaBytes) => {
            this.bytesLoaded += deltaBytes;
            report(file);
          });
          this.stats.downloaded++;
        } catch (err) {
          console.warn('[assets] failed', file.url, err.message);
          this.stats.failed++;
          this.bytesLoaded += file.bytes || 0;  // keep the bar honest-ish
        }
        report(file);
      }
    };

    await Promise.all(Array.from({ length: this.concurrency }, worker));
    this.stats.ms = performance.now() - t0;
    onProgress({
      loaded: this.bytesLoaded, total: this.bytesTotal, file: '', index: count, count, percent: 100,
    });
    return this.stats;
  }

  async #fetchOne(file, onChunk) {
    const rel = file.url;
    const url = `${this.base}${rel}`;
    // 1. memory
    if (this.files.has(rel)) { onChunk(file.bytes || 0); return this.files.get(rel); }
    // 2. cache api
    const cache = await this.#openCache();
    if (cache) {
      try {
        const hit = await cache.match(url);
        if (hit) {
          const buf = await hit.arrayBuffer();
          this.files.set(rel, buf);
          this.stats.fromCache++;
          onChunk(buf.byteLength);
          return buf;
        }
      } catch { /* fall through */ }
    }
    // 3. indexeddb
    if (!cache) {
      const blob = await this.#dbGet(url);
      if (blob) {
        const buf = await blob.arrayBuffer();
        this.files.set(rel, buf);
        this.stats.fromCache++;
        onChunk(buf.byteLength);
        return buf;
      }
    }
    // 4. network (streamed for real progress)
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    let buffer;
    if (res.body && res.body.getReader) {
      const reader = res.body.getReader();
      const chunks = [];
      let received = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        onChunk(value.byteLength);
      }
      buffer = new Uint8Array(received);
      let off = 0;
      for (const c of chunks) { buffer.set(c, off); off += c.byteLength; }
      buffer = buffer.buffer;
    } else {
      buffer = await res.arrayBuffer();
      onChunk(buffer.byteLength);
    }
    this.files.set(rel, buffer);
    // 5. persist
    try {
      if (cache) await cache.put(url, new Response(new Blob([buffer]), { headers: { 'content-type': 'application/octet-stream' } }));
      else await this.#dbPut(url, new Blob([buffer]));
    } catch { /* quota — fine, we still have it in memory */ }
    return buffer;
  }

  // ---------------------------------------------------------------- access
  get(rel) { return this.files.get(rel); }

  /** Group name -> decoded AudioBuffers (picks up `_0`, `_1`, … variants). */
  async decodeAudio(onDecode = () => {}) {
    if (!this.ctx) throw new Error('AssetManager needs an AudioContext to decode audio');
    const groups = this.manifest?.audio || {};
    let i = 0;
    const total = Object.values(groups).flat().length;
    for (const [group, entries] of Object.entries(groups)) {
      const buffers = [];
      for (const entry of entries) {
        const buf = this.files.get(entry.url);
        if (!buf) continue;
        try {
          const audio = await this.ctx.decodeAudioData(buf.slice(0));
          buffers.push(audio);
        } catch (err) {
          console.warn('[assets] decode failed', entry.url, err.message);
        }
        onDecode({ index: ++i, total, group });
      }
      if (buffers.length) this.audio.set(group, buffers);
    }
    return this.audio;
  }

  async loadModel(rel) {
    if (this.models.has(rel)) return this.models.get(rel);
    const buf = this.files.get(rel);
    if (!buf) throw new Error(`model not loaded: ${rel}`);
    const loader = new GLTFLoader();
    const gltf = await new Promise((resolve, reject) => {
      loader.parse(buf.slice(0), '', resolve, reject);
    });
    this.models.set(rel, gltf);
    return gltf;
  }

  /** Texture generation is done in-engine (procedural), but external art lands here. */
  async loadTexture(rel, renderer) {
    const buf = this.files.get(rel);
    if (!buf) throw new Error(`texture not loaded: ${rel}`);
    const blob = new Blob([buf]);
    const url = URL.createObjectURL(blob);
    const tex = await new THREE.TextureLoader().loadAsync(url);
    URL.revokeObjectURL(url);
    if (renderer) tex.anisotropy = Math.min(8, renderer.capabilities?.getMaxAnisotropy?.() ?? 1);
    return tex;
  }

  // --------------------------------------------------------------- cache ui
  async cacheSize() {
    if ('storage' in navigator && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      return formatBytes(est.usage || 0);
    }
    return formatBytes(this.bytesTotal);
  }

  async clearCache() {
    this.files.clear();
    this.audio.clear();
    this.models.clear();
    try { if ('caches' in window) await caches.delete(CACHE_NAME); } catch { /* ignore */ }
    const db = await this.#openDb();
    if (db) {
      await new Promise((resolve) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      });
    }
  }

  abort() { this.aborted = true; }
}

/** Register the offline service worker (best effort; never fatal). */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return false;
  try {
    const url = new URL('sw.js', document.baseURI);
    const reg = await navigator.serviceWorker.register(url.href, { scope: new URL('./', document.baseURI).href });
    return !!reg;
  } catch (err) {
    console.warn('[sw] registration skipped', err.message);
    return false;
  }
}

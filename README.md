# 狐の悪魔 — Kitsuna no Akuma

An open-world 3D action RPG. You signed a contract with the Fox Devil using one
word — **Kon** — and every life it takes for you has been drawing the two of you
closer together. The goal is not to save the world. The goal is to become the
strongest.

Built with three.js + Vite. Runs in the browser, deploys to Cloudflare Pages, and
packages into a signed-by-nobody Windows installer with Electron.

```bash
npm install
npm run dev        # http://localhost:5173  (fetches the CC0 asset bundle first)
```

---

## The game

- **Open world** — a 3.2 km province of nine regions: river village, cedar
  passes, rice flats, shrine mountain, swamp, coast, snowfield, volcano and the
  capital. Terrain, scatter and landmarks stream in chunks around you; weather
  and a day/night cycle run on top.
- **Contract combat** — light/heavy attacks, block, **parry** (guard inside the
  window and the enemy's posture breaks), **dash** with i-frames, executions,
  posture, status effects, 21 of them.
- **37 abilities.** Start with **Kon** — say the word and the fox devil's head
  erupts from the ground and bites. Then fox-fire, iai draws, kitsune-bi,
  nine-tail sweeps, possession, mirror images, void rifts, the Ninth Bell. Every
  one ranks up five times and changes shape as it does: Kon grows extra heads.
- **Eight fox mutations.** Kon Kit → Yako → Kuda-gitsune → Genkurō → Tenko →
  Kyūbi → Inari → Akuma. Each is gated behind quests, essence and a written
  trial, and each changes the fox's body, eyes and coat in-engine.
- **50 quests** across seven chains (main, side, tutorial, escort, trial, fox,
  bounty) with 16 objective types, dialogue, turn-ins and repeatable bounties.
- **26 enemies** with distinct AI archetypes, attack sets, posture rules,
  loot tables and regions they live in — plus bosses at the landmarks.
- **Attributes & skills** — Blood / Spirit / Body / Cunning feed every damage
  formula; four skill trees (Blade, Spirit, Fox, Body) with ~120 nodes.

Controls: WASD move, Shift sprint, Space dash, LMB light, RMB heavy/guard,
Q lock-on, Tab cycle target, E interact, 1–6 abilities, F Kon, R devil form,
H quick heal, C/I/J/M/K panels, Esc pause, V ability wheel, P screenshot.

---

## Quick start

| command | what it does |
| --- | --- |
| `npm run dev` | dev server on 0.0.0.0:5173, assets fetched first |
| `npm run build` | production bundle → `dist/` |
| `npm run preview` | serve the built bundle |
| `npm test` | smoke test + settings audit + headless gameplay + jsdom UI run |
| `npm run headless` | simulate 900 frames of real gameplay with no GPU |
| `npm run ui` | mount every screen in jsdom and assert it renders |
| `npm run assets` | (re)download the CC0 model + SFX bundle |
| `npm run icons` | regenerate icons and installer art from `art/emblem.png` |
| `npm run desktop` | package the desktop app for this platform |
| `npm run installer:win` | build the Windows NSIS installer + portable exe |

Requires Node 20+ and WebGL 2.

---

## Asset pipeline

Nothing streams during play. `tools/fetch-assets.mjs` pulls a CC0 model
(Khronos `Fox.glb`) and Kenney's CC0 impact/RPG SFX packs, encodes the audio to
Ogg Vorbis (7 MB → 0.73 MB) and writes `public/assets/manifest.json`. The
loading screen downloads and decodes all of it up front, then caches it in
IndexedDB + the Cache API so the second launch is instant.

On top of that, `src/audio/soundDesign.js` synthesises ~70 sounds sample by
sample — the Kon bite, the perfect parry, fox-fire, the Ninth Bell, mutation
chords. These are the verbs of the combat loop: they need to be exactly the same
length every time and survive being fired 40 times a second. `npm run
check:audio` fails the build if the code ever asks for a sound nobody produces.

`public/assets/` is gitignored — `predev`/`prebuild` rebuild it when missing,
which is also how Cloudflare Pages gets its assets.

---

## Cloudflare Pages

`wrangler.toml` is the source of truth. Two supported paths:

**Git integration** — point Cloudflare at the repo:

```
framework preset:  Vite
build command:     npm run build
build output:      dist
node version:      22
```

**Direct upload** — `npx wrangler pages deploy dist --project-name=kitsuna-no-akuma`

`.github/workflows/pages.yml` does the latter on every push to `main` (and
publishes a preview deployment per PR) using `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` secrets. `public/_headers` pins immutable caching for
the hashed build output and the asset bundle, no-cache for `sw.js`, and the
usual hardening headers; `public/_redirects` makes Cloudflare hand back
`index.html` for anything that isn't a real file.

The in-game settings screen has a **Cloudflare** section for the Pages project
name, account ID, production branch, build command, output directory, custom
domain, asset base URL (point it at a CDN or R2 bucket), telemetry endpoint, and
a button that installs the offline service worker.

---

## Windows installer

```
npm run installer:win
```

Produces, in `release/`:

- `Kitsuna no Akuma-Setup-1.0.0.exe` — NSIS installer, per-user or per-machine,
  desktop + Start menu shortcuts, EN/JA language selector, run-after-finish
- `Kitsuna no Akuma-1.0.0-portable.exe` — no-install build
- `dist-desktop/win-unpacked/` — unpacked app (`--dir`), no wine needed

The installer chrome is painted from the same emblem as the game
(`resources/nsis-*.bmp`, generated by `npm run icons`). The app itself runs
frameless with its own title bar (`electron/main.cjs` serves `dist/` over a
loopback http server so ES modules, the service worker and relative paths behave
exactly as they do on the web).

Cross-compiling from macOS/Linux needs `wine` for the NSIS step; the unpacked
`--dir` build does not. `.github/workflows/release.yml` builds the installer on
`windows-latest` for every `v*` tag and attaches the `.exe` to the release.

---

## Layout

```
src/core/      engine, renderer/composer, input, settings, asset loader, audio
src/data/      all content: attributes, abilities, enemies, regions, quests, npcs…
src/world/     terrain, chunk streaming, sky, weather, POI builder, materials
src/entities/  player, fox devil, enemies, camera rig, projectiles
src/systems/   combat, abilities, progression, quests, spawning, inventory, VFX
src/audio/     runtime SFX synthesis
src/ui/        HUD, panels, title/pause/settings, styles.css
tools/         asset fetcher, smoke test, headless harnesses, icon painter
electron/      desktop shell (main + preload) and packaging driver
```

Tests live in `tools/` and need no GPU: `npm test` cross-references every data
table (skills, drops, objectives, bindings, sound names), then plays the game
headlessly — spawning every enemy and casting every ability — then mounts every
UI screen in jsdom.

---

## Credits

- Models: Khronos glTF Sample Assets (`Fox.glb`, CC0).
- Sound effects: Kenney (CC0) via `sparkstream-sounds`.
- Everything else — code, shaders, terrain, synthesised audio, writing —
  original. Fox Devil contract not included.

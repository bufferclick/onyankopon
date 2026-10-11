import { bus, EV } from '../core/EventBus.js';
import { ACTIONS, QUALITY_PRESETS, DIFFICULTIES } from '../core/Settings.js';
import { keyLabel } from '../core/Input.js';
import { Hud } from './Hud.js';
import { Panels } from './Panels.js';
import { ABILITY_BY_ID } from '../data/abilities.js';

/**
 * UI root: title screen, settings, pause, the ability wheel, and the glue that
 * decides whether a keystroke goes to the game or to a panel.
 */
export class UI {
  constructor(game, settings, input) {
    this.game = game;
    this.settings = settings;
    this.input = input;
    this.hud = new Hud(game);
    this.panels = new Panels(game, this);
    this.state = 'title';         // title | playing | paused | panel | wheel
    this.#buildTitle();
    this.#buildTitleBar();
    this.#buildSettings();
    this.#buildPause();
    this.#buildWheel();
    this.#hook();
  }

  // ─────────────────────────────────────────────────────────────── title
  #buildTitle() {
    const el = document.getElementById('title');
    const hasSave = this.game.constructor.hasSave();
    const save = hasSave ? this.game.constructor.load() : null;
    el.innerHTML = `
      <div class="crest-art" aria-hidden="true"></div>
      <div class="crest"><span>狐</span></div>
      <div class="title-left">
        <div class="title-kanji">狐<span class="seal">の</span>悪魔</div>
        <div class="title-romaji">Kitsuna no Akuma</div>
        <div class="title-tag">You signed with one word and one word only.
          Everything since has been the fox collecting.</div>
        <div class="title-meta">
          <span>Open world</span><span>Action RPG</span><span>v1.0</span>
        </div>
      </div>
      <div class="title-menu">
        <button data-act="continue" ${hasSave ? '' : 'disabled'}>Continue<span class="hint">${save ? `Lv ${save.progression?.level ?? 1} · ${Math.floor((save.playTime || 0) / 60)} min` : 'No contract'}</span></button>
        <button data-act="new">New Contract<span class="hint">Begin</span></button>
        <button data-act="load" ${hasSave ? '' : 'disabled'}>Load<span class="hint">Save slot I</span></button>
        <button data-act="settings">Settings<span class="hint">Video · Audio · Controls</span></button>
        <button data-act="codex">Codex<span class="hint">Bestiary · Lore</span></button>
        <button data-act="credits">Credits<span class="hint">CC0 sources</span></button>
      </div>
      <div class="title-foot"><span>Assets CC0 — Kenney · PixelMannen</span><span>Electron build</span></div>
    `;
    el.querySelectorAll('button[data-act]').forEach((b) => {
      b.onclick = () => this.#titleAction(b.dataset.act);
    });
    this.titleEl = el;
  }

  #titleAction(act) {
    this.game.audio?.play('ui_confirm', { volume: 0.5, bus: 'ui' });
    if (act === 'continue' || act === 'load') {
      const save = this.game.constructor.load();
      this.startGame(save);
    } else if (act === 'new') {
      this.game.constructor.clearSave();
      this.startGame(null);
    } else if (act === 'settings') {
      this.openSettings('video');
    } else if (act === 'codex') {
      this.titleEl.classList.add('hidden');
      this.state = 'panel';
      this.panels.tab = 'bestiary';
      this.panels.open('codex');
      this._codexFromTitle = true;
    } else if (act === 'credits') {
      this.#credits();
    }
  }

  #credits() {
    const el = document.createElement('div');
    el.className = 'paper';
    el.style.cssText = 'position:fixed;inset:12vh 20vw;z-index:30;padding:40px;overflow:auto';
    el.innerHTML = `
      <h2 style="font-weight:400;letter-spacing:.16em;font-size:28px">Sources</h2>
      <div class="rule" style="margin:18px 0"></div>
      <p style="line-height:2;font-size:14px;color:#a79c8d">
        <strong style="color:#e8dcc8">Fox model</strong> — “Fox” by PixelMannen, CC0, via the Khronos
        glTF Sample Assets.<br>
        <strong style="color:#e8dcc8">Sound effects</strong> — Kenney audio packs (Impact, Interface,
        RPG, Digital, Sci‑Fi), CC0 1.0, via the sparkstream-sounds collection.<br>
        <strong style="color:#e8dcc8">Everything else</strong> — geometry, animation, music beds and
        the synthesised combat sounds are original to this project.<br><br>
        Built with three.js and Vite. Runs in a browser or as a Windows desktop build.
      </p>
      <button class="btn small" style="margin-top:26px" id="credClose">Close</button>`;
    document.body.appendChild(el);
    el.querySelector('#credClose').onclick = () => el.remove();
  }

  startGame(save) {
    this.titleEl.classList.add('hidden');
    this.state = 'playing';
    document.body.classList.add('playing');
    this.hud.setVisible(true);
    // the game object was built before the choice; load the save data now
    if (save) this.game.loadInto(save);
    this.game.start();
    bus.emit(EV.GAME_START, { save });
  }

  // ───────────────────────────────────────────────────────────── settings
  #buildSettings() {
    const el = document.getElementById('settings');
    el.innerHTML = `
      <div class="settings-inner">
        <div class="side" id="sSide">
          ${[['video', 'Video'], ['audio', 'Audio'], ['controls', 'Controls'], ['bindings', 'Keybinds'],
            ['gameplay', 'Gameplay'], ['accessibility', 'Accessibility'], ['cloudflare', 'Cloudflare']]
            .map(([id, label]) => `<button data-sec="${id}">${label}</button>`).join('')}
          <div style="flex:1"></div>
          <button data-sec="__reset" style="color:#8f3220">Reset all</button>
          <button data-sec="__close">Back</button>
        </div>
        <div class="opts scroll" id="sOpts"></div>
      </div>`;
    el.querySelectorAll('[data-sec]').forEach((b) => {
      b.onclick = () => {
        if (b.dataset.sec === '__close') return this.closeSettings();
        if (b.dataset.sec === '__reset') {
          this.settings.reset?.();
          this.renderSettings(this.settingsSection);
          return;
        }
        this.openSettings(b.dataset.sec);
      };
    });
    this.settingsEl = el;
    this.settingsSection = 'video';
  }

  openSettings(section = 'video') {
    this.settingsSection = section;
    this.settingsEl.classList.add('open');
    this.settingsEl.querySelectorAll('.side button').forEach((b) => {
      b.classList.toggle('active', b.dataset.sec === section);
    });
    this.renderSettings(section);
  }

  closeSettings() {
    this.settingsEl.classList.remove('open');
    if (this.state === 'title') this.titleEl.classList.remove('hidden');
    else if (this.state === 'playing') { /* nothing */ }
    this.game.audio?.play('ui_back', { volume: 0.4, bus: 'ui' });
  }

  renderSettings(section) {
    const host = document.getElementById('sOpts');
    const S = this.settings;
    const video = S.data.video, audio = S.data.audio, controls = S.data.controls,
      gameplay = S.data.gameplay, acc = S.data.accessibility, cf = S.data.cloudflare;

    const range = (section_, key, label, min, max, step, desc = '', fmt = (v) => v) => `
      <div class="opt">
        <div class="nm">${label}${desc ? `<small>${desc}</small>` : ''}</div>
        <div class="ctl"><input type="range" data-set="${section_}.${key}" min="${min}" max="${max}" step="${step}" value="${S.get(section_, key)}"></div>
        <div class="val">${fmt(S.get(section_, key))}</div>
      </div>`;
    const toggle = (section_, key, label, desc = '') => `
      <div class="opt">
        <div class="nm">${label}${desc ? `<small>${desc}</small>` : ''}</div>
        <div class="ctl"><button class="switch ${S.get(section_, key) ? 'on' : ''}" data-toggle="${section_}.${key}"></button></div>
        <div class="val">${S.get(section_, key) ? 'On' : 'Off'}</div>
      </div>`;
    const select = (section_, key, label, options, desc = '') => `
      <div class="opt">
        <div class="nm">${label}${desc ? `<small>${desc}</small>` : ''}</div>
        <div class="ctl"><select data-select="${section_}.${key}">
          ${options.map(([v, l]) => `<option value="${v}" ${String(S.get(section_, key)) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}
        </select></div>
        <div class="val"></div>
      </div>`;
    const text = (section_, key, label, desc = '', placeholder = '') => `
      <div class="opt">
        <div class="nm">${label}${desc ? `<small>${desc}</small>` : ''}</div>
        <div class="ctl"><input type="text" data-text="${section_}.${key}" value="${S.get(section_, key) ?? ''}" placeholder="${placeholder}"></div>
        <div class="val"></div>
      </div>`;
    const head = (t) => `<div class="label" style="margin:26px 0 8px">${t}</div>`;

    let html = '';
    if (section === 'video') {
      html += head('Quality');
      html += `<div class="opt"><div class="nm">Preset<small>Applies a baseline; tweak anything below afterwards.</small></div>
        <div class="ctl">${Object.entries(QUALITY_PRESETS).map(([k, p]) =>
          `<button class="btn small ${video.quality === k ? 'primary' : ''}" data-preset="${k}">${p.label}</button>`).join(' ')}</div><div class="val"></div></div>`;
      html += range('video', 'renderScale', 'Render scale', 0.5, 2, 0.05, 'Lower = faster, softer. 1.0 is native.', (v) => `${v.toFixed(2)}×`);
      html += range('video', 'viewDistance', 'View distance', 120, 600, 20, 'How far terrain streams in, in metres.', (v) => `${v} m`);
      html += range('video', 'fov', 'Field of view', 55, 100, 1, '', (v) => `${v}°`);
      html += head('Lighting & shadows');
      html += toggle('video', 'shadows', 'Shadows');
      html += select('video', 'shadowRes', 'Shadow resolution', [[1024, '1024'], [2048, '2048'], [4096, '4096']]);
      html += range('video', 'shadowDist', 'Shadow distance', 40, 200, 10, '', (v) => `${v} m`);
      html += range('video', 'exposure', 'Exposure', 0.5, 2, 0.05, '', (v) => v.toFixed(2));
      html += range('video', 'darkness', 'Brightness lift', 0, 0.4, 0.02, 'Raises black level — useful on OLED at night.');
      html += head('Effects');
      html += toggle('video', 'postFX', 'Post-processing', 'Bloom, chromatic aberration, vignette, film grain.');
      html += toggle('video', 'bloom', 'Bloom');
      html += toggle('video', 'dof', 'Depth of field');
      html += toggle('video', 'antialias', 'Anti-aliasing', 'Requires a restart.');
      html += range('video', 'particles', 'Particle density', 0.2, 1.6, 0.1, '', (v) => `${(v * 100) | 0}%`);
      html += range('video', 'foliage', 'Foliage density', 0.2, 1.6, 0.1, '', (v) => `${(v * 100) | 0}%`);
      html += toggle('video', 'grass', 'Ground cover');
      html += select('video', 'maxEnemies', 'Max enemies', [[8, '8'], [14, '14'], [20, '20'], [28, '28']], 'Population cap near the player.');
      html += head('Performance');
      html += toggle('video', 'vsync', 'VSync', 'Requires a restart.');
      html += select('video', 'fpsCap', 'Frame cap', [[0, 'Uncapped'], [30, '30'], [60, '60'], [120, '120'], [144, '144']]);
      html += toggle('video', 'showFps', 'Show FPS');
    }

    if (section === 'audio') {
      html += head('Levels');
      html += range('audio', 'master', 'Master', 0, 1, 0.02, '', (v) => `${(v * 100) | 0}%`);
      html += range('audio', 'music', 'Music', 0, 1, 0.02, '', (v) => `${(v * 100) | 0}%`);
      html += range('audio', 'sfx', 'Effects', 0, 1, 0.02, '', (v) => `${(v * 100) | 0}%`);
      html += range('audio', 'ambience', 'Ambience', 0, 1, 0.02, '', (v) => `${(v * 100) | 0}%`);
      html += range('audio', 'ui', 'Interface', 0, 1, 0.02, '', (v) => `${(v * 100) | 0}%`);
      html += head('Behaviour');
      html += toggle('audio', 'spatialAudio', 'Spatial audio', 'Positions sounds in the world around the camera.');
      html += toggle('audio', 'duckDuringDialogue', 'Duck effects in dialogue');
      html += toggle('audio', 'muteOnBlur', 'Mute when unfocused');
      html += toggle('audio', 'windAmbience', 'Wind layer');
      html += toggle('audio', 'combatMusicIntensity', 'Combat music intensity', 'Opens the music filter while you are fighting.');
    }

    if (section === 'controls') {
      html += head('Camera');
      html += range('controls', 'sensitivityX', 'Look sensitivity X', 0.2, 3, 0.05);
      html += range('controls', 'sensitivityY', 'Look sensitivity Y', 0.2, 3, 0.05);
      html += range('controls', 'controllerSensitivity', 'Controller sensitivity', 0.2, 3, 0.05);
      html += toggle('controls', 'invertY', 'Invert Y axis');
      html += range('controls', 'cameraDistance', 'Camera distance', 0.7, 1.6, 0.05);
      html += range('controls', 'cameraHeight', 'Camera height', 0.7, 1.5, 0.05);
      html += toggle('controls', 'cameraCollision', 'Camera collision');
      html += range('controls', 'cameraShake', 'Screen shake', 0, 2, 0.1, '', (v) => `${(v * 100) | 0}%`);
      html += head('Combat feel');
      html += range('controls', 'buffering', 'Input buffer', 0.05, 0.4, 0.01, 'How long a queued attack stays live.', (v) => `${(v * 1000) | 0} ms`);
      html += toggle('controls', 'holdToGuard', 'Hold to guard', 'Off = tap to toggle guard.');
      html += toggle('controls', 'toggleSprint', 'Toggle sprint');
      html += range('controls', 'aimAssist', 'Aim assist', 0, 1, 0.05, 'Strength of soft target snapping.', (v) => `${(v * 100) | 0}%`);
      html += toggle('controls', 'autoLockOn', 'Auto lock-on');
      html += toggle('controls', 'vibration', 'Controller vibration');
    }

    if (section === 'bindings') {
      html += head('Keyboard & mouse');
      const cats = { movement: 'Movement', combat: 'Combat', abilities: 'Abilities', world: 'World', menus: 'Menus' };
      for (const [cat, label] of Object.entries(cats)) {
        html += `<div class="label" style="margin:20px 0 6px">${label}</div>`;
        for (const a of ACTIONS.filter((x) => x.cat === cat)) {
          const keys = this.settings.getBindings(a.id);
          html += `<div class="bind-row">
            <div class="nm" style="font-size:14px">${a.label}</div>
            <button class="keycap-btn" data-bind="${a.id}.0">${keyLabel(keys[0])}</button>
            <button class="keycap-btn" data-bind="${a.id}.1">${keyLabel(keys[1])}</button>
            <button class="btn small ghost" data-clearbind="${a.id}">Clear</button>
          </div>`;
        }
      }
      html += `<div class="actions" style="margin-top:24px;display:flex;gap:12px">
        <button class="btn small" id="resetBinds">Reset to defaults</button></div>`;
    }

    if (section === 'gameplay') {
      html += head('Difficulty');
      html += `<div class="opt"><div class="nm">Contract terms<small>${DIFFICULTIES[gameplay.difficulty]?.blurb || ''}</small></div>
        <div class="ctl">${Object.entries(DIFFICULTIES).map(([k, d]) =>
          `<button class="btn small ${gameplay.difficulty === k ? 'primary' : ''}" data-diff="${k}">${d.label}</button>`).join(' ')}</div><div class="val"></div></div>`;
      html += head('Interface');
      html += toggle('gameplay', 'showDamageNumbers', 'Damage numbers');
      html += toggle('gameplay', 'showEnemyHealth', 'Enemy health bars');
      html += toggle('gameplay', 'showQuestMarkers', 'Quest markers on the map');
      html += toggle('gameplay', 'tutorialHints', 'Tutorial hints');
      html += toggle('gameplay', 'subtitles', 'Subtitles');
      html += range('gameplay', 'subtitleSize', 'Subtitle size', 12, 28, 1, '', (v) => `${v}px`);
      html += head('Feel');
      html += range('gameplay', 'hitStop', 'Hit stop', 0, 2, 0.05, 'Freeze frames on impact.', (v) => `${(v * 100) | 0}%`);
      html += toggle('gameplay', 'gore', 'Blood');
      html += toggle('gameplay', 'autoLoot', 'Auto-collect drops');
      html += head('Save');
      html += toggle('gameplay', 'autoSave', 'Autosave');
      html += range('gameplay', 'autoSaveMinutes', 'Autosave interval', 1, 30, 1, '', (v) => `${v} min`);
    }

    if (section === 'accessibility') {
      html += head('Vision');
      html += toggle('accessibility', 'highContrastNames', 'High contrast text');
      html += toggle('accessibility', 'largeText', 'Large text');
      html += select('accessibility', 'colorBlind', 'Colour vision', [['none', 'None'], ['protanopia', 'Protanopia'], ['deuteranopia', 'Deuteranopia'], ['tritanopia', 'Tritanopia']]);
      html += toggle('accessibility', 'reduceFlashing', 'Reduce flashing', 'Cuts screen flash and heavy aberration.');
      html += head('Input');
      html += toggle('accessibility', 'holdToConfirm', 'Hold to confirm', 'Destructive choices need a held key.');
      html += toggle('accessibility', 'screenReaderHints', 'Verbose hints');
    }

    if (section === 'cloudflare') {
      html += head('Cloudflare Pages deployment');
      html += `<div class="opt"><div class="nm" style="max-width:70ch"><small>These mirror
        <code>wrangler.toml</code> and are read at build time. Fill them in to publish to
        Pages (<code>npm run build</code> → <code>wrangler pages deploy dist</code>).</small></div></div>`;
      html += text('cloudflare', 'projectName', 'Project name', 'pages.dev subdomain prefix', 'kitsuna-no-akuma');
      html += text('cloudflare', 'accountId', 'Account ID', 'Cloudflare dashboard → Workers & Pages', '0abc…');
      html += text('cloudflare', 'productionBranch', 'Production branch', '', 'main');
      html += text('cloudflare', 'buildCommand', 'Build command', '', 'npm run build');
      html += text('cloudflare', 'outputDirectory', 'Output directory', '', 'dist');
      html += text('cloudflare', 'deploymentUrl', 'Deployment URL', 'Latest *.pages.dev URL', 'https://….pages.dev');
      html += text('cloudflare', 'customDomain', 'Custom domain', 'Optional CNAME target', 'play.example.com');
      html += text('cloudflare', 'assetBaseUrl', 'Asset CDN (R2)', 'Blank = same origin', 'https://assets.example.com');
      html += range('cloudflare', 'pagesDevPort', 'Wrangler dev port', 8000, 9999, 1, 'Port for `wrangler pages dev`.', (v) => v);
      html += toggle('cloudflare', 'enableOfflineCache', 'Offline cache', 'Service worker caches assets after first load.');
      html += text('cloudflare', 'telemetryEndpoint', 'Telemetry endpoint', 'Optional anonymous crash/telemetry sink', 'https://…');
      html += `<div class="opt"><div class="nm">Service worker<small>Caches the asset bundle for offline play.</small></div>
        <div class="ctl"><button class="btn small" id="swInstall">Install offline cache</button></div><div class="val" id="swState"></div></div>`;
    }

    host.innerHTML = html;

    // wire it up
    host.querySelectorAll('input[type=range]').forEach((r) => {
      r.oninput = () => {
        const [sec, key] = r.dataset.set.split('.');
        const v = parseFloat(r.value);
        this.settings.set(sec, key, v);
        const val = r.closest('.opt').querySelector('.val');
        if (val) val.textContent = r.dataset.set.includes('Scale') || r.dataset.set.includes('sensitivity')
          || r.dataset.set.includes('Exposure') || r.dataset.set.includes('darkness') ? v.toFixed(2) : v;
      };
    });
    host.querySelectorAll('[data-toggle]').forEach((b) => {
      b.onclick = () => {
        const [sec, key] = b.dataset.toggle.split('.');
        const v = !this.settings.get(sec, key);
        this.settings.set(sec, key, v);
        b.classList.toggle('on', v);
        b.closest('.opt').querySelector('.val').textContent = v ? 'On' : 'Off';
      };
    });
    host.querySelectorAll('[data-select]').forEach((s) => {
      s.onchange = () => {
        const [sec, key] = s.dataset.select.split('.');
        const v = isNaN(parseFloat(s.value)) || key === 'colorBlind' || key === 'fpsCap' && s.value === 'Uncapped'
          ? s.value : parseFloat(s.value);
        this.settings.set(sec, key, (key === 'fpsCap' || key === 'maxEnemies' || key === 'shadowRes') ? parseFloat(s.value) : v);
      };
    });
    host.querySelectorAll('[data-text]').forEach((t) => {
      t.onchange = () => {
        const [sec, key] = t.dataset.text.split('.');
        this.settings.set(sec, key, t.value);
      };
    });
    host.querySelectorAll('[data-preset]').forEach((b) => {
      b.onclick = () => { this.settings.applyQuality(b.dataset.preset); this.renderSettings('video'); };
    });
    host.querySelectorAll('[data-diff]').forEach((b) => {
      b.onclick = () => {
        this.settings.set('gameplay', 'difficulty', b.dataset.diff);
        this.game.combat?.setDifficulty(b.dataset.diff);
        this.game.difficulty = DIFFICULTIES[b.dataset.diff];
        this.renderSettings('gameplay');
      };
    });
    host.querySelectorAll('[data-bind]').forEach((b) => {
      b.onclick = async () => {
        const [id, slot] = b.dataset.bind.split('.');
        b.classList.add('listening');
        b.textContent = 'Press a key…';
        const code = await this.input.captureNext(6000);
        b.classList.remove('listening');
        if (!code) { b.textContent = keyLabel(this.settings.getBindings(id)[Number(slot)]); return; }
        const keys = this.settings.getBindings(id).slice();
        keys[Number(slot)] = code;
        this.settings.setBinding(id, keys.filter(Boolean));
        this.input.setBindings(this.settings.bindings);
        this.renderSettings('bindings');
      };
    });
    host.querySelectorAll('[data-clearbind]').forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.clearbind;
        const keys = this.settings.getBindings(id).slice();
        keys.pop();
        this.settings.setBinding(id, keys);
        this.input.setBindings(this.settings.bindings);
        this.renderSettings('bindings');
      };
    });
    const resetBinds = host.querySelector('#resetBinds');
    if (resetBinds) resetBinds.onclick = () => {
      this.settings.resetBindings();
      this.input.setBindings(this.settings.bindings);
      this.renderSettings('bindings');
    };
    const sw = host.querySelector('#swInstall');
    if (sw) sw.onclick = async () => {
      const { registerServiceWorker } = await import('../core/AssetManager.js');
      const ok = await registerServiceWorker();
      host.querySelector('#swState').textContent = ok ? 'Ready' : 'Failed';
    };
  }

  // ─────────────────────────────────────────────────────────────── pause
  #buildPause() {
    const el = document.getElementById('pause');
    el.innerHTML = `
      <div class="pause-inner">
        <h2>Paused</h2>
        <div class="sub" id="pauseSub">The fox waits</div>
        <div class="pause-grid">
          <button data-p="resume">Resume</button>
          <button data-p="character">Character &amp; Skills</button>
          <button data-p="inventory">Inventory &amp; Crafting</button>
          <button data-p="journal">Quest Journal</button>
          <button data-p="map">World Map</button>
          <button data-p="codex">Codex</button>
          <button data-p="settings">Settings</button>
          <button data-p="save">Save</button>
          <button data-p="quit">Abandon → Title</button>
        </div>
        <div class="pause-stats">
          <div><div class="k">Level</div><div class="v" id="psLv">1</div></div>
          <div><div class="k">Playtime</div><div class="v" id="psTime">0m</div></div>
          <div><div class="k">Slain</div><div class="v" id="psKills">0</div></div>
          <div><div class="k">Quests</div><div class="v" id="psQuests">0</div></div>
        </div>
      </div>`;
    el.querySelectorAll('[data-p]').forEach((b) => {
      b.onclick = () => this.#pauseAction(b.dataset.p);
    });
    this.pauseEl = el;
  }

  #pauseAction(act) {
    this.game.audio?.play('ui_confirm', { volume: 0.4, bus: 'ui' });
    if (act === 'resume') return this.resume();
    if (act === 'settings') return this.openSettings('video');
    if (act === 'save') { this.game.save(); this.hud.toast({ text: 'Saved', kind: 'good' }); return; }
    if (act === 'quit') {
      this.game.save();
      location.reload();
      return;
    }
    this.pauseEl.classList.remove('open');
    this.panels.open(act);
    this.state = 'panel';
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.game.pause();
    const g = this.game;
    document.getElementById('psLv').textContent = g.progression.level;
    document.getElementById('psTime').textContent = `${Math.floor(g.playTime / 60)}m`;
    document.getElementById('psKills').textContent = g.kills || 0;
    document.getElementById('psQuests').textContent = `${g.quests.completed.size}/${g.quests.all.length}`;
    this.pauseEl.classList.add('open');
    document.body.classList.add('ui-open');
  }

  resume() {
    this.pauseEl.classList.remove('open');
    this.panels.close();
    this.settingsEl.classList.remove('open');
    this.wheelEl.classList.remove('open');
    this.state = 'playing';
    document.body.classList.remove('ui-open');
    this.game.resume();
  }

  // ─────────────────────────────────────────────────────── ability wheel
  #buildWheel() {
    const el = document.getElementById('wheel');
    el.innerHTML = `<div class="ring"><div class="hub"><div class="t">技</div><div class="s">Hold F</div></div></div>`;
    this.wheelEl = el;
    this.wheelRing = el.querySelector('.ring');
  }

  /** Assign an ability to a quick slot (or swap with another). */
  openWheel(assignId = null) {
    const g = this.game;
    const owned = [...g.progression.unlockedAbilities];
    if (!owned.length) return;
    this.state = 'wheel';
    this.wheelRing.querySelectorAll('.item').forEach((n) => n.remove());
    const N = Math.min(12, owned.length);
    for (let i = 0; i < N; i++) {
      const id = owned[i];
      const a = ABILITY_BY_ID[id];
      if (!a) continue;
      const ang = (i / N) * Math.PI * 2 - Math.PI / 2;
      const node = document.createElement('div');
      node.className = 'item';
      node.style.left = `${50 + Math.cos(ang) * 38}%`;
      node.style.top = `${50 + Math.sin(ang) * 38}%`;
      node.innerHTML = `<span class="k">${a.kanji}</span><span class="n">${a.name}</span>`;
      node.onclick = () => {
        if (assignId) {
          // put it in the first empty slot, else slot 1
          let slot = g.abilities.slots.findIndex((s) => !s);
          if (slot < 0) slot = 0;
          g.abilities.slots[slot] = assignId;
          this.hud.toast({ text: `${a.name} → slot ${slot + 1}`, kind: 'good' });
          this.resume();
        } else {
          g.abilities.cast(id);
          this.resume();
        }
      };
      this.wheelRing.appendChild(node);
    }
    this.wheelEl.classList.add('open');
    document.body.classList.add('ui-open');
  }

  // ──────────────────────────────────────────────────────────────── input
  #hook() {
    bus.on(EV.DIALOGUE_OPEN, ({ npc }) => {
      this.state = 'panel';
      this.game.pause();
      document.body.classList.add('ui-open');
      this.panels.open('dialogue', npc);
    });
    bus.on(EV.DIALOGUE_CLOSE, () => {
      if (this.state === 'panel' && this.panels.current === 'dialogue') {
        this.panels.close();
        this.state = 'playing';
        document.body.classList.remove('ui-open');
        this.game.resume();
      }
    });
  }

  /** Called every frame from main.js; owns menu/panel keyboard routing. */
  update(dt) {
    const input = this.input;
    this.hud.update(dt);

    if (this.settingsEl.classList.contains('open')) {
      if (input.wasPressed('pause')) this.closeSettings();
      return;
    }
    if (input.wasPressed('pause')) {
      if (this.panels.isOpen || this.state === 'paused') this.resume();
      else if (this.state === 'playing') this.pause();
      else if (this.wheelEl.classList.contains('open')) this.resume();
    }
    if (this.state === 'panel' && this.panels.isOpen && input.wasPressed('pause')) return;

    if (this.state === 'playing') {
      if (input.wasPressed('character')) { this.panels.open('character'); this.state = 'panel'; this.game.pause(); document.body.classList.add('ui-open'); }
      else if (input.wasPressed('inventory')) { this.panels.open('inventory'); this.state = 'panel'; this.game.pause(); document.body.classList.add('ui-open'); }
      else if (input.wasPressed('questLog')) { this.panels.open('journal'); this.state = 'panel'; this.game.pause(); document.body.classList.add('ui-open'); }
      else if (input.wasPressed('map')) { this.panels.open('map'); this.state = 'panel'; this.game.pause(); document.body.classList.add('ui-open'); }
      else if (input.wasPressed('codex')) { this.panels.open('codex'); this.state = 'panel'; this.game.pause(); document.body.classList.add('ui-open'); }
      else if (input.wasPressed('abilityWheel')) this.openWheel();
      else if (input.wasPressed('hudToggle')) this.hud.setVisible(!this.hud.visible);
      else if (input.wasPressed('screenshot')) this.#screenshot();
    } else if (this.state === 'panel' && !this.panels.isOpen) {
      this.state = 'playing';
      document.body.classList.remove('ui-open');
      this.game.resume();
    }
  }

  // ───────────────────────────────────────────────────────────── desktop
  /**
   * Frameless window chrome. Only built inside the Electron shell — the web
   * build keeps the browser's own title bar.
   */
  #buildTitleBar() {
    const shell = globalThis.desktop;
    if (!shell) return;
    const bar = document.createElement('div');
    bar.className = 'titlebar';
    bar.innerHTML = `
      <div class="tb-drag">
        <span class="tb-mark">狐</span>
        <span class="tb-name">狐の悪魔 — Kitsuna no Akuma</span>
      </div>
      <div class="tb-buttons">
        <button class="tb-btn" data-act="min" title="Minimise" aria-label="Minimise"><svg viewBox="0 0 10 10"><path d="M0 5h10" /></svg></button>
        <button class="tb-btn" data-act="max" title="Maximise" aria-label="Maximise"><svg viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" /></svg></button>
        <button class="tb-btn close" data-act="close" title="Close" aria-label="Close"><svg viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" /></svg></button>
      </div>`;
    document.body.appendChild(bar);
    this.titleBar = bar;
    bar.querySelectorAll('[data-act]').forEach((b) => {
      b.onclick = () => {
        const act = b.dataset.act;
        if (act === 'min') shell.minimize();
        else if (act === 'max') shell.maximize();
        else if (act === 'close') shell.close();
      };
    });
    shell.onFullscreen?.((on) => bar.classList.toggle('hidden', !!on));
    document.body.classList.add('is-desktop');
  }

  /** Screenshot: through the shell when packaged, plain download on the web. */
  #screenshot() {
    const url = this.game.engine.screenshot?.();
    if (!url) return;
    if (globalThis.desktop?.screenshot) {
      globalThis.desktop.screenshot(url).then((file) => {
        this.hud.toast({ text: `Saved — ${String(file).split(/[\\/]/).pop()}`, kind: 'good', ttl: 2600 });
      });
    } else {
      const a = document.createElement('a');
      a.href = url; a.download = `kitsuna-${Date.now()}.png`; a.click();
    }
    this.hud.toast({ text: 'Shutter', kind: 'info', ttl: 1100 });
  }
}

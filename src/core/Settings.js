import { bus, EV } from './EventBus.js';
import { clamp } from './MathUtils.js';

const KEY = 'kitsuna.settings.v1';

/** Every action the player can bind. Order drives the controls list in the UI. */
export const ACTIONS = [
  { id: 'moveForward', label: 'Move Forward', cat: 'movement', keys: ['KeyW'], alt: ['ArrowUp'] },
  { id: 'moveBack', label: 'Move Back', cat: 'movement', keys: ['KeyS'], alt: ['ArrowDown'] },
  { id: 'moveLeft', label: 'Move Left', cat: 'movement', keys: ['KeyA'], alt: ['ArrowLeft'] },
  { id: 'moveRight', label: 'Move Right', cat: 'movement', keys: ['KeyD'], alt: ['ArrowRight'] },
  { id: 'sprint', label: 'Sprint', cat: 'movement', keys: ['ShiftLeft'] },
  { id: 'walk', label: 'Walk (slow)', cat: 'movement', keys: ['KeyC'] },
  { id: 'jump', label: 'Jump', cat: 'movement', keys: ['Space'] },
  { id: 'dodge', label: 'Dodge / Roll', cat: 'movement', keys: ['AltLeft'] },
  { id: 'lightAttack', label: 'Light Attack', cat: 'combat', keys: ['Mouse0'] },
  { id: 'heavyAttack', label: 'Heavy Attack', cat: 'combat', keys: ['Mouse2'] },
  { id: 'block', label: 'Guard / Parry', cat: 'combat', keys: ['Mouse1'] },
  { id: 'lockOn', label: 'Lock On', cat: 'combat', keys: ['KeyQ'] },
  { id: 'switchTarget', label: 'Cycle Target', cat: 'combat', keys: ['Tab'] },
  { id: 'sheath', label: 'Sheathe / Draw', cat: 'combat', keys: ['KeyX'] },
  { id: 'ability1', label: 'Ability 1', cat: 'abilities', keys: ['Digit1'] },
  { id: 'ability2', label: 'Ability 2', cat: 'abilities', keys: ['Digit2'] },
  { id: 'ability3', label: 'Ability 3', cat: 'abilities', keys: ['Digit3'] },
  { id: 'ability4', label: 'Ability 4', cat: 'abilities', keys: ['Digit4'] },
  { id: 'ability5', label: 'Ability 5', cat: 'abilities', keys: ['Digit5'] },
  { id: 'ability6', label: 'Ability 6', cat: 'abilities', keys: ['Digit6'] },
  { id: 'abilityWheel', label: 'Ability Wheel', cat: 'abilities', keys: ['KeyF'] },
  { id: 'kon', label: 'Kon — Fox Head', cat: 'abilities', keys: ['KeyR'] },
  { id: 'devilForm', label: 'Devil Form / Ultimate', cat: 'abilities', keys: ['KeyV'] },
  { id: 'interact', label: 'Interact / Talk', cat: 'world', keys: ['KeyE'] },
  { id: 'questLog', label: 'Quest Journal', cat: 'menus', keys: ['KeyJ'] },
  { id: 'character', label: 'Character & Skills', cat: 'menus', keys: ['KeyK'] },
  { id: 'inventory', label: 'Inventory & Crafting', cat: 'menus', keys: ['KeyI'] },
  { id: 'codex', label: 'Codex', cat: 'menus', keys: ['KeyN'] },
  { id: 'map', label: 'World Map', cat: 'menus', keys: ['KeyM'] },
  { id: 'pause', label: 'Pause / Menu', cat: 'menus', keys: ['Escape'] },
  { id: 'quickHeal', label: 'Quick Heal', cat: 'menus', keys: ['KeyH'] },
  { id: 'screenshot', label: 'Screenshot', cat: 'menus', keys: ['F9'] },
  { id: 'hudToggle', label: 'Hide HUD', cat: 'menus', keys: ['F3'] },
];

export const QUALITY_PRESETS = {
  low: {
    label: 'Low',
    renderScale: 0.7, shadows: false, shadowRes: 512, shadowDist: 40,
    foliage: 0.35, viewDistance: 120, fogDensity: 0.9, postFX: false,
    bloom: false, dof: false, grass: false, particles: 0.4, maxEnemies: 8, antialias: false,
  },
  medium: {
    label: 'Medium',
    renderScale: 0.9, shadows: true, shadowRes: 1024, shadowDist: 60,
    foliage: 0.7, viewDistance: 190, fogDensity: 1.0, postFX: true,
    bloom: true, dof: false, grass: true, particles: 0.75, maxEnemies: 14, antialias: false,
  },
  high: {
    label: 'High',
    renderScale: 1.0, shadows: true, shadowRes: 2048, shadowDist: 90,
    foliage: 1.0, viewDistance: 280, fogDensity: 1.0, postFX: true,
    bloom: true, dof: true, grass: true, particles: 1.0, maxEnemies: 20, antialias: true,
  },
  ultra: {
    label: 'Ultra',
    renderScale: 1.25, shadows: true, shadowRes: 4096, shadowDist: 130,
    foliage: 1.35, viewDistance: 380, fogDensity: 1.05, postFX: true,
    bloom: true, dof: true, grass: true, particles: 1.4, maxEnemies: 28, antialias: true,
  },
};

export const DEFAULT_SETTINGS = {
  video: {
    quality: 'high',
    renderScale: 1.0,
    shadows: true,
    shadowRes: 2048,
    shadowDist: 90,
    foliage: 1.0,
    grass: true,
    particles: 1.0,
    viewDistance: 280,
    fogDensity: 1.0,
    maxEnemies: 18,
    bloom: true,
    dof: true,
    postFX: true,
    antialias: true,
    vsync: true,
    fpsCap: 0,            // 0 = uncapped
    fov: 68,
    exposure: 1.0,
    darkness: 0.0,        // gamma lift for OLED/night play
    showFps: false,
  },
  audio: {
    master: 0.85,
    music: 0.6,
    sfx: 0.9,
    ambience: 0.7,
    ui: 0.7,
    duckDuringDialogue: true,
    muteOnBlur: true,
    spatialAudio: true,
    windAmbience: true,
    combatMusicIntensity: true,
  },
  controls: {
    sensitivityX: 1.0,
    sensitivityY: 1.0,
    invertY: false,
    controllerSensitivity: 1.0,
    vibration: true,
    aimAssist: 0.65,
    autoLockOn: false,
    cameraShake: 1.0,
    cameraDistance: 1.0,
    cameraHeight: 1.0,
    cameraCollision: true,
    toggleSprint: false,
    holdToGuard: false,
    buffering: 0.18,       // input buffer window in seconds
  },
  gameplay: {
    difficulty: 'adept',    // disciple | adept | demon | nightmare
    autoLoot: true,
    showDamageNumbers: true,
    showQuestMarkers: true,
    showEnemyHealth: true,
    hitStop: 1.0,
    gore: true,
    autoSave: true,
    autoSaveMinutes: 5,
    tutorialHints: true,
    subtitles: true,
    subtitleSize: 16,
    language: 'en',
  },
  accessibility: {
    highContrastNames: false,
    reduceFlashing: false,
    colorBlind: 'none',      // none | protanopia | deuteranopia | tritanopia
    largeText: false,
    screenReaderHints: false,
    holdToConfirm: false,
  },
  cloudflare: {
    // Everything needed to point this build at a Cloudflare Pages deployment.
    projectName: 'kitsuna-no-akuma',
    accountId: '',
    productionBranch: 'main',
    buildCommand: 'npm run build',
    outputDirectory: 'dist',
    deploymentUrl: '',
    customDomain: '',
    assetBaseUrl: '',        // CDN/R2 origin for assets, blank = same-origin
    pagesDevPort: 8788,
    enableOfflineCache: true,
    telemetryEndpoint: '',
  },
};

function deepMerge(base, patch) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object' && out[k] !== null) {
      out[k] = deepMerge(out[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

export class Settings {
  constructor() {
    this.data = deepMerge(DEFAULT_SETTINGS, this.#read());
    this.bindings = this.#readBindings();
    this.listeners = new Set();
  }

  #read() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
  }

  #readBindings() {
    const saved = this.#read().bindings || {};
    const out = {};
    for (const a of ACTIONS) {
      out[a.id] = (saved[a.id] && saved[a.id].length) ? saved[a.id].slice() : a.keys.slice();
    }
    return out;
  }

  get(section, key) { return this.data[section][key]; }

  set(section, key, value) {
    if (!(section in this.data)) return;
    const old = this.data[section][key];
    if (old === value) return;
    this.data[section][key] = value;
    this.save();
    bus.emit(EV.SETTINGS_CHANGE, { section, key, value, old });
    for (const fn of this.listeners) fn(section, key, value);
  }

  /** Apply a whole quality preset, respecting any manual overrides. */
  applyQuality(name) {
    const preset = QUALITY_PRESETS[name];
    if (!preset) return;
    for (const [k, v] of Object.entries(preset)) {
      if (k === 'label') continue;
      if (k in this.data.video) this.data.video[k] = v;
    }
    this.data.video.quality = name;
    this.save();
    bus.emit(EV.SETTINGS_CHANGE, { section: 'video', key: 'quality', value: name });
  }

  /** Bindings: { actionId: [code, ...] } */
  getBindings(actionId) { return this.bindings[actionId] || []; }

  setBinding(actionId, codes) {
    this.bindings[actionId] = [...codes];
    this.save();
  }

  resetBindings() {
    for (const a of ACTIONS) this.bindings[a.id] = a.keys.slice();
    this.save();
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...this.data, bindings: this.bindings }));
    } catch { /* storage disabled — settings stay in memory */ }
  }

  reset(section) {
    if (section) this.data[section] = deepMerge(DEFAULT_SETTINGS[section], {});
    else this.data = deepMerge(DEFAULT_SETTINGS, {});
    this.save();
    bus.emit(EV.SETTINGS_CHANGE, { section: section || 'all', key: '*', value: null });
  }

  export() { return JSON.stringify({ data: this.data, bindings: this.bindings }, null, 2); }

  import(json) {
    try {
      const parsed = typeof json === 'string' ? JSON.parse(json) : json;
      this.data = deepMerge(DEFAULT_SETTINGS, parsed.data || {});
      this.bindings = deepMerge(this.bindings, parsed.bindings || {});
      this.save();
      return true;
    } catch { return false; }
  }

  /** Clamped numeric helper for UI sliders. */
  static sanitize(section, key, value) {
    const limits = {
      'video.renderScale': [0.5, 2], 'video.fpsCap': [0, 240], 'video.fov': [55, 105],
      'video.exposure': [0.5, 1.8], 'video.darkness': [-0.3, 0.4], 'video.foliage': [0.1, 1.5],
      'video.viewDistance': [60, 420], 'video.particles': [0.1, 1.5],
      'audio.master': [0, 1], 'audio.music': [0, 1], 'audio.sfx': [0, 1],
      'audio.ambience': [0, 1], 'audio.ui': [0, 1],
      'controls.sensitivityX': [0.2, 3], 'controls.sensitivityY': [0.2, 3],
      'controls.controllerSensitivity': [0.2, 3], 'controls.aimAssist': [0, 1],
      'controls.cameraShake': [0, 2], 'controls.cameraDistance': [0.6, 1.6],
      'controls.cameraHeight': [0.6, 1.6], 'controls.buffering': [0, 0.4],
      'gameplay.hitStop': [0, 2], 'gameplay.subtitleSize': [12, 28],
    };
    const lim = limits[`${section}.${key}`];
    return lim ? clamp(value, lim[0], lim[1]) : value;
  }
}

/** Difficulty multipliers consumed by combat + AI. */
export const DIFFICULTIES = {
  disciple: {
    label: 'Disciple', blurb: 'Forgiving. Enemies hit softly, you heal quickly.',
    enemyDamage: 0.65, enemyHealth: 0.8, enemyPoise: 0.75, playerDamage: 1.15,
    regen: 1.0, staminaCost: 0.8, xp: 1.0, aggression: 0.75,
  },
  adept: {
    label: 'Adept', blurb: 'The intended contract. Read your enemies, punish openings.',
    enemyDamage: 1.0, enemyHealth: 1.0, enemyPoise: 1.0, playerDamage: 1.0,
    regen: 0.75, staminaCost: 1.0, xp: 1.15, aggression: 1.0,
  },
  demon: {
    label: 'Demon', blurb: 'Enemies chain combos, punish greed, and outnumber you.',
    enemyDamage: 1.45, enemyHealth: 1.35, enemyPoise: 1.4, playerDamage: 0.95,
    regen: 0.5, staminaCost: 1.15, xp: 1.45, aggression: 1.3,
  },
  nightmare: {
    label: 'Nightmare', blurb: 'One mistake is a funeral. The fox always collects.',
    enemyDamage: 2.1, enemyHealth: 1.9, enemyPoise: 1.9, playerDamage: 0.9,
    regen: 0.25, staminaCost: 1.3, xp: 2.0, aggression: 1.7,
  },
};

export const settings = new Settings();

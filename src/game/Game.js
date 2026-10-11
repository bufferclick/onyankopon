import * as THREE from 'three';
import { bus, EV } from '../core/EventBus.js';
import { DIFFICULTIES } from '../core/Settings.js';
import { clamp, clamp01, lerp, damp } from '../core/MathUtils.js';
import { World } from '../world/World.js';
import { Sky } from '../world/Sky.js';
import { Weather } from '../world/Weather.js';
import { VFX } from '../systems/VFX.js';
import { ProjectileSystem } from '../systems/ProjectileSystem.js';
import { CombatSystem } from '../systems/CombatSystem.js';
import { AbilitySystem } from '../systems/AbilitySystem.js';
import { QuestSystem } from '../systems/QuestSystem.js';
import { Spawner } from '../systems/Spawner.js';
import { ProgressionSystem } from '../systems/ProgressionSystem.js';
import { Player } from '../entities/Player.js';
import { FoxDevil } from '../entities/Fox.js';
import { Enemy } from '../entities/Enemy.js';
import { CameraRig } from '../entities/CameraRig.js';
import { POI_BY_ID, REGIONS, WORLD } from '../data/regions.js';
import { ITEM_BY_ID } from '../data/items.js';
import { NPC_BY_ID } from '../data/npcs.js';

const SAVE_KEY = 'kitsuna.save.v1';

/**
 * Game — owns the scene graph and the frame. Everything else is a system it
 * ticks: world streaming, weather, combat, abilities, quests, population and
 * the save file.
 */
export class Game {
  constructor({ engine, settings, input, assets, audio }) {
    this.engine = engine;
    this.settings = settings;
    this.input = input;
    this.assets = assets;
    this.audio = audio;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0708);
    this.time = 0;
    this.paused = false;
    this.started = false;
    this.inventory = new Map();
    this.equipment = { weapon: 'rusty_katana', armor: null, charm: null };
    this.difficulty = DIFFICULTIES[settings.get('gameplay', 'difficulty')] || DIFFICULTIES.adept;
    this.region = null;
    this.nearbyPoi = null;
    this.interactTarget = null;
    this.playTime = 0;
    this.saveTimer = 0;
    this.dayScale = 1;               // >1 for a faster day/night cycle (debug)
    this.deaths = 0;
    this.kills = 0;
    this._v = new THREE.Vector3();
  }

  // ─────────────────────────────────────────────────────────────── build
  async init(save = null) {
    const q = this.settings.data.video;
    this.scene.fog = new THREE.FogExp2(0x9fb0a4, 0.0032);

    this.sky = new Sky(this.scene, this.engine.renderer);
    this.sky.setQuality(this.settings.data.video);
    this.sky.setTime(0.34);

    this.world = new World(this.scene, {
      seed: WORLD.seed,
      quality: { foliage: q.foliage, grass: q.grass, viewDistance: q.viewDistance },
    });

    this.vfx = new VFX(this.scene);
    this.vfx.setQuality(clamp(this.settings.get('video', 'particles'), 0.3, 1.5));

    this.progression = save?.progression
      ? ProgressionSystem.fromJSON(save.progression)
      : new ProgressionSystem();
    this.progression.recompute();

    this.combat = new CombatSystem({
      world: this.world, vfx: this.vfx, audio: this.audio,
      progression: this.progression, settings: this.settings, engine: this.engine,
    });
    this.combat.setDifficulty(this.settings.get('gameplay', 'difficulty'));

    this.projectiles = new ProjectileSystem({
      world: this.world, combat: this.combat, vfx: this.vfx, audio: this.audio,
    });
    this.scene.add(this.projectiles.group);

    // ── player & camera ───────────────────────────────────────────────
    this.cameraRig = new CameraRig(this.engine.camera, this.world, this.settings);
    this.player = new Player({
      world: this.world, cameraRig: this.cameraRig, input: this.input,
      settings: this.settings, combat: this.combat, vfx: this.vfx,
      audio: this.audio, engine: this.engine, progression: this.progression,
    });
    this.combat.add(this.player);
    this.scene.add(this.player.root);

    const start = save?.position
      ? new THREE.Vector3(save.position.x, 0, save.position.z)
      : new THREE.Vector3(POI_BY_ID.kawa_village.pos[0], 0, POI_BY_ID.kawa_village.pos[1] + 18);
    start.y = this.world.heightAt(start.x, start.z) + 0.1;
    this.player.position.copy(start);
    this.player.startPosition.copy(start);
    this.player.spawnPoint = start.clone();
    this.cameraRig.snap(start, Math.PI);

    // ── the fox ───────────────────────────────────────────────────────
    this.fox = new FoxDevil({
      scene: this.scene, assets: this.assets, vfx: this.vfx, audio: this.audio,
      world: this.world, progression: this.progression,
    });
    await this.fox.load();
    this.fox.setStage(this.progression.mutationStage);
    this.fox.position.copy(start).add(new THREE.Vector3(-1.5, 0, -2));
    this.scene.add(this.fox.group);

    this.abilities = new AbilitySystem({
      player: this.player, fox: this.fox, combat: this.combat, vfx: this.vfx,
      audio: this.audio, world: this.world, projectiles: this.projectiles,
      progression: this.progression, engine: this.engine, cameraRig: this.cameraRig,
      spawnAlly: (kind, pos, duration, damage) => this.spawnAlly(kind, pos, duration, damage),
    });
    this.player.abilitySystem = this.abilities;

    this.quests = new QuestSystem({ progression: this.progression, game: this });
    this.spawner = new Spawner({ world: this.world, combat: this.combat, game: this });
    this.weather = new Weather(this.scene, this.world, this.sky, this.audio);

    // ── npc markers & interactables ───────────────────────────────────
    this.#buildInteractables();

    this.engine.setScene(this.scene);
    this.engine.onUpdate((dt) => this.update(dt));

    this.#hookEvents();
    if (save) {
      this.quests.fromJSON(save.quests);
      this.inventory = new Map(save.inventory || []);
      this.equipment = { ...this.equipment, ...(save.equipment || {}) };
      this.playTime = save.playTime || 0;
      this.sky.setTime(save.timeOfDay ?? 0.34);
    } else {
      // tutorial quests auto-start
      for (const q of this.quests.all) {
        if (q.autoStart && this.quests.isUnlocked(q)) this.quests.start(q.id);
      }
      this.#starterKit();
    }
    this.weather.set(this.weather.pickFor(this.regionAt(start)), { instant: true });
    return this;
  }

  #starterKit() {
    this.giveItem('rusty_katana', 1);
    this.giveItem('rice_ball', 5);
    this.giveItem('salt_packet', 2);
    this.equipment.weapon = 'rusty_katana';
    this.progression.unlockedAbilities.add('kon');
  }

  #hookEvents() {
    bus.on(EV.KILL, ({ target, source }) => {
      if (source?.isPlayer) this.onEnemyKilled(target);
    });
    bus.on(EV.HIT, ({ target, dmg }) => {
      if (dmg > 0 && target?.isPlayer) this.engine.flashDamage(clamp01(dmg / 60));
    });
    bus.on(EV.PLAYER_DIED, () => { this.deaths = (this.deaths || 0) + 1; });
    bus.on(EV.LEVEL_UP, () => {
      this.audio.play('level_up', { volume: 0.9, bus: 'ui' });
      this.vfx.aura(this.player.position, { color: 0xffe9a8, size: 3.5, dur: 1.2 });
    });
    bus.on(EV.MUTATION, ({ stage }) => {
      this.fox.setStage(stage);
      this.audio.play('mutation', { volume: 1 });
      this.engine.aberration(1.8);
      this.engine.shake(1.2);
      this.vfx.aura(this.player.position, { color: 0xff7a2a, size: 6, dur: 2 });
    });
    bus.on(EV.SAVE, () => this.save());
  }

  #buildInteractables() {
    this.interactables = [];
    for (const npc of Object.values(NPC_BY_ID || {})) {
      const poi = npc.poi && POI_BY_ID[npc.poi];
      if (!poi) continue;
      this.interactables.push({
        kind: 'npc', id: npc.id, name: npc.name,
        position: new THREE.Vector3(poi.pos[0], this.world.heightAt(poi.pos[0], poi.pos[1]), poi.pos[1]),
        radius: 3.2,
      });
    }
    for (const poi of Object.values(POI_BY_ID)) {
      if (poi.t === 'shrine' || poi.t === 'altar' || poi.t === 'camp' || poi.t === 'bell' || poi.t === 'well') {
        this.interactables.push({
          kind: poi.t, id: poi.id, name: poi.name,
          position: new THREE.Vector3(poi.pos[0], this.world.heightAt(poi.pos[0], poi.pos[1]), poi.pos[1]),
          radius: 4.5,
        });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────── world
  regionAt(pos) {
    let best = null, bestScore = -1;
    for (const r of REGIONS) {
      const d = Math.hypot(pos.x - r.center[0], pos.z - r.center[1]);
      const score = 1 - d / (r.r * 1.6);
      if (score > bestScore) { bestScore = score; best = r; }
    }
    return bestScore > 0 ? best : REGIONS[0];
  }

  poiAt(pos) {
    let best = null, bestD = 1e9;
    for (const poi of Object.values(POI_BY_ID)) {
      const d = Math.hypot(pos.x - poi.pos[0], pos.z - poi.pos[1]);
      if (d < (poi.r || 30) && d < bestD) { bestD = d; best = poi; }
    }
    return best;
  }

  // ────────────────────────────────────────────────────────────── update
  update(dt) {
    if (!this.started) return;
    const scaled = dt * this.engine.timeScale;
    this.time += scaled;
    this.playTime += scaled;

    const p = this.player;

    // ── camera look ───────────────────────────────────────────────────
    const look = this.input.takeLook(this.settings.get('controls', 'sensitivityX'), this.settings.get('controls', 'sensitivityY'));
    if (look.dx || look.dy) this.cameraRig.addLook(look.dx, look.dy);

    // ── systems ───────────────────────────────────────────────────────
    p.update(scaled);
    this.combat.update(scaled);
    this.projectiles.update(scaled);
    this.abilities.update(scaled);
    this.quests.update(scaled);
    this.progression.updateBuffs(scaled);
    this.vfx.update(scaled);
    this.fox.update(scaled, p, this.combat);

    for (const e of this.spawner.enemies) e.update(scaled);
    this.spawner.update(scaled, p.position, this.progression.level);
    this.spawner.maybeSpawnPoiEnemies(p.position);

    // ── world streaming & sky ─────────────────────────────────────────
    this.world.update(scaled, p.position, this.settings.get('video', 'viewDistance'));
    this.sky.update(scaled * this.dayScale, p.position);
    this.weather.update(scaled, this.engine.camera, this.region);

    // ── camera (after everything moved) ───────────────────────────────
    this.cameraRig.update(scaled, {
      position: p.position, velocity: p.velocity, speed: p.speed,
      grounded: p.grounded, facing: p.facing, sprinting: this.input.isDown('sprint'),
    });
    this.audio.updateListener(this.engine.camera);

    // ── world state: region, POI, music ───────────────────────────────
    const region = this.regionAt(p.position);
    if (region !== this.region) {
      this.region = region;
      bus.emit(EV.REGION_ENTER, { region });
      this.weather.set(this.weather.pickFor(region));
      this.sky.setFog(this.scene, new THREE.Color(region.palette?.fog ?? 0x9fb0a4), this.settings.get('video', 'fogDensity'));
      this.world.setFogColor(new THREE.Color(region.palette?.fog ?? 0x9fb0a4));
      if (this.scene.fog) this.scene.fog.color.setHex(region.palette?.fog ?? 0x9fb0a4);
    }
    const poi = this.poiAt(p.position);
    if (poi && poi !== this.nearbyPoi) {
      this.nearbyPoi = poi;
      if (!this.quests.discovered.has(poi.id)) {
        this.quests.onDiscover(poi.id);
        bus.emit(EV.DISCOVERY, { poi: poi.id, name: poi.name });
        this.audio.play('discovery', { volume: 0.7, bus: 'ui' });
      }
    } else if (!poi) this.nearbyPoi = null;

    this.#interaction(scaled);
    this.#music(scaled);
    this.#abilityInput();

    // ── autosave ──────────────────────────────────────────────────────
    this.saveTimer += scaled;
    if (this.settings.get('gameplay', 'autoSave') && this.saveTimer > this.settings.get('gameplay', 'autoSaveMinutes') * 60) {
      this.saveTimer = 0;
      this.save();
    }

    // ── respawn ───────────────────────────────────────────────────────
    if (!p.alive && p.respawnTimer <= 0) {
      const at = this.nearestShrine || p.spawnPoint;
      p.respawn(at);
      this.engine.fadeTo(0x000000, 0);
      this.cameraRig.snap(at, p.facing);
      for (const e of this.spawner.enemies) if (e.alive) { e.aggro = false; e.awareness = 0; e.state = 'return'; }
    }
  }

  #interaction(dt) {
    const p = this.player;
    let best = null, bestD = 1e9;
    for (const it of this.interactables) {
      const d = p.position.distanceTo(it.position);
      if (d < it.radius + 1.5 && d < bestD) { bestD = d; best = it; }
    }
    if (best !== this.interactTarget) {
      this.interactTarget = best;
      bus.emit(EV.TOAST, best ? { text: `Speak with ${best.name}`, kind: 'hint', sticky: true } : { text: '', kind: 'hint', clear: true });
    }
    if (best && this.input.consume('interact', 0.3)) this.interact(best);
  }

  interact(target) {
    if (target.kind === 'npc') {
      bus.emit(EV.DIALOGUE_OPEN, { npc: target.id });
    } else if (target.kind === 'shrine' || target.kind === 'altar') {
      this.rest(target);
    } else if (target.kind === 'camp') {
      this.rest(target);
    } else if (target.kind === 'well' || target.kind === 'bell') {
      bus.emit(EV.TOAST, { text: target.name, kind: 'info' });
    }
  }

  /** Rest: heal, refill, advance time to dawn, save, and set the respawn. */
  rest(target) {
    const p = this.player;
    p.health = p.maxHealth;
    p.stamina = p.maxStamina;
    p.focus = p.maxFocus;
    p.poise = p.poiseMax;
    this.nearestShrine = target.position.clone();
    this.sky.setTime(0.26);
    this.vfx.aura(p.position, { color: 0xffe9a8, size: 3, dur: 1.4 });
    this.audio.play('heal_chime', { volume: 0.7, position: p.position });
    bus.emit(EV.TOAST, { text: 'You rest. The fox does not.', kind: 'good' });
    this.save();
  }

  #music() {
    const intensity = this.combat.intensity;
    this.audio.setIntensity?.(intensity);
    const boss = this.spawner.enemies.find((e) => e.alive && e.isBoss && e.aggro);
    const want = boss ? 'boss' : this.sky.isNight ? 'night' : this.region?.music || 'day';
    if (want !== this._music) {
      this._music = want;
      this.audio.setMusic(want, { fade: 2.2 });
    }
  }

  #abilityInput() {
    const slotIds = this.abilities.slots;
    for (let i = 1; i <= 6; i++) {
      if (this.input.consume(`ability${i}`, 0.2)) {
        const id = slotIds[i - 1];
        if (id) this.abilities.cast(id);
      }
    }
    if (this.input.consume('kon', 0.25)) {
      const useDevour = this.input.isDown('sprint') && this.progression.hasAbility('kon_devour');
      this.abilities.cast(useDevour ? 'kon_devour' : 'kon');
    }
    if (this.input.consume('devilForm', 0.25)) {
      const ult = this.progression.hasAbility('onryo_release') ? 'onryo_release' : null;
      if (ult) this.abilities.cast(ult);
      else this.player.setDevilForm(!this.player.devilForm);
    }
    if (this.input.consume('quickHeal', 0.2)) this.quickHeal();
  }

  // ────────────────────────────────────────────────────────────── items
  giveItem(id, count = 1) {
    if (!ITEM_BY_ID[id]) return 0;
    this.inventory.set(id, (this.inventory.get(id) || 0) + count);
    bus.emit(EV.LOOT, { item: id, count, total: this.inventory.get(id) });
    bus.emit(EV.CURRENCY, {});
    return count;
  }

  takeItem(id, count = 1) {
    const have = this.inventory.get(id) || 0;
    if (have < count) return false;
    this.inventory.set(id, have - count);
    if (this.inventory.get(id) <= 0) this.inventory.delete(id);
    return true;
  }

  useItem(id) {
    const def = ITEM_BY_ID[id];
    if (!def || !this.inventory.get(id)) return false;
    const use = def.use;
    if (use?.effect === 'heal') {
      this.player.restoreHealth(this.player.maxHealth * (use.pct || 0.3));
      this.vfx.aura(this.player.position, { color: 0x8fd18a, size: 2, dur: 0.8 });
      this.audio.play('heal_chime', { volume: 0.6 });
    } else if (use?.effect === 'focus') {
      this.player.focus = this.player.maxFocus;
      this.audio.play('spirit_cast', { volume: 0.6 });
    } else if (use?.effect === 'cure') {
      for (const s of [...this.player.statuses.keys()]) this.player.removeStatus(s);
      this.audio.play('buff_apply', { volume: 0.6 });
    } else if (use?.effect === 'ward') {
      this.player.addStatus('warded', { duration: use.duration || 60 });
      this.audio.play('buff_apply', { volume: 0.6 });
    } else if (def.type === 'weapon' || def.type === 'armor' || def.type === 'charm') {
      this.equip(id);
      return true;
    }
    this.takeItem(id, 1);
    bus.emit(EV.ITEM_USED, { item: id });
    return true;
  }

  equip(id) {
    const def = ITEM_BY_ID[id];
    if (!def) return false;
    if (def.type === 'weapon') this.equipment.weapon = id;
    else if (def.type === 'armor') this.equipment.armor = id;
    else if (def.type === 'charm') this.equipment.charm = id;
    this.progression.equipmentMods = this.#equipmentMods();
    this.progression.recompute();
    this.audio.play('equip', { volume: 0.7 });
    bus.emit(EV.EQUIP, { item: id });
    return true;
  }

  #equipmentMods() {
    const mods = { statAdd: {}, statMul: {}, attrAdd: {} };
    for (const id of Object.values(this.equipment)) {
      const def = id && ITEM_BY_ID[id];
      if (!def) continue;
      if (def.weapon) {
        mods.statAdd.physicalPower = (mods.statAdd.physicalPower || 0) + def.weapon.power;
        mods.statMul.attackSpeed = (mods.statMul.attackSpeed || 0) + (def.weapon.speed - 1);
        mods.statAdd.critChance = (mods.statAdd.critChance || 0) + (def.weapon.crit || 0) * 100;
        mods.statAdd.poise = (mods.statAdd.poise || 0) + (def.weapon.poise || 0);
      }
      if (def.armor) {
        mods.statAdd.defense = (mods.statAdd.defense || 0) + (def.armor.defense || 0);
        mods.statAdd.spiritDefense = (mods.statAdd.spiritDefense || 0) + (def.armor.spirit || 0);
        mods.statMul.moveSpeed = (mods.statMul.moveSpeed || 0) + ((def.armor.weight ? 1 - def.armor.weight * 0.02 : 0));
      }
      if (def.mods) {
        for (const [k, v] of Object.entries(def.mods.attrAdd || {})) mods.attrAdd[k] = (mods.attrAdd[k] || 0) + v;
        for (const [k, v] of Object.entries(def.mods.statAdd || {})) mods.statAdd[k] = (mods.statAdd[k] || 0) + v;
        for (const [k, v] of Object.entries(def.mods.statMul || {})) mods.statMul[k] = (mods.statMul[k] || 0) + v;
      }
    }
    return mods;
  }

  quickHeal() {
    const options = ['rice_ball', 'cucumber', 'venison'].filter((id) => this.inventory.get(id));
    if (this.player.health >= this.player.maxHealth * 0.98) return;
    if (!options.length) {
      bus.emit(EV.TOAST, { text: 'Nothing to eat', kind: 'warn' });
      return;
    }
    this.useItem(options[0]);
  }

  // ─────────────────────────────────────────────────────────── combat ──
  onEnemyKilled(enemy) {
    this.kills = (this.kills || 0) + 1;
    const def = enemy.def;
    if (!def) return;
    const level = enemy.level;

    // rewards
    const xp = Math.round((enemy.xpValue || 10) * (def.boss ? 3 : 1));
    this.progression.addXp(xp, `kill:${def.id}`);
    this.progression.addFoxXp(Math.round(xp * (def.boss ? 0.8 : 0.35)));
    const gold = enemy.goldValue ? Math.round((enemy.goldValue[0] + Math.random() * (enemy.goldValue[1] - enemy.goldValue[0]))) : 0;
    if (gold) {
      this.progression.addGold(gold);
      this.audio.play('coin_pickup', { volume: 0.4, position: enemy.position });
    }
    if (enemy.essenceValue) this.progression.addEssence(enemy.essenceValue);

    // loot
    const drops = def.drops || [];
    const gotten = [];
    for (const d of drops) {
      if (Math.random() < d.chance) {
        const count = d.count ? d.count[0] + Math.floor(Math.random() * (d.count[1] - d.count[0] + 1)) : 1;
        this.giveItem(d.item, count);
        gotten.push({ item: d.item, count });
      }
    }
    if (this.settings.get('gameplay', 'autoLoot') && gotten.length) {
      bus.emit(EV.TOAST, { text: gotten.map((g) => `${ITEM_BY_ID[g.item]?.name ?? g.item}${g.count > 1 ? ` ×${g.count}` : ''}`).join(', '), kind: 'loot' });
    }
    if (def.boss) {
      this.audio.play('boss_death', { volume: 1 });
      this.engine.shake(1.4);
      bus.emit(EV.TOAST, { text: `${def.name} falls`, kind: 'epic' });
      this.progression.flags[`boss_${def.id}`] = true;
    }
    bus.emit(EV.LOOT, { item: null, count: 0, from: def.id });
  }

  /** Summoned spirit foxes (Kuchiyose / Kuda Scout). They fight for you. */
  spawnAlly(kind, pos, duration = 20, damage = 10) {
    const def = kind === 'scout' ? ALLY_SCOUT : ALLY_FOX;
    const ally = new Enemy({
      def, level: this.progression.level, position: pos, world: this.world,
      ctx: {
        combat: this.combat, vfx: this.vfx, audio: this.audio, projectiles: this.projectiles,
        world: this.world, player: this.player, ally: true,
        difficulty: this.settings.get('gameplay', 'difficulty'),
        spawnEnemy: (i, l, p, o) => this.spawner.spawn(i, l, p, o),
        onDeath: () => {},
      },
    });
    ally.faction = 'player';
    ally.isSummon = true;
    ally.damage = Math.max(ally.damage, damage);
    ally.ttl = duration;
    this.scene.add(ally.root);
    this.combat.add(ally);
    this.spawner.enemies.push(ally);
    this.vfx.summonCircle(pos, { color: 0xffa53c, radius: 2.2, dur: 0.9 });
    return ally;
  }

  // ─────────────────────────────────────────────────────────────── save
  save() {
    const data = {
      version: 1,
      savedAt: Date.now(),
      playTime: this.playTime,
      position: { x: this.player.position.x, y: this.player.position.y, z: this.player.position.z },
      timeOfDay: this.sky.time,
      progression: this.progression.toJSON(),
      quests: this.quests.toJSON(),
      inventory: [...this.inventory],
      equipment: this.equipment,
      difficulty: this.settings.get('gameplay', 'difficulty'),
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      bus.emit(EV.TOAST, { text: 'Contract recorded', kind: 'info' });
      return true;
    } catch (err) {
      console.warn('[save] failed', err);
      return false;
    }
  }

  static load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  /** Apply a save to an already-constructed game (the title screen path). */
  loadInto(save) {
    if (!save) return;
    if (save.progression) {
      this.progression = ProgressionSystem.fromJSON(save.progression);
      this.progression.recompute();
      this.player.progression = this.progression;
      this.combat.progression = this.progression;
      this.abilities.progression = this.progression;
      this.quests.progression = this.progression;
      this.fox.progression = this.progression;
      this.fox.setStage(this.progression.mutationStage);
    }
    if (save.quests) this.quests.fromJSON(save.quests);
    this.inventory = new Map(save.inventory || []);
    this.equipment = { weapon: 'rusty_katana', armor: null, charm: null, ...(save.equipment || {}) };
    this.playTime = save.playTime || 0;
    if (save.position) {
      const at = new THREE.Vector3(save.position.x, 0, save.position.z);
      at.y = this.world.heightAt(at.x, at.z) + 0.2;
      this.player.position.copy(at);
      this.player.spawnPoint.copy(at);
      this.cameraRig.snap(at, this.player.facing);
    }
    if (typeof save.timeOfDay === 'number') this.sky.setTime(save.timeOfDay);
    this.progression.equipmentMods = this.#equipmentMods();
    this.progression.recompute();
  }

  static hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
  }

  static clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  }

  start() {
    this.started = true;
    this.engine.start();
    bus.emit(EV.GAME_START, { game: this });
  }

  pause() {
    this.paused = true;
    this.engine.timeScale = 0;
    this.input.setPaused?.(true);
    bus.emit(EV.GAME_PAUSE, {});
  }

  resume() {
    this.paused = false;
    this.engine.timeScale = 1;
    this.input.setPaused?.(false);
    bus.emit(EV.GAME_RESUME, {});
  }

  dispose() {
    this.started = false;
    this.engine.stop();
    this.world?.dispose();
    this.vfx?.clear();
    this.projectiles?.dispose();
    this.spawner?.clear();
    this.weather?.dispose();
  }
}

// Summon definitions (kept local: they are allies, not citizens of the bestiary)
const ALLY_FOX = {
  id: 'spirit_fox', name: 'Spirit Fox', kanji: '霊狐', tier: 'minion', level: [1, 60],
  health: 90, damage: 12, poise: 10, speed: 5.2, xp: 0, gold: null,
  appearance: { height: 0.8, build: 'beast', skin: 0xd8622a, cloth: 0xd8622a, accent: 0x8ad8ff, head: 'kitsune', tails: 3, aura: 0x8ad8ff },
  ai: { profile: 'melee', range: 2.0, aggression: 1.0, attackRate: 1.2, float: false },
  drops: [], regions: [],
};
const ALLY_SCOUT = {
  id: 'scout_fox', name: 'Scout Fox', kanji: '偵察狐', tier: 'minion', level: [1, 60],
  health: 40, damage: 6, poise: 4, speed: 6.4, xp: 0, gold: null,
  appearance: { height: 0.5, build: 'beast', skin: 0xe8b06a, cloth: 0xe8b06a, accent: 0xffffff, head: 'kitsune', tails: 1, aura: 0xffe9a8 },
  ai: { profile: 'melee', range: 1.6, aggression: 0.9, attackRate: 1.6 },
  drops: [], regions: [],
};

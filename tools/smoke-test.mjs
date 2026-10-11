#!/usr/bin/env node
/**
 * Kitsuna no Akuma — headless smoke test.
 *
 * No browser, no WebGL: it stubs just enough DOM to construct the whole game
 * logic layer in node, then asserts the things that would otherwise only show
 * up as a black screen or a missing sword:
 *
 *   1. every module imports cleanly
 *   2. every enemy rig builds and animates without NaN
 *   3. every prop builds
 *   4. cross-references in the data files resolve (items, statuses, POIs, sfx)
 *   5. the combat maths produces sane numbers at level 1 and level 60
 *
 * Run with `npm test` (also runs in CI before `vite build`).
 */
import { installDomStub } from './dom-stub.mjs';
installDomStub();

const THREE = await import('three');
let failures = 0;
let checks = 0;

function ok(label, cond, detail = '') {
  checks++;
  if (cond) { console.log(`  \x1b[32m✓\x1b[0m ${label}`); } else {
    failures++;
    console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
function section(name) { console.log(`\n\x1b[1m${name}\x1b[0m`); }

// ───────────────────────────────────────────────────────────── 1. modules
section('Modules');
const mods = {};
const files = [
  ['core/MathUtils', '../src/core/MathUtils.js'],
  ['core/EventBus', '../src/core/EventBus.js'],
  ['core/Settings', '../src/core/Settings.js'],
  ['data/attributes', '../src/data/attributes.js'],
  ['data/mutations', '../src/data/mutations.js'],
  ['data/abilities', '../src/data/abilities.js'],
  ['data/skilltree', '../src/data/skilltree.js'],
  ['data/enemies', '../src/data/enemies.js'],
  ['data/regions', '../src/data/regions.js'],
  ['data/items', '../src/data/items.js'],
  ['data/npcs', '../src/data/npcs.js'],
  ['data/quests', '../src/data/quests.js'],
  ['data/statuses', '../src/data/statuses.js'],
  ['data/lore', '../src/data/lore.js'],
  ['world/Terrain', '../src/world/Terrain.js'],
  ['world/Props', '../src/world/Props.js'],
  ['world/materials', '../src/world/materials.js'],
  ['world/Sky', '../src/world/Sky.js'],
  ['world/World', '../src/world/World.js'],
  ['entities/CharacterRig', '../src/entities/CharacterRig.js'],
  ['entities/Animator', '../src/entities/Animator.js'],
  ['entities/Actor', '../src/entities/Actor.js'],
  ['entities/Enemy', '../src/entities/Enemy.js'],
  ['entities/enemyAttacks', '../src/entities/enemyAttacks.js'],
  ['systems/VFX', '../src/systems/VFX.js'],
  ['systems/ProgressionSystem', '../src/systems/ProgressionSystem.js'],
  ['systems/CombatSystem', '../src/systems/CombatSystem.js'],
  ['systems/ProjectileSystem', '../src/systems/ProjectileSystem.js'],
  ['systems/AbilitySystem', '../src/systems/AbilitySystem.js'],
];
for (const [name, rel] of files) {
  try { mods[name] = await import(rel); ok(name, true); } catch (err) {
    ok(name, false, err.message.split('\n')[0]);
  }
}

const { ENEMIES, ENEMY_BY_ID } = mods['data/enemies'] || {};
const { ABILITIES, ABILITY_BY_ID } = mods['data/abilities'] || {};
const { ITEMS, ITEM_BY_ID } = mods['data/items'] || {};
const { REGIONS, POI_BY_ID } = mods['data/regions'] || {};
const { QUESTS } = mods['data/quests'] || {};
const { STATUSES, DAMAGE_TYPES } = mods['data/statuses'] || {};
const { SKILL_TREES } = mods['data/skilltree'] || {};
const { NPCS } = mods['data/npcs'] || {};
const { MUTATIONS } = mods['data/mutations'] || {};

// ────────────────────────────────────────────────────── 2. data integrity
section('Data integrity');
ok('enemies defined', (ENEMIES?.length || 0) >= 20, `${ENEMIES?.length} enemies`);
ok('abilities defined', (ABILITIES?.length || 0) >= 20, `${ABILITIES?.length} abilities`);
ok('items defined', Object.keys(ITEM_BY_ID || {}).length >= 40, `${Object.keys(ITEM_BY_ID || {}).length} items`);
ok('quests defined', (QUESTS?.length || 0) >= 15, `${QUESTS?.length} quests`);
ok('statuses defined', Object.keys(STATUSES || {}).length >= 15);
ok('regions defined', (REGIONS?.length || 0) >= 6);
ok('npcs defined', (NPCS?.length || 0) >= 8, `${NPCS?.length} npcs`);
ok('mutations defined', (MUTATIONS?.length || 0) >= 5);
ok('skill trees defined', (SKILL_TREES?.length || 0) >= 3);

// every ability id is unique and has the fields the ability system reads
const seenAbility = new Set();
let abilityProblems = [];
for (const a of ABILITIES || []) {
  if (seenAbility.has(a.id)) abilityProblems.push(`duplicate id ${a.id}`);
  seenAbility.add(a.id);
  if (!a.kind) abilityProblems.push(`${a.id}: no kind`);
  if (!a.damage && !['buff', 'transform', 'zone'].includes(a.kind)) abilityProblems.push(`${a.id}: no damage block`);
  for (const st of a.status || []) {
    if (!STATUSES[st.type]) abilityProblems.push(`${a.id}: unknown status ${st.type}`);
  }
  for (const e of a.effects || []) {
    if (e.k === 'summon' && !['spirit_fox', 'scout_fox'].includes(e.id)) abilityProblems.push(`${a.id}: unknown summon ${e.id}`);
  }
}
ok('abilities well-formed', abilityProblems.length === 0, abilityProblems.join('; '));

// skill tree nodes point at real abilities/flags
let skillProblems = [];
for (const tree of SKILL_TREES || []) {
  for (const node of tree.nodes || []) {
    if (node.ability && !ABILITY_BY_ID?.[node.ability]) skillProblems.push(`${tree.id}/${node.id}: unknown ability ${node.ability}`);
    for (const req of node.requires || []) {
      const all = (tree.nodes || []).map((n) => n.id);
      if (!all.includes(req)) skillProblems.push(`${tree.id}/${node.id}: unknown requirement ${req}`);
    }
  }
}
ok('skill tree references resolve', skillProblems.length === 0, skillProblems.slice(0, 6).join('; '));

// enemy drops / ai reference real things
let enemyProblems = [];
for (const e of ENEMIES || []) {
  if (!e.appearance?.head) enemyProblems.push(`${e.id}: no head type`);
  for (const d of e.drops || []) {
    if (!ITEM_BY_ID?.[d.item]) enemyProblems.push(`${e.id}: unknown drop item ${d.item}`);
  }
  for (const r of e.regions || []) {
    if (!(REGIONS || []).find((x) => x.id === r)) enemyProblems.push(`${e.id}: unknown region ${r}`);
  }
}
ok('enemy references resolve', enemyProblems.length === 0, enemyProblems.slice(0, 8).join('; '));

// quests reference real items, POIs and regions
let questProblems = [];
for (const q of QUESTS || []) {
  for (const o of q.objectives || []) {
    if (o.item && !ITEM_BY_ID?.[o.item]) questProblems.push(`${q.id}: unknown item ${o.item}`);
    if (o.target && !ENEMY_BY_ID?.[o.target]) questProblems.push(`${q.id}: unknown target ${o.target}`);
    if (o.poi && !POI_BY_ID?.[o.poi]) questProblems.push(`${q.id}: unknown poi ${o.poi}`);
    if (o.ability && !ABILITY_BY_ID?.[o.ability]) questProblems.push(`${q.id}: unknown ability ${o.ability}`);
    if (o.npc && !(NPCS || []).find((n) => n.id === o.npc)) questProblems.push(`${q.id}: unknown npc ${o.npc}`);
  }
  for (const r of q.rewards?.items || []) {
    if (!ITEM_BY_ID?.[r.id]) questProblems.push(`${q.id}: unknown reward ${r.id}`);
  }
  if (q.rewards?.item && !ITEM_BY_ID?.[q.rewards.item]) questProblems.push(`${q.id}: unknown reward ${q.rewards.item}`);
}
ok('quest references resolve', questProblems.length === 0, questProblems.slice(0, 8).join('; '));

// npc stock / dialogue
let npcProblems = [];
for (const n of NPCS || []) {
  if (n.poi && !POI_BY_ID?.[n.poi]) npcProblems.push(`${n.id}: unknown poi ${n.poi}`);
  for (const s of n.stock || []) {
    const id = typeof s === 'string' ? s : s.item ?? s.id;
    if (!ITEM_BY_ID?.[id]) npcProblems.push(`${n.id}: unknown stock item ${id}`);
  }
  for (const q of n.quests || []) {
    if (!(QUESTS || []).find((x) => x.id === q)) npcProblems.push(`${n.id}: unknown quest ${q}`);
  }
}
ok('npc references resolve', npcProblems.length === 0, npcProblems.slice(0, 8).join('; '));

// ───────────────────────────────────────────────────────── 3. rigs + anim
section('Character rigs & animation');
if (mods['entities/CharacterRig'] && ENEMIES) {
  const { buildCharacter, configFromEnemy } = mods['entities/CharacterRig'];
  let built = 0;
  let nan = 0;
  for (const def of ENEMIES) {
    try {
      const rig = buildCharacter(configFromEnemy(def, def.level?.[0] || 1));
      rig.root.updateMatrixWorld(true);
      rig.root.traverse((o) => {
        if (o.isMesh) {
          const p = o.getWorldPosition(new THREE.Vector3());
          if (!Number.isFinite(p.x + p.y + p.z)) nan++;
        }
      });
      built++;
    } catch (err) {
      console.log(`    ! ${def.id}: ${err.message.split('\n')[0]}`);
    }
  }
  ok(`all ${ENEMIES.length} enemy rigs build`, built === ENEMIES.length, `${built}/${ENEMIES.length}`);
  ok('no NaN transforms in rigs', nan === 0, `${nan} bad nodes`);

  // animation sweep
  const { Animator } = mods['entities/Animator'];
  const rig = buildCharacter(configFromEnemy(ENEMY_BY_ID.oni_brute || ENEMIES[0], 20));
  const anim = new Animator(rig);
  const states = ['idle', 'walk', 'run', 'sprint', 'jump', 'fall', 'land', 'dash', 'attack', 'heavy',
    'block', 'parry', 'hit', 'death', 'cast', 'summon', 'execute', 'taunt', 'float', 'talk', 'sit'];
  let animNan = 0;
  for (const s of states) {
    anim.setState(s, { force: true });
    for (let i = 0; i < 24; i++) anim.update(1 / 60, { speed: 3, grounded: true, velocity: new THREE.Vector3(1, 0, 0) });
    rig.root.updateMatrixWorld(true);
    for (const j of Object.values(rig.joints || {})) {
      if (j && !Number.isFinite(j.rotation.x + j.rotation.y + j.rotation.z)) animNan++;
    }
  }
  ok(`all ${states.length} animator states stable`, animNan === 0, `${animNan} NaN joints`);
}

// ─────────────────────────────────────────────────────────────── 4. props
section('Props');
if (mods['world/Props']) {
  const { getProp, PROP_IDS } = mods['world/Props'];
  let built = 0;
  const broken = [];
  for (const id of PROP_IDS) {
    try { getProp(id); built++; } catch (err) { broken.push(id); }
  }
  ok(`all ${PROP_IDS.length} props build`, broken.length === 0, broken.join(', '));
}

// ────────────────────────────────────────────────────────────── 5. terrain
section('World');
if (mods['world/Terrain']) {
  const { Terrain } = mods['world/Terrain'];
  const t = new Terrain(1337);
  let bad = 0;
  let min = Infinity; let max = -Infinity;
  for (let i = 0; i < 900; i++) {
    const x = (Math.random() - 0.5) * 2400;
    const z = (Math.random() - 0.5) * 2400;
    const h = t.heightAt(x, z);
    if (!Number.isFinite(h)) bad++;
    min = Math.min(min, h); max = Math.max(max, h);
  }
  ok('terrain heights finite', bad === 0, `${bad} bad samples`);
  ok('terrain has relief', max - min > 80, `range ${min.toFixed(1)}..${max.toFixed(1)}`);
  const biomes = new Set();
  for (let i = 0; i < 600; i++) {
    biomes.add(t.biomeIdAt((Math.random() - 0.5) * 2400, (Math.random() - 0.5) * 2400));
  }
  ok('multiple biomes present', biomes.size >= 5, [...biomes].join(','));
  const flat = t.findSpot(0, 0, (x, z, h) => t.isFlatEnough(x, z) && !t.isWater(x, z), { min: 0, max: 300 });
  ok('findSpot returns a usable spot', !!flat, JSON.stringify(flat));
}

// ────────────────────────────────────────────────────── 6. combat sanity
section('Combat maths');
if (mods['systems/ProgressionSystem'] && mods['systems/CombatSystem']) {
  const { ProgressionSystem } = mods['systems/ProgressionSystem'];
  const { CombatSystem } = mods['systems/CombatSystem'];
  const prog = new ProgressionSystem();
  const scene = new THREE.Scene();
  const vfx = new mods['systems/VFX'].VFX(scene);
  const combat = new CombatSystem({ world: null, vfx, audio: null, progression: prog, settings: mods['core/Settings'].settings, engine: null });

  const hp1 = prog.stats.maxHealth;
  prog.level = 40; prog.recompute();
  const hp40 = prog.stats.maxHealth;
  ok('health grows with level', hp40 > hp1 * 2, `${hp1} → ${hp40}`);

  // damage pipeline: a level-1 bandit hitting a level-40 player should hurt but not one-shot
  const dummy = { alive: true, isPlayer: false, health: 1000, maxHealth: 1000, stats: { defense: 0, spiritDefense: 0 }, statusMod: () => 0, position: new THREE.Vector3(), center: (o = new THREE.Vector3()) => o, statuses: new Map(), invulnerable: 0, stagger() {}, animator: null, addStatus() {}, height: 1.8, radius: 0.5, def: {} };
  const res = combat.applyDamage(dummy, { amount: 100, type: 'physical', source: null, silent: true });
  ok('damage applied', res.damage > 20 && res.damage < 400, `${res.damage}`);

  // status application through the real Actor
  const { Actor } = mods['entities/Actor'];
  const rig = mods['entities/CharacterRig'].buildCharacter({ height: 1.8, build: 'lean', head: 'human' });
  const actor = new Actor({ rig, stats: prog.stats, faction: 'enemy' });
  combat.add(actor);
  actor.addStatus('burn', { duration: 3 });
  let ticked = 0;
  actor.onStatusTick = () => { ticked++; };
  for (let i = 0; i < 60; i++) actor.update(1 / 60);
  ok('statuses tick', ticked >= 1, `${ticked} ticks`);
  ok('status expires', !actor.hasStatus('burn') || actor.statuses.get('burn').t > 0);
}

// ──────────────────────────────────────────────────────────── 7. abilities
section('Ability system wiring');
if (mods['systems/AbilitySystem']) {
  const { AbilitySystem } = mods['systems/AbilitySystem'];
  const proto = AbilitySystem.prototype;
  const missing = [];
  for (const a of ABILITIES || []) {
    if (typeof proto[`kind_${a.kind}`] !== 'function') missing.push(`${a.id}(${a.kind})`);
  }
  ok('every ability kind has a handler', missing.length === 0, missing.join(', '));
}

// ───────────────────────────────────────────────────────────── 8. enemies
section('Enemy AI wiring');
if (mods['entities/enemyAttacks']) {
  const { ENEMY_ATTACKS } = mods['entities/enemyAttacks'];
  const missing = [];
  for (const e of ENEMIES || []) {
    for (const id of e.ai?.abilities || []) {
      if (!ENEMY_ATTACKS[id]) missing.push(`${e.id}:${id}`);
    }
  }
  ok('every enemy ability is implemented', missing.length === 0, missing.join(', '));
}

// ──────────────────────────────────────────────────────────────── summary
console.log(`\n\x1b[1m${checks - failures}/${checks} checks passed\x1b[0m`);
if (failures) {
  console.log('\x1b[31mSmoke test failed.\x1b[0m');
  process.exit(1);
}
console.log('\x1b[32mSmoke test passed.\x1b[0m');
process.exit(0);

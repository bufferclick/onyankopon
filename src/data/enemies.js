/**
 * Bestiary. Every enemy is built at runtime from these numbers by the
 * procedural rig (entities/CharacterRig.js) — one skeleton, wildly different
 * silhouettes, so a naginata ashigaru and a crow-winged tengu never read alike.
 *
 * appearance drives the model, ai drives behaviour, drops drive the economy.
 */

export const ENEMIES = [
  // ───────────────────────────────────────────────── starter / human foes
  {
    id: 'bandit', name: 'Reed Bandit', kanji: '葦盗賊', tier: 'minion', level: [1, 6],
    health: 46, damage: 9, poise: 12, speed: 3.4, xp: 14, gold: [3, 9],
    appearance: { height: 1.0, build: 'lean', skin: 0xc9a184, cloth: 0x5b4a3a, accent: 0x8a3b2c,
      head: 'human', mask: null, weapon: 'club', hair: 0x1c1416, rag: true },
    ai: { profile: 'melee', range: 1.9, aggression: 0.6, attackRate: 1.5, telegraphs: ['windup'], block: 0.15, dodge: 0.1 },
    drops: [{ item: 'cloth_scrap', chance: 0.5 }, { item: 'rice_ball', chance: 0.22 }, { item: 'copper_coin', chance: 0.7, count: [1, 3] }],
    regions: ['kawa', 'reeds', 'wood'], lore: 'Hungry men with sticks. The first thing the fox eats is usually a man like this.',
  },
  {
    id: 'ronin', name: 'Masterless Ronin', kanji: '浪人', tier: 'minion', level: [3, 12],
    health: 82, damage: 16, poise: 26, speed: 4.0, xp: 30, gold: [8, 22],
    appearance: { height: 1.05, build: 'lean', skin: 0xd0a887, cloth: 0x2f3a4a, accent: 0xb03a2e,
      head: 'human', mask: null, weapon: 'katana', hair: 0x14110f, topknot: true },
    ai: { profile: 'melee', range: 2.2, aggression: 0.85, attackRate: 1.15, telegraphs: ['windup', 'feint'], block: 0.45, dodge: 0.35, parry: 0.2 },
    drops: [{ item: 'katana_shard', chance: 0.35 }, { item: 'sake', chance: 0.2 }, { item: 'copper_coin', chance: 0.9, count: [3, 8] }],
    regions: ['kawa', 'reeds', 'wood', 'bamboo'], lore: 'Swords for hire who ran out of hirers. They fight well because it is all they have left to sell.',
  },
  {
    id: 'ashigaru_spear', name: 'Spear Ashigaru', kanji: '足軽槍', tier: 'minion', level: [5, 16],
    health: 96, damage: 18, poise: 34, speed: 3.5, xp: 38, gold: [10, 26],
    appearance: { height: 1.05, build: 'lean', skin: 0xd0a887, cloth: 0x4a3a2c, accent: 0x2f4a3a,
      head: 'human', mask: 'mempo', weapon: 'spear', armor: true },
    ai: { profile: 'spear', range: 3.2, aggression: 0.7, attackRate: 1.0, telegraphs: ['thrust_windup'], block: 0.55, keepDistance: 2.6 },
    drops: [{ item: 'spear_head', chance: 0.4 }, { item: 'iron_scrap', chance: 0.3 }, { item: 'copper_coin', chance: 0.9, count: [4, 9] }],
    regions: ['kawa', 'wood', 'yuki', 'capital'], lore: 'Farmers with spears and a chain of command. Together they are worse than any ronin.',
  },
  {
    id: 'archer', name: 'Bow Hunter', kanji: '射手', tier: 'minion', level: [4, 18],
    health: 62, damage: 15, poise: 14, speed: 3.9, xp: 32, gold: [9, 20],
    appearance: { height: 1.0, build: 'lean', skin: 0xc9a184, cloth: 0x3f4a35, accent: 0x6b5a34,
      head: 'human', mask: null, weapon: 'bow', hood: true },
    ai: { profile: 'archer', range: 26, aggression: 0.5, attackRate: 1.8, keepDistance: 14, dodge: 0.5, retreat: true },
    drops: [{ item: 'arrow_bundle', chance: 0.6 }, { item: 'feather', chance: 0.3 }, { item: 'copper_coin', chance: 0.8, count: [2, 6] }],
    regions: ['wood', 'bamboo', 'yuki', 'reeds'], lore: 'They do not hate you. They are simply paid per arrow that finds something.',
  },
  {
    id: 'naginata_monk', name: 'Naginata Monk', kanji: '薙刀僧', tier: 'minion', level: [10, 24],
    health: 130, damage: 24, poise: 42, speed: 3.8, xp: 62, gold: [16, 40],
    appearance: { height: 1.08, build: 'lean', skin: 0xe0c0a0, cloth: 0xf0e6d2, accent: 0xc8443c,
      head: 'human', mask: null, weapon: 'naginata', bald: true, beads: true },
    ai: { profile: 'melee', range: 3.0, aggression: 0.9, attackRate: 0.95, telegraphs: ['spin_windup'], block: 0.5, dodge: 0.3 },
    drops: [{ item: 'prayer_beads', chance: 0.35 }, { item: 'incense', chance: 0.3 }, { item: 'silver_coin', chance: 0.5, count: [1, 3] }],
    regions: ['wood', 'graves', 'shrine'], lore: 'They cut down devils for a living and keep the receipts. Some of them are right to.',
  },

  // ───────────────────────────────────────────────────────── yōkai
  {
    id: 'gaki', name: 'Gaki — Hungry Ghost', kanji: '餓鬼', tier: 'minion', level: [6, 18],
    health: 70, damage: 14, poise: 8, speed: 4.6, xp: 34, gold: [4, 12],
    appearance: { height: 0.9, build: 'gaunt', skin: 0x6a7a6a, cloth: 0x2a2f2a, accent: 0x8fd18a,
      head: 'skull', mask: null, weapon: 'claws', float: true, wispy: true, aura: 0x8fd18a },
    ai: { profile: 'swarm', range: 1.7, aggression: 1.0, attackRate: 1.4, float: true, dodge: 0.25, lifeDrain: 0.2 },
    resistances: ['physical'], weaknesses: ['fire', 'spirit'],
    drops: [{ item: 'spectral_dust', chance: 0.45 }, { item: 'bone_shard', chance: 0.3 }],
    regions: ['graves', 'reeds', 'wood'], lore: 'Mouths the size of a needle, hunger the size of a province.',
  },
  {
    id: 'kappa', name: 'Kappa', kanji: '河童', tier: 'minion', level: [8, 20],
    health: 120, damage: 20, poise: 30, speed: 3.6, xp: 52, gold: [12, 28],
    appearance: { height: 0.8, build: 'squat', skin: 0x5f8a6a, cloth: 0x3a5a4a, accent: 0xa8d8ff,
      head: 'kappa', mask: null, weapon: 'claws', shell: true, dish: true },
    ai: { profile: 'melee', range: 1.8, aggression: 0.8, attackRate: 1.2, telegraphs: ['slam'], grab: true, block: 0.3 },
    weaknesses: ['fire'], resistances: ['water'],
    drops: [{ item: 'kappa_shell', chance: 0.4 }, { item: 'cucumber', chance: 0.25 }, { item: 'river_pearl', chance: 0.15 }],
    regions: ['kawa', 'reeds'], lore: 'Drown one, steal the water from its head-dish, and it will apologise for a year.',
  },
  {
    id: 'oni_brute', name: 'Oni Brute', kanji: '鬼', tier: 'elite', level: [12, 30],
    health: 340, damage: 38, poise: 110, speed: 3.0, xp: 130, gold: [40, 90],
    appearance: { height: 1.5, build: 'heavy', skin: 0x9c3a3a, cloth: 0x3a2a2a, accent: 0xf0e6d2,
      head: 'oni', horns: 'bull', mask: null, weapon: 'club', tusks: true, aura: 0xff5a2a },
    ai: { profile: 'brute', range: 3.4, aggression: 0.9, attackRate: 0.85, telegraphs: ['big_windup', 'roar'],
      block: 0.2, enrage: { at: 0.35, speed: 1.25, damage: 1.3 }, unstoppable: true },
    drops: [{ item: 'oni_horn', chance: 0.55 }, { item: 'iron_ore', chance: 0.4 }, { item: 'silver_coin', chance: 0.8, count: [3, 7] }],
    regions: ['ridge', 'yuki', 'graves', 'capital'], lore: 'They keep their promises. That is the dangerous part about oni.',
  },
  {
    id: 'tengu', name: 'Tengu Warrior', kanji: '天狗', tier: 'elite', level: [18, 38],
    health: 300, damage: 34, poise: 80, speed: 5.2, xp: 165, gold: [60, 120],
    appearance: { height: 1.25, build: 'lean', skin: 0xb03a2e, cloth: 0x2a1f2a, accent: 0xe8c86a,
      head: 'tengu', beak: true, wings: 'crow', mask: 'tengu', weapon: 'naginata', feathers: true, aura: 0xe8c86a },
    ai: { profile: 'skirmisher', range: 3.0, aggression: 1.0, attackRate: 0.9, fly: true, dodge: 0.6,
      telegraphs: ['gust'], abilities: ['wind_gust', 'sky_dive'] },
    weaknesses: ['spirit'], resistances: ['fire'],
    drops: [{ item: 'tengu_feather', chance: 0.5 }, { item: 'wind_charm', chance: 0.25 }, { item: 'silver_coin', chance: 0.9, count: [5, 11] }],
    regions: ['yuki', 'ridge', 'bamboo'], lore: 'Mountain masters of the sword who will teach you, if you survive asking.',
  },
  {
    id: 'yurei', name: 'Yūrei', kanji: '幽霊', tier: 'minion', level: [14, 34],
    health: 90, damage: 22, poise: 10, speed: 3.2, xp: 74, gold: [18, 34],
    appearance: { height: 1.05, build: 'gaunt', skin: 0xd8e0f0, cloth: 0xe8f0ff, accent: 0x8ad8ff,
      head: 'human', mask: null, weapon: 'none', wispy: true, longHair: true, float: true, aura: 0x8ad8ff },
    ai: { profile: 'caster', range: 12, aggression: 0.8, attackRate: 1.6, abilities: ['wail', 'curse'], float: true, phase: true },
    resistances: ['physical'], weaknesses: ['fire', 'spirit'],
    drops: [{ item: 'spectral_dust', chance: 0.6 }, { item: 'funeral_coin', chance: 0.3 }],
    regions: ['graves', 'capital', 'reeds'], lore: 'Someone left them unburied and now they wander in wet kimono, dripping apologies.',
  },
  {
    id: 'jorogumo', name: 'Jorōgumo', kanji: '絡新婦', tier: 'elite', level: [22, 42],
    health: 380, damage: 42, poise: 70, speed: 4.4, xp: 210, gold: [80, 160],
    appearance: { height: 1.15, build: 'lean', skin: 0xe8d8c8, cloth: 0x6a2a4a, accent: 0xd86ab8,
      head: 'human', mask: null, weapon: 'claws', spiderLegs: true, longHair: true, aura: 0xd86ab8 },
    ai: { profile: 'caster', range: 18, aggression: 0.9, attackRate: 1.2, abilities: ['web_shot', 'spiderlings', 'lash'], dodge: 0.5 },
    weaknesses: ['fire'], resistances: ['poison'],
    drops: [{ item: 'spider_silk', chance: 0.6 }, { item: 'venom_gland', chance: 0.35 }, { item: 'gold_coin', chance: 0.5, count: [1, 3] }],
    regions: ['bamboo', 'graves', 'capital'], lore: 'She plays a biwa beautifully. Men who stop to listen are wrapped by morning.',
  },
  {
    id: 'namahage', name: 'Namahage', kanji: 'なまはげ', tier: 'elite', level: [20, 40],
    health: 420, damage: 40, poise: 130, speed: 3.4, xp: 195, gold: [70, 140],
    appearance: { height: 1.45, build: 'heavy', skin: 0x3a5a7a, cloth: 0x2a3a4a, accent: 0xd94a3a,
      head: 'oni', horns: 'short', mask: 'namahage', weapon: 'knife', strawCape: true, aura: 0x6ac0ff },
    ai: { profile: 'brute', range: 2.6, aggression: 0.95, attackRate: 1.0, telegraphs: ['big_windup'], unstoppable: true,
      abilities: ['frost_breath'], resistances: ['frost'] },
    weaknesses: ['fire'],
    drops: [{ item: 'straw_bundle', chance: 0.5 }, { item: 'frost_shard', chance: 0.4 }, { item: 'silver_coin', chance: 0.9, count: [4, 9] }],
    regions: ['yuki', 'yuki'], lore: 'They come at New Year to scare lazy children. Then they stopped going home.',
  },
  {
    id: 'gashadokuro', name: 'Gashadokuro', kanji: '餓者髑髏', tier: 'boss', level: [30, 40], boss: true,
    health: 2600, damage: 58, poise: 400, speed: 2.6, xp: 900, gold: [400, 700], essence: 12,
    appearance: { height: 4.2, build: 'skeletal', skin: 0xe8e0d0, cloth: 0x2a2620, accent: 0x8a2a2a,
      head: 'skull', giant: true, weapon: 'none', aura: 0x8a2a2a, glow: 0xff5a2a },
    ai: { profile: 'boss', range: 6, aggression: 1.0, attackRate: 1.1, unstoppable: true,
      abilities: ['bone_swipe', 'rib_storm', 'skull_laugh', 'summon_gaki'], phases: [
        { at: 1.0, moves: ['bone_swipe', 'rib_storm'] },
        { at: 0.6, moves: ['bone_swipe', 'rib_storm', 'skull_laugh'] },
        { at: 0.3, moves: ['bone_swipe', 'rib_storm', 'skull_laugh', 'summon_gaki'], rage: 1.3 },
      ] },
    weaknesses: ['fire', 'spirit'],
    drops: [{ item: 'great_skull', chance: 1 }, { item: 'bone_marrow', chance: 1, count: [3, 6] }, { item: 'gold_coin', chance: 1, count: [8, 14] }],
    regions: ['graves'], lore: 'Made from the bones of a thousand men who died on a mountain and were never counted.',
    music: 'boss', title: 'The Uncounted', kanjiTitle: '餓者髑髏',
  },
  {
    id: 'aka_kitsune', name: 'Aka-Kitsune — The Red Rival', kanji: '赤狐', tier: 'boss', level: [36, 48], boss: true,
    health: 3400, damage: 62, poise: 260, speed: 6.2, xp: 1400, gold: [600, 900], essence: 20,
    appearance: { height: 1.3, build: 'beast', skin: 0xd84a2a, cloth: 0x2a1a1a, accent: 0xffc46a,
      head: 'kitsune', tails: 7, fox: true, weapon: 'none', aura: 0xff5a2a },
    ai: { profile: 'boss', range: 14, aggression: 1.2, attackRate: 0.8, dodge: 0.75,
      abilities: ['fox_fire', 'tail_sweep', 'blink_strike', 'nine_tails_form'], phases: [
        { at: 1.0, moves: ['fox_fire', 'tail_sweep'] },
        { at: 0.65, moves: ['fox_fire', 'tail_sweep', 'blink_strike'] },
        { at: 0.3, moves: ['fox_fire', 'tail_sweep', 'blink_strike', 'nine_tails_form'], rage: 1.4 },
      ] },
    weaknesses: ['void'], resistances: ['fire'],
    drops: [{ item: 'rival_fang', chance: 1 }, { item: 'fox_pelt_red', chance: 1 }, { item: 'gold_coin', chance: 1, count: [12, 20] }],
    regions: ['ridge'], lore: 'Another contractor. It has been at this longer than you, and it would like its tails back.',
    music: 'boss', title: 'She Who Signed First', kanjiTitle: '先に署名した者',
  },
  {
    id: 'oni_general', name: 'Oni General Shuten', kanji: '酒呑鬼将', tier: 'boss', level: [42, 56], boss: true,
    health: 5200, damage: 78, poise: 520, speed: 3.8, xp: 2200, gold: [900, 1400], essence: 32,
    appearance: { height: 2.2, build: 'heavy', skin: 0x8a2a3a, cloth: 0x2a1a2a, accent: 0xf0c86a,
      head: 'oni', horns: 'great', mask: null, weapon: 'kanabo', armor: true, aura: 0xff3a2a, crown: true },
    ai: { profile: 'boss', range: 4.5, aggression: 1.1, attackRate: 0.9, unstoppable: true, block: 0.4,
      abilities: ['kanabo_slam', 'sake_breath', 'whirl', 'summon_oni'], phases: [
        { at: 1.0, moves: ['kanabo_slam', 'whirl'] },
        { at: 0.7, moves: ['kanabo_slam', 'whirl', 'sake_breath'] },
        { at: 0.35, moves: ['kanabo_slam', 'whirl', 'sake_breath', 'summon_oni'], rage: 1.35 },
      ] },
    weaknesses: ['spirit'], resistances: ['fire', 'physical'],
    drops: [{ item: 'shuten_horn', chance: 1 }, { item: 'oni_iron', chance: 1, count: [2, 5] }, { item: 'gold_coin', chance: 1, count: [20, 30] }],
    regions: ['ridge'], lore: 'He drinks, he laughs, he takes a province. In that order, every century or so.',
    music: 'boss', title: 'The Drunken Standard', kanjiTitle: '酒呑鬼将',
  },
  {
    id: 'nine_bells', name: 'The Ninth Bell', kanji: '九つ目の鐘', tier: 'boss', level: [55, 70], boss: true, final: true,
    health: 8200, damage: 92, poise: 700, speed: 4.4, xp: 4000, gold: [1600, 2400], essence: 60,
    appearance: { height: 2.6, build: 'gaunt', skin: 0x2a2230, cloth: 0x14101a, accent: 0xffe9a8,
      head: 'human', mask: 'hannya', weapon: 'naginata', bells: true, aura: 0xffe9a8, crowns: 9 },
    ai: { profile: 'boss', range: 16, aggression: 1.15, attackRate: 0.75, dodge: 0.6,
      abilities: ['bell_ring', 'nine_cut', 'spirit_torrent', 'mirror_self', 'contract_steal'], phases: [
        { at: 1.0, moves: ['bell_ring', 'nine_cut'] },
        { at: 0.75, moves: ['bell_ring', 'nine_cut', 'spirit_torrent'] },
        { at: 0.45, moves: ['bell_ring', 'nine_cut', 'spirit_torrent', 'mirror_self'] },
        { at: 0.18, moves: ['bell_ring', 'nine_cut', 'spirit_torrent', 'mirror_self', 'contract_steal'], rage: 1.5 },
      ] },
    drops: [{ item: 'ninth_bell_fragment', chance: 1 }, { item: 'contractor_hood', chance: 1 }],
    regions: ['capital'], lore: 'Once a contractor like you. The bells are the nine people it loved, still ringing.',
    music: 'boss', title: 'The Contract That Ate Its Keeper', kanjiTitle: '九つ目の鐘',
  },

  // ───────────────────────────────────────────────── minions of the wild
  {
    id: 'crow', name: 'Crow', kanji: '烏', tier: 'wildlife', level: [1, 3],
    health: 12, damage: 3, poise: 2, speed: 8.0, xp: 3, gold: [0, 1], passive: true,
    appearance: { height: 0.35, build: 'bird', skin: 0x1c1a20, cloth: 0x1c1a20, accent: 0x6a5a4a, head: 'crow', wings: 'crow', weapon: 'none' },
    ai: { profile: 'wildlife', range: 0, aggression: 0, attackRate: 3, flee: true, fly: true },
    drops: [{ item: 'feather', chance: 0.6 }],
    regions: ['kawa', 'wood', 'bamboo', 'yuki', 'graves', 'capital'], lore: 'Crows are foxes with worse manners and better press.',
  },
  {
    id: 'deer', name: 'Sika Deer', kanji: '鹿', tier: 'wildlife', level: [1, 4],
    health: 40, damage: 6, poise: 8, speed: 6.5, xp: 5, gold: [0, 2], passive: true,
    appearance: { height: 0.9, build: 'quadruped', skin: 0xa8845a, cloth: 0xa8845a, accent: 0xf0e6d2, head: 'deer', antlers: true, weapon: 'none' },
    ai: { profile: 'wildlife', range: 0, aggression: 0, attackRate: 2, flee: true },
    drops: [{ item: 'venison', chance: 0.8 }, { item: 'antler', chance: 0.25 }],
    regions: ['kawa', 'wood', 'bamboo', 'shrine'], lore: 'Sacred to the god whose fox you are currently wearing.',
  },
  {
    id: 'boar', name: 'Wild Boar', kanji: '猪', tier: 'wildlife', level: [4, 12],
    health: 110, damage: 18, poise: 40, speed: 5.4, xp: 22, gold: [0, 4],
    appearance: { height: 0.8, build: 'quadruped', skin: 0x5a4a3a, cloth: 0x5a4a3a, accent: 0xe8d8c8, head: 'boar', tusks: true, weapon: 'none' },
    ai: { profile: 'charger', range: 1.6, aggression: 0.5, attackRate: 1.6, charge: true, telegraphs: ['paw'] },
    drops: [{ item: 'boar_hide', chance: 0.7 }, { item: 'boar_tusk', chance: 0.4 }],
    regions: ['wood', 'bamboo', 'yuki'], lore: 'The boar does not care about your contract. The boar cares about your legs.',
  },
  {
    id: 'tanuki', name: 'Tanuki', kanji: '狸', tier: 'wildlife', level: [2, 8],
    health: 55, damage: 8, poise: 12, speed: 4.0, xp: 10, gold: [1, 3], passive: true,
    appearance: { height: 0.6, build: 'squat', skin: 0x8a7050, cloth: 0x6a5a3a, accent: 0x3a2a1a, head: 'tanuki', weapon: 'none' },
    ai: { profile: 'wildlife', range: 0, aggression: 0.1, attackRate: 2, flee: true, trickster: true },
    drops: [{ item: 'tanuki_pelt', chance: 0.5 }, { item: 'leaf', chance: 0.4 }],
    regions: ['kawa', 'wood', 'bamboo'], lore: 'It can turn leaves into coins. It cannot resist doing it at the worst possible moment.',
  },

  // ───────────────────────────────────────────────────────── the damned
  {
    id: 'hanged_one', name: 'Hanged One', kanji: '縊死者', tier: 'minion', level: [16, 34],
    health: 140, damage: 26, poise: 20, speed: 2.8, xp: 88, gold: [20, 40],
    appearance: { height: 1.15, build: 'gaunt', skin: 0x8a9a8a, cloth: 0x3a3a34, accent: 0x6a7a6a,
      head: 'human', mask: null, weapon: 'none', noose: true, float: true, wispy: true },
    ai: { profile: 'melee', range: 2.0, aggression: 0.9, attackRate: 1.3, grab: true, telegraphs: ['reach'] },
    resistances: ['physical'], weaknesses: ['fire'],
    drops: [{ item: 'rope_coil', chance: 0.4 }, { item: 'spectral_dust', chance: 0.3 }],
    regions: ['graves', 'capital', 'wood'], lore: 'It keeps trying to give you its rope.',
  },
  {
    id: 'nure_onna', name: 'Nure-Onna', kanji: '濡女', tier: 'elite', level: [26, 44],
    health: 340, damage: 44, poise: 60, speed: 3.6, xp: 240, gold: [110, 200],
    appearance: { height: 1.1, build: 'lean', skin: 0xd8e0e8, cloth: 0x2a3a4a, accent: 0x8ad8ff,
      head: 'human', mask: null, weapon: 'none', longHair: true, serpent: true, aura: 0x8ad8ff },
    ai: { profile: 'caster', range: 16, aggression: 0.9, attackRate: 1.1, abilities: ['water_whip', 'drown', 'hair_sweep'] },
    weaknesses: ['fire', 'shock'], resistances: ['water', 'frost'],
    drops: [{ item: 'serpent_scale', chance: 0.5 }, { item: 'river_pearl', chance: 0.3 }, { item: 'gold_coin', chance: 0.6, count: [2, 5] }],
    regions: ['reeds', 'kawa', 'capital'], lore: 'She asks you to hold her hair. It is very long. It weighs a great deal.',
  },
  {
    id: 'nurikabe', name: 'Nurikabe', kanji: '塗壁', tier: 'elite', level: [24, 42],
    health: 900, damage: 30, poise: 900, speed: 1.4, xp: 180, gold: [70, 130],
    appearance: { height: 2.0, build: 'wall', skin: 0x8a8a7a, cloth: 0x6a6a5a, accent: 0x3a3a30,
      head: 'none', mask: null, weapon: 'none', wall: true },
    ai: { profile: 'wall', range: 2.2, aggression: 0.4, attackRate: 1.4, unstoppable: true, block: 0.95 },
    weaknesses: ['fire'], resistances: ['physical'],
    drops: [{ item: 'wall_clay', chance: 0.7 }, { item: 'stone_chunk', chance: 0.5 }],
    regions: ['capital', 'yuki', 'graves'], lore: 'A wall that walks into your path. Hit it and it simply becomes more wall.',
  },
  {
    id: 'okubi', name: 'Ōkubi — The Great Head', kanji: '大首', tier: 'elite', level: [28, 46],
    health: 460, damage: 48, poise: 90, speed: 3.0, xp: 260, gold: [120, 220],
    appearance: { height: 1.2, build: 'squat', skin: 0xc9a184, cloth: 0x2a1f2a, accent: 0xff7a2a,
      head: 'giant_head', mask: 'hannya', weapon: 'none', float: true, aura: 0xff7a2a },
    ai: { profile: 'caster', range: 14, aggression: 0.85, attackRate: 1.5, abilities: ['scream', 'bite', 'curse_gaze'], float: true },
    weaknesses: ['spirit'], resistances: ['physical'],
    drops: [{ item: 'hannya_mask', chance: 0.2 }, { item: 'spectral_dust', chance: 0.6 }, { item: 'silver_coin', chance: 0.8, count: [4, 8] }],
    regions: ['graves', 'capital', 'ridge'], lore: 'A head the size of a house, still shouting instructions to a body that is gone.',
  },
  {
    id: 'ubume', name: 'Ubume', kanji: '産女', tier: 'elite', level: [22, 40],
    health: 320, damage: 36, poise: 55, speed: 3.8, xp: 200, gold: [90, 170],
    appearance: { height: 1.05, build: 'lean', skin: 0xe8d8c8, cloth: 0xf0e6d2, accent: 0xd84a6a,
      head: 'human', mask: null, weapon: 'none', longHair: true, bundle: true, aura: 0xd84a6a },
    ai: { profile: 'caster', range: 12, aggression: 0.95, attackRate: 1.2, abilities: ['hand_bundle', 'wail', 'lifedrain'] },
    weaknesses: ['fire'], resistances: ['void'],
    drops: [{ item: 'mourning_cloth', chance: 0.5 }, { item: 'spirit_silk', chance: 0.35 }],
    regions: ['graves', 'kawa', 'capital'], lore: 'She hands you the bundle and asks you to hold it. It gets heavier every second.',
  },
  {
    id: 'contractor_wraith', name: 'Failed Contractor', kanji: '落伍契約者', tier: 'elite', level: [30, 50],
    health: 520, damage: 54, poise: 120, speed: 4.6, xp: 320, gold: [150, 260], essence: 3,
    appearance: { height: 1.2, build: 'lean', skin: 0x6a5a6a, cloth: 0x241c28, accent: 0x8a4bd8,
      head: 'human', mask: 'kitsune', weapon: 'katana', tails: 3, aura: 0x8a4bd8, wraith: true },
    ai: { profile: 'skirmisher', range: 2.4, aggression: 1.1, attackRate: 0.95, dodge: 0.55, parry: 0.3,
      abilities: ['fox_fire', 'blink_strike', 'spirit_slash'] },
    resistances: ['spirit'], weaknesses: ['void', 'physical'],
    drops: [{ item: 'cracked_mask', chance: 0.4 }, { item: 'contract_essence', chance: 0.5, count: [1, 2] }, { item: 'gold_coin', chance: 0.9, count: [3, 7] }],
    regions: ['capital', 'ridge', 'graves'], lore: 'They also wanted to be the strongest. The fox is still collecting from them.',
  },
];

export const ENEMY_BY_ID = Object.fromEntries(ENEMIES.map((e) => [e.id, e]));
export const BOSSES = ENEMIES.filter((e) => e.boss);

/** Scale a base enemy up to a level. Keeps early-game threats honest. */
export function scaleEnemy(def, level) {
  const l = Math.max(1, level);
  const k = 1 + (l - 1) * 0.115;
  return {
    maxHealth: Math.round(def.health * k),
    damage: Math.round(def.damage * (1 + (l - 1) * 0.085)),
    poise: Math.round(def.poise * (1 + (l - 1) * 0.06)),
    speed: def.speed,
    xp: Math.round(def.xp * (1 + (l - 1) * 0.13)),
    gold: def.gold,
    essence: def.essence || 0,
  };
}

export const TIER_COLORS = {
  minion: '#d8c8a8', elite: '#ffb45a', boss: '#ff5a5a', wildlife: '#8fd18a', legendary: '#c78bff',
};

export const TIER_LABELS = {
  minion: 'Minion', elite: 'Elite', boss: 'Boss', wildlife: 'Wildlife', legendary: 'Legendary',
};

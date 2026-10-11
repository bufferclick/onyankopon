/**
 * Attributes → derived stats.
 *
 * Six attributes, each pulling in at least two directions, so no single stat
 * is strictly best. Everything downstream (combat, loot, dialogue checks, fox
 * mutation requirements) reads from `derive()`.
 */

export const ATTRIBUTES = [
  {
    id: 'body', name: 'Body', kanji: '体', romaji: 'Tai',
    blurb: 'Muscle and bone. Health, physical defence, and the poise to swing through a hit.',
    color: '#d9714a',
    perPoint: ['+22 Max Health', '+1.4 Defence', '+3 Poise'],
  },
  {
    id: 'spirit', name: 'Spirit', kanji: '心', romaji: 'Shin',
    blurb: 'The channel to the other side. Focus, spirit power, resistance to curses.',
    color: '#6fb7d8',
    perPoint: ['+9 Focus', '+1.9 Spirit Power', '+1.1 Spirit Defence'],
  },
  {
    id: 'cunning', name: 'Cunning', kanji: '技', romaji: 'Waza',
    blurb: 'Where the blade lands. Critical chance, critical damage, attack speed, dodge.',
    color: '#e3c564',
    perPoint: ['+0.6% Crit Chance', '+1.2% Crit Damage', '+0.4% Attack Speed'],
  },
  {
    id: 'resolve', name: 'Resolve', kanji: '念', romaji: 'Nen',
    blurb: 'The will to keep standing. Stamina, posture damage, faster recovery.',
    color: '#8fd18a',
    perPoint: ['+7 Stamina', '+1% Posture Damage', '+1.5 Poise'],
  },
  {
    id: 'blood', name: 'Blood', kanji: '血', romaji: 'Chi',
    blurb: 'What the contract is written in. Fox ability power, mutation growth, lifesteal.',
    color: '#c8443c',
    perPoint: ['+1.2 Spirit Power', '+0.15% Lifesteal', '+8% Mutation Progress'],
  },
  {
    id: 'fortune', name: 'Fortune', kanji: '運', romaji: 'Un',
    blurb: 'The gods are watching, or they are not. Loot quality, status resistance, gold.',
    color: '#b98fd8',
    perPoint: ['+1.5% Loot Quality', '+1.2% Status Resist', '+2% Gold'],
  },
];

export const ATTR_IDS = ATTRIBUTES.map((a) => a.id);

export function emptyAttributes(value = 1) {
  return Object.fromEntries(ATTR_IDS.map((id) => [id, value]));
}

/**
 * Turn attributes + level into every number combat actually uses.
 * `mods` comes from equipment, skill-tree nodes and mutations:
 *   { attrAdd:{body:2}, statAdd:{maxHealth:50}, statMul:{critDamage:0.25} }
 */
export function derive(attrs, level = 1, mods = {}) {
  const a = { ...emptyAttributes(0), ...attrs };
  // equipment / skill bonuses to attributes count as real attributes
  for (const [k, v] of Object.entries(mods.attrAdd || {})) a[k] = (a[k] || 0) + v;

  const base = {
    level,
    maxHealth: 92 + a.body * 22 + level * 9,
    maxStamina: 74 + a.resolve * 7 + level * 1.6,
    maxFocus: 38 + a.spirit * 9 + level * 2.2,
    staminaRegen: 15 + a.resolve * 1.5 + level * 0.2,
    focusRegen: 1.6 + a.spirit * 0.16 + level * 0.03,
    healthRegen: 0.35 + a.body * 0.05,

    physicalPower: 7 + a.cunning * 1.65 + a.body * 0.85 + level * 0.9,
    spiritPower: 7 + a.spirit * 1.9 + a.blood * 1.25 + level * 1.0,
    defense: a.body * 1.45 + level * 0.85,
    spiritDefense: a.spirit * 1.15 + a.resolve * 0.55 + level * 0.7,

    critChance: 4.5 + a.cunning * 0.62,            // percent
    critDamage: 150 + a.cunning * 1.25,            // percent multiplier
    attackSpeed: 1 + a.cunning * 0.0042 + a.resolve * 0.0021,
    moveSpeed: 5.1 * (1 + a.resolve * 0.0016 + a.cunning * 0.0008),
    sprintSpeed: 8.4 * (1 + a.resolve * 0.0016),

    poise: 18 + a.body * 3.1 + a.resolve * 1.5,
    postureDamage: 1 + a.resolve * 0.01 + a.cunning * 0.004,
    guardStrength: 0.55 + a.body * 0.012 + a.resolve * 0.008,
    dodgeIFrames: 0.26 + a.cunning * 0.0018,
    dodgeDistance: 5.4 + a.cunning * 0.02,

    lifesteal: a.blood * 0.15,                     // percent of damage healed
    statusResist: a.fortune * 1.2 + a.resolve * 0.4,
    statusPower: 1 + a.spirit * 0.012 + a.blood * 0.008,
    lootQuality: a.fortune * 1.5,
    goldGain: a.fortune * 2,

    mutationProgress: 1 + a.blood * 0.08,
    konDamage: 1,                                  // ability-specific, scaled later
    xpGain: 1,
    cooldownReduction: Math.min(0.35, a.spirit * 0.0035 + level * 0.0008),
    castSpeed: 1 + a.cunning * 0.003,
  };

  // flat then multiplicative modifiers (skills, gear, mutations, buffs)
  for (const [k, v] of Object.entries(mods.statAdd || {})) base[k] = (base[k] ?? 0) + v;
  for (const [k, v] of Object.entries(mods.statMul || {})) base[k] = (base[k] ?? 0) * (1 + v);

  // hard clamps so a modded-in value can never break the game
  base.critChance = Math.min(85, base.critChance);
  base.attackSpeed = Math.min(2.6, base.attackSpeed);
  base.cooldownReduction = Math.min(0.6, base.cooldownReduction);
  base.guardStrength = Math.min(0.92, base.guardStrength);
  base.maxHealth = Math.max(1, Math.round(base.maxHealth));
  base.maxStamina = Math.max(1, Math.round(base.maxStamina));
  base.maxFocus = Math.max(1, Math.round(base.maxFocus));
  return base;
}

/** XP curve: quadratic-ish so early levels fly and late ones mean something. */
export function xpForLevel(level) {
  return Math.round(60 + level ** 1.85 * 26);
}

export function totalXpForLevel(level) {
  let sum = 0;
  for (let i = 1; i < level; i++) sum += xpForLevel(i);
  return sum;
}

export function levelFromXp(xp) {
  let lvl = 1;
  let acc = 0;
  while (acc + xpForLevel(lvl) <= xp && lvl < 120) { acc += xpForLevel(lvl); lvl++; }
  return { level: lvl, into: xp - acc, needed: xpForLevel(lvl) };
}

/** Points awarded: 2/level plus a bonus every 5 levels. */
export function pointsForLevel(level) {
  return 2 + Math.floor(level / 5);
}

export function totalPointsForLevel(level) {
  let p = 0;
  for (let i = 2; i <= level; i++) p += pointsForLevel(i);
  return p;
}

/** Human-readable list of what a point would buy, for the UI hover. */
export function previewPoint(attrId, stats) {
  const map = {
    body: [['Max Health', 22], ['Defence', 1.45], ['Poise', 3.1]],
    spirit: [['Focus', 9], ['Spirit Power', 1.9], ['Spirit Defence', 1.15]],
    cunning: [['Crit Chance', '0.62%'], ['Crit Damage', '1.25%'], ['Attack Speed', '0.42%']],
    resolve: [['Stamina', 7], ['Posture Damage', '1%'], ['Poise', 1.5]],
    blood: [['Spirit Power', 1.25], ['Lifesteal', '0.15%'], ['Mutation Rate', '8%']],
    fortune: [['Loot Quality', '1.5%'], ['Status Resist', '1.2%'], ['Gold', '2%']],
  };
  return map[attrId] || [];
}

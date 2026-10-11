/**
 * Fox Devil mutations.
 *
 * Your familiar starts as a starving pup you can barely summon and ends as a
 * nine-tailed thing that makes villagers close their shutters. Each stage:
 *   • raises every fox stat and grants a passive
 *   • unlocks abilities
 *   • changes the model (scale, tail count, fur, eye glow, aura)
 *   • is gated by fox level, attributes, story quests and a contract price
 */

export const MUTATIONS = [
  {
    id: 'kon_kit',
    name: 'Kon Kit',
    kanji: '仔狐',
    stage: 0,
    blurb: 'A pup, ribs showing, teeth like needles. It bites because you asked it to.',
    lore: 'The contract was signed in your own blood on a night with no moon. What answered was small, starving, and entirely willing.',
    requirements: {},
    damageMult: 1.0, healthMult: 1.0, rangeMult: 1.0, speedMult: 1.0,
    unlocks: ['kon'],
    passive: null,
    visual: { scale: 0.42, tails: 1, fur: 0x8a5a3c, glow: 0xff7a33, aura: 0.35, eyes: 0xffb066, size: 'small' },
    cost: null,
  },
  {
    id: 'yako',
    name: 'Yako — Field Fox',
    kanji: '野狐',
    stage: 1,
    blurb: 'It learned to run. Bites land harder and it stays on the field longer.',
    lore: 'Field foxes are the ones that steal sandals and lead travellers in circles. Yours steals worse things than sandals.',
    requirements: { foxLevel: 3, quests: ['whispers_in_the_reeds'] },
    damageMult: 1.35, healthMult: 1.3, rangeMult: 1.1, speedMult: 1.15,
    unlocks: ['kitsunebi'],
    passive: { id: 'yako_keen', name: 'Keen Nose', desc: 'Reveals enemies within 60m through walls.' },
    visual: { scale: 0.6, tails: 1, fur: 0x9c5f34, glow: 0xff8a3c, aura: 0.55, eyes: 0xffc070 },
    cost: { essence: 4 },
  },
  {
    id: 'kuda',
    name: 'Kuda-gitsune — Pipe Fox',
    kanji: '管狐',
    stage: 2,
    blurb: 'Small enough to ride your sleeve, quick enough to be in three places.',
    lore: 'Itamae keep them in bamboo tubes and feed them fried tofu. You feed yours the names of your enemies.',
    requirements: { foxLevel: 7, blood: 8, quests: ['the_hollow_shrine'] },
    damageMult: 1.7, healthMult: 1.6, rangeMult: 1.25, speedMult: 1.35,
    unlocks: ['onibi', 'senko'],
    passive: { id: 'kuda_quick', name: 'Quickening', desc: 'Ability cooldowns 12% faster; +1.5% dodge i-frames.' },
    visual: { scale: 0.72, tails: 3, fur: 0xb56a2f, glow: 0xffa53c, aura: 0.75, eyes: 0xffd07a },
    cost: { essence: 12 },
  },
  {
    id: 'genkuro',
    name: 'Genkurō — Nine-Tailed Adept',
    kanji: '源九郎',
    stage: 3,
    blurb: 'Its tails hold a storm. Sweeping strikes now carry the whole fox.',
    lore: 'Genkurō was taught by a Chinese sorceress and repaid her with a thousand years of loyalty. Loyalty, in foxes, is a kind of hunger.',
    requirements: { foxLevel: 14, blood: 16, spirit: 14, quests: ['the_third_bell'] },
    damageMult: 2.3, healthMult: 2.2, rangeMult: 1.45, speedMult: 1.45,
    unlocks: ['kokonoe', 'inari_gaze'],
    passive: { id: 'genkuro_storm', name: 'Storm Tails', desc: 'Tail abilities hit 20% wider; fox attacks apply Burn.' },
    visual: { scale: 0.95, tails: 5, fur: 0xc4722c, glow: 0xffbe4a, aura: 1.0, eyes: 0xffe08a },
    cost: { essence: 30 },
  },
  {
    id: 'tenko',
    name: 'Tenko — Celestial Fox',
    kanji: '天狐',
    stage: 4,
    blurb: 'It walks on frost and does not leave prints. Spirits kneel as it passes.',
    lore: 'After a thousand years a fox grows heavy with heaven. Rice is offered. Children are told to be polite. Your fox declines the rice.',
    requirements: { foxLevel: 22, blood: 26, spirit: 26, quests: ['rice_for_the_gods'] },
    damageMult: 3.1, healthMult: 3.0, rangeMult: 1.7, speedMult: 1.6,
    unlocks: ['gengetsu', 'kagura', 'kitsunetsuki'],
    passive: { id: 'tenko_grace', name: 'Heavenly Grace', desc: 'Focus regenerates 25% faster; abilities cost 10% less.' },
    visual: { scale: 1.25, tails: 7, fur: 0xf0e0d0, glow: 0xbfe6ff, aura: 1.25, eyes: 0xa6e0ff },
    cost: { essence: 70 },
  },
  {
    id: 'kyubi',
    name: 'Kyūbi no Yōko — Nine-Tailed Demon Fox',
    kanji: '九尾の妖狐',
    stage: 5,
    blurb: 'Nine tails, nine grudges. Mountains remember when it last walked.',
    lore: 'They say when a fox of nine tails appears, the province burns politely — one lantern at a time, so no one panics until it is too late.',
    requirements: { foxLevel: 32, blood: 40, spirit: 36, quests: ['nine_tails_of_ash'] },
    damageMult: 4.2, healthMult: 4.0, rangeMult: 2.0, speedMult: 1.7,
    unlocks: ['ryubi', 'mikuzure', 'kuchiyose'],
    passive: { id: 'kyubi_might', name: 'Nine Grudges', desc: 'Spirit damage +25%; every 5th hit summons a tail-strike.' },
    visual: { scale: 1.6, tails: 9, fur: 0xe8b45a, glow: 0xff6a2a, aura: 1.6, eyes: 0xff8c3c },
    cost: { essence: 150 },
  },
  {
    id: 'inari',
    name: 'Inari Ōkami — God of the Rice Fields',
    kanji: '稲荷大神',
    stage: 6,
    blurb: 'Not your familiar any more. Something you are politely allowed to ride.',
    lore: 'Inari carries a sheaf of rice in one hand and a sword in the other. Ask which one is for you.',
    requirements: { foxLevel: 44, blood: 58, spirit: 55, fortune: 30, quests: ['the_god_in_the_rice'] },
    damageMult: 5.6, healthMult: 5.2, rangeMult: 2.3, speedMult: 1.85,
    unlocks: ['kuzu_no_hoko', 'yomi', 'okuri_inu'],
    passive: { id: 'inari_bounty', name: 'Bountiful Harvest', desc: 'Kills grant +40% gold and heal 1% max health.' },
    visual: { scale: 1.95, tails: 9, fur: 0xfff4e2, glow: 0xffe9a8, aura: 1.9, eyes: 0xfff0c0, crown: true },
    cost: { essence: 400 },
  },
  {
    id: 'akuma',
    name: 'Akuma no Kitsune — The Fox Devil',
    kanji: '悪魔の狐',
    stage: 7,
    blurb: 'The contract is complete. There is no longer a difference between you.',
    lore: 'You asked to become the strongest. The fox, being a devil, took the request literally. Your shadow has ears now.',
    requirements: { foxLevel: 60, blood: 80, spirit: 75, body: 50, cunning: 50, resolve: 50, fortune: 40, quests: ['the_last_contract'] },
    damageMult: 8.0, healthMult: 7.0, rangeMult: 2.8, speedMult: 2.0,
    unlocks: ['onryo_release', 'akuma_no_kiba'],
    passive: { id: 'akuma_form', name: 'Devil Form', desc: 'Unlocks Devil Form: +60% all damage, -25% damage taken, drains Focus while active.' },
    visual: { scale: 2.4, tails: 9, fur: 0x2b1a22, glow: 0xff2e2e, aura: 2.4, eyes: 0xff2e2e, devil: true },
    cost: { essence: 1200 },
  },
];

export const MUTATION_BY_ID = Object.fromEntries(MUTATIONS.map((m) => [m.id, m]));
export const MUTATION_STAGES = MUTATIONS.length;

/** Fox companion levelling: separate from the player, fed by Contract Essence. */
export function foxXpForLevel(level) {
  return Math.round(50 + level ** 1.7 * 34);
}

export function foxLevelFromXp(xp) {
  let lvl = 1, acc = 0;
  while (acc + foxXpForLevel(lvl) <= xp && lvl < 80) { acc += foxXpForLevel(lvl); lvl++; }
  return { level: lvl, into: xp - acc, needed: foxXpForLevel(lvl) };
}

/** Which mutations are still locked, and exactly what they are missing. */
export function mutationStatus(mutation, state) {
  const req = mutation.requirements || {};
  const missing = [];
  if (req.foxLevel && state.foxLevel < req.foxLevel) missing.push(`Fox Level ${req.foxLevel}`);
  for (const attr of ['body', 'spirit', 'cunning', 'resolve', 'blood', 'fortune']) {
    if (req[attr] && (state.attributes?.[attr] || 0) < req[attr]) {
      missing.push(`${attr[0].toUpperCase()}${attr.slice(1)} ${req[attr]}`);
    }
  }
  for (const q of req.quests || []) if (!state.completedQuests?.includes(q)) missing.push('a sealed memory');
  if (req.playerLevel && state.level < req.playerLevel) missing.push(`Level ${req.playerLevel}`);
  return { unlocked: missing.length === 0, missing };
}

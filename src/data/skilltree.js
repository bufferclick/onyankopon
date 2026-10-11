/**
 * Skill web. Five trees, eighty-one nodes, each of them doing something you can
 * feel within a fight rather than a +1% you have to squint at.
 *
 * Node shape:
 *   id, tree, name, kanji, tier, pos:[col,row], desc, cost, requires[], maxRank,
 *   mods:  { statMul:{}, statAdd:{}, attrAdd:{} }   (merged into derive() mods)
 *   unlock:'ability_id'   grants the ability
 *   flags: ['doubleJump'] consumed by the relevant system
 *   perRank: human-readable "what one more rank does"
 */

const T = (tree) => (id, name, kanji, tier, x, y, desc, opts = {}) => ({
  id, tree, name, kanji, tier, pos: [x, y], desc,
  cost: opts.cost ?? 1, requires: opts.requires ?? [], maxRank: opts.maxRank ?? 1,
  mods: opts.mods ?? null, unlock: opts.unlock ?? null, flags: opts.flags ?? [],
  perRank: opts.perRank ?? null, flavor: opts.flavor ?? null,
});

// ───────────────────────────────────────────────────────── Contract ── 契約
const c = T('contract');
const CONTRACT = [
  c('contract_root', 'Open Contract', '契約', 0, 2, 0,
    'The seal on your chest itches. Kon answers a little faster.',
    { mods: { statMul: { cooldownReduction: 0.04 } }, perRank: '+4% cooldown reduction' }),
  c('contract_bite', 'Deeper Bite', '深噛', 1, 1, 1,
    'Kon’s bite rends armour. Rend increases damage taken by 8%.',
    { requires: ['contract_root'], mods: { statMul: { konDamage: 0.15 } }, maxRank: 3, perRank: '+15% Kon damage' }),
  c('contract_devour', 'Devour', '喰らい', 2, 0, 2,
    'Unlocks Kon — Devour: the bite heals you for part of the damage.',
    { requires: ['contract_bite'], unlock: 'kon_devour', cost: 2, flavor: 'A contract is a meal with two plates.' }),
  c('contract_speed', 'Quick Summon', '早呼', 1, 3, 1,
    'The fox is already halfway out of your shadow before you finish the word.',
    { requires: ['contract_root'], mods: { statMul: { castSpeed: 0.12 } }, maxRank: 3, perRank: '+12% cast speed' }),
  c('contract_reach', 'Long Shadow', '長影', 2, 4, 1,
    'Your shadow stretches further than it should. All fox abilities reach 15% further.',
    { requires: ['contract_speed'], mods: { statMul: { konDamage: 0.06 } }, maxRank: 2, perRank: '+6% fox damage' }),
  c('contract_fire', 'Fox-Fire Attunement', '狐火', 2, 3, 2,
    'Fire abilities burn 30% longer and apply an extra stack.',
    { requires: ['contract_speed'], mods: { statMul: { statusPower: 0.25 } }, maxRank: 3, perRank: '+25% status power' }),
  c('contract_pillar', 'Pillar of Ash', '灰柱', 3, 4, 2,
    'Unlocks Hinokagutsuchi — Flame Pillar: a column of fox-fire from the earth.',
    { requires: ['contract_fire'], unlock: 'hinokagutsuchi', cost: 2 }),
  c('contract_storm', 'Thunder Company', '雷伴', 3, 3, 3,
    'Unlocks Raijin’s Tail: nine chained bolts across the field.',
    { requires: ['contract_fire'], unlock: 'raijin_tail', cost: 2 }),
  c('contract_bond', 'Bond of Salt and Rice', '塩結', 2, 1, 2,
    'Your fox gains 25% health and returns to the field 20% sooner.',
    { requires: ['contract_bite'], mods: { statMul: { konDamage: 0.08 } }, maxRank: 3, perRank: '+8% fox damage' }),
  c('contract_twin', 'Twin Heads', '双頭', 4, 0, 3,
    'Kon manifests two heads at once. Each deals 70% damage.',
    { requires: ['contract_devour'], mods: { statMul: { konDamage: 0.35 } }, cost: 3, flavor: 'Two mouths, one invoice.' }),
  c('contract_hunger', 'Bottomless Hunger', '底無', 4, 1, 3,
    'Fox abilities cost 10% less Focus. Killing with an ability refunds 4 Focus.',
    { requires: ['contract_bond'], mods: { statMul: { maxFocus: 0.1 } }, maxRank: 3, perRank: '+10% max focus', flags: ['focus_on_kill'] }),
  c('contract_growth', 'Rapid Mutation', '急変', 3, 2, 3,
    'Contract Essence is worth 40% more toward mutation.',
    { requires: ['contract_bond'], mods: { statMul: { mutationProgress: 0.4 } }, maxRank: 2, perRank: '+40% mutation rate' }),
  c('contract_echo_fox', 'The Fox That Answers', '応狐', 4, 2, 4,
    'Casting any Contract ability has a 25% chance to not consume its cooldown.',
    { requires: ['contract_growth'], mods: { statMul: { cooldownReduction: 0.06 } }, cost: 3, flavor: 'Greedy. Efficient. Yours.' }),
  c('contract_ultimate', 'Nine-Tailed Authority', '九尾の権', 5, 1, 4,
    'Ultimate abilities last 35% longer and cost 20% less.',
    { requires: ['contract_twin', 'contract_echo_fox'], mods: { statMul: { maxFocus: 0.15 } }, cost: 3 }),
  c('contract_apex', 'Apex Contractor', '契約の頂', 5, 2, 5,
    'All fox damage +30%. Your fox cannot be dismissed, only silenced.',
    { requires: ['contract_ultimate'], mods: { statMul: { spiritPower: 0.3, konDamage: 0.3 } }, cost: 4,
      flavor: 'The ink has dried into your skin. There is no going back to being a person.' }),
];

// ──────────────────────────────────────────────────────────── Blade ── 刀
const b = T('blade');
const BLADE = [
  b('blade_root', 'Edge Memory', '刃の記憶', 0, 2, 0,
    'Your hands remember a thousand cuts. Physical power +5%.',
    { mods: { statMul: { physicalPower: 0.05 } }, maxRank: 3, perRank: '+5% physical power' }),
  b('blade_combo', 'Fourth Form', '四段', 1, 1, 1,
    'Adds a fourth strike to the light chain and speeds up recovery.',
    { requires: ['blade_root'], mods: { statMul: { attackSpeed: 0.06 } }, maxRank: 2, perRank: '+6% attack speed' }),
  b('blade_heavy', 'Iron Shoulder', '鉄肩', 1, 3, 1,
    'Heavy attacks break posture 25% faster and cost less stamina.',
    { requires: ['blade_root'], mods: { statMul: { postureDamage: 0.25 } }, maxRank: 3, perRank: '+25% posture damage' }),
  b('blade_guard', 'Stone Guard', '岩構え', 2, 4, 1,
    'Guarding drains 30% less stamina and blocks 8% more damage.',
    { requires: ['blade_heavy'], mods: { statMul: { guardStrength: 0.08 } }, maxRank: 3, perRank: '+8% guard strength' }),
  b('blade_parry', 'Reading the Blade', '刃読み', 2, 3, 2,
    'The parry window widens by 60ms. Perfect parries cost no stamina.',
    { requires: ['blade_heavy'], flags: ['parry_wide'], maxRank: 2, perRank: '+30ms parry window' }),
  b('blade_riposte', 'Riposte', '返し', 3, 4, 2,
    'After a perfect parry, your next heavy attack is a guaranteed critical.',
    { requires: ['blade_parry', 'blade_guard'], flags: ['riposte'], cost: 2, flavor: 'You let them commit. Then you take it back.' }),
  b('blade_counter', 'Guard Counter', '受け流し', 3, 3, 3,
    'Blocking a hit within 0.4s lets you answer with an unblockable slash.',
    { requires: ['blade_guard'], flags: ['guard_counter'], cost: 2 }),
  b('blade_whirlwind', 'Whirlwind', '旋風', 2, 1, 2,
    'Unlocks Whirlwind: spin in place, cutting everything around you.',
    { requires: ['blade_combo'], unlock: 'whirlwind', cost: 2 }),
  b('blade_kamaitachi', 'Kamaitachi', '鎌鼬', 3, 0, 2,
    'Unlocks Kamaitachi: three vacuum cuts down a line.',
    { requires: ['blade_whirlwind'], unlock: 'kamaitachi', cost: 2 }),
  b('blade_shadow', 'Shadow Cut', '影斬', 4, 0, 3,
    'Unlocks Shadow Cut: reappear behind your target for a guaranteed critical.',
    { requires: ['blade_kamaitachi'], unlock: 'shadow_cut', cost: 3 }),
  b('blade_sky', 'Sky Step', '森羅', 4, 1, 3,
    'Unlocks Shinra: leap and drive down wrapped in fox-fire.',
    { requires: ['blade_whirlwind'], unlock: 'shinra', cost: 3 }),
  b('blade_bleed', 'Open the Vein', '開血', 3, 2, 3,
    'Bleeding enemies take 20% more physical damage.',
    { requires: ['blade_combo'], mods: { statMul: { physicalPower: 0.08 } }, maxRank: 3, perRank: '+8% physical power' }),
  b('blade_crit', 'Throat Seeker', '喉狙', 3, 2, 2,
    'Critical strikes deal 25% more damage.',
    { requires: ['blade_combo'], mods: { statMul: { critDamage: 0.25 } }, maxRank: 3, perRank: '+25% crit damage' }),
  b('blade_flurry', 'Flurry', '連撃', 4, 2, 4,
    'Landing 8 consecutive hits grants +20% attack speed for 6 seconds.',
    { requires: ['blade_crit', 'blade_bleed'], flags: ['flurry'], cost: 2 }),
  b('blade_executioner', 'Executioner', '処刑人', 5, 1, 4,
    'Enemies below 15% health take 50% more damage from blade techniques.',
    { requires: ['blade_flurry', 'blade_shadow'], mods: { statMul: { physicalPower: 0.12 } }, cost: 3 }),
  b('blade_master', 'Musō', '無双', 5, 2, 5,
    'Blade techniques cost 25% less stamina; light chains never whiff on a staggered foe.',
    { requires: ['blade_executioner', 'blade_sky', 'blade_riposte'], mods: { statMul: { attackSpeed: 0.12, physicalPower: 0.15 } }, cost: 4,
      flavor: 'No peer. Not because you are the best — because the rest stopped counting.' }),
];

// ───────────────────────────────────────────────────────────── Body ── 体
const y = T('body');
const BODY = [
  y('body_root', 'Iron Roots', '鉄根', 0, 2, 0,
    'Stand your ground. Max health +8%.',
    { mods: { statMul: { maxHealth: 0.08 } }, maxRank: 3, perRank: '+8% max health' }),
  y('body_poise', 'Unmoved', '不動', 1, 1, 1,
    'Poise +20%. You finish swings that would interrupt other people.',
    { requires: ['body_root'], mods: { statMul: { poise: 0.2 } }, maxRank: 3, perRank: '+20% poise' }),
  y('body_stamina', 'Long Breath', '長息', 1, 3, 1,
    'Max stamina +15% and it returns 15% faster.',
    { requires: ['body_root'], mods: { statMul: { maxStamina: 0.15, staminaRegen: 0.15 } }, maxRank: 3, perRank: '+15% stamina' }),
  y('body_roll', 'Rolling Stone', '転石', 2, 4, 1,
    'Dodges cover 20% more ground and have 2 extra i-frames.',
    { requires: ['body_stamina'], mods: { statMul: { dodgeIFrames: 0.18 } }, maxRank: 2, perRank: '+18% i-frames' }),
  y('body_air', 'Mountain Legs', '山脚', 2, 4, 2,
    'No fall damage, and you can dodge once in mid-air.',
    { requires: ['body_stamina'], flags: ['airDash', 'noFallDamage'], cost: 2 }),
  y('body_regen', 'Slow Mend', '緩癒', 2, 1, 2,
    'Health regenerates outside combat, up to 40% of maximum.',
    { requires: ['body_poise'], mods: { statMul: { healthRegen: 0.6 } }, maxRank: 3, perRank: '+60% health regen' }),
  y('body_second_wind', 'Second Wind', '再来', 3, 0, 2,
    'Once per rest, survive a killing blow at 25% health instead of dying.',
    { requires: ['body_regen'], flags: ['second_wind'], cost: 3, flavor: 'The fox objects. You are not done.' }),
  y('body_armor', 'Layered Silk', '重絹', 2, 2, 2,
    'Physical defence +12%.',
    { requires: ['body_root'], mods: { statMul: { defense: 0.12 } }, maxRank: 3, perRank: '+12% defence' }),
  y('body_resist', 'Bitter Herbs', '苦草', 3, 3, 2,
    'Status resistance +30%; curses and poisons end twice as fast.',
    { requires: ['body_armor'], mods: { statMul: { statusResist: 0.3 } }, maxRank: 3, perRank: '+30% status resist' }),
  y('body_guard_stam', 'Steady Knees', '穩膝', 3, 2, 3,
    'Guarding and parrying cost 25% less stamina.',
    { requires: ['body_armor'], mods: { statMul: { maxStamina: 0.08 } }, maxRank: 2, perRank: '+8% stamina' }),
  y('body_thorns', 'Thorn Posture', '茨の構', 4, 1, 3,
    'Being hit while guarding deals posture damage back to the attacker.',
    { requires: ['body_second_wind'], flags: ['thorns'], cost: 2 }),
  y('body_endure', 'Endure', '堪忍', 4, 2, 3,
    'Below 35% health you take 20% less damage.',
    { requires: ['body_guard_stam'], mods: { statMul: { maxHealth: 0.1 } }, maxRank: 2, perRank: '+10% max health' }),
  y('body_survivor', 'Last Lantern', '最後の灯', 5, 1, 4,
    'Second Wind also restores 35% health and knocks every nearby foe back.',
    { requires: ['body_thorns', 'body_endure'], flags: ['second_wind_nova'], cost: 3 }),
  y('body_titan', 'Oni’s Frame', '鬼の躯', 5, 2, 4,
    'Max health +20%, poise +35%, but dodge distance drops 10%.',
    { requires: ['body_endure', 'body_resist'], mods: { statMul: { maxHealth: 0.2, poise: 0.35, dodgeIFrames: -0.1 } }, cost: 3 }),
  y('body_immortal', 'Undying Vow', '不死の誓', 5, 2, 5,
    'Your fox dies in your place once per rest, reviving you at full health.',
    { requires: ['body_survivor', 'body_titan'], flags: ['fox_revive'], cost: 4,
      flavor: 'This is the clause you did not read.' }),
];

// ─────────────────────────────────────────────────────────── Spirit ── 霊
const s = T('spirit');
const SPIRIT = [
  s('spirit_root', 'Open Channel', '開通', 0, 2, 0,
    'Focus +12% and it returns a little faster.',
    { mods: { statMul: { maxFocus: 0.12, focusRegen: 0.1 } }, maxRank: 3, perRank: '+12% focus' }),
  s('spirit_regen', 'Steady Stream', '常流', 1, 1, 1,
    'Focus regeneration +25% while standing still.',
    { requires: ['spirit_root'], mods: { statMul: { focusRegen: 0.25 } }, maxRank: 3, perRank: '+25% focus regen' }),
  s('spirit_kill', 'Harvest Breath', '収息', 1, 3, 1,
    'Kills restore 8 Focus. Executions restore 20.',
    { requires: ['spirit_root'], flags: ['focus_on_kill'], maxRank: 2, perRank: '+4 focus per kill' }),
  s('spirit_power', 'Thick Spirit', '濃霊', 2, 4, 1,
    'Spirit power +10%.',
    { requires: ['spirit_kill'], mods: { statMul: { spiritPower: 0.1 } }, maxRank: 3, perRank: '+10% spirit power' }),
  s('spirit_lantern', 'Soul Lantern', '魂灯', 2, 3, 2,
    'Unlocks Tamayura: a lantern that detonates under anyone who walks beneath it.',
    { requires: ['spirit_kill'], unlock: 'tamayura', cost: 2 }),
  s('spirit_drill', 'Spirit Drill', '螺旋', 2, 4, 2,
    'Unlocks Rasen: a corkscrew of spirit that drills through ranks.',
    { requires: ['spirit_power'], unlock: 'rasen', cost: 2 }),
  s('spirit_echo', 'Echo', '山彦', 3, 3, 3,
    'Unlocks Yamabiko: your next ability repeats at reduced strength.',
    { requires: ['spirit_lantern'], unlock: 'yamabiko', cost: 2 }),
  s('spirit_darkness', 'Black Curtain', '暗闇', 3, 4, 3,
    'Unlocks Kurayami: douse the field in fox-darkness.',
    { requires: ['spirit_power'], unlock: 'kurayami', cost: 2 }),
  s('spirit_scout', 'Scout Fox', '偵狐', 2, 1, 2,
    'Unlocks Kuda — Scout: a small fox marks enemies and treasure through walls.',
    { requires: ['spirit_regen'], unlock: 'kuda_scout', cost: 1 }),
  s('spirit_waltz', 'Fox Waltz', '狐舞', 3, 2, 2,
    'Unlocks Kitsune Mai: a blessing dance of speed and focus.',
    { requires: ['spirit_regen'], unlock: 'kitsune_mai', cost: 2 }),
  s('spirit_pounce', 'Pounce', '飛掛', 3, 0, 2,
    'Unlocks Byakko Pounce: the fox slams down where you aim.',
    { requires: ['spirit_scout'], unlock: 'byakko_pounce', cost: 2 }),
  s('spirit_mirror', 'Mirror Fox', '狐鏡', 4, 1, 3,
    'Unlocks Kitsune Kagami: a mirrored double that taunts and reflects.',
    { requires: ['spirit_pounce', 'spirit_waltz'], unlock: 'kitsune_kagami', cost: 3 }),
  s('spirit_attune', 'Attunement', '調律', 3, 2, 3,
    'Spirit defence +20% and you resist being silenced or cursed.',
    { requires: ['spirit_waltz'], mods: { statMul: { spiritDefense: 0.2, statusResist: 0.15 } }, maxRank: 2, perRank: '+20% spirit defence' }),
  s('spirit_overflow', 'Overflow', '溢流', 4, 2, 4,
    'Focus above 90% grants +15% spirit damage. Focus cannot be wasted.',
    { requires: ['spirit_attune'], mods: { statMul: { spiritPower: 0.15 } }, cost: 3 }),
  s('spirit_rapid', 'Rapid Seal', '速封', 4, 3, 4,
    'All cast times are 30% shorter.',
    { requires: ['spirit_echo', 'spirit_darkness'], mods: { statMul: { castSpeed: 0.3 } }, cost: 3 }),
  s('spirit_meditation', 'Deep Meditation', '深禅', 5, 2, 5,
    'Standing still for 3 seconds restores 6% of your Focus every second.',
    { requires: ['spirit_overflow', 'spirit_rapid', 'spirit_mirror'], flags: ['meditate'], cost: 4,
      flavor: 'Sit. Breathe. Let the fox do the listening.' }),
];

// ───────────────────────────────────────────────────────────── Blood ── 血
const o = T('blood');
const BLOOD = [
  o('blood_root', 'Ink of the Contract', '契約の墨', 0, 2, 0,
    'Blood +1 and Spirit +1. The writing on your chest darkens.',
    { mods: { attrAdd: { blood: 1, spirit: 1 } } }),
  o('blood_price', 'Paid in Advance', '先払', 1, 1, 1,
    'Abilities that cost health cost 20% less of it.',
    { requires: ['blood_root'], mods: { statMul: { maxHealth: 0.05 } }, maxRank: 2, perRank: '+5% max health' }),
  o('blood_lifesteal', 'Drinking Deep', '深飲', 1, 3, 1,
    'Lifesteal +4% of the damage you deal.',
    { requires: ['blood_root'], mods: { statAdd: { lifesteal: 4 } }, maxRank: 3, perRank: '+4% lifesteal' }),
  o('blood_sacrifice', 'Contract Sacrifice', '契約供犠', 2, 0, 2,
    'Unlocks Contract Sacrifice: burn health for a flood of power and free casting.',
    { requires: ['blood_price'], unlock: 'contract_sacrifice', cost: 2 }),
  o('blood_field', 'Fox Grass', '狐草', 2, 1, 2,
    'Unlocks Sōgen: tall spirit grass that heals allies and slows enemies.',
    { requires: ['blood_price'], unlock: 'sogen', cost: 2 }),
  o('blood_curse', 'Cursed Tongue', '呪舌', 2, 4, 1,
    'Your statuses last 40% longer and stack one extra time.',
    { requires: ['blood_lifesteal'], mods: { statMul: { statusPower: 0.4 } }, maxRank: 3, perRank: '+40% status power' }),
  o('blood_bleed', 'Rending Fangs', '裂牙', 3, 4, 2,
    'Rend and Bleed deal their damage twice as fast.',
    { requires: ['blood_curse'], mods: { statMul: { statusPower: 0.2 } }, maxRank: 2, perRank: '+20% status power' }),
  o('blood_execute', 'Mercy', '慈悲', 3, 3, 2,
    'Executions heal 8% of max health and reset one ability cooldown.',
    { requires: ['blood_curse'], flags: ['execute_heal'], cost: 2 }),
  o('blood_frenzy', 'Frenzy', '狂乱', 3, 0, 3,
    'Each kill within 5 seconds grants +6% attack speed, stacking to 10.',
    { requires: ['blood_sacrifice'], flags: ['frenzy'], cost: 3 }),
  o('blood_thirst', 'Thirst', '渇き', 3, 1, 3,
    'Below 50% health you deal 15% more damage with everything.',
    { requires: ['blood_field'], mods: { statMul: { physicalPower: 0.08, spiritPower: 0.08 } }, maxRank: 2, perRank: '+8% damage' }),
  o('blood_pact', 'Deeper Pact', '深契', 4, 2, 3,
    'Mutation progress +60%; the fox gains 20% health per stage.',
    { requires: ['blood_thirst', 'blood_frenzy'], mods: { statMul: { mutationProgress: 0.6 } }, cost: 3 }),
  o('blood_devour_soul', 'Soul Devourer', '喰魂', 4, 3, 3,
    'Enemies you kill with an ability have a 20% chance to drop Contract Essence.',
    { requires: ['blood_execute', 'blood_bleed'], flags: ['essence_on_kill'], cost: 2 }),
  o('blood_veins', 'Open Veins', '開脈', 4, 4, 3,
    'Critical hits apply Bleed. Bleeding enemies bleed harder from your crits.',
    { requires: ['blood_bleed'], mods: { statMul: { critChance: 0.05 } }, flags: ['crit_bleed'], cost: 2 }),
  o('blood_martyr', 'Martyr', '殉教', 5, 1, 4,
    'Health costs are converted into damage: every 2% health spent adds 1% damage for 10s.',
    { requires: ['blood_pact', 'blood_frenzy'], flags: ['martyr'], cost: 3 }),
  o('blood_apex', 'The Devil’s Signature', '悪魔の署名', 5, 2, 5,
    'All damage +20%. Your fox attacks 25% faster. Enemies fear you: weaker foes flee.',
    { requires: ['blood_martyr', 'blood_devour_soul', 'blood_veins'],
      mods: { statMul: { physicalPower: 0.2, spiritPower: 0.2, konDamage: 0.25 } }, flags: ['terrifying'], cost: 4,
      flavor: 'Signed. Sealed. Collected upon.' }),
];

export const SKILL_TREES = [
  { id: 'contract', label: 'Contract', kanji: '契約', color: '#ff7a2a', nodes: CONTRACT,
    blurb: 'Everything the fox does, and how often it agrees to do it.' },
  { id: 'blade', label: 'Blade', kanji: '刀', color: '#dfe8ff', nodes: BLADE,
    blurb: 'Steel before spirit. Guards, parries, ripostes, chains.' },
  { id: 'body', label: 'Body', kanji: '体', color: '#8fd18a', nodes: BODY,
    blurb: 'Staying alive long enough to be annoying about it.' },
  { id: 'spirit', label: 'Spirit', kanji: '霊', color: '#8ad8ff', nodes: SPIRIT,
    blurb: 'Focus, tricks, traps and the things that follow you home.' },
  { id: 'blood', label: 'Blood', kanji: '血', color: '#c8443c', nodes: BLOOD,
    blurb: 'What the contract cost, and what it keeps charging.' },
];

export const SKILL_NODES = SKILL_TREES.flatMap((t) => t.nodes);
export const SKILL_NODE_BY_ID = Object.fromEntries(SKILL_NODES.map((n) => [n.id, n]));
export const SKILL_TREE_BY_ID = Object.fromEntries(SKILL_TREES.map((t) => [t.id, t]));

/** Total skill points needed to max every tree (for completion percentages). */
export function treeTotalCost(treeId) {
  return SKILL_TREE_BY_ID[treeId].nodes.reduce((a, n) => a + n.cost * n.maxRank, 0);
}

/**
 * Aggregate the mods from a set of learned ranks: { nodeId: rank }.
 * Returns { statMul, statAdd, attrAdd, flags:Set, unlocks:[] }
 */
export function aggregateSkills(learned) {
  const out = { statMul: {}, statAdd: {}, attrAdd: {}, flags: new Set(), unlocks: [] };
  for (const [id, rank] of Object.entries(learned || {})) {
    const node = SKILL_NODE_BY_ID[id];
    if (!node || rank <= 0) continue;
    const r = Math.min(rank, node.maxRank);
    if (node.unlock) out.unlocks.push(node.unlock);
    for (const f of node.flags || []) out.flags.add(f);
    const m = node.mods || {};
    for (const [stat, v] of Object.entries(m.statMul || {})) out.statMul[stat] = (out.statMul[stat] || 0) + v * r;
    for (const [stat, v] of Object.entries(m.statAdd || {})) out.statAdd[stat] = (out.statAdd[stat] || 0) + v * r;
    for (const [stat, v] of Object.entries(m.attrAdd || {})) out.attrAdd[stat] = (out.attrAdd[stat] || 0) + v * r;
  }
  return out;
}

/** Can the player take this node right now? */
export function canLearn(node, learned, points) {
  const rank = learned?.[node.id] || 0;
  if (rank >= node.maxRank) return { ok: false, reason: 'Mastered' };
  if ((points || 0) < node.cost) return { ok: false, reason: 'Not enough points' };
  for (const req of node.requires || []) {
    if ((learned?.[req] || 0) <= 0) {
      return { ok: false, reason: `Requires ${SKILL_NODE_BY_ID[req]?.name || req}` };
    }
  }
  return { ok: true };
}

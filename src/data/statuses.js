/**
 * Status effects. Damage-over-time, control and buff categories all share the
 * same pipeline: CombatSystem applies them, ticks them, and asks VFX/Audio for
 * the right look and sound per effect.
 */

export const STATUSES = {
  burn: {
    name: 'Burn', kanji: '火傷', kind: 'dot', color: '#ff7a2a', icon: 'flame',
    desc: 'Fox-fire. Burns for spirit damage every second.',
    tick: { type: 'fire', perSecond: 0.6 }, duration: 5, maxStacks: 3,
    vfx: 'burnFlame', sfx: 'burn_tick',
  },
  bleed: {
    name: 'Bleed', kanji: '出血', kind: 'dot', color: '#c8443c', icon: 'drop',
    desc: 'Bleeds for physical damage; doubled while the target is moving.',
    tick: { type: 'physical', perSecond: 0.5, doubleIfMoving: true }, duration: 6, maxStacks: 5,
    vfx: 'bloodDrip', sfx: 'bleed_tick',
  },
  rend: {
    name: 'Rend', kanji: '撕裂', kind: 'debuff', color: '#ff9a5a', icon: 'tear',
    desc: 'Armour torn: takes 12% more damage per stack.',
    mods: { damageTaken: 0.12 }, duration: 8, maxStacks: 3,
    vfx: 'rendMark', sfx: 'rend_apply',
  },
  poison: {
    name: 'Poison', kanji: '毒', kind: 'dot', color: '#8fd18a', icon: 'skull',
    desc: 'Damage over time that ignores armour.',
    tick: { type: 'true', perSecond: 0.45 }, duration: 10, maxStacks: 5,
    vfx: 'poisonBubble', sfx: 'poison_tick',
  },
  curse: {
    name: 'Curse', kanji: '呪い', kind: 'debuff', color: '#8a4bd8', icon: 'curse',
    desc: 'Healing received is halved and focus regeneration stops.',
    mods: { healing: -0.5, focusRegen: -1 }, duration: 8, maxStacks: 2,
    vfx: 'curseGlyph', sfx: 'curse_apply',
  },
  slow: {
    name: 'Slow', kanji: '鈍足', kind: 'control', color: '#8ad8ff', icon: 'snow',
    desc: 'Movement and attack speed reduced.',
    mods: { moveSpeed: -0.35, attackSpeed: -0.25 }, duration: 5, maxStacks: 2,
    vfx: 'frostAura', sfx: 'frost_apply',
  },
  bind: {
    name: 'Bound', kanji: '縛', kind: 'control', color: '#e8d8a8', icon: 'rope',
    desc: 'Cannot move. Can still act.',
    mods: { moveSpeed: -1 }, duration: 6, maxStacks: 1,
    vfx: 'bindTalisman', sfx: 'bind_apply',
  },
  stagger: {
    name: 'Stagger', kanji: '体勢崩し', kind: 'control', color: '#ffe9a8', icon: 'star',
    desc: 'Actions interrupted; briefly helpless.',
    duration: 1.4, maxStacks: 1, interrupt: true,
    vfx: 'staggerStars', sfx: 'stagger_hit',
  },
  shock: {
    name: 'Shock', kanji: '感電', kind: 'control', color: '#a8d8ff', icon: 'bolt',
    desc: 'Interrupts on application and chains to nearby foes.',
    duration: 2.5, maxStacks: 3, interrupt: true, chain: { radius: 6, falloff: 0.5 },
    vfx: 'shockArc', sfx: 'shock_hit',
  },
  blind: {
    name: 'Blinded', kanji: '盲目', kind: 'control', color: '#3a2a2a', icon: 'blind',
    desc: 'Cannot see the player; attacks miss more often.',
    mods: { accuracy: -0.6 }, duration: 8, maxStacks: 1,
    vfx: 'blindSmoke', sfx: 'blind_apply',
  },
  marked: {
    name: 'Marked', kanji: '刻印', kind: 'debuff', color: '#ffe9a8', icon: 'eye',
    desc: 'Visible through walls and takes 35% more damage.',
    mods: { damageTaken: 0.35 }, duration: 18, maxStacks: 1,
    vfx: 'markGlyph', sfx: 'mark_hit',
  },
  possessed: {
    name: 'Possessed', kanji: '憑依', kind: 'control', color: '#c78bff', icon: 'possess',
    desc: 'Fights for you until the body gives out.',
    duration: 14, maxStacks: 1, hostile: false,
    vfx: 'possessAura', sfx: 'possess_cast',
  },
  terrified: {
    name: 'Terrified', kanji: '恐慌', kind: 'control', color: '#8a4bd8', icon: 'fear',
    desc: 'Flees instead of fighting.',
    duration: 6, maxStacks: 1, flee: true,
    vfx: 'fearMark', sfx: 'fear_apply',
  },
  frost: {
    name: 'Frostbite', kanji: '凍傷', kind: 'dot', color: '#bfe6ff', icon: 'snow',
    desc: 'Slows and deals frost damage; stacks into a freeze.',
    tick: { type: 'frost', perSecond: 0.35 }, duration: 6, maxStacks: 5,
    mods: { moveSpeed: -0.1 }, vfx: 'frostAura', sfx: 'frost_apply',
  },
  // ── buffs (same pipeline, positive) ───────────────────────────────────
  fortify: {
    name: 'Fortified', kanji: '堅牢', kind: 'buff', color: '#8fd18a', icon: 'shield',
    desc: 'Damage taken reduced by 25%.',
    mods: { damageTaken: -0.25 }, duration: 20, maxStacks: 1,
    vfx: 'fortifyAura', sfx: 'buff_apply',
  },
  haste: {
    name: 'Hastened', kanji: '迅速', kind: 'buff', color: '#e3c564', icon: 'wind',
    desc: 'Attack and movement speed increased.',
    mods: { attackSpeed: 0.3, moveSpeed: 0.2 }, duration: 20, maxStacks: 1,
    vfx: 'hasteAura', sfx: 'buff_apply',
  },
  devilform: {
    name: 'Devil Form', kanji: '悪魔化', kind: 'buff', color: '#ff2e2e', icon: 'devil',
    desc: 'All damage +60%, damage taken −25%. Drains Focus while active.',
    mods: { damageDealt: 0.6, damageTaken: -0.25 }, duration: 20, maxStacks: 1,
    drain: { focus: 3 }, vfx: 'devilAura', sfx: 'devil_form',
  },
  sacrifice: {
    name: 'Contract Sacrifice', kanji: '供犠', kind: 'buff', color: '#d63a2a', icon: 'blood',
    desc: 'Spirit and physical power surged; abilities cost nothing.',
    mods: { damageDealt: 0.45 }, duration: 15, maxStacks: 1,
    vfx: 'sacrificeAura', sfx: 'sacrifice',
  },
  warded: {
    name: 'Warded', kanji: '結界', kind: 'buff', color: '#e8d8a8', icon: 'ward',
    desc: 'The unclean will not cross the salt line.',
    duration: 20, maxStacks: 1, vfx: 'wardRing', sfx: 'ward_apply',
  },
  meditate: {
    name: 'Meditating', kanji: '禅定', kind: 'buff', color: '#8ad8ff', icon: 'zen',
    desc: 'Restoring Focus rapidly while standing still.',
    duration: 0, maxStacks: 1, vfx: 'meditateAura', sfx: 'meditate',
  },
  frenzy: {
    name: 'Frenzy', kanji: '狂乱', kind: 'buff', color: '#ff7a2a', icon: 'flame',
    desc: 'Attack speed grows with each recent kill.',
    mods: { attackSpeed: 0.06 }, duration: 6, maxStacks: 10,
    vfx: 'frenzyAura', sfx: 'buff_apply',
  },
  flurry: {
    name: 'Flurry', kanji: '連撃', kind: 'buff', color: '#dfe8ff', icon: 'blade',
    desc: 'Attack speed +20% after eight consecutive hits.',
    mods: { attackSpeed: 0.2 }, duration: 6, maxStacks: 1,
    vfx: 'flurryAura', sfx: 'buff_apply',
  },
};

export const STATUS_BY_ID = STATUSES;

/** Damage-type → how defence is applied and what colour the number is. */
export const DAMAGE_TYPES = {
  physical: { label: 'Physical', color: '#e8dcc8', defense: 'defense' },
  spirit: { label: 'Spirit', color: '#8ad8ff', defense: 'spiritDefense' },
  fire: { label: 'Fire', color: '#ff7a2a', defense: 'spiritDefense' },
  frost: { label: 'Frost', color: '#bfe6ff', defense: 'spiritDefense' },
  shock: { label: 'Shock', color: '#a8d8ff', defense: 'spiritDefense' },
  void: { label: 'Void', color: '#8a4bd8', defense: 'spiritDefense' },
  true: { label: 'True', color: '#ffffff', defense: null },
};

export function isDebuff(id) {
  const s = STATUSES[id];
  return !!s && (s.kind === 'dot' || s.kind === 'control' || s.kind === 'debuff');
}

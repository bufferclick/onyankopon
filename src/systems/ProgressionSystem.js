import { bus, EV } from '../core/EventBus.js';
import {
  ATTR_IDS, derive, xpForLevel, levelFromXp, pointsForLevel, totalPointsForLevel, emptyAttributes,
} from '../data/attributes.js';
import {
  SKILL_NODE_BY_ID, SKILL_TREES, aggregateSkills, canLearn, treeTotalCost,
} from '../data/skilltree.js';
import { ABILITY_BY_ID, rankScale } from '../data/abilities.js';
import { MUTATIONS, MUTATION_BY_ID, foxLevelFromXp, mutationStatus } from '../data/mutations.js';

/**
 * Progression: levels, attributes, the skill web, ability ranks, and the fox's
 * parallel mutation track. Also owns the derived-stat pipeline — equipment,
 * skills, mutations and active buffs all funnel into `stats`.
 */
export class ProgressionSystem {
  constructor(save = {}) {
    this.level = save.level ?? 1;
    this.xp = save.xp ?? 0;
    this.attributes = { ...emptyAttributes(1), ...(save.attributes || {}) };
    this.spentPoints = save.spentPoints ?? 0;
    this.skills = { ...(save.skills || {}) };       // nodeId -> rank
    this.skillPoints = save.skillPoints ?? 0;
    this.abilityRanks = { kon: 1, ...(save.abilityRanks || {}) };
    this.foxXp = save.foxXp ?? 0;
    this.foxLevel = save.foxLevel ?? 1;
    this.mutationStage = save.mutationStage ?? 0;
    this.essence = save.essence ?? 0;
    this.gold = save.gold ?? 0;
    this.titles = save.titles ? [...save.titles] : [];
    this.flags = { ...(save.flags || {}) };
    this.unlockedAbilities = new Set(save.unlockedAbilities || ['kon']);
    this.stats = null;
    // external contributors, registered by other systems
    this.equipmentMods = null;
    this.buffs = new Map();      // id -> { mods, duration, stacks }
    this.recompute();
  }

  // ─────────────────────────────────────────────────────────────── xp/level
  get xpIntoLevel() { return levelFromXp(this.xp); }

  get availablePoints() {
    const earned = totalPointsForLevel(this.level);
    return earned - this.spentPoints + (this.bonusPoints || 0);
  }

  addXp(amount, reason = '') {
    const before = this.level;
    this.xp += Math.max(0, Math.round(amount * (this.stats?.xpGain || 1)));
    const after = levelFromXp(this.xp).level;
    bus.emit(EV.XP_GAIN, { amount: Math.round(amount), total: this.xp, reason });
    if (after > before) this.#levelUp(after - before);
    return after - before;
  }

  #levelUp(count) {
    for (let i = 0; i < count; i++) {
      this.level++;
      this.skillPoints += pointsForLevel(this.level) - 2;
      // every level grants 2 attribute points + a skill point every 5 levels
      const info = { level: this.level, attrPoints: 2, skillPoints: pointsForLevel(this.level) - 2 };
      bus.emit(EV.LEVEL_UP, info);
    }
    this.recompute();
  }

  spendAttribute(attrId) {
    if (!ATTR_IDS.includes(attrId)) return false;
    if (this.availablePoints <= 0) return false;
    if ((this.attributes[attrId] || 0) >= 99) return false;
    this.attributes[attrId] = (this.attributes[attrId] || 0) + 1;
    this.spentPoints++;
    this.recompute();
    bus.emit(EV.ATTRIBUTE_CHANGE, { attr: attrId, value: this.attributes[attrId] });
    return true;
  }

  refundAttributes() {
    // Costs essence — the shrine charges for regret.
    const cost = Math.max(1, Math.round(this.level * 1.5));
    if (this.essence < cost) return { ok: false, cost, reason: 'Not enough Contract Essence' };
    this.essence -= cost;
    const spent = this.spentPoints;
    this.attributes = emptyAttributes(1);
    this.spentPoints = 0;
    this.recompute();
    return { ok: true, cost, refunded: spent };
  }

  // ───────────────────────────────────────────────────────────────── skills
  skillRank(nodeId) { return this.skills[nodeId] || 0; }

  canLearnSkill(nodeId) {
    const node = SKILL_NODE_BY_ID[nodeId];
    if (!node) return { ok: false, reason: 'Unknown' };
    return canLearn(node, this.skills, this.skillPoints);
  }

  learnSkill(nodeId) {
    const node = SKILL_NODE_BY_ID[nodeId];
    if (!node) return false;
    const check = this.canLearnSkill(nodeId);
    if (!check.ok) return false;
    this.skills[nodeId] = (this.skills[nodeId] || 0) + 1;
    this.skillPoints -= node.cost;
    if (node.unlock) {
      this.unlockedAbilities.add(node.unlock);
      bus.emit(EV.ABILITY_UNLOCKED, { id: node.unlock, ability: ABILITY_BY_ID[node.unlock] });
    }
    this.recompute();
    bus.emit(EV.SKILL_LEARNED, { id: nodeId, rank: this.skills[nodeId], node });
    bus.emit(EV.SKILL_POINTS, { points: this.skillPoints });
    return true;
  }

  refundSkills() {
    const cost = Math.max(1, Math.round(this.level * 2));
    if (this.essence < cost) return { ok: false, cost };
    let points = 0;
    for (const [id, rank] of Object.entries(this.skills)) {
      const node = SKILL_NODE_BY_ID[id];
      if (!node) continue;
      points += node.cost * rank;
    }
    this.skills = {};
    this.skillPoints += points;
    // keep only abilities granted by mutations or the start of the game
    const kept = new Set(['kon']);
    for (let i = 0; i <= this.mutationStage; i++) {
      const m = MUTATIONS[i];
      if (m) for (const a of m.unlocks || []) kept.add(a);
    }
    this.unlockedAbilities = kept;
    this.essence -= cost;
    this.recompute();
    return { ok: true, cost, points };
  }

  // ────────────────────────────────────────────────────────────── abilities
  abilityRank(id) { return this.abilityRanks[id] || 1; }

  rankUpAbility(id) {
    const ability = ABILITY_BY_ID[id];
    if (!ability || !this.unlockedAbilities.has(id)) return false;
    const rank = this.abilityRank(id);
    if (rank >= (ability.maxRank || 1)) return false;
    const cost = 2 + rank * 2;                 // essence
    if (this.essence < cost) return false;
    this.essence -= cost;
    this.abilityRanks[id] = rank + 1;
    return true;
  }

  abilityRankCost(id) {
    const rank = this.abilityRank(id);
    return 2 + rank * 2;
  }

  hasAbility(id) { return this.unlockedAbilities.has(id); }

  /** Fully scaled ability definition (damage/cooldown/radius for current rank). */
  scaledAbility(id) {
    const a = ABILITY_BY_ID[id];
    if (!a) return null;
    const s = rankScale(a, this.abilityRank(id));
    return { ...a, rank: s.rank, scaled: s };
  }

  // ───────────────────────────────────────────────────────────── mutations
  get mutation() { return MUTATIONS[this.mutationStage] || MUTATIONS[0]; }
  get nextMutation() { return MUTATIONS[this.mutationStage + 1] || null; }

  addFoxXp(amount) {
    this.foxXp += Math.max(0, Math.round(amount * this.stats.mutationProgress));
    const { level } = foxLevelFromXp(this.foxXp);
    if (level > this.foxLevel) {
      const gained = level - this.foxLevel;
      this.foxLevel = level;
      bus.emit(EV.FOX_LEVEL, { level, gained });
    }
    return level;
  }

  mutationState() {
    const next = this.nextMutation;
    if (!next) return { unlocked: false, missing: [], maxed: true };
    return mutationStatus(next, {
      foxLevel: this.foxLevel, attributes: this.attributes, level: this.level,
      completedQuests: this.completedQuests || [],
    });
  }

  canMutate() {
    const next = this.nextMutation;
    if (!next) return { ok: false, reason: 'The contract is complete.' };
    const st = this.mutationState();
    if (!st.unlocked) return { ok: false, reason: st.missing.join(', '), missing: st.missing };
    const cost = next.cost?.essence || 0;
    if (this.essence < cost) return { ok: false, reason: `Needs ${cost} Contract Essence`, cost };
    return { ok: true, cost };
  }

  mutate() {
    const check = this.canMutate();
    if (!check.ok) return check;
    const next = this.nextMutation;
    this.essence -= check.cost || 0;
    this.mutationStage++;
    for (const a of next.unlocks || []) this.unlockedAbilities.add(a);
    this.recompute();
    bus.emit(EV.MUTATION, { stage: this.mutationStage, mutation: next });
    return { ok: true, mutation: next };
  }

  // ───────────────────────────────────────────────────────────────── stats
  /** Rebuild derived stats from attributes + skills + equipment + mutation. */
  recompute() {
    const skillAgg = aggregateSkills(this.skills);
    const mut = this.mutation;
    const mods = {
      attrAdd: { ...skillAgg.attrAdd },
      statAdd: { ...skillAgg.statAdd },
      statMul: { ...skillAgg.statMul },
    };
    // mutation bonuses: the fox is the biggest single power spike in the game
    if (mut && mut.stage > 0) {
      mods.statMul.spiritPower = (mods.statMul.spiritPower || 0) + (mut.damageMult - 1) * 0.45;
      mods.statMul.konDamage = (mods.statMul.konDamage || 0) + (mut.damageMult - 1) * 0.8;
      mods.statAdd.maxHealth = (mods.statAdd.maxHealth || 0) + Math.round((mut.healthMult - 1) * 40);
    }
    // equipment
    const eq = this.equipmentMods;
    if (eq) {
      for (const [k, v] of Object.entries(eq.attrAdd || {})) mods.attrAdd[k] = (mods.attrAdd[k] || 0) + v;
      for (const [k, v] of Object.entries(eq.statAdd || {})) mods.statAdd[k] = (mods.statAdd[k] || 0) + v;
      for (const [k, v] of Object.entries(eq.statMul || {})) mods.statMul[k] = (mods.statMul[k] || 0) + v;
    }
    // active buffs
    for (const buff of this.buffs.values()) {
      for (const [k, v] of Object.entries(buff.mods?.statAdd || {})) mods.statAdd[k] = (mods.statAdd[k] || 0) + v * buff.stacks;
      for (const [k, v] of Object.entries(buff.mods?.statMul || {})) mods.statMul[k] = (mods.statMul[k] || 0) + v * buff.stacks;
    }
    this.stats = derive(this.attributes, this.level, mods);
    this.stats.konDamage *= this.mutation?.damageMult || 1;
    this.flagsFromSkills = skillAgg.flags;
    return this.stats;
  }

  hasFlag(flag) { return this.flagsFromSkills?.has(flag) || !!this.flags[flag]; }

  addBuff(id, { mods = {}, duration = 10, stacks = 1 } = {}) {
    const existing = this.buffs.get(id);
    if (existing) {
      existing.stacks = Math.min(existing.maxStacks || 1, existing.stacks + stacks);
      existing.duration = Math.max(existing.duration, duration);
      existing.t = 0;
    } else {
      this.buffs.set(id, { id, mods, duration, stacks, t: 0, maxStacks: stacks > 1 ? 10 : 1 });
    }
    this.recompute();
  }

  removeBuff(id) {
    if (this.buffs.delete(id)) this.recompute();
  }

  updateBuffs(dt) {
    let changed = false;
    for (const [id, b] of [...this.buffs]) {
      b.t += dt;
      if (b.t >= b.duration) { this.buffs.delete(id); changed = true; }
    }
    if (changed) this.recompute();
  }

  // ──────────────────────────────────────────────────────────── currencies
  addEssence(n) { this.essence = Math.max(0, this.essence + n); bus.emit(EV.CURRENCY, { essence: this.essence }); }
  addGold(n) {
    const gain = Math.round(n * (1 + (this.stats?.goldGain || 0) / 100));
    this.gold += gain;
    bus.emit(EV.CURRENCY, { gold: this.gold, gained: gain });
    return gain;
  }

  // ─────────────────────────────────────────────────────────── serialize
  toJSON() {
    return {
      level: this.level, xp: this.xp, attributes: this.attributes, spentPoints: this.spentPoints,
      skills: this.skills, skillPoints: this.skillPoints, abilityRanks: this.abilityRanks,
      foxXp: this.foxXp, foxLevel: this.foxLevel, mutationStage: this.mutationStage,
      essence: this.essence, gold: this.gold, titles: this.titles, flags: this.flags,
      unlockedAbilities: [...this.unlockedAbilities],
    };
  }

  static fromJSON(data) { return new ProgressionSystem(data); }

  /** Completion percentage across all five trees (for the character sheet). */
  treeProgress(treeId) {
    const tree = SKILL_TREES.find((t) => t.id === treeId);
    if (!tree) return { spent: 0, total: 0, pct: 0 };
    let spent = 0, total = 0;
    for (const node of tree.nodes) {
      total += node.cost * node.maxRank;
      spent += node.cost * (this.skills[node.id] || 0);
    }
    return { spent, total, pct: total ? spent / total : 0 };
  }
}

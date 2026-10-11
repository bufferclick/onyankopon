import { QUESTS, QUEST_BY_ID } from '../data/quests.js';
import { bus, EV } from '../core/EventBus.js';
import { clamp, clamp01 } from '../core/MathUtils.js';

/**
 * QuestSystem — 50 quests, 16 objective types, one tracker.
 *
 * Objectives are declarative (`{type:'kill', target:'bandit', count:6}`) so the
 * tracker is just a switch: every gameplay event fans out here and bumps the
 * counters it matches. Quests auto-start when their prerequisites are met and
 * are handed out by NPCs via `offers(npcId)`.
 */
export class QuestSystem {
  constructor({ progression, game = null }) {
    this.progression = progression;
    this.game = game;
    this.active = new Map();     // questId -> { id, progress: {objId: n}, startedAt, done }
    this.completed = new Set();
    this.failed = new Set();
    this.discovered = new Set();
    this.log = [];               // recent journal entries for the HUD
    this.wave = null;            // active wave defence
    this.survive = null;
    this.#hook();
  }

  get all() { return QUESTS; }

  #hook() {
    bus.on(EV.KILL, ({ target, source }) => {
      if (source?.isPlayer) this.onKill(target);
    });
    bus.on(EV.LOOT, ({ item, count }) => this.onCollect(item, count));
    bus.on(EV.ABILITY_USED, ({ id }) => this.onAbility(id));
    bus.on(EV.PARRY, () => this.bump('parry'));
    bus.on(EV.EXECUTE, () => this.bump('execute'));
    bus.on(EV.DISCOVERY, ({ poi }) => this.onDiscover(poi));
    bus.on(EV.MUTATION, () => this.bump('mutation'));
    bus.on(EV.CRAFT, ({ item }) => this.bump('craft', { item }));
    bus.on(EV.DIALOGUE_CLOSE, ({ npc }) => { if (npc) this.onTalk(npc); });
  }

  // ───────────────────────────────────────────────────────────── lifecycle
  isActive(id) { return this.active.has(id); }
  isCompleted(id) { return this.completed.has(id); }
  isUnlocked(q) {
    if (this.completed.has(q.id) || this.active.has(q.id)) return false;
    const p = q.prereq || {};
    if (p.quest && !this.completed.has(p.quest)) return false;
    if (p.quests && !p.quests.every((x) => this.completed.has(x))) return false;
    if (p.level && this.progression.level < p.level) return false;
    if (p.mutation && this.progression.mutationStage < p.mutation) return false;
    if (p.ability && !this.progression.hasAbility(p.ability)) return false;
    return true;
  }

  /** Quests an NPC is currently able to offer. */
  offers(npcId) {
    return QUESTS.filter((q) => q.giver === npcId && this.isUnlocked(q));
  }

  /** Quests whose turn-in is this NPC. */
  turnIns(npcId) {
    return [...this.active.values()].filter((a) => {
      const q = QUEST_BY_ID[a.id];
      if (!q || !this.#objectivesDone(a)) return false;
      const last = q.objectives[q.objectives.length - 1];
      return (last.type === 'talk' && last.npc === npcId) || q.giver === npcId;
    });
  }

  start(id) {
    const q = QUEST_BY_ID[id];
    if (!q || this.active.has(id) || this.completed.has(id)) return false;
    const st = { id, progress: {}, startedAt: Date.now(), done: false };
    for (const o of q.objectives || []) st.progress[o.id] = 0;
    this.active.set(id, st);
    this.#push(q, 'started');
    bus.emit(EV.QUEST_START, { quest: q });
    // objectives that are already satisfied the moment you accept
    this.#refresh(st);
    return true;
  }

  complete(id) {
    const q = QUEST_BY_ID[id];
    const st = this.active.get(id);
    if (!q || !st) return false;
    this.active.delete(id);
    this.completed.add(id);
    const r = q.rewards || {};
    if (r.xp) this.progression.addXp(r.xp, `quest:${id}`);
    if (r.gold) this.progression.addGold(r.gold);
    if (r.essence) this.progression.addEssence(r.essence);
    if (r.skillPoint) this.progression.skillPoints += r.skillPoint;
    if (r.unlockAbility && !this.progression.hasAbility(r.unlockAbility)) {
      this.progression.unlockedAbilities.add(r.unlockAbility);
      bus.emit(EV.ABILITY_UNLOCKED, { id: r.unlockAbility });
    }
    for (const it of r.items || []) {
      this.game?.giveItem?.(it.id, it.count || 1);
    }
    this.#push(q, 'complete');
    bus.emit(EV.QUEST_COMPLETE, { quest: q, rewards: r });
    // chained quests start automatically
    for (const next of QUESTS) {
      if (next.prereq?.quest === id && this.isUnlocked(next) && next.autoStart) this.start(next.id);
    }
    return true;
  }

  fail(id, reason = '') {
    const st = this.active.get(id);
    if (!st) return;
    this.active.delete(id);
    this.failed.add(id);
    bus.emit(EV.QUEST_FAIL, { quest: QUEST_BY_ID[id], reason });
    this.#push(QUEST_BY_ID[id], 'failed');
  }

  #refresh(st) {
    const q = QUEST_BY_ID[st.id];
    if (!q) return;
    let allDone = true;
    for (const o of q.objectives || []) {
      if (!this.#objectiveDone(st, o)) allDone = false;
    }
    if (allDone && !st.done) {
      st.done = true;
      bus.emit(EV.QUEST_UPDATE, { quest: q, complete: true });
      this.#push(q, 'ready');
      // quests whose final objective isn't a talk turn-in finish immediately
      const last = q.objectives[q.objectives.length - 1];
      if (!last || last.type !== 'talk') this.complete(q.id);
    }
  }

  #objectiveDone(st, o) {
    const have = st.progress[o.id] || 0;
    const need = o.count ?? o.rounds ?? o.seconds ?? o.stage ?? 1;
    return have >= need;
  }

  #objectivesDone(st) {
    const q = QUEST_BY_ID[st.id];
    return (q?.objectives || []).every((o) => this.#objectiveDone(st, o));
  }

  bump(type, ctx = {}) {
    for (const st of this.active.values()) {
      const q = QUEST_BY_ID[st.id];
      if (!q) continue;
      for (const o of q.objectives || []) {
        if (o.type !== type) continue;
        if (o.target && ctx.target && o.target !== ctx.target) continue;
        if (o.item && ctx.item && o.item !== ctx.item) continue;
        if (o.ability && ctx.ability && o.ability !== ctx.ability) continue;
        if (o.done) continue;
        const need = o.count ?? o.rounds ?? o.seconds ?? o.stage ?? 1;
        const prev = st.progress[o.id] || 0;
        if (prev >= need) continue;
        st.progress[o.id] = Math.min(need, prev + (ctx.amount ?? 1));
        bus.emit(EV.OBJECTIVE_COMPLETE, { quest: q, objective: o, have: st.progress[o.id], need });
      }
      this.#refresh(st);
    }
  }

  // ─────────────────────────────────────────────────────────────── events
  onKill(enemy) {
    const id = enemy.def?.id || enemy.id;
    this.bump('kill', { target: id });
    this.bump('boss', { target: id });
    if (enemy.def?.boss) this.bump('boss', { target: id });
    // wave defence
    if (this.wave && this.wave.spawned.includes(enemy)) {
      this.wave.killed++;
      if (this.wave.killed >= this.wave.need) {
        this.bump('wave', { amount: this.wave.round });
        this.wave = null;
      }
    }
  }

  onCollect(item, count = 1) {
    this.bump('collect', { item, amount: count });
    this.bump('deliver', { item, amount: count });
    this.bump('essence', { item, amount: count });
  }

  onTalk(npcId) { this.bump('talk', { target: npcId, item: npcId, ability: npcId }); }
  onAbility(id) { this.bump('ability', { ability: id }); }
  onDiscover(poiId) {
    if (this.discovered.has(poiId)) return;
    this.discovered.add(poiId);
    this.bump('discover', { target: poiId });
    this.bump('reach', { target: poiId });
  }
  onPoiReached(poiId) { this.onDiscover(poiId); }

  /** Timed "survive" objectives and wave spawns. */
  update(dt) {
    for (const st of this.active.values()) {
      const q = QUEST_BY_ID[st.id];
      if (!q) continue;
      for (const o of q.objectives || []) {
        if (o.type === 'survive' && st.progress[o.id] !== undefined) {
          st.progress[o.id] = Math.min(o.seconds ?? 60, (st.progress[o.id] || 0) + dt);
        }
      }
      this.#refresh(st);
    }
  }

  // ──────────────────────────────────────────────────────────── reporting
  /** Flat list for the journal UI. */
  journal() {
    const out = [];
    for (const st of this.active.values()) {
      const q = QUEST_BY_ID[st.id];
      if (!q) continue;
      out.push({
        id: q.id, title: q.title, kanji: q.kanji, chain: q.chain, region: q.region,
        blurb: q.blurb, ready: st.done,
        objectives: (q.objectives || []).map((o) => ({
          id: o.id, text: o.text, have: Math.floor(st.progress[o.id] || 0),
          need: o.count ?? o.rounds ?? o.seconds ?? o.stage ?? 1,
          done: this.#objectiveDone(st, o),
        })),
      });
    }
    return out;
  }

  completedList() {
    return [...this.completed].map((id) => QUEST_BY_ID[id]).filter(Boolean);
  }

  get completionPct() {
    return clamp01(this.completed.size / QUESTS.length);
  }

  #push(quest, kind) {
    this.log.unshift({ quest: quest?.id, title: quest?.title, kind, at: Date.now() });
    if (this.log.length > 40) this.log.pop();
  }

  // ─────────────────────────────────────────────────────────── serialize
  toJSON() {
    return {
      active: [...this.active.values()],
      completed: [...this.completed],
      failed: [...this.failed],
      discovered: [...this.discovered],
    };
  }

  fromJSON(data) {
    if (!data) return;
    this.active = new Map((data.active || []).map((s) => [s.id, s]));
    this.completed = new Set(data.completed || []);
    this.failed = new Set(data.failed || []);
    this.discovered = new Set(data.discovered || []);
  }
}

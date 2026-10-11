/** Minimal synchronous pub/sub used to keep systems decoupled from the UI. */
export class EventBus {
  constructor() { this.map = new Map(); }

  on(type, fn) {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type).add(fn);
    return () => this.off(type, fn);
  }

  once(type, fn) {
    const off = this.on(type, (payload) => { off(); fn(payload); });
    return off;
  }

  off(type, fn) {
    this.map.get(type)?.delete(fn);
  }

  emit(type, payload) {
    const set = this.map.get(type);
    if (!set) return;
    // copy: handlers may subscribe/unsubscribe during dispatch
    for (const fn of [...set]) {
      try { fn(payload); } catch (err) { console.error(`[bus] handler for "${type}" threw`, err); }
    }
    const wild = this.map.get('*');
    if (wild) for (const fn of [...wild]) { try { fn({ type, payload }); } catch { /* ignore */ } }
  }

  clear() { this.map.clear(); }
}

export const bus = new EventBus();

/** Event name registry so typos show up as undefined keys, not silent no-ops. */
export const EV = {
  // lifecycle
  GAME_START: 'game:start',
  GAME_PAUSE: 'game:pause',
  GAME_RESUME: 'game:resume',
  SAVE: 'game:save',
  LOAD: 'game:load',
  // progression
  XP_GAIN: 'xp:gain',
  LEVEL_UP: 'player:levelup',
  ATTRIBUTE_CHANGE: 'player:attribute',
  SKILL_LEARNED: 'skill:learned',
  SKILL_POINTS: 'skill:points',
  MUTATION: 'fox:mutation',
  FOX_LEVEL: 'fox:level',
  // combat
  DAMAGE: 'combat:damage',
  HIT: 'combat:hit',
  KILL: 'combat:kill',
  PARRY: 'combat:parry',
  BLOCK: 'combat:block',
  DODGE: 'combat:dodge',
  EXECUTE: 'combat:execute',
  PLAYER_DIED: 'combat:playerDied',
  ABILITY_USED: 'ability:used',
  ABILITY_UNLOCKED: 'ability:unlocked',
  STATUS_APPLIED: 'combat:status',
  // quests & world
  QUEST_START: 'quest:start',
  QUEST_UPDATE: 'quest:update',
  QUEST_COMPLETE: 'quest:complete',
  QUEST_FAIL: 'quest:fail',
  OBJECTIVE_COMPLETE: 'quest:objective',
  DIALOGUE_OPEN: 'dialogue:open',
  DIALOGUE_CLOSE: 'dialogue:close',
  REGION_ENTER: 'world:region',
  DISCOVERY: 'world:discovery',
  LOOT: 'item:loot',
  ITEM_USED: 'item:used',
  EQUIP: 'item:equip',
  CRAFT: 'item:craft',
  CURRENCY: 'item:currency',
  // ui
  TOAST: 'ui:toast',
  NARRATE: 'ui:narrate',
  SCREEN_SHAKE: 'fx:shake',
  HITSTOP: 'fx:hitstop',
  BOSS: 'ui:boss',
  SETTINGS_CHANGE: 'settings:change',
};

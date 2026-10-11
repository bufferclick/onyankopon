import { bus, EV } from '../core/EventBus.js';
import { ABILITY_BY_ID, ABILITIES } from '../data/abilities.js';
import { SKILL_TREES } from '../data/skilltree.js';
import { ATTRIBUTES, previewPoint } from '../data/attributes.js';
import { MUTATIONS } from '../data/mutations.js';
import { ITEMS, ITEM_BY_ID, RARITY, recipesFor } from '../data/items.js';
import { QUESTS, QUEST_BY_ID } from '../data/quests.js';
import { NPC_BY_ID } from '../data/npcs.js';
import { ENEMIES, ENEMY_BY_ID } from '../data/enemies.js';
import { POIS, REGIONS, WORLD } from '../data/regions.js';
import { CODEX, CODEX_GROUPS } from '../data/lore.js';
import { STATUSES } from '../data/statuses.js';
import { clamp01 } from '../core/MathUtils.js';

/**
 * Full-screen panels: character & skills, inventory, journal, map, codex,
 * and the dialogue/shop window. One DOM host, rendered on open.
 */
export class Panels {
  constructor(game, ui) {
    this.game = game;
    this.ui = ui;
    this.root = document.getElementById('panels');
    this.current = null;
    this.tab = 'attributes';
    this.sel = null;
    this.#build();
  }

  #build() {
    this.root.innerHTML = `
      <div class="scrim"></div>
      <div class="panel paper">
        <div class="head">
          <h2 id="pTitle">Character</h2>
          <span class="sub" id="pSub"></span>
          <div class="spacer"></div>
          <div class="tabs" id="pTabs"></div>
          <button class="btn small ghost" id="pClose">Close · Esc</button>
        </div>
        <div class="body" id="pBody"></div>
      </div>
    `;
    this.elTitle = this.root.querySelector('#pTitle');
    this.elSub = this.root.querySelector('#pSub');
    this.elTabs = this.root.querySelector('#pTabs');
    this.elBody = this.root.querySelector('#pBody');
    this.root.querySelector('#pClose').onclick = () => this.close();
    this.root.querySelector('.scrim').onclick = () => this.close();
  }

  get isOpen() { return !!this.current; }

  open(name, arg = null) {
    if (this.current === name && !arg) { this.close(); return; }
    this.current = name;
    this.arg = arg;
    this.root.classList.add('open');
    document.body.classList.add('ui-open');
    this.render();
  }

  close() {
    this.current = null;
    this.root.classList.remove('open');
    document.body.classList.remove('ui-open');
    bus.emit(EV.DIALOGUE_CLOSE, {});
  }

  setTab(t) { this.tab = t; this.render(); }

  render() {
    if (!this.current) return;
    const titles = {
      character: 'Character', inventory: 'Inventory', journal: 'Journal',
      map: 'World Map', codex: 'Codex', dialogue: '—',
    };
    this.elTitle.textContent = titles[this.current] || this.current;
    const g = this.game;
    this.elSub.textContent = this.current === 'character'
      ? `Level ${g.progression.level} · ${g.progression.mutation.name} · ${g.progression.skillPoints} points`
      : this.current === 'inventory' ? `${g.inventory.size} items · ${g.progression.gold} mon`
      : this.current === 'journal' ? `${g.quests.completed.size} / ${QUESTS.length} complete`
      : '';

    const tabs = {
      character: ['attributes', 'skills', 'abilities', 'fox'],
      inventory: ['items', 'crafting'],
      journal: ['active', 'completed'],
      codex: ['bestiary', 'lore', 'statuses'],
      map: [], dialogue: [],
    }[this.current] || [];
    this.elTabs.innerHTML = tabs.map((t) => `<button class="tab ${this.tab === t ? 'active' : ''}" data-tab="${t}">${t}</button>`).join('');
    this.elTabs.querySelectorAll('.tab').forEach((b) => { b.onclick = () => this.setTab(b.dataset.tab); });

    const fn = this[`view_${this.current}`];
    this.elBody.innerHTML = '';
    if (fn) fn.call(this, this.arg);
  }

  // ───────────────────────────────────────────────────────────── character
  view_character() {
    const g = this.game;
    const wrap = document.createElement('div');
    wrap.className = 'cols three';
    wrap.innerHTML = `<div class="col scroll" id="cLeft"></div><div class="col scroll detail" id="cMid"></div><div class="col scroll" id="cRight"></div>`;
    this.elBody.appendChild(wrap);
    const left = wrap.querySelector('#cLeft');
    const mid = wrap.querySelector('#cMid');
    const right = wrap.querySelector('#cRight');

    // derived stat sheet on the right, always visible
    const stats = g.progression.stats;
    const rows = [
      ['Vitality', `${Math.round(stats.maxHealth)}`], ['Stamina', `${Math.round(stats.maxStamina)}`],
      ['Focus', `${Math.round(stats.maxFocus)}`], ['Poise', `${Math.round(stats.poise)}`],
      ['Physical Power', stats.physicalPower?.toFixed(1)], ['Spirit Power', stats.spiritPower?.toFixed(1)],
      ['Defense', Math.round(stats.defense)], ['Spirit Def.', Math.round(stats.spiritDefense)],
      ['Crit', `${stats.critChance?.toFixed(1)}% ×${stats.critDamage?.toFixed(0)}%`],
      ['Move Speed', stats.moveSpeed?.toFixed(2)], ['Attack Speed', `${(stats.attackSpeed ?? 1).toFixed(2)}×`],
      ['Kon Damage', `${(stats.konDamage ?? 1).toFixed(2)}×`],
      ['Dodge i-frames', `${(stats.dodgeIFrames ?? 0.3).toFixed(2)}s`],
      ['Parry window', `${(0.22).toFixed(2)}s`],
      ['Lifesteal', `${(stats.lifesteal ?? 0).toFixed(1)}%`],
      ['Gold gain', `+${(stats.goldGain ?? 0).toFixed(0)}%`],
      ['XP gain', `+${(stats.xpGain ?? 0).toFixed(0)}%`],
    ];
    right.innerHTML = `<div class="label" style="margin-bottom:12px">Derived</div>
      <div class="kv" style="grid-template-columns:1fr auto;gap:6px 12px">
        ${rows.map(([k, v]) => `<dt>${k}</dt><dd class="num">${v}</dd>`).join('')}
      </div>`;

    if (this.tab === 'attributes') {
      const pts = g.progression.availablePoints;
      left.innerHTML = `<div class="label" style="margin-bottom:14px">Attributes · ${pts} unspent</div>`;
      for (const a of ATTRIBUTES) {
        const val = g.progression.attributes[a.id] || 0;
        const row = document.createElement('div');
        row.className = 'attr';
        row.innerHTML = `
          <div class="n"><em>${a.kanji}</em>${a.name}</div>
          <div class="bar"><i style="width:${Math.min(100, val / 60 * 100)}%"></i></div>
          <div class="v">${val}</div>
          <button ${pts <= 0 ? 'disabled' : ''}>+</button>`;
        row.querySelector('button').onclick = () => {
          if (g.progression.spendAttribute(a.id)) { g.progression.recompute(); this.render(); this.ui.hud.toast({ text: `${a.name} +1`, kind: 'good', ttl: 1400 }); }
        };
        row.title = `${a.desc}\nNext point: ${previewPoint(a.id, g.progression.stats)}`;
        left.appendChild(row);
      }
      const btn = document.createElement('button');
      btn.className = 'btn small';
      btn.textContent = `Respec — ${g.progression.essence ? 1 : 0} essence`;
      btn.style.marginTop = '18px';
      btn.onclick = () => { g.progression.refundAttributes(); this.render(); };
      left.appendChild(btn);

      mid.innerHTML = `<h3>The six measures</h3>
        <p>Every point is a promise. Blood makes the fox bite harder. Spirit makes
        it bite longer. Cunning is the difference between a parry and a funeral.</p>
        <div class="stats">${ATTRIBUTES.map((a) => `<div class="stat"><span>${a.name}</span><span>${a.romaji}</span></div>`).join('')}</div>
        <div class="flavor">"Give me a body and I will give you a province." — the first contractor</div>`;
    }

    if (this.tab === 'skills') {
      const trees = SKILL_TREES;
      left.innerHTML = `<div class="label" style="margin-bottom:14px">Trees · ${g.progression.skillPoints} points</div>` +
        trees.map((t) => `<div class="entry" data-tree="${t.id}"><div class="t"><span>${t.name}</span><span class="r">${(g.progression.treeProgress(t.id) * 100).toFixed(0)}%</span></div><div class="d">${t.blurb || ''}</div></div>`).join('');
      const tree = trees.find((t) => t.id === (this.sel?.tree || trees[0].id)) || trees[0];
      left.querySelectorAll('[data-tree]').forEach((e) => {
        if (e.dataset.tree === tree.id) e.classList.add('selected');
        e.onclick = () => { this.sel = { tree: e.dataset.tree }; this.render(); };
      });
      mid.innerHTML = `<h3>${tree.name}</h3><div class="skill-tree">${tree.nodes.map((n) => {
        const rank = g.progression.skillRank(n.id);
        const can = g.progression.canLearnSkill(n.id);
        const maxed = rank >= (n.max || 1);
        return `<div class="skill-node ${maxed ? 'maxed' : rank ? 'owned' : can.ok ? 'available' : 'locked'}" data-node="${n.id}">
          <div class="row"><span class="nm">${n.name} ${n.kanji ? `<span style="color:var(--vermillion)">${n.kanji}</span>` : ''}</span>
          <span class="rank">${maxed ? 'MAX' : `${rank}/${n.max || 1}`} ${'<i class="pip"></i>'.repeat(rank)}</span></div>
          <div class="ds">${n.desc}</div>
          <div class="req">${n.cost || 1} point${(n.cost || 1) > 1 ? 's' : ''}${n.requires?.length ? ` · needs ${n.requires.join(', ')}` : ''}${n.ability ? ` · grants ${ABILITY_BY_ID[n.ability]?.name || n.ability}` : ''}</div>
        </div>`;
      }).join('')}</div>`;
      mid.querySelectorAll('[data-node]').forEach((el) => {
        el.onclick = () => {
          const res = g.progression.learnSkill(el.dataset.node);
          this.ui.hud.toast(res.ok
            ? { text: `Learned — ${el.querySelector('.nm').textContent.trim()}`, kind: 'good' }
            : { text: res.why || 'Cannot learn', kind: 'warn' });
          this.render();
        };
      });
    }

    if (this.tab === 'abilities') {
      const owned = ABILITIES.filter((a) => g.progression.hasAbility(a.id));
      left.innerHTML = `<div class="label" style="margin-bottom:14px">Known · ${owned.length}/${ABILITIES.length}</div>` +
        ABILITIES.map((a) => {
          const has = g.progression.hasAbility(a.id);
          const rank = g.progression.abilityRank(a.id);
          return `<div class="entry ${has ? '' : 'locked'}" data-ab="${a.id}">
            <div class="t"><span>${a.kanji} ${a.name}</span><span class="r">${has ? `R${rank}` : '—'}</span></div>
            <div class="meta"><span>${a.tree}</span><span>${a.kind}</span></div></div>`;
        }).join('');
      const ab = ABILITY_BY_ID[this.sel?.ab || owned[0]?.id || 'kon'];
      left.querySelectorAll('[data-ab]').forEach((e) => {
        if (e.dataset.ab === ab.id) e.classList.add('selected');
        e.onclick = () => { this.sel = { ab: e.dataset.ab }; this.render(); };
      });
      const has = g.progression.hasAbility(ab.id);
      const rank = g.progression.abilityRank(ab.id);
      const cost = g.progression.abilityRankCost(ab.id);
      const s = g.progression.scaledAbility(ab.id);
      mid.innerHTML = `<h3>${ab.name} <span style="color:var(--vermillion)">${ab.kanji}</span></h3>
        <div class="kanji-sub">${ab.romaji || ''} · rank ${rank}/${ab.maxRank || 1}</div>
        <p>${ab.desc}</p>
        <div class="flavor">${ab.flavor || ''}</div>
        <div class="stats">
          <div class="stat"><span>Cooldown</span><span>${(s?.scaled?.cooldown ?? ab.cooldown).toFixed(1)}s</span></div>
          <div class="stat"><span>Cast</span><span>${ab.cast ?? 0}s</span></div>
          <div class="stat"><span>Cost</span><span>${ab.cost?.focus ? `${ab.cost.focus} focus` : ab.cost?.stamina ? `${ab.cost.stamina} stam` : ab.cost?.health ? `${(ab.cost.health * 100).toFixed(0)}% hp` : '—'}</span></div>
          <div class="stat"><span>Type</span><span>${ab.damage?.type || '—'}</span></div>
          <div class="stat"><span>Range</span><span>${ab.range ?? '—'}</span></div>
          <div class="stat"><span>Radius</span><span>${ab.radius ?? '—'}</span></div>
        </div>
        <p style="font-size:13px;color:#8d8377">${ab.rank?.note || ''}</p>
        <div class="actions">
          ${has ? `<button class="btn small primary" id="rankUp">Rank up — ${cost} essence</button>` : `<button class="btn small" disabled>Locked — ${this.#unlockText(ab)}</button>`}
          <button class="btn small" id="toSlot">Assign to slot</button>
        </div>`;
      const ru = mid.querySelector('#rankUp');
      if (ru) ru.onclick = () => {
        if (g.progression.rankUpAbility(ab.id)) { this.ui.hud.toast({ text: `${ab.name} → rank ${g.progression.abilityRank(ab.id)}`, kind: 'good' }); this.render(); }
        else this.ui.hud.toast({ text: 'Not enough essence', kind: 'warn' });
      };
      mid.querySelector('#toSlot').onclick = () => { this.ui.openWheel(ab.id); };
    }

    if (this.tab === 'fox') {
      const st = g.progression.mutationState();
      const mut = g.progression.mutation;
      const next = g.progression.nextMutation;
      left.innerHTML = `<div class="label" style="margin-bottom:14px">Mutations</div>` +
        MUTATIONS.map((m, i) => `<div class="entry ${i === g.progression.mutationStage ? 'selected' : ''} ${i > g.progression.mutationStage ? 'locked' : ''}">
          <div class="t"><span>${m.name}</span><span class="r">${i}</span></div>
          <div class="d">${m.desc}</div>
          ${m.passive ? `<div class="meta"><span>${m.passive.name}</span></div>` : ''}
        </div>`).join('');
      mid.innerHTML = `<h3>${mut.name} <span style="color:var(--vermillion)">${mut.kanji || ''}</span></h3>
        <div class="kanji-sub">Fox level ${g.progression.foxLevel}</div>
        <p>${mut.desc}</p>
        ${mut.passive ? `<div class="flavor"><strong>${mut.passive.name}</strong> — ${mut.passive.desc}</div>` : ''}
        <p style="margin-top:22px">The fox grows by eating what you kill. Feed it enough and it changes shape;
        each shape unlocks a deeper tier of the contract — and a deeper debt.</p>
        <div class="stats">
          <div class="stat"><span>Fox XP</span><span>${Math.round(g.progression.foxXp)}</span></div>
          <div class="stat"><span>Next form</span><span>${next ? `${Math.round(st.pct * 100)}%` : 'Final'}</span></div>
          <div class="stat"><span>Damage ×</span><span>${(mut.damageMult ?? 1).toFixed(2)}</span></div>
          <div class="stat"><span>Health ×</span><span>${(mut.healthMult ?? 1).toFixed(2)}</span></div>
        </div>
        <div class="actions">
          <button class="btn small primary" id="mutate" ${st.ready ? '' : 'disabled'}>${st.ready ? 'Mutate' : `Needs ${Math.round(st.need - st.have)} more`}</button>
        </div>`;
      const mb = mid.querySelector('#mutate');
      if (mb) mb.onclick = () => {
        if (g.progression.mutate()) {
          bus.emit(EV.MUTATION, { stage: g.progression.mutationStage, mutation: g.progression.mutation });
          this.render();
        }
      };
    }
  }

  #unlockText(ab) {
    const u = ab.unlock || {};
    if (u.from === 'start') return 'from the start';
    if (u.level) return `level ${u.level}`;
    if (u.skill) return `skill node`;
    if (u.mutation) return `mutation: ${u.mutation}`;
    return 'locked';
  }

  // ───────────────────────────────────────────────────────────── inventory
  view_inventory() {
    const g = this.game;
    const wrap = document.createElement('div');
    wrap.className = 'cols';
    wrap.innerHTML = `<div class="col scroll" id="iLeft"></div><div class="col scroll detail" id="iRight"></div>`;
    this.elBody.appendChild(wrap);
    const left = wrap.querySelector('#iLeft');
    const right = wrap.querySelector('#iRight');

    const owned = [...g.inventory.entries()].filter(([, n]) => n > 0);
    const byType = (t) => owned.filter(([id]) => ITEM_BY_ID[id]?.type === t);

    if (this.tab === 'items') {
      const groups = [['weapon', 'Weapons'], ['armor', 'Armour'], ['charm', 'Charms'],
        ['consumable', 'Consumables'], ['material', 'Materials'], ['key', 'Key items']];
      left.innerHTML = groups.map(([type, label]) => {
        const items = byType(type);
        if (!items.length) return '';
        return `<div class="label" style="margin:14px 0 8px">${label}</div><div class="grid">${items.map(([id, n]) => {
          const it = ITEM_BY_ID[id];
          const eq = g.equipment.weapon === id || g.equipment.armor === id || g.equipment.charm === id;
          return `<div class="cell ${eq ? 'equipped' : ''}" data-item="${id}">
            <div class="rar" style="background:${RARITY[it.rarity]?.color || '#888'}"></div>
            <div class="nm">${it.name}</div>
            <div class="qty">×${n}</div></div>`;
        }).join('')}</div>`;
      }).join('') || '<div class="empty">Nothing but dust.</div>';

      const sel = ITEM_BY_ID[this.sel?.item || owned[0]?.[0]];
      left.querySelectorAll('[data-item]').forEach((e) => {
        if (sel && e.dataset.item === sel.id) e.classList.add('selected');
        e.onclick = () => { this.sel = { item: e.dataset.item }; this.render(); };
      });
      if (sel) {
        const count = g.inventory.get(sel.id) || 0;
        right.innerHTML = `<h3>${sel.name} <span style="color:var(--vermillion)">${sel.kanji || ''}</span></h3>
          <div class="kanji-sub">${sel.rarity} · ${sel.type} · ${sel.value} mon</div>
          <p>${sel.desc}</p>
          ${sel.weapon ? `<div class="stats">
            <div class="stat"><span>Power</span><span>${sel.weapon.power}</span></div>
            <div class="stat"><span>Speed</span><span>${sel.weapon.speed}</span></div>
            <div class="stat"><span>Reach</span><span>${sel.weapon.reach}</span></div>
            <div class="stat"><span>Crit</span><span>${(sel.weapon.crit * 100).toFixed(0)}%</span></div>
            <div class="stat"><span>Poise</span><span>${sel.weapon.poise}</span></div></div>` : ''}
          ${sel.armor ? `<div class="stats">
            <div class="stat"><span>Defense</span><span>${sel.armor.defense}</span></div>
            <div class="stat"><span>Spirit</span><span>${sel.armor.spirit}</span></div></div>` : ''}
          <div class="actions">
            ${['weapon', 'armor', 'charm'].includes(sel.type) ? `<button class="btn small primary" id="eq">Equip</button>` : ''}
            ${sel.use ? `<button class="btn small" id="use">Use</button>` : ''}
            <span class="label" style="align-self:center">Carrying ${count}</span>
          </div>`;
        right.querySelector('#eq')?.addEventListener('click', () => { g.equip(sel.id); this.render(); });
        right.querySelector('#use')?.addEventListener('click', () => { g.useItem(sel.id); this.render(); });
      }
    } else {
      // crafting
      const stations = ['forge', 'shrine', 'kitchen'];
      left.innerHTML = stations.map((st) => {
        const list = recipesFor(st);
        return `<div class="label" style="margin:14px 0 8px">${st}</div>` + list.map((r) => {
          const it = ITEM_BY_ID[r.id];
          const have = Object.entries(r.materials).every(([m, n]) => (g.inventory.get(m) || 0) >= n);
          return `<div class="entry ${have ? '' : 'locked'}" data-craft="${r.id}">
            <div class="t"><span>${it.name}</span><span class="r">${Object.entries(r.materials).map(([m, n]) => `${(g.inventory.get(m) || 0)}/${n} ${ITEM_BY_ID[m]?.name || m}`).join(' · ')}</span></div>
          </div>`;
        }).join('');
      }).join('');
      left.querySelectorAll('[data-craft]').forEach((e) => {
        e.onclick = () => {
          const r = recipesFor('forge').concat(recipesFor('shrine'), recipesFor('kitchen')).find((x) => x.id === e.dataset.craft);
          const ok = Object.entries(r.materials).every(([m, n]) => (g.inventory.get(m) || 0) >= n);
          if (!ok) { this.ui.hud.toast({ text: 'Not enough materials', kind: 'warn' }); return; }
          for (const [m, n] of Object.entries(r.materials)) g.takeItem(m, n);
          g.giveItem(r.id, 1);
          bus.emit(EV.CRAFT, { item: r.id });
          this.ui.hud.toast({ text: `Forged — ${ITEM_BY_ID[r.id].name}`, kind: 'good' });
          this.render();
        };
      });
      right.innerHTML = `<h3>The forge</h3><p>Scrap, silk and bone. Bring the smith what the province
        drops and he will turn it into something that lasts longer than you do.</p>`;
    }
  }

  // ────────────────────────────────────────────────────────────── journal
  view_journal() {
    const g = this.game;
    const wrap = document.createElement('div');
    wrap.className = 'cols';
    wrap.innerHTML = `<div class="col scroll" id="jLeft"></div><div class="col scroll detail" id="jRight"></div>`;
    this.elBody.appendChild(wrap);
    const left = wrap.querySelector('#jLeft');
    const right = wrap.querySelector('#jRight');

    if (this.tab === 'active') {
      const list = g.quests.journal();
      left.innerHTML = list.length ? list.map((q) => `
        <div class="quest-card ${q.ready ? 'ready' : ''}">
          <div class="hd"><h4>${q.title}</h4><span class="chain">${q.chain}</span></div>
          <div class="bl">${q.blurb}</div>
          <div class="objs">${q.objectives.map((o) => `
            <div class="obj ${o.done ? 'done' : ''}"><span>${o.done ? '✓' : '·'}</span>
            <span>${o.text}</span>${o.need > 1 ? `<span class="c">${Math.floor(o.have)}/${o.need}</span>` : ''}</div>`).join('')}</div>
        </div>`).join('') : '<div class="empty">No contracts outstanding.</div>';
      right.innerHTML = `<h3>The ledger</h3><p>${(g.quests.completionPct * 100).toFixed(0)}% of the
        province's troubles dealt with. ${QUESTS.length - g.quests.completed.size} remain.</p>
        <div class="flavor">A contract is a meal with two plates.</div>`;
    } else {
      const done = g.quests.completedList();
      left.innerHTML = done.length ? done.map((q) => `
        <div class="quest-card">
          <div class="hd"><h4>${q.title}</h4><span class="chain">${q.chain}</span></div>
          <div class="bl">${q.blurb}</div>
        </div>`).join('') : '<div class="empty">Nothing finished yet.</div>';
      right.innerHTML = `<h3>Closed contracts</h3><p>${done.length} of ${QUESTS.length}.</p>`;
    }
  }

  // ───────────────────────────────────────────────────────────────── map
  view_map() {
    const g = this.game;
    const wrap = document.createElement('div');
    wrap.className = 'map-wrap';
    wrap.innerHTML = `<canvas id="worldmap" width="900" height="900"></canvas>
      <div class="map-legend">
        <div><i style="background:#e8dcc8"></i>Known place</div>
        <div><i style="background:#d64a2c"></i>Danger</div>
        <div><i style="background:#c8a04a"></i>Quest</div>
      </div>`;
    this.elBody.appendChild(wrap);
    const cv = wrap.querySelector('#worldmap');
    const c = cv.getContext('2d');
    const S = 900 / (WORLD.size);
    const toXY = (x, z) => [(x + WORLD.half) * S, (z + WORLD.half) * S];

    c.fillStyle = '#0d0a0b';
    c.fillRect(0, 0, 900, 900);

    // regions
    for (const r of REGIONS) {
      const [x, y] = toXY(r.center[0], r.center[1]);
      const rad = r.r * S;
      const grd = c.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, 'rgba(232,220,200,0.05)');
      grd.addColorStop(1, 'rgba(232,220,200,0)');
      c.fillStyle = grd;
      c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(232,220,200,0.08)';
      c.setLineDash([4, 8]);
      c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
      c.fillStyle = 'rgba(232,220,200,0.5)';
      c.font = '16px var(--serif, serif)';
      c.textAlign = 'center';
      c.fillText(r.name, x, y - 6);
      c.fillStyle = 'rgba(214,74,44,0.7)';
      c.font = '22px var(--serif, serif)';
      c.fillText(r.kanji, x, y + 20);
    }

    // POIs
    for (const p of POIS) {
      const [x, y] = toXY(p.pos[0], p.pos[1]);
      const known = g.quests.discovered.has(p.id);
      c.fillStyle = known ? '#e8dcc8' : 'rgba(232,220,200,0.2)';
      c.beginPath(); c.arc(x, y, known ? 4 : 2.5, 0, Math.PI * 2); c.fill();
      if (known) {
        c.fillStyle = 'rgba(232,220,200,0.55)';
        c.font = '11px var(--sans, sans-serif)';
        c.textAlign = 'left';
        c.fillText(p.name, x + 8, y + 3);
      }
    }

    // quest targets
    for (const st of g.quests.active.values()) {
      const q = QUEST_BY_ID[st.id];
      for (const o of q?.objectives || []) {
        const poi = o.poi && POIS.find((p) => p.id === o.poi);
        if (!poi) continue;
        const [x, y] = toXY(poi.pos[0], poi.pos[1]);
        c.strokeStyle = '#c8a04a'; c.lineWidth = 1.5;
        c.beginPath(); c.arc(x, y, 9, 0, Math.PI * 2); c.stroke();
      }
    }

    // player
    const [px, py] = toXY(g.player.position.x, g.player.position.z);
    c.save();
    c.translate(px, py);
    c.rotate(-g.cameraRig.yaw);
    c.fillStyle = '#d64a2c';
    c.beginPath(); c.moveTo(0, -11); c.lineTo(7, 8); c.lineTo(0, 4); c.lineTo(-7, 8); c.closePath(); c.fill();
    c.restore();
  }

  // ─────────────────────────────────────────────────────────────── codex
  view_codex() {
    const g = this.game;
    const wrap = document.createElement('div');
    wrap.className = 'cols';
    wrap.innerHTML = `<div class="col scroll" id="xLeft"></div><div class="col scroll detail" id="xRight"></div>`;
    this.elBody.appendChild(wrap);
    const left = wrap.querySelector('#xLeft');
    const right = wrap.querySelector('#xRight');

    if (this.tab === 'bestiary') {
      left.innerHTML = ENEMIES.map((e) => {
        const killed = g.progression.flags[`killed_${e.id}`] || 0;
        return `<div class="entry ${killed ? '' : 'locked'}" data-e="${e.id}">
          <div class="t"><span>${killed ? e.name : '? ? ?'}</span><span class="r" style="color:${{ minion: '#d8c8a8', elite: '#ffb45a', boss: '#ff5a5a', legendary: '#c78bff', wildlife: '#8fd18a' }[e.tier]}">${e.tier}</span></div>
          <div class="meta"><span>Lv ${e.level?.[0]}–${e.level?.[1]}</span><span>${killed ? `${killed} slain` : 'unmet'}</span></div>
        </div>`;
      }).join('');
      const e = ENEMY_BY_ID[this.sel?.e || 'bandit'];
      left.querySelectorAll('[data-e]').forEach((n) => {
        if (n.dataset.e === e.id) n.classList.add('selected');
        n.onclick = () => { this.sel = { e: n.dataset.e }; this.render(); };
      });
      right.innerHTML = `<h3>${e.name} <span style="color:var(--vermillion)">${e.kanji || ''}</span></h3>
        <div class="kanji-sub">${e.tier} · level ${e.level?.[0]}–${e.level?.[1]}</div>
        <p>${e.lore || ''}</p>
        <div class="stats">
          <div class="stat"><span>Health</span><span>${e.health}</span></div>
          <div class="stat"><span>Damage</span><span>${e.damage}</span></div>
          <div class="stat"><span>Poise</span><span>${e.poise}</span></div>
          <div class="stat"><span>Speed</span><span>${e.speed}</span></div>
          ${e.weaknesses ? `<div class="stat"><span>Weak</span><span>${e.weaknesses.join(', ')}</span></div>` : ''}
          ${e.resistances ? `<div class="stat"><span>Resists</span><span>${e.resistances.join(', ')}</span></div>` : ''}
        </div>
        ${e.drops?.length ? `<p style="font-size:13px">Drops: ${e.drops.map((d) => `${ITEM_BY_ID[d.item]?.name || d.item} (${(d.chance * 100) | 0}%)`).join(', ')}</p>` : ''}`;
    }

    if (this.tab === 'lore') {
      const group = this.sel?.g || CODEX_GROUPS[0];
      left.innerHTML = `<div class="label" style="margin-bottom:10px">${CODEX_GROUPS.map((gr) =>
        `<button class="tab ${gr === group ? 'active' : ''}" data-g="${gr}" style="margin-right:16px">${gr}</button>`).join('')}</div>` +
        CODEX.filter((e) => e.group === group).map((e) => `<div class="entry" data-l="${e.id}">
          <div class="t"><span>${e.title}</span><span class="r">${e.kanji || ''}</span></div></div>`).join('');
      const entry = CODEX.find((e) => e.id === (this.sel?.l && this.sel.g === group ? this.sel.l : null))
        || CODEX.filter((e) => e.group === group)[0];
      left.querySelectorAll('[data-g]').forEach((b) => { b.onclick = () => { this.sel = { g: b.dataset.g }; this.render(); }; });
      left.querySelectorAll('[data-l]').forEach((n) => {
        if (entry && n.dataset.l === entry.id) n.classList.add('selected');
        n.onclick = () => { this.sel = { g: group, l: n.dataset.l }; this.render(); };
      });
      if (entry) {
        right.innerHTML = `<h3>${entry.title} <span style="color:var(--vermillion)">${entry.kanji || ''}</span></h3>
          <div class="kanji-sub">${entry.group}</div>
          <p>${entry.text}</p>`;
      }
    }

    if (this.tab === 'statuses') {
      left.innerHTML = Object.entries(STATUSES).filter(([k]) => !['physical', 'spirit', 'fire', 'frost', 'shock', 'void', 'true'].includes(k))
        .map(([k, s]) => `<div class="entry" data-s="${k}"><div class="t"><span>${s.label || k}</span><span class="r">${s.kind}</span></div>
          <div class="d">${s.desc || ''}</div></div>`).join('');
      right.innerHTML = `<h3>Conditions</h3><p>What the province does to your body, and what the fox
        does to theirs. Stack them; the second one always hurts more.</p>`;
      left.querySelectorAll('[data-s]').forEach((n) => {
        n.onclick = () => { this.sel = { s: n.dataset.s }; this.render(); };
      });
    }
  }

  // ──────────────────────────────────────────────────────────── dialogue
  view_dialogue(npcId) {
    const g = this.game;
    const npc = NPC_BY_ID[npcId];
    if (!npc) { this.close(); return; }
    this.elTitle.textContent = npc.name;
    this.elSub.textContent = `${npc.title || ''} · ${npc.role}`;

    const offers = g.quests.offers(npc.id);
    const turnIns = g.quests.turnIns(npc.id);
    const wrap = document.createElement('div');
    wrap.innerHTML = `<div class="cols"><div class="col scroll" id="dLeft"></div><div class="col scroll detail" id="dRight"></div></div>`;
    this.elBody.appendChild(wrap);
    const left = wrap.querySelector('#dLeft');
    const right = wrap.querySelector('#dRight');

    let lines = npc.greeting || ['…'];
    if (turnIns.length) {
      const q = QUEST_BY_ID[turnIns[0].id];
      lines = [q.dialogue?.complete || 'It is done, then.'];
    } else if (offers.length) {
      lines = [offers[0].dialogue?.offer || 'I have work.'];
    }
    right.innerHTML = `<h3>${npc.name} <span style="color:var(--vermillion)">${npc.kanji || ''}</span></h3>
      <div class="kanji-sub">${npc.title || npc.role}</div>
      <p>${Array.isArray(lines) ? lines.join('<br><br>') : lines}</p>
      ${npc.rumour ? `<div class="flavor">${npc.rumour}</div>` : ''}`;

    const choices = [];
    if (turnIns.length) {
      for (const st of turnIns) choices.push({ label: `Complete — ${QUEST_BY_ID[st.id].title}`, act: () => { g.quests.complete(st.id); this.render(); } });
    }
    for (const q of offers) choices.push({ label: `Accept — ${q.title}`, act: () => { g.quests.start(q.id); this.render(); } });
    if (npc.stock?.length) choices.push({ label: 'Trade', act: () => this.#shop(npc, left) });
    choices.push({ label: 'Ask about the fox', act: () => {
      right.querySelector('p').innerHTML = npc.foxTalk || 'It follows you like weather. I would not turn my back on it, and I would not turn my back on you either.';
    } });
    choices.push({ label: 'Leave', act: () => this.close() });

    left.innerHTML = `<div class="label" style="margin-bottom:12px">${npc.name}</div>`;
    for (const c of choices) {
      const b = document.createElement('button');
      b.className = 'entry';
      b.innerHTML = `<div class="t"><span>${c.label}</span></div>`;
      b.onclick = c.act;
      left.appendChild(b);
    }
    if (!this._shopShown) this.#shop(npc, left, true);
  }

  #shop(npc, host, quiet = false) {
    const g = this.game;
    const box = document.createElement('div');
    box.style.marginTop = '22px';
    box.innerHTML = `<div class="label" style="margin-bottom:8px">Trade — ${g.progression.gold} mon</div>`;
    for (const id of npc.stock || []) {
      const it = ITEM_BY_ID[id];
      if (!it) continue;
      const row = document.createElement('div');
      row.className = 'entry';
      row.innerHTML = `<div class="t"><span>${it.name}</span><span class="r">${it.value} mon</span></div>
        <div class="d">${it.desc}</div>`;
      row.onclick = () => {
        if (g.progression.gold < it.value) { this.ui.hud.toast({ text: 'Not enough coin', kind: 'warn' }); return; }
        g.progression.gold -= it.value;
        g.giveItem(id, 1);
        this.ui.hud.toast({ text: `Bought — ${it.name}`, kind: 'good', ttl: 1600 });
        this.render();
      };
      box.appendChild(row);
    }
    host.appendChild(box);
  }
}

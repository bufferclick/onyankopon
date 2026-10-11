import * as THREE from 'three';
import { bus, EV } from '../core/EventBus.js';
import { clamp, clamp01 } from '../core/MathUtils.js';
import { ABILITY_BY_ID } from '../data/abilities.js';
import { POIS, WORLD } from '../data/regions.js';
import { TIER_COLORS } from '../data/enemies.js';

/**
 * HUD. Everything is DOM (crisp text, easy to theme) except the minimap, which
 * is a canvas. Values are read straight off the game each frame at a throttled
 * rate — the HUD never owns game state.
 */
export class Hud {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('hud');
    this.el = {};
    this.dmgPool = [];
    this.toasts = new Map();
    this.accum = 0;
    this.visible = true;
    this.hpGhost = 1;
    this.#build();
    this.#hook();
  }

  #build() {
    this.root.innerHTML = `
      <div class="vignette"></div>

      <div class="tracker" id="tracker"></div>

      <div id="minimap">
        <div class="compass">北</div>
        <canvas width="352" height="352"></canvas>
        <div class="region-name" id="regionName"></div>
      </div>

      <div class="status-row" id="statusRow"></div>

      <div class="reticle" id="reticle"></div>

      <div class="target-bar hidden" id="targetBar">
        <div class="name"><span id="tbName"></span><span class="lv" id="tbLv"></span></div>
        <div class="bar"><div class="fill" id="tbHp"></div></div>
        <div class="post"><div class="fill" id="tbPost"></div></div>
        <div class="statuses" id="tbStatuses"></div>
      </div>

      <div class="boss-banner hidden" id="bossBanner">
        <div class="k" id="bossKanji"></div>
        <div class="n" id="bossName"></div>
        <div class="line"></div>
      </div>

      <div class="prompt hidden" id="prompt"><span class="keycap" id="promptKey">E</span><span id="promptText"></span></div>

      <div class="vitals">
        <div class="vital hp" id="vHp">
          <div class="row"><span class="label">血 Vitality</span><span class="val" id="hpVal"></span></div>
          <div class="track tall"><div class="ghost" id="hpGhost"></div><div class="fill" id="hpFill"></div></div>
        </div>
        <div class="vital st">
          <div class="row"><span class="label">気 Stamina</span><span class="val" id="stVal"></span></div>
          <div class="track"><div class="fill" id="stFill"></div></div>
        </div>
        <div class="vital fx">
          <div class="row"><span class="label">霊 Focus</span><span class="val" id="fxVal"></span></div>
          <div class="track"><div class="fill" id="fxFill"></div></div>
        </div>
        <div class="posture"><div class="fill" id="postFill"></div></div>
      </div>

      <div class="slots" id="slots"></div>

      <div class="dmg-layer" id="dmgLayer"></div>
      <div class="toasts" id="toasts"></div>
    `;
    const id = (s) => this.root.querySelector(s);
    this.el = {
      tracker: id('#tracker'), canvas: id('#minimap canvas'), regionName: id('#regionName'),
      statusRow: id('#statusRow'), reticle: id('#reticle'),
      targetBar: id('#targetBar'), tbName: id('#tbName'), tbLv: id('#tbLv'), tbHp: id('#tbHp'),
      tbPost: id('#tbPost'), tbStatuses: id('#tbStatuses'),
      bossBanner: id('#bossBanner'), bossKanji: id('#bossKanji'), bossName: id('#bossName'),
      prompt: id('#prompt'), promptText: id('#promptText'), promptKey: id('#promptKey'),
      hpFill: id('#hpFill'), hpGhost: id('#hpGhost'), hpVal: id('#hpVal'),
      stFill: id('#stFill'), stVal: id('#stVal'), fxFill: id('#fxFill'), fxVal: id('#fxVal'),
      postFill: id('#postFill'), slots: id('#slots'), dmgLayer: id('#dmgLayer'),
      toasts: id('#toasts'), vignette: id('.vignette'), vHp: id('#vHp'),
    };
    this.ctx = this.el.canvas.getContext('2d');
    this.#buildSlots();
  }

  #buildSlots() {
    this.el.slots.innerHTML = '';
    this.slotEls = [];
    const keys = ['1', '2', '3', '4', '5', '6'];
    for (let i = 0; i < 6; i++) {
      const d = document.createElement('div');
      d.className = 'slot';
      d.innerHTML = `<span class="key">${keys[i]}</span><span class="kanji"></span><span class="cost"></span><div class="cd hidden"></div>`;
      this.el.slots.appendChild(d);
      this.slotEls.push(d);
    }
  }

  #hook() {
    bus.on(EV.HIT, (e) => this.spawnDamage(e));
    bus.on(EV.TOAST, (t) => this.toast(t));
    bus.on(EV.DISCOVERY, ({ name }) => this.toast({ text: `Discovered — ${name}`, kind: 'good' }));
    bus.on(EV.QUEST_COMPLETE, ({ quest }) => this.toast({ text: `Quest complete — ${quest.title}`, kind: 'epic' }));
    bus.on(EV.LEVEL_UP, () => this.toast({ text: 'Level up', kind: 'epic' }));
    bus.on(EV.MUTATION, ({ stage }) => this.toast({ text: `The fox changes — stage ${stage}`, kind: 'epic' }));
    bus.on(EV.ABILITY_UNLOCKED, ({ id }) => {
      const a = ABILITY_BY_ID[id];
      this.toast({ text: `Learned — ${a?.name ?? id}`, kind: 'good' });
    });
  }

  setVisible(v) {
    this.visible = v;
    this.root.classList.toggle('hidden', !v);
  }

  // ───────────────────────────────────────────────────────────── update
  update(dt) {
    if (!this.visible) return;
    const g = this.game;
    const p = g.player;

    // vitals (cheap: only touch style when the value moved)
    const hp = clamp01(p.healthPct);
    this.el.hpFill.style.width = `${hp * 100}%`;
    this.el.hpVal.textContent = `${Math.ceil(p.health)} / ${Math.round(p.maxHealth)}`;
    this.el.vHp.classList.toggle('low', hp < 0.3);
    this.hpGhost = this.hpGhost > hp ? Math.max(hp, this.hpGhost - dt * 0.25) : hp;
    this.el.hpGhost.style.width = `${this.hpGhost * 100}%`;
    this.el.stFill.style.width = `${clamp01(p.stamina / p.maxStamina) * 100}%`;
    this.el.stVal.textContent = Math.round(p.stamina);
    this.el.fxFill.style.width = `${clamp01(p.focus / Math.max(1, p.maxFocus)) * 100}%`;
    this.el.fxVal.textContent = Math.round(p.focus);
    this.el.postFill.style.width = `${clamp01(p.poise / p.poiseMax) * 100}%`;
    this.el.vignette.style.opacity = hp < 0.4 ? (0.4 - hp) * 1.8 : 0;

    // ability slots
    for (let i = 0; i < 6; i++) {
      const el = this.slotEls[i];
      const id = g.abilities.slots[i];
      const def = id ? ABILITY_BY_ID[id] : null;
      const cd = el.querySelector('.cd');
      if (!def) { el.className = 'slot locked'; el.querySelector('.kanji').textContent = ''; continue; }
      const unlocked = g.progression.hasAbility(id);
      const cdLeft = g.abilities.cooldown(id);
      const canPay = g.abilities.canPay(g.abilities.def(id));
      el.className = `slot${unlocked ? '' : ' locked'}${unlocked && cdLeft <= 0 && canPay ? ' ready' : ''}`;
      el.querySelector('.kanji').textContent = def.kanji || def.name.slice(0, 1);
      const cost = def.cost?.focus ? `${def.cost.focus}` : def.cost?.stamina ? `${def.cost.stamina}s` : '';
      el.querySelector('.cost').textContent = cost;
      if (cdLeft > 0.05) {
        cd.classList.remove('hidden');
        cd.textContent = cdLeft >= 10 ? Math.ceil(cdLeft) : cdLeft.toFixed(1);
        cd.style.transform = `scaleY(${clamp01(cdLeft / (g.abilities.def(id)?.scaled?.cooldown ?? 6))})`;
      } else cd.classList.add('hidden');
    }

    // lock-on reticle + target bar
    const target = g.cameraRig.lockTarget;
    this.el.reticle.className = `reticle${target?.alive ? ' locked' : ''}`;
    if (target?.alive) {
      this.el.targetBar.classList.remove('hidden');
      this.el.tbName.textContent = target.name;
      this.el.tbLv.textContent = `Lv ${target.level} · ${target.tier}`;
      this.el.tbHp.style.transform = `scaleX(${target.healthPct})`;
      this.el.tbPost.style.transform = `scaleX(${target.posturePct})`;
      const st = [...target.statuses.keys()].slice(0, 4);
      if (st.join() !== this._lastStatuses) {
        this._lastStatuses = st.join();
        this.el.tbStatuses.innerHTML = st.map((s) => `<i>${s}</i>`).join('');
      }
    } else this.el.targetBar.classList.add('hidden');

    // boss banner: show when a boss aggros
    const boss = g.spawner.enemies.find((e) => e.alive && e.isBoss && e.aggro);
    if (boss && boss !== this._boss) {
      this._boss = boss;
      this.el.bossBanner.classList.remove('hidden');
      this.el.bossKanji.textContent = boss.kanji || boss.name;
      this.el.bossName.textContent = boss.name;
      clearTimeout(this._bossTimer);
      this._bossTimer = setTimeout(() => this.el.bossBanner.classList.add('hidden'), 4200);
    } else if (!boss && this._boss) {
      this._boss = null;
    }

    // interaction prompt
    const it = g.interactTarget;
    if (it) {
      this.el.prompt.classList.remove('hidden');
      this.el.promptText.textContent = it.name;
    } else this.el.prompt.classList.add('hidden');

    // status chips
    this.accum += dt;
    if (this.accum > 0.1) {
      this.accum = 0;
      this.#updateStatusRow();
      this.#updateTracker();
      this.#drawMinimap();
      if (g.region) this.el.regionName.textContent = `${g.region.kanji} ${g.region.name}`;
    }
  }

  #updateStatusRow() {
    const p = this.game.player;
    const st = [...p.statuses.values()].map((s) => `${s.id}${s.stacks > 1 ? ` ×${s.stacks}` : ''}`);
    const key = st.join('|') + (p.devilForm ? '|devil' : '');
    if (key === this._statusKey) return;
    this._statusKey = key;
    const chips = st.map((s) => `<div class="status-chip"><span class="dot"></span>${s}</div>`).join('');
    const devil = p.devilForm ? '<div class="status-chip" style="color:#ff6a5a"><span class="dot" style="background:#ff2e2e"></span>Devil Form</div>' : '';
    this.el.statusRow.innerHTML = chips + devil;
  }

  #updateTracker() {
    const list = this.game.quests.journal().slice(0, 3);
    const key = JSON.stringify(list);
    if (key === this._trackerKey) return;
    this._trackerKey = key;
    this.el.tracker.innerHTML = list.map((q) => `
      <div class="quest">
        <div class="chain">${q.chain}</div>
        <div class="name">${q.title}</div>
        ${q.objectives.slice(0, 3).map((o) => `
          <div class="obj ${o.done ? 'done' : ''}">
            <span class="mark">${o.done ? '✓' : '·'}</span>
            <span>${o.text}</span>
            ${o.need > 1 ? `<span class="c">${Math.floor(o.have)}/${o.need}</span>` : ''}
          </div>`).join('')}
      </div>`).join('');
  }

  // ─────────────────────────────────────────────────────────── minimap
  #drawMinimap() {
    const g = this.game;
    const c = this.ctx;
    const W = this.el.canvas.width, H = this.el.canvas.height;
    const p = g.player.position;
    const range = 320;                    // metres across
    const scale = W / range;
    const camYaw = g.cameraRig.yaw;
    c.clearRect(0, 0, W, H);

    // rotate so "up" is camera forward
    c.save();
    c.translate(W / 2, H / 2);
    c.rotate(camYaw);

    const toMap = (x, z) => [(x - p.x) * scale, (z - p.z) * scale];

    // region rings
    for (const r of g.region ? [g.region] : []) {
      const [rx, rz] = toMap(r.center[0], r.center[1]);
      c.strokeStyle = 'rgba(232,220,200,0.08)';
      c.lineWidth = 1;
      c.beginPath();
      c.arc(rx, rz, r.r * scale, 0, Math.PI * 2);
      c.stroke();
    }

    // POIs
    c.font = '11px var(--serif, serif)';
    for (const poi of POIS) {
      const [x, z] = toMap(poi.pos[0], poi.pos[1]);
      if (Math.hypot(x, z) > W / 2 - 6) continue;
      const known = g.quests.discovered.has(poi.id);
      c.fillStyle = known ? 'rgba(232,220,200,0.75)' : 'rgba(232,220,200,0.22)';
      c.beginPath();
      c.arc(x, z, known ? 3 : 2, 0, Math.PI * 2);
      c.fill();
      if (known && (poi.t === 'village' || poi.t === 'shrine' || poi.t === 'temple')) {
        c.fillStyle = 'rgba(232,220,200,0.45)';
        c.save();
        c.translate(x, z); c.rotate(-camYaw);
        c.fillText(poi.name, 6, 3);
        c.restore();
      }
    }

    // enemies
    for (const e of g.spawner.enemies) {
      if (!e.alive) continue;
      const [x, z] = toMap(e.position.x, e.position.z);
      if (Math.hypot(x, z) > W / 2 - 4) continue;
      c.fillStyle = e.aggro ? '#d64a2c' : 'rgba(214,74,44,0.45)';
      c.beginPath();
      c.arc(x, z, e.isBoss ? 4.5 : 2.6, 0, Math.PI * 2);
      c.fill();
      if (e.isBoss) {
        c.strokeStyle = '#d64a2c'; c.lineWidth = 1;
        c.beginPath(); c.arc(x, z, 8, 0, Math.PI * 2); c.stroke();
      }
    }

    // quest targets
    for (const it of g.interactables) {
      if (it.kind !== 'npc') continue;
      const [x, z] = toMap(it.position.x, it.position.z);
      if (Math.hypot(x, z) > W / 2 - 4) continue;
      c.strokeStyle = 'rgba(200,160,74,0.9)'; c.lineWidth = 1;
      c.beginPath(); c.arc(x, z, 3.4, 0, Math.PI * 2); c.stroke();
    }
    c.restore();

    // player arrow (always centred, pointing up)
    c.save();
    c.translate(W / 2, H / 2);
    c.fillStyle = '#e8dcc8';
    c.beginPath();
    c.moveTo(0, -8); c.lineTo(5, 6); c.lineTo(0, 3); c.lineTo(-5, 6);
    c.closePath(); c.fill();
    c.restore();

    // ring + north tick
    c.strokeStyle = 'rgba(232,220,200,0.14)';
    c.lineWidth = 1;
    c.beginPath(); c.arc(W / 2, H / 2, W / 2 - 1, 0, Math.PI * 2); c.stroke();
  }

  // ─────────────────────────────────────────────────────────── feedback
  spawnDamage({ position, dmg, crit, type, isPlayerTarget }) {
    if (!this.game.settings.get('gameplay', 'showDamageNumbers')) return;
    const v = new THREE.Vector3().copy(position).project(this.game.engine.camera);
    if (v.z > 1) return;
    const el = document.createElement('div');
    el.className = `dmg${crit ? ' crit' : ''}${isPlayerTarget ? ' player' : ''}`;
    el.textContent = Math.round(dmg);
    el.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth + (Math.random() - 0.5) * 26}px`;
    el.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight + (Math.random() - 0.5) * 18}px`;
    el.style.color = crit ? '' : (type === 'spirit' || type === 'void' ? '#8ad8ff' : type === 'fire' ? '#ff9a3a' : '');
    this.el.dmgLayer.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  toast({ text, kind = 'info', ttl = 3400, clear = false }) {
    if (clear) {
      for (const [k, el] of this.toasts) {
        if (k.startsWith('hint')) { el.remove(); this.toasts.delete(k); }
      }
      if (!text) return;
    }
    if (!text) return;
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    this.el.toasts.appendChild(el);
    const key = `${kind}:${text}`;
    if (this.toasts.has(key)) this.toasts.get(key).remove();
    this.toasts.set(key, el);
    setTimeout(() => { el.remove(); this.toasts.delete(key); }, kind === 'hint' ? 65000 : ttl);
  }
}

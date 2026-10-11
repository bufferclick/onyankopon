import * as THREE from 'three';
import { clamp, clamp01 } from '../core/MathUtils.js';

/**
 * The enemies' move list. Every yōkai and every ashigaru pulls from this table,
 * so a new monster is a data entry plus these verbs — no bespoke AI code.
 *
 * Timeline:  onStart ─ windup ─▶ onCast ─ active ─▶ onEnd ─ recover
 * The windup is the tell. It is deliberately loud, bright and slow enough to
 * parry, because reading a windup is the whole skill of this game.
 */

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

// ─────────────────────────────────────────────────────────── helpers
function chest(a, out = _v) { return out.copy(a.position).add(_v2.set(0, a.height * 0.55, 0)); }

function meleeSwing(enemy, ctx, { range = 2.6, arc = 1.6, dmgMul = 1, type = 'physical',
  statuses = null, knock = 0, postureMul = 1, vfxColor = 0xe8f0ff, sfx = 'slash', wide = false }) {
  const target = enemy.target;
  const fwd = _v.set(Math.sin(enemy.facing), 0, Math.cos(enemy.facing));
  const at = enemy.position.clone().addScaledVector(fwd, range * 0.6).setY(enemy.position.y + enemy.height * 0.5);
  ctx.vfx.slashArc(at, enemy.facing, { radius: wide ? range * 1.15 : range * 0.9, color: vfxColor, dur: 0.26, tilt: 0.5 });
  ctx.audio.play(sfx, { volume: 0.6, position: enemy.position });
  const hits = [];
  const origin = enemy.position.clone().addScaledVector(fwd, 0.7);
  for (const a of ctx.combat.actors) {
    if (!a.alive || a.faction === enemy.faction) continue;
    const to = _v2.copy(a.position).sub(origin).setY(0);
    const d = to.length();
    if (d > range + a.radius) continue;
    to.normalize();
    if (to.dot(fwd) < Math.cos(arc / 2)) continue;
    hits.push(a);
  }
  for (const a of hits) {
    ctx.combat.resolveAttack(enemy, a, {
      damage: enemy.damage * dmgMul, type,
      posture: enemy.damage * dmgMul * postureMul,
      statuses: statuses || undefined,
      position: chest(a, new THREE.Vector3()),
      direction: fwd,
      onHit: knock ? [{ k: 'knockback', strength: knock }] : undefined,
    });
  }
  return hits;
}

function radialBurst(enemy, ctx, { radius = 6, dmgMul = 1, type = 'spirit', statuses = null,
  color = 0xff7a2a, knock = 0, sfx = 'boom', y = null, falloff = true, delay = 0 }) {
  const at = enemy.position.clone();
  if (y !== null) at.y = y;
  if (delay > 0) {
    ctx.vfx.zone(at, radius, { color: 0x2a1010, dur: delay, height: 0.2, opacity: 0.55 });
  }
  ctx.vfx.shockwave(at, { radius, color, dur: 0.55, opacity: 0.9 });
  ctx.vfx.burst(at, 26, { color: [color, 0xffffff], speed: 9, size: 0.5, life: 0.6, drag: 3 });
  ctx.audio.play(sfx, { volume: 0.9, position: at });
  ctx.combat.radial(at, {
    radius, damage: enemy.damage * dmgMul, type, source: enemy, statuses,
    posture: enemy.damage * dmgMul, falloff,
    onHit: knock ? (a) => { a.velocity.add(_v.copy(a.position).sub(at).setY(0).normalize().multiplyScalar(knock)); } : null,
  });
}

function coneBlast(enemy, ctx, { range = 9, arc = 70, dmgMul = 1, type = 'fire', statuses = null,
  color = 0xff7a2a, sfx = 'fire_cast', knock = 0 }) {
  const fwd = _v.set(Math.sin(enemy.facing), 0, Math.cos(enemy.facing));
  const from = enemy.position.clone().setY(enemy.position.y + enemy.height * 0.6);
  const to = from.clone().addScaledVector(fwd, range);
  ctx.vfx.beam(from, to, { color, width: range * 0.16, dur: 0.4 });
  ctx.vfx.burst(to, 20, { color: [color, 0xffe9a8], speed: 7, size: 0.55, life: 0.5 });
  ctx.audio.play(sfx, { volume: 0.85, position: from });
  ctx.combat.cone(from, fwd, {
    range, angle: arc, damage: enemy.damage * dmgMul, type, source: enemy, statuses,
  });
}

function projectile(enemy, ctx, { shape = 'orb', color = 0xff7a2a, speed = 18, dmgMul = 1, type = 'fire',
  statuses = null, count = 1, spread = 0, homing = 0, scale = 1, sfx = 'fire_cast', gravity = 0, life = 3.2, radius = 0.4 }) {
  const target = enemy.target;
  if (!target) return;
  const from = chest(enemy, new THREE.Vector3());
  const base = _v.copy(target.center(_v2)).sub(from).normalize();
  for (let i = 0; i < count; i++) {
    const dir = base.clone();
    if (spread) {
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), (i - (count - 1) / 2) * spread);
    }
    ctx.projectiles.spawn({
      owner: enemy, faction: enemy.faction, position: from, direction: dir,
      speed, damage: enemy.damage * dmgMul, type, statuses, shape, color,
      homing, scale, gravity, life, radius, sfx,
    });
  }
  ctx.audio.play(sfx, { volume: 0.6, position: from });
}

function buff(enemy, ctx, { mods = {}, duration = 8, color = 0xffc46a, sfx = 'buff_apply', text = null }) {
  enemy.addBuffTag?.(mods, duration);
  ctx.vfx.aura(enemy.position, { color, size: enemy.height * 1.6, dur: 0.9 });
  ctx.audio.play(sfx, { volume: 0.7, position: enemy.position });
  if (text) enemy.shout?.(text);
}

// ──────────────────────────────────────────────────────────── move list
export const ENEMY_ATTACKS = {
  // ── generic melee ───────────────────────────────────────────────────
  melee_generic: {
    windup: 0.42, active: 0.18, recover: 0.5, cooldown: 1.3, range: 2.6,
    onCast: (e, ctx) => meleeSwing(e, ctx, { range: e.ai.range || 2.4, dmgMul: 1 }),
  },
  heavy_slam: {
    windup: 0.85, active: 0.22, recover: 0.95, cooldown: 3.4, range: 4.2,
    anim: 'heavy',
    onCast: (e, ctx) => {
      meleeSwing(e, ctx, { range: 4.4, arc: 2.2, dmgMul: 1.9, knock: 6, wide: true, sfx: 'heavy_impact', vfxColor: 0xffd08a });
      radialBurst(e, ctx, { radius: 5.5, dmgMul: 0.7, type: 'physical', color: 0xd8c8a8, knock: 5, sfx: 'heavy_impact' });
    },
  },
  thrust: {
    windup: 0.5, active: 0.16, recover: 0.6, cooldown: 1.7, range: 4.0,
    onCast: (e, ctx) => meleeSwing(e, ctx, { range: 4.2, arc: 0.7, dmgMul: 1.25, sfx: 'thrust', vfxColor: 0xbfe6ff }),
  },
  quick_flurry: {
    windup: 0.3, active: 0.5, recover: 0.55, cooldown: 3.0, range: 2.8,
    onCast: (e, ctx) => {
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          if (e.alive) meleeSwing(e, ctx, { range: 2.8, arc: 1.5, dmgMul: 0.55, sfx: 'slash' });
        }, i * 160);
      }
    },
  },
  nine_cut: {
    windup: 0.9, active: 1.6, recover: 1.1, cooldown: 9, range: 3.4,
    anim: 'heavy',
    onStart: (e, ctx) => { ctx.vfx.summonCircle(e.position, { color: 0xff2e2e, radius: 3.2, dur: 0.9 }); e.shout?.('九'); },
    onCast: (e, ctx) => {
      for (let i = 0; i < 9; i++) {
        setTimeout(() => {
          if (!e.alive) return;
          e.faceTowards(e.target.position.x, e.target.position.z, 0.2, 30);
          meleeSwing(e, ctx, { range: 3.6, arc: 2.4, dmgMul: 0.42, sfx: 'slice', vfxColor: 0xff6a6a });
        }, i * 170);
      }
    },
  },

  // ── projectile users ────────────────────────────────────────────────
  arrow_shot: {
    windup: 0.7, active: 0.2, recover: 0.9, cooldown: 2.4, range: 26,
    anim: 'attack',
    onCast: (e, ctx) => projectile(e, ctx, {
      shape: 'arrow', color: 0xd8c8a8, speed: 34, dmgMul: 1, type: 'physical', sfx: 'bow_release', radius: 0.3, life: 2.4,
    }),
  },
  fox_fire: {
    windup: 0.75, active: 0.25, recover: 0.8, cooldown: 3.2, range: 22,
    anim: 'cast',
    onStart: (e, ctx) => { ctx.vfx.orb(e.position, { color: 0x7ae0ff, radius: 0.8, dur: 0.7 }); },
    onCast: (e, ctx) => projectile(e, ctx, {
      shape: 'fireball', color: 0x7ae0ff, speed: 17, dmgMul: 1.15, type: 'fire',
      statuses: [{ type: 'burn', chance: 0.7, duration: 4 }], homing: 1.6, scale: 1.1, sfx: 'fire_cast',
    }),
  },
  web_shot: {
    windup: 0.6, active: 0.2, recover: 0.7, cooldown: 4, range: 18,
    anim: 'cast',
    onCast: (e, ctx) => projectile(e, ctx, {
      shape: 'web', color: 0xe8e8f0, speed: 14, dmgMul: 0.6, type: 'physical',
      statuses: [{ type: 'web', chance: 1, duration: 3.5 }], scale: 1.2, sfx: 'spirit_cast',
    }),
  },
  hand_bundle: {
    windup: 0.8, active: 0.25, recover: 0.7, cooldown: 6, range: 20,
    anim: 'cast',
    onCast: (e, ctx) => projectile(e, ctx, {
      shape: 'hand', color: 0xd8c0a8, speed: 15, dmgMul: 0.9, type: 'physical', count: 5, spread: 0.22,
      statuses: [{ type: 'curse', chance: 0.4, duration: 6 }], sfx: 'spirit_cast', wobble: 1,
    }),
  },
  water_whip: {
    windup: 0.65, active: 0.3, recover: 0.8, cooldown: 4.5, range: 9,
    anim: 'cast',
    onCast: (e, ctx) => {
      coneBlast(e, ctx, { range: 10, arc: 55, dmgMul: 1.2, type: 'water', color: 0x6ab8e8, sfx: 'water_whip' });
    },
  },
  hair_sweep: {
    windup: 0.7, active: 0.5, recover: 0.9, cooldown: 5.5, range: 7,
    onCast: (e, ctx) => {
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          if (e.alive) coneBlast(e, ctx, { range: 9 - i, arc: 90, dmgMul: 0.6, type: 'physical', color: 0x20181a, sfx: 'slice' });
        }, i * 150);
      }
    },
  },
  bone_swipe: {
    windup: 0.55, active: 0.2, recover: 0.7, cooldown: 2.2, range: 9,
    onCast: (e, ctx) => meleeSwing(e, ctx, { range: 9, arc: 1.2, dmgMul: 1.3, wide: true, sfx: 'heavy_swing' }),
  },
  lash: {
    windup: 0.4, active: 0.18, recover: 0.5, cooldown: 1.9, range: 3.2,
    onCast: (e, ctx) => meleeSwing(e, ctx, {
      range: 3.4, arc: 1.8, dmgMul: 1.0, statuses: [{ type: 'bleed', chance: 0.5, duration: 5 }], sfx: 'slice',
    }),
  },
  bite: {
    windup: 0.5, active: 0.2, recover: 0.7, cooldown: 2.4, range: 2.8,
    onCast: (e, ctx) => {
      const hits = meleeSwing(e, ctx, { range: 2.8, arc: 1.2, dmgMul: 1.5, sfx: 'kon_bite', vfxColor: 0xff2e2e });
      for (const h of hits) e.restoreHealth(e.damage * 0.45);
    },
  },

  // ── area attacks ────────────────────────────────────────────────────
  wind_gust: {
    windup: 0.8, active: 0.4, recover: 0.9, cooldown: 6.5, range: 11,
    anim: 'cast',
    onStart: (e, ctx) => { ctx.vfx.summonCircle(e.position, { color: 0xa8d8ff, radius: 2.4, dur: 0.8 }); },
    onCast: (e, ctx) => {
      coneBlast(e, ctx, { range: 12, arc: 90, dmgMul: 1.1, type: 'spirit', color: 0xa8d8ff, sfx: 'spirit_whoosh' });
      ctx.combat.cone(e.position, _v.set(Math.sin(e.facing), 0, Math.cos(e.facing)), { range: 12, angle: 90, damage: 0, type: 'spirit', source: e })
        .forEach(({ actor }) => { actor.velocity.y += 5; actor.stagger(0.9); });
    },
  },
  frost_breath: {
    windup: 0.9, active: 0.6, recover: 1.0, cooldown: 8, range: 12,
    anim: 'cast',
    onCast: (e, ctx) => coneBlast(e, ctx, {
      range: 13, arc: 60, dmgMul: 1.0, type: 'frost',
      statuses: [{ type: 'chill', chance: 1, duration: 5 }], color: 0xa8d8ff, sfx: 'frost_breath',
    }),
  },
  sake_breath: {
    windup: 0.85, active: 0.55, recover: 1.0, cooldown: 9, range: 11,
    anim: 'cast',
    onCast: (e, ctx) => coneBlast(e, ctx, {
      range: 12, arc: 65, dmgMul: 1.2, type: 'fire',
      statuses: [{ type: 'burn', chance: 0.9, duration: 5 }], color: 0xff8a2a, sfx: 'fire_cast',
    }),
  },
  kanabo_slam: {
    windup: 1.1, active: 0.3, recover: 1.2, cooldown: 7, range: 7,
    anim: 'heavy',
    onStart: (e, ctx) => { ctx.vfx.aura(e.position, { color: 0xffd08a, size: 3, dur: 1.0 }); e.shout?.('砕'); },
    onCast: (e, ctx) => radialBurst(e, ctx, {
      radius: 7.5, dmgMul: 2.0, type: 'physical', color: 0xffd08a, knock: 9, sfx: 'heavy_impact',
    }),
  },
  rib_storm: {
    windup: 1.0, active: 0.8, recover: 1.0, cooldown: 10, range: 14,
    anim: 'cast',
    onCast: (e, ctx) => {
      for (let i = 0; i < 5; i++) {
        setTimeout(() => {
          if (!e.alive || !e.target) return;
          const at = e.target.position.clone();
          ctx.vfx.zone(at, 3.2, { color: 0x3a2a2a, dur: 0.7, height: 0.2, opacity: 0.7 });
          setTimeout(() => {
            if (!e.alive) return;
            ctx.combat.radial(at, { radius: 3.4, damage: e.damage * 0.7, type: 'physical', source: e });
            ctx.vfx.shockwave(at, { radius: 3.4, color: 0xe8dcc8, dur: 0.4 });
          }, 620);
        }, i * 320);
      }
    },
  },
  bell_ring: {
    windup: 1.0, active: 0.6, recover: 1.2, cooldown: 14, range: 20,
    anim: 'cast',
    onStart: (e, ctx) => { ctx.audio.play('bell_heavy', { volume: 1, position: e.position }); e.shout?.('九'); },
    onCast: (e, ctx) => {
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          if (!e.alive) return;
          radialBurst(e, ctx, { radius: 9 + i * 5, dmgMul: 0.8, type: 'spirit', color: 0xffd08a, sfx: 'bell_heavy_2' });
          for (const a of ctx.combat.actors) {
            if (a.faction === 'enemy' || !a.alive) continue;
            if (a.position.distanceTo(e.position) < 9 + i * 5) a.addStatus('stun', { duration: 0.6 });
          }
        }, i * 420);
      }
    },
  },
  tail_sweep: {
    windup: 0.7, active: 0.35, recover: 0.8, cooldown: 6, range: 8,
    anim: 'attack',
    onCast: (e, ctx) => radialBurst(e, ctx, { radius: 8, dmgMul: 1.3, type: 'physical', color: 0xff7a2a, knock: 7, sfx: 'tail_sweep' }),
  },
  whirl: {
    windup: 0.6, active: 1.4, recover: 0.9, cooldown: 8, range: 6,
    anim: 'attack',
    onCast: (e, ctx) => {
      for (let i = 0; i < 7; i++) {
        setTimeout(() => {
          if (!e.alive) return;
          e.facing += 0.9;
          radialBurst(e, ctx, { radius: 4.2, dmgMul: 0.35, type: 'physical', color: 0xd8c8a8, sfx: 'heavy_swing' });
        }, i * 190);
      }
    },
  },
  spirit_torrent: {
    windup: 1.1, active: 1.6, recover: 1.2, cooldown: 12, range: 22,
    anim: 'cast',
    onCast: (e, ctx) => {
      e.channelBeam = { t: 0 };
      const tick = () => {
        if (!e.alive || !e.channelBeam) return;
        const target = e.target;
        if (!target) return;
        const from = chest(e, new THREE.Vector3());
        const to = target.center(new THREE.Vector3());
        e.faceTowards(target.position.x, target.position.z, 0.05, 20);
        ctx.vfx.beam(from, to, { color: 0xbfe6ff, width: 1.1, dur: 0.12 });
        ctx.combat.radial(to, { radius: 2.2, damage: e.damage * 0.22, type: 'spirit', source: e, falloff: false });
        e.channelBeam.timer = setTimeout(tick, 110);
      };
      tick();
    },
    onEnd: (e) => { if (e.channelBeam) { clearTimeout(e.channelBeam.timer); e.channelBeam = null; } },
  },
  lifedrain: {
    windup: 0.8, active: 1.4, recover: 1.0, cooldown: 12, range: 14,
    anim: 'cast',
    onCast: (e, ctx) => {
      const target = e.target;
      if (!target) return;
      const iv = setInterval(() => {
        if (!e.alive || !target.alive) { clearInterval(iv); return; }
        const from = chest(e, new THREE.Vector3());
        const to = target.center(new THREE.Vector3());
        ctx.vfx.beam(from, to, { color: 0x8a4bd8, width: 0.7, dur: 0.2 });
        const drained = ctx.combat.applyDamage(target, {
          amount: e.damage * 0.25, type: 'void', source: e, ignoreDefense: false,
        }).damage;
        e.restoreHealth(drained * 1.2);
      }, 220);
      setTimeout(() => clearInterval(iv), 1400);
    },
  },
  drown: {
    windup: 0.9, active: 0.5, recover: 1.0, cooldown: 10, range: 4,
    anim: 'attack',
    onCast: (e, ctx) => {
      const target = e.target;
      if (!target || target.flatDistanceTo(e) > 5) return;
      target.addStatus('drown', { duration: 3.5 });
      target.stagger(1.4);
      ctx.combat.trueDamage(target, e.damage * 0.8, e, { type: 'water' });
      ctx.vfx.burst(target.center(new THREE.Vector3()), 24, { color: [0x6ab8e8, 0xa8d8ff], speed: 6, size: 0.4, life: 0.7 });
      ctx.audio.play('drown', { volume: 0.9, position: target.position });
      e.shout?.('沈');
    },
  },
  curse_gaze: {
    windup: 1.0, active: 0.4, recover: 1.1, cooldown: 11, range: 14,
    anim: 'cast',
    onCast: (e, ctx) => coneBlast(e, ctx, {
      range: 15, arc: 70, dmgMul: 0.5, type: 'void',
      statuses: [{ type: 'curse', chance: 1, duration: 10 }], color: 0x8a4bd8, sfx: 'darkness_cast',
    }),
  },
  wail: {
    windup: 0.8, active: 0.5, recover: 0.9, cooldown: 9, range: 12,
    anim: 'cast',
    onStart: (e, ctx) => { ctx.audio.play('wail', { volume: 0.9, position: e.position }); },
    onCast: (e, ctx) => {
      radialBurst(e, ctx, { radius: 11, dmgMul: 0.5, type: 'void', color: 0xd8e0f0, sfx: 'wail' });
      for (const a of ctx.combat.actors) {
        if (a.faction === 'enemy' || !a.alive) continue;
        if (a.position.distanceTo(e.position) < 11) {
          a.addStatus('slow', { duration: 4 });
          a.addStatus('weakness', { duration: 5 });
        }
      }
    },
  },
  curse: {
    windup: 1.0, active: 0.25, recover: 0.9, cooldown: 9, range: 18,
    anim: 'cast',
    onCast: (e, ctx) => projectile(e, ctx, {
      shape: 'skull', color: 0x8a4bd8, speed: 12, dmgMul: 0.8, type: 'void',
      statuses: [{ type: 'curse', chance: 1, duration: 8 }], homing: 1.2, sfx: 'spirit_cast', scale: 1.3,
    }),
  },
  scream: {
    windup: 0.7, active: 0.5, recover: 1.0, cooldown: 10, range: 15,
    anim: 'cast',
    onStart: (e, ctx) => { ctx.audio.play('scream', { volume: 1, position: e.position }); },
    onCast: (e, ctx) => {
      radialBurst(e, ctx, { radius: 14, dmgMul: 0.8, type: 'void', color: 0xff2e2e, sfx: 'scream' });
      for (const a of ctx.combat.actors) {
        if (a.faction === 'enemy' || !a.alive) continue;
        if (a.position.distanceTo(e.position) < 14) a.addStatus('terror', { duration: 3 });
      }
      e.invulnerable = 0.6;
    },
  },

  // ── mobility ────────────────────────────────────────────────────────
  blink_strike: {
    windup: 0.45, active: 0.35, recover: 0.7, cooldown: 5, range: 30,
    anim: 'cast',
    onStart: (e, ctx) => { ctx.vfx.summonCircle(e.position, { color: 0xff7a2a, radius: 2, dur: 0.45 }); },
    onCast: (e, ctx) => {
      const t = e.target;
      if (!t) return;
      ctx.audio.play('blink', { volume: 0.7, position: e.position });
      ctx.vfx.burst(e.position, 18, { color: [0xff7a2a, 0xffffff], speed: 7, size: 0.4, life: 0.4 });
      const behind = t.position.clone().addScaledVector(
        _v.set(Math.sin(t.facing), 0, Math.cos(t.facing)), -1.6,
      );
      behind.y = ctx.world.heightAt(behind.x, behind.z);
      e.position.copy(behind);
      e.faceTowards(t.position.x, t.position.z, 1, 60);
      ctx.vfx.burst(e.position, 18, { color: [0xff7a2a, 0xffffff], speed: 7, size: 0.4, life: 0.4 });
      meleeSwing(e, ctx, { range: 3.0, arc: 2.0, dmgMul: 1.35, sfx: 'slice', vfxColor: 0xff7a2a });
    },
  },
  sky_dive: {
    windup: 0.6, active: 1.3, recover: 1.1, cooldown: 9, range: 26,
    anim: 'jump',
    onStart: (e, ctx) => {
      e.velocity.y = 14;
      e.flyMode = true;
      ctx.audio.play('jump', { volume: 0.6, position: e.position });
    },
    onCast: (e, ctx) => {
      const t = e.target;
      if (!t) return;
      e.flyMode = false;
      const target = t.position.clone();
      target.y = ctx.world.heightAt(target.x, target.z);
      const dx = target.x - e.position.x;
      const dz = target.z - e.position.z;
      const dist = Math.hypot(dx, dz) || 1;
      e.velocity.set((dx / dist) * 26, -6, (dz / dist) * 26);
      e.diveTarget = target;
    },
    onEnd: (e, ctx) => {
      const at = e.position.clone();
      radialBurst(e, ctx, { radius: 5.5, dmgMul: 1.4, type: 'physical', color: 0xa8d8ff, knock: 8, sfx: 'heavy_impact' });
      e.velocity.set(0, 0, 0);
    },
  },
  spirit_slash: {
    windup: 0.5, active: 0.2, recover: 0.6, cooldown: 4, range: 8,
    anim: 'attack',
    onCast: (e, ctx) => {
      const fwd = _v.set(Math.sin(e.facing), 0, Math.cos(e.facing));
      const from = chest(e, new THREE.Vector3());
      const to = from.clone().addScaledVector(fwd, 9);
      ctx.vfx.beam(from, to, { color: 0xbfe6ff, width: 0.9, dur: 0.3 });
      ctx.combat.line(from, to, { width: 1.2, damage: e.damage * 1.1, type: 'spirit', source: e });
      ctx.audio.play('moon_slash', { volume: 0.8, position: e.position });
    },
  },

  // ── buffs & summons ─────────────────────────────────────────────────
  skull_laugh: {
    windup: 0.6, active: 0.6, recover: 0.8, cooldown: 16, range: 0,
    anim: 'taunt',
    onCast: (e, ctx) => {
      buff(e, ctx, { mods: { damageMul: 1.4, speedMul: 1.2 }, duration: 10, color: 0xff2e2e, sfx: 'skull_laugh', text: '数えきれぬほど' });
      ctx.audio.play('skull_laugh', { volume: 1, position: e.position });
    },
  },
  nine_tails_form: {
    windup: 0.9, active: 0.8, recover: 1.0, cooldown: 40, range: 0,
    anim: 'taunt',
    onCast: (e, ctx) => {
      buff(e, ctx, { mods: { damageMul: 1.6, speedMul: 1.3 }, duration: 20, color: 0xff7a2a, sfx: 'fox_bark', text: '九尾' });
      ctx.vfx.petals(e.position, { color: 0xff7a2a, count: 30, radius: 5 });
      e.enraged = true;
    },
  },
  mirror_self: {
    windup: 0.9, active: 0.6, recover: 1.0, cooldown: 30, range: 0,
    anim: 'cast',
    onCast: (e, ctx) => {
      for (let i = 0; i < 3; i++) {
        const a = _v.copy(e.position).add(new THREE.Vector3(Math.cos(i * 2.1) * 4, 0, Math.sin(i * 2.1) * 4));
        a.y = ctx.world.heightAt(a.x, a.z);
        ctx.spawnEnemy('yurei', e.level, a, { mirror: true, ttl: 25 });
        ctx.vfx.summonCircle(a, { color: 0xd8e0f0, radius: 2, dur: 0.8 });
      }
      ctx.audio.play('mirror_cast', { volume: 0.9, position: e.position });
      e.shout?.('鏡');
    },
  },
  summon_gaki: {
    windup: 1.0, active: 0.5, recover: 1.0, cooldown: 18, range: 0,
    anim: 'summon',
    onCast: (e, ctx) => {
      for (let i = 0; i < 3; i++) {
        const a = _v.copy(e.position).add(new THREE.Vector3(Math.cos(i * 2.4) * 5, 0, Math.sin(i * 2.4) * 5));
        a.y = ctx.world.heightAt(a.x, a.z);
        ctx.spawnEnemy('gaki', e.level, a, { ttl: 60 });
        ctx.vfx.summonCircle(a, { color: 0x8fd18a, radius: 1.8, dur: 0.8 });
      }
      ctx.audio.play('summon_circle', { volume: 0.8, position: e.position });
    },
  },
  summon_oni: {
    windup: 1.1, active: 0.6, recover: 1.1, cooldown: 26, range: 0,
    anim: 'summon',
    onCast: (e, ctx) => {
      for (let i = 0; i < 2; i++) {
        const a = _v.copy(e.position).add(new THREE.Vector3(Math.cos(i * 3.1) * 6, 0, Math.sin(i * 3.1) * 6));
        a.y = ctx.world.heightAt(a.x, a.z);
        ctx.spawnEnemy('oni_brute', Math.max(1, e.level - 6), a, { ttl: 90 });
        ctx.vfx.summonCircle(a, { color: 0xff5a2a, radius: 2.4, dur: 0.9 });
      }
      ctx.audio.play('roar_boss', { volume: 1, position: e.position });
    },
  },
  spiderlings: {
    windup: 0.9, active: 0.5, recover: 1.0, cooldown: 22, range: 0,
    anim: 'summon',
    onCast: (e, ctx) => {
      for (let i = 0; i < 4; i++) {
        const a = _v.copy(e.position).add(new THREE.Vector3(Math.cos(i * 1.6) * 4, 0, Math.sin(i * 1.6) * 4));
        a.y = ctx.world.heightAt(a.x, a.z);
        ctx.spawnEnemy('gaki', Math.max(1, e.level - 8), a, { ttl: 45, scale: 0.6 });
        ctx.vfx.summonCircle(a, { color: 0xd86ab8, radius: 1.6, dur: 0.7 });
      }
      ctx.audio.play('summon_circle', { volume: 0.7, position: e.position });
    },
  },
  contract_steal: {
    windup: 1.2, active: 0.8, recover: 1.4, cooldown: 34, range: 18,
    anim: 'cast',
    onStart: (e, ctx) => { ctx.audio.play('contract_steal', { volume: 0.9, position: e.position }); e.shout?.('契約'); },
    onCast: (e, ctx) => {
      const t = e.target;
      if (!t) return;
      const from = chest(e, new THREE.Vector3());
      const to = t.center(new THREE.Vector3());
      ctx.vfx.beam(from, to, { color: 0xff2e2e, width: 1.4, dur: 0.7 });
      const stolen = Math.min(t.focus, 45);
      t.focus -= stolen;
      t.addStatus('drain', { duration: 8 });
      e.restoreHealth(stolen * 2.5);
      ctx.vfx.burst(to, 30, { color: [0xff2e2e, 0x8a4bd8], speed: 8, size: 0.5, life: 0.6 });
      ctx.combat.radial(to, { radius: 4, damage: e.damage * 0.6, type: 'void', source: e });
    },
  },
};

// ──────────────────────────────────────────────────────────── executor
export function beginAttack(enemy, id, ctx) {
  const def = ENEMY_ATTACKS[id] || ENEMY_ATTACKS.melee_generic;
  const aggression = ctx.aggression ?? 1;
  const windup = def.windup / clamp(aggression, 0.6, 1.8);
  enemy.action = { id, def, phase: 'windup', t: 0, windup };
  enemy.animator.setState(def.anim || 'attack', { duration: windup + def.active, force: true });
  if (def.onStart) def.onStart(enemy, ctx, enemy.action);
  return windup + def.active + def.recover;
}

export function updateAttack(enemy, dt, ctx) {
  const a = enemy.action;
  if (!a) return false;
  const def = a.def;
  a.t += dt;
  if (a.phase === 'windup' && a.t >= a.windup) {
    a.phase = 'active';
    a.t = 0;
    if (def.onCast) def.onCast(enemy, ctx, a);
  } else if (a.phase === 'active' && a.t >= def.active) {
    a.phase = 'recover';
    a.t = 0;
    if (def.onEnd) def.onEnd(enemy, ctx, a);
  } else if (a.phase === 'recover' && a.t >= def.recover) {
    enemy.action = null;
    enemy.attackCooldown = (def.cooldown ?? 1.4) / clamp(ctx.aggression ?? 1, 0.6, 1.8);
    return false;
  }
  return true;
}

export function attackRange(id) {
  return (ENEMY_ATTACKS[id] || ENEMY_ATTACKS.melee_generic).range ?? 3;
}

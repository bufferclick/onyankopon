import { ACTIONS } from './Settings.js';
import { clamp, clamp01 } from './MathUtils.js';

/** Human-readable labels for key codes shown in the rebinding UI. */
const KEY_LABELS = {
  Space: 'Space', ShiftLeft: 'L Shift', ShiftRight: 'R Shift', ControlLeft: 'L Ctrl',
  ControlRight: 'R Ctrl', AltLeft: 'L Alt', AltRight: 'R Alt', MetaLeft: 'L Win',
  Escape: 'Esc', Enter: 'Enter', Tab: 'Tab', Backspace: 'Bksp',
  Mouse0: 'LMB', Mouse1: 'RMB', Mouse2: 'MMB', WheelUp: 'Wheel ↑', WheelDown: 'Wheel ↓',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
};

export function keyLabel(code) {
  if (!code) return '—';
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  if (code.startsWith('Gamepad')) return code;
  return code;
}

const GAMEPAD_AXIS_DEADZONE = 0.22;

/**
 * Unified input: keyboard, mouse and gamepad funnel into named actions.
 * Actions expose held / pressed / released and a timed "buffer" so attacks
 * registered a few frames early still chain (the difference between a combat
 * system that feels mushy and one that feels razor sharp).
 */
export class Input {
  constructor(target = window) {
    this.target = target;
    this.enabled = true;
    this.captureMode = 'none';   // 'none' | 'menu' (pointer free) | 'play' (pointer locked)
    this.actions = new Map();
    for (const a of ACTIONS) {
      this.actions.set(a.id, {
        id: a.id, down: false, pressed: false, released: false,
        heldTime: 0, lastPress: -999, lastRelease: -999, consumed: true,
      });
    }
    this.keys = new Set();
    this.mouse = { dx: 0, dy: 0, wheel: 0, buttons: [false, false, false], locked: false };
    this.time = 0;
    this.pad = { index: -1, connected: false, name: '', vibration: true };
    this.padPrev = new Map();
    this.textCapture = false;    // when true, keystrokes don't fire actions
    this.onPointerLockChange = null;
    this.#bind();
  }

  // -- bindings ------------------------------------------------------------
  setBindings(map) {
    this.bindings = new Map();
    for (const [action, codes] of Object.entries(map)) this.bindings.set(action, codes.slice());
  }

  #bind() {
    const t = this.target;
    this._onKeyDown = (e) => {
      if (this.textCapture) return;
      if (e.repeat) return;
      if (!this.enabled) return;
      // Don't swallow browser shortcuts / devtools
      if (e.ctrlKey && (e.code === 'KeyI' || e.code === 'KeyJ' || e.code === 'KeyU')) return;
      this.keys.add(e.code);
      this.#press(e.code);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F1', 'F3', 'F9'].includes(e.code)) {
        if (this.captureMode === 'play') e.preventDefault();
      }
    };
    this._onKeyUp = (e) => { this.keys.delete(e.code); this.#release(e.code); };
    this._onBlur = () => {
      for (const code of [...this.keys]) this.#release(code);
      this.mouse.buttons = [false, false, false];
    };
    this._onMouseDown = (e) => {
      if (!this.enabled) return;
      if (this.captureMode !== 'play') return;
      const code = `Mouse${e.button}`;
      this.#press(code);
      this.mouse.buttons[e.button] = true;
    };
    this._onMouseUp = (e) => {
      const code = `Mouse${e.button}`;
      this.#release(code);
      this.mouse.buttons[e.button] = false;
    };
    this._onMouseMove = (e) => {
      if (this.captureMode === 'play' && !this.mouse.locked) return;
      this.mouse.dx += e.movementX || 0;
      this.mouse.dy += e.movementY || 0;
    };
    this._onWheel = (e) => {
      this.mouse.wheel += Math.sign(e.deltaY);
      this.#press(e.deltaY < 0 ? 'WheelUp' : 'WheelDown');
    };
    this._onContext = (e) => { if (this.captureMode === 'play') e.preventDefault(); };
    this._onLockChange = () => {
      this.mouse.locked = document.pointerLockElement != null;
      if (!this.mouse.locked) this.mouse.buttons = [false, false, false];
      this.onPointerLockChange?.(this.mouse.locked);
    };
    this._onPadConnect = (e) => {
      this.pad.index = e.gamepad.index;
      this.pad.connected = true;
      this.pad.name = e.gamepad.id;
    };
    this._onPadDisconnect = (e) => {
      if (e.gamepad.index === this.pad.index) { this.pad.connected = false; this.pad.index = -1; }
    };

    window.addEventListener('keydown', this._onKeyDown, { passive: false });
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    t.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);
    t.addEventListener('wheel', this._onWheel, { passive: true });
    t.addEventListener('contextmenu', this._onContext);
    document.addEventListener('pointerlockchange', this._onLockChange);
    window.addEventListener('gamepadconnected', this._onPadConnect);
    window.addEventListener('gamepaddisconnected', this._onPadDisconnect);
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this.target.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    this.target.removeEventListener('wheel', this._onWheel);
    this.target.removeEventListener('contextmenu', this._onContext);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    window.removeEventListener('gamepadconnected', this._onPadConnect);
    window.removeEventListener('gamepaddisconnected', this._onPadDisconnect);
  }

  #press(code) {
    let hit = false;
    for (const [id, codes] of this.bindings || []) {
      if (!codes.includes(code)) continue;
      const a = this.actions.get(id);
      if (!a || a.down) continue;
      a.down = true; a.pressed = true; a.released = false; a.heldTime = 0;
      a.lastPress = this.time; a.consumed = false;
      hit = true;
    }
    return hit;
  }

  #release(code) {
    for (const [id, codes] of this.bindings || []) {
      if (!codes.includes(code)) continue;
      const a = this.actions.get(id);
      if (!a || !a.down) continue;
      a.down = false; a.released = true; a.lastRelease = this.time;
    }
  }

  requestPointerLock(el) {
    if (document.pointerLockElement === el) return;
    const p = el.requestPointerLock?.({ unadjustedMovement: true });
    if (p && typeof p.catch === 'function') p.catch(() => el.requestPointerLock?.());
  }

  exitPointerLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  // -- queries -------------------------------------------------------------
  isDown(id) { return this.actions.get(id)?.down ?? false; }
  wasPressed(id) { return this.actions.get(id)?.pressed ?? false; }
  wasReleased(id) { return this.actions.get(id)?.released ?? false; }
  heldFor(id) { return this.actions.get(id)?.heldTime ?? 0; }

  /**
   * Buffered press: returns true if the action was pressed within `window`
   * seconds and not yet consumed. Combat uses this for attack chaining.
   */
  consume(id, window = 0.18) {
    const a = this.actions.get(id);
    if (!a || a.consumed) return false;
    if (this.time - a.lastPress <= window) { a.consumed = true; return true; }
    return false;
  }

  /** Movement axis from keyboard or left stick, in [-1,1]. */
  getMoveAxis() {
    let x = 0, y = 0;
    if (this.isDown('moveForward')) y += 1;
    if (this.isDown('moveBack')) y -= 1;
    if (this.isDown('moveLeft')) x -= 1;
    if (this.isDown('moveRight')) x += 1;
    const g = this.padAxes();
    if (g.lx || g.ly) { x += g.lx; y += g.ly; }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y, magnitude: clamp01(Math.hypot(x, y)) };
  }

  padAxes() {
    const pad = this.#gamepad();
    if (!pad) return { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 };
    const dz = (v) => (Math.abs(v) < GAMEPAD_AXIS_DEADZONE ? 0
      : Math.sign(v) * ((Math.abs(v) - GAMEPAD_AXIS_DEADZONE) / (1 - GAMEPAD_AXIS_DEADZONE)));
    return {
      lx: dz(pad.axes[0] || 0), ly: -dz(pad.axes[1] || 0),
      rx: dz(pad.axes[2] || 0), ry: -dz(pad.axes[3] || 0),
      lt: clamp01(pad.buttons[6]?.value ?? 0), rt: clamp01(pad.buttons[7]?.value ?? 0),
    };
  }

  #gamepad() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  /** Consume accumulated mouse/gamepad look delta for this frame. */
  takeLook(scaleX = 1, scaleY = 1) {
    let dx = this.mouse.dx * scaleX;
    let dy = this.mouse.dy * scaleY;
    this.mouse.dx = 0; this.mouse.dy = 0;
    const g = this.padAxes();
    if (g.rx || g.ry) { dx += g.rx * 14 * scaleX; dy += -g.ry * 14 * scaleY; }
    return { dx: clamp(dx, -400, 400), dy: clamp(dy, -400, 400) };
  }

  rumble(strength = 0.5, duration = 120) {
    if (!this.pad.vibration) return;
    const pad = this.#gamepad();
    try {
      pad?.vibrationActuator?.playEffect?.('dual-rumble', {
        startDelay: 0, duration, weakMagnitude: strength * 0.7, strongMagnitude: strength,
      });
    } catch { /* unsupported */ }
  }

  wheelDelta() { const w = this.mouse.wheel; this.mouse.wheel = 0; return w; }

  /** Call once per frame, before gameplay reads actions but after raw events. */
  update(dt) {
    this.time += dt;
    // Poll gamepad buttons into the action map.
    const pad = this.#gamepad();
    const PAD_MAP = {
      0: 'jump', 1: 'dodge', 2: 'lightAttack', 3: 'heavyAttack', 4: 'block',
      5: 'kon', 6: 'ability1', 7: 'ability2', 8: 'interact', 9: 'pause',
      14: 'moveLeft', 15: 'moveRight', 12: 'moveForward', 13: 'moveBack',
    };
    if (pad) {
      for (const [btn, action] of Object.entries(PAD_MAP)) {
        const pressedNow = !!pad.buttons[btn]?.pressed;
        const was = this.padPrev.get(btn) || false;
        if (pressedNow && !was) this.#press(`Gamepad${btn}`);
        if (!pressedNow && was) this.#release(`Gamepad${btn}`);
        this.padPrev.set(btn, pressedNow);
        if (action && pressedNow) {
          // Mirror onto the action so `isDown('lightAttack')` works for pads too.
          const a = this.actions.get(action);
          if (a) { a.down = pressedNow; if (!was) { a.pressed = true; a.lastPress = this.time; a.consumed = false; } }
        }
      }
      const spr = pad.buttons[10]?.pressed;
      const a = this.actions.get('sprint');
      if (a && spr !== a.down) { a.down = spr; if (spr) { a.pressed = true; a.lastPress = this.time; a.consumed = false; } }
    }
    for (const a of this.actions.values()) if (a.down) a.heldTime += dt;
  }

  /** Call at the end of every frame to clear one-shot flags. */
  endFrame() {
    for (const a of this.actions.values()) { a.pressed = false; a.released = false; }
  }

  /** Used by the rebinding UI: capture the next physical key/button. */
  captureNext(timeoutMs = 6000) {
    return new Promise((resolve) => {
      const done = (code) => {
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('mousedown', onMouse, true);
        window.removeEventListener('wheel', onWheel, true);
        clearTimeout(timer);
        resolve(code);
      };
      const onKey = (e) => { e.preventDefault(); e.stopPropagation(); if (e.code !== 'Escape') done(e.code); else done(null); };
      const onMouse = (e) => { e.preventDefault(); e.stopPropagation(); done(`Mouse${e.button}`); };
      const onWheel = (e) => { e.preventDefault(); e.stopPropagation(); done(e.deltaY < 0 ? 'WheelUp' : 'WheelDown'); };
      const timer = setTimeout(() => done(null), timeoutMs);
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('mousedown', onMouse, true);
      window.addEventListener('wheel', onWheel, true);
    });
  }
}

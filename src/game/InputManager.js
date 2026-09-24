// -----------------------------------------------------------------------------
// InputManager - keyboard/mouse/gamepad abstraction.
//
// Works without a DOM (headless tests can drive it with `setVirtualStick`).
// -----------------------------------------------------------------------------
export const ACTIONS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  dodge: ['KeyQ'],
  interact: ['KeyE'],
  reload: ['KeyR'],
  crouch: ['KeyC', 'ControlLeft'],
  pause: ['Escape', 'KeyP'],
  map: ['KeyM'],
  debug1: ['F1'],
  debug2: ['F2'],
  debug3: ['F3'],
  debug4: ['F4'],
  debug5: ['F5'],
  debug6: ['F6'],
  debug7: ['F7'],
};

const REVERSE = {};
for (const [action, codes] of Object.entries(ACTIONS)) {
  for (const c of codes) {
    REVERSE[c] = REVERSE[c] || [];
    REVERSE[c].push(action);
  }
}

export class InputManager {
  constructor(target = typeof window !== 'undefined' ? window : null) {
    this.target = target;
    this.down = new Set();
    this.pressedThisFrame = new Set();
    this.releasedThisFrame = new Set();
    this.mouse = {
      x: 0,
      y: 0,
      nx: 0,
      ny: 0,
      left: false,
      right: false,
      leftPressed: false,
      rightPressed: false,
      wheel: 0,
      locked: false,
    };
    /** virtual input for headless tests / gamepad */
    this.stick = { x: 0, y: 0 };
    this.virtualDown = new Set();
    this.enabled = true;
    this._listeners = [];
    if (target) this._attach();
  }

  _on(el, type, fn, opts) {
    if (!el || !el.addEventListener) return;
    el.addEventListener(type, fn, opts);
    this._listeners.push([el, type, fn, opts]);
  }

  _attach() {
    this._on(this.target, 'keydown', (e) => {
      if (!this.enabled) return;
      if (e.repeat) {
        if (REVERSE[e.code]) e.preventDefault?.();
        return;
      }
      this.down.add(e.code);
      this.pressedThisFrame.add(e.code);
      if (REVERSE[e.code] || e.code === 'Tab') e.preventDefault?.();
    });
    this._on(this.target, 'keyup', (e) => {
      this.down.delete(e.code);
      this.releasedThisFrame.add(e.code);
    });
    this._on(this.target, 'blur', () => {
      this.down.clear();
      this.mouse.left = false;
      this.mouse.right = false;
    });
    const doc = typeof document !== 'undefined' ? document : null;
    if (doc) {
      this._on(doc, 'mousemove', (e) => {
        const w = typeof window !== 'undefined' ? window.innerWidth : 1920;
        const h = typeof window !== 'undefined' ? window.innerHeight : 1080;
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
        this.mouse.nx = (e.clientX / w) * 2 - 1;
        this.mouse.ny = -((e.clientY / h) * 2 - 1);
      });
      this._on(doc, 'mousedown', (e) => {
        if (e.button === 0) {
          this.mouse.left = true;
          this.mouse.leftPressed = true;
        }
        if (e.button === 2) {
          this.mouse.right = true;
          this.mouse.rightPressed = true;
        }
      });
      this._on(doc, 'mouseup', (e) => {
        if (e.button === 0) this.mouse.left = false;
        if (e.button === 2) this.mouse.right = false;
      });
      this._on(doc, 'contextmenu', (e) => e.preventDefault());
      this._on(doc, 'pointerlockchange', () => {
        this.mouse.locked = !!doc.pointerLockElement;
      });
      this._on(doc, 'wheel', (e) => {
        this.mouse.wheel += Math.sign(e.deltaY);
      });
    }
  }

  requestPointerLock() {
    const el = this.target?.document?.body;
    if (!el || !el.requestPointerLock || this.mouse.locked) return;
    try {
      el.requestPointerLock();
    } catch {
      /* ignore - the game is fully playable without pointer lock */
    }
  }

  exitPointerLock() {
    if (typeof document !== 'undefined' && document.exitPointerLock) document.exitPointerLock();
  }

  /** Test/gamepad hook. */
  setVirtualStick(x, y) {
    this.stick.x = x;
    this.stick.y = y;
  }

  setVirtual(action, isDown) {
    if (isDown) {
      this.virtualDown.add(action);
      this.pressedThisFrame.add(action);
    } else {
      this.virtualDown.delete(action);
    }
  }

  _codesFor(action) {
    return ACTIONS[action] || [];
  }

  isDown(action) {
    if (this.virtualDown.has(action)) return true;
    const codes = this._codesFor(action);
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  wasPressed(action) {
    if (this.pressedThisFrame.has(action)) return true;
    const codes = this._codesFor(action);
    for (const c of codes) if (this.pressedThisFrame.has(c)) return true;
    return false;
  }

  wasReleased(action) {
    const codes = this._codesFor(action);
    for (const c of codes) if (this.releasedThisFrame.has(c)) return true;
    return false;
  }

  /** Directional input as a normalised vector: x = left/right, y = forward/back. */
  getMoveAxis(out = { x: 0, y: 0 }) {
    let x = 0;
    let y = 0;
    if (this.isDown('left')) x -= 1;
    if (this.isDown('right')) x += 1;
    if (this.isDown('forward')) y += 1;
    if (this.isDown('back')) y -= 1;
    x += this.stick.x;
    y += this.stick.y;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    out.x = x;
    out.y = y;
    return out;
  }

  endFrame() {
    this.pressedThisFrame.clear();
    this.releasedThisFrame.clear();
    this.mouse.leftPressed = false;
    this.mouse.rightPressed = false;
    this.mouse.wheel = 0;
  }

  dispose() {
    for (const [el, type, fn, opts] of this._listeners) el.removeEventListener?.(type, fn, opts);
    this._listeners.length = 0;
  }
}

export default InputManager;

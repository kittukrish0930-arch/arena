// -----------------------------------------------------------------------------
// GameLoop - fixed step simulation with interpolated rendering.
//
// Runs on requestAnimationFrame in the browser and can be stepped manually by
// tests (`loop.step(dt)`), which is how the headless smoke test drives the game.
// -----------------------------------------------------------------------------

export class GameLoop {
  constructor({ update, render, fixedStep = 1 / 60, maxSubSteps = 5, maxDelta = 0.25 } = {}) {
    this.updateFn = update;
    this.renderFn = render;
    this.fixedStep = fixedStep;
    this.maxSubSteps = maxSubSteps;
    this.maxDelta = maxDelta;

    this.running = false;
    this.paused = false;
    this.accumulator = 0;
    this.elapsed = 0;
    this.frame = 0;
    this.fps = 60;
    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this._raf = null;
    this._lastTime = 0;
    this.timeScale = 1;
    this.onFrame = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._lastTime = now();
    const tick = () => {
      if (!this.running) return;
      const t = now();
      const delta = Math.min(this.maxDelta, (t - this._lastTime) / 1000);
      this._lastTime = t;
      this.timeScale = this.paused ? 0 : this.timeScale;
      this.step(delta * (this.paused ? 0 : 1));
      this._raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(tick) : null;
    };
    if (typeof requestAnimationFrame === 'function') this._raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    if (this._raf !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  /** Advances the simulation by `delta` seconds using fixed substeps. */
  step(delta) {
    if (delta <= 0) {
      this.renderFn?.(0, this);
      this.onFrame?.(0, this);
      return;
    }
    this.accumulator += delta;
    let steps = 0;
    while (this.accumulator >= this.fixedStep && steps < this.maxSubSteps) {
      this.updateFn?.(this.fixedStep, this);
      this.accumulator -= this.fixedStep;
      this.elapsed += this.fixedStep;
      steps++;
    }
    if (steps === this.maxSubSteps) this.accumulator = 0; // avoid death spiral
    this.frame++;
    this._fpsAccum += delta;
    this._fpsFrames++;
    if (this._fpsAccum >= 0.5) {
      this.fps = this._fpsFrames / this._fpsAccum;
      this._fpsAccum = 0;
      this._fpsFrames = 0;
    }
    this.renderFn?.(delta, this);
    this.onFrame?.(delta, this);
  }

  setPaused(paused) {
    this.paused = paused;
  }
}

function now() {
  if (typeof performance !== 'undefined' && performance.now) return performance.now();
  return Date.now();
}

export default GameLoop;

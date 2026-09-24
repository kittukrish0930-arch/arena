// -----------------------------------------------------------------------------
// HeadlessEffects - the effects object used when there is no 3D renderer.
//
// It runs the real particle simulation (pure logic, no three.js) so the game
// logic behaves identically in tests, and stubs out the GPU side.
// -----------------------------------------------------------------------------
import { ParticleSim } from './Particles.js';

export class HeadlessEffects {
  constructor(qualityScale = 1) {
    this.sim = new ParticleSim(qualityScale);
    this.enabled = true;
  }

  get particleCount() {
    return this.sim.liveCount;
  }

  tracer() {}
  decal() {}
  flashLight() {}
  bulletImpact() {}
  explosion() {}
  update(dt, ctx) {
    this.sim.update(dt, ctx);
  }
  setPixelScale() {}
  clear() {
    this.sim.clear();
  }
}

export default HeadlessEffects;

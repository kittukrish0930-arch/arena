// -----------------------------------------------------------------------------
// AudioManager - all sound is synthesised with the WebAudio API so the game
// needs no external audio files. If WebAudio is unavailable every call is a
// silent no-op, which keeps the game fully playable (and testable headlessly).
// -----------------------------------------------------------------------------
export class AudioManager {
  constructor({ enabled = true, volume = 0.8 } = {}) {
    this.enabled = enabled;
    this.masterVolume = volume;
    this.ctx = null;
    this.ready = false;
    this.buses = {};
    this.loops = {};
    this.lastPlayed = {};
    this.musicIntensity = 0;
    this.degraded = false;
  }

  init() {
    if (this.ready || !this.enabled) return false;
    const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!Ctx) {
      this.degraded = true;
      return false;
    }
    try {
      this.ctx = new Ctx();
    } catch {
      this.degraded = true;
      return false;
    }
    const master = this.ctx.createGain();
    master.gain.value = this.masterVolume;
    master.connect(this.ctx.destination);
    this.master = master;

    this.buses = {
      sfx: this._bus(0.9),
      music: this._bus(0.55),
      ui: this._bus(0.7),
      ambient: this._bus(0.55),
    };
    this._buildNoiseBuffer();
    this.ready = true;
    return true;
  }

  _bus(gain) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    g.connect(this.master);
    return g;
  }

  _buildNoiseBuffer() {
    const len = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
  }

  resume() {
    if (!this.ready) this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.masterVolume = v;
    if (this.master) this.master.gain.value = v;
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? this.masterVolume : 0;
    if (!on) this.stopAll();
  }

  _noise(gain, duration, filterFreq = 1000, type = 'lowpass') {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    const now = this.ctx.currentTime;
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0008, now + duration);
    src.connect(filter);
    filter.connect(g);
    return { src, gain: g, filter };
  }

  _tone(freq, gain, duration, type = 'sine', sweepTo = null) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    const g = this.ctx.createGain();
    const now = this.ctx.currentTime;
    osc.frequency.setValueAtTime(freq, now);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), now + duration);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(g);
    return { osc, gain: g, duration };
  }

  /**
   * Plays a one-shot sound.
   * @param {string} name
   */
  play(name, opts = {}) {
    if (!this.enabled) return;
    if (!this.ready) {
      if (!this.init() || !this.ready) return;
    }
    const now = performance.now ? performance.now() : Date.now();
    const throttle = SOUND_THROTTLE[name] ?? 25;
    if (this.lastPlayed[name] && now - this.lastPlayed[name] < throttle) return;
    this.lastPlayed[name] = now;
    const ctx = this.ctx;
    const bus = this.buses[opts.bus ?? 'sfx'] || this.buses.sfx;
    try {
      switch (name) {
        case 'gunshot': {
          const { src, gain } = this._noise(0.55, 0.28, 1800, 'lowpass');
          gain.connect(bus);
          src.start();
          src.stop(ctx.currentTime + 0.3);
          const crack = this._tone(180, 0.25, 0.12, 'square', 60);
          crack.gain.connect(bus);
          crack.osc.start();
          crack.osc.stop(ctx.currentTime + 0.12);
          break;
        }
        case 'enemyGunshot': {
          const { src, gain } = this._noise(0.3, 0.22, 1200);
          gain.connect(bus);
          src.start();
          src.stop(ctx.currentTime + 0.24);
          break;
        }
        case 'shotgun': {
          const { src, gain } = this._noise(0.7, 0.4, 900);
          gain.connect(bus);
          src.start();
          src.stop(ctx.currentTime + 0.42);
          break;
        }
        case 'rifle': {
          const { src, gain } = this._noise(0.45, 0.3, 2200);
          gain.connect(bus);
          src.start();
          src.stop(ctx.currentTime + 0.32);
          break;
        }
        case 'heavy': {
          const { src, gain } = this._noise(0.35, 0.18, 1500);
          gain.connect(bus);
          src.start();
          src.stop(ctx.currentTime + 0.2);
          break;
        }
        case 'reload': {
          for (let i = 0; i < 3; i++) {
            const click = this._tone(900 + i * 260, 0.14, 0.06, 'square');
            click.osc.connect(bus);
            click.osc.start(ctx.currentTime + i * 0.16);
            click.osc.stop(ctx.currentTime + i * 0.16 + 0.08);
          }
          break;
        }
        case 'explosion': {
          const { src, gain } = this._noise(0.85, 0.9, 420);
          gain.connect(bus);
          src.start();
          src.stop(ctx.currentTime + 0.95);
          const boom = this._tone(120, 0.6, 0.7, 'sine', 34);
          boom.gain.connect(bus);
          boom.osc.start();
          boom.osc.stop(ctx.currentTime + 0.75);
          break;
        }
        case 'hit':
        case 'hitmarker': {
          const t = this._tone(1500, 0.12, 0.06, 'triangle', 900);
          t.gain.connect(this.buses.ui);
          t.osc.start();
          t.osc.stop(ctx.currentTime + 0.07);
          break;
        }
        case 'hurt': {
          const { src, gain } = this._noise(0.5, 0.3, 700);
          gain.connect(this.buses.ui);
          src.start();
          src.stop(ctx.currentTime + 0.32);
          break;
        }
        case 'loot': {
          const notes = [660, 880, 1180];
          notes.forEach((f, i) => {
            const t = this._tone(f, 0.22, 0.3, 'triangle');
            t.gain.connect(this.buses.ui);
            t.osc.start(ctx.currentTime + i * 0.08);
            t.osc.stop(ctx.currentTime + i * 0.08 + 0.32);
          });
          break;
        }
        case 'objective': {
          const notes = [520, 780];
          notes.forEach((f, i) => {
            const t = this._tone(f, 0.2, 0.35, 'sine');
            t.gain.connect(this.buses.ui);
            t.osc.start(ctx.currentTime + i * 0.12);
            t.osc.stop(ctx.currentTime + i * 0.12 + 0.36);
          });
          break;
        }
        case 'alarm': {
          for (let i = 0; i < 3; i++) {
            const t = this._tone(420, 0.22, 0.3, 'sawtooth', 620);
            t.gain.connect(this.buses.ui);
            t.osc.start(ctx.currentTime + i * 0.34);
            t.osc.stop(ctx.currentTime + i * 0.34 + 0.32);
          }
          break;
        }
        case 'ui': {
          const t = this._tone(720, 0.16, 0.08, 'square', 520);
          t.gain.connect(this.buses.ui);
          t.osc.start();
          t.osc.stop(ctx.currentTime + 0.1);
          break;
        }
        case 'uiBack': {
          const t = this._tone(420, 0.16, 0.1, 'square', 300);
          t.gain.connect(this.buses.ui);
          t.osc.start();
          t.osc.stop(ctx.currentTime + 0.12);
          break;
        }
        case 'jackpot': {
          [523, 659, 784, 1046].forEach((f, i) => {
            const t = this._tone(f, 0.25, 0.5, 'triangle');
            t.gain.connect(this.buses.music);
            t.osc.start(ctx.currentTime + i * 0.12);
            t.osc.stop(ctx.currentTime + i * 0.12 + 0.55);
          });
          break;
        }
        case 'fail': {
          [400, 320, 240, 180].forEach((f, i) => {
            const t = this._tone(f, 0.24, 0.5, 'sawtooth');
            t.gain.connect(this.buses.music);
            t.osc.start(ctx.currentTime + i * 0.18);
            t.osc.stop(ctx.currentTime + i * 0.18 + 0.55);
          });
          break;
        }
        case 'steam': {
          const { src, gain } = this._noise(0.35, 1.4, 3600, 'highpass');
          gain.connect(bus);
          src.start();
          src.stop(ctx.currentTime + 1.5);
          break;
        }
        default:
          break;
      }
    } catch {
      /* audio must never break gameplay */
    }
  }

  /** Looping ambience/engine beds. */
  startLoop(name, gainValue = 0.3) {
    if (!this.enabled) return;
    if (!this.ready && !this.init()) return;
    if (this.loops[name]) return this.loops[name];
    const ctx = this.ctx;
    const g = this.ctx.createGain();
    g.gain.value = gainValue;
    g.connect(this.buses.ambient);
    let nodes;
    if (name === 'engine') {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 58;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 3.2;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 10;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      osc.connect(filter);
      filter.connect(g);
      osc.start();
      lfo.start();
      nodes = { osc, lfo, filter };
    } else if (name === 'wind') {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 700;
      filter.Q.value = 0.7;
      src.connect(filter);
      filter.connect(g);
      src.start();
      nodes = { src, filter };
    } else {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      src.connect(filter);
      filter.connect(g);
      src.start();
      nodes = { src, filter };
    }
    this.loops[name] = { gain: g, nodes, base: gainValue };
    return this.loops[name];
  }

  setLoopGain(name, value) {
    const loop = this.loops[name];
    if (loop) loop.gain.gain.value = value;
  }

  stopLoop(name) {
    const loop = this.loops[name];
    if (!loop) return;
    try {
      loop.nodes.osc?.stop();
      loop.nodes.lfo?.stop();
      loop.nodes.src?.stop();
      loop.gain.disconnect();
    } catch {
      /* ignore */
    }
    delete this.loops[name];
  }

  /** Simple two-voice procedural music bed; intensity 0..1. */
  updateMusic(dt, intensity) {
    this.musicIntensity = intensity;
    const music = this.buses.music;
    if (!music) return;
    music.gain.value = 0.35 + intensity * 0.35;
  }

  stopAll() {
    for (const name of Object.keys(this.loops)) this.stopLoop(name);
  }

  dispose() {
    this.stopAll();
    try {
      this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ready = false;
  }
}

const SOUND_THROTTLE = {
  gunshot: 40,
  enemyGunshot: 60,
  shotgun: 60,
  rifle: 60,
  heavy: 40,
  hit: 30,
  hitmarker: 30,
  ui: 60,
  uiBack: 60,
  loot: 120,
  hurt: 180,
  explosion: 90,
  steam: 400,
};

export default AudioManager;

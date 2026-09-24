// -----------------------------------------------------------------------------
// GameState - the high level state machine with reliable transitions.
// -----------------------------------------------------------------------------

export const GameStates = {
  MENU: 'menu',
  INTRO: 'intro',
  PLAYING: 'playing',
  PAUSED: 'paused',
  BOSS: 'boss',
  VAULT: 'vault',
  ESCAPE: 'escape',
  MISSION_COMPLETE: 'mission_complete',
  MISSION_FAILED: 'mission_failed',
};

const ALLOWED = {
  [GameStates.MENU]: [GameStates.INTRO, GameStates.MENU],
  [GameStates.INTRO]: [GameStates.PLAYING, GameStates.MENU, GameStates.MISSION_FAILED],
  [GameStates.PLAYING]: [GameStates.PAUSED, GameStates.BOSS, GameStates.VAULT, GameStates.MISSION_FAILED, GameStates.MISSION_COMPLETE, GameStates.MENU],
  [GameStates.PAUSED]: [GameStates.PLAYING, GameStates.MENU, GameStates.INTRO],
  [GameStates.BOSS]: [GameStates.PLAYING, GameStates.VAULT, GameStates.PAUSED, GameStates.MISSION_FAILED, GameStates.MENU],
  [GameStates.VAULT]: [GameStates.PLAYING, GameStates.ESCAPE, GameStates.PAUSED, GameStates.MISSION_FAILED, GameStates.MENU],
  [GameStates.ESCAPE]: [GameStates.PLAYING, GameStates.MISSION_COMPLETE, GameStates.PAUSED, GameStates.MISSION_FAILED, GameStates.MENU],
  [GameStates.MISSION_COMPLETE]: [GameStates.MENU, GameStates.INTRO],
  [GameStates.MISSION_FAILED]: [GameStates.MENU, GameStates.INTRO, GameStates.PLAYING],
};

export class GameState {
  constructor(initial = GameStates.MENU) {
    this.current = initial;
    this.previous = initial;
    this.timeInState = 0;
    this.listeners = new Set();
    this.history = [initial];
  }

  onTransition(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  canTransition(to) {
    if (to === this.current) return false;
    const allowed = ALLOWED[this.current] || [];
    return allowed.includes(to);
  }

  transition(to, payload = null) {
    if (!this.canTransition(to)) return false;
    this.previous = this.current;
    this.current = to;
    this.timeInState = 0;
    this.history.push(to);
    if (this.history.length > 32) this.history.shift();
    for (const fn of this.listeners) fn(to, this.previous, payload);
    return true;
  }

  /** Force a state change (used by tests and hard resets). */
  set(to, payload = null) {
    this.previous = this.current;
    this.current = to;
    this.timeInState = 0;
    this.history.push(to);
    for (const fn of this.listeners) fn(to, this.previous, payload);
    return true;
  }

  is(...states) {
    return states.includes(this.current);
  }

  /** True when gameplay simulation should advance. */
  get simulating() {
    return (
      this.current === GameStates.PLAYING ||
      this.current === GameStates.BOSS ||
      this.current === GameStates.VAULT ||
      this.current === GameStates.ESCAPE ||
      this.current === GameStates.INTRO
    );
  }

  /** True when the player has direct control. */
  get controllable() {
    return this.current === GameStates.PLAYING || this.current === GameStates.BOSS || this.current === GameStates.VAULT || this.current === GameStates.ESCAPE;
  }

  update(dt) {
    this.timeInState += dt;
  }
}

export default GameState;

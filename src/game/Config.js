// -----------------------------------------------------------------------------
// TRAIN HEIST - global tunables
// Single source of truth for world scale, balance values and pacing.
// -----------------------------------------------------------------------------

/** Train geometry (world units, ~1 unit == 1 meter). */
export const TRAIN = {
  trackTopY: 0, // top of the rail surface
  floorY: 1.2, // interior floor surface of a car
  ceilingY: 3.8, // interior ceiling
  roofY: 4.05, // walkable roof surface
  width: 3.2, // car width (z: -1.6 .. +1.6)
  halfWidth: 1.6,
  wallThickness: 0.24,
  endWallThickness: 0.34,
  gap: 0.85, // coupler gap between cars
  baseSpeed: 21.5, // units / second
  speedPerAlertUnit: 0, // reserved for pacing tweaks
  carLength: {
    loco: 17,
    tender: 7,
    caboose: 9,
    cargo: 13,
    passenger: 13,
    flatcar: 11,
    armored: 13,
    vault: 13,
  },
  /** Track length of the full consist, metres of "journey" remaining. */
  journeyDistance: 3400,
};

export const PLAYER = {
  height: 1.78,
  radius: 0.38,
  eyeHeight: 1.62,
  maxHealth: 100,
  walkSpeed: 5.2,
  sprintSpeed: 8.6,
  crouchSpeed: 2.6,
  accel: 42,
  airAccel: 16,
  friction: 26,
  jumpSpeed: 9.6,
  gravity: 30,
  maxFallSpeed: 42,
  dodgeSpeed: 15,
  dodgeDuration: 0.42,
  dodgeCooldown: 0.7,
  coyoteTime: 0.14,
  jumpBuffer: 0.16,
  stepHeight: 0.42,
  interactRange: 2.6,
  fallRecoveryWindow: 3.2,
  fallDamageThreshold: 9,
  /** brief invulnerability after taking a hit (keeps fights fair) */
  hitInvuln: 0.42,
};

export const COMBAT = {
  revolver: {
    name: 'PEACEMAKER',
    damage: 34,
    headshotMultiplier: 2.0,
    fireRate: 0.32, // seconds between shots
    reloadTime: 1.65,
    magSize: 6,
    reserveAmmo: 60,
    maxReserve: 90,
    range: 120,
    spread: 0.006,
    recoil: 1.0,
    knockback: 3.2,
  },
  aimAssist: 0.35, // how strongly the crosshair snaps toward nearby targets
  tracerLife: 0.075,
  hitmarkerTime: 0.22,
};

export const CAMERA = {
  fov: 42,
  near: 0.1,
  far: 900,
  offsetX: 7.0, // trailing offset along the train (behind the facing direction)
  offsetY: 8.1,
  offsetZ: 15.5,
  lookAhead: 2.6,
  lookHeight: 1.15,
  followLerp: 6.5,
  posLerp: 5.0,
  minDistance: 11,
  maxDistance: 26,
  shakeDecay: 5.2,
};

export const ALERT = {
  max: 100,
  decay: 1.6, // per second
  decayDelay: 3.2,
  perDetection: 16,
  perGunshot: 7,
  perKill: 9,
  reinforcementThreshold: 68,
  reinforcementCooldown: 22,
};

export const SCORE = {
  loot: 1,
  kill: { basic: 120, shotgun: 150, rifle: 165, heavy: 260, elite: 420, boss: 2500 },
  timeBonusPerSecond: 12,
  damagePenalty: 8,
  accuracyBonus: 90,
  stealthBonus: 600,
};

export const EFFECTS = {
  maxParticles: 900,
  maxTracers: 48,
  maxImpacts: 60,
  shadowMapSize: 2048,
  fogNear: 55,
  fogFar: 300,
};

export const QUALITY = {
  low: { shadows: false, shadowMapSize: 1024, particleScale: 0.5, instancing: 0.6, pixelRatio: 1, fogFar: 240 },
  medium: { shadows: true, shadowMapSize: 1536, particleScale: 0.8, instancing: 0.85, pixelRatio: 1.25, fogFar: 280 },
  high: { shadows: true, shadowMapSize: 2048, particleScale: 1, instancing: 1, pixelRatio: 1.75, fogFar: 320 },
};

export const COLORS = {
  sand: 0xb9834f,
  sandDark: 0x8a5c34,
  rock: 0x7a5a45,
  rockDark: 0x53412f,
  wood: 0x6b4526,
  woodDark: 0x42291577,
  iron: 0x4a4c52,
  ironDark: 0x2e3035,
  rust: 0x8c4a25,
  brass: 0xc79a3e,
  gold: 0xffc547,
  crimson: 0x8e2028,
  skyTop: 0x1b2a5a,
  skyMid: 0xd8632c,
  skyHorizon: 0xffb765,
  sun: 0xffd9a0,
};

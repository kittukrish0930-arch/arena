# TRAIN HEIST

A cinematic **2.5D action game** that runs in the browser. You are an outlaw who boards a
moving train at sunset, fights forward car by car, cracks the payroll vault and leaps off
the locomotive before the line runs out.

Built with **Three.js + GSAP + Vite**, plain ES modules, and **100 % procedural assets** —
every mesh is generated from primitives and every texture is synthesised from typed arrays,
so nothing is downloaded and nothing is copyrighted.

```
npm install
npm run dev      # http://localhost:5173
npm test         # headless smoke + render tests
npm run build    # production bundle into dist/
```

## Controls

| Action | Keys |
| --- | --- |
| Move along / across the train | `W A S D` or arrow keys |
| Jump / grab the train | `SPACE` |
| Sprint | `SHIFT` |
| Dodge (brief invulnerability) | `Q` |
| Crouch | `C` / `CTRL` |
| Interact, steal, open the vault, jump | `E` |
| Reload | `R` |
| Shoot / aim | left mouse (aim follows the crosshair) |
| Pause | `ESC` or `P` |

Debug (development builds): `F1` debug overlay, `F2` skip a car, `F3` spawn enemies,
`F4` invincibility, `F5` FPS display. They are only reachable behind `F1`.

## Mission flow

`BOARD → FIGHT GUARDS → LOOT → ROOFTOP → ARMORED CAR → BOSS → VAULT → ESCAPE → SCORE`

* **Consist** (rear → front): caboose, box car, passenger car, bomb car, flat car,
  armored car, vault car, locomotive. Doors, ladders, windows, roof hatches, couplers and
  underframes are all walkable / shootable geometry.
* **Vault**: defeat the ELITE GUARD (four phases, reinforcements, charges), then press `E`
  at the blast door for the full cinematic — wheels spinning, clamps retracting, steam,
  the door lifting into the ceiling and the payroll behind it.
* **Escape**: grabbing the treasure raises the train speed, spawns a trestle and a low
  gantry, and arms the jump at the front of the locomotive.

## Architecture

The gameplay core never imports Three.js. Gameplay modules describe geometry as plain data
(`{ g, m, x, y, z, sx, sy, sz, rx, ry, rz }`) and the render layer batches it. That keeps
the whole game runnable and testable in Node.

```
src/
  main.js              bootstrap: build the view, hand it to Game, start the loop
  game/                Game (orchestrator), state machine, loop, camera, alerts,
                       objectives, boss/vault/escape cinematics, input, config
  player/              player physics/health/pose, controller (intent + aim), combat
  enemies/             enemy AI state machine + spawn/pacing manager
  train/               consist layout, per-car construction, animation
  environment/         scrolling desert, props, landmarks, weather
  world/               primitives, prefabs, loot, destructibles
  physics/             axis-aligned collision world (moves, raycasts, LOS)
  combat/              weapons, pooled projectiles, damage + statistics
  fx/                  particle simulation + GPU effects (tracers, decals, lights)
  render/              view3d, instanced world builder, character views, sky rig
  ui/                  DOM HUD, main menu, pause menu, mission screen, stylesheet
  audio/               procedural WebAudio (silent no-op without AudioContext)
  utils/               rng, math, pools, procedural textures, materials
tools/
  smoke-test.mjs       full scripted playthrough in jsdom (68 checks)
  render-test.mjs      materials/geometry/merge/instancing/rig checks (34 checks)
  playtest.mjs         balance probe: a bot plays the run, prints health/kills/progress
```

### Performance notes

* static geometry is merged per material (≈35 draw calls for the whole level),
  scrolling props are `InstancedMesh` (one per prefab material), wheels are a single
  instanced mesh, particles/tracers/decals are pooled and copy into GPU buffers.
* the train is stationary and the world scrolls past it (treadmill), so coordinates stay
  small and collision is stable over a long run.
* quality presets (low/medium/high) change pixel ratio, shadows, fog and particle counts.

## Verification

`npm test` runs two headless suites:

* **smoke test** – boots the real game in jsdom, plays menu → intro → firefight → loot →
  rooftop hazards → boss phases → vault cinematic → escape → score screen, then the
  failure/restart, pause and debug paths. 68 checks.
* **render test** – builds every material, geometry, prefab, merged static mesh,
  instanced prop kind, dynamic group, the sky rig and the character rig with the real
  Three.js API. 34 checks.

`node tools/playtest.mjs` runs a bot through the run and reports survival time, kills,
loot and objective progress; useful when tuning difficulty.

# WindTank Expansion (Larger Maps, 10-Shell Base, Custom/Unlimited Score & Superhero Power-Ups) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade WindTank with larger auto-scaled mazes (up to `20×12`), a 10-shell base magazine, an interactive `◀ / Custom Input / ▶ / Unlimited` score selector, 20-second mystery wooden crates with rarity-weighted drops, 4 distinct superhero tank skills (`Laser`, `Đạn Gai`, `Đạn Liên Thanh`, `Đạn Định Vị`) with explosive VFX/SFX, and a dedicated Skill Codex UI.

**Architecture:** Pure simulation math for crate drops, parabolic wall-piercing Laser, wall-occluded Spike bursts/traps, and BFS + string-pulled Homing Missiles lives in `src/game/systems/PowerUpSim.ts` alongside extended swept collision modes in `CollisionSystem.ts` for deterministic headless testing. Phaser visual/audio orchestration lives in `PowerUpSystem.ts`, pre-baked Canvas2D superhero textures in `AssetFactory.ts`, high-impact particles/shockwaves in `EffectsSystem.ts`, and reusable UI widgets (`createScoreStepper`, `SkillGuideModal`) across Menu, Lobby, Settings, and HUD scenes.

**Tech Stack:** Phaser `^3.88.2`, TypeScript `^5.8.2`, Vite `^6.2.0`, Node `node:test` (`tsx`), Playwright (`@playwright/test`).

**Spec:** `docs/superpowers/specs/2026-11-26-powerups-maps-score-design.md`

## Global Constraints

- Design viewport fixed at `1280×760` (`ARENA_VIEWPORT`: `maxWidth: 1080`, `maxHeight: 552`, `centerX: 640`, `centerY: 344`).
- Zero external image/audio/API dependencies: all sprites generated via Canvas2D in `AssetFactory.ts` and all sounds via Web Audio API in `AudioManager.ts`.
- Base magazine `maxProjectilesPerTank = 10`; projectile pool `POOL_SIZE = 160`.
- `winningScore = 0` denotes **Unlimited** (`∞`); custom positive scores clamp to `1..999`.
- All mystery crates use the identical `pickup_wood_crate` visual prior to pickup; drop weights are `gatling: 36`, `spike: 28`, `homing: 22`, `laser: 14`.
- Note: Workspace is not a git repository; verify every task with `npm run typecheck && npm run test:unit` rather than `git commit`.

## Review Focus

1. **Laser cone boundary & rear rivals:** Rivals behind the shooter (`x' <= 0`) or outside `±15°` (e.g. `16.5°`) must never bend the beam; beam stays straight along `tank.angle`.
2. **Ground spike wall occlusion:** Detonating a Spike Shell next to an interior wall must clip ground spike hazard nodes at the wall so tanks in the adjacent closed corridor cannot be killed through solid concrete.
3. **Homing missile maze-distance vs Euclidean distance & wall grazing:** When Tank A is closer in straight-line distance through a solid wall (`40px`) while the shooter Tank B is closer along open maze corridors (`2 cells` vs `7 cells`), Phase 2 seeker must target Tank B, switch immediately when distances invert, and slide along walls without expiring on `maxBounces`.
4. **Crate pickup during active skill states:** Overlapping a crate during the `2.0s` Laser charge must leave the crate untouched and keep charge lock intact; overlapping while holding unspent `gatling` ammo replaces the skill cleanly.
5. **Custom score input edge cases:** Entering `0` selects `Unlimited` (`0`); confirming an empty buffer restores the prior valid score; entering `9999` clamps to `999`; pressing `Enter` while editing score in `SetupScene` confirms the input without launching `GameScene`.

---

### Task 1: Core Types, 10-Shell Constants, Larger Mazes & Unlimited/Custom Score Managers

**Files:**
- Modify: `src/game/types/gameTypes.ts`
- Modify: `src/game/config/constants.ts`
- Modify: `src/game/maps/mapDefinitions.ts`
- Modify: `src/game/maps/MazeBuilder.ts`
- Modify: `src/game/managers/SettingsManager.ts`
- Modify: `src/game/managers/ScoreManager.ts`
- Test: `tests/simulation.test.ts`

**Interfaces:**
- Produces in `src/game/types/gameTypes.ts`:
  - `SkillId = 'laser' | 'spike' | 'gatling' | 'homing'`
  - `ProjectileVariant = 'standard' | 'gatling' | 'spike_ball' | 'spike_shard' | 'homing_missile'`
  - `BounceBehavior = 'reflect' | 'shatter' | 'slide'`
  - Extended `MapModeId` adding `'procedural_mega' | 'procedural_colossal' | 'procedural_titan' | 'citadel_wargrounds' | 'titan_stronghold'`
  - Extended `ProjectileKinematics` with optional/defaulted `variant: ProjectileVariant`, `bounceBehavior: BounceBehavior`
- Produces in `src/game/config/constants.ts`:
  - `BASE_GAMEPLAY.maxProjectilesPerTank = 10`
  - `POWERUP_CONFIG` (interval `20`, max floor crates `4`, drop weights `36/28/22/14`, skill tuning constants, Vietnamese metadata for UI & HUD)
  - `normalizeWinningScore(raw: number): number` (`0` for Unlimited, `1..999` clamped integer)

- [ ] **Step 1: Add failing unit tests in `tests/simulation.test.ts` for larger maps (`14×9` to `20×12`), `cellSize` viewport fit, 10-shell constant, and Unlimited/custom `ScoreManager` & `SettingsManager`**
  - Assert `buildArenaLayout` on `20×12` produces `width <= 1080` and `height <= 552` with 4 valid non-overlapping spawns.
  - Assert `PRESET_MAZE_MAP.citadel_wargrounds` (`14×9`) and `PRESET_MAZE_MAP.titan_stronghold` (`16×10`) pass `isMazeValidAndConnected`.
  - Assert `BASE_GAMEPLAY.maxProjectilesPerTank === 10`.
  - Assert `ScoreManager(2, 0)` never sets `matchWinnerIndex` even after 20 round wins, and `SettingsManager.setWinningScore` supports `0` (Unlimited), `42`, and clamps `9999 -> 999`.
- [ ] **Step 2: Run `npm run test:unit` to verify new assertions fail**
  - Run: `npm run test:unit`
  - Expected: FAIL on missing map presets, `20×12` height `696 > 552`, `maxProjectilesPerTank === 5`, and `winningScore` clamping `0 -> 1`.
- [ ] **Step 3: Implement types, constants, larger presets/modes, dynamic `MazeBuilder` scaling, and Unlimited/custom score logic**
  - Update `MazeBuilder.ts`: `cellSize = Math.max(32, Math.min(92, rawCellW, rawCellH))` and `wallThickness = Math.max(4, Math.round(BASE_GAMEPLAY.wallThickness * scaleRatio))`.
  - Add `procedural_mega` (`14×9`), `procedural_colossal` (`17×10`), `procedural_titan` (`20×12`), `citadel_wargrounds` (`14×9`), and `titan_stronghold` (`16×10`) to `mapDefinitions.ts`.
  - Update `SettingsManager.setWinningScore` & `load()` to accept `0` or `1..999`, and `ScoreManager.recordRoundOutcome` to check `this.winningScore > 0 && this.scores[winnerIndex] >= this.winningScore`.
- [ ] **Step 4: Run `npm run typecheck && npm run test:unit` to verify PASS**
  - Run: `npm run typecheck && npm run test:unit`
  - Expected: PASS with 0 errors.

---

### Task 2: Pure Simulation Engine for Skills, Crates & Extended Collision (`CollisionSystem.ts` + `PowerUpSim.ts`)

**Files:**
- Modify: `src/game/systems/CollisionSystem.ts`
- Create: `src/game/systems/PowerUpSim.ts`
- Test: `tests/simulation.test.ts`

**Interfaces:**
- Consumes: `SkillId`, `ProjectileKinematics`, `TankKinematics`, `BuiltArenaLayout`, `POWERUP_CONFIG`, `SeededRng`.
- Produces in `src/game/systems/CollisionSystem.ts`:
  - Export `sweepCircleAgainstWall(x0, y0, dx, dy, r, w): SweptHit | null`
  - Support `p.bounceBehavior`: `'reflect'` (default specular + `bounces++`), `'shatter'` (deactivates `p.active = false` on wall hit), `'slide'` (projects velocity along wall tangent + nudges out without incrementing `bounces` so Phase 2 seekers never fizzle on wall grazes).
- Produces in `src/game/systems/PowerUpSim.ts`:
  - `rollWeightedSkill(rng: SeededRng): SkillId`
  - `pickMysteryCrateCell(arena: BuiltArenaLayout, tanks: readonly TankKinematics[], crates: readonly MysteryCrateState[], spikeZones: readonly GroundSpikeZone[], rng: SeededRng): { col: number; row: number; x: number; y: number } | null`
  - `computeLaserBeam(muzzleX: number, muzzleY: number, angle: number, ownerIndex: PlayerIndex, tanks: readonly TankKinematics[], arena: BuiltArenaLayout): { points: Array<{ x: number; y: number }>; lockedTargetIndex: PlayerIndex | null; hitVictimIndices: PlayerIndex[] }`
  - `createSpikeBurstPayload(cx: number, cy: number, ownerIndex: PlayerIndex, arena: BuiltArenaLayout, rng: SeededRng): { shrapnelVelocities: Array<{ vx: number; vy: number }>; groundNodes: GroundSpikeNode[] }`
  - `findGroundSpikeVictims(zones: readonly GroundSpikeZone[], tanks: readonly TankKinematics[]): PlayerIndex[]`
  - `steerHomingMissile(proj: ProjectileKinematics, tanks: readonly TankKinematics[], arena: BuiltArenaLayout, dt: number): { targetIndex: PlayerIndex | null }`

- [ ] **Step 1: Add failing unit tests in `tests/simulation.test.ts` for all 4 skills, weighted crate drops, and Review Focus cases 1–4**
  - Test weighted distribution across 5,000 deterministic rolls (`gatling > spike > homing > laser` within ±2.5% of `36/28/22/14%`).
  - Test `computeLaserBeam`: bends parabolically into rival at `+12°` behind a solid wall (piercing wall & hitting rival), ignores rival at `+16.5°` and rival behind muzzle (`-170°`), firing straight to arena border.
  - Test `createSpikeBurstPayload` + `findGroundSpikeVictims`: creates 16 radial shrapnel vectors + ground spike nodes; verifies wall occlusion prevents ground spikes from spawning/killing on the far side of an adjacent wall, while killing any tank (including shooter) overlapping unobstructed ground spikes.
  - Test `steerHomingMissile` + `stepProjectilesSimulation`: before `4.0s` bounces normally; after `4.0s` selects target by shortest *maze* path (choosing open-corridor shooter over wall-blocked closer Euclidean rival), retargets dynamically when positions change, and slides past wall grazes without deactivating on `maxBounces`.
- [ ] **Step 2: Run `npm run test:unit` to verify FAIL**
  - Run: `npm run test:unit`
  - Expected: FAIL (`Cannot find module '../src/game/systems/PowerUpSim'`).
- [ ] **Step 3: Implement `BounceBehavior` in `CollisionSystem.ts` and full `PowerUpSim.ts` math/pathfinding**
  - Export `sweepCircleAgainstWall` and handle `'shatter'` / `'slide'` in `stepProjectilesSimulation`.
  - Implement BFS + doorway waypoint extraction + `sweepCircleAgainstWall` line-of-sight string-pulling in `steerHomingMissile`.
  - Implement parabolic local-frame curve sampling & segment-to-circle distance checks in `computeLaserBeam`, and ray-vs-wall clipping for ground spike nodes in `createSpikeBurstPayload`.
- [ ] **Step 4: Run `npm run typecheck && npm run test:unit` to verify PASS**
  - Run: `npm run typecheck && npm run test:unit`
  - Expected: PASS with all physics and skill simulation tests green.

---

### Task 3: Superhero Tank Art (`AssetFactory.ts`), Explosive VFX (`EffectsSystem.ts`) & Skill Audio (`AudioManager.ts`)

**Files:**
- Modify: `src/game/art/AssetFactory.ts`
- Modify: `src/game/systems/EffectsSystem.ts`
- Modify: `src/game/managers/AudioManager.ts`

**Interfaces:**
- Consumes: `SkillId`, `TankColorPalette`, `BuiltArenaLayout`.
- Produces texture keys in `AssetFactory.registerAll`:
  - `tank_${palette.id}_${skillId}_${0|1|2}` and `tank_icon_${palette.id}_${skillId}` for all 6 palettes × 4 skills
  - `pickup_wood_crate`, `projectile_gatling`, `projectile_spike_ball`, `projectile_spike_shard`, `projectile_missile`, `decal_ground_spike`, `skill_emblem_laser`, `skill_emblem_spike`, `skill_emblem_gatling`, `skill_emblem_homing`
- Produces methods on `EffectsSystem`:
  - `emitCrateSpawn(x: number, y: number): void`
  - `emitCratePickup(x: number, y: number, skillLabel: string, colorHex: string, colorNum: number): void`
  - `emitSuitRevert(x: number, y: number): void`
  - `emitLaserChargeTick(x: number, y: number, angle: number, progress01: number): void`
  - `emitLaserBeamBlast(points: ReadonlyArray<{ x: number; y: number }>): void`
  - `emitSpikeDetonation(x: number, y: number): void`
  - `emitGatlingMuzzle(x: number, y: number, angle: number): void`
  - `emitMissileTrail(x: number, y: number, angle: number, seeking: boolean): void`
- Produces methods on `AudioManager`:
  - `playCrateSpawn()`, `playPowerUpEquip()`, `playLaserChargeStart()`, `playLaserBlast()`, `playSpikeBurst()`, `playGatlingFire()`, `playMissileLock()`

- [ ] **Step 1: Add procedural Canvas2D textures in `AssetFactory.ts`**
  - Draw distinct "superhero suit" tank sprites (`laser`: cyan cyber-visor + wing capacitors + split railgun; `spike`: spiked steel pauldrons + ram bumper + heavy spiked mortar; `gatling`: twin racing stripes + brass ammo belt + rotary 3-barrel minigun; `homing`: mecha tail fins + side pod shoulders + red scanner visor + seeker tube), plus wooden crate (`pickup_wood_crate`), projectile variants, ground spike caltrop, and 4 crisp skill emblems.
- [ ] **Step 2: Upgrade `EffectsSystem.ts` with explosive multi-layered VFX**
  - Amplify `emitTankExplosion` (dual shockwaves, bright flash core, 28 armor shards, fireball puffs, 22 sparks, `0.82` trauma) and implement wooden plank splinters + floating banner on crate pickup, spiraling plasma charge + cross-map glowing blue parabolic beam with jagged electric arcs, spike burst ring, gatling brass/muzzle flash, and missile flame/smoke plume.
- [ ] **Step 3: Add Web Audio synthesizer effects in `AudioManager.ts`**
  - Implement crisp zero-dependency oscillators/filtered-noise routines for crate spawn, superhero suit-up chime, 2s laser charge sweep, thunderous laser discharge, metallic spike burst, rapid gatling pop, and radar lock beep.
- [ ] **Step 4: Run `npm run typecheck && npm run test:unit` to verify clean compilation**
  - Run: `npm run typecheck && npm run test:unit`
  - Expected: PASS.

---

### Task 4: Runtime Gameplay Integration (`Tank.ts`, `Projectile.ts`, `ProjectileSystem.ts`, `PowerUpSystem.ts`, `GameScene.ts`)

**Files:**
- Modify: `src/game/entities/Tank.ts`
- Modify: `src/game/entities/Projectile.ts`
- Modify: `src/game/systems/ProjectileSystem.ts`
- Create: `src/game/systems/PowerUpSystem.ts`
- Modify: `src/game/scenes/GameScene.ts`
- Test: `tests/simulation.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3 modules.
- Produces on `Tank`:
  - `equipSkill(skill: SkillId, ammo: number): void`, `clearSkill(): void`, `getEquippedSkill(): SkillId | null`, `getSkillAmmo(): number`, `consumeSkillAmmo(amount?: number): boolean`
  - `startLaserCharge(durationSec: number): void`, `isChargingLaser(): boolean`, `getLaserChargeProgress(): number` (locks movement & rotation in `updateMovement` while charging, triggers discharge callback when timer completes)
- Produces on `ProjectileSystem`:
  - `POOL_SIZE = 160`
  - `spawnCustomProjectile(opts): Projectile | null` supporting `'gatling'`, `'spike_ball'`, `'spike_shard'`, `'homing_missile'`
  - Active hooks returning expired/detonated `spike_ball` positions and active `homing_missile` kinematics
- Produces `PowerUpSystem` wired into `GameScene` (carrying `matchCrateTimerSec` across rounds in `GameScene` while resetting crates/hazards/skills each round) and enriches `HudSnapshot` with `skill: SkillId | null`, `skillAmmo: number`, `chargingProgress: number | null` per player.

- [ ] **Step 1: Add unit test in `tests/simulation.test.ts` verifying crate pickup guard during Laser charge vs unspent Gatling replacement**
  - Exercise the skill state transition helper (`canPickupCrate` / `applyCratePickup`) for Review Focus #4.
- [ ] **Step 2: Extend `Tank.ts`, `Projectile.ts`, and `ProjectileSystem.ts`**
  - `Tank.ts`: swap body textures dynamically between `tank_${palette}_${frame}` and `tank_${palette}_${skill}_${frame}`, render subtle superhero aura & 2s Laser charge ring/sightline, freeze velocity & turn while `isChargingLaser()`, support custom cooldown for `gatling` (`0.068s`), and revert skin automatically when `skillAmmo === 0`.
  - `Projectile.ts` & `ProjectileSystem.ts`: support variant textures, directional sprite rotation for missiles/spikes, colored trails, `3.0s` timed/impact detonation callback for `spike_ball`, and `4.0s` Phase-2 seeker steering for `homing_missile`.
- [ ] **Step 3: Implement `PowerUpSystem.ts` and integrate into `GameScene.ts`**
  - Manage match-carried `20.0s` crate spawn timer, crate bobbing sprites, pickup collision, Laser 2s charge -> cross-map parabolic blast, Spike 16-shard + 5s lethal ground spike zone rendering & tank impalement, Homing Missile radar lock reticle on currently hunted tank, and Gatling continuous held-key firing (`frameInputs[i].forward` / `held` fire check when `tank.getEquippedSkill() === 'gatling'`).
  - Expose crate count, ground hazard count, and player equipped skill in `window.__PHASER_GAME_DIAGNOSTICS__`.
- [ ] **Step 4: Run `npm run typecheck && npm run test:unit` to verify PASS**
  - Run: `npm run typecheck && npm run test:unit`
  - Expected: PASS.

---

### Task 5: Score Stepper (`◀ / Input / ▶ / ∞`), Skill Codex Modal (`SkillGuideModal.ts`) & 10-Shell / Skill HUD

**Files:**
- Modify: `src/ui/components/ArcadeWidgets.ts`
- Create: `src/ui/components/SkillGuideModal.ts`
- Modify: `src/game/scenes/MenuScene.ts`
- Modify: `src/game/scenes/SetupScene.ts`
- Modify: `src/ui/components/SettingsModal.ts`
- Modify: `src/game/scenes/UIScene.ts`
- Test: `tests/simulation.test.ts`

**Interfaces:**
- Produces in `src/ui/components/ArcadeWidgets.ts`:
  - `parseCustomScoreInput(rawBuffer: string, fallbackScore: number): number` (pure helper tested in `simulation.test.ts` for Review Focus #5!)
  - `createScoreStepper(scene, opts): ScoreStepperHandle` (`◀` button, interactive center box with live numeric keyboard typing & caret, `▶` button, `∞` Unlimited toggle, `isEditing(): boolean`)
- Produces `SkillGuideModal` (`src/ui/components/SkillGuideModal.ts`):
  - Displays Mystery Wooden Crate overview + 2×2 grid of all 4 Superhero Skills (`Đạn Liên Thanh 36%`, `Đạn Gai 28%`, `Đạn Định Vị 22%`, `Laser Siêu Cấp 14%`) with superhero tank preview, projectile/emblem art, ammo badge, and Vietnamese trait bullets.

- [ ] **Step 1: Add unit tests for `parseCustomScoreInput` & stepper transitions (`1 <-> 0 (Unlimited) <-> 99`, `9999 -> 999`, empty -> fallback) in `tests/simulation.test.ts`**
  - Verify Review Focus #5 behavior deterministically.
- [ ] **Step 2: Implement `createScoreStepper` in `ArcadeWidgets.ts` and `SkillGuideModal.ts`**
  - Ensure while `scoreStepper.isEditing()` is true, `SetupScene` and `SettingsModal` ignore global `Enter`/`Escape` scene shortcuts so typing digits + pressing `Enter` cleanly commits the custom score.
- [ ] **Step 3: Wire `createScoreStepper`, `SkillGuideModal`, and 10-shell + Superhero Skill HUD into `MenuScene.ts`, `SetupScene.ts`, `SettingsModal.ts`, and `UIScene.ts`**
  - `MenuScene.ts`: preserve existing button positions (`515,506`, `765,506`, `515,584`, `765,584`) and add prominent `POWER-UPS / KỸ NĂNG` button at `(640, 644)`.
  - `SetupScene.ts`: widen Arena selector for new Mega/Titan maps, integrate `createScoreStepper`, and add `KỸ NĂNG` button.
  - `SettingsModal.ts`: integrate `createScoreStepper` in `settings` mode and a `XEM BẢNG KỸ NĂNG` button in `controls` mode; update rules copy to reflect `10` active shells & `20s` mystery crates.
  - `UIScene.ts`: render `UNLIMITED` when `winningScore === 0`, draw 10 base ammo pips (2 rows of 5), swap player plaque tank icon to `tank_icon_${palette}_${skill}` when transformed, render live skill tag (`LASER`, `GAI`, `LIÊN THANH 18/20`, `ĐỊNH VỊ`), and add `POWER-UPS GUIDE` to Pause Menu while keeping clean layout.
- [ ] **Step 4: Run `npm run typecheck && npm run test:unit` to verify PASS**
  - Run: `npm run typecheck && npm run test:unit`
  - Expected: PASS.

---

### Task 6: Playwright E2E Visual/Functional QA, Production Build & Documentation

**Files:**
- Modify: `tests/e2e/gameplay.spec.ts`
- Modify: `README.md`

- [ ] **Step 1: Update and expand `tests/e2e/gameplay.spec.ts` for new UI & gameplay features**
  - Update Lobby Win Score adjustment to use the new `createScoreStepper` (`◀` / custom input / Unlimited verification).
  - Add E2E assertions & screenshots for:
    - Opening `SkillGuideModal` (`POWER-UPS / KỸ NĂNG`),
    - Selecting a new colossal map (`20×12` / `16×10`) and verifying 10-shell magazine HUD,
    - Spawning a Mystery Wooden Crate, picking up skills, verifying Superhero tank transformation, firing Laser / Spike / Gatling / Homing in live browser with zero console/page errors and zero texture leaks across restarts.
- [ ] **Step 2: Run full verification suite (`typecheck`, `test:unit`, `build`, `test:e2e`, `inspect:canvas`)**
  - Run: `npm run typecheck && npm run test:unit && npm run build && npm run test:e2e`
  - Expected: All unit tests pass, production bundle compiles cleanly, all Playwright E2E checks & visual screenshots pass with `0` console/page errors.
- [ ] **Step 3: Update `README.md` documenting new map sizes, 10-shell limit, custom/Unlimited score, 20s Mystery Wooden Crates, and all 4 Superhero Skills**

WindTank Expansion Design — Larger Labyrinths, 10-Shell Magazine, Custom/Unlimited Score, Mystery Crate Power-Ups & Superhero Skills

**Date:** 2026-11-26  
**Project:** WindTank (`d:\Project\repo\node\WindTank`)  
**Stack:** Phaser 3 (`^3.88.2`), TypeScript, Vite, Canvas2D Procedural Textures, Web Audio API

---

## 1. Intent & Why

Transform **WindTank** from a classic pure-ricochet Tank Trouble duel into a high-spectacle local-multiplayer (2–4P) party battleground while preserving its crisp, zero-tunneling arcade feel:

1. **Larger arena scales** so 3–4 players have sprawling labyrinths for long-range bank shots, flanking, and missile chases.
2. **10-shell base magazine** (up from 5) for denser crossfire.
3. **Flexible match goal selector (`First to Pts`)** with left/right arrows (`◀ / ▶`), direct keyboard number entry, and an **Unlimited** endless mode.
4. **Mystery Wooden Crate power-ups every 20 seconds** with rarity-weighted drops so players must race for crates without knowing which weapon awaits inside.
5. **Four signature skills (`Laser`, `Đạn Gai`, `Đạn Liên Thanh`, `Đạn Định Vị`)** that physically transform the tank into a themed **"Superhero" (`Siêu Nhân`) armored form** until its skill ammo is spent, backed by **explosive arcade VFX** and a clear **in-game Skill Codex UI** explaining every mechanic and drop rate.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
- Add larger procedural and handcrafted maze dimensions (`14×9`, `16×10`, `17×10`, `20×12`) that auto-scale cleanly inside the `1280×760` (`ARENA_VIEWPORT` `1080×552`) layout without clipping or wall-tunneling.
- Increase default active shell capacity per tank from `5` to `10` across physics, pooling, and HUD.
- Replace fixed-cycle `First to Pts` buttons in `SetupScene` and `SettingsModal` with `◀ [editable score] ▶` + `Unlimited` mode (`winningScore = 0`).
- Spawn mystery wooden crates every `20s` during active play with rarity-weighted RNG based on skill power.
- Implement all 4 skills with exact physics/pathfinding rules, lethal ground spikes, superhero tank transformations, reverting cleanly on depletion.
- Upgrade `EffectsSystem` and `AudioManager` with high-impact, multi-layered explosive VFX & SFX while maintaining 60 FPS.
- Build a clear Vietnamese/arcade UI Guide (`Cẩm Nang Kỹ Năng / Power-Ups`) accessible from Menu, Lobby, Pause, and Controls Guide, plus live HUD status per player.

### Non-Goals
- Online multiplayer or AI bots.
- Destructible maze walls (Laser pierces walls without deleting them).

### Anti-Goals
- Revealing which skill is inside a crate before pickup (all crates must render identically as wooden mystery crates).
- Frame drops or allocation spikes during 20-round Gatling bursts or multi-spike explosions.
- Maze overflow outside `ARENA_VIEWPORT` (`1080×552`) on ultra-large maps.

---

## 3. Constraints

- **Viewport & Scale Manager:** Fixed `1280×760` design canvas (`Phaser.Scale.FIT`), arena bounds `maxWidth: 1080`, `maxHeight: 552`, `centerY: 344`.
- **Zero External Runtime Asset/API Dependency:** All tank superhero skins, wooden crates, missiles, spikes, and emblems are generated procedurally via Canvas2D in `AssetFactory.ts`; all SFX are synthesized via Web Audio API in `AudioManager.ts`.
- **Deterministic Testability:** Simulation logic (`MazeSystem`, `CollisionSystem`, `PowerUpSystem` core math) uses deterministic `SeededRng` and pure data structures so headless Node unit tests (`npm run test:unit`) and Playwright E2E tests (`npm run test:e2e`) verify every mechanic reliably.

---

## 4. Approaches Considered

### Approach 1 (Selected): Modular `PowerUpSystem` + Extended `CollisionSystem` / `AssetFactory` / `EffectsSystem`
- Keep existing swept circle-vs-AABB bounce simulation in `CollisionSystem.ts` intact for standard shells, Gatling shells, and the ballistic phases of Spike Shell and Homing Missile (extending `ProjectileKinematics` with `variant` metadata).
- Introduce a dedicated `PowerUpSystem.ts` owning:
  - 20s mystery crate spawning & rarity-weighted rolls,
  - Tank equipped-skill state & Laser 2s charge lock + ±15° parabolic wall-piercing beam solver,
  - Spike Shell 3s timed/impact detonation + 16 radial flying spikes + 5s lethal ground spike hazard field,
  - Homing Missile 4s ballistic-to-seeker transition + real-time `MazeGridData` BFS shortest-path navigation & dynamic nearest-tank retargeting (including shooter).
- Pre-bake all 72 superhero tank textures (`6 palettes × 4 skills × 3 tread frames`) + pickup/projectile sprites in `AssetFactory.ts`.
- Expand `EffectsSystem.ts` with pooled particle emitters, shockwave rings, laser plasma/arc rendering, hit-flash, and stronger trauma shake.
- **Why chosen:** Preserves rock-solid ricochet physics, keeps rendering batched/fast at 60 FPS, and isolates complex skill state machines for clean unit testing.

### Approach 2 (Rejected): Monolithic `ProjectileSystem` Flags + Per-Frame `Graphics` Armor Drawing
- Stuff instant beams, stationary floor hazards, crates, and missiles into `ProjectileSystem` and redraw superhero armor via `Phaser.GameObjects.Graphics` every frame.
- **Why rejected:** Tangled collision loops and unnecessary per-frame Canvas/WebGL path tessellation overhead during heavy VFX bursts.

---

## 5. Detailed Design Specification

### 5.1 Larger Map Sizes & Dynamic Arena Scaling (`mapDefinitions.ts`, `MazeBuilder.ts`)
- **New Map Modes added to `MAP_MODES` & `MapModeId`:**
  - `procedural_mega`: **Procedural Mega (14×9)** — sprawling 4P labyrinth (`extraOpenRatio = 0.16`).
  - `procedural_colossal`: **Procedural Colossal (17×10)** — huge multi-sector battlefield (`extraOpenRatio = 0.17`).
  - `procedural_titan`: **Procedural Titan (20×12)** — maximum-scale epic warzone (`extraOpenRatio = 0.18`).
  - `citadel_wargrounds`: **Citadel Wargrounds (14×9)** — handcrafted symmetrical fortress with central plaza & flanking corridors.
  - `titan_stronghold`: **Titan Stronghold (16×10)** — handcrafted grand arena with twin bastions and long laser/ricochet highways.
  - `mix` (`Arcade Mix`): cycles standard, large, and new mega/handcrafted arenas across rounds.
- **Dynamic Cell Scaling (`MazeBuilder.ts`):**
  - Change `cellSize` lower clamp from `58` to `32`:
    `const cellSize = Math.max(32, Math.min(92, rawCellW, rawCellH));`
    At `20×12`, `rawCellW = floor((1080 - 24)/20) = 52`, `rawCellH = floor((552 - 20)/12) = 44` → `cellSize = 44px` (`880×528` board, `scaleRatio = 44 / 84 ≈ 0.524`).
  - Change `wallThickness` lower clamp from `6` to `4`:
    `const wallThickness = Math.max(4, Math.round(BASE_GAMEPLAY.wallThickness * scaleRatio));`
    Since `tankRadius`, `tankBarrelLength`, tank speeds, and projectile speeds/radii already multiply by `scaleRatio`, corridor-to-tank proportions remain identical across all map sizes.

### 5.2 Base Magazine Upgrade to 10 Shells (`constants.ts`, `ProjectileSystem.ts`, `UIScene.ts`)
- `BASE_GAMEPLAY.maxProjectilesPerTank = 10` (was `5`).
- `ProjectileSystem` `POOL_SIZE = 160` (supports 4 tanks × 20 Gatling rounds + radial spike shrapnel + normal shells simultaneously).
- `UIScene` player scoreboard plaques render 10 crisp shell pips arranged in **2 rows of 5 pips** when using standard cannon, switching/augmenting with a glowing **Skill Status Pill** (skill icon + name + remaining shots / charge bar) while a superhero skill is active.

### 5.3 Custom & Unlimited Score Selector (`SetupScene.ts`, `SettingsModal.ts`, `SettingsManager.ts`, `ScoreManager.ts`)
- **Data Model (`GameSettings.winningScore`):**
  - `0` represents **Unlimited (`VÔ TẬN / ∞`)**.
  - Positive integers `1..999` represent `First to N Pts` (default remains `5`).
  - `SettingsManager.setWinningScore(score)` accepts `0` (Unlimited) or clamps custom integers to `1..999`.
- **Match Resolution (`ScoreManager.ts`, `UIScene.ts`):**
  - In `ScoreManager.recordRoundOutcome`, if `this.winningScore <= 0`, `matchWinnerIndex` is always `null` — rounds continue indefinitely with live score & tie tracking until players exit or restart via Pause Menu.
  - Top HUD badge displays `UNLIMITED PTS` (or `UNLIMITED  •  TIES: X`) when `winningScore === 0`.
- **UI Widget (`ScoreStepperControl` in `ArcadeWidgets.ts`, used in both `SetupScene` & `SettingsModal`):**
  - Composite control featuring:
    - Left arrow button `◀`: decrements score (`1 -> Unlimited (0)`, `Unlimited -> 99`, `N -> N - 1`).
    - Center interactive value box: displays `FIRST TO: 5 PTS` or `∞ UNLIMITED`. Clicking the center box enters **Direct Numeric Input Mode** (`NHẬP ĐIỂM: 5_`), capturing `Digit0`–`Digit9` / `Numpad0`–`Numpad9`, `Backspace`, `Enter` (confirm), `Escape` (cancel), and clicking outside auto-confirms (`0` or empty fallback -> `Unlimited` if `0` typed, else previous valid value).Note: While typing in `SetupScene`, `Enter` confirms the score input instead of immediately launching `GameScene`!
    - Right arrow button `▶`: increments score (`Unlimited (0) -> 1 -> 2 -> ... -> 999`).
    - Quick `∞` toggle pill beside/integrated so toggling `Unlimited` takes a single click as well as stepping below `1`.

### 5.4 Mystery Wooden Crates & Weighted Drop System (`PowerUpSystem.ts`)
- **Spawn Cadence, Placement & Round Lifecycle (Builder Calls):**
  - Active-combat timer (`POWERUP_SPAWN_INTERVAL_SEC = 20.0`) counts down during the `playing` phase and **carries its remaining seconds across rounds within the same match** (resetting to `20.0s` on a fresh match). This ensures crates reliably appear every 20 seconds of real combat even when quick 2P duels last under 15 seconds!
  - At the start of each new round, uncollected floor crates, ground hazards, and unspent equipped skills reset cleanly so every round begins fairly with standard 10-shell tanks (preventing instant `t = 0` cross-map Laser kills off spawn). Crates cannot be picked up once a round enters `round_end`, though during `playing` and `aftermath` active simulation continues normally.
  - Cap simultaneous uncollected crates on the arena floor at `4` so Unlimited rounds never clutter every corridor if players ignore crates.
  - Candidate cell selection (`SeededRng`): picks a random cell that has no existing crate, no active ground spike field, and is at least `1.5 * cellSize` away from all living tanks (falling back to farthest valid cell if cramped).
- **Visual Concealment:**
  - All crates use the exact same **Wooden Crate** sprite (`pickup_wood_crate`: warm timber planks, diagonal cross-slat, iron corner brackets, subtle `?` burn mark, gentle bobbing/glow pulse, and parachute/drop impact dust ring on spawn). Players cannot tell which skill is inside prior to pickup.
- **Weighted Drop Table (by Skill Power):**
  | Skill ID | Display Name (VN) | Weight | Drop Rate | Ammo / Uses | Power Tier |
  |---|---|---:|---:|---:|---|
  | `gatling` | **Đạn Liên Thanh** | 36 | **36%** | 20 viên | Common / High DPS |
  | `spike` | **Đạn Gai** | 28 | **28%** | 1 viên (+16 gai & bẫy đất) | Uncommon / Area Control |
  | `homing` | **Đạn Định Vị** | 22 | **22%** | 1 tên lửa | Rare / Relentless Seeker |
  | `laser` | **Laser Siêu Cấp** | 14 | **14%** | 1 tia xuyên map | Legendary / Wall-Piercing |
- **Pickup Rules (Builder Calls):**
  - Living tank overlaps crate (`dist <= tank.radius + crate.radius`).
  - If a tank is currently locked in the 2.0s `laser` charge-up, it ignores new crates until the beam fires.
  - Otherwise, picking up a crate rolls a skill using the weighted table; if the tank already held an unspent skill, the new skill replaces it cleanly with a fresh transformation burst.

### 5.5 Detailed Skill Mechanics

#### 1. Laser (`laser`) — 1 Shot, 2.0s Charge, Wall-Piercing, ±15° Parabolic Homing Bend
- **Charge Phase (`2.0s`):**
  - Pressing Fire consumes the trigger and enters `charging_laser` state (`chargeTimer = 2.0s`).
  - **Movement & Rotation Lock:** While `charging_laser` is active, tank linear velocity is zeroed (`vx = 0, vy = 0`) and movement/turn inputs are completely locked.
  - **Charge Telegraph:** Imploding electric-blue plasma particles spiral into the cannon muzzle, turret hums with rising pitch, and a faint thin sightline indicates the tank's forward axis. If the charging tank is eliminated during these 2.0s, the charge aborts cleanly.
- **Discharge & ±15° Parabolic Curve Math:**
  - When `chargeTimer` reaches `0`, the beam fires across the **entire arena** (`originX..originX+width`, `originY..originY+height`), **ignoring all walls**.
  - **Target Acquisition within ±15°:**
    - Let muzzle origin be $M = (m_x, m_y)$ and forward unit vector $\hat{u} = (\cos\theta, \sin\theta)$, normal $\hat{n} = (-\sin\theta, \cos\theta)$.
    - Check all living rival tanks ($i \neq \text{owner}$). Transform tank center $T$ into local coordinates: $x' = (T - M)\cdot\hat{u}$, $y' = (T - M)\cdot\hat{n}$.
    - Candidate rivals must be in front of the muzzle ($x' > 0$) and within **±15°** of $\hat{u}$: $|\text{atan2}(y', x')| \le 15^\circ$ ($\approx 0.2618\text{ rad}$).
    - Builder call: If multiple rivals lie inside ±15°, lock onto the one with smallest Euclidean distance $\sqrt{x'^2 + y'^2}$.
  - **Beam Path Generation:**
    - **No rival in ±15°:** Straight ray $P(s) = M + s\hat{u}$ for $s \ge 0$ clipped to the outer arena rectangle.
    - **Rival locked at $(x'_T, y'_T)$:** Exact parabola in local frame tangent to $\hat{u}$ at muzzle:
      $$y'(x') = k \cdot x'^2, \quad k = \frac{y'_T}{(x'_T)^2}$$
      Sampled at dense steps ($\Delta x' \approx 6\text{ px}$) from $x' = 0$ through $x'_T$ and continuing along the parabola until exiting the outer arena boundary `[originX, originX + width] × [originY, originY + height]`.
  - **Lethality:** Any living rival tank whose distance to any beam segment is $\le \text{tank.radius} + 5.5 \cdot \text{scaleRatio}$ is instantaneously destroyed in a massive blue plasma explosion!
  - **Revert:** Immediately after firing, the shooter's skill clears and the tank reverts to its standard hull (`10` normal shells).

#### 2. Đạn Gai (`spike`) — 1 Shot, Heavy Ballistic Shell -> 3s Spike Burst + Ground Spike Trap
- **Ballistic Flight:**
  - Fires 1 spiked iron ball (`projectile_spike_ball`):
    - Radius: `1.28 × BASE_GAMEPLAY.projectileRadius * scaleRatio` (`~5.76 * scaleRatio`, visibly larger than standard shell).
    - Speed: `0.82 × BASE_GAMEPLAY.projectileSpeed * scaleRatio` (`~242 * scaleRatio`, slightly slower).
    - Physics: Identical swept circle-vs-AABB wall ricochet (`maxBounces = 14`, `selfHitGraceSec = 0.08s`).
  - Shooter immediately reverts from Spike Superhero skin back to standard tank after firing this 1 shell.
- **Detonation at `3.0s` (or Direct Tank Hit):**
  - When `age >= 3.0s` (or immediately upon hitting a tank, eliminating that victim first), the shell explodes at `(bx, by)`:
    1. **16 Radial Iron Spikes (`spike_shrapnel`):**
       - Spawns 16 high-speed sharp iron spikes evenly spaced around $360^\circ$ (with tiny angular jitter), speed `1.22 × projectileSpeed * scaleRatio`, lifetime `0.55s`, `maxBounces = 0` (shatter with sparks upon hitting any maze wall).
       - Lethal to **any** living tank (including the shooter!).
    2. **Persistent Ground Spike Zone (`5.0s` duration):**
       - Scatters a cluster of jagged iron spikes embedded into the floor around `(bx, by)` up to radius `36 * scaleRatio` (`~14` individual spike hazard nodes; nodes blocked from `(bx, by)` by a maze wall are clipped at the wall face so spikes never magically spawn through solid walls into adjacent closed rooms).
       - Remains active for **`5.0s`** (`SPIKE_GROUND_DURATION_SEC = 5.0`), glinting dangerously and blinking during the final `1.0s` before retracting/fading.
       - **Lethal Hazard:** Any living tank (including shooter) whose hull overlaps any active ground spike node (`dist <= tank.radius * 0.88 + spikeNodeRadius`) is impaled and eliminated!

#### 3. Đạn Liên Thanh (`gatling`) — 20 Rounds, Rapid Fire, Fast Compact Shells
- **Magazine & Fire Rate:**
  - Grants `20` rapid-fire rounds (`skillAmmo = 20`).
  - Cooldown: `0.068s` (over 2× faster than standard `0.14s`).
  - Builder call: Holding down the Fire key continuously auto-fires Gatling rounds at `0.068s` intervals (tapping also works), delivering true machine-gun feel.
- **Projectile Properties:**
  - Texture: `projectile_gatling` (crisp, slightly smaller metallic bullet/shell).
  - Radius: `0.72 × BASE_GAMEPLAY.projectileRadius * scaleRatio` (`~3.24 * scaleRatio`, noticeably smaller than standard shell).
  - Speed: `1.36 × BASE_GAMEPLAY.projectileSpeed * scaleRatio` (`~402 * scaleRatio`, noticeably faster).
  - Physics: Same swept wall-ricochet physics (`maxBounces = 10`, `maxLifetime = 8.5s`, bypasses the 10-shell standard cap so all 20 rounds can scream through the maze at once).
- **Revert:** Once the 20th bullet leaves the barrel (`skillAmmo === 0`), the tank reverts to its standard hull and normal 10-shell cannon.

#### 4. Đạn Định Vị (`homing`) — 1 Missile, 4s Ballistic -> Shortest-Path Maze Seeker
- **Launch & Revert:**
  - Fires 1 warhead (`projectile_missile`), immediately reverting the shooter's tank skin to default.
- **Phase 1 — Ballistic Ricochet (`0.0s` to `4.0s`):**
  - Radius: `1.08 × BASE_GAMEPLAY.projectileRadius * scaleRatio`.
  - Speed: `0.95 × BASE_GAMEPLAY.projectileSpeed * scaleRatio`.
  - Bounces off maze walls just like a standard physical shell (`maxBounces = 24`, `selfHitGraceSec = 0.08s`). Lethal on direct contact. Nose beacon blinks faster as `age` approaches `4.0s`.
- **Phase 2 — Maze-Pathfinding Seeker (`4.0s` to `16.0s` max lifetime):**
  - At `age = 4.0s`, thruster ignites (burst of flame/smoke + radar lock tone; `graceTimer` guaranteed `0` so shooter is a valid target).
  - **Dynamic Nearest-Target Selection (Including Shooter):**
    - Convert missile position `(mx, my)` and every living tank `(tx, ty)` (including `ownerIndex`!) to grid cells `(col, row)` in `arena.grid`.
    - Compute exact shortest-path distance from missile to each living tank:
      - If in the same cell with unobstructed wall clearance, distance = Euclidean `hypot(tx - mx, ty - my)`.
      - Otherwise, run BFS on `arena.grid` from the missile's cell to obtain exact cell-step path length `cellSteps * cellSize` refined by sub-cell offsets `(mx, my)` to first doorway and last doorway to `(tx, ty)`.
    - Select the living tank with the **smallest maze path distance**. Re-evaluate every physics tick (`60Hz` — BFS on max `20×12 = 240` cells takes `< 0.02ms`!), so if tanks move and another tank becomes closer, the missile **immediately switches target** and moves the lock-on reticle to the new target!
  - **Shortest & Most Accurate Maze Navigation:**
    - Extract the shortest cell chain `[C_0, C_1, ..., C_k]` from BFS parent pointers, producing waypoint centers plus exact open-doorway midpoints between consecutive cells, ending at the target tank's live coordinates `(tx, ty)`.
    - **Line-of-Sight String-Pulling (Funnel Smoothing):** Advance toward the **furthest** waypoint in the path that has an unobstructed swept-circle line of sight (`sweepCircleAgainstWall` clearance for `missile.radius + 2 * scaleRatio`) from `(mx, my)`. This makes the missile cut diagonals cleanly across open rooms and hug corners along the true Euclidean shortest path through the maze instead of robotic 90° grid zig-zags!
    - Smoothly steer velocity vector toward that optimal waypoint (`turnRate = 11.5 rad/s`, speed ramps to `1.14 × BASE_GAMEPLAY.projectileSpeed * scaleRatio`). If a tight turn or the `t = 4.0s` transition causes the seeker to graze a maze wall, it **slides/deflects smoothly off the wall without counting bounces or self-destructing** — Phase 2 seekers only detonate upon hitting a living tank (or safely expiring at `16.0s` max fuel).

### 5.6 Superhero Tank Visual Transformations (`AssetFactory.ts`, `Tank.ts`)
- Pre-generated in `AssetFactory.registerAll` for all 6 palettes (`red`, `green`, `blue`, `gold`, `purple`, `cyan`) × 4 skills × 3 tread frames (`tank_${paletteId}_${skillId}_${frame}`) + HUD icons (`tank_icon_${paletteId}_${skillId}`):
  1. **`laser` (Cyber-Plasma Ranger):** Bright cyan energy visor across turret, twin angled wing-capacitors on hull flanks, elongated split-rail cannon with glowing blue plasma core.
  2. **`spike` (Iron Juggernaut):** Spiked dark-steel shoulder armor plates, serrated front ramming bumper, wide heavy mortar barrel & horned gladiator turret crest.
  3. **`gatling` (Blitz Commando):** Twin racing stripes, brass ammo-belt feed over hull, triple-barrel rotary Vulcan minigun, tactical visor & dual exhaust boosters.
  4. **`homing` (Mecha Seeker):** Swept cybernetic tail fins, twin side missile-pod shoulders, glowing red radar-scanner visor on turret, heavy launch tube barrel.
- In-world live aura on `Tank.ts`: subtle skill-colored energy ring / charge vortex while equipped, reverting immediately to `tank_${paletteId}_${frame}` when skill ammo hits `0`.

### 5.7 Explosive VFX & Audio Upgrade (`EffectsSystem.ts`, `AudioManager.ts`)
- **Explosive Tank Destruction:** Double concentric shockwaves, bright white-gold flash core, 28 colored armor/tread shards, secondary fireball puffs, 22 radiating sparks, larger soot scorch crater on `floorDecalRT`, and punchy `0.82` camera trauma shake.
- **Crate Spawn & Pickup:** Golden drop-ring ripple on spawn; wooden plank splinters + golden star sparks + floating skill callout text + superhero transformation shockwave on pickup.
- **Skill-Specific Spectacle:**
  - **Laser:** 2s imploding cyan vortex + trembling barrel glow → blinding white-cored electric-blue beam across the whole map with jagged lightning arcs, wall-exit flare, scorched plasma dots on floor, and `0.78` camera trauma.
  - **Spike:** Heavy metallic mortar thump; at 3s, crimson-iron shockwave + 16 glinting steel spikes leaving dark trails + persistent metallic caltrops glinting on the floor.
  - **Gatling:** Rapid-fire orange-gold muzzle strobes, brass shell casing ejecta particles, bright tracer streaks.
  - **Homing:** Blinking nose light during 4s bounce → fiery orange-yellow thruster burst, continuous dense smoke/ember ribbon trail, and pulsing red lock-on crosshair spinning around the currently hunted tank!

### 5.8 Skill Codex / Legend UI & HUD (`SkillGuideModal.ts`, `MenuScene.ts`, `SetupScene.ts`, `UIScene.ts`, `SettingsModal.ts`)
- **Dedicated `SkillGuideModal` (`BẢNG KỸ NĂNG & VẬT PHẨM`):**
  - Accessible directly via:
    - **`POWER-UPS / KỸ NĂNG`** button on `MenuScene`, `SetupScene`, and Pause Menu (`UIScene`), plus a quick-switch button inside `Controls Guide` (`SettingsModal`).
  - Displays:
    - **Header Banner:** Mystery Wooden Crate icon + explanation (*"Cứ mỗi 20 giây, 1 Thùng Gỗ Bí Ẩn xuất hiện ngẫu nhiên trên bản đồ. Mọi thùng đều giống hệt nhau — ăn thùng để hóa giáp Siêu Nhân và nhận ngẫu nhiên 1 trong 4 kỹ năng theo tỉ lệ hiếm!"*).
    - **4 Detailed Skill Cards (2×2 Grid):** Each card shows:
      - Transformed **Superhero Tank** sprite + **Projectile/Weapon** preview icon
      - **Skill Title** + **Drop Rate Badge** (`36%`, `28%`, `22%`, `14%`) + **Ammo Badge** (`20 VIÊN`, `1 VIÊN`, `1 TÊN LỬA`, `1 TIA`)
      - Clear bullet traits covering cooldown/charge, wall interaction, special physics, and revert rule.
- **Live Gameplay HUD (`UIScene.ts`):**
  - Each player's bottom plaque updates tank icon to their active Superhero form, displays their 10 base ammo pips (2×5), and overlays a crisp colored **Skill Tag** (`LASER [TỤ LỰC]`, `LIÊN THANH: 17/20`, `ĐẠN GAI: 1`, `ĐỊNH VỊ: 1`) when holding a skill.

---

## 6. What Is Left to the Builder

- Exact ASCII layouts for `citadel_wargrounds` (`14×9`) and `titan_stronghold` (`16×10`) (guaranteed 100% connected via `ensureFullConnectivity`).
- Exact Web Audio oscillator frequencies/envelopes for the new SFX hooks.
- Fine visual tuning of particle counts and tween durations so visuals feel maximally explosive while keeping active particle count bounded (`< 350` peak) for locked 60 FPS.

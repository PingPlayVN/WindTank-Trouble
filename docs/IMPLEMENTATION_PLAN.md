# WindTank (Tank Trouble Remake) — Technical Implementation Plan

## 1. Architecture Overview

Built with **Phaser 3 (`^3.88.2` / `3.90.0`) + TypeScript + Vite**, strictly separating deterministic game data/systems from Phaser rendering and UI scenes:

```text
src/
├── main.ts                          # Phaser.Game bootstrap, Scale.FIT 1280x760, diagnostics hook
├── styles/
│   └── main.css                     # Clean full-viewport centering, safe-area & touch-action rules
├── game/
│   ├── config/
│   │   ├── constants.ts             # Design tokens, palette ramps, physics & gameplay tuning constants
│   │   └── gameConfig.ts            # Phaser.Types.Core.GameConfig
│   ├── types/
│   │   └── gameTypes.ts             # Strongly-typed interfaces for players, controls, maps, match state
│   ├── scenes/
│   │   ├── BootScene.ts             # Registry defaults, saved settings load, AudioManager init
│   │   ├── PreloadScene.ts          # Procedural high-DPI texture & sprite generation (AssetFactory)
│   │   ├── MenuScene.ts             # Classic title screen, quick player-count toggle, Controls & Settings modals
│   │   ├── SetupScene.ts            # 2–4P lobby: color cycling, control preview, map pool, win score
│   │   ├── GameScene.ts             # Arena simulation orchestrator (maze, tanks, shells, decals, VFX)
│   │   ├── UIScene.ts               # Parallel HUD scene (bottom tank scoreboard, top bar, countdown, pause modal)
│   │   └── ResultScene.ts           # Match winner celebration, final standings, Rematch & Main Menu
│   ├── entities/
│   │   ├── Tank.ts                  # Tank container/sprites, animated treads, collision radius, state cues
│   │   └── Projectile.ts            # Pooled shell entity, bounce counter, lifetime timer, fade-out telegraph
│   ├── systems/
│   │   ├── InputSystem.ts           # Simultaneous 4P keyboard polling, fire buffering, rebind + conflict check
│   │   ├── MazeSystem.ts            # Seeded SplitMix32 PRNG maze generator + BFS connectivity & spawn solver
│   │   ├── CollisionSystem.ts       # Tank-wall sliding, tank-tank separation, swept circle-AABB shell ricochets
│   │   ├── ProjectileSystem.ts      # Object-pooled shell lifecycle, muzzle-wall check, self-hit grace window
│   │   ├── MatchSystem.ts           # Countdown -> Active -> Aftermath (1.7s draw window) -> Score/Win transitions
│   │   └── EffectsSystem.ts         # RenderTexture tread/scorch decals, pooled particle bursts, trauma shake
│   ├── maps/
│   │   ├── mapDefinitions.ts        # 6 handcrafted classic maze layouts + Procedural generator configs
│   │   └── MazeBuilder.ts           # Wall segment merger, shadow/bevel renderer, AABB collider builder
│   ├── managers/
│   │   ├── SettingsManager.ts       # localStorage persistence for keybinds, win score, audio, screen shake
│   │   ├── PlayerManager.ts         # Active 2–4 player roster, color assignments, control bindings
│   │   ├── ScoreManager.ts          # Round wins, ties count, match winner evaluation
│   │   └── AudioManager.ts          # Zero-dependency Web Audio API arcade SFX synthesizer
│   └── art/
│       └── AssetFactory.ts          # Crisp procedural PNG/Canvas texture baking (tanks, treads, shells, icons, floor)
└── tests/
    └── simulation.test.ts           # Node headless unit tests for Maze BFS, Collision ricochets & Input conflicts
```

## 2. Key Technical Decisions

1. **Custom Swept Physics + Circle/AABB Sliding over Raw Arcade AABBs:**
   - Standard axis-aligned Arcade `Body` boxes snag when rotating tanks inside narrow corridors and can tunnel or mis-reflect on thin `8px` wall corners.
   - `CollisionSystem` uses deterministic substepped (`fixedStep` / clamped `dt`) **swept circle-vs-AABB** ray-expanded reflection for projectiles (guaranteeing zero tunneling at any FPS and exact `90°` wall and end-cap bounces) alongside **circle-vs-AABB closest-point sliding** + **circle-vs-circle separation** for tanks.
2. **Single-Pass RenderTexture Floor Decals:**
   - Tank tread marks and explosion scorch marks stamp directly onto a per-round `Phaser.GameObjects.RenderTexture` floor canvas, giving rich visual history across a round at **1 draw call** and zero object accumulation.
3. **Skill Orchestration (`phaser-game-director`):**
   - Follows phase gates across `phaser-gameplay-systems`, `physics-tuning`, `procedural-gen`, `input-systems`, `phaser-aaa-graphics-builder`, `game-feel`, `phaser-game-ui-designer`, `phaser-debug-profiler`, and `phaser-qa-release`.

## 3. Execution Phases

- **Phase 1:** Scaffold Vite + TypeScript + Phaser 3 project, verify dependencies and Playwright canvas inspector.
- **Phase 2:** Implement `AssetFactory`, `MazeSystem` + `mapDefinitions` + `MazeBuilder`, `InputSystem` (4P + rebind), `Tank`, and `CollisionSystem` (wall sliding + tank-tank collision).
- **Phase 3:** Implement `Projectile` + `ProjectileSystem` (pooled ricochets, 5-shell limit, muzzle-wall reflection, swept tank hits) and `EffectsSystem` + `AudioManager`.
- **Phase 4:** Implement `MatchSystem` (countdown, 1.7s aftermath tie/win window, scoring) and full scene flow (`MenuScene`, `SetupScene`, `GameScene`, `UIScene`, `ResultScene`, Pause & Settings/Rebind modals).
- **Phase 5:** Visual fidelity & game-feel polish pass (crisp outlines, shadows, tread animation, scorch decals, HUD ammo pips, responsive Scale.FIT verification).
- **Phase 6:** Automated unit tests + Playwright headless browser playtest across 2P/3P/4P, screenshot capture, side-by-side reference discrepancy audit, iterative fixes, and production `tsc && vite build` check.

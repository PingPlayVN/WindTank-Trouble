# Tank Trouble — Reference Analysis & Visual Comparison Checklist

## Overview & Reference Sources Studied

To achieve 90–100% fidelity in gameplay feel and recognizable visual composition, multiple classic Flash (*Tank Trouble Classic* / *Tank Trouble 2*) and modern HTML5 (*Tank Trouble Online*) references, mechanics documentation, physics diagrams, and community captures were studied and cross-compared:

- Classic & HTML5 gameplay layouts (`ref_single.png`, `ref_gameplay_1.png`, `ref_gameplay_2.png`, `ref_gameplay_3.png`)
- Title logo & emblem composition (`github_ref_1.png`)
- Continuous swept projectile-wall collision geometry (`ref_p1.png`, `ref_p2.png`)
- Documented original Mads Purup / Subterranean Software mechanics (grid proportions, 5-shell cap, bounce persistence, aftermath tie window, bottom tank-icon scoreboard, and multi-player single-keyboard ergonomics)

---

## 1. Camera Angle & Game Perspective

- **Projection:** Strict top-down 2D orthographic overhead camera (`90°` top-down) with zero perspective foreshortening across the arena so ricochet angles (`incident angle = reflection angle`) read with geometric precision across every corner of the screen.
- **Depth Cues:** Elevation is communicated subtly via:
  - Soft dark contact-shadow ellipses (`rgba(0, 0, 0, 0.20)`, offset `+2px, +3px`) beneath each tank hull and turret.
  - Subtle wall drop-shadows (`rgba(0, 0, 0, 0.13)`, offset `+2px, +3px`) cast onto the bright arena floor, plus a crisp 1px top highlight and 2px dark charcoal border on maze walls.
- **Framing:** Fixed static camera per round framing the entire rectangular labyrinth with generous breathing room, a compact top match bar, and the iconic horizontal player score bar beneath the arena.

## 2. Arena Dimensions & Proportions

- **Design Resolution:** `1280 × 760` logical canvas using `Phaser.Scale.FIT` + `Phaser.Scale.CENTER_BOTH` (scales crisply to 1280×720, 1366×768, 1920×1080, 2560×1440, and narrow browser windows without distorting maze geometry).
- **Arena Viewport Allocation:**
  - Top status strip: `44px` height (`y: 0..44`) — round number, map title, win-target badge, audio mute, and pause trigger (`ESC`/`P`).
  - Central Maze Arena container: centered inside `y: 48..636` (`max 1120 × 580` px), preserving ~77% of the viewport for gameplay focus.
  - Bottom Scoreboard Bar: `112px` height (`y: 644..756`) — classic horizontal player cards with miniature tank icons, player names/controls hint, live ammo pips, and large round-win scores.
- **Grid Proportions:** Rectangular grids ranging from `7 × 5` (tight duel) and `9 × 6` (classic standard, `86px` cell size = `774 × 516` px) up to `11 × 7` (4-player chaos, `76px` cell size = `836 × 532` px).

## 3. Maze Wall Thickness, Colors, and Spacing

- **Color Palette:**
  - Outer page/canvas margin: `#E2E4E7` soft neutral warm-cool grey.
  - Arena floor base: `#F3F3F1` crisp off-white with ultra-subtle `#E8E8E5` tile seams (`1px` at cell intervals) so the floor reads clean and bright without looking like an unfinished blank canvas.
  - Maze wall fill: `#4B4E53` solid charcoal-slate grey with `#232528` crisp `2px` outline stroke and `#63676E` subtle top bevel highlight.
- **Wall Thickness & Corridor Spacing:**
  - Wall thickness: `8px` (`~9.5%` of standard `86px` cell).
  - Clear corridor interior: `78px` (`~2.15×` tank width), matching the authentic Tank Trouble ~2-tank corridor ratio so two tanks can pass carefully while corners still demand clean steering.
  - Corner caps: Explicit square joint caps at grid vertices so perpendicular wall segments merge seamlessly with zero corner notches or visual overlap artifacts.

## 4. Tank Dimensions, Shapes, Colors, and Orientation

- **Proportions (at standard `86px` cell scale, dynamically scaled slightly on `11×7` maps):**
  - Chassis length × width: `36px × 30px` rounded armored hull.
  - Caterpillar treads: Dual side tracks (`38px × 7px` each) in `#2B2D30` with `#17181A` outline and animated dark tread grooves that scroll proportionally to wheel travel.
  - Turret & Barrel: Centered circular turret dome (`19px` diameter) + front rectangular cannon barrel (`17px` length × `7px` width) extending forward so facing direction is unmistakable at a glance even in peripheral vision.
  - Outline: Crisp `2px` `#18191B` vector-style dark ink stroke around treads, hull, turret, and barrel.
- **Default Player Color Ramps (Fill / Highlight / Shade):**
  - **P1 (Red — Classic Challenger):** `#E53935` / `#FF6F60` / `#AB000D`
  - **P2 (Green — Classic P1/P2):** `#43A047` / `#76D275` / `#1B5E20`
  - **P3 (Blue — Classic P3):** `#1E88E5` / `#6AB7FF` / `#0D47A1`
  - **P4 (Gold — Classic 4P Slot):** `#F9A825` / `#FFD95A` / `#C17900` *(plus selectable Purple `#8E24AA` and Cyan `#00ACC1` swatches in Player Setup)*

## 5. Movement and Rotation Behavior

- **Arcade Differential Tank Controls:**
  - Rotate Left / Right: Pure angular velocity (`215°/s` = `3.75 rad/s`), equally responsive while stationary or driving.
  - Forward speed: `178 px/s` along heading `(cos θ, sin θ)`.
  - Backward (reverse) speed: `128 px/s` (`~72%` of forward speed), matching original Tank Trouble's deliberate reverse penalty.
  - Acceleration / Braking: Snappy `35ms` velocity smoothing (`0` floatiness, crisp micro-weight on start/stop).
- **Simultaneous Input:** Independent key polling (`Key.isDown` for drive/steer, `JustDown` with `110ms` fire buffer for shooting) across 4 non-conflicting keyboard zones (`WASD+Space`, `Arrows+Enter`, `IJKL+U`, `Numpad 8456+0`), fully customizable in Settings with conflict detection.

## 6. Arcade Projectile Behavior and Wall Interactions

- **Visuals:** Crisp `#1E2022` circular arcade shell (`radius 4.5px`, `9px` diameter) with a tiny `#5A5E64` highlight dot and subtle fading 5-point motion trail.
- **Kinematics & Limits:**
  - Speed: `290 px/s` (`1.63×` forward tank speed) — constant speed across bounces.
  - Active Cap: Maximum `5` active shells per player in the arena at once; firing is blocked when all 5 slots are active and immediately freed as each shell expires or hits.
  - Lifetime & Bounce Limit: `11.5 seconds` lifetime (and `14` max ricochets), blinking/shrinking smoothly over its final `0.5s` into a harmless smoke puff.
- **Wall Interaction & Self-Hazard:**
  - Continuous swept circle-vs-AABB collision (substepped ray/Minkowski-expanded wall reflection) guarantees zero wall tunneling and crisp axis reflection (`vx = -vx` on vertical wall faces, `vy = -vy` on horizontal wall faces, radial normal reflection on exposed wall end-caps).
  - Muzzle-against-wall check: If a player fires with their barrel tip touching or inside a wall face, the shell immediately reflects off the wall (threatening the shooter!), faithfully reproducing Tank Trouble's iconic close-wall danger.
  - Friendly/Self Fire: Active against all tanks; shooter has a `60ms` muzzle-exit immunity *only* before the first wall bounce. The instant a shell bounces off any wall (or after `60ms`), it is lethal to its own creator.

## 7. Player Spawn Positions

- **Algorithm:** Data-driven candidate spawns validated by BFS graph distance across the maze cells so all 2–4 active tanks spawn at cell centers maximizing minimum pairwise maze path distance (e.g., opposite quadrants/corners).
- **Safety Guarantees:**
  - Every generated or preset map runs a flood-fill reachability pass verifying `reachableCells === totalCells` (zero isolated pockets).
  - Initial tank angle faces the longest open corridor out of the spawn cell so players never start facing nose-first into an immediate wall.

## 8. Collision Behavior

- **Tank vs. Wall:** Iterative circle-vs-AABB closest-point resolution (`tankRadius = 14.5px`) executed after movement integration. Contact normals push only the penetrating component out of each nearby wall segment, producing silky wall-sliding around `90°` corners and wall end-caps with zero snagging or wall overlap.
- **Tank vs. Tank:** Pairwise circle-vs-circle separation (`minDist = 29px`) splitting overlap `50/50` between living tanks, followed by a second Tank-vs-Wall clamp pass so one tank can never shove another tank inside a maze wall.
- **Projectile vs. Tank:** Continuous segment-vs-circle intersection (`shellRadius 4.5px + tankHitRadius 14px = 18.5px` combined radius) tested along each substep segment `(prevPos → nextPos)` so fast head-on impacts never skip past a tank.

## 9. UI Positioning and Visual Hierarchy

- **Minimalist Classic Aesthetic:** Clean off-white/charcoal palette, heavy geometric sans-serif typography (`Inter` / `Impact` / `Arial Black` system stack with crisp canvas rendering), flat vector borders (`2px–3px` solid dark outlines), tactile button press states, and zero cluttered sci-fi/glassmorphism panels.
- **Screens:**
  1. **Main Menu:** Bold `TANK TROUBLE` two-line arcade emblem + animated mini demo/decorative tank graphic, quick-select Player Count (`2P`, `3P`, `4P`), `PLAY` CTA, `SETTINGS`, and `CONTROLS` buttons.
  2. **Player Selection / Match Setup:** Interactive 2–4 player cards (toggle active count, cycle tank color, view control cluster), Map Pool selector (`Random Procedural` or 6 curated presets + procedural generator), Winning Score selector (`3`, `5`, `7`, `10`), and `START BATTLE`.
  3. **In-Game HUD:** Parallel `UIScene` (`setScrollFactor(0)`) drawing the bottom player score strip (miniature tank sprite, label, live ammo pips, bold score) + slim top status/pause bar + modal Pause overlay (`Resume`, `Restart Match`, `Settings`, `Main Menu`).
  4. **End-Game Screen:** Crisp victory banner in winner's color, crowned winner tank animation, full final standings table, `REMATCH` (instant same-settings restart), and `MAIN MENU`.

## 10. Match Flow, Scoring, and Round Transitions

1. **Round Start Countdown:** Arena and tanks appear at their spawn positions with subtle directional spawn rings; `3 … 2 … 1 … FIGHT!` (`1.35s` total brisk arcade cadence) lets all 4 local players find their tank before movement unlocks.
2. **Active Round & Aftermath Window:** When combat reduces living tanks to `≤ 1`, a `1.7s` **Aftermath Timer** begins while surviving tanks and in-flight shells continue simulating:
   - If the lone survivor is also destroyed during the aftermath window (or the final two tanks trade simultaneously), the round ends in a **ROUND DRAW** (`TIE — NO POINT!`).
   - If exactly one tank remains alive when the aftermath timer finishes, that player scores **`+1` point** (`PLAYER X SCORES!`), animating their bottom scoreboard counter.
3. **Victory Condition:** First player to reach `winningScore` transitions to `ResultScene`; otherwise, a fresh maze/round starts cleanly.

## 11. Sound and Visual Feedback

- **Procedural Web Audio (`AudioManager`):** Synthesized in real-time via Web Audio API oscillators + filtered noise buffers (zero external asset failures, instant playback after user gesture):
  - Cannon fire punch, pitched wall ricochet click (`pitch` rises subtly per bounce), layered tank explosion boom + metallic debris, countdown pips, round point chime, tie buzzer, UI click/hover, and match victory fanfare.
- **Restrained Visual Polish:**
  - Persistent per-round subtle tyre/tread marks and explosion scorch decals baked onto a round `RenderTexture` floor layer (zero per-frame draw-call growth!).
  - Brief muzzle puff, wall ricochet spark ring, tank-colored hull shard burst on destruction, `50ms` hit flash, and subtle decaying trauma camera shake (`max 4px`, configurable/disableable in Settings).

---

## Visual Comparison Checklist (Used Across Development & Phase 6 QA)

| # | Dimension | Target Reference Standard | Verification Check |
|---|---|---|---|
| 1 | **Background & Floor Contrast** | Bright `#F3F3F1` arena floor vs `#4B4E53`/`#232528` dark charcoal walls | Inspect pixel contrast ratio (`> 7:1`), no dark/neon background drift |
| 2 | **Arena Focus Ratio** | Maze arena occupies central ~75–80% of screen; UI stays strictly outside walls | Measure bounding boxes in 1280×760 & 1920×1080 screenshots |
| 3 | **Corridor-to-Tank Scale** | Tank width ~35–40% of cell pitch (~2 tanks wide corridor) | Visual check + constant ratio check (`30px / 78px ≈ 0.38`) |
| 4 | **Wall Geometry** | Uniform `8px` orthogonal walls, flush `90°` corners, subtle floor shadow | Inspect T-junctions and L-corners at 200% zoom |
| 5 | **Tank Silhouette** | Distinct side treads, rounded colored hull, central turret dome, protruding barrel, dark outline | Inspect all 4 player tanks at `0°`, `45°`, and `90°` angles |
| 6 | **Projectile Readability** | Crisp dark circular shells (`9px`), clear against light floor, visible motion | Capture active multi-ricochet screenshot |
| 7 | **Bottom Scoreboard Bar** | Horizontal row of tank icons + player labels + bold score counters + ammo pips | Verify 2P, 3P, and 4P layouts without text clipping |
| 8 | **Menu & Setup Simplicity** | Clean arcade typography, flat bordered buttons, zero glassmorphism/clutter | Side-by-side comparison of Menu, Setup, Pause, and Result screens |
| 9 | **Effects Restraint** | Crisp explosion shards, scorch mark, muzzle puff & subtle shake that never obscure walls/shells | Capture mid-explosion screenshot and check shell visibility |

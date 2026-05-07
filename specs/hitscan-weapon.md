---
id: hitscan-weapon
area: frontend
priority: 80
depends_on: [sprite-enemies]
description: Click-to-fire hitscan weapon with ammo, player HP, enemy damage, and a minimal HUD
---

# Hitscan Weapon — Shoot the Things

## Goal

Make the world interactive: the player aims with the existing crosshair, clicks (or holds a key) to fire a hitscan shot, and damages or kills enemies along the line of sight. This spec also adds the first real HUD (ammo + player HP), the first enemy-to-player damage path (touch contact), and the bookkeeping (`shotsFired`, `shotsHit`, `kills`) that the upcoming Bayesian-skill spec will consume. No projectiles, no reloading mechanics, no weapon switching — one weapon, one fire mode.

## Acceptance Criteria

1. Single-file constraint preserved: still one `index.html` at the repo root, no build, no external assets, no network.
2. **Firing input:** while the canvas has pointer lock, a left-mouse click fires one shot. The same shot fires on `Space` regardless of pointer-lock state. Auto-fire is **off** — fire only on `mousedown` / `keydown` edges, not on hold.
3. **Fire-rate cap:** at most one shot every 250 ms (configurable constant). Inputs that arrive during cooldown are dropped silently — no input queue.
4. **Hitscan resolution:** firing casts a single ray along the player's facing direction (`dirX, dirY`) from the player's position. The shot hits the nearest target — wall *or* live enemy — using the same DDA primitive the renderer uses, and a per-enemy ray-vs-circle intersection (`radius ≈ 0.4` cells). Walls block shots; enemies behind walls are not hit.
5. **Damage and kills:** an enemy hit takes damage equal to a per-weapon constant (`SHOT_DAMAGE = 2`). When `hp` reaches 0, the enemy flips to `alive = false`, increments a global `kills` counter, and stops being drawn / ticked. Damaged-but-alive enemies briefly flash (one frame at full white via the sprite shader, or a `hitFlashUntil` timestamp consulted by the sprite renderer).
6. **Shot bookkeeping:** every fire increments `shotsFired`. Every fire that connects with an enemy (regardless of whether it kills) increments `shotsHit`. Both counters are exposed on a single global `stats` object alongside `kills` so a later spec can read them without parsing the DOM.
7. **Ammo:** the player starts with `ammo = 24` and each shot decrements it. When `ammo === 0` the trigger is inert (no shot, no `shotsFired` increment, no cooldown reset). No reloading mechanic this spec — running out is a soft fail state. Killing any enemy refunds `+3` ammo (capped at the starting value) so play can continue indefinitely with reasonable accuracy.
8. **Player HP & contact damage:** player starts with `hp = 100`. Any live enemy within `0.6` cells of the player at the end of an update tick deals `10` HP per second (delta-time scaled). At `hp <= 0` the game enters a frozen "you died" state: the world stops updating, input is ignored except for `R` which resets the player position, HP, ammo, and resurrects all enemies to their starting `hp`.
9. **Muzzle flash & hit feedback:** for ~80 ms after a shot, draw a small additive flash overlay (e.g., a translucent yellow rectangle covering the lower-center of the viewport). When a shot hits an enemy, briefly tint the crosshair red for ~120 ms. Both effects use the existing `ctx` 2D context after the `putImageData`, not the buffer.
10. **HUD:** along the bottom of the canvas, draw three readouts using the existing `ctx.font = '12px monospace'` style:
    - `HP   nnn`  (left)
    - `AMMO  nn / 24`  (center)
    - `KILLS nn`  (right)
    Plus a thin red bar above the HUD whose width is proportional to `hp / 100`. The HUD draws after the world and the FPS counter, so it never sits behind walls.
11. Frame rate stays at the existing **≥ 30 FPS** target with all initial enemies alive and the player firing continuously.
12. No new console errors during a 60-second session of normal play (walking, firing, hitting walls and enemies, taking contact damage, dying, pressing `R`).

## Out of Scope

- Multiple weapons or weapon switching.
- Reloading, magazines, or weapon-pickup items.
- Projectile weapons (rockets, plasma) or any non-instant shot.
- Splash damage, knockback, or status effects.
- Enemy ranged attacks (only contact damage this spec).
- Pathfinding for enemies (still rotation + spec-`sprite-enemies` AI).
- Sound effects.
- Persistent stats across reloads, score saving, leaderboards.
- Any Bayesian / adaptive logic. The Beta posterior consumes `stats` in a later spec; this spec only **produces** the counters.
- Game-over UI beyond the frozen state + `R`-to-reset.

## Design Notes

- **Symbols this spec depends on** (added by `sprite-enemies`, plus the originals from `raycaster-mvp`):
  - `enemies` — array of `{ x, y, type, hp, alive, animPhase, ... }`.
  - `castColumn(x)` — useful as a model, but for hitscan you want a single ray along `(dirX, dirY)`, not a screen-column ray. Either factor a `castRay(originX, originY, dirX, dirY)` helper out of `castColumn`, or inline the DDA loop in a `fireShot()` function.
  - `zBuffer`, `player`, `MAP`, `isWall`, `rgba32`, `buf32`.
- **Hitscan algorithm:**
  1. Run the DDA loop along `(dirX, dirY)` to find the wall hit distance `dWall` (perpendicular distance is fine here since the ray is axis-aligned with the camera forward).
  2. For each `alive` enemy, compute the closest distance from the ray to the enemy's center; if that perpendicular distance is `<= enemyRadius` *and* the projected distance along the ray is in `(0, dWall)`, it's a candidate.
  3. Pick the candidate with the smallest projected distance. That enemy takes `SHOT_DAMAGE`.
  4. If no enemy candidate, the shot is a wall hit — no `shotsHit` increment.
- **Ray-vs-circle:** with ray origin `P`, unit direction `D`, and enemy center `C`:
  ```
  L = C - P
  tProj = L · D                  // distance along ray to nearest point
  perp2 = L·L - tProj*tProj      // squared perpendicular distance
  hit = tProj > 0 && perp2 <= r*r && tProj < dWall
  ```
- **Performance:** firing is rare and the enemy count is tiny; do not optimize. Inline math, branch normally, no spatial structures.
- **HUD placement:** keep the HUD bar inside the 480×270 internal buffer rather than drawing in CSS. This keeps everything pixel-perfect at scale and avoids layout drift on different window sizes.
- **Crosshair / muzzle flash overlap:** the existing `render()` already draws the crosshair after `putImageData`. Add the muzzle flash and crosshair tint in the same post-blit phase — leave the per-pixel buffer alone for these short-lived overlays.
- **Reset on death (`R`):** centralize the reset in a `resetRun()` function. Re-initializing enemies cleanly is easier if the initial enemy table is held in a `const INITIAL_ENEMIES` and `enemies = INITIAL_ENEMIES.map(e => ({...e}))` is called both at startup and on reset.
- **Stats schema (frozen for downstream specs):**
  ```
  stats = { shotsFired: 0, shotsHit: 0, kills: 0, deaths: 0 };
  ```
  The Bayesian-skill spec will treat each shot as a Bernoulli trial with `success = hit`. Increment `deaths` inside the death branch even though no UI displays it — the cost is one line and avoids a schema break later.

## Agent Notes

- Read `AGENTS.md`, `specs/raycaster-mvp.md`, and `specs/sprite-enemies.md` first. Make all changes inside the assigned worktree only.
- Single-file, vanilla JS, no build, no `package.json`. Same as the previous two specs.
- **Where to insert the hitscan code:** alongside the existing `update(dt)` and `render()` in the IIFE. A new `fireShot()` function (called from the click and Space handlers) and a new `applyContactDamage(dt)` helper (called inside `update`) keep the additions local and grep-able.
- **Do not break existing tests of behavior:** WASD movement, mouse-look, pointer-lock, FPS counter, sprite rendering, and z-buffer occlusion must all still work exactly as before.
- Common pitfalls:
  - **Auto-fire on hold:** browsers fire repeated `keydown` events while a key is held. Track a `spaceWasDown` flag and only fire on the rising edge.
  - **Pointer-lock click swallowing:** the canvas's `click` handler currently calls `requestPointerLock`. Once locked, `mousedown` events should fire shots — handle `mousedown`, gate on `event.button === 0`, and check `pointerLocked` to distinguish "click to lock" from "click to shoot."
  - **Cooldown across `R` reset:** clear `lastFireTime` and the cooldown timer in `resetRun()` so the first post-respawn shot fires immediately.
  - **Counting bookkeeping:** if `ammo === 0`, the function returns *before* `shotsFired++`. If the cooldown rejects the input, same thing — only count attempts that actually leave the barrel.
  - **HUD outside buffer:** if you draw the HUD into `buf32` *before* `putImageData`, the FPS counter (which draws via `ctx` afterward) will still appear, but the HUD will be subject to the pixelated upscale. Drawing it via `ctx` after the blit (like FPS) gives crisper text.
- Smoke-test before reporting:
  - Open the file, fire at each enemy, confirm each takes the right number of shots to die based on `SHOT_DAMAGE` and starting `hp`.
  - Stand still next to an enemy and confirm HP drains; let it hit zero, see the frozen state, press `R`, confirm respawn.
  - Empty the magazine without killing anything; confirm trigger goes inert. Kill an enemy with the last few rounds; confirm `+3` ammo refund and that you can continue.
  - `node --check` the extracted script body for syntax errors.
- The `stats` object's shape is part of this spec's contract — do not rename fields; downstream Bayesian specs will read it directly.

---
id: enemy-projectile-attacks
area: frontend
priority: 50
depends_on: []
description: Replace enemy hitscan ranged attacks with visible, dodgeable straight-line projectiles spawned at windup-end and resolved on player collision.
---

# Enemy Projectile Attacks — Dodgeable Imp/Grunt Fireballs

## Goal

Today, every enemy ranged attack is hitscan: when the windup timer expires,
`enemyFireShot` runs a single LOS/range check and immediately deducts
`rangedDamage` from the player. There is nothing to see in flight and nothing
to dodge — the only counterplay is breaking LOS *before* the windup completes.

This task replaces the hitscan resolve with a visible, finite-speed projectile
that is spawned at windup-end, travels in a straight line locked toward the
player's position at fire time, and only deals damage if it physically
intersects the player. Walls absorb the projectile harmlessly. The result is
Doom-imp-style fireballs: telegraphed, visible, and sidestep-able.

Audio cadence, windup timing, sprite tints, the muzzle-flash overlay, and the
rest of `enemy-attack-feel-polish` stay intact. This spec is exclusively about
moving damage resolution out of `enemyFireShot` and onto a per-frame
projectile simulation.

## Acceptance Criteria

1. **Single-file constraint preserved.** Still one `index.html` at the repo
   root, no `package.json`, no external assets, no build step, no
   `localStorage`, no network requests. All new state lives inside the
   existing IIFE.
2. **`stats` schema unchanged.** No new fields, no renames. The existing
   `enemyShotsFired` / `enemyShotsHit` counters stay, but the *trigger sites*
   move:
   - `enemyShotsFired++` continues to fire inside `enemyFireShot` — i.e., on
     the windup-end frame, when the projectile is spawned. A shot was fired
     even if the projectile later dies on a wall.
   - `enemyShotsHit++` moves out of `enemyFireShot` and into the projectile
     update loop, incremented exactly once per projectile, on the frame it
     intersects the player. A projectile that dies on a wall does **not**
     increment `enemyShotsHit`.
3. **Tuning constants** added at the top of the IIFE alongside `ATTACK_RANGE`
   etc.:
   ```js
   const PROJECTILE_SPEED = 7.0;        // cells per second
   const PROJECTILE_HIT_RADIUS = 0.35;  // cells; player-collision radius
   const PROJECTILE_SPAWN_OFFSET = 0.5; // cells; spawn distance ahead of shooter
   const PROJECTILE_TTL_MS = 2000;      // defensive despawn cap
   ```
   These values are part of the spec; do not retune them. `ATTACK_RANGE`,
   `WINDUP_MS`/`cooldownMs`, `CONTACT_DPS`, `CONTACT_RADIUS`,
   `ENEMY_FIRE_FLASH_MS`, `MAX_AUDIBLE_DIST`, and the per-type
   `windupMs`/`cooldownMs` in `TYPE_TABLE` are unchanged.
4. **New module-scope `projectiles` array.** A single `let projectiles = [];`
   declared near the existing `let enemies = [];` (around `index.html:1176`).
   Each entry is an object literal with fields:
   ```js
   { x, y, vx, vy, type, damage, sourceX, sourceY, alive, spawnedAtMs }
   ```
   - `x, y` — current world position
   - `vx, vy` — velocity in cells/sec; magnitude == `PROJECTILE_SPEED`,
     direction locked at spawn
   - `type` — `'imp'` or `'grunt'`; selects sprite + damage
   - `damage` — captured from `TYPE_TABLE[type].rangedDamage` at spawn so a
     mid-flight enemy death cannot retroactively change damage
   - `sourceX, sourceY` — the firing enemy's position at spawn time, used as
     the source point for `setDamageArrow` on a confirmed hit (so the arrow
     still points roughly at the shooter even if the enemy has moved or died
     by the time the projectile lands)
   - `alive` — flips to `false` on wall hit, player hit, or TTL expiry
   - `spawnedAtMs` — `performance.now()` at spawn; consumed only by the TTL
     check
5. **`enemyFireShot` is rewritten as a spawn-only function.** Its
   responsibilities collapse to:
   - `stats.enemyShotsFired++`
   - `e.fireFlashUntil = now + ENEMY_FIRE_FLASH_MS`
   - per-type fire SFX (existing `sfxImpFire(vol)` / `sfxGruntFire(vol)`)
     before any guards
   - early-return if `!e.alive` (defensive — should not happen given AI tick
     ordering, but matches current behavior)
   - compute spawn position and velocity (see #6) and push a new entry to
     `projectiles`

   The function no longer:
   - calls `castRay`
   - calls `enemyCanSeePlayer`
   - performs an `ATTACK_RANGE + 0.5` distance gate
   - mutates `player.hp`
   - calls `sfxHurt`, `triggerDamageFlash`, or `setDamageArrow`
   - increments `stats.enemyShotsHit`
   - touches `stats.deaths`

   All those behaviors move to the projectile collision path (#7).
6. **Spawn geometry.** At fire time:
   - Compute `dx = player.x - e.x`, `dy = player.y - e.y`,
     `d = Math.hypot(dx, dy)`. If `d < 1e-6`, treat the lock direction as
     `e.dirX, e.dirY` (already normalized in `aiTick`); otherwise the lock
     direction is `(dx/d, dy/d)`. This is the only place the projectile
     "tracks" the player — once spawned, the velocity is constant.
   - Spawn position is the enemy center pushed forward by
     `PROJECTILE_SPAWN_OFFSET` along the lock direction. If that point lands
     inside a wall cell (`isWall(Math.floor(sx), Math.floor(sy))`), reduce
     the offset to `0.0` and spawn at the enemy center instead — keeps a
     wall-hugging enemy from spawning a projectile permanently embedded in
     geometry. (We accept that an enemy whose own center is in a wall is
     impossible per existing AI/separation rules; defensive only.)
   - Velocity is `(lockX * PROJECTILE_SPEED, lockY * PROJECTILE_SPEED)`.
7. **Per-frame projectile tick** runs every `update(dt)` after `aiTick(dt)`
   and before `applyContactDamage(dt)`. New helper `tickProjectiles(dt)`:
   ```js
   function tickProjectiles(dt) {
     const now = performance.now();
     const r2 = PROJECTILE_HIT_RADIUS * PROJECTILE_HIT_RADIUS;
     for (let i = 0; i < projectiles.length; i++) {
       const p = projectiles[i];
       if (!p.alive) continue;
       // Substep so a fast projectile cannot tunnel through a 1-cell wall.
       // STEP_LEN is at most 0.25 cells; iterate ceil(travel / 0.25) steps.
       const travel = PROJECTILE_SPEED * dt;
       const steps = Math.max(1, Math.ceil(travel / 0.25));
       const sx = p.vx * dt / steps;
       const sy = p.vy * dt / steps;
       for (let s = 0; s < steps; s++) {
         p.x += sx;
         p.y += sy;
         if (isWall(Math.floor(p.x), Math.floor(p.y))) {
           p.alive = false;
           break;
         }
         const ddx = player.x - p.x, ddy = player.y - p.y;
         if (ddx * ddx + ddy * ddy <= r2 && player.hp > 0) {
           p.alive = false;
           onProjectileHitPlayer(p, now);
           break;
         }
       }
       if (p.alive && now - p.spawnedAtMs >= PROJECTILE_TTL_MS) {
         p.alive = false;
       }
     }
     // Compact dead projectiles. In-place filter to avoid GC churn under
     // sustained fire.
     let w = 0;
     for (let r = 0; r < projectiles.length; r++) {
       if (projectiles[r].alive) projectiles[w++] = projectiles[r];
     }
     projectiles.length = w;
   }
   ```
   The substep count keeps wall and player intersection conservative even
   at the highest plausible `dt` (vsync hiccups, tab refocus). 0.25 cells is
   well under both `PROJECTILE_HIT_RADIUS` and the 1-cell wall thickness.
8. **`onProjectileHitPlayer(p, now)`** centralizes the existing damage
   feedback that used to live at the bottom of `enemyFireShot`:
   ```js
   function onProjectileHitPlayer(p, now) {
     stats.enemyShotsHit++;
     player.hp -= p.damage;
     sfxHurt();
     triggerDamageFlash(now);
     setDamageArrowFromPoint(p.sourceX, p.sourceY, now);
     if (player.hp <= 0) {
       player.hp = 0;
       stats.deaths++;
     }
   }
   ```
   `setDamageArrowFromPoint(sx, sy, now)` is a new tiny wrapper that mirrors
   the existing `setDamageArrow(e, now)` but accepts raw coordinates instead
   of an enemy reference (since the firing enemy may have died or moved
   between spawn and impact). Implement it next to `setDamageArrow`; it
   should compute the world angle from `(sx - player.x, sy - player.y)` and
   feed the same single-slot arrow state. The existing `setDamageArrow(e,
   now)` may delegate to `setDamageArrowFromPoint(e.x, e.y, now)` so contact
   damage continues to use the enemy's live position.
9. **Projectile sprites — distinct per type.** Two new 16×16 sprites are baked
   at startup using the existing `buildFrame` + palette pipeline. Both are
   small (silhouette occupies ~6×6 of the 16×16 cell, centered) so they read
   as small bright orbs and don't visually swamp the corridor.
   - `imp` projectile: bright orange/yellow fireball.
     ```
     '................',
     '................',
     '................',
     '................',
     '................',
     '......yyyy......',
     '.....yYYYYy.....',
     '.....yYWWYy.....',  // 'W' = white-hot core
     '.....yYWWYy.....',
     '.....yYYYYy.....',
     '......yyyy......',
     '................',
     '................',
     '................',
     '................',
     '................',
     ```
     Palette suggestion (in the imp-projectile palette):
     `'W' = rgba32(255, 245, 200)`, `'Y' = rgba32(255, 180, 60)`,
     `'y' = rgba32(220, 90, 30)`.
   - `grunt` projectile: dull green plasma blob, slightly larger silhouette.
     ```
     '................',
     '................',
     '................',
     '................',
     '......gggg......',
     '.....gGGGGg.....',
     '....gGGCCGGg....',
     '....gGCWWCGg....',  // 'W' = pale green core
     '....gGCWWCGg....',
     '....gGGCCGGg....',
     '.....gGGGGg.....',
     '......gggg......',
     '................',
     '................',
     '................',
     '................',
     ```
     Palette suggestion:
     `'W' = rgba32(220, 255, 220)`, `'C' = rgba32(140, 255, 160)`,
     `'G' = rgba32(60, 180, 90)`, `'g' = rgba32(30, 90, 50)`.

   Bake each as a single frame, then duplicate the same frame into a 2-entry
   array so projectile rendering can reuse the existing
   `frames[(animPhase|0) & 1]` shape. Register them in the `SPRITES` table
   under new keys (e.g. `'imp_proj'` and `'grunt_proj'`). Do not edit the
   existing `imp`, `grunt`, or `exit` entries.
10. **Projectile rendering** piggybacks on `drawSprites()` and the existing
    z-buffered sprite pipeline. In the projectile-collection loop at the top
    of `drawSprites()`, after the `for (let i = 0; i < enemies.length; i++)`
    block, add:
    ```js
    for (let i = 0; i < projectiles.length; i++) {
      const p = projectiles[i];
      if (!p.alive) continue;
      const dx = p.x - px;
      const dy = p.y - py;
      // id offset so projectile entries can never collide with enemy ids
      // in the stable-sort tiebreak.
      spriteOrder.push({ e: p, dx, dy, d2: dx * dx + dy * dy, id: 1000 + i });
    }
    ```
    Each projectile object exposes the duck-type fields the renderer reads:
    `type` (matches a `SPRITES` key), `animPhase` (set to `0` at spawn — no
    animation; both frames are identical anyway), `hitFlashUntil` (`0`),
    `mode` (`'idle'` so the wind-mode red-tint branch never fires for
    projectiles).

    No new render pass. No glow halo, no additive blending, no light-up of
    nearby walls. The projectile is a sprite like any other.
11. **Reset / level transitions clear projectiles.** `clearTransientFeedback()`
    additionally calls `projectiles.length = 0;`. This handles R-restart,
    N-regenerate, and the exit-cell `advanceLevel()` path (since both call
    `clearTransientFeedback`). A projectile in flight when the player dies
    should not survive into the next run; an in-flight projectile when the
    player exits the level should not survive into the next dungeon.
12. **Death freeze.** When `player.hp <= 0`, `update()` already early-returns
    near the top. Projectiles therefore freeze in place during the death
    state, which is the desired effect — the world stops. `tickProjectiles`
    must not run while dead. (No special-case code needed; the existing
    early-return in `update` covers it.)
13. **Wall behavior — silent despawn.** A projectile whose substep crosses
    into a wall cell flips `alive = false` and stops; no SFX, no impact
    sprite, no flash. This matches the chosen design and keeps the
    implementation small.
14. **Pass-through other enemies.** Projectiles do not collide with enemies.
    No infighting damage, no friendly-fire blocking. The collision check is
    exclusively wall-vs-projectile and player-vs-projectile.
15. **Visual wind-mode red tint, fire flash, muzzle-flash overlay, and SFX
    are unchanged.** The wind-mode tint still tells the player a windup is
    happening; the muzzle-flash overlay still flashes at the firing enemy's
    screen position on the spawn frame; per-type fire SFX still plays at
    spawn regardless of where the projectile ends up. The damage vignette,
    direction arrow, and `sfxHurt` now play *only* on projectile-vs-player
    collision (i.e., they may play hundreds of ms later than the fire
    flash, or never).
16. **Performance.** With all initial enemies alive plus ~10 projectiles in
    flight, the existing ≥ 30 FPS target still holds. Per frame the projectile
    pipeline adds: at most `≤ N_proj * substeps` cell-lookups (`isWall` is
    `MAP[my][mx] > 0`), one `Math.hypot` call per projectile per substep,
    and one extra sprite entry per projectile. No `getContext`, no per-pixel
    work outside the existing sprite blitter, no `ctx.shadowBlur`.
17. **No new console errors or warnings** during a 60-second session that
    covers: imp fires, player sidesteps the fireball, fireball hits a wall;
    imp fires from point-blank, player gets hit (HP drops, vignette
    flashes, arrow points at imp); grunt fires while player retreats,
    fireball lands on the player at extreme range (still damages — this is
    the new "shoot-around-corners" capability the projectile enables);
    enemy dies mid-flight (projectile continues, damage uses captured
    `p.damage`); player dies to a projectile (death freeze, projectiles
    don't keep moving, R-restart clears them); N-regenerate mid-flight
    (projectiles cleared); walking through the exit while a projectile is
    in flight (cleared by `advanceLevel → clearTransientFeedback`).
18. **Single-file, single-IIFE invariant.** All new state, helpers, sprite
    bakes, and tuning constants live inside the existing IIFE. No top-level
    declarations, no globals.

## Out of Scope

- Homing or tracking projectiles. Velocity is constant after spawn.
- Projectile-vs-projectile collision; projectile-vs-enemy infighting.
- Burst fire, multi-projectile spreads, charged shots, varying speed per
  type. Both types use a single shared `PROJECTILE_SPEED`.
- Damage falloff with distance. `p.damage` is captured at spawn from
  `TYPE_TABLE[type].rangedDamage` and applied as-is on hit.
- Player-fired projectiles. The player gun stays hitscan; this spec touches
  enemy attacks only. `fireShot()` and its `castRay`-based hit math are
  unchanged.
- Wall-impact SFX, impact decals, scorch marks, particle effects. Wall
  collision is silent.
- Animated projectile sprites (rotation, frame cycling, trailing sparks).
  Static silhouette only; the 2-frame array is just shape compatibility.
- Lighting or glow effects from projectiles (no dynamic light, no halo on
  walls).
- New `stats` counters (e.g. `projectilesDodged`). The two existing
  `enemyShots*` counters move trigger sites but their schema is unchanged.
- Per-type projectile speed, hit radius, or TTL. Single shared values.
- HUD changes: no on-screen "incoming fireball!" indicator beyond the
  existing in-world projectile sprite.
- Any retuning of `rangedDamage`, `windupMs`, `cooldownMs`, `ATTACK_RANGE`,
  or `MAX_AUDIBLE_DIST`. Cadence and damage stay where
  `enemy-attack-feel-polish` left them.

## Design Notes

### Files involved
`index.html` only.

### Hook points
Line numbers reflect the current state of the file; expect small drift after
edits.

- **Tuning constants** (`index.html:58-76`): add the four new
  `PROJECTILE_*` constants in this block.
- **`SPRITES` table** (`index.html:1134-1138`): add `imp_proj` and
  `grunt_proj` entries. The two new `buildFrame` calls + their palettes go
  immediately above the `SPRITES` literal so the existing baking pattern
  (frame, frame, palette object) stays grouped.
- **`enemies`/state declarations** (`index.html:1175-1176`): add
  `let projectiles = [];` adjacent to `let enemies = [];`.
- **`clearTransientFeedback`** (`index.html:1183-1209`): append
  `projectiles.length = 0;`.
- **`update(dt)`** (around `index.html:713-720`): insert
  `tickProjectiles(dt);` between `aiTick(dt);` and
  `applyContactDamage(dt);`.
- **`enemyFireShot`** (`index.html:1607-1636`): rewrite to spawn-only per
  acceptance #5. Keep the function name, signature `(e, now)`, and call
  site (`aiTick` line 1658).
- **`drawSprites`** (`index.html:2505-2523`): extend the entity-collection
  block to also push projectile entries, per acceptance #10.
- **Damage-arrow helpers** (search for `setDamageArrow` — it lives near the
  HUD-feedback code): split into `setDamageArrowFromPoint(sx, sy, now)` +
  thin `setDamageArrow(e, now)` wrapper.

### Geometry / safety details

- `isWall(mx, my)` already returns false for out-of-bounds cells per the
  existing implementation (around `index.html:574`), so a projectile that
  flies off the edge of the map will simply travel until its TTL expires.
  Map borders are walls, so this is a defensive case in practice.
- `PROJECTILE_HIT_RADIUS = 0.35` is intentionally smaller than
  `CONTACT_RADIUS = 0.6`. Contact damage is supposed to feel inevitable
  when an enemy is hugging the player; projectile damage is supposed to
  feel like a discrete impact. The two systems coexist without one
  shadowing the other.
- The substep loop guards both wall tunneling and player tunneling. With
  `PROJECTILE_SPEED = 7.0` and a worst-case `dt ≈ 0.05 s` (a 20 FPS
  hiccup), travel-per-frame is 0.35 cells — already smaller than
  `PROJECTILE_HIT_RADIUS`, but the substep keeps behavior identical at
  any frame rate without per-call branching on `dt`.

### Damage-arrow split

```js
// New: arrow source is an arbitrary point in world space.
function setDamageArrowFromPoint(sx, sy, now) {
  const dx = sx - player.x, dy = sy - player.y;
  if (dx * dx + dy * dy < 1e-6) return; // degenerate; leave existing arrow
  const worldAngle = Math.atan2(dy, dx);
  dmgArrow = { worldAngle, atMs: now, untilMs: now + DMG_ARROW_MS };
}

// Existing call sites (contact damage path) become a one-liner.
function setDamageArrow(e, now) {
  setDamageArrowFromPoint(e.x, e.y, now);
}
```

(The exact field names — `worldAngle`, `atMs`, `untilMs`, `DMG_ARROW_MS` —
must match whatever the existing `setDamageArrow` writes; do not redesign
the arrow state shape, just route it through the new helper.)

## Agent Notes

- **Read first:** `AGENTS.md`, `CLAUDE.md`, this spec, then the combat block
  of `index.html` end-to-end:
  - tuning constants near `index.html:58-80`
  - SFX block + sprites near `index.html:225-1140`
  - `update`, `aiTick`, `enemyFireShot` near `index.html:710-1700`
  - `drawSprites` and the HUD-feedback / damage-arrow block near
    `index.html:2487-2620` and the `setDamageArrow` site
  - `clearTransientFeedback` / `resetRun` / `advanceLevel` near
    `index.html:1175-1225`
  Make all edits inside the assigned worktree only.
- **Order of work:**
  1. Add the four `PROJECTILE_*` tuning constants.
  2. Bake the two new projectile sprites and register them in `SPRITES`.
  3. Declare `let projectiles = [];` next to `enemies`.
  4. Split `setDamageArrow` into `setDamageArrowFromPoint` + wrapper.
  5. Rewrite `enemyFireShot` as spawn-only.
  6. Add `onProjectileHitPlayer(p, now)`.
  7. Add `tickProjectiles(dt)` and call it from `update` between `aiTick`
     and `applyContactDamage`.
  8. Extend `drawSprites` to push projectile entries into `spriteOrder`.
  9. Append `projectiles.length = 0;` to `clearTransientFeedback`.
  10. Run `node --check` against the extracted `<script>` body.
  11. Smoke-test in the browser.
- **Common pitfalls:**
  - **Forgetting to remove `castRay` / `enemyCanSeePlayer` / range gate
    from `enemyFireShot`.** Those gates exist precisely because hitscan
    couldn't model wall absorption; the projectile path *is* the model.
    Leaving them in suppresses spawns of projectiles that would otherwise
    be perfectly capable of clipping a corner, and reintroduces the
    hitscan miss-on-LOS-loss behavior the spec is replacing. Delete them.
  - **Deferring `enemyShotsFired++`.** The "fired" counter belongs at
    spawn time, not impact. Keep it next to `e.fireFlashUntil =
    now + ENEMY_FIRE_FLASH_MS`.
  - **Reading `e.rangedDamage` / `e.x, e.y` on impact instead of capturing
    them at spawn.** The firing enemy may be dead or have moved by the
    time the projectile lands. Use `p.damage` and `p.sourceX, p.sourceY`.
  - **Animating the projectile sprite via `animPhase`.** Both frame slots
    in the sprite array are identical, but if you increment `animPhase`
    in `tickProjectiles` you'll just waste cycles (and add visible
    flicker if you ever differentiate the frames). Leave it at 0.
  - **Spawning the projectile *at* the enemy's center.** The next frame's
    sprite sort places it behind the enemy's own sprite for one frame
    (because the projectile's d² is ~0 vs the enemy's), causing a tiny
    pop. The 0.5-cell offset along the lock direction sidesteps this.
  - **Checking only the projectile's center against `isWall`.** This is
    fine for walls (1-cell-thick, projectile is a point for collision
    purposes), but make sure the *substep* check runs every step, not
    just at end-of-frame, so a fast projectile crossing two cell
    boundaries in one frame still hits the first wall it encounters
    rather than skipping into open space on the far side.
  - **Forgetting the dead-projectile compaction.** Without it, a long
    session leaks dead-but-still-iterated entries; the iteration cost
    grows without bound. The in-place compaction at the end of
    `tickProjectiles` keeps the array tight without per-step `splice`
    calls.
  - **Not clearing projectiles on level transition / death.** The
    `clearTransientFeedback` hook covers all three reset paths
    (`resetRun`, `advanceLevel`, the post-`update` early return on
    death is *not* a reset). One `projectiles.length = 0;` line.
  - **Adding a new sprite entry that conflicts with the enemy id range
    in `spriteOrder`.** Use `id: 1000 + i` (or any non-overlapping
    offset) so the stable tiebreak in the sort doesn't accidentally
    interleave projectile and enemy entries when their `d²` ties.
  - **Per-frame allocation in the projectile loop.** The
    in-place compaction is intentional. Don't `projectiles.filter(...)`
    each frame — that allocates a new array.
  - **`onProjectileHitPlayer` re-entering the death state.** The check
    `if (player.hp > 0)` in `tickProjectiles` before invoking the hit
    handler prevents a projectile that lands the same frame the player
    dies from rebounding `stats.deaths`. Keep that gate.
- **Smoke test before reporting:**
  - Serve with `python3 -m http.server` and open in a browser.
  - Stand 4 cells from an imp, let it wind up, strafe sideways the moment
    its fire SFX plays. Confirm a small fireball appears, travels, and
    despawns on the wall behind you. HP unchanged. `enemyShotsFired`
    incremented; `enemyShotsHit` did not.
  - Stand 2 cells from an imp and let it shoot you head-on. Confirm HP
    drops by `rangedDamage`, vignette flashes, damage arrow points back
    at the imp, `enemyShotsHit` incremented.
  - Lure a grunt; confirm its plasma blob is visually distinct from the
    imp's fireball (color + size).
  - Get an imp to fire from around a corner — the projectile travels in
    a straight line and clips the wall, granting you safety. Same setup
    with a hitscan would have taken your HP regardless.
  - Kill a windup-ed enemy by shooting it — the projectile already in
    flight (if any) keeps going and can still hit you on a delayed
    impact. Confirm `p.damage` matches the dead enemy's type.
  - Press R after dying with a projectile in flight: projectile is gone
    next frame.
  - Press N mid-flight: same.
  - Walk through the exit while a projectile is in flight: same.
  - DevTools console: no new errors or warnings, no `projectiles is not
    defined` regressions on first frame.
- **At minimum** run `node --check` against the extracted `<script>` body
  before reporting.
- Keep `tickProjectiles`, `onProjectileHitPlayer`, the
  `setDamageArrowFromPoint` helper, and the projectile sprite bakes in
  obvious neighbor positions to their existing siblings (next to
  `aiTick` / `applyContactDamage`, next to the existing damage-arrow
  state, next to the existing `imp`/`grunt` sprite bakes) so subsequent
  combat specs can locate them quickly.

---
id: enemy-ai-combat
area: frontend
priority: 70
depends_on: [hitscan-weapon]
description: Line-of-sight chase movement plus telegraphed hitscan ranged attacks for enemies
---

# Enemy AI: Movement + Ranged Combat — Make the Enemies Fight Back

## Goal

Promote enemies from "stationary turrets that rotate to face you" into actual opponents: when they can see the player, they walk toward them; when they're in range, they wind up a clearly telegraphed hitscan shot. No pathfinding, no projectiles — line of sight gates everything, and the windup gives the player a fair beat to break LOS or kill the enemy first. This spec also extends the per-enemy state machine and adds two stats fields the upcoming Bayesian dodge / threat specs will consume.

## Acceptance Criteria

1. Single-file constraint preserved: still one `index.html` at the repo root, no build, no external assets, no network.
2. **Line-of-sight (LOS) helper:** a new `enemyCanSeePlayer(e)` returns `true` iff a DDA ray from `(e.x, e.y)` toward the player reaches `player.{x,y}` before hitting any wall. Sight has no max distance limit *for the LOS test itself* — distance gates are applied separately by movement and attack code. Sight ignores other enemies (they don't block LOS).
3. **Per-enemy state machine.** Each `alive` enemy is in exactly one mode at a time, stored on the entity:
   - `idle` — no LOS, or LOS just lost. Sprite stands still and rotates to face the player (existing behavior is preserved when `mode === 'idle'`).
   - `chase` — LOS true and `dist > ATTACK_RANGE`. Enemy walks toward the player at its type's `moveSpeed`.
   - `wind` — LOS true and `dist <= ATTACK_RANGE`. Enemy stops, plays a windup of `WINDUP_MS = 600 ms`. Visually tinted (see #9).
   - `cool` — fired (or windup cancelled). Enemy is in cooldown for `ATTACK_COOLDOWN_MS = 1200 ms` before re-evaluating. During cooldown the enemy may resume chasing if the player walks away.
   Mode transitions are evaluated every tick from the conditions above; `wind` and `cool` additionally have a `modeUntil` timestamp that holds them until expiry (or until cancellation per #6).
4. **Movement.** In `chase` mode the enemy walks toward the player at `moveSpeed` (per type, see #11), delta-time scaled. Movement uses **the same axis-by-axis wall-collision pattern as the player** with an enemy radius of `0.3` cells — enemies cannot pass through or stand inside walls.
5. **Soft enemy-vs-enemy separation.** After per-enemy movement, run an `O(N^2)` separation pass: for each pair of `alive` enemies whose centers are within `0.6` cells, push each along the unit vector between them by a small step (e.g., half the overlap). `N ≤ 16` is fine. Separation runs even when enemies are in `wind` or `cool` modes, but uses a smaller push so it doesn't visibly nudge a winding-up enemy off its aim.
6. **Telegraphed hitscan attack.** When `mode === 'wind'` and `now >= modeUntil`, the enemy fires one hitscan shot:
   - Cast a DDA ray from `(e.x, e.y)` along the unit vector to the player.
   - The shot **misses** if a wall is closer than the player along the ray.
   - The shot **misses** if the player has moved out of `ATTACK_RANGE + 0.5` between windup-start and now (covers the "step back during windup" dodge).
   - The shot **misses** if LOS is no longer true (the player slipped behind a corner during windup).
   - Otherwise the shot **hits** the player and deals the type's `rangedDamage` (see #11) instantly to `player.hp`.
   - On any outcome the enemy transitions to `cool` with `modeUntil = now + ATTACK_COOLDOWN_MS`.
7. **Cancellation on death.** If an enemy is killed (`hp <= 0`) while in `wind`, no shot fires; the enemy is removed from the AI tick the next frame as today. The player must not retroactively take damage from a dead enemy.
8. **Damage paths coexist.** The existing contact-damage path from `hitscan-weapon` still applies — an enemy adjacent to the player still drains HP via `applyContactDamage(dt)`. Ranged damage is additive, applied as a discrete event at fire time.
9. **Visible windup tint.** While `mode === 'wind'`, the enemy's sprite is rendered with a clearly visible red overlay (e.g., for each opaque source pixel, blend ~50% toward `rgba32(255,40,40)` before the existing distance shade is applied; or, equivalently, brighten the red channel and dim green/blue). The tint is unmistakable from across the room — a player who knows the rule should always be able to see "that enemy is about to shoot" within ~150 ms of the windup starting.
10. **Muzzle flash on enemy fire.** At the moment a shot leaves an enemy, draw a single-frame additive flash at the enemy's projected screen position (use the same inverse camera transform as sprite rendering; skip if the enemy is offscreen or behind the camera). Cheap is fine — a small yellow square or circle via `ctx.fillRect` after `putImageData` is sufficient.
11. **Type tuning** (extends the existing `imp` / `grunt` types from `sprite-enemies`):
    | type | moveSpeed (cells/s) | hp | rangedDamage | meleeRadius (existing) |
    |------|---------------------|----|--------------|--------|
    | imp  | 1.8 | 3 | 5 | 0.6 |
    | grunt | 1.0 | 5 | 10 | 0.6 |
    `WINDUP_MS`, `ATTACK_COOLDOWN_MS`, `ATTACK_RANGE = 5.0` cells, and enemy `radius = 0.3` are shared constants for now.
12. **Stats schema additions** (frozen for downstream specs):
    ```
    stats.enemyShotsFired = 0;
    stats.enemyShotsHit   = 0;
    ```
    `enemyShotsFired` increments at the moment of fire (regardless of outcome). `enemyShotsHit` increments only when the shot hits the player. Existing `stats.{shotsFired, shotsHit, kills, deaths}` are unchanged — do not rename them.
13. **Reset coverage.** `resetRun()` (added by `hitscan-weapon`) re-initializes enemies from `INITIAL_ENEMIES`. After this spec, that init must also clear `mode`, `modeUntil`, and any windup bookkeeping so respawned enemies start in `idle` mode, not mid-windup.
14. **Performance.** With all initial enemies alive and the player firing continuously, the existing **≥ 30 FPS** target still holds. The AI tick is `O(N)` with an additional `O(N^2)` separation pass; `N ≤ 16` keeps this trivially under budget.
15. **No new console errors** for a 60-second session of normal play (walking, getting chased, taking ranged damage, breaking LOS, killing windup enemies before they fire, dying, pressing `R` to reset).

## Out of Scope

- A* / waypoint pathfinding, navmeshes, or any wall-aware navigation. Enemies that lose LOS simply stop.
- Patrol routes, idle wandering, or enemy spawn/despawn logic.
- Projectile-based ranged attacks (the user explicitly chose hitscan-with-telegraph for this spec).
- Enemy-vs-enemy hard collision; only the soft separation in #5.
- Splash damage, knockback, or status effects.
- Player-side dodge mechanics (lean, slide, sprint).
- Difficulty scaling (lands in the future adaptive-spawning spec, which will read `stats.enemyShotsHit / stats.enemyShotsFired` as a player-dodge prior).
- Sound effects for windup, fire, or footsteps (lands in `polish-audio-minimap`; if that spec is implemented first, keep the audio there — *do not* re-implement audio inside this spec).
- Any Bayesian / adaptive logic.
- New enemy types beyond `imp` and `grunt` from `sprite-enemies`.

## Design Notes

- **Symbols this spec depends on:**
  - `enemies`, `INITIAL_ENEMIES` — entity table from `sprite-enemies` / `hitscan-weapon`.
  - `castColumn(x)` — useful as a model for DDA. The LOS helper and the enemy-side hitscan should each run a small DDA loop directly; no need to refactor `castColumn` unless trivial.
  - `player.{x,y}`, `player.hp`, `MAP`, `MAP_W`, `MAP_H`, `isWall`.
  - `applyContactDamage(dt)` — keep calling it as before; ranged damage is additive.
  - `resetRun()` — extend it to clear new mode fields.
  - `stats` — extend the object literal at the top of the IIFE.
  - Sprite renderer (from `sprite-enemies`) — add a tint branch keyed on `mode === 'wind'`.
- **LOS DDA sketch** (keep it inline; ~25 lines):
  ```
  function enemyCanSeePlayer(e) {
    const dx = player.x - e.x, dy = player.y - e.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-6) return true;
    const rx = dx / dist, ry = dy / dist;
    let mx = Math.floor(e.x), my = Math.floor(e.y);
    const stepX = rx < 0 ? -1 : 1;
    const stepY = ry < 0 ? -1 : 1;
    const ddx = rx === 0 ? Infinity : Math.abs(1 / rx);
    const ddy = ry === 0 ? Infinity : Math.abs(1 / ry);
    let sideX = ((rx < 0 ? e.x - mx : mx + 1 - e.x)) * ddx;
    let sideY = ((ry < 0 ? e.y - my : my + 1 - e.y)) * ddy;
    let traveled = 0;
    while (traveled < dist) {
      if (sideX < sideY) { traveled = sideX; sideX += ddx; mx += stepX; }
      else               { traveled = sideY; sideY += ddy; my += stepY; }
      if (mx < 0 || my < 0 || mx >= MAP_W || my >= MAP_H) return false;
      if (isWall(mx, my)) return traveled >= dist; // wall hit before player
    }
    return true;
  }
  ```
- **Shot validation at fire time.** When the windup expires, the shot only "lands" if all four conditions hold: enemy still `alive`, LOS still true, distance ≤ `ATTACK_RANGE + 0.5`, and the same DDA confirms no wall sits between enemy and player along the firing ray. Implement these as four short guards rather than a single composite expression — easier to read and to debug.
- **Movement step.** Per tick:
  ```
  if (mode === 'chase') {
    const dx = player.x - e.x, dy = player.y - e.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1e-6) {
      const stepLen = e.moveSpeed * dt;
      moveAxis(e, (dx/dist) * stepLen, 0);   // X axis with collision
      moveAxis(e, 0, (dy/dist) * stepLen);   // Y axis with collision
    }
  }
  ```
  `moveAxis(e, vx, vy)` checks `isWall(floor(e.x + sign(vx)*radius + vx), floor(e.y))` style guards; reuse the same pattern the player movement code already has, just on `e` instead of `player`.
- **Mode evaluation order in the AI tick.** Each frame, per enemy:
  1. Skip if `!alive`.
  2. If `mode === 'cool'` and `now >= modeUntil`, mode → `idle` (re-evaluation will pick the right next mode below).
  3. If `mode === 'wind'` and `now >= modeUntil`, resolve the shot per #6 then transition to `cool`.
  4. Compute `seen = enemyCanSeePlayer(e)` and `dist = Math.hypot(...)` once.
  5. If `mode === 'idle'`: if `seen && dist <= ATTACK_RANGE` → start `wind` (`modeUntil = now + WINDUP_MS`); else if `seen` → `chase`; else stay `idle`.
  6. If `mode === 'chase'`: same conditions; promote to `wind` once in range, demote to `idle` once LOS lost.
  7. **Cancellation:** if `mode === 'wind'` and (`!seen` || `dist > ATTACK_RANGE + 0.5`), demote back to `chase` (or `idle` if `!seen`) and clear `modeUntil` — no shot, no cooldown penalty.
- **Tint implementation.** The simplest cheap option: in the sprite-renderer inner loop, after the existing `shade` multiplies have been applied to the source RGBA, check a `tint` flag passed in (true when `e.mode === 'wind'`), and if set, replace the green/blue channels with `value * 0.4` and clamp red to `min(255, r + 80)`. This avoids a new branch per pixel beyond the existing transparency check.
- **Spawn-state contract.** `INITIAL_ENEMIES` is the canonical initial table. Update its entries (or update the cloning in `resetRun`) to set `mode: 'idle'`, `modeUntil: 0`, and the per-type `moveSpeed`, `rangedDamage`. Type-specific fields can be looked up from a tiny `TYPE_TABLE` keyed by `'imp'`/`'grunt'` rather than baked into each entry.

## Agent Notes

- Read `AGENTS.md`, `specs/raycaster-mvp.md`, `specs/sprite-enemies.md`, and `specs/hitscan-weapon.md` first. Make all changes inside the assigned worktree only.
- Single-file, vanilla JS, no build, no `package.json`. Same constraint as every previous spec.
- **Do not regress existing behavior.** Walking, mouse-look, pointer-lock, FPS counter, sprite rendering, z-buffer occlusion, click-to-fire hitscan, ammo, kills HUD, contact damage, death freeze + `R` reset, and the frozen `stats` schema (with the *additions* from #12) must all still work.
- **Audio belongs in `polish-audio-minimap`, not here.** If both specs land, keep this spec silent and let the polish spec hook into the windup-fire and player-take-damage events. If `polish-audio-minimap` hasn't shipped when this spec is implemented, *do not* add audio anyway — silent is fine.
- Common pitfalls:
  - **LOS that returns the wrong answer at boundaries:** the DDA loop must terminate when `traveled >= dist`. If you check `traveled > dist`, off-by-one cases at integer cell boundaries will treat a wall flush against the player as blocking LOS.
  - **Time math mixing milliseconds and seconds:** `WINDUP_MS` and `ATTACK_COOLDOWN_MS` are in **milliseconds**; the existing `update(dt)` receives `dt` in **seconds**. Use `performance.now()` for `modeUntil` comparisons and `dt` for movement scaling. Don't cross-pollinate.
  - **Cancellation that still costs a cooldown:** the spec is explicit (#6 vs #7 vs the cancellation note in Design Notes): a *cancelled* windup goes back to `chase` or `idle`, **not** to `cool`. A *fired* windup (even one that misses) goes to `cool`. Mixing these makes enemies feel arbitrary.
  - **Enemy stuck on the player:** if `chase` runs every tick with no minimum distance, enemies will overlap the player's position and the contact-damage path will pulse. Add a small floor: if `dist < playerRadius + enemy.radius`, treat it as "in range, no need to step further" — let `wind` take over.
  - **`resetRun` forgetting new fields:** if you add `mode` and `modeUntil` directly on enemies but only reset positions, a respawn after death will leave `mode === 'cool'` from the previous run and the enemy will sit there for 1.2 s before reacting. Reset all new fields.
  - **Tint cost in the inner loop:** keep the tint check branchless if you can — pass a precomputed `tintMul` of `1` (no tint) or a packed RGBA factor (windup) so the inner loop multiplies unconditionally.
- Smoke-test before reporting:
  - Serve the file (`python3 -m http.server`) and walk into LOS of an enemy. Confirm: it walks toward you. Stop within ~5 cells; the enemy stops, tints red, and after ~0.6 s your HP drops by `rangedDamage`.
  - Step behind a corner during the windup; confirm no shot lands and the enemy returns to `chase` when it sees you again, with no cooldown penalty.
  - Shoot a winding-up enemy dead; confirm no shot fires and your HP doesn't change.
  - Stand still next to an imp; confirm contact damage *and* the periodic ranged hits both apply.
  - Drop to 0 HP, confirm the death freeze still works, press `R`, confirm enemies respawn in `idle` mode (no leftover `wind` from the previous run).
  - Run `node --check` against the extracted `<script>` body.
- The `stats` schema additions (`enemyShotsFired`, `enemyShotsHit`) are part of this spec's contract — do not rename; the future Bayesian dodge / threat specs will read them directly. Ordering of fields in the object literal doesn't matter, but presence does.

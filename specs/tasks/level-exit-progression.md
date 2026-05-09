---
id: level-exit-progression
area: frontend
priority: 50
depends_on: []
description: Per-dungeon exit cell as a glowing pillar billboard; stepping onto it advances to a fresh level carrying HP+ammo; adds level counter, transition SFX/banner, and R/N level-reset
---

# Level Exit and Cross-Level Progression

## Goal

Each generated dungeon currently has no end state — `N` regenerates manually,
`R` only fires after death. This task adds a single per-dungeon exit cell,
rendered in-world as a glowing pillar billboard. Walking onto it auto-advances
the player to a freshly generated dungeon with HP and ammo carried over and
the level counter incremented. `R` (post-death) and `N` (debug regenerate)
both reset the level counter to 1. The change is purely about world
progression: dungeon generation, combat math, AI, and stats schema all stay
as they are.

## Acceptance Criteria

1. **Single-file constraint preserved.** Still one `index.html` at the repo
   root, no `package.json`, no external assets, no build step, no
   `localStorage`, no network requests. All new state lives inside the
   existing IIFE.
2. **`stats` schema unchanged.** No new fields in the `stats` object, no
   renames. The progression counter lives in a separate module-scope
   variable (`let level = 1;`) so the existing Bayesian-skill / adaptive-
   spawning contracts on `stats` are not perturbed.
3. **Module-scope `level` counter.** `level` starts at `1`, is incremented
   by exactly one per exit-step transition, and is reset to `1` by
   `resetRun()` (R after death) and by `regenerateDungeon()` (N debug regen,
   which already calls `resetRun`). No other path mutates `level`.
4. **`generateDungeon` returns an `exitCell`.** The returned object gains
   one new field:
   ```js
   { map, mapW, mapH, rooms, playerSpawn, enemySpawns, exitCell, seed }
   //                                                 ^^^^^^^^
   ```
   `exitCell` is `{ x: cellX, y: cellY }` (integer cell coords, not floats).
   The cell is interior floor (`map[y][x] === 0`), reachable from the spawn
   cell (the existing BFS already guarantees this for any non-wall cell),
   and is **not** inside the starting room.
5. **Exit-cell selection algorithm.** Among all rooms other than `startIdx`,
   pick the room whose center cell has the **largest 4-connected BFS
   distance** from the spawn cell `(psCellX, psCellY)`. Tiebreak by smaller
   room index (i.e., earlier in the carve order) for determinism. The exit
   cell is that room's center cell, computed the same way the start room
   center is (`room.x + ((room.w / 2) | 0)`,
   `room.y + ((room.h / 2) | 0)`). The existing connectivity-check BFS at
   lines ~727-751 may be extended in-place to also fill a `dist` array
   (replace the boolean `visited` with an integer-distance array, `-1` for
   unvisited) so no second BFS is added.
6. **`applyDungeon` stores the exit cell.** A new module-scope binding,
   `let EXIT = { cellX: 0, cellY: 0 };` (declared near the existing
   `PLAYER_SPAWN` line), is updated by `applyDungeon`:
   ```js
   EXIT = { cellX: d.exitCell.x, cellY: d.exitCell.y };
   ```
   No other code mutates `EXIT`.
7. **Auto-step transition.** At the end of `update(dt)` (after
   `applyContactDamage(dt)`), check whether the player is standing on the
   exit cell:
   ```js
   if (player.hp > 0 &&
       Math.floor(player.x) === EXIT.cellX &&
       Math.floor(player.y) === EXIT.cellY) {
     advanceLevel();
   }
   ```
   The `player.hp > 0` guard prevents triggering during the death freeze
   (which already early-returns at the top of `update`, but the explicit
   guard documents intent and is robust to ordering changes).
8. **`advanceLevel()` semantics.** This new helper:
   - Picks a fresh random seed via `pickRandomSeed()` (does **not** reuse
     the URL `?seed` — that param only pins the initial map per existing
     behavior). Logs the seed via the existing `console.info('[seed] ' + seed)`
     pattern so bug reports keep working across level transitions.
   - Calls `applyDungeon(generateDungeon(seed))`.
   - Increments `level` by 1.
   - Snaps the player to the new dungeon's `PLAYER_SPAWN` (x, y, dirX,
     dirY, planeX, planeY) — uses the same six lines as `resetRun()`.
   - Rebuilds `enemies` from the new `enemySpawns`
     (`enemies = enemySpawns.map(s => makeEnemy(s.x, s.y, s.type));`).
   - Calls `clearTransientFeedback()` (see AC 9) to flush leftover flashes
     / pops / arrows / timers from the previous level.
   - Plays `sfxLevelExit()` exactly once.
   - Triggers a "LEVEL N" banner for 1.2 s (see AC 11).
   - Does **not** touch `player.hp`, `ammo`, or any field on `stats`.
     `lastFireTime` is left as-is so a player who fired right before
     stepping in still observes their normal cooldown.
9. **`clearTransientFeedback()` extracted helper.** The transient-state
   reset block currently inlined in `resetRun` (lines ~570-582:
   `lastFireTime`, `muzzleFlashUntil`, `hitTintUntil`, `nextContactHurtMs`,
   `dmgFlashUntil`, `dmgFlashAt`, `nextDmgFlashMs`, `dmgArrow`,
   `killPops.length = 0`, `mouseDx = 0`, and the `keys` clear loop) is
   extracted into a function `clearTransientFeedback()` and called from
   both `resetRun()` and `advanceLevel()`. **Exception:** `lastFireTime`
   is reset only by `resetRun()`, not by `advanceLevel()` (so cooldown
   carries across levels along with HP/ammo). Easiest split: keep
   `lastFireTime = -Infinity` inline in `resetRun()`, move the rest into
   `clearTransientFeedback()`. No behavior change for the existing R / N
   paths — the same fields end up cleared.
10. **`resetRun()` resets `level` to 1.** Add `level = 1;` somewhere in
    `resetRun()`. This ensures both R-restart (after death) and
    N-regenerate (which calls `resetRun` via `regenerateDungeon`) put the
    HUD back to `LEVEL 1`.
11. **"LEVEL N" banner.** A centered, transient overlay rendered after
    `drawHUD()` and before the death overlay:
    ```
    LEVEL N
    ```
    Drawn via `ctx.fillText` in 16-20 px monospace, white on a translucent
    black backdrop strip (~28 px tall, full-width) at roughly `y = H * 0.35`.
    Active for 1.2 s from the trigger `nowMs`; alpha fades linearly from
    1.0 to 0 over the last 0.4 s of that window. State lives in two new
    module-scope variables alongside the existing feedback timers
    (`let levelBannerAtMs = 0; let levelBannerUntilMs = 0;`). Both are
    reset to 0 by `clearTransientFeedback()` (so a level-2 banner doesn't
    bleed past an immediate R during its display).
12. **`sfxLevelExit()` SFX.** A new helper next to the existing `sfx*`
    block (after `sfxGruntWindup`). Suggested shape (mirroring the
    `blip`-wrapper style at lines 182-186):
    ```js
    function sfxLevelExit() {
      blip({ type: 'sine', freq: 220, endFreq: 880, dur: 0.28,
             attack: 0.005, decay: 0.27, peak: 0.55 });
    }
    ```
    Numbers may be tweaked for taste; character must be preserved (a
    short upward sine sweep, ~250-300 ms, peak ≤ 0.6, single oscillator).
    Not affected by `distanceVolume` — it is a player-action SFX, played
    at full volume like `sfxHurt` / `sfxKill`.
13. **HUD level readout.** `drawHUD()` gains a "LEVEL N" readout. Place
    it inside the existing bottom HUD strip, between the centered AMMO
    readout and the right-aligned KILLS readout. Concretely: drop AMMO
    from `textAlign = 'center'` at `W >> 1` to a left-of-center anchor at
    `(W >> 2)` with `textAlign = 'center'`, add LEVEL centered at `W >> 1`,
    keep KILLS right-aligned at `W - 4`. Pick spacing that keeps the four
    fields readable at the existing 12 px monospace size; if the layout
    feels cramped, the implementing agent may instead place LEVEL at the
    top-left under the FPS counter (e.g., a 16-px-tall strip at
    `y = 18`) — either layout is acceptable as long as `LEVEL ` plus the
    integer is visible at all times during play. Minimum readable color
    is `#fff` over a translucent backdrop.
14. **Minimap exit cell.** `drawMinimap()` paints the exit cell with a
    distinct color (`#3f3` or similar bright green) when it is inside the
    visible window (`startX..endX`, `startY..endY`). The exit-cell paint
    happens **after** the wall-cell loop and **before** the enemy-dot loop
    so enemy dots and the player triangle still draw on top if a live
    enemy or the player is standing on the exit cell. Drawing is skipped
    when the cell is outside the visible window — no work for far levels.
15. **Exit pillar billboard in-world.** The exit cell is rendered as a
    glowing vertical pillar sprite, projected through the existing wall
    z-buffer so walls correctly occlude it. Two implementation paths are
    acceptable; pick one:
    1. Add a new sprite frame array `SPRITES.exit` (built via the existing
       `buildFrame` + a fresh palette). Inside `drawSprites`, after the
       enemy push loop, push a synthetic entry
       `{ e: { x: EXIT.cellX + 0.5, y: EXIT.cellY + 0.5, type: 'exit',
       animPhase: 0, hitFlashUntil: 0, mode: 'idle' }, dx, dy, d2, id: -1 }`.
       The existing `flash`/`tint` branches both evaluate to false for
       this synthetic entity, so the regular shaded path runs. **Critical:**
       the `id: -1` ensures stable sort against enemies in the (rare) tie
       case.
    2. Add a dedicated `drawExitPillar()` invoked between the wall loop
       and `drawSprites()` (or after, but before `putImageData`). It does
       the same camera math as `drawSprites` for one entity and runs the
       same per-column z-test loop against `zBuffer`. Less reuse but
       fewer surprises.

    Pillar appearance (either approach):
    - Roughly cell-tall (full vertical extent) and ~1/3 cell wide.
    - Bright cyan-green glow (e.g. core `#7fffaa`, edge `#3f8866`,
      highlight cap `#dfffea`); transparent surround.
    - Static silhouette is sufficient. Animation/pulse is not required;
      if added, keep it to a 2-frame alpha modulation under `nowMs`-
      derived phase, no per-frame allocations, no extra `getContext`.
16. **No collision change at the exit cell.** The exit cell remains
    `MAP[y][x] === 0`, so `isWall` returns `false` and movement proceeds
    normally. `castColumn`, `castRay`, and `enemyCanSeePlayer` are
    untouched. Enemies may walk through the exit cell freely; the pillar
    sprite is a visual marker only and does **not** block bullets or
    enemy LOS.
17. **No new console errors or warnings** during a 60-second session that
    covers: spawning into a fresh world (level 1 banner does **not**
    flash), walking to the exit on level 1, observing the LEVEL 2 banner
    + SFX, walking to the level-2 exit, dying mid-level then pressing R
    (HUD returns to LEVEL 1, banner does not flash), pressing N
    mid-level (HUD returns to LEVEL 1, banner does not flash, fresh
    seed logged), getting shot at the moment of transition (the dmgArrow
    from the previous level does **not** persist — `clearTransientFeedback`
    handles it), and standing on the exit cell after death (no transition
    occurs — the `player.hp > 0` guard).
18. **Performance.** With all initial enemies alive and the pillar
    visible, the existing ≥ 30 FPS target still holds. The pillar adds
    at most one extra projected sprite per frame (similar work to one
    enemy). No per-pixel work, no shadow blurs, no extra `getContext`.
    The exit-step check inside `update` is a constant-time Math.floor +
    two integer compares.
19. **R-restart and N-regenerate clear all new state.** After R, `level`
    is `1`, `levelBannerUntilMs` is `0`, and the next exit step still
    triggers a fresh banner + SFX. Same for N. No state introduced by
    this spec persists across R / N.

## Out of Scope

- Per-level enemy difficulty scaling (more enemies, harder types,
  tighter cadence). That is a separate Bayesian-adaptive spec.
- Per-level theming (different wall palettes, ceiling colors, music).
- A win condition or final boss. Levels are infinite.
- A level-cap, leaderboard, or persistent high-score (no
  `localStorage` per single-file constraint).
- Pickups (health, ammo, weapons) at the exit or anywhere in the
  dungeon. Separate spec.
- Multiple exits per dungeon, branching paths, or hidden secret rooms.
- Any change to `castColumn` / `castRay` / `enemyCanSeePlayer` or the
  raycaster floor pass.
- Per-level seeding via URL (`?seed=` still seeds the **initial**
  dungeon only; transitions always pick fresh seeds).
- Restoring HP / ammo on transition (carry forward as-is — see AC 8).
- Stereo / spatial audio for the exit chime.
- HUD compass arrow pointing toward the exit. The minimap is the
  existing wayfinding aid.
- Anything Bayesian or adaptive.

## Design Notes

- **Files involved:** `index.html` only.

- **Hook points (line numbers reflect current state of the file, expect
  small drift after edits):**
  - `generateDungeon` at `index.html:617-788`: extend the existing
    connectivity BFS at lines ~727-751 to compute a `dist` array (replace
    `visited` with an integer-distance array), then pick the
    farthest-by-BFS non-start room and stash its center as
    `exitCell: { x, y }` in the returned object. Place the addition
    between the connectivity check (~line 751) and the enemy-spawn loop
    (~line 756).
  - `applyDungeon` at `index.html:790-796`: add `EXIT = { cellX:
    d.exitCell.x, cellY: d.exitCell.y };`.
  - `resetRun` at `index.html:560-583`: extract the transient-state
    block into `clearTransientFeedback()` (everything from
    `muzzleFlashUntil = 0;` through the `keys` clear loop, **except**
    `lastFireTime`), call it from `resetRun`, set `level = 1;`.
  - `update(dt)` at `index.html:308-351`: append the exit-step check at
    the very end (after `applyContactDamage(dt)`).
  - `drawHUD()` at `index.html:1331-1364`: add the LEVEL readout.
  - `drawMinimap()` at `index.html:1376-1446`: paint the exit cell after
    the wall loop, before the enemy-dot loop.
  - `drawSprites()` at `index.html:1454-1535` **or** a sibling
    `drawExitPillar()`: render the pillar (see AC 15).
  - `render()` at `index.html:1136-1224`: add the LEVEL banner overlay
    after `drawHUD()` and before the death overlay (so banner sits
    under "YOU DIED" if both are active simultaneously).
  - SFX block at `index.html:182-211`: add `sfxLevelExit()` after
    `sfxGruntWindup`.

- **Sketch of the exit-step check:**
  ```js
  // end of update(dt)
  if (player.hp > 0) {
    const cx = Math.floor(player.x);
    const cy = Math.floor(player.y);
    if (cx === EXIT.cellX && cy === EXIT.cellY) {
      advanceLevel();
    }
  }
  ```

- **Sketch of `advanceLevel()`:**
  ```js
  function advanceLevel() {
    const seed = pickRandomSeed();
    console.info('[seed] ' + seed);
    applyDungeon(generateDungeon(seed));
    level += 1;
    enemies = enemySpawns.map(s => makeEnemy(s.x, s.y, s.type));
    player.x = PLAYER_SPAWN.x;
    player.y = PLAYER_SPAWN.y;
    player.dirX = PLAYER_SPAWN.dirX;
    player.dirY = PLAYER_SPAWN.dirY;
    player.planeX = PLAYER_SPAWN.planeX;
    player.planeY = PLAYER_SPAWN.planeY;
    clearTransientFeedback();
    sfxLevelExit();
    levelBannerAtMs = nowMs;
    levelBannerUntilMs = nowMs + 1200;
  }
  ```
  Note: `player.hp` and `ammo` are intentionally *not* in this list.

- **BFS distance extension** (sketch — existing block lines ~727-751):
  ```js
  // Replace `visited[ny][nx] = true` flow with an integer dist array,
  // -1 for unvisited.
  const dist = new Array(H);
  for (let y = 0; y < H; y++) dist[y] = new Array(W).fill(-1);
  dist[psCellY][psCellX] = 0;
  const queue = [[psCellX, psCellY]];
  let head = 0, visitedCount = 1, totalFloor = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) if (map[y][x] === 0) totalFloor++;
  }
  while (head < queue.length) {
    const c = queue[head++];
    const cx = c[0], cy = c[1];
    for (let n = 0; n < 4; n++) {
      const nx = cx + dxs[n], ny = cy + dys[n];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (dist[ny][nx] !== -1) continue;
      if (map[ny][nx] !== 0) continue;
      dist[ny][nx] = dist[cy][cx] + 1;
      visitedCount++;
      queue.push([nx, ny]);
    }
  }
  if (visitedCount !== totalFloor) continue;

  // Pick the farthest non-start room by BFS distance to its center.
  let bestRoom = -1, bestD = -1;
  for (let i = 0; i < rooms.length; i++) {
    if (i === startIdx) continue;
    const r = rooms[i];
    const rx = r.x + ((r.w / 2) | 0);
    const ry = r.y + ((r.h / 2) | 0);
    const d = dist[ry][rx];
    if (d > bestD) { bestD = d; bestRoom = i; }
  }
  // bestRoom can't stay -1: TARGET_MIN >= 6 rooms and BFS already
  // confirmed full connectivity, so every non-start room is reachable.
  const er = rooms[bestRoom];
  const exitCell = { x: er.x + ((er.w / 2) | 0), y: er.y + ((er.h / 2) | 0) };
  ```

- **Pillar palette (option 1, sprite path):**
  ```js
  const exitPalette = {
    'C': rgba32(127, 255, 170), // bright glow core
    'c': rgba32( 63, 136, 102), // edge
    'h': rgba32(223, 255, 234), // top highlight cap
  };
  // 16x16 frame: column ~5px wide, full-height, with a 1-row cap on top.
  // Empty cells = transparent.
  const exitFrame = buildFrame([
    /* 16 rows of dots/pillars; transparent surround. Implementing
       agent designs the exact rows — keep core column 5-6 px wide
       and full vertical extent for clear visibility. */
  ], exitPalette);
  SPRITES.exit = [exitFrame, exitFrame]; // single-frame, but 2-entry to
                                         // match the enemy-shape contract
                                         // (`frames[(animPhase|0) & 1]`)
  ```

- **Layout note on the bottom HUD strip.** Today it has three fields
  (HP / AMMO / KILLS). With LEVEL added, the four fields share 480 px
  at 12 px monospace (~7 px per char). Anchors that keep them readable:
  - HP: left at `x = 4`, `textAlign = 'left'`
  - AMMO: centered at `x = W * 0.40`, `textAlign = 'center'`
  - LEVEL: centered at `x = W * 0.65`, `textAlign = 'center'`
  - KILLS: right at `x = W - 4`, `textAlign = 'right'`
  Or fall back to the top-left option in AC 13 if this feels cramped.

- **Banner draw sketch:**
  ```js
  if (nowMs < levelBannerUntilMs) {
    const elapsed = nowMs - levelBannerAtMs;
    const fadeStart = (levelBannerUntilMs - levelBannerAtMs) - 400;
    const a = elapsed < fadeStart
      ? 1
      : Math.max(0, 1 - (elapsed - fadeStart) / 400);
    ctx.fillStyle = `rgba(0,0,0,${(a * 0.55).toFixed(3)})`;
    ctx.fillRect(0, (H * 0.32) | 0, W, 28);
    ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
    ctx.font = '18px monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText('LEVEL ' + level, W >> 1, ((H * 0.32) | 0) + 14);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  }
  ```
  Restore the default `textAlign` / `textBaseline` so downstream HUD
  drawing is unaffected.

## Agent Notes

- **Read first:** `AGENTS.md`, `CLAUDE.md`, this spec, then the
  procedural-dungeon block in `index.html` (lines ~585-813), the sprite
  pipeline (`drawSprites` at 1454+), the minimap (1370+), `drawHUD`
  (1331+), and `update` (308+). Make all edits inside the assigned
  worktree only.

- **Order of work (recommended):**
  1. Add `let level = 1;` at module scope near the existing `let ammo`
     declaration. Add `let levelBannerAtMs = 0; let levelBannerUntilMs = 0;`
     alongside the existing `dmgFlash*` timers.
  2. Add `let EXIT = { cellX: 0, cellY: 0 };` near `let PLAYER_SPAWN`.
  3. Add `sfxLevelExit()` after `sfxGruntWindup`.
  4. Build the exit-pillar sprite (`buildFrame` + palette) and append it
     to `SPRITES` (or define a sibling const if going the
     `drawExitPillar()` route).
  5. Edit `generateDungeon` to compute `dist` and pick `exitCell` (see
     BFS sketch). Add `exitCell` to the returned object.
  6. Edit `applyDungeon` to assign `EXIT`.
  7. Extract `clearTransientFeedback()` from `resetRun`. Add `level = 1;`
     to `resetRun`.
  8. Add `advanceLevel()` (see sketch).
  9. Append the exit-step check to `update(dt)`.
  10. Edit `drawHUD()` to add the LEVEL field.
  11. Edit `drawMinimap()` to paint the exit cell.
  12. Edit `drawSprites()` (or add `drawExitPillar()`) to render the
      pillar.
  13. Edit `render()` to draw the LEVEL banner.
  14. Run `node --check` against the extracted `<script>` body.
  15. Smoke-test in the browser.

- **Common pitfalls:**
  - **Modifying `stats` schema.** The Bayesian-skill / adaptive-spawning
    spec contracts depend on `stats` field names. Put the level counter
    at module scope, not inside `stats`. If you find yourself typing
    `stats.level`, stop and use the bare `level` variable instead.
  - **Resetting HP/ammo on `advanceLevel`.** The whole point of the
    transition is that HP/ammo carry forward. Don't copy-paste from
    `resetRun` — call `clearTransientFeedback` for the timers/flashes,
    then snap the player to the new spawn pose, and stop. Don't touch
    `player.hp`, `ammo`, or `stats.*`.
  - **Forgetting to reset `level` on R/N.** `resetRun` must set
    `level = 1`. `regenerateDungeon` already calls `resetRun`, so it
    inherits this for free — verify by pressing N mid-level-3 and
    confirming the HUD goes back to `LEVEL 1` and the next exit shows
    a `LEVEL 2` banner, not `LEVEL 4`.
  - **Triggering the transition during the death freeze.** `update`
    already early-returns when `player.hp <= 0`, but the explicit
    `player.hp > 0` guard in the exit-step check defends against future
    refactors that might move the death return.
  - **Re-triggering the transition every frame.** The transition snaps
    the player to a new room's `PLAYER_SPAWN`, which is the start
    room — not the exit room. So after `advanceLevel()` the player is
    no longer on the exit cell, and the next-frame check naturally
    fails. Don't add a "just-advanced" debounce — it's unnecessary
    and would mask a real bug if a future change kept the player in
    place.
  - **Pillar sprite z-fighting walls.** The pillar is on a floor cell,
    not inside a wall; its `dx, dy` from the player produces a
    `transformY` that is strictly less than the wall `perpWallDist` for
    every column it covers (the wall is at the cell boundary, the
    pillar at the cell center). The existing
    `if (transformY >= zBuffer[stripe]) continue;` test handles
    occlusion correctly. **However**, if you go the route of pushing a
    synthetic entity into `spriteOrder`, make sure the `o.e.hitFlashUntil`,
    `o.e.fireFlashUntil`, and `o.e.mode` fields are present (default
    values are fine) so the `flash` / `tint` reads don't `undefined`-
    crash.
  - **Banner timer not cleared on R.** If the player dies mid-banner
    and presses R, the banner keeps fading. Reset both timer fields
    to 0 inside `clearTransientFeedback` so R / N flush them.
  - **Minimap exit cell drawn under enemy dots vs. over walls.** The
    spec is explicit: paint after walls, before enemy dots / player
    triangle. Walls **of** the exit cell don't exist (it's floor), so
    the wall pass simply skips it; the exit-cell paint then fills the
    floor pixel that the wall pass left as the transparent backdrop.
  - **Picking the exit room by Euclidean distance.** Two rooms close
    in Euclidean distance can be a long corridor walk apart. BFS
    distance reflects walking distance and avoids "the exit is right
    behind a wall" UX. Use the BFS dist field, not `Math.hypot`.
  - **`?seed=<u32>` reuse on transition.** That parameter only seeds
    the initial dungeon. Calling `parseSeedFromUrl()` from
    `advanceLevel` would pin every level to the same map — wrong.
    `advanceLevel` always uses `pickRandomSeed()`.
  - **Exit cell falling on the start room.** The selection loop
    excludes `startIdx`; double-check this `if (i === startIdx)
    continue;` branch is present, otherwise the exit can spawn under
    the player and immediately fire on level 1.
  - **`MAX_ENEMIES` cap interaction.** Enemy placement is capped at
    36; nothing about exit-cell placement changes that. If an exit
    cell happens to coincide with an enemy spawn cell, that's fine —
    the player will fight past the guard and the exit pillar still
    renders.

- **Smoke test before reporting:**
  - Serve with `python3 -m http.server` and open in a browser.
  - Confirm HUD reads `LEVEL 1` from the first frame; no banner
    flashes.
  - Walk on the minimap toward the green exit tile (use the minimap
    to navigate — that's the design intent). Confirm the in-world
    pillar comes into view as a glowing column at the exit cell
    center, occluded properly by walls between you and it.
  - Step onto the exit cell. Confirm: `LEVEL 2` banner fades over
    ~1.2 s, `sfxLevelExit` plays once, the world is a different
    layout (different seed logged in console), HP and ammo are
    unchanged from before the step.
  - Take damage on level 2 → see the dmg vignette / arrow as before.
    Walk to the level-2 exit; confirm the banner shows `LEVEL 3`.
  - Die on level 3 (let an enemy kill you). Press R. Confirm: HUD
    reads `LEVEL 1`, no banner flashes on respawn, the world is the
    level-1 dungeon (re-using the original seed — `resetRun` does
    not regenerate), HP and ammo back to max.
  - Mid-run on level 2, press N. Confirm: HUD goes to `LEVEL 1`, no
    banner flashes, fresh seed in console, HP/ammo back to max.
  - Stand on the exit cell with HP at 0 (let an enemy kill you while
    on the cell — admittedly hard to engineer; alternatively
    momentarily set `player.hp = 0` in DevTools). Confirm no
    transition fires.
  - Camp far from the pillar; confirm no audio leak, no per-frame
    cost spike (FPS counter steady).
  - Get hit by an enemy on the same frame you step onto the exit.
    Confirm the dmgArrow is cleared by the transition (no leftover
    arrow pointing at a now-despawned enemy).
  - DevTools console: no new errors or warnings. Two `[seed]` lines
    per transition is expected (one for the dungeon you arrived at,
    none for the one you left — only the new seed gets logged).

- **At minimum** run `node --check` against the extracted `<script>`
  body before reporting (`grep -oP '(?s)(?<=<script>).*?(?=</script>)'
  index.html > /tmp/script.js && node --check /tmp/script.js`).

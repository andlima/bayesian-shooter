---
id: procedural-dungeon
area: frontend
priority: 80
depends_on: []
description: Procedurally generated rooms-and-corridors map with random enemy spawns, seedable PRNG, and N-to-regenerate
---

# Procedural Dungeon — Random Maps with Random Enemies

## Goal

Replace the hand-authored 16×16 `MAP` and the hard-coded `INITIAL_ENEMIES` list with a procedurally generated rooms-and-corridors dungeon and procedural enemy placement, in the spirit of the `dungeon-gen` spec used in `~/code/silly-game`. Each page load (and each press of a new `N` key) carves a fresh, larger map, spawns the player in a random room, and scatters 1–3 enemies in every other room. Generation must be reproducible: `?seed=N` in the URL pins the layout for bug reports. All other game systems (raycaster, sprites, AI, weapon, HUD, audio, minimap) must keep working unchanged after the swap.

## Acceptance Criteria

1. **Single file unchanged.** The game is still one self-contained `index.html` at the repo root with no `package.json`, no external asset files, no network requests, and no build step. Total file size remains comfortably under ~55 KB.
2. **Procedural map replaces the hard-coded one.** The literal `const MAP = [[…]]` at `index.html:83-101` is gone. The map is now built at startup by a generator function and stored in a mutable `MAP` (with `MAP_W` / `MAP_H` derived from it). The map grid is **48×48 cells** (a single chosen size in the 40–60 range, documented in a comment).
3. **Rooms-and-corridors algorithm.** Generation:
   - Starts from an all-walls grid.
   - Carves **6–12 axis-aligned rectangular rooms** with inner floor area between **4×4 and 8×8** cells.
   - Rooms do not overlap and keep at least a **1-cell wall buffer** between each other and from the outer boundary.
   - Connects every room with **L-shaped corridors** (HV or VH between room centers, 1 cell wide) so that the resulting floor graph is a single connected component.
4. **Connectivity is guaranteed.** A BFS from the player spawn cell reaches every floor cell on the map. If a candidate map fails connectivity, the generator retries (capped retry count); the game must always boot to a valid map — never an exception, never an unreachable room.
5. **Two wall types remain.** Walls are still drawn from `1` (brick / red) and `2` (stone / blue). The generator must produce both types within every generated map (e.g., per-region or weighted-random per cell), so the visual variety established in `raycaster-mvp` is preserved. A map of all-`1` or all-`2` walls is **not** acceptable.
6. **Random player spawn.** The player spawns at the center of one randomly chosen room (coordinates `roomCenter + (0.5, 0.5)`), facing a random cardinal direction (`dirX`/`dirY` axis-aligned, with `planeX`/`planeY` perpendicular to it, magnitude ≈ 0.66). The chosen room is the **starting room**.
7. **Random enemy spawns.** Every room **except the starting room** receives **1–3 enemies**, placed at random interior floor cells of that room (each enemy at a distinct cell, offset to cell-center). Each enemy's `type` is chosen randomly between `imp` and `grunt` from the existing `TYPE_TABLE`. No enemy is placed inside a wall or on top of another enemy. A room with too few interior cells silently gets fewer enemies (down to 0 in the degenerate case).
8. **Seedable PRNG.** All randomness in generation and enemy placement is driven by a single seedable PRNG (e.g., mulberry32). The seed is determined by:
   - `?seed=<unsigned 32-bit integer>` in the URL (decimal), if present and parseable;
   - otherwise `Math.floor(Math.random() * 0x100000000)`.
   The chosen seed is **logged once** to `console.info` (e.g., `[seed] 1234567890`) so it can be re-used in a bug report. Reloading the page with the same `?seed=` produces an identical map and identical enemy layout.
9. **`N` regenerates.** Pressing `N` (edge-triggered, like Space) generates a brand-new map with a fresh random seed, resets the player to a new spawn, rebuilds the enemy list, and resets the run state (HP, ammo, kill count, fire/contact timers, hit/muzzle flashes, mouseDx, key state) to match what `resetRun()` already does on death. The new seed is logged to `console.info` on each regen. The HUD, minimap, and AI immediately reflect the new map without restart.
10. **`R`-to-restart preserves the current map.** The existing on-death restart (`R`) keeps the same map and the same seed; only the player and enemies are reset. This makes `?seed=N` reproducible across deaths.
11. **All existing systems keep working.** After the swap:
    - Raycasting renders the new map correctly (no out-of-bounds, no fish-eye artifacts).
    - The minimap (`drawMinimap`) draws the new walls and live enemy dots correctly; the player-centered viewport already handles arbitrary `MAP_W`/`MAP_H`.
    - Enemy AI LOS DDA, chase/wind/cool state machine, hitscan firing, and hit-detection still work — including the `MAP_W + MAP_H + 4` DDA safety bound, which must use the **current** dimensions after regen.
    - The HUD, audio, pointer-lock, mouse-look, WASD movement, collision, FPS counter, and weapon all behave as before.
12. **No console errors.** A 60-second play session that includes (a) walking around, (b) shooting and killing enemies, (c) dying and pressing `R`, and (d) pressing `N` twice produces no uncaught exceptions or console errors. The single `[seed] …` line per generation is the only new console output.

## Out of Scope

- Multiple themed levels, stairs, or level-transition tiles (single map per run is the scope).
- Door tiles, secret tiles, breakable walls, or any new tile types beyond `0`/`1`/`2`.
- Non-rectangular rooms (cellular automata caves, BSP halls, etc.) — keep it rectangular rooms with L-corridors.
- New enemy types, weapon changes, or pickups.
- Balance tuning (room count distribution, enemy density curves, difficulty scaling). A follow-up spec owns balance — this spec ships the system.
- Mobile/touch controls, pause/menu UI.
- Persisting seeds across reloads (beyond honoring `?seed=`), high-score tracking, or anything Bayesian/adaptive.

## Design Notes

- **Where to put the generator.** Add a `generateDungeon(seed)` function inside the existing IIFE in `index.html`, alongside the existing helpers. Keep it pure-ish: it returns `{ map, mapW, mapH, rooms, playerSpawn, enemySpawns, seed }`. Module/file boundaries are not allowed — single file remains a hard requirement (see CLAUDE.md / AGENTS.md).
- **Mutable map binding.** Convert `const MAP`, `const MAP_W`, `const MAP_H` (currently at `index.html:84-103`) to `let` (or to a module-level `world` object holding all three). Re-assign them in `applyDungeon(d)` whenever `generateDungeon` runs. Make sure every reader (DDA in `castRay` / `enemyCanSeePlayer`, the `isWall` helper, `drawMinimap`, etc.) reads through the live binding rather than a captured snapshot.
- **PRNG.** A 4-line `mulberry32(seed)` is sufficient. Wire **all** randomness in generation and spawn placement through it; do not mix `Math.random()` into the generator (animation jitter elsewhere can keep using `Math.random`).
- **Seed parsing.** `new URL(window.location.href).searchParams.get('seed')` → `Number.parseInt(…, 10)`; reject `NaN` and negative; clamp to `0..0xFFFFFFFF`. On rejection or absence, fall back to `Math.random`-derived seed.
- **Room placement.** A "place attempts then accept" loop is fine: pick `~40` candidate rectangles with random width/height in `[4,8]` and random top-left, accept the first non-overlapping (1-tile buffer) ones until you have 6–12 rooms or attempts run out. Lower bound (6) must be met; if not, retry with a fresh local seed expansion or accept a smaller count down to 4 — but never ship a degenerate map.
- **Connecting rooms.** Sort rooms by carve order; for each pair `(rooms[i-1], rooms[i])`, carve an L-corridor between centers (random HV/VH choice). This guarantees connectivity by construction; the BFS check from criterion 4 is a defensive sanity test, not a load-bearing connector.
- **Wall type assignment.** Simple option: assign a per-cell wall type via the seeded RNG with weighted probability (e.g., 70% brick, 30% stone). Slightly more interesting: pick a per-room "theme" wall type for the wall ring around each room and use the alternate type for corridor walls. Either is acceptable as long as both types are present.
- **Enemy spawn cells.** For each non-starting room, build the list of interior floor cells (post-carve), shuffle with the seeded PRNG, take the first `1 + floor(rand()*3)` cells, and emit `{ x: cell.x + 0.5, y: cell.y + 0.5, type: rand() < 0.5 ? 'imp' : 'grunt' }` for each. Cap total enemies at, say, 36 to prevent pathological cases.
- **Reset semantics.** Refactor `resetRun()` to rebuild `enemies` from a current `enemySpawns` array (set by `applyDungeon`) rather than from the deleted `INITIAL_ENEMIES` constant. Add a sibling `regenerateDungeon()` that picks a new seed, runs `generateDungeon`, calls `applyDungeon`, then calls `resetRun`.
- **`N` key plumbing.** Add `'KeyN'` to the existing edge-triggered `keydown` block (the same block that handles `'Space'` and `'KeyR'` near `index.html:201-220`). Treat it as edge-triggered (use the `wasDown` guard) so holding `N` doesn't regenerate every frame. Add `'KeyN'` to `blockedKeys` if it would otherwise trigger browser shortcuts.
- **DDA safety bound.** The line `let safety = MAP_W + MAP_H + 4;` (used in both `castRay` and `enemyCanSeePlayer`) must read the live, post-regen `MAP_W`/`MAP_H`. With a 48×48 map this becomes 100, well within reasonable per-frame work for 480 columns.
- **Minimap.** No changes needed beyond reading the live map binding. The 12-cell viewport is already player-centered, and the existing clip-to-rect logic handles arbitrary world sizes.
- **Hint string.** Update the bottom-left hint div to include `· N to regenerate` so the new control is discoverable.

## Agent Notes

- **Read first:** `AGENTS.md`, `CLAUDE.md`, this spec, then the current `index.html` end-to-end (it's ~1175 lines). The "worktree-only editing rule" is non-negotiable — make all changes inside the assigned worktree.
- **Reference:** the silly-game spec at `~/code/silly-game/specs/dungeon-gen.md` is the canonical inspiration for the rooms-and-corridors algorithm, but do **not** copy code from there — it's a top-down 2D grid game, not a raycaster, and its module structure does not apply here. Match the *idea*, not the implementation.
- **Order of work:**
  1. Add the `mulberry32` PRNG and `seed` parsing/logging.
  2. Implement `generateDungeon(seed)` returning `{ map, mapW, mapH, rooms, playerSpawn, enemySpawns, seed }`. Build it standalone first; verify in the browser console (e.g., `console.log(generateDungeon(1))`) that it returns sane shapes before wiring it in.
  3. Convert `MAP`, `MAP_W`, `MAP_H`, `PLAYER_SPAWN`, `INITIAL_ENEMIES` to mutable bindings driven by `applyDungeon(d)`.
  4. Refactor `resetRun()` to rebuild enemies from the live `enemySpawns`.
  5. Add `regenerateDungeon()` and the `N` keybinding.
  6. Update the hint string.
  7. Smoke test (see below).
- **Smoke test before reporting:**
  - Serve with `python3 -m http.server` and open in a browser if available.
  - Verify: walls render, both colors present, player spawns inside a room with line-of-sight to corridors, enemies appear on the minimap as red dots inside rooms, shooting still kills, dying and pressing `R` keeps the same map, pressing `N` produces a visibly different map and a new `[seed] …` console line, `?seed=42` produces the same map and enemy layout twice.
  - At minimum: extract the inline `<script>` and run `node --check` to catch syntax errors.
- **Common pitfalls:**
  - **Captured `MAP` references.** If any function closed over the old `const MAP`, it'll keep reading the old grid after regen. Read through the live `let MAP` everywhere.
  - **DDA safety bound.** A static safety like `let safety = 36` (assuming the old 16×16 map) will silently fail on 48×48. The expression `MAP_W + MAP_H + 4` must be evaluated at call time, not pre-computed at module init.
  - **Enemy collision/separation.** The O(N²) enemy separation pass is fine for 36 enemies but make sure dead enemies don't stay in the array forever — the existing code already gates on `e.alive`, so just confirm.
  - **Spawning inside walls.** Always use cell-center offsets (`x + 0.5`, `y + 0.5`). Never pick an enemy spawn cell where `map[y][x] !== 0`.
  - **Connectivity false-negative.** Diagonals don't count for raycaster movement (player has a 0.2 collision radius and resolves axis-by-axis). Use 4-connected BFS for the connectivity check.
  - **`?seed=` parsing.** `parseInt('0', 10)` is `0` which is a valid seed — don't treat falsy as missing. Use `Number.isFinite` and explicit range checks.
  - **`N` and pointer lock.** The existing `blockedKeys` set covers movement keys; adding `KeyN` to it prevents browser default behavior while pointer-locked. Don't accidentally `preventDefault` keys you didn't add.
  - **Console noise.** Log the seed exactly once per generation (initial + each `N` press). Do not log on every frame, every enemy spawn, or inside the BFS.
- **Do not** add a `package.json`, a build config, a sibling `.txt` map file, or any external asset. Single file. No exceptions.

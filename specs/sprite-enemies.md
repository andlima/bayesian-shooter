---
id: sprite-enemies
area: frontend
priority: 90
depends_on: [raycaster-mvp]
description: Billboard sprite enemies rendered with z-buffer occlusion, plus a minimal AI tick
---

# Sprite Enemies — See Things in the World

## Goal

Populate the existing raycaster world with a small number of billboard sprite enemies that render correctly in front of and behind walls. This spec adds visible, lightly-animated targets but **no shooting** — the player can walk around them, occlude them with corners, and watch them react to being approached. It also establishes the entity data model, sprite renderer, and per-enemy state that the hitscan-weapon spec will hook into.

## Acceptance Criteria

1. The game still runs as a single self-contained `index.html` at the repo root with no build step, no external assets, and no network requests. (Same constraints as `raycaster-mvp`.)
2. At least **three sprite enemies** are placed in open cells of the existing 16×16 map at startup. Their positions are chosen so the player spawn (≈ 1.5, 8.5) has at least one enemy visible after a short walk and at least one initially hidden behind a wall.
3. Sprites are drawn as **billboards**: each sprite always faces the camera, scales with distance (size ∝ 1/perpDist), and is positioned in screen space using the inverse-camera-matrix transform `[planeX planeY; dirX dirY]^-1 * (sprite - player)`.
4. **Z-buffer occlusion uses the existing `zBuffer`:** per sprite column, only draw pixels whose sprite distance is closer than `zBuffer[screenX]`. Sprites are correctly hidden behind walls, peek out from behind corners, and are clipped column-by-column rather than as a whole.
5. **Multi-sprite ordering:** sprites farther from the player are drawn first so that nearer sprites overdraw farther ones in the same screen column. Use a simple distance-squared sort each frame.
6. Sprites are **procedurally generated** — no external image files. A small per-enemy `sprite()` function (or a 16×16 / 24×24 pixel array baked into JS) produces RGBA pixels with at least one fully transparent color used as a mask. At least two visually distinct enemy types exist (e.g., a red "imp" and a green "grunt") so the renderer is exercised on more than one source pattern.
7. **Enemy state model:** each enemy is an object with at least `{ x, y, type, hp, alive, animPhase }`. `hp` and a `damage(amount)` method are present so the next spec can wire shots to enemies; in this spec damage is never applied, but `alive=false` enemies must be skipped by the renderer and AI.
8. **Minimal AI tick:** each enemy runs a per-frame update that, at minimum, advances `animPhase` (used to choose between two sprite frames at ~4 Hz) and turns enemies that are within ~6 cells of the player to face the player (no movement required this spec). AI runs in `O(N)` per frame; N ≤ 16 is fine to assume.
9. Sprite rendering and AI cost together do not drop the frame rate below the existing **≥ 30 FPS** target during normal play with all initial enemies on screen.
10. No new runtime errors in the browser console for a 60-second session of walking around the map and observing enemies from multiple angles.

## Out of Scope

- Shooting, hitscan, projectiles, weapons, crosshair changes (crosshair already exists in `render()`).
- Enemy movement / pathfinding (only rotation-to-face-player this spec).
- Enemy attacks / damage to the player / player HP.
- HUD elements beyond what `raycaster-mvp` already draws (FPS counter, crosshair).
- Sound effects.
- External image files, texture atlases, or asset loading.
- Multiple maps or enemy spawning logic — enemies are placed by a hard-coded array at startup.
- Any Bayesian / adaptive logic.

## Design Notes

- **Where to read first:** the existing `index.html` (≈ 340 lines). Key symbols already in place:
  - `W`, `H` — internal render resolution (480×270).
  - `buf`, `buf8`, `buf32` — `ImageData` and typed-array views; one `putImageData` per frame.
  - `zBuffer: Float32Array(W)` — already populated by `render()` from `castColumn(x).perpWallDist`.
  - `player.{x,y,dirX,dirY,planeX,planeY}` — camera state.
  - `MAP`, `MAP_W`, `MAP_H`, `isWall(mx,my)` — world geometry.
  - `rgba32(r,g,b)` — packs little-endian RGBA into a Uint32 (R = LSB).
  - `render()` already draws ceiling/floor, walls (populating `zBuffer`), crosshair, and the FPS overlay in that order.
- **Where sprites must render:** after the wall pass populates `zBuffer`, **before** `ctx.putImageData(buf, 0, 0)`. Drawing into `buf32` keeps everything inside the single offscreen-buffer blit and preserves performance.
- **Inverse camera transform:** for a sprite at world (sx, sy) with player at (px, py):
  ```
  dx = sx - px;  dy = sy - py;
  invDet = 1.0 / (planeX * dirY - dirX * planeY);
  transformX = invDet * (dirY * dx - dirX * dy);
  transformY = invDet * (-planeY * dx + planeX * dy);   // depth (perpDist)
  ```
  Skip sprites with `transformY <= 0` (behind camera). Screen X center: `screenX = (W/2) * (1 + transformX / transformY)`. Sprite on-screen height/width: `H / transformY` (square sprites; non-square works too — scale width by an aspect factor).
- **Procedural sprite source:** baking a 24×24 RGBA palette-indexed array per type keeps `index.html` small and avoids texture assets. A trivial sampler `sample(srcX, srcY)` returns either an `rgba32` value or a sentinel `0` for transparent. Two-frame animation is a second baked array per type.
- **Z-buffer test granularity:** test once per *screen* column (not per source-texture column). This is the standard approach and the reason `zBuffer` is a per-screen-column array.
- **Distance sort:** an `Array.prototype.sort` over ≤ 16 entities each frame is negligible. No need for a heap or partial sort.
- **Lighting consistency:** apply the same distance shade ramp (`shade = min(1, 5/(d+0.5))`) used for walls so sprites sit visually inside the world rather than glowing.
- **Suggested entity table** (hard-coded in this spec; adaptive spawning lands much later):
  ```
  enemies = [
    { x: 5.5, y: 4.5, type: 'imp',   hp: 3, alive: true, animPhase: 0 },
    { x: 11.5, y: 11.5, type: 'grunt', hp: 5, alive: true, animPhase: 0 },
    { x: 8.5, y: 9.5, type: 'imp',   hp: 3, alive: true, animPhase: 0 },
  ];
  ```

## Agent Notes

- Read `AGENTS.md` and this spec first. Make all changes inside the assigned worktree only.
- This is a strict extension of `raycaster-mvp` — keep the single-file constraint, the `IIFE` wrapper, and vanilla JS. No modules, no build step, no `package.json`.
- **Do not regress the wall pass.** The `zBuffer` write loop is already correct; do not move sprite drawing before walls or you will lose occlusion.
- **Hot-loop discipline:** the inner sprite-column loop runs at most `H * spriteScreenWidth` writes per sprite. Avoid per-pixel function calls — inline the transparency test and the `buf32[i] = c` write.
- Common pitfalls:
  - **Forgetting `transformY <= 0`:** sprites behind the camera produce mirrored draws across the screen. Skip them.
  - **Using Euclidean distance for the z-test:** the wall `zBuffer` stores *perpendicular* distance. The sprite depth must be `transformY`, which is the same quantity — do not substitute `Math.hypot(dx, dy)`.
  - **Per-pixel `ctx.fillRect` calls:** these will tank the frame rate. Stay inside `buf32`.
  - **Sort instability:** if two enemies have identical distances, a stable sort or a tiebreaker on entity id avoids one-frame z-fighting flickers.
- Add the entity array, sprite sampler(s), AI tick, and sprite renderer in clearly delimited sections of the existing IIFE so the next spec (`hitscan-weapon`) can locate them without re-reading the whole file.
- Smoke-test before reporting:
  - Serve the file locally (`python3 -m http.server`) and walk past each enemy. Confirm: sprites grow as you approach, are clipped behind walls when peeking around corners, and the further sprite is occluded when a closer one lines up in front of it.
  - At minimum, run `node --check` against the extracted `<script>` body to catch syntax errors.
- Leave a one-line comment above the entity array describing the schema; later specs (combat, Bayesian) will extend it with `lastHitTick`, `kills`, etc.

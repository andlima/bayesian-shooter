---
id: raycaster-mvp
area: frontend
priority: 100
depends_on: []
description: Standalone single-file Canvas 2D raycaster with walls and keyboard/mouse movement
---

# Raycaster MVP — Walk Around a Map

## Goal

Bootstrap the game as a single self-contained `index.html` running a Wolfenstein-3D-style raycaster on a 2D canvas. The player can walk around a small static map and look around with the mouse. No enemies, no weapons, no shooting yet — this spec establishes the renderer, input, and movement loop that every later spec builds on.

## Acceptance Criteria

1. The game lives in a single file `index.html` at the repository root. Opening it directly in a modern desktop browser (Chromium-family or Firefox) starts the game with no build step, no `package.json`, no external assets, and no network requests.
2. The viewport renders a first-person view of a small grid map (recommended 16×16 cells) containing at least **two visually distinct wall types** (different colors or simple procedural patterns) so the player can perceive depth and orientation when turning.
3. Rendering uses Canvas 2D raycasting: one ray per screen column via DDA grid traversal, perpendicular-distance fish-eye correction, and per-column wall slice draws. Walls are shaded by distance and by hit side (N/S vs E/W) to give a sense of lighting.
4. **Keyboard movement:** `W`/`S` move forward/back along the facing direction; `A`/`D` strafe left/right. Movement speed is delta-time based so it does not vary with monitor refresh rate.
5. **Mouse look:** clicking the canvas requests pointer lock; while locked, horizontal mouse movement rotates the view smoothly. Pressing `Esc` releases the lock. Arrow Left/Right also rotates the view as a fallback when not locked.
6. **Collision:** walls block player movement. The player cannot pass through or stand inside a wall. Resolve collisions axis-by-axis with a small (~0.1 cell) margin so the player does not snag on corners.
7. The render/update loop uses `requestAnimationFrame` and reaches a stable ≥30 FPS on a typical desktop. A small FPS counter is drawn in a screen corner.
8. There are no runtime errors in the browser console for a 60-second session of normal play (walking around, turning, bumping into walls, locking and releasing the mouse).

## Out of Scope

- Enemies, NPCs, sprites of any kind.
- Weapons, projectiles, hitscan, or any "shooting" interaction.
- Sound, music, or any audio.
- Textures loaded from external image files (solid colors / procedural patterns only this spec).
- Multiple levels or map loading from external files; the map is a hard-coded 2D array.
- HUD beyond the FPS counter (no health, no minimap, no crosshair required — though a single 1×1 px crosshair dot is fine if trivial).
- Mobile / touch controls.
- Any Bayesian, adaptive, or AI logic.
- Build tooling, bundlers, TypeScript, frameworks, or external runtime dependencies.

## Design Notes

- **Reference math:** Lode Vandevenne's raycaster tutorial is the canonical reference for the DDA loop, perpendicular-distance computation, and fish-eye correction. The math fits in ~30 lines.
- **Suggested internal structure** (all inside the single `<script>` block, no modules needed):
  - `MAP` — 2D array of small integers; `0` = empty, `1`/`2` = wall types.
  - `player` — `{ x, y, dirX, dirY, planeX, planeY }`. The plane vector is perpendicular to the direction vector and its length controls FOV (length ≈ 0.66 → ~66° FOV).
  - `input` — keyboard state set from `keydown`/`keyup`; pointer-lock delta accumulator.
  - `update(dt)` — applies movement and rotation from input, with collision resolution.
  - `render()` — per-column raycast + wall slice draw onto an `ImageData` buffer, then a single `putImageData` per frame.
- **Internal resolution:** render to a small offscreen buffer (e.g., 320×200 or 480×270) and scale up via canvas CSS or a final blit to the visible canvas. This gives the retro look and bounds per-frame work.
- **Per-column z-buffer:** even though sprites are not in scope, allocate and populate a `Float32Array` of perpendicular distances per column during rendering. Subsequent specs (sprite enemies) will need it; populating it now is free.
- **FOV / aspect:** plane length 0.66 with a direction vector of length 1.0 produces ~66° horizontal FOV, which feels right at 4:3-ish aspect ratios. If you choose a wider canvas, scale plane length accordingly.
- **Collision shape:** treat the player as a point with a radius of ~0.2 cells. Resolve X and Y axes independently to avoid getting stuck on corners.

## Agent Notes

- Read `AGENTS.md` and this spec first. Make all changes inside the assigned worktree only.
- Commit the entire game as `index.html` at the repo root. Do **not** add `package.json`, a build config, or any sibling asset file — single-file is a hard requirement of this spec.
- Keep `index.html` reasonably small (target < ~30 KB). Vanilla JS only, no transpilation, no minification.
- Smoke-test before reporting:
  - Serve locally with `python3 -m http.server` and load the page in a browser if you have one available.
  - At minimum, extract the inline `<script>` body to a temp file and run `node --check` on it to catch syntax errors.
  - Open the file URL in a headless tool (e.g., `npx playwright` if already installed) only if it is already available — do not add it as a dev dependency.
- Common pitfalls to avoid:
  - **Fish-eye:** use perpendicular distance (`(mapX - posX + (1 - stepX) / 2) / rayDirX` style), not Euclidean ray length. Forgetting this curves the walls.
  - **Zero ray components:** guard `deltaDistX = abs(1 / rayDirX)` against `rayDirX == 0` (use `Infinity` as the canonical sentinel — it works correctly with the DDA comparisons).
  - **Pointer lock:** call `canvas.requestPointerLock()` from a user gesture (the `click` handler). Listen to `pointerlockchange` and `pointerlockerror` to track state. Mouse delta only counts while locked.
  - **Frame-rate-dependent movement:** scale all movement and rotation by `dt` (seconds since last frame), not by frame count. Cap `dt` at ~0.05 s to avoid teleport on tab refocus.
  - **Putting too much on the main thread:** the `ImageData`'s `data` array is a `Uint8ClampedArray`; write to it column-by-column and call `putImageData` exactly once per frame.
- Leave the rendering and input code factored so the next spec can drop in sprites, a weapon, and a HUD without restructuring. In particular: a single `render()` entry point, a `castRay(angle)` helper that returns hit info, and a populated z-buffer.

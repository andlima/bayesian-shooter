---
id: fix-minimap-arrow-rotation
area: frontend
priority: 90
depends_on: []
description: Fix minimap player triangle pointing 180° backwards from the player's facing direction
---

# Fix Minimap Arrow Rotation

## Goal

The player triangle on the minimap currently points in the **opposite** direction of where the player is actually facing. This is a one-line math bug in `drawMinimap()`: the rotation offset has the wrong sign, so the triangle is rotated 180° from the correct heading. Flip the sign and update the misleading comment.

## Acceptance Criteria

1. In `drawMinimap()` (currently around `index.html:957`–`1027`), the player triangle on the minimap points along the player's facing direction `(player.dirX, player.dirY)` for **every** orientation. Concretely:
   - When the player faces world +X (`dirX ≈ 1, dirY ≈ 0`), the triangle's tip points to the **right** edge of the minimap.
   - When the player faces world +Y (`dirX ≈ 0, dirY ≈ 1`), the tip points to the **bottom** edge.
   - When the player faces world −X (`dirX ≈ −1, dirY ≈ 0`), the tip points to the **left** edge.
   - When the player faces world −Y (`dirX ≈ 0, dirY ≈ −1`), the tip points to the **top** edge.
   These four cardinal cases are the regression test — eyeball each in a browser.
2. The rotation continues to be smooth as the player turns; the triangle rotates continuously, in the same angular direction as the player's view rotates (rotating right turns the triangle clockwise on the minimap).
3. Only the rotation math (and its accompanying comment) changes. The triangle's local vertex coordinates `[[0, -3], [-2, 2], [2, 2]]`, color, size, fill style, and minimap layout/position are untouched.
4. No other gameplay, rendering, or audio behavior changes. Walls, enemy dots, mute toggle, HUD, sprite rendering, FPS counter — all behave identically.
5. Single-file constraint preserved: still one `index.html` at the repo root, no build, no `package.json`, no external assets.
6. No new console errors or warnings during a 60-second session of normal play (walking, turning a full 360° in both directions, firing).

## Out of Scope

- Any other minimap changes (sizing, position, colors, fog-of-war, zoom, rotation-locked-to-player view, etc.).
- Audio, HUD, gameplay, AI, or weapon changes.
- Refactoring `drawMinimap()` beyond the necessary line edit and comment.
- Adding tests, build tooling, or framework changes.

## Design Notes

- **Root cause.** In `drawMinimap()`:
  ```js
  const angle = Math.atan2(player.dirY, player.dirX) - Math.PI / 2;
  ```
  The minimap renders cells with world-X mapped directly to screen-X and world-Y mapped directly to screen-Y (both growing the same direction — see the `sx, sy` computations a few lines above). The triangle's local tip sits at `(0, -3)` (screen-up). To make that tip align with `(dirX, dirY)` after a standard 2D rotation `R(θ)(x, y) = (x·cosθ − y·sinθ, x·sinθ + y·cosθ)`, the offset must be **`+π/2`**, not `−π/2`. Worked example: with `dir = (1, 0)`, we need the rotated tip to land at `(3, 0)` (screen-right). Solving `R(θ)(0, −3) = (3·sinθ, −3·cosθ) = (3, 0)` gives `θ = +π/2`, and `atan2(0, 1) = 0`, so the formula is `θ = atan2(dirY, dirX) + π/2`.
- **The fix.** Change the sign on the constant offset:
  ```js
  const angle = Math.atan2(player.dirY, player.dirX) + Math.PI / 2;
  ```
- **Comment.** The existing comment (lines ~1010–1012) reasons in terms of "up on the minimap is the player's facing" — that mental model only holds for a *player-rotating* minimap, but ours is *world-axis-aligned*. Replace with a brief, correct explanation, e.g.: "Local tip at (0, −3) (screen-up). Rotate by atan2(dirY, dirX) + π/2 so the tip aligns with (dirX, dirY) in screen coords (world-X→screen-X, world-Y→screen-Y on the minimap)."
- **Why the original spec was wrong.** `polish-audio-minimap.md` prescribed `-π/2` with the same flawed mental model. That earlier spec is shipped and should not be edited as part of this task; this task supersedes it for this one line.

## Agent Notes

- Read `AGENTS.md` and `specs/polish-audio-minimap.md` (for context on the minimap renderer) first. Make all changes inside the assigned worktree only.
- This is a one-character code change (`-` → `+`) plus a comment rewrite. Resist the urge to refactor `drawMinimap()` while you're in there.
- **Smoke-test before reporting.** This is a visual bug, so verification has to be visual:
  - Serve locally with `python3 -m http.server` and open `index.html` in a desktop browser.
  - Find a spot in the map where you can stand still and rotate. Compare the in-world view direction to the minimap arrow tip — they must match.
  - Click into pointer lock and slowly rotate a full 360° in both directions; the arrow must rotate continuously the same way the view rotates, and pass through all four cardinal orientations correctly (see Acceptance Criterion 1 for the exact expected mappings).
  - At minimum (no browser available), extract the inline `<script>` body and run `node --check` on it to catch syntax errors. The math change cannot be unit-tested without a renderer; visual inspection is the gate.
- Common pitfalls:
  - **Don't also flip the local triangle vertices.** Flipping both the vertices and the angle would cancel out and leave the bug in place. Change *only* the angle offset sign.
  - **Don't conflate "minimap rotates with player" vs "world stays axis-aligned".** Our minimap is the latter (walls drawn in fixed world orientation), so the arrow must point along world `(dirX, dirY)` mapped 1:1 to screen.
  - **Don't touch any other `atan2` call** in `index.html` (sprite renderer, damage-direction arrow, AI). Their coordinate setups differ; this fix is scoped to `drawMinimap()` only.

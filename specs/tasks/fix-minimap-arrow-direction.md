---
id: fix-minimap-arrow-direction
area: frontend
priority: 50
depends_on: []
description: Fix the yellow player triangle on the minimap so it points along the player's facing direction (currently points backward)
---

# Fix: Minimap Player Arrow Points Backward

## Goal

The yellow triangle on the minimap is supposed to indicate where the player is looking, but it currently points opposite to the player's facing direction. Fix the rotation so the triangle's tip points along `(player.dirX, player.dirY)`.

## Acceptance Criteria

1. When the player faces world-east (`dirX ≈ 1, dirY ≈ 0`), the minimap triangle's tip points to the **right** edge of the minimap.
2. When the player faces world-north (`dirX ≈ 0, dirY ≈ -1`), the tip points to the **top** of the minimap.
3. When the player faces world-west (`dirX ≈ -1, dirY ≈ 0`), the tip points to the **left**.
4. When the player faces world-south (`dirX ≈ 0, dirY ≈ 1`), the tip points to the **bottom**.
5. As the player rotates continuously (mouse look or arrow keys), the triangle rotates smoothly *with* the view, in the same direction — i.e., turning right in first-person also turns the triangle clockwise on the minimap.
6. No new console errors during normal play. No change to wall rendering, enemy dots, backdrop, size, or position of the minimap. No change to gameplay state, audio, HUD, or any other rendering.

## Out of Scope

- Any visual change to the triangle's size, color, or shape.
- Any change to the minimap's position, scale, backdrop, wall rendering, or enemy dots.
- Any change to gameplay, input, audio, or non-minimap rendering.
- Adding a separate "facing" indicator — fixing the existing triangle is sufficient.

## Design Notes

The bug lives in `drawMinimap()` in `index.html` (around line 1013). The current code is:

```js
const angle = Math.atan2(player.dirY, player.dirX) - Math.PI / 2;
```

The minimap maps world `+X` → screen `+X` and world `+Y` → screen `+Y` (canvas Y points down). The local triangle has its tip at `(0, -3)` (screen-up in local space). To rotate the local "up" vector `(0, -1)` onto the world facing vector `(dirX, dirY)` under canvas Y-down convention, the sign on `π/2` must be **positive**:

```js
const angle = Math.atan2(player.dirY, player.dirX) + Math.PI / 2;
```

Verification (with the rotation matrix already in place at lines 1020–1021):

| `(dirX, dirY)` | `angle` | tip after rotation | minimap direction |
|---|---|---|---|
| `(1, 0)` east | `+π/2` | `(+3, 0)` | right ✓ |
| `(0, -1)` north | `0` | `(0, -3)` | up ✓ |
| `(-1, 0)` west | `+3π/2` | `(-3, 0)` | left ✓ |
| `(0, 1)` south | `+π` | `(0, +3)` | down ✓ |

Update the adjacent comment so future readers don't get the same convention wrong.

## Agent Notes

- Read `AGENTS.md` first. All edits inside the assigned worktree only.
- This is a **one-line code fix plus a comment update**. Do not refactor the minimap, rename variables, restructure rendering, or touch unrelated code.
- Single-file constraint still holds: `index.html` only, no new files, no build, no dependencies.
- Smoke-test before reporting:
  - Serve `python3 -m http.server` and open in a browser. Spawn at the start of the level, walk forward (W) — the triangle's tip should point in the direction of motion across the map cells, not opposite.
  - Turn 360° with the mouse — the triangle should rotate continuously and stay aligned with first-person view direction.
  - Confirm no console errors and no visible change to walls, enemy dots, HUD, audio.
- At minimum run `node --check` against the extracted `<script>` body to catch syntax errors before reporting.

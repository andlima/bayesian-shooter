---
id: gun-viewmodel-doom-style
area: frontend
priority: 50
depends_on: []
description: Fix the see-through trigger guard and rebuild the pistol sprite as a flat, mirror-symmetric, screen-centered viewmodel in the spirit of Wolfenstein 3D / Doom
---

# Doom-Style Symmetric Gun Viewmodel

## Goal

Two problems with the current pistol viewmodel in `index.html`:

1. **The trigger-guard interior is transparent.** `buildGun()` deliberately
   writes `0` into the inside of the trigger ring (`fillCant(26, 35, 20, 12, 0)`),
   and the blit at `drawGunViewmodel()` uses an alpha-test (`if (sc === 0) continue;`).
   In play, walls, floor, enemies, muzzle flashes and the vignette flicker
   *through* the trigger guard as the gun bobs. The user reads this as
   "weird transparency in the weapon."
2. **The gun is tilted, off-center, and asymmetric.** A per-row cant
   (`(y - 50) / 6` pixels left, ≈9°) gives the slide a faux-3D shear. The
   sprite is parked 32 px right of screen-center via `GUN_RIGHT_SHIFT = 32`.
   Several internal details are not mirror-symmetric: the trigger sliver
   sits at `x=34,w=2` (off the sprite's centerline at 35.5), the grip
   highlight is a single left-side stripe, and the muzzle hole / front
   sight are 5-pixel-wide rects starting at `x=37` (centered at 39).
   Wolfenstein 3D and Doom render their guns as flat, dead-center,
   bilaterally-symmetric 2D sprites — none of those three traits apply
   today.

Rebuild the pistol sprite so it is **(a)** opaque inside the trigger guard,
**(b)** drawn without the per-row cant (no shear), **(c)** mirror-symmetric
across the sprite's vertical midline at x=35.5, and **(d)** horizontally
centered on screen. The overall silhouette stays a pistol — slide on top
(now flat, not tilted), sights protruding, frame wider than the slide,
trigger ring with a sliver inside, brown grip below — but every shape is
now centered on the sprite seam and mirrors cleanly.

The kick state machine, muzzle flash sprites, muzzle wash light, drop
shadow band, bob, sway, equip slide-in, FOV punch, hitscan, audio, HUD,
minimap, enemy/pickup logic, and level progression are all untouched.

## Acceptance Criteria

1. **No internal transparency.** After this change, no pixel inside the
   gun's body silhouette is `0` in `GUN_SPRITE`. The trigger-guard interior
   in particular is filled with `PALETTE.outline` (near-black ≈20,18,22),
   so the trigger area reads as a recessed shadow well with the
   `PALETTE.bodyMid` trigger sliver in clear contrast on top. The world is
   **never** visible through the trigger guard at any camera angle, bob
   phase, kick offset, sway offset, equip-slide offset, or lighting mode.

2. **Silhouette transparency preserved.** Every pixel of `GUN_SPRITE` that
   is `0` and falls **outside** the gun's body shape stays `0`, so the
   gun's silhouette still reads as a pistol against the world (not a
   rectangular block). Concretely, all pixels outside the union of
   slide / sights / frame / trigger-guard outline / trigger-guard interior /
   grip remain `0`. The alpha-test rule in the blit (`if (sc === 0) continue;`)
   is unchanged.

3. **No cant.** The per-row x-offset is gone. The helpers `cantOf`,
   `fillCant`, `setCant`, and `outlineCant` defined inside `buildGun()` are
   removed (or, equivalently, `cantOf` is made to return `0` and the
   helpers collapse). All shape draws use the existing axis-aligned
   `gunFillRect(spr, x, y, w, h, color)` and `gunOutlineRect(spr, x, y, w, h, color)`.
   The constant `CANT_PIVOT_Y` is removed. The slide, frame, trigger
   guard, muzzle hole, front sight, rear sights, center spine highlight,
   and outlines all render with their drawn x-coordinates verbatim (no
   shear).

4. **Mirror symmetry.** For every `y` in `[0, GUN_H-1]` and every
   `x` in `[0, GUN_W-1]`, `GUN_SPRITE[y*GUN_W + x] === GUN_SPRITE[y*GUN_W + (71 - x)]`.
   The sprite is bilaterally symmetric across the seam between columns 35
   and 36. (This is testable: after `buildGun()` returns, the implementer
   can — at least mentally — walk the sprite and confirm the property. It
   does **not** need to be encoded as a runtime `console.assert`.)

5. **Centered on screen.** `GUN_RIGHT_SHIFT = 0` (was `32`). With
   `W = 480` and `GUN_W = 72`, `baseX = (480 - 72) >> 1 = 204`, so the
   sprite occupies columns 204–275 at rest. The sprite's mirror seam at
   internal x=35.5 lines up with screen column 239.5 — i.e., the screen's
   center seam (between columns 239 and 240). Bob, kick, sway, and
   equip-slide still apply their offsets on top of `baseX`.

6. **Barrel anchor centered.** `BARREL_X = 36` (was `32`). The muzzle hole
   in the new sprite is a 4-wide rect at `x=34, y=6, w=4, h=4` (columns
   34–37, mirror-symmetric around 35.5). `BARREL_Y = 7` (unchanged). The
   muzzle flash, anchored at `dx + BARREL_X`, `dy + BARREL_Y`, exits from
   the centered barrel hole. The muzzle wash light (`muzzleAnchorX/Y`)
   follows the new barrel position with no further code change.

7. **Layout constants table.** After this change:

   | Constant | Before | After |
   |---|---|---|
   | `GUN_W` | 72 | 72 |
   | `GUN_H` | 96 | 96 |
   | `GUN_RIGHT_SHIFT` | 32 | 0 |
   | `BARREL_X` | 32 | 36 |
   | `BARREL_Y` | 7 | 7 |
   | `CANT_PIVOT_Y` | 50 | removed |

8. **No regression to surrounding systems.** Bob (`bobPhase`, `bobIntensity`),
   kick state machine (`kickState`, `kickKind`, `KICK_UP_MS`,
   `KICK_RECOVER_MS`, shot vs dry magnitudes), sway (`SWAY_*`), equip
   slide-in (`EQUIP_FRAMES`, `EQUIP_DROP_PX`), FOV punch (`FOV_PUNCH_AMOUNT`),
   drop shadow (`drawGunShadow`, `SHADOW_H`, `SHADOW_MAX_DARK`), muzzle wash
   (`drawMuzzleScreenWash`, `MUZZLE_*`), muzzle flash sprites (`buildFlash1`,
   `buildFlash2`, `FLASH_FRAME_1`, `FLASH_FRAME_2`), `onPlayerFire`, and
   `getKickOffsets` are all pixel-identical / behavior-identical to before.
   Death suspends the gun blit; `R` re-equips with the slide-in; `N`
   regenerates the dungeon and re-equips. No change to hitscan, ammo,
   pickups, HUD, minimap, audio, or atmosphere lighting (`L` still toggles
   fog over the gun area).

9. **Single-file constraint.** All edits live in `index.html`. No new
   files, no build step, no dependencies. The inline `<script>` IIFE
   structure is preserved.

10. **No new console errors during play.**

## Out of Scope

- Replacing the pistol with a different weapon (shotgun, machine gun, BFG).
  This task makes the *existing* pistol Doom-style; it does not introduce
  weapon variety.
- Drawing visible **hands or arms** gripping the gun. Doom and W3D both
  show forearms / hands wrapping the grip; that's a worthwhile follow-up
  but it is a separate sprite-design task with its own palette work. Out
  of scope here.
- Adding a per-fire **trigger-pull animation** (the trigger sliver moving
  back when firing), a slide-rack animation, a hammer animation, smoke
  particles, ejection-port brass, or any other new animation. The existing
  kick/flash/wash/FOV-punch package on fire is the only feedback channel.
- Re-tuning the **palette**. `PALETTE.outline`, `bodyDark`, `bodyMid`,
  `bodyHi`, `grip`, `gripHi`, `gripDark`, `sight` all keep their current
  RGB values. The fix uses existing palette entries; do not add new
  colors and do not retune existing ones.
- Changing the **alpha-test rule** in the blit (`if (sc === 0) continue;`).
  No partial transparency, no premultiplied alpha, no new blend modes.
- Re-tuning **bob amplitude / frequency, sway amplitude / frequency, kick
  magnitudes, equip slide-in distance or duration, FOV punch amount, drop
  shadow height or darkness, or muzzle wash radius / peak alpha**. The
  visual contract for all those systems is unchanged.
- Editing the **older specs** that introduced the pistol or its polish
  (`specs/gun-viewmodel.md`, `specs/gun-viewmodel-fps-perspective.md`,
  `specs/tasks/gun-feel-polish.md`, `specs/tasks/gun-muzzle-wash.md`).
  Those are historical record; this spec supersedes the cant and the
  hollow trigger guard.
- Touching unrelated subsystems: enemy AI, dungeon generation, raycaster,
  sprites, audio, HUD, minimap, mobile touch controls.

## Design Notes

### Where the bug lives

`buildGun()` in `index.html` (around line 3847). The cant infrastructure
is the `cantOf` / `fillCant` / `setCant` / `outlineCant` helpers defined
inside `buildGun()`, driven by `CANT_PIVOT_Y = 50` and rate `1/6`. Every
shape today is drawn through `fillCant` / `outlineCant`. The
trigger-guard transparency is the explicit `fillCant(26, 35, 20, 12, 0)`
call (around line 3926) that punches a hole in the frame.

The layout constants live higher up:

```js
const GUN_W = 72;                   // unchanged
const GUN_H = 96;                   // unchanged
const GUN_RIGHT_SHIFT = 32;         // → 0
const BARREL_X = 32;                // → 36
const BARREL_Y = 7;                 // unchanged
```

The blit (`drawGunViewmodel()`, around line 4089) computes
`baseX = ((W - GUN_W) >> 1) + GUN_RIGHT_SHIFT;` and reads
`barrelX = dx + BARREL_X`. Both follow the constants automatically — no
code change is needed in the blit itself.

### Target sprite layout (post-change)

All shapes axis-aligned (no cant). Mirror seam between columns 35 and 36
(so `mirror(x) = 71 - x`). Every fill listed below is verified
mirror-symmetric.

**1. Slide** (top of sprite; flat, was canted):

```js
gunFillRect(spr, 22, 6, 28, 24, PALETTE.bodyMid);   // body
gunFillRect(spr, 24, 7, 24,  2, PALETTE.bodyHi);    // top highlight strip
gunFillRect(spr, 22, 8,  2, 20, PALETTE.bodyDark);  // left wall
gunFillRect(spr, 48, 8,  2, 20, PALETTE.bodyDark);  // right wall  (mirror of left: 22↔48, 23↔49)
gunFillRect(spr, 34, 9,  4, 12, PALETTE.bodyHi);    // center spine highlight (already centered)
gunOutlineRect(spr, 22, 6, 28, 24, PALETTE.outline);
gunFillRect(spr, 34, 6,  4,  4, PALETTE.outline);   // muzzle hole, centered (was x=37 w=5)
```

**2. Front sight** (above the slide, centered):

```js
gunFillRect(spr,    34, 2, 4, 4, PALETTE.sight);
gunOutlineRect(spr, 34, 2, 4, 4, PALETTE.outline);
```

**3. Rear sights** (mirror pair at the back of the slide):

```js
// Left
gunFillRect(spr,    25, 24, 4, 5, PALETTE.bodyDark);
gunFillRect(spr,    25, 24, 4, 1, PALETTE.sight);     // bright cap
gunOutlineRect(spr, 25, 24, 4, 5, PALETTE.outline);
// Right (mirror: 25↔43, 26↔44, 27↔45, 28↔46)
gunFillRect(spr,    43, 24, 4, 5, PALETTE.bodyDark);
gunFillRect(spr,    43, 24, 4, 1, PALETTE.sight);
gunOutlineRect(spr, 43, 24, 4, 5, PALETTE.outline);
```

**4. Frame** (lower receiver; wider than the slide, centered):

```js
gunFillRect(spr,    18, 30, 36, 20, PALETTE.bodyDark);
gunFillRect(spr,    20, 31, 32,  2, PALETTE.bodyMid);
gunOutlineRect(spr, 18, 30, 36, 20, PALETTE.outline);
```

**5. Trigger guard** (THE FIX — interior filled, not hollow; trigger sliver centered):

```js
gunFillRect(spr,    26, 35, 20, 12, PALETTE.outline);   // ← was 0; dark recess
// outlineCant(26, 35, 20, 12, PALETTE.outline) is now a no-op (the
// fill above already covers the same rect with the same color). Omit.
gunFillRect(spr,    35, 37,  2,  8, PALETTE.bodyMid);   // trigger sliver (was x=34; now centered: pixels 35,36)
```

**6. Grip** (vertical; symmetric two-stripe highlight; symmetric checkering):

```js
const GRIP_X = 25, GRIP_Y = 50, GRIP_W = 22, GRIP_H = GUN_H - GRIP_Y;   // unchanged
gunFillRect(spr, GRIP_X, GRIP_Y, GRIP_W, GRIP_H, PALETTE.grip);
// Two symmetric highlight stripes hugging the grip's left and right walls
gunFillRect(spr, GRIP_X + 1,          GRIP_Y + 1, 2, GRIP_H - 2, PALETTE.gripHi);  // x=26-27
gunFillRect(spr, GRIP_X + GRIP_W - 3, GRIP_Y + 1, 2, GRIP_H - 2, PALETTE.gripHi);  // x=44-45 (mirror)
// Checkering: iterate dotX from GRIP_X+3 to GRIP_X+GRIP_W-3 step 3
// → dotX ∈ {28, 31, 34, 37, 40, 43}; mirror pairs 28↔43, 31↔40, 34↔37
for (let yy = GRIP_Y + 2; yy < GRIP_Y + GRIP_H - 1; yy += 3) {
  if (yy >= GUN_H) continue;
  const base = yy * GUN_W;
  for (let dotX = GRIP_X + 3; dotX <= GRIP_X + GRIP_W - 3; dotX += 3) {
    spr[base + dotX] = PALETTE.gripDark;
  }
}
gunOutlineRect(spr, GRIP_X, GRIP_Y, GRIP_W, GRIP_H, PALETTE.outline);
```

### Why these specific coordinates

- **28-wide slide centered on 35.5.** Span `[22, 49]` mirrors as
  `22↔49, 23↔48, …, 35↔36`. Same logic for the 36-wide frame `[18, 53]`,
  the 22-wide grip `[25, 46]`, the 20-wide trigger-guard interior
  `[26, 45]`, and the 4-wide muzzle / front sight / trigger sliver / spine
  highlight on `[34, 37]` or `[35, 36]`.
- **Muzzle moves from x=37 w=5 → x=34 w=4.** A 5-wide rect can't be
  mirror-symmetric around a seam (it has a center pixel; that center
  would need to be at x=35.5, which is not an integer). Going to width 4
  on `[34, 37]` puts the mirror seam between columns 35 and 36 and yields
  a clean `BARREL_X = 36` for the flash anchor (the flash is centered on
  `(dx + BARREL_X, dy + BARREL_Y) - (FLASH_W>>1, FLASH_H>>1)`, so any
  integer-and-a-half barrel center works — pick 36).
- **Trigger sliver moves from x=34 w=2 → x=35 w=2.** Pixels `{34, 35}`
  are not mirror-symmetric (mirror would be `{36, 37}`). Pixels `{35, 36}`
  are mirror-symmetric to themselves ✓.
- **Grip checkering loop bounds.** Old loop `dotX = GRIP_X+4` to
  `< GRIP_X+GRIP_W-2` step 3 produced `{29, 32, 35, 38, 41}` — not a
  mirror set under `mirror(x) = 71 - x` (mirror would be
  `{30, 33, 36, 39, 42}`). New loop `dotX = GRIP_X+3` to
  `<= GRIP_X+GRIP_W-3` step 3 produces `{28, 31, 34, 37, 40, 43}` with
  mirror pairs `28↔43, 31↔40, 34↔37` — fully symmetric.

### Helpers to remove from `buildGun()`

After the rewrite, these become dead code and should be deleted from
within `buildGun()`:

- `const CANT_PIVOT_Y = 50;` (and any neighboring comment about cant)
- `function cantOf(y) { … }`
- `function fillCant(x, y, w, h, color) { … }`
- `function setCant(x, y, color) { … }`
- `function outlineCant(x, y, w, h, color) { … }`

The top-level helpers defined just before `buildGun()` —
`gunFillRect(spr, x, y, w, h, color)` and `gunOutlineRect(spr, x, y, w, h, color)`
(around lines 3831 and 3840) — are kept and used throughout.

### Audit of code that depends on gun layout

These places consume the constants directly; they need **no changes**
beyond the constants themselves:

| Site | Reads | Behavior after change |
|---|---|---|
| `drawGunViewmodel()` baseX | `GUN_RIGHT_SHIFT` | gun centers on screen (0 shift) |
| `drawGunViewmodel()` blit loop | `GUN_W`, `GUN_H`, `GUN_SPRITE` | new sprite contents, same bounds |
| `drawGunViewmodel()` barrel anchor | `BARREL_X`, `BARREL_Y` | muzzle flash + `muzzleAnchorX/Y` track centered barrel |
| `drawMuzzleScreenWash` | `muzzleAnchorX/Y` | wash follows new barrel automatically |
| `drawGunShadow` | none (full-width band) | unchanged — does not depend on gun position |
| Kick / bob / sway / equip / FOV punch | none of the above | unchanged |

`baseY = H - GUN_H + 4` (the trim that hides the bottom 4 rows of the
grip) is unchanged — the grip still extends to `GUN_H - 1` and the bottom
4 rows are still clipped, so the "hand off-frame" visual contract holds.

## Agent Notes

- Read `AGENTS.md` and `CLAUDE.md` first. All edits inside the assigned
  worktree only; the single-file constraint holds (`index.html` only).
- Apply the changes in this order to keep the diff easy to review:
  1. Edit the four layout constants (`GUN_RIGHT_SHIFT`, `BARREL_X`, and
     remove `CANT_PIVOT_Y`).
  2. Replace the body of `buildGun()` with the design above. Delete the
     `cantOf` / `fillCant` / `setCant` / `outlineCant` helpers from inside
     `buildGun()`. Keep using `gunFillRect` / `gunOutlineRect`.
  3. Touch up the section-header comments (the "Slide", "Frame", and
     "Grip" descriptions). The old comments mention "canted" and "hollow
     cut-out"; rewrite them to match the new flat / opaque / centered
     reality. Keep comments short — they describe what each block does,
     not the history of the change.
- Mirror-symmetry check: after `buildGun()` runs, walk the sprite once
  and verify `spr[y*GUN_W + x] === spr[y*GUN_W + (71 - x)]` for every
  cell. The implementer may add a one-shot `console.assert` for the
  duration of debugging, but **remove** it before reporting — the
  released code does not ship a runtime symmetry check.
- Smoke-test before reporting (desktop browser, serve via
  `python3 -m http.server`):
  - At idle, the gun sits dead-center, flat, with a visible recessed
    trigger area (`PALETTE.outline`) and a gray trigger sliver
    (`PALETTE.bodyMid`) inside it. Nothing peeks through the trigger guard.
  - Walk in a circle, strafe past walls and enemies. The trigger-guard
    area stays opaque. The gun bobs and sways but does not tilt.
  - Fire a few shots. Muzzle flash centers on the gun's barrel (sprite
    center column). The muzzle wash light radiates symmetrically left and
    right. Kick offsets still snap the gun up-and-left briefly (`-2, -10`)
    and recover — this is the same kick as before; only the rest pose is
    different.
  - Dry-fire by emptying the magazine — small `-2` vertical kick, no
    flash, gun stays opaque.
  - Press `R` after death and `N` to regenerate — gun re-equips with the
    slide-in animation. Centered and flat throughout the equip slide.
  - Toggle `L`. Atmosphere fog tints the area around the gun; the gun
    itself is unaffected (rendered after the post-pass). Trigger guard
    still opaque under both lighting modes.
  - On mobile (or DevTools touch emulation), the gun is still
    screen-centered. Touch-look drags that pass near the gun area do not
    produce flicker through the trigger ring.
- After editing, run `node --check` against the extracted `<script>` body
  to catch syntax errors before reporting. (Extract with
  `awk '/<script>/,/<\/script>/' index.html | sed '1d;$d' > /tmp/gun.js && node --check /tmp/gun.js`.)
- Grep `index.html` for the literal substring `fillCant` and confirm zero
  matches (similarly `cantOf`, `setCant`, `outlineCant`, `CANT_PIVOT_Y`).
- Confirm no new console errors during play.
- If you find that another spec (merged after this one was written) has
  added a new internal `0`-write inside the gun silhouette, surface it
  via `spec report --status needs-input` rather than guessing how to
  reconcile. Likewise, if any code outside `drawGunViewmodel` /
  `drawMuzzleScreenWash` / `drawGunShadow` references the cant pivot or
  the old `GUN_RIGHT_SHIFT = 32` placement (e.g., a HUD element offset by
  the gun position), surface it — there is no such site as of this
  writing, but a later edit could introduce one.

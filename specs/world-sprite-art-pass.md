---
id: world-sprite-art-pass
area: frontend
priority: 50
depends_on: [sprite-bake-manifest]
description: Redraw the world sprites at native resolution — a two-frame pulsing exit portal, two-frame flickering imp fireball and grunt plasma bolt, and bevelled, better-lit medkits and ammo crates — and advance animPhase for the exit and projectiles so the two-frame sets actually animate.
---

# World Sprite Art Pass

## Goal

The non-enemy sprites are the plainest art in the game: the exit is a
solid green column, the projectiles are flat two-tone dots, and the
pickups are small flat boxes with one-row shadows. None of them animate
even though the renderer already supports two frames per type.

This spec redraws the exit, both projectiles and the four pickups as
native-resolution 32×32 pixel art with proper shading, and makes the exit
and projectiles **animate** with two distinct frames by advancing their
`animPhase`. Placement, pickup grants, collision radii, projectile speed,
minimap dots and seeds are untouched. The shotgun pickup belongs to
`weapon-viewmodel-art-pass` and is not touched here.

## Acceptance Criteria

### Art assets

1. **Files and bindings** (all 32×32, listed in `MANIFEST`):

   | File | Binding |
   |---|---|
   | `exit_1.png`, `exit_2.png` | `exitFrame1`, `exitFrame2` |
   | `proj_imp_1.png`, `proj_imp_2.png` | `impProjFrame1`, `impProjFrame2` |
   | `proj_grunt_1.png`, `proj_grunt_2.png` | `gruntProjFrame1`, `gruntProjFrame2` |
   | `medkit_small.png`, `medkit_large.png` (replaced) | `medkitSmallFrame`, `medkitLargeFrame` |
   | `ammo_small.png`, `ammo_large.png` (replaced) | `ammoSmallFrame`, `ammoLargeFrame` |

   `exit.png`, `proj_imp.png`, `proj_grunt.png` and the single-frame
   bindings `exitFrame`, `impProjFrame`, `gruntProjFrame` are removed.

2. **Exit portal.** A floor-anchored device rather than a plain column:
   a ring or pad on rows 24–31 (with a shadow row 31) emitting a vertical
   beam of light to the top of the frame, in the exit's existing
   green-teal family (keep hue so the minimap's exit colour still reads
   as the same thing). Frame 2 is the "pulse": brighter core, wider or
   taller beam, a few drifting bright specks. ≥ 5 tones. The beam must be
   at least 6 px wide at its narrowest so it survives scaling at
   distance.

3. **Projectiles.** Imp fireball: a roughly 10×10 blob centred in the
   frame, white-hot core, orange body, red rim, with 2–4 px of trailing
   wisps; frame 2 flips the wisps and shifts the core highlight. Grunt
   bolt: an elongated ~12×6 green-white plasma dart with a dark rim;
   frame 2 shifts its inner highlight. Both stay centred so the
   on-screen position is unchanged; `PROJECTILE_HIT_RADIUS` is untouched.

4. **Pickups.** Keep the 3/4-perspective box convention (lit top face,
   darker front face, markings on the front face for the medkit and on
   the top face for ammo, floor shadow) and the floor anchoring in the
   lower half of the frame, but at native resolution: a 1-px bevel
   highlight on the top-left edges, a 1-px darker lip on the bottom-right
   edges, a two-tone red cross with a highlight corner, brass shell caps
   with a specular dot, wood grain lines on the ammo front face, and a
   two-row soft shadow (opaque; two dark tones). Sizes: small boxes
   10–12 px wide, large boxes 14–16 px wide, both with bottom outline on
   row 30 and shadow on row 31. Small and large tiers must remain
   distinguishable by size and marking density. Pickups stay static
   (`{ idle: [frame, frame] }` / `[frame, frame]`).

5. **Palette and light.** Upper-left light, no pure black, ≤ 16 colours
   per frame, no 2×2 pixel doubling.

### Animation

6. **Exit pulse.** Before `drawSprites` pushes `exitSpriteEntity`, set
   `exitSpriteEntity.animPhase = nowMs / 250` (4 Hz alternation, same
   rate as enemies). No other field of the exit entity changes.

7. **Projectile flicker.** In `tickProjectiles`, advance
   `p.animPhase += dt * 10` for live projectiles (≈ 10 Hz alternation).
   Spawn still sets `animPhase: 0`.

8. **Frame pick.** The renderer's existing pick (`frames[(animPhase|0) & 1]`
   or, if `enemy-sprite-art-pass` has landed, the named-set pick) shows
   frame 1/2 alternately for the exit and projectiles. Follow whichever
   `SPRITES` entry shape is current; do not change the pick logic here.

### Unchanged behaviour

9. **No gameplay change.** `generateDungeon` (pickup/exit placement,
   `rand()` order), `applyPickups`, `PICKUP_*` constants, `PROJECTILE_*`
   constants, `tickProjectiles` collision, `advanceLevel`, the exit
   trigger, `drawMinimap`, `drawPickupPops` and all audio are untouched.
   Any seed yields the same layout.

10. **Everything else byte-identical** — walls, floor, ceiling, HUD,
    minimap, gun, enemies.

### Pipeline, docs, verification

11. All frames are PNG → `make bake`; `make check` passes; `make bake`
    twice gives no diff; `node --check` on the extracted script passes.
    No console errors in a smoke session: watch the exit pulse from
    across a room and up close; take a fireball and a plasma bolt and
    watch them flicker in flight; pick up each pickup tier (grants and
    pops unchanged); `N`, `R`, `L` both ways.

12. `assets/CREDITS.md` rows added/updated for the ten PNGs, original to
    this repo. `README.md` and `AGENTS.md` need no edit.

## Out of Scope

- Shotgun pickup art (`weapon-viewmodel-art-pass`), enemy art
  (`enemy-sprite-art-pass`).
- Pickup animation (bob, glint), alpha-blended ground decals, particle
  systems, projectile impact effects, exit light cast onto the floor.
- Changing the enemy muzzle-flash square, minimap colours or icons,
  pickup values, placement counts, projectile speed/radius/TTL.
- Any renderer change beyond the two `animPhase` advances.

## Design Notes

- **Why the exit beam goes to row 0.** The sprite is scaled to the cell
  height; a floor pad alone would be a few pixels at distance. A full-
  height beam keeps the exit visible from across a room, which is its
  gameplay job, while the pad anchors it to the floor up close.
- **Why 10 Hz for projectiles.** They live ≤ 2 s and move 7 cells/s; a
  4 Hz flicker would show 1–3 flips per flight. 10 Hz reads as a flame
  without strobing at 60 fps.
- **Why pickups stay static.** A static pickup is the "skip-at-full"
  visual contract from `pickups-health-ammo` (the box visibly does not
  change when you walk over it at full HP). Animating it is a separate
  decision.
- **Opaque shadows are fine.** Same reasoning as `pickup-sprite-polish`:
  the sprite path has no alpha blending; two dark tones give a soft edge
  without it.

## Agent Notes

- Read `AGENTS.md` (Asset Baking), `specs/sprite-bake-manifest.md`, this
  spec, `specs/tasks/pickup-sprite-polish.md` (for the pickup
  conventions you are refining, not replacing), then in `index.html`:
  the baked region and `SPRITES`, `exitSpriteEntity` and its push in
  `drawSprites`, `tickProjectiles`, `enemyFireShot`'s projectile object.
- **Art workflow:** `--dump` each old PNG to text; redraw; `--encode`;
  **look at the PNG** with your image-reading tool and at
  `make preview --scale 6`; iterate. Use `make screenshot` too if it
  works in your environment. Do not report without having looked at
  every frame.
- Order of work: (1) exit frames + `animPhase` advance; (2) projectiles +
  advance; (3) pickups; (4) manifest, bake, docs, verification.
- Pitfalls: keep every projectile frame centred — an off-centre blob
  makes dodging feel wrong even though the hit test is unchanged; keep
  medkit/ammo visible rows within 16–31 so they stay on the floor; the
  exit entity is a module-scope singleton — set its phase, don't
  recreate it.

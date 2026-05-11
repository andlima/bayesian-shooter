---
id: pickup-sprite-polish
area: frontend
priority: 50
depends_on: []
description: Redraw the four pickup sprite frames (small/large medkit, small/large ammo crate) in a 3/4 perspective style — lit top face, darker front face, small floor shadow — and shrink the footprint so they read as discrete 3D objects sitting on the dungeon floor rather than as flat horizontal-striped wall tiles.
---

# Pickup sprite polish (3D-ish medkits + ammo crates)

## Goal

The current pickup sprites are flat rectangles filled with alternating
horizontal coloured rows — a thick red `RR`/white `WW` stripe pattern on
medkits and a `Yy` brass stripe pattern on ammo crates. They read as
texture-mapped *wall tile chunks* rather than as objects placed on the
floor, especially the large tier which dominates a 16×16 sprite cell.

This task redraws all four pickup frames so each one looks like a small
3D box sitting on the ground: a lit top face above a darker front face,
with a small floor shadow underneath. No horizontal stripes on the
front face — the differentiating markings (red cross on medkit, brass
shells on ammo crate) appear once, not as a repeating band.

The footprint also shrinks (small `8×8` → `8×6`, large `12×12` →
`10×8`) so pickups feel like consumable objects rather than crates the
size of an enemy. Tier distinction (small vs large) is preserved via
box height + markings density, not via wildly different widths.

Everything else about the pickup system is unchanged: placement,
walk-on grant, skip-at-full, pop text, audio, minimap dot, determinism
under seeds, `applyDungeon`/`resetRun`/`advanceLevel` wiring, the
`SPRITES` table shape, the `drawSprites` pipeline, the `frames[(animPhase|0) & 1]`
contract — all stay exactly as the `pickups-health-ammo` spec left
them.

## Acceptance Criteria

1. **Single-file constraint preserved.** Still one `index.html` at the
   repo root, no build step, no external assets, no images, no SVGs,
   no external CSS, no network requests, no `localStorage`. All sprite
   pixels remain baked from inline string-row art via `buildFrame(...)`.
   No README edits required (pickup behaviour is unchanged, prose in
   the README is purely behavioural).

2. **Replace `medkitPalette` and `ammoPalette` with the new shading
   palettes.** Both gain a lit-top colour, a floor-shadow colour, and
   (for the ammo palette) a darker outline distinct from the wood-dark
   colour. Replace the existing definitions at
   `index.html:1751-1798`-ish wholesale; do not add a second palette
   alongside.

   ```js
   // pickup-sprite-polish: 3/4-perspective box palette. `H` is the lit
   // top face, `W` is the slightly dimmer front-face panel, `s` is the
   // small floor shadow under the box. Drop the previous 3-colour
   // (o/W/R) flat palette.
   const medkitPalette = {
     o: rgba32( 40,  40,  40),   // dark outline
     H: rgba32(255, 255, 255),   // lit top face
     W: rgba32(225, 225, 225),   // front-face panel (slightly muted)
     R: rgba32(220,  60,  50),   // red cross (front face only)
     s: rgba32( 35,  28,  35),   // floor shadow (dark gray-purple)
   };

   // pickup-sprite-polish: lit wood top (`H`) above darker wood front
   // (`C`), with brass shells (`Y`/`y`, bright/dim for cylindrical
   // shading) inset into the top face only.
   const ammoPalette = {
     o: rgba32( 25,  18,  10),   // very dark outline
     H: rgba32(170, 125,  80),   // lit wood (top face)
     C: rgba32(115,  80,  50),   // mid wood (front face)
     Y: rgba32(255, 230, 120),   // brass bright (shell cap left)
     y: rgba32(180, 135,  50),   // brass dim (shell cap right shading)
     s: rgba32( 35,  28,  20),   // floor shadow (warm dark)
   };
   ```

   The old `medkitPalette` keys (`o`, `W`, `R`) survive with refreshed
   values; `H` and `s` are new. The old `ammoPalette` keys `c` (crate
   dark) and `C` (crate mid) are reworked — `C` survives as front-face
   mid wood, and `c` is removed (no longer referenced by the new
   frames). `H` (lit wood) and `s` (floor shadow) are new; `o` is new
   as well since the previous flat ammo palette had no separate
   outline colour. `Y` keeps its bright brass; `y` is retuned slightly
   warmer to read as cylindrical shading on a brass shell tip.

3. **Replace `medkitSmallFrame` and `medkitLargeFrame` with the new
   3/4-perspective designs.** Drop the existing flat-stripe rows
   (`index.html:1756-1791`-ish) and substitute these exact rows.
   Frames stay 16×16; only the row contents change.

   ```js
   // pickup-sprite-polish: small medkit. 8w × 6h box (rows 9-14) with
   // a 6w floor shadow on row 15. Row 10 is the lit top face (no
   // markings); rows 11-13 are the front face with a 3-tall × 2-wide
   // vertical bar + 1-tall full-width horizontal arm Greek cross. The
   // box sits below the sprite's vertical center (halfH = row 8), so
   // drawSprites' eye-level centring renders the box on the floor.
   const medkitSmallFrame = buildFrame([
     '................',
     '................',
     '................',
     '................',
     '................',
     '................',
     '................',
     '................',
     '................',
     '....oooooooo....',
     '....oHHHHHHo....',
     '....oWWRRWWo....',
     '....oRRRRRRo....',
     '....oWWRRWWo....',
     '....oooooooo....',
     '.....ssssss.....',
   ], medkitPalette);

   // pickup-sprite-polish: large medkit. 10w × 8h box (rows 7-14)
   // with an 8w floor shadow on row 15. Two rows of lit top face
   // (rows 8-9) above a fatter 4w-vertical / 2-row-horizontal cross
   // on the 4-row front face (rows 10-13). The "this is the big one"
   // signal is the wider box, the visible 2-row top face, and the
   // chunkier cross — not a different shape.
   const medkitLargeFrame = buildFrame([
     '................',
     '................',
     '................',
     '................',
     '................',
     '................',
     '................',
     '...oooooooooo...',
     '...oHHHHHHHHo...',
     '...oHHHHHHHHo...',
     '...oWWRRRRWWo...',
     '...oRRRRRRRRo...',
     '...oRRRRRRRRo...',
     '...oWWRRRRWWo...',
     '...oooooooooo...',
     '....ssssssss....',
   ], medkitPalette);
   ```

   Row-width invariants (count carefully when editing):
   - Each row must be exactly 16 characters wide.
   - Small box: outline columns 4 + 11, inner columns 5-10 (6 wide).
     Top outline row at row 9. Top face at row 10. Front face rows
     11-13. Bottom outline at row 14. Shadow row 15 spans columns
     5-10 (6 wide, narrower than the outline so the shadow doesn't
     touch the box's outer edge).
   - Large box: outline columns 3 + 12, inner columns 4-11 (8 wide).
     Top outline row 7. Top face rows 8-9. Front face rows 10-13.
     Bottom outline row 14. Shadow row 15 spans columns 4-11 (8 wide).

4. **Replace `ammoSmallFrame` and `ammoLargeFrame` with the new 3/4-
   perspective designs.** Same shape conventions as the medkit
   frames (small = 8×6, large = 10×8, each with a floor-shadow row
   at row 15). The markings differ: the front face is plain mid-wood
   with no stripes, and the top face contains 2 (small) or 3 (large)
   brass shell caps inset into a lit-wood frame.

   ```js
   // pickup-sprite-polish: small ammo crate. 8w × 6h. Row 10's top
   // face shows 2 brass shells (each Yy — bright cap then dim shadow
   // edge, cylindrical highlight from upper-left) in a 1-col lit-wood
   // frame. Rows 11-13 are solid mid-wood front face — no horizontal
   // brass stripes. Row 15 is the 6w floor shadow.
   const ammoSmallFrame = buildFrame([
     '................',
     '................',
     '................',
     '................',
     '................',
     '................',
     '................',
     '................',
     '................',
     '....oooooooo....',
     '....oHYyYyHo....',
     '....oCCCCCCo....',
     '....oCCCCCCo....',
     '....oCCCCCCo....',
     '....oooooooo....',
     '.....ssssss.....',
   ], ammoPalette);

   // pickup-sprite-polish: large ammo crate. 10w × 8h. Top face is 2
   // rows: row 8 shows 3 brass shells in a lit-wood frame, row 9 is
   // the plain lit-wood front lip of the top. Rows 10-13 are solid
   // mid-wood front. Row 15 is the 8w floor shadow. Tier distinction
   // = more shells visible (3 vs 2) + taller box + thicker top face.
   const ammoLargeFrame = buildFrame([
     '................',
     '................',
     '................',
     '................',
     '................',
     '................',
     '................',
     '...oooooooooo...',
     '...oHYyYyYyHo...',
     '...oHHHHHHHHo...',
     '...oCCCCCCCCo...',
     '...oCCCCCCCCo...',
     '...oCCCCCCCCo...',
     '...oCCCCCCCCo...',
     '...oooooooooo...',
     '....ssssssss....',
   ], ammoPalette);
   ```

   Row-width invariants:
   - Each row must be exactly 16 characters wide.
   - Small ammo box: cols 4 + 11 outline, cols 5-10 inner. Row 10
     `oHYyYyHo` = 1 outline + 1 lit-wood frame + 2 brass shells
     (`YyYy`, two pairs) + 1 lit-wood frame + 1 outline = 8 chars.
   - Large ammo box: cols 3 + 12 outline, cols 4-11 inner. Row 8
     `oHYyYyYyHo` = 1 outline + 1 lit-wood frame + 3 brass shells
     (`YyYyYy`) + 1 lit-wood frame + 1 outline = 10 chars.
   - Both shells use the `Yy` pattern (bright cap on the left, dim
     edge on the right) for consistent upper-left light direction.
     Reordering to `yY` flips the shading direction and looks wrong
     next to the medkit's same-direction lighting — don't reorder.

5. **No changes to the `SPRITES` table mapping.** The four pickup
   entries (`health_small`, `health_large`, `ammo_small`,
   `ammo_large` — `index.html:1842-1845`) each remain a 2-element
   array `[frame, frame]` where both elements are the same Uint32Array.
   Pickups don't animate; the duplicate shape is the existing
   compatibility contract with `drawSprites`'
   `frames[(animPhase | 0) & 1]` lookup.

6. **No changes to the rest of the pickup system.** Every pickup
   behaviour from the prior `pickups-health-ammo` spec stays:
   - Tuning constants (`PICKUP_RADIUS`, `PICKUP_HEALTH_*`,
     `PICKUP_AMMO_*`, `PICKUP_LARGE_CHANCE`, `PICKUP_MAX_PER_ROOM`,
     `MAX_PICKUPS`, `PICKUP_POP_MS`, `PICKUP_POP_MAX`) — untouched.
   - `makePickup`, `pickupSpawns`, `pickups`, `pickupPops` arrays —
     untouched.
   - `generateDungeon` pickup placement block, `applyDungeon`'s
     `pickupSpawns = d.pickupSpawns` line, `resetRun` and
     `advanceLevel`'s `pickups = pickupSpawns.map(...)` rebuilds,
     `clearTransientFeedback`'s `pickupPops.length = 0` — untouched.
   - `applyPickups` walk-on grant logic (HP/ammo clamp, skip-at-full,
     `spawnPickupPop`, `sfxPickupHealth`/`sfxPickupAmmo`) — untouched.
   - `spawnPickupPop`, `drawPickupPops` and its `render()` call site
     — untouched.
   - `drawSprites` pickup push loop (id offset 2000) — untouched.
   - `drawMinimap` green/yellow pickup dot pass — untouched. The
     dot palette (`#3c8` health, `#fc3` ammo) is the minimap's own
     2D-canvas colour and is independent of the worldspace sprite
     palette.

7. **No changes to other systems.** No edits to the imp / grunt /
   exit / projectile sprite frames or palettes. No edits to the wall
   / floor / ceiling textures, fog/lighting, gun viewmodel, HUD,
   minimap geometry (other than the unchanged pickup-dot pass),
   touch controls, audio, or any tuning constant.

8. **Determinism preserved.** Pickup placement still uses the same
   seeded `rand()` calls in `generateDungeon` in the same order
   (`tier` before `kind`). Sprite art is data, not logic; redrawing
   frames cannot change layout output. Verify by loading `?seed=1234`
   before and after and confirming pickup positions match.

9. **First rendered frame identity.** The first rendered frame on
   desktop differs from the prior version *only inside the pickup
   sprite pixels* — walls, floor, ceiling, sky, fog, HUD strip,
   minimap geometry, gun viewmodel, crosshair, and the player's
   spawn cell are byte-identical. Verify by side-by-side screenshot
   with the same seed: every pixel outside the four pickup sprites
   matches.

10. **Pickup sprite reads as "on the floor" at all distances.** Walk
    up to a pickup; the sprite never appears to float at eye level.
    The visible pixels (rows 9-15 for small, rows 7-15 for large)
    all sit below the sprite's vertical centre (`halfH = row 8`), so
    `drawSprites`' eye-level centring renders the box below the
    horizon line. Verify at close range (1-2 cells), mid range
    (5-6 cells), and at the room's far end (10+ cells).

11. **Top-face / front-face contrast holds under lighting.** With
    atmosphere lighting on (`L`): the fog blend on `transformY` (the
    same blend `drawSprites` applies to walls) does not collapse the
    top-vs-front contrast on the medkit or ammo crate — at fog
    middistance the lit top is still visibly brighter than the front
    face. The shadow row reads as a slightly darker spot beneath the
    box (it gets fog-blended like every other pixel and that is
    fine).

    With lighting off (`L` again): the legacy `shade = 5 / (transformY + 0.5)`
    distance attenuation in `drawSprites` darkens the whole sprite
    uniformly. The relative ordering of `H` (255 white) > `W` (225
    white) > `R` (220-red) > `o` (40 black) > `s` (35 shadow) is
    preserved through the multiplication, so the 3D read survives at
    every distance.

12. **No new console errors or warnings.** A 30-second smoke session
    on desktop and on touch (Chrome DevTools mobile emulation) —
    load the map, walk to a pickup, grab it, regenerate with N,
    step through to the exit, repeat — produces zero console errors
    or warnings. Verify with `node --check` against the extracted
    `<script>` body:
    ```
    grep -oP '(?s)(?<=<script>).*?(?=</script>)' index.html > /tmp/script.js
    node --check /tmp/script.js
    ```

13. **Performance unchanged.** The new sprites have the same 16×16
    framebuffer footprint as the old ones, the same number of
    populated pixels (within ~20%), and feed through the exact same
    `drawSprites` per-stripe inner loop. Target ≥ 60 FPS on desktop
    and ≥ 30 FPS on mid-range mobile — no measurable change from
    today.

## Out of Scope

- **Animation (bob, pulse, glow).** Both `SPRITES[type]` entries
  remain the same frame. A subtle vertical bob or brightness pulse
  is a polish follow-up; this spec is strictly about the static
  pixel art. The prior `pickups-health-ammo` spec already listed
  animation as out-of-scope and that decision stands.

- **Per-tier palette tinting.** Small and large variants share the
  same palette per category (one medkit palette, one ammo palette).
  A future spec could add a green-tier-large or armoured-crate
  variant; not this one.

- **Worldspace shadow as a separate floor-blob entity.** The shadow
  is baked into the sprite's bottom row as opaque dark pixels. A
  proper alpha-blended ground decal would require new code in the
  floor-cast path; not in scope.

- **Per-floor shadow colour matching.** The shadow uses a single
  dark colour per palette; it doesn't sample the floor underneath.
  On the darkest floor themes it may visually disappear; that's
  acceptable — the box-shading + outline alone still reads as 3D.

- **Refactor of `buildFrame` to support alpha blending.** The
  function still treats any non-zero rgba32 as opaque; shadow
  pixels are written opaquely. Adding partial-alpha support is a
  bigger change that this spec does not need.

- **Minimap dot colour or shape changes.** The 2×2 green/yellow
  pickup dots in `drawMinimap` are unchanged. The worldspace
  sprite palette and the minimap dot palette are intentionally
  independent — `H` (lit wood) ≠ `#fc3` (minimap yellow).

- **Enemy / projectile / exit / gun sprite redraws.** The lit-top
  / front-face / floor-shadow convention is *not* applied to imp,
  grunt, or projectiles in this spec — those are characters
  occupying the cell vertically, not floor objects. Out of scope.

- **Tuning the pickup grant numbers.** `PICKUP_HEALTH_SMALL = 25`,
  `PICKUP_HEALTH_LARGE = 60`, `PICKUP_AMMO_SMALL = 6`,
  `PICKUP_AMMO_LARGE = 14` — all unchanged. This is purely visual.

- **Tuning the pickup placement count / chance.** `PICKUP_MAX_PER_ROOM`,
  `MAX_PICKUPS`, `PICKUP_LARGE_CHANCE` — all unchanged.

- **Adding a separate "lying flat on the floor" sprite mode that
  rotates with the camera.** Pickups remain axis-aligned billboards
  that always face the player; the 3/4-perspective look is a static
  fake. A true 3D-rotated pickup (e.g. depth-sorting a top-view vs
  side-view sprite based on camera angle) is well out of scope.

## Design Notes

- **Why 3/4 perspective fakery instead of true 3D.** Pickups render
  through the existing billboard sprite pipeline — there is no real
  depth axis on a per-sprite basis. The cheapest way to make a flat
  billboard read as a 3D object on the floor is the same trick old
  pixel-art adventure games used: paint a visible "top face" (lit,
  no markings) above a "front face" (darker, with the markings).
  The eye fills in the implied bevel. Cost: zero runtime; one new
  palette entry; a few rows of rearranged pixels.

- **Why the cross moves to the front face only.** A red cross
  painted across a *horizontal stripe* in the middle of a flat
  rectangle (today's design) reads as a wall texture pattern —
  exactly like a hazard tile. A red cross painted on the *front
  face* of a box that has a visibly different top face reads as
  "this box has a cross on the side of it" — which is what a
  medkit looks like in pixel-art convention. Same applies to the
  brass: previously a horizontal brass stripe band on the front
  read as "ammo box wall tile"; the new design puts brass cartridge
  caps on the top of the crate (where they'd be visible if the
  crate were open) and leaves the front as plain wood, which reads
  as a closed wooden crate.

- **Why the floor shadow is a single dark row at row 15.** The
  sprite renderer centres each sprite at `halfH = H/2` (eye level).
  Row 15 sits at the very bottom of the rendered sprite, which is
  the lowest visible point near the floor in screen space. A single
  dark row there reads as "the object is throwing a shadow on the
  floor beneath it". A multi-row shadow blob would either require
  alpha blending (out of scope) or eat into the box rows. One row
  is enough at the low logical resolution (480×270) — the player's
  eye fills in the rest.

- **Why opaque shadow pixels are acceptable.** Without alpha
  blending the shadow row writes opaque dark pixels over whatever
  floor texture is below. On dark-themed rooms (existing theme set
  has some dark-grey / cool-grey floor variants) the shadow won't
  show up well. That's tolerable because the box outline + lit-top
  / dark-front contrast does most of the heavy lifting for "this
  is a 3D object on the floor" — the shadow is just a polish cue
  that helps on bright floors.

- **Why brass cartridge "caps" rendered on the top face only.** The
  visual contract for an ammo crate is "wooden box with bullets
  inside". A real crate of cartridges, viewed slightly from above,
  shows the round brass cap tops poking up out of an open box.
  Pixel-art conventions encode that as bright-brass dots on the
  top face with a dim shadow side on each dot. The `Yy` pattern
  per shell encodes the cylindrical highlight; two such pairs side
  by side fit in the small crate's 6-wide inner top row, three
  pairs fit in the large crate's 8-wide inner top row.

- **Why the same shading lighting direction for both sprites.** The
  visible-light direction is "upper-left" by convention: each brass
  shell has its bright cap on the left (`Y`) and its dim shadow
  edge on the right (`y`). The medkit's top face is uniformly lit
  (no internal shading) because its 1-row or 2-row top is too small
  to support meaningful left/right shading. Both sprites' implied
  light direction is consistent with the gun viewmodel's existing
  upper-left highlight in `gun-feel-polish` (which is the dominant
  on-screen light cue and is also upper-left). Don't flip the brass
  shading — it would be inconsistent with the gun.

- **Why both tiers share width.** Small medkit and small ammo crate
  are 8 wide; large medkit and large ammo crate are 10 wide. Keeping
  the per-tier width consistent across categories means the player's
  "this is a small pickup" silhouette read is the same whether it's
  health or ammo — only the markings disambiguate. The minimap dot
  colour already does the at-a-glance disambiguation; the sprite is
  the close-range disambiguation.

- **Why row 9 of the large ammo crate is a plain `H` row (no
  shells).** The two-row top face for the large crate represents a
  back-to-front extent of the top: row 8 (back) shows the visible
  shell caps, row 9 (front lip of the top) shows the wooden front
  edge before the box's front face begins. Photographic logic isn't
  what matters — what matters is that the eye reads "lit top extends
  for two rows then transitions to darker front" as depth. A second
  shell-cap row right above the front face would look like the
  shells are on the wall, not on the open top.

- **Where edits land in `index.html`:**
  - `medkitPalette` definition (`~line 1751`): replace 3-entry
    flat palette with 5-entry shading palette per AC #2.
  - `medkitSmallFrame` rows (`~line 1756-1773`): replace per AC #3.
  - `medkitLargeFrame` rows (`~line 1774-1791`): replace per AC #3.
  - `ammoPalette` definition (`~line 1793`): replace 4-entry flat
    palette with 6-entry shading palette per AC #2.
  - `ammoSmallFrame` rows (`~line 1799-1816`): replace per AC #4.
  - `ammoLargeFrame` rows (`~line 1817-1834`): replace per AC #4.
  - `SPRITES` table (`~line 1842-1845`): no edit; the existing
    `[frame, frame]` shape is correct.
  - Nothing else in the file changes.

- **Edges to verify (pixel art):**
  - Each new frame row is exactly 16 characters wide. `buildFrame`
    silently skips palette misses (`if (v)`) but a row that is
    *shorter* than 16 will leave the trailing columns transparent,
    which can produce a sliver of fog/wall behind the sprite. Easy
    way to check: every row in every frame is `'....stuff....'`
    style with the dots filling the leftover space.
  - Every character in the row maps to a key in the corresponding
    palette (or is `'.'` for transparent). Typos like a stray space
    or accidental `0`/`O` confusion will render as transparent
    pixels and produce a visible "hole" in the sprite.
  - Frame copies in `SPRITES[type]` are *the same Uint32Array
    object* (the existing pattern: `[medkitSmallFrame, medkitSmallFrame]`).
    The renderer indexes the second slot via `frames[(animPhase|0) & 1]`
    but pickups keep `animPhase = 0`, so only the first slot is ever
    read in practice. Either way both slots must be identical for
    the contract.

- **Edges to verify (gameplay flow):** all behavioural cases from
  the prior `pickups-health-ammo` spec still pass — this is a
  no-op for gameplay. Specifically re-check:
  - HP=99 + small medkit → HP=100, pop "+25 HP", sound plays.
  - HP=100 + small medkit → no grant, pickup stays, no pop, no
    sound. (Sprite visibly *unchanged* between approach and
    walk-away, which is the visual contract for skip-at-full.)
  - R after death → pickups respawn at original positions with the
    same sprite art.
  - N → fresh layout; same sprite art at new positions.
  - `?seed=4567` two reloads → same pickup positions, same sprite
    art.
  - L toggle → both sprites' top-vs-front contrast remains
    visible in lit mode (with fog) and unlit mode (with 1/d
    shade). The shadow row reads on bright-floor rooms;
    on dark-floor rooms it disappears into the floor (acceptable).
  - M toggle → no effect on sprite art (audio-only mute).

## Agent Notes

- **Read first:** `AGENTS.md`, `CLAUDE.md`, this task spec, then in
  `index.html`:
  - `~line 1568-1579` (`buildFrame` helper — string-row to
    Uint32Array baker; palette lookup is `palette[c]` with a `if (v)`
    transparent skip).
  - `~line 1748-1834` (existing pickup palettes + four pickup frame
    rows — the entire block to be replaced).
  - `~line 1836-1846` (`SPRITES` table — *do not edit*; verify
    the four pickup entries are still wired correctly after your
    palette/frame replacements).
  - `~line 3449-3580` (`drawSprites` — read for context on how the
    sprite gets centred at eye level, how alpha works (`c !== 0`
    test, no blending), and how lighting/fog modify each pixel.
    Do not edit.).

- **Order of work (recommended):**
  1. Replace the `medkitPalette` definition with the 5-entry palette
     from AC #2. `node --check` passes; nothing visually different
     yet because the frames still reference only the old keys.
  2. Replace `medkitSmallFrame` rows from AC #3. Reload → small
     medkits now show the new 3/4 perspective design.
  3. Replace `medkitLargeFrame` rows from AC #3. Reload → both
     medkit tiers render correctly.
  4. Replace the `ammoPalette` definition with the 6-entry palette
     from AC #2.
  5. Replace `ammoSmallFrame` rows from AC #4. Reload → small
     ammo crates show the new design.
  6. Replace `ammoLargeFrame` rows from AC #4. Reload → both ammo
     tiers render correctly.
  7. `node --check` against the extracted `<script>` body.
  8. Smoke test in browser (desktop + touch emulation).

- **Common pitfalls:**
  - **Row width mismatch.** Each row of each frame must be exactly
    16 characters. If you copy-paste a row and accidentally drop or
    add a `.`, `buildFrame` reads `row.charAt(x)` for x in 0..15
    and silently treats out-of-bounds as `''` (no palette match) →
    transparent column. Visual symptom: a vertical sliver of
    wall/fog showing through the sprite. Easy to miss because the
    sprite still mostly renders.
  - **Palette key collision when reusing old symbols.** The old
    `medkitPalette` had `o`, `W`, `R`. The new one keeps those
    three keys but with different rgba values (slightly darker
    outline, slightly muted `W`). Make sure you replace the *values*,
    not just append new keys — leaving an old `o` definition above
    the new one would shadow the new outline colour.
  - **Stale `c` key in `ammoPalette`.** The old palette had `c`
    (crate dark). The new palette has no `c` because the new frames
    don't use it. Don't leave `c` in the new palette as dead weight;
    it adds noise to the diff and may confuse future readers.
  - **Reordering the brass shading (`Yy` → `yY`).** The light
    direction (`Y` bright on the left, `y` dim on the right)
    matches the imp/grunt sprites and the gun viewmodel's
    upper-left highlight. Flipping each shell to `yY` shades from
    the upper right, inconsistent with the rest of the game.
  - **Putting the floor shadow above row 15.** Row 15 is the last
    visible row in the sprite. Putting the shadow at row 14 or
    earlier means the shadow appears *inside* the box's bottom
    outline, not on the floor below it. The bottom outline must be
    at row 14, the shadow at row 15.
  - **Shrinking the shadow to a single pixel.** The shadow rows in
    the spec are `'.....ssssss.....'` (small, 6 wide) and
    `'....ssssssss....'` (large, 8 wide). A 1-pixel shadow at low
    resolution flickers in and out as the sprite sub-samples. A
    multi-pixel horizontal shadow row reads stably at every
    distance.
  - **Editing the `SPRITES` table by accident.** The pickup entries
    are `[medkitSmallFrame, medkitSmallFrame]` etc. — both slots
    are the same Uint32Array. Don't substitute a "frame 2" variant;
    pickups don't animate. (If a future spec adds bob/pulse, that
    spec edits both the SPRITES entries and the `update()` path
    that advances `animPhase`. This spec does not.)
  - **Touching the existing pickup behaviour while you're in the
    neighbourhood.** The prior `pickups-health-ammo` spec is large
    and there are many one-line changes scattered through
    `index.html`. Do not "tidy" or "refactor" pickup-related code
    while making this visual change. The diff must be limited to
    the four palette + four frame replacements (plus optional
    whitespace inside that block). Anything else regresses scope.
  - **Reusing `H` for a future highlight on enemy sprites.** Each
    palette is its own dict; `H` in `medkitPalette` is `(255,255,255)`,
    while `H` in `ammoPalette` is `(170,125,80)`. The palettes are
    fully independent and don't share keys at runtime — but a
    future reader scanning the file will see `H` defined twice
    with different RGB values, one row apart. That's already the
    pattern in the file (e.g. `b` is an eye colour in
    `impPalette` and a different shade in `gruntPalette`), so it's
    consistent — but worth knowing in case you're tempted to
    "unify" them.

- **Smoke test before reporting:**

  *Desktop (Chrome / Firefox), keyboard + mouse:*
  - Reload. Pickups visible in non-starting rooms. Each pickup
    reads as a small 3D box sitting on the floor — visibly lit
    top face above a darker front face, with a slim shadow row
    just below the box.
  - Walk up to a small medkit at close range (1-2 cells). The
    red cross is painted on the *front* face, not stretched across
    the whole sprite. The top of the box is plain white (no cross).
  - Walk up to a large medkit. The cross is visibly chunkier (4
    cols wide vertical bar, 2 rows tall horizontal arm) and the
    top face is two rows tall instead of one. Tier distinction
    is obvious without looking at the minimap.
  - Walk up to a small ammo crate. The front face is solid mid-
    wood with no brass stripes. The brass shells are visible on
    the *top* face (2 shells, each with a bright cap on the left
    and a dimmer shadow on the right).
  - Walk up to a large ammo crate. The top shows 3 brass shells,
    in a slightly bigger wooden frame. Front face still solid mid-
    wood.
  - All four pickup types: at the room's far end (~10 cells), each
    pickup is still recognisable. The top/front contrast survives.
    The shadow row may not be visible at far distance — that's
    fine.
  - Walk over a small medkit at HP < 100 → HP rises (capped), pop
    "+25 HP" appears, chime plays, pickup vanishes from world and
    minimap. *Sprite visual confirmed: the box vanishes cleanly,
    no leftover pixels.* (If you see a residual sliver after grab,
    a row width is wrong.)
  - Same flow for ammo crate at ammo < 24.
  - Skip-at-full flow: stand at HP=100, walk over a medkit → no
    grant, *sprite stays visible exactly as before*. Step away,
    walk back → sprite still there. No flicker.
  - Press R after death → pickups respawn with the new art at
    original positions.
  - Press N → fresh dungeon, new pickup layout, same new art.
  - L toggle → both sprites still read as 3D-on-floor in lit
    mode (with fog) and unlit mode.
  - M toggle → audio mute only, sprite art unaffected.
  - `?seed=4567` two reloads → identical pickup positions and
    sprite art.
  - Console: zero errors, zero warnings.

  *Mobile emulation (Chrome DevTools, Touch: forced, iPhone 12 Pro):*
  - Same checklist; pickups behave identically through touch.
    Touch HUD / joystick / tap-fire / drag-look unaffected.

- **At minimum** run `node --check` against the extracted `<script>`
  body before reporting:
  ```
  grep -oP '(?s)(?<=<script>).*?(?=</script>)' index.html > /tmp/script.js
  node --check /tmp/script.js
  ```

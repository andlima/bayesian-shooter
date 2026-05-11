---
id: sprite-canvas-32
area: frontend
priority: 50
depends_on: []
description: Bump SPRITE_SIZE from 16 to 32 — imp, grunt, exit pillar, and projectile orbs are pure 2× nearest-neighbor doubles of their existing silhouettes (with a per-palette floor shadow row added to each enemy); pickups keep their current physical pixel-extent inside the bigger frame so they appear roughly half their current screen size while staying anchored to the floor.
---

# Sprite Canvas 32×32 — Detailed Enemies, Shrunk-on-Screen Pickups

## Goal

Three coupled visual problems land in this task:

1. **Pickups still feel oversized.** The previous `pickup-sprite-polish`
   shrunk the medkit / ammo boxes inside a 16×16 frame (small 8w × 6h,
   large 10w × 8h), but the renderer treats every sprite as a 1-cell
   billboard quad. At close range a "small" medkit still claims ~half
   the cell horizontally and ~half vertically — enough that it visually
   competes with an enemy.
2. **Enemies lack pixel headroom for shading.** Imp and grunt sprites
   are squeezed into 16×16. Adding lit / mid / shadow bands, eye
   pupils, or a floor shadow row crowds the silhouette to the point
   where readability degrades.
3. **No shared floor-shadow convention across sprite classes.**
   Pickups gained a 1-row shadow last task; enemies still float without
   any ground-contact cue.

Rather than introduce a per-type world-scale factor (which would mean
new render-path math in `drawSprites`, a new anchor convention, and a
migration of every sprite's vertical position), this task bumps the
single `SPRITE_SIZE` constant from **16 to 32**. The renderer math is
canvas-size-independent — `spriteH = abs(H / transformY)` always
renders the quad at 1 cell × 1 cell of screen space, and `sStep` /
`tStep` reference `SPRITE_SIZE` by name — so the on-screen *quad size*
doesn't change. Only the texture-grid resolution does.

What follows from that one constant flip:

- **Pickups** keep their existing *physical pixel extent* (small box
  8w × 6h + 6w shadow, large 10w × 8h + 8w shadow) inside the new
  32-row frame. The box now occupies ~25% of the canvas width
  (vs ~50% today) and ~22% of the canvas height (vs ~44% today). End
  result: pickups appear **roughly half their current size on screen**,
  with the same readable cross / shells motif and the same
  floor-anchored bottom row.
- **Enemies (imp, grunt)** are pure 2× nearest-neighbor doubles of
  their existing silhouettes — every old pixel becomes a 2×2 block —
  plus a 1-row floor shadow at row 31 (a new per-palette `s` key).
  The doubled pixel grid gives the existing mouth dots, eye blocks,
  and silhouette outlines proportionally more screen presence; the
  shadow row provides the ground-contact cue the pickups already
  have. Same on-screen enemy size as today; same overall look at 2×
  the texture resolution; ground-anchored.
- **Exit pillar + projectile orbs** are pure 2× nearest-neighbor
  doubles of their existing pixel art. Every existing pixel becomes a
  2×2 block in the 32-row frame. No palette additions. Same
  on-screen appearance.

All sprite logic (`drawSprites`, `buildFrame`, the `SPRITES` table
shape, the `frames[(animPhase|0) & 1]` lookup, the pickup walk-on
grant, the exit entity, the projectile entity, the per-sprite fog /
shade / wind tint blends) stays exactly as today. The single
`SPRITE_SIZE` constant flip, the 11 redrawn frame literals, the 2 new
palette entries (one `s` floor-shadow key each on `impPalette` and
`gruntPalette`), and one stale comment fix are the entire diff.

## Acceptance Criteria

1. **Single-file constraint preserved.** Still one `index.html` at the
   repo root, no build step, no external assets, no images, no SVGs,
   no external CSS, no network requests, no `localStorage`. All sprite
   pixels remain baked from inline string-row art via
   `buildFrame(rows, palette)`. No README edits required (sprite
   behaviour is unchanged; prose in the README is purely behavioural).

2. **`SPRITE_SIZE` bumped to 32.** Replace the existing
   `const SPRITE_SIZE = 16;` at `index.html:1566` with
   `const SPRITE_SIZE = 32;`. Update the adjacent comment block at
   `index.html:1563` from "Each frame is a Uint32Array(SPRITE_SIZE *
   SPRITE_SIZE); 0 = transparent." — no change needed there, it
   already references the constant. Update the stale "16×16" mention
   in the pickup palette comment at `index.html:1749` to "32×32".

3. **`drawSprites` is untouched.** `sStep = SPRITE_SIZE / spriteH`,
   `tStep = SPRITE_SIZE / spriteW`, the `texX < SPRITE_SIZE` bound
   check, and the `sprite[ty * SPRITE_SIZE + texX]` index all already
   reference `SPRITE_SIZE` by constant — flipping it to 32
   automatically scales the inner-loop math. No code changes in
   `drawSprites` (`index.html:3453`-ish through `index.html:3650`-ish).
   Grep for `\b16\b` inside the `drawSprites` body before / after the
   constant flip — there must be no literal `16` anywhere in
   `drawSprites` that survives the bump.

4. **`buildFrame` is untouched.** The function already references
   `SPRITE_SIZE` for allocation and iteration (`index.html:1568-1579`).
   It will now allocate `Uint32Array(32 * 32) = 1024` u32s per frame
   instead of 256. No code changes — only the constant changes.

   `buildFrame` requires `rows[y]` to be a defined string for every
   `y < SPRITE_SIZE`; an `undefined` row crashes (`undefined.charAt`).
   Every frame literal MUST therefore provide exactly **32 string
   rows**, each exactly **32 characters wide**. Shorter rows leave
   trailing columns transparent (visual symptom: a sliver of fog or
   wall showing through the sprite); shorter row arrays crash at
   bake time.

5. **Imp palette adds a floor shadow key.** Replace the existing
   `impPalette` literal at `index.html:1581-1587`:

   ```js
   const impPalette = {
     'R': rgba32(220,  60,  50), // bright red (body)
     'r': rgba32(140,  30,  25), // dark red outline
     'b': rgba32( 20,   0,   0), // eye / mouth dark
     'y': rgba32(255, 220,  60), // glowing eye
     'h': rgba32( 90,  20,  15), // horn / hoof
     's': rgba32( 30,   8,   6), // floor shadow (dark red-brown)
   };
   ```

   The five existing keys (`R`, `r`, `b`, `y`, `h`) keep their exact
   rgba values. `s` is new. Do not rename existing keys.

6. **Imp frame 1 redrawn at 32×32 as a pure 2× double + shadow.**
   Replace the existing `impFrame1` literal at `index.html:1588-1605`.
   Every old pixel becomes a 2×2 block; the entire 32-row frame is the
   mechanical 2× nearest-neighbor scale of today's 16×16 frame, with
   one row reclaimed for the new `s` floor shadow at row 31. The
   reclaimed row is the top empty padding: the doubled `0`-row
   `................` pair collapses to a single empty row at new
   row 0, freeing one slot at the bottom for the shadow. Every other
   original row N (for N in 1..15) is fully doubled to new rows
   `2N - 1` and `2N`. So rows 1-30 are the 15 fully-doubled silhouette
   rows; row 31 is the new shadow.

   ```js
   const impFrame1 = buildFrame([
     '................................',  //  0  (single empty padding)
     '............hhhh....hhhh........',  //  1  horn tips
     '............hhhh....hhhh........',  //  2
     '............RRRR....RRRR........',  //  3  horn red base
     '............RRRR....RRRR........',  //  4
     '..........rrRRRRRRRRRRRRrr......',  //  5  head top
     '..........rrRRRRRRRRRRRRrr......',  //  6
     '........rrRRyyRRRRRRRRyyRRrr....',  //  7  eyes
     '........rrRRyyRRRRRRRRyyRRrr....',  //  8
     '........rrRRRRbbRRRRbbRRRRrr....',  //  9  mouth / cheek dots
     '........rrRRRRbbRRRRbbRRRRrr....',  // 10
     '........rrRRRRRRRRRRRRRRRRrr....',  // 11  face
     '........rrRRRRRRRRRRRRRRRRrr....',  // 12
     '..........rrRRRRRRRRRRRRrr......',  // 13  chin
     '..........rrRRRRRRRRRRRRrr......',  // 14
     '............rrRRRRRRRRrr........',  // 15  neck
     '............rrRRRRRRRRrr........',  // 16
     '........rrRRRRRRRRRRRRRRRRrr....',  // 17  shoulders
     '........rrRRRRRRRRRRRRRRRRrr....',  // 18
     '......rrRRRRRRRRRRRRRRRRRRRRrr..',  // 19  torso widest
     '......rrRRRRRRRRRRRRRRRRRRRRrr..',  // 20
     '......rrRRRRRRRRRRRRRRRRRRRRrr..',  // 21
     '......rrRRRRRRRRRRRRRRRRRRRRrr..',  // 22
     '........rrRRRRRRRRRRRRRRRRrr....',  // 23  hips
     '........rrRRRRRRRRRRRRRRRRrr....',  // 24
     '..........rrRRrr....rrRRrr......',  // 25  legs (F1: legs inset)
     '..........rrRRrr....rrRRrr......',  // 26
     '..........rrhhrr....rrhhrr......',  // 27  hooves
     '..........rrhhrr....rrhhrr......',  // 28
     '..........hhhhhh....hhhhhh......',  // 29  hoof bottom
     '..........hhhhhh....hhhhhh......',  // 30  (second doubled row of hoof bottom)
     '..........ssssss....ssssss......',  // 31  floor shadow (two 6w puddles)
   ], impPalette);
   ```

   Row-width invariants (verify by counting each row character by
   character when editing):
   - Every row is exactly 32 characters wide.
   - Body silhouette is symmetric around col 17.5 — outlines `rr` are
     equidistant from both edges on every row, and every internal
     feature (eyes, mouth dots, leg gap) is symmetric around that
     same axis.
   - Horns (rows 1-4) are 4 wide each (cols 12-15 and 20-23) — the 2×
     double of the original 2-wide horn at cols 6-7 and 10-11.
   - Eyes at rows 7-8 are 2×2 blocks at cols 12-13 and 22-23. Mouth /
     cheek dots at rows 9-10 are 2×2 blocks at cols 14-15 and 20-21.
   - Legs (rows 25-26) leave an 8-column gap (cols 16-19 + 2 cols
     padding on each side via the leg-pillar `rrRRrr` blocks). This
     matches the doubled position of the original 4-col gap.
   - Floor shadow at row 31 is two 6-char `s` puddles at cols 10-15
     and 20-25, aligned column-for-column with the hoof bottoms on
     rows 29-30 directly above. Two puddles (not one merged blob)
     read more clearly as "two feet, two shadows" at the imp's
     legs-split stance.

7. **Imp frame 2 redrawn at 32×32 as a pure 2× double + shadow.**
   Body rows 0-24 are identical to frame 1. Frames differ only in the
   leg posture (rows 25-31) — F2 widens the leg gap by 8 columns (the
   2× scale of the original 4-col gap difference between F1 and F2).
   Pixel-exact replacement for `index.html:1606-1623`:

   ```js
   const impFrame2 = buildFrame([
     '................................',  //  0
     '............hhhh....hhhh........',  //  1
     '............hhhh....hhhh........',  //  2
     '............RRRR....RRRR........',  //  3
     '............RRRR....RRRR........',  //  4
     '..........rrRRRRRRRRRRRRrr......',  //  5
     '..........rrRRRRRRRRRRRRrr......',  //  6
     '........rrRRyyRRRRRRRRyyRRrr....',  //  7
     '........rrRRyyRRRRRRRRyyRRrr....',  //  8
     '........rrRRRRbbRRRRbbRRRRrr....',  //  9
     '........rrRRRRbbRRRRbbRRRRrr....',  // 10
     '........rrRRRRRRRRRRRRRRRRrr....',  // 11
     '........rrRRRRRRRRRRRRRRRRrr....',  // 12
     '..........rrRRRRRRRRRRRRrr......',  // 13
     '..........rrRRRRRRRRRRRRrr......',  // 14
     '............rrRRRRRRRRrr........',  // 15
     '............rrRRRRRRRRrr........',  // 16
     '........rrRRRRRRRRRRRRRRRRrr....',  // 17
     '........rrRRRRRRRRRRRRRRRRrr....',  // 18
     '......rrRRRRRRRRRRRRRRRRRRRRrr..',  // 19
     '......rrRRRRRRRRRRRRRRRRRRRRrr..',  // 20
     '......rrRRRRRRRRRRRRRRRRRRRRrr..',  // 21
     '......rrRRRRRRRRRRRRRRRRRRRRrr..',  // 22
     '........rrRRRRRRRRRRRRRRRRrr....',  // 23
     '........rrRRRRRRRRRRRRRRRRrr....',  // 24
     '........rrRRrr........rrRRrr....',  // 25  legs spread (F2: gap widens)
     '........rrRRrr........rrRRrr....',  // 26
     '........rrhhrr........rrhhrr....',  // 27  hooves
     '........rrhhrr........rrhhrr....',  // 28
     '........hhhhhh........hhhhhh....',  // 29  hoof bottom
     '........hhhhhh........hhhhhh....',  // 30
     '........ssssss........ssssss....',  // 31  shadow follows the wider stance
   ], impPalette);
   ```

   The shadow row for F2 splits into two 6-char shadow puddles at
   cols 8-13 and 22-27, aligned column-for-column with the hoof
   bottoms on rows 29-30 directly above. F1 / F2 differ only in
   cols 8-27 of rows 25-31 (the leg / hoof / shadow region).

8. **Grunt palette adds a floor shadow key.** Replace the existing
   `gruntPalette` literal at `index.html:1625-1631`:

   ```js
   const gruntPalette = {
     'G': rgba32( 90, 190,  90), // bright green
     'g': rgba32( 30, 100,  40), // dark green outline
     'b': rgba32( 10,  10,  10), // visor / eye
     'y': rgba32(240, 220, 100), // belt / detail
     'k': rgba32( 50,  60,  50), // boot / glove
     's': rgba32( 15,  30,  18), // floor shadow (dark green-brown)
   };
   ```

   The five existing keys keep their exact rgba values. `s` is new.
   Do not rename existing keys.

9. **Grunt frame 1 + frame 2 redrawn at 32×32 as pure 2× doubles +
   shadow.** Same scheme as the imp — pure 2× nearest-neighbor double
   of every existing row, with one row reclaimed at the top of the
   frame (the doubled empty row 0 → single empty row 0) so the new
   `s` floor shadow lands at row 31. Pixel-exact replacements for
   `index.html:1632-1667`:

   ```js
   const gruntFrame1 = buildFrame([
     '................................',  //  0  (single empty padding)
     '..........gggggggggggg..........',  //  1  helmet top
     '..........gggggggggggg..........',  //  2
     '........ggGGGGGGGGGGGGgg........',  //  3  helmet
     '........ggGGGGGGGGGGGGgg........',  //  4
     '........ggGGbbbbbbbbGGgg........',  //  5  visor band
     '........ggGGbbbbbbbbGGgg........',  //  6
     '........ggGGGGGGGGGGGGgg........',  //  7  jaw
     '........ggGGGGGGGGGGGGgg........',  //  8
     '......ggGGGGGGGGGGGGGGGGgg......',  //  9  shoulders
     '......ggGGGGGGGGGGGGGGGGgg......',  // 10
     '....ggGGggGGGGGGGGGGGGggGGgg....',  // 11  arms (with inner shoulder seam)
     '....ggGGggGGGGGGGGGGGGggGGgg....',  // 12
     '....ggGGggGGGGGGGGGGGGggGGgg....',  // 13
     '....ggGGggGGGGGGGGGGGGggGGgg....',  // 14
     '....ggGGGGGGGGGGGGGGGGGGGGgg....',  // 15  torso
     '....ggGGGGGGGGGGGGGGGGGGGGgg....',  // 16
     '......ggGGyyyyyyyyyyyyGGgg......',  // 17  belt band
     '......ggGGyyyyyyyyyyyyGGgg......',  // 18
     '......ggGGGGGGGGGGGGGGGGgg......',  // 19  hip
     '......ggGGGGGGGGGGGGGGGGgg......',  // 20
     '........ggGGGGGGGGGGGGgg........',  // 21  hip narrowing
     '........ggGGGGGGGGGGGGgg........',  // 22
     '........ggGGgg....ggGGgg........',  // 23  legs split (F1: legs inset)
     '........ggGGgg....ggGGgg........',  // 24
     '........ggGGgg....ggGGgg........',  // 25
     '........ggGGgg....ggGGgg........',  // 26
     '........ggkkgg....ggkkgg........',  // 27  boot tops
     '........ggkkgg....ggkkgg........',  // 28
     '........kkkkkk....kkkkkk........',  // 29  boot soles
     '........kkkkkk....kkkkkk........',  // 30
     '........ssssss....ssssss........',  // 31  shadow under each boot
   ], gruntPalette);
   const gruntFrame2 = buildFrame([
     '................................',  //  0
     '..........gggggggggggg..........',  //  1
     '..........gggggggggggg..........',  //  2
     '........ggGGGGGGGGGGGGgg........',  //  3
     '........ggGGGGGGGGGGGGgg........',  //  4
     '........ggGGbbbbbbbbGGgg........',  //  5
     '........ggGGbbbbbbbbGGgg........',  //  6
     '........ggGGGGGGGGGGGGgg........',  //  7
     '........ggGGGGGGGGGGGGgg........',  //  8
     '......ggGGGGGGGGGGGGGGGGgg......',  //  9
     '......ggGGGGGGGGGGGGGGGGgg......',  // 10
     '....ggGGggGGGGGGGGGGGGggGGgg....',  // 11
     '....ggGGggGGGGGGGGGGGGggGGgg....',  // 12
     '....ggGGggGGGGGGGGGGGGggGGgg....',  // 13
     '....ggGGggGGGGGGGGGGGGggGGgg....',  // 14
     '....ggGGGGGGGGGGGGGGGGGGGGgg....',  // 15
     '....ggGGGGGGGGGGGGGGGGGGGGgg....',  // 16
     '......ggGGyyyyyyyyyyyyGGgg......',  // 17
     '......ggGGyyyyyyyyyyyyGGgg......',  // 18
     '......ggGGGGGGGGGGGGGGGGgg......',  // 19
     '......ggGGGGGGGGGGGGGGGGgg......',  // 20
     '........ggGGGGGGGGGGGGgg........',  // 21
     '........ggGGGGGGGGGGGGgg........',  // 22
     '......ggGGgg........ggGGgg......',  // 23  legs spread (F2: gap widens)
     '......ggGGgg........ggGGgg......',  // 24
     '......ggGGgg........ggGGgg......',  // 25
     '......ggGGgg........ggGGgg......',  // 26
     '......ggkkgg........ggkkgg......',  // 27
     '......ggkkgg........ggkkgg......',  // 28
     '......kkkkkk........kkkkkk......',  // 29
     '......kkkkkk........kkkkkk......',  // 30
     '......ssssss........ssssss......',  // 31
   ], gruntPalette);
   ```

   Row-width invariants:
   - Every row exactly 32 characters wide.
   - Body silhouette symmetric around col 15.5 — outlines `gg` are
     equidistant from both edges on every row, and every internal
     feature (visor band, belt, leg gap) is symmetric around that
     same axis.
   - Helmet top (rows 1-2) is 12 chars of `g` at cols 10-21 — the 2×
     double of the original 6-wide top at cols 5-10.
   - Visor band (rows 5-6) is 8 chars of `b` at cols 12-19 — the 2×
     double of the original 4-wide visor at cols 6-9.
   - Arm seams (rows 11-14) — the inner `gg` columns at cols 8-9 and
     22-23 inside the outer `gg` outline at cols 4-5 and 26-27 — read
     as a 2-row arm-shoulder seam, doubled from the single-col seam
     of the original `gGgGGGGGGgGg` row.
   - Belt (rows 17-18) is 12 chars of `y` at cols 10-21 — the 2×
     double of the original 6-wide belt at cols 5-10.
   - Leg pillars (rows 23-28 in F1; rows 23-28 in F2 wider stance)
     are 6 wide each (cols 8-13 and 18-23 in F1; cols 6-11 and 20-25
     in F2). The boots flare into 6-wide solid `kkkkkk` at the very
     bottom (rows 29-30).
   - Floor shadow (row 31) splits into two 6-char shadow puddles,
     one under each boot, aligned column-for-column with the boot
     soles directly above.

10. **Exit pillar 2× nearest-neighbor double.** Replace the existing
    `exitFrame` at `index.html:1677-1694` with the doubled rows below.
    The original 16×16 pillar (palette / `hh` cap / `chCh` reflective
    cap / `cCCc` body / `cccc` base) is mechanically scaled — each
    pixel in the old frame becomes a 2×2 block in the new frame. Same
    on-screen appearance as today. `exitPalette` (`index.html:1672-1676`)
    is unchanged.

    ```js
    const exitFrame = buildFrame([
      '............hhhhhhhh............',  //  0
      '............hhhhhhhh............',  //  1
      '............cchhCChh............',  //  2
      '............cchhCChh............',  //  3
      '............ccCCCCcc............',  //  4
      '............ccCCCCcc............',  //  5
      '............ccCCCCcc............',  //  6
      '............ccCCCCcc............',  //  7
      '............ccCCCCcc............',  //  8
      '............ccCCCCcc............',  //  9
      '............ccCCCCcc............',  // 10
      '............ccCCCCcc............',  // 11
      '............ccCCCCcc............',  // 12
      '............ccCCCCcc............',  // 13
      '............ccCCCCcc............',  // 14
      '............ccCCCCcc............',  // 15
      '............ccCCCCcc............',  // 16
      '............ccCCCCcc............',  // 17
      '............ccCCCCcc............',  // 18
      '............ccCCCCcc............',  // 19
      '............ccCCCCcc............',  // 20
      '............ccCCCCcc............',  // 21
      '............ccCCCCcc............',  // 22
      '............ccCCCCcc............',  // 23
      '............ccCCCCcc............',  // 24
      '............ccCCCCcc............',  // 25
      '............ccCCCCcc............',  // 26
      '............ccCCCCcc............',  // 27
      '............ccCCCCcc............',  // 28
      '............ccCCCCcc............',  // 29
      '............cccccccc............',  // 30
      '............cccccccc............',  // 31
    ], exitPalette);
    ```

    Doubling rule verification: the original row 0 was
    `......hhhh......` (6 dots + 4 h + 6 dots = 16). Doubled: each
    char duplicates → `............hhhhhhhh............`
    (12 dots + 8 h + 12 dots = 32). Each old row becomes two
    consecutive new rows. The pillar visually identical to today.

11. **Imp projectile 2× nearest-neighbor double.** Replace the
    existing `impProjFrame` at `index.html:1704-1721`:

    ```js
    const impProjFrame = buildFrame([
      '................................',  //  0
      '................................',  //  1
      '................................',  //  2
      '................................',  //  3
      '................................',  //  4
      '................................',  //  5
      '................................',  //  6
      '................................',  //  7
      '................................',  //  8
      '................................',  //  9
      '............yyyyyyyy............',  // 10
      '............yyyyyyyy............',  // 11
      '..........yyYYYYYYYYyy..........',  // 12
      '..........yyYYYYYYYYyy..........',  // 13
      '..........yyYYWWWWYYyy..........',  // 14
      '..........yyYYWWWWYYyy..........',  // 15
      '..........yyYYWWWWYYyy..........',  // 16
      '..........yyYYWWWWYYyy..........',  // 17
      '..........yyYYYYYYYYyy..........',  // 18
      '..........yyYYYYYYYYyy..........',  // 19
      '............yyyyyyyy............',  // 20
      '............yyyyyyyy............',  // 21
      '................................',  // 22
      '................................',  // 23
      '................................',  // 24
      '................................',  // 25
      '................................',  // 26
      '................................',  // 27
      '................................',  // 28
      '................................',  // 29
      '................................',  // 30
      '................................',  // 31
    ], impProjPalette);
    ```

    `impProjPalette` is unchanged (`index.html:1699-1703`).

12. **Grunt projectile 2× nearest-neighbor double.** Replace the
    existing `gruntProjFrame` at `index.html:1729-1746`:

    ```js
    const gruntProjFrame = buildFrame([
      '................................',  //  0
      '................................',  //  1
      '................................',  //  2
      '................................',  //  3
      '................................',  //  4
      '................................',  //  5
      '................................',  //  6
      '................................',  //  7
      '............gggggggg............',  //  8
      '............gggggggg............',  //  9
      '..........ggGGGGGGGGgg..........',  // 10
      '..........ggGGGGGGGGgg..........',  // 11
      '........ggGGGGCCCCGGGGgg........',  // 12
      '........ggGGGGCCCCGGGGgg........',  // 13
      '........ggGGCCWWWWCCGGgg........',  // 14
      '........ggGGCCWWWWCCGGgg........',  // 15
      '........ggGGCCWWWWCCGGgg........',  // 16
      '........ggGGCCWWWWCCGGgg........',  // 17
      '........ggGGGGCCCCGGGGgg........',  // 18
      '........ggGGGGCCCCGGGGgg........',  // 19
      '..........ggGGGGGGGGgg..........',  // 20
      '..........ggGGGGGGGGgg..........',  // 21
      '............gggggggg............',  // 22
      '............gggggggg............',  // 23
      '................................',  // 24
      '................................',  // 25
      '................................',  // 26
      '................................',  // 27
      '................................',  // 28
      '................................',  // 29
      '................................',  // 30
      '................................',  // 31
    ], gruntProjPalette);
    ```

    `gruntProjPalette` is unchanged (`index.html:1723-1728`).

13. **Medkit palette unchanged; small + large frames redrawn at
    32×32 with the same physical pixel extent.** Keep
    `medkitPalette` exactly as today (`index.html:1751-1757`). Replace
    the small + large frame literals at `index.html:1758-1793`:

    ```js
    // sprite-canvas-32: small medkit. Same 8w × 6h box + 6w floor
    // shadow as today's pickup-sprite-polish design, now in a 32-row
    // frame. The smaller fraction of the canvas means the box renders
    // at ~half its current screen size while staying floor-anchored.
    const medkitSmallFrame = buildFrame([
      '................................',  //  0
      '................................',  //  1
      '................................',  //  2
      '................................',  //  3
      '................................',  //  4
      '................................',  //  5
      '................................',  //  6
      '................................',  //  7
      '................................',  //  8
      '................................',  //  9
      '................................',  // 10
      '................................',  // 11
      '................................',  // 12
      '................................',  // 13
      '................................',  // 14
      '................................',  // 15
      '................................',  // 16
      '................................',  // 17
      '................................',  // 18
      '................................',  // 19
      '................................',  // 20
      '................................',  // 21
      '................................',  // 22
      '................................',  // 23
      '................................',  // 24
      '............oooooooo............',  // 25  outline top
      '............oHHHHHHo............',  // 26  lit top face
      '............oWWRRWWo............',  // 27  front face row 1
      '............oRRRRRRo............',  // 28  front face row 2
      '............oWWRRWWo............',  // 29  front face row 3
      '............oooooooo............',  // 30  outline bottom
      '.............ssssss.............',  // 31  floor shadow (6 wide)
    ], medkitPalette);

    // sprite-canvas-32: large medkit. Same 10w × 8h box + 8w shadow
    // as today's pickup-sprite-polish design, biased to the bottom of
    // the new 32-row canvas.
    const medkitLargeFrame = buildFrame([
      '................................',  //  0
      '................................',  //  1
      '................................',  //  2
      '................................',  //  3
      '................................',  //  4
      '................................',  //  5
      '................................',  //  6
      '................................',  //  7
      '................................',  //  8
      '................................',  //  9
      '................................',  // 10
      '................................',  // 11
      '................................',  // 12
      '................................',  // 13
      '................................',  // 14
      '................................',  // 15
      '................................',  // 16
      '................................',  // 17
      '................................',  // 18
      '................................',  // 19
      '................................',  // 20
      '................................',  // 21
      '................................',  // 22
      '...........oooooooooo...........',  // 23  outline top
      '...........oHHHHHHHHo...........',  // 24  lit top face row 1
      '...........oHHHHHHHHo...........',  // 25  lit top face row 2
      '...........oWWRRRRWWo...........',  // 26  front face row 1
      '...........oRRRRRRRRo...........',  // 27  front face row 2
      '...........oRRRRRRRRo...........',  // 28  front face row 3
      '...........oWWRRRRWWo...........',  // 29  front face row 4
      '...........oooooooooo...........',  // 30  outline bottom
      '............ssssssss............',  // 31  floor shadow (8 wide)
    ], medkitPalette);
    ```

    Row-width invariants:
    - Every row exactly 32 chars.
    - Small box: outline cols 12 + 19, inner cols 13-18 (6 wide), top
      outline row 25, bottom outline row 30, shadow at row 31 cols
      13-18 (6 wide, narrower than the outline by 1 col on each side
      so the shadow doesn't touch the box's outer edge).
    - Large box: outline cols 11 + 20, inner cols 12-19 (8 wide), top
      outline row 23, bottom outline row 30, shadow at row 31 cols
      12-19 (8 wide).
    - Both boxes are horizontally centred (col 15.5 is the centre of
      a 32-wide canvas; the box outlines bracket it symmetrically).
    - Box bottom (row 30) is 1 row above the shadow (row 31). Same
      bottom-of-frame anchor convention as `pickup-sprite-polish`.

14. **Ammo palette unchanged; small + large frames redrawn at 32×32
    with the same physical pixel extent.** Keep `ammoPalette` exactly
    as today (`index.html:1795-1802`). Replace the small + large
    frame literals at `index.html:1803-1838`:

    ```js
    // sprite-canvas-32: small ammo crate. Same 8w × 6h box + 6w
    // shadow as today's pickup-sprite-polish design.
    const ammoSmallFrame = buildFrame([
      '................................',  //  0
      '................................',  //  1
      '................................',  //  2
      '................................',  //  3
      '................................',  //  4
      '................................',  //  5
      '................................',  //  6
      '................................',  //  7
      '................................',  //  8
      '................................',  //  9
      '................................',  // 10
      '................................',  // 11
      '................................',  // 12
      '................................',  // 13
      '................................',  // 14
      '................................',  // 15
      '................................',  // 16
      '................................',  // 17
      '................................',  // 18
      '................................',  // 19
      '................................',  // 20
      '................................',  // 21
      '................................',  // 22
      '................................',  // 23
      '................................',  // 24
      '............oooooooo............',  // 25  outline top
      '............oHYyYyHo............',  // 26  brass shells on lit top (2 shells)
      '............oCCCCCCo............',  // 27  front face row 1
      '............oCCCCCCo............',  // 28  front face row 2
      '............oCCCCCCo............',  // 29  front face row 3
      '............oooooooo............',  // 30  outline bottom
      '.............ssssss.............',  // 31  floor shadow
    ], ammoPalette);

    // sprite-canvas-32: large ammo crate. Same 10w × 8h box + 8w
    // shadow as today's pickup-sprite-polish design.
    const ammoLargeFrame = buildFrame([
      '................................',  //  0
      '................................',  //  1
      '................................',  //  2
      '................................',  //  3
      '................................',  //  4
      '................................',  //  5
      '................................',  //  6
      '................................',  //  7
      '................................',  //  8
      '................................',  //  9
      '................................',  // 10
      '................................',  // 11
      '................................',  // 12
      '................................',  // 13
      '................................',  // 14
      '................................',  // 15
      '................................',  // 16
      '................................',  // 17
      '................................',  // 18
      '................................',  // 19
      '................................',  // 20
      '................................',  // 21
      '................................',  // 22
      '...........oooooooooo...........',  // 23  outline top
      '...........oHYyYyYyHo...........',  // 24  brass shells (3 shells)
      '...........oHHHHHHHHo...........',  // 25  lit-wood front lip of top
      '...........oCCCCCCCCo...........',  // 26  front face row 1
      '...........oCCCCCCCCo...........',  // 27  front face row 2
      '...........oCCCCCCCCo...........',  // 28  front face row 3
      '...........oCCCCCCCCo...........',  // 29  front face row 4
      '...........oooooooooo...........',  // 30  outline bottom
      '............ssssssss............',  // 31  floor shadow
    ], ammoPalette);
    ```

    Row-width invariants:
    - Same column positions as the medkit boxes (small at cols 12-19
      outline cols, large at cols 11-20 outline cols).
    - Small ammo box row 26 (`oHYyYyHo`): 1 outline `o` + 1 lit-wood
      `H` + 2 brass shells (`YyYy`, two `Yy` pairs encoding cylindrical
      shading bright-cap-left / dim-edge-right) + 1 lit-wood `H` + 1
      outline = 8 chars total.
    - Large ammo box row 24 (`oHYyYyYyHo`): 1 outline + 1 lit-wood +
      3 brass shells (`YyYyYy`) + 1 lit-wood + 1 outline = 10 chars.
    - The shell shading convention `Y` (bright) left, `y` (dim) right
      matches the imp/grunt upper-left light direction and the gun
      viewmodel — do not reorder to `yY`.

15. **`SPRITES` table unchanged.** All 9 entries
    (`index.html:1840-1850`) keep the same `[frame, frame]` shape with
    the same Uint32Array references. No edits.

16. **Stale comment at `index.html:1749` updated.** The line currently
    reads (paraphrased) "Pixels biased to the lower half of the 16×16
    frame so the sprite reads as 'on the floor'". Update the
    `16×16` to `32×32` (or the lower portion thereof). One word
    change; do not rewrite the comment otherwise.

17. **No other code changes.** No edits to enemy AI, projectile
    physics, exit cell logic, pickup grant logic, walk-on tests,
    determinism flow, `applyDungeon`, `resetRun`, `advanceLevel`,
    `update`, render-pass ordering, fog / lighting / vignette /
    atmosphere constants, HUD, minimap, touch overlay, audio, or any
    tuning constants.

18. **Determinism preserved.** Sprite art is data, not logic. The
    renderer math (`spriteH`, `transformY`, fog blend, shade fallback,
    flash tint, wind tint, z-buffer test) is canvas-size-independent.
    Verify by loading `?seed=1234` twice and confirming dungeon,
    enemy spawns, pickup positions, and exit cell are byte-identical
    between reloads.

19. **Pickup screen size visibly halves.** At close range (1-2 cells
    away), a small medkit's rendered pixel footprint must visibly be
    roughly half its previous size in both dimensions. Verify by
    eye: previously the medkit occupied ~50% of the cell horizontally;
    now it occupies ~25%. Same for vertical extent.

20. **Pickup remains floor-anchored at all distances.** The box
    bottom (row 30) and shadow (row 31) sit at the bottom of the
    sprite's vertical extent. Since `drawSprites` centres the sprite
    at `halfH = H/2 = eye level`, rows 16-31 render below the
    horizon, i.e. on the floor. Walk up to a pickup at close,
    mid (~5 cells), and far (~10 cells) ranges; the pickup never
    floats at eye level at any distance.

21. **Enemy on-screen size unchanged from today.** Walk up to an imp
    at close range. The imp's rendered silhouette extent (head crown
    to hoof tip) takes up the same fraction of the cell vertically and
    horizontally as the previous 16×16 design. Same for the grunt.
    Verify visually with the same seed (`?seed=4567`) — enemy
    positions are unchanged; only their texture detail changes.

22. **Enemy floor shadow reads as a ground-contact cue.** With
    atmosphere lighting on (`L` toggle): the shadow rows on both
    enemies sit just below the visible body extent and read as a
    short dark smear on the floor. With lighting off: the legacy
    `5 / (transformY + 0.5)` shade attenuation darkens the whole
    sprite uniformly; the shadow remains darker than the body so the
    ground-contact cue survives.

23. **No new console errors or warnings.** A 30-second smoke session
    on desktop (Chrome / Firefox) and on touch (Chrome DevTools
    mobile emulation) — load the map, walk through to a pickup,
    fight an imp, fight a grunt, reach the exit, advance to the next
    level, press R after death, press N for a fresh dungeon —
    produces zero console errors or warnings. Verify with
    `node --check` against the extracted `<script>` body:

    ```
    grep -oP '(?s)(?<=<script>).*?(?=</script>)' index.html > /tmp/script.js
    node --check /tmp/script.js
    ```

25. **Performance unchanged or within budget.** The renderer hot-path
    cost per sprite scales with `spriteH × spriteW` (screen pixels,
    not texture pixels). On-screen quads are unchanged size; per-frame
    texture reads are unchanged in count. The per-sprite memory cost
    quadruples (16² = 256 u32s → 32² = 1024 u32s per frame), but
    total sprite-pixel memory across 11 frames is now
    `11 × 1024 × 4 = 44 KB` — negligible. Bake time at startup
    increases by 4× (256 → 1024 chars to parse per frame) but
    `buildFrame` runs once at IIFE init, not per frame. Target ≥ 60
    FPS on desktop and ≥ 30 FPS on mid-range mobile — no measurable
    change from today.

## Out of Scope

- **Per-type world-scale factor in `drawSprites`.** This task does
  the equivalent via canvas-bumping. A future task could add a per-
  type scale (e.g., for a future "boss" enemy that should render at
  2× world scale, occupying 2 cells of screen); that requires touching
  `spriteH`, `drawStartY`, and the anchor convention — well out of
  scope here.

- **Sprite animation beyond the existing 2-frame idle.** The imp /
  grunt still alternate frames F1 / F2 at the existing ~4 Hz cadence
  driven by `animPhase`. Adding walk-cycle frames (4 or 8 per cycle),
  attack-frame, or hit-reaction frames is a future polish — would
  need new `SPRITES[type]` array shape and `animPhase` update logic.
  Not in this task.

- **Per-theme enemy palette tinting.** Imp / grunt palettes are
  global — they do not retint based on the room theme (crypt / foundry
  / cavern). A theme-tinted enemy (e.g., a foundry-grunt with rust
  highlights) is a future spec. Out of scope here.

- **Floor shadow as a separate alpha-blended decal.** Shadow rows
  remain opaque dark pixels baked into the sprite frame. A real
  alpha-blended ground decal that samples the floor underneath would
  require alpha support in `buildFrame` and an alpha-blend branch in
  `drawSprites`; not in scope.

- **Damage-flash and wind-tint behavior changes.** The existing
  branches in `drawSprites` (`flash`: full white overlay during
  `hitFlashUntil`; `tint`: red-bright shift during `mode === 'wind'`)
  apply to every non-zero texel of the new sprites just as today. No
  changes to those branches. The shadow row will flash white during a
  hit (currently it would too, since flash overwrites every visible
  pixel) — that's a known visual artefact unchanged from today, not a
  regression introduced by this task.

- **Exit pillar visual changes.** The pillar is a pure 2× double —
  every old pixel becomes a 2×2 block. No re-art, no floor base, no
  glow ramp tweak. A future "level-exit-feel" spec could add those.

- **Projectile orb visual changes.** Same — pure 2× double. No new
  trail, no halo tweak, no rotation.

- **`SPRITE_SIZE` higher than 32.** 32 is the chosen bump. Going to 48
  or 64 gives more detail headroom but at 16x the memory of 16×16,
  and the existing sprite extents (silhouettes drawn at 14-15 rows of
  16) would need more aggressive redraws to fill the canvas. 32 is
  the right balance between fidelity gain and diff size.

- **Renaming any palette key.** All existing palette keys keep their
  exact rgba values. The new `s` key (per-palette floor shadow) is the
  only addition on each of `impPalette` and `gruntPalette`. No
  collisions with existing keys in any palette.

- **Editing other generators or texture bakers.** Wall textures, floor
  textures, ceiling textures, fog/atmosphere helpers, gun viewmodel
  sprite, HUD glyphs — none change.

- **Tuning gameplay constants.** No edits to `TYPE_TABLE`,
  `PICKUP_*`, `FIRE_COOLDOWN_MS`, `PROJECTILE_*`, enemy spawn rates,
  AI windup, or any other tuning. This is a pure-aesthetics +
  resolution-bump spec.

## Design Notes

### Why bump SPRITE_SIZE instead of a per-type scale factor

There are two clean ways to make pickups appear smaller:

1. **Per-type world-scale factor.** Add a `SPRITE_SCALE[type]` table
   (1.0 for enemies, 0.5 for pickups). In `drawSprites`, multiply
   `spriteH = abs(H * scale / transformY)`. Add a per-type vertical
   anchor (eye-level for enemies, floor-level for pickups) so small
   sprites don't float at eye height. Re-derive `drawStartY` per
   sprite.
2. **Canvas-size bump.** Flip `SPRITE_SIZE` from 16 to 32. Render
   path is unchanged (canvas-size-independent). Pickups keep their
   physical pixel-extent; enemies are redrawn at 2× linear resolution
   to keep their on-screen size.

Approach 1 is more flexible (any per-sprite scale, multiple anchor
conventions, no texture memory growth). But it adds branching to the
renderer's hot-path inner loop, introduces a new anchor convention
that every future sprite must opt into, and the existing pickups
already encode "anchor to floor" via their lower-half-of-frame pixel
placement — which approach 2 preserves directly. Approach 2 is also
diff-bounded: one constant flip, 11 redrawn frame literals, 2 new
palette entries. No renderer-path code changes.

The trade-off accepted: pickup texture memory triples (8×6 = 48
filled pixels in a 256-pixel frame → same 48 pixels in a 1024-pixel
frame). 1024 - 48 = 976 transparent pixels per pickup frame ×
4 pickup frames = ~3.8 KB of dead memory. Negligible given the
project's overall memory budget.

### Why the enemy redraws are pure 2× doubles (no highlight column)

A naive thought: use the extra resolution headroom in the 32-row
canvas to paint shading bands or a lit-edge highlight on the enemies.
Tempting, but fragile — a single highlight column displaced inside
the doubled silhouette shifts adjacent body pixels relative to other
rows that lack the displacement, and the resulting per-row alignment
wobble reads worse than a flat-but-consistent silhouette. This spec
keeps the enemy art as a *pure* mechanical 2× nearest-neighbor double
of the existing silhouettes — every old pixel becomes a 2×2 block —
plus exactly one structural change: a 1-row `s` floor shadow at row
31, which doesn't displace any body pixels.

The detail gain comes for free from the doubled grid: the original
imp's single-pixel mouth `b` becomes a 2-pixel-wide `bb` block;
the cheek/mouth-corner `b` dots become 2×2 blocks; the visor band
on the grunt becomes 8 pixels wide instead of 4. Each of these
features had to read at minimum-resolution on a 16-row frame; at
32 rows the same features have headroom to read as deliberate
pixel-art rather than as the absolute lowest-resolution version
of the same shape. That's enough fidelity gain for this task. A
future spec can layer a lit-edge highlight on top once the
silhouette positions are locked in.

### Why the floor shadow row is `s` not blended pixel-by-pixel

`buildFrame` has no alpha support — pixels are opaque (`rgba32`) or
transparent (key not in palette). A real alpha-blended ground decal
that samples the floor texel underneath would require a separate
render-pass and alpha logic in `drawSprites`, both out of scope. The
opaque `s` shadow pixel is the cheapest "ground contact" cue: it
draws as a dark blob just below the body, which the eye reads as a
shadow even though it's a flat dark sprite pixel. On bright floors
the contrast is strong; on dark floors the shadow disappears into
the floor — acceptable, since the body silhouette already does most
of the heavy lifting for "this is a 3D object."

### Why pickups stay at the same physical pixel extent

The pickup-sprite-polish spec settled on small 8×6 + large 10×8 as
the readable footprint for the cross / shell motifs. Smaller than
that and the cross becomes a 2-pixel-wide stripe or a single-pixel
shell cap, which doesn't read as a distinct icon at sprite-render
scale. The 8×6 / 10×8 extent is already the legibility floor.

By keeping that extent and letting the canvas grow to 32×32, the
*screen size* of the pickup shrinks proportionally — exactly the
visual outcome the user asked for. The motifs remain legible because
they're still 8 pixels of cross or 2-3 brass shells.

### Why exit pillar + projectiles are pure 2× doubles

The exit pillar and the projectile orbs are already at the right
on-screen size — the pillar reads as a tall glowing column, the
orbs read as bright spheres. There's no design problem to solve.
Doubling them mechanically preserves their look while satisfying
the canvas-size invariant (every frame must be 32×32). A pure
nearest-neighbor double is the lowest-risk option: it cannot
introduce visual regressions because the rendered pixels are an
exact superset of the previous design.

A future spec could re-art the exit pillar with smooth-shaded glow
edges or the projectile orbs with a rotating halo. This spec keeps
them frozen.

### Why halfH = SPRITE_SIZE/2 remains the anchor

`drawSprites` centres each sprite at `halfH = H >> 1` (screen-space
eye level), and `drawStartY = -spriteH/2 + halfH`. That means the
*vertical middle* of the sprite's texture (row `SPRITE_SIZE/2`,
which is row 16 in the new 32×32 frame) corresponds to eye level on
screen. Pixels above row 16 render above eye level; pixels below
row 16 render below eye level (toward the floor).

For enemies the silhouette spans roughly rows 2-30 — most of the
body sits in the upper-mid of the frame, with feet near the floor.
For pickups the box sits at rows 25-30, well below eye level —
floor-anchored. This is the same anchor convention as the previous
16×16 sprites; the only thing that changes is the absolute row
indices.

### Why each frame has 32 fully-spelled-out rows

`buildFrame` indexes `rows[y]` for `y` in `0..SPRITE_SIZE-1` (now
0..31). If `rows.length < 32`, `rows[y]` is undefined and
`undefined.charAt(x)` throws at bake time. So every frame literal
MUST be a 32-element array, even when most rows are 32 dots (empty).

It's tempting to add a helper like `padFrame(rows, height = 32)` that
auto-pads short row arrays with empty rows. Don't — keeping every
frame's full 32 rows visible makes diffs easy to read and prevents
silent off-by-one row-index errors. The dead rows compress well
under any source-control diff.

### Where edits land in `index.html`

- `SPRITE_SIZE` declaration (`~line 1566`): `16` → `32`.
- Pickup comment block (`~line 1748-1750`): one word fix
  `16×16` → `32×32`.
- `impPalette` (`~line 1581`): add the `s` key.
- `impFrame1` (`~line 1588-1605`): replace with 32-row literal
  per AC #6.
- `impFrame2` (`~line 1606-1623`): replace with 32-row literal
  per AC #7.
- `gruntPalette` (`~line 1625`): add the `s` key.
- `gruntFrame1` (`~line 1632-1649`): replace per AC #9.
- `gruntFrame2` (`~line 1650-1667`): replace per AC #9.
- `exitFrame` (`~line 1677-1694`): replace with 2×-doubled rows
  per AC #10.
- `impProjFrame` (`~line 1704-1721`): replace with 2×-doubled rows
  per AC #11.
- `gruntProjFrame` (`~line 1729-1746`): replace per AC #12.
- `medkitSmallFrame` (`~line 1758-1775`): replace per AC #13.
- `medkitLargeFrame` (`~line 1776-1793`): replace per AC #13.
- `ammoSmallFrame` (`~line 1803-1820`): replace per AC #14.
- `ammoLargeFrame` (`~line 1821-1838`): replace per AC #14.
- `SPRITES` table (`~line 1840-1850`): no edit; verify after the
  frame replacements that all 9 entries still reference the
  freshly-named Uint32Arrays correctly.
- `drawSprites` (`~line 3453-3650`): no edit; verify via grep that
  it contains no literal `16` after the constant flip.

### Symbols added

```js
// In impPalette:
's': rgba32( 30,   8,   6),  // floor shadow
// In gruntPalette:
's': rgba32( 15,  30,  18),  // floor shadow
```

### Symbols removed

None. All existing palette keys, frame names, and the `SPRITES`
table shape are preserved.

## Agent Notes

- **Read first:** `AGENTS.md`, `CLAUDE.md`, this task spec, the prior
  `specs/tasks/pickup-sprite-polish.md` (for the lit-top / shadow-row
  convention), then in `index.html`:
  - `SPRITE_SIZE` + `buildFrame` (`~line 1561-1579`).
  - All existing sprite palettes + frames (`~line 1581-1838`).
  - `SPRITES` table (`~line 1840-1850`).
  - `drawSprites` (`~line 3453-3650`) — read for context on how the
    sprite gets centred at eye level, how alpha works
    (`c !== 0` test, no blending), how flash / wind tint / fog blend
    modify each pixel. Do not edit.

- **Order of work (recommended):**
  1. Flip `SPRITE_SIZE = 16` → `SPRITE_SIZE = 32`. At this point
     every existing frame is a 16-row array, which will crash
     `buildFrame` on the 17th row because `rows[16]` is undefined.
     **Do not reload yet.** Continue editing frames before testing.
  2. Replace `impFrame1` and `impFrame2` with the 32-row literals
     from AC #6 / #7. Add the `s` key to `impPalette`.
  3. Replace `gruntFrame1` and `gruntFrame2` per AC #9. Add the `s`
     key to `gruntPalette`.
  4. Replace `exitFrame` per AC #10.
  5. Replace `impProjFrame` per AC #11.
  6. Replace `gruntProjFrame` per AC #12.
  7. Replace `medkitSmallFrame` + `medkitLargeFrame` per AC #13.
  8. Replace `ammoSmallFrame` + `ammoLargeFrame` per AC #14.
  9. Update the stale comment at `~line 1749` (`16×16` → `32×32`).
  10. Run `node --check` against the extracted `<script>` body
      (see AC #24). Fix any syntax errors before reloading.
  11. Reload in the browser. Confirm the dungeon loads, enemies
      appear, pickups appear, exit pillar appears, and a fired
      projectile is visible. Walk through the smoke-test checklist
      below.

- **Common pitfalls:**
  - **Forgetting a row in a 32-row frame.** `buildFrame` crashes on
    `undefined.charAt(...)`. Visual symptom: dev-tools console error
    at page-load, "Cannot read properties of undefined (reading
    'charAt')". Easy fix: count the rows in the literal. Every frame
    literal must be exactly 32 entries.
  - **Row width mismatch (< 32 chars).** Silent bug. `row.charAt(x)`
    returns `''` for x >= row.length, which doesn't match any
    palette key, so the pixel is transparent. Visual symptom: a
    vertical sliver of fog or wall showing through one edge of the
    sprite. Easy fix: count chars per row. Every row must be exactly
    32 characters.
  - **Row width mismatch (> 32 chars).** `buildFrame` indexes only
    x in 0..31, so trailing characters are silently ignored. The
    sprite renders correctly but the source is misleading. Easy fix:
    trim trailing characters. Strict 32 chars per row.
  - **Forgetting to add the `s` key to the palettes.** The new
    sprite art uses the `s` shadow key; `buildFrame` silently skips
    unmatched chars (treats them as transparent). Visual symptom:
    the shadow pixels are invisible, but the rest of the sprite
    renders correctly. The enemy looks like it's floating. Grep for
    `s` in each enemy palette after the edit.
  - **Reordering palette keys.** Palette keys are looked up by
    string character (`palette[c]`), so order doesn't matter
    functionally. But for readability, keep the order:
    bright-body, outline, eye/visor, accent (`y`), boot/horn (`k` /
    `h`), shadow (`s`). Diff-friendly.
  - **Editing `drawSprites`.** Don't. The renderer math is
    canvas-size-independent. Any edit to `drawSprites` will
    introduce a regression. Grep for `\b16\b` inside the
    `drawSprites` body before reporting — there must be zero literal
    `16` anywhere in the function.
  - **Reusing `s` across palettes with different rgba values.** Each
    palette is its own dict (palette lookup is `pal[c]`, where `pal`
    is the per-sprite palette argument to `buildFrame`). So
    `impPalette.s` and `gruntPalette.s` can have different values
    without collision. The spec deliberately gives them slightly
    different rgba (red-brown vs green-brown) so the shadow tints
    its respective sprite's hue family. Do not unify them.
  - **Confusing on-screen size with texture size.** The on-screen
    rendered quad is `spriteH × spriteW = (H/transformY)²`
    pixels. That's unchanged by the canvas bump. The number of
    *texture* samples per rendered pixel changes
    (`tStep = SPRITE_SIZE / spriteW` halves; each rendered pixel
    samples a smaller texel). At very close range the doubled
    texture resolution shows more detail; at far range the
    undersampling is the same as today.
  - **Trying to test the pickup-shrink before all enemy frames are
    32-row.** Mixing 16-row and 32-row frames inside the same
    `SPRITES` table works at the JS layer (each frame is its own
    Uint32Array), but `drawSprites` uses `SPRITE_SIZE` as the
    texture stride — so a 16-row frame interpreted as 32 rows reads
    garbage in the second half. Result: visual corruption on
    sprites whose frames haven't been updated yet. Do not partially
    test; finish all 11 frame replacements before reloading.
  - **Adding new pixel ART beyond what this spec specifies.** The
    spec provides the exact 32 rows for every frame. Resist the
    urge to add a logo on the medkit, scratches on the ammo crate,
    a different leg posture, etc. Stick to the provided rows.
    Visual tweaks are a follow-up spec.

- **Smoke test before reporting:**

  *Desktop (Chrome / Firefox), keyboard + mouse:*
  - Reload. Dungeon renders, FPS counter visible, console clean.
  - Walk into the first room with an enemy. The imp / grunt
    silhouette is the same shape and on-screen size as before, but
    visibly crisper at 2× pixel density: the mouth dots, eye blocks,
    and visor band each occupy roughly twice the pixel area, and a
    1-row floor shadow sits just beneath each foot.
  - Walk into a room with a pickup. The medkit / ammo crate is
    visibly **smaller** than before — roughly half the width and
    half the height it had previously. The cross / brass shells
    are still readable. The shadow row sits just below the box.
  - Step over a pickup → pickup vanishes, +HP or +ammo pop fires,
    sound plays.
  - Engage an enemy. Hit-flash overlays the entire sprite (including
    shadow row, which momentarily flashes white — known behavior).
    Kill the enemy.
  - Look at the exit pillar from across a room. It reads as today
    — same on-screen size, same glow, same proportions.
  - Get hit by an imp projectile and a grunt projectile. The
    projectile orbs render at the same size as today (the pure
    2× double preserves the appearance).
  - Walk to the exit. Advance level. New dungeon, new sprite art
    everywhere with the same redrawn detail.
  - Press R after death → enemies and pickups respawn with the new
    art.
  - Press N for a fresh dungeon → same.
  - `?seed=4567` two reloads → byte-identical first frame.
  - L toggle → atmosphere on/off; sprite art visible in both modes.
    Floor shadow reads as a dark smear under each enemy/pickup in
    both lit and unlit mode.
  - M toggle → no effect on art.

  *Mobile emulation (Chrome DevTools, Touch: forced, iPhone 12 Pro):*
  - Same checklist. Sprite art is unchanged by touch — confirm
    touch joystick / tap-fire / drag-look unaffected.

- **At minimum** run `node --check` against the extracted `<script>`
  body before reporting:
  ```
  grep -oP '(?s)(?<=<script>).*?(?=</script>)' index.html > /tmp/script.js
  node --check /tmp/script.js
  ```

  Also grep for accidental literal-16 usage inside the sprite
  renderer:
  ```
  awk '/function drawSprites/,/^  }/' /tmp/script.js | grep -n '\b16\b'
  ```
  Should produce zero output. Any non-zero output is a regression
  to fix before reporting.

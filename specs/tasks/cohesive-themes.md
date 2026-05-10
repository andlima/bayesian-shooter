---
id: cohesive-themes
area: frontend
priority: 50
depends_on: []
description: Rethink the three room themes for visual harmony — each room picks one wall material from its theme (no per-cell mix), all wall/floor/ceiling generators within a theme sample from a shared palette, and all 14 textures are rewritten so each biome reads as one coherent place.
---

# Cohesive Themes — One Material Per Room, Unified Palettes

## Goal

The current `room-themes` system gives every cell its own wall variant via
`pickWallVariant` (50% base / 30% primary accent / 20% secondary accent
hashed by `(x, y, seed)`). Within a single room the player sees all three
of the theme's materials peppered across the four walls — the room reads
as visually chaotic rather than themed. Floors and ceilings are
theme-fixed but their palette anchors were specced independently from the
walls, so a foundry floor doesn't visibly belong to the same world as a
foundry wall.

This task rethinks the look-and-feel from scratch around three coordinated
changes:

1. **One wall material per room.** Each room is assigned a single
   `materialIdx` ∈ {0, 1, 2} drawn from its theme's three options. Every
   wall cell of that room — and every wall cell of the corridor leading
   away from it, until BFS hits another room's territory — gets that one
   material. Within-room walls become uniform; cross-room variety carries
   the visual interest now. Corridors inherit nearest-room material the
   same way they inherit theme today (multi-source BFS).

2. **Unified palette per theme.** Each theme defines a small (5-color)
   anchor palette: `shadow`, `base`, `highlight`, `accent`, plus one
   theme-specific `extra`. All generators within the theme — three walls,
   one floor, one ceiling — draw colors as lerps between these anchors
   plus per-pixel noise. No hardcoded RGB literals in any generator
   except the palette declarations themselves. The result: a foundry
   floor and a foundry wall share hue/value DNA and read as the same
   place.

3. **All 14 generators rewritten.** The existing
   `genBrick`/`genStone`/`genFloor`/`genCeiling` generators (preserved
   verbatim by the prior spec to keep crypt pixel-stable) are replaced.
   Every theme's generators are tuned together — silhouettes, contrast,
   noise scale, accent density — for cohesion. Crypt is reborn as a
   palette-driven rewrite, not a verbatim hold.

The cell-data model stays close to today: `MAP[y][x]` still encodes the
wall texture index 1..9, `THEME_MAP[y][x]` still tracks the per-cell
theme index. What changes: the per-cell variant is no longer
`pickWallVariant`-hashed — it's per-room with BFS inheritance, the same
way theme is propagated today.

## Acceptance Criteria

1. **Single-file constraint preserved.** Still one `index.html` at the
   repo root, no `package.json`, no external assets, no build step, no
   `localStorage`, no network requests. All new state, palette
   declarations, generators, and propagation logic live inside the
   existing IIFE.

2. **Theme set unchanged.** The same three theme ids in the same order:
   `THEMES = ['crypt', 'foundry', 'cavern']` (`index.html:1411`-ish).
   `themeIdx` ∈ {0, 1, 2} mapping is unchanged; the 9-wall +
   3-floor + 3-ceiling shape is unchanged. What changes is per-room
   material assignment, palette unification, and every generator's
   output.

3. **Per-theme palette anchors.** Declare a module-scope const next to
   `THEMES`:
   ```js
   const THEME_PALETTES = [
     { // 0: crypt — gothic stone keep
       shadow:    [38, 46, 58],     // deep mortar / shadow
       base:      [86, 96, 112],    // mid slate
       highlight: [142, 150, 164],  // lit stone face
       accent:    [148, 80, 58],    // warm brick red
       extra:     [76, 116, 92],    // muted moss-on-stone
     },
     { // 1: foundry — industrial iron works
       shadow:    [26, 24, 28],     // black iron / soot
       base:      [78, 76, 82],     // mid steel grey
       highlight: [136, 134, 140],  // lit metal edge
       accent:    [168, 92, 48],    // rust orange
       extra:     [228, 124, 44],   // hot ember
     },
     { // 2: cavern — wet limestone cave
       shadow:    [36, 32, 28],     // damp shadow
       base:      [102, 94, 80],    // mid weathered stone
       highlight: [148, 138, 122],  // lit rock face
       accent:    [82, 116, 70],    // moss green
       extra:     [108, 84, 56],    // packed earth brown
     },
   ];
   ```
   Each anchor is a `[r, g, b]` triple (numbers 0..255). The order of
   keys (`shadow`/`base`/`highlight`/`accent`/`extra`) is part of the
   contract — generators reference these by name. Numbers are tuning
   starting points; ±10% adjustments per channel are acceptable, but do
   not depart from the family (no swapping crypt's accent to green, no
   making foundry highlights warmer than its accent, etc.).

4. **One palette helper.** Add a small generator helper that lerps two
   anchors and writes an `rgba32` packed pixel. Living near `rgba32`
   (`index.html:866`) is a good spot:
   ```js
   // mix(a, b, t) — linear interpolation between two [r,g,b] triples,
   // returning a packed rgba32. t is clamped to [0, 1] internally.
   function mix(a, b, t) {
     const tt = t < 0 ? 0 : (t > 1 ? 1 : t);
     const r = (a[0] + (b[0] - a[0]) * tt) | 0;
     const g = (a[1] + (b[1] - a[1]) * tt) | 0;
     const bb = (a[2] + (b[2] - a[2]) * tt) | 0;
     return rgba32(r, g, bb);
   }
   // mix3(a, b, c, t) — three-stop lerp, t ∈ [0,1] → t<0.5 mixes a→b,
   // t≥0.5 mixes b→c. Used to drive value-noise textures across a
   // shadow→base→highlight ramp in one call.
   function mix3(a, b, c, t) {
     return (t < 0.5) ? mix(a, b, t * 2) : mix(b, c, (t - 0.5) * 2);
   }
   ```
   These two are the only color-blending primitives the generators use.
   Direct `rgba32(literal, literal, literal)` calls are forbidden inside
   any generator body — the only literals allowed are the anchors in
   `THEME_PALETTES` (#3) and the existing helpers (`MORTAR` for floor,
   etc., become palette-derived).

5. **Generators are palette-parameterized.** Each of the 14 generators
   accepts a single `pal` argument (one of `THEME_PALETTES[i]`) and
   returns a 64×64 `Uint32Array`. Internal noise/pattern is unchanged
   (still uses `lcg` + `addOctave` + per-generator seed constants), but
   every output pixel is `mix(...)` / `mix3(...)` of palette anchors —
   never a hardcoded color. Per-generator seed constants (`0xb12c50ed`,
   etc.) stay distinct so noise fields don't accidentally overlap, and
   each generator instantiates its own `lcg` (no shared PRNG).

6. **Crypt generators (rewritten).** Three walls + floor + ceiling, all
   driven by `THEME_PALETTES[0]`:

   - `genCryptBrick(pal)` — brick-row pattern (8-px-tall rows, 16-px
     bricks, alternating-row half-offset, same as today's `genBrick`).
     Mortar = `pal.shadow`. Brick face = `mix(pal.shadow, pal.accent, 0.55 + 0.35*v)`
     where `v` is the existing per-brick variation [0.78, 1.20].
     Top-row highlight: `mix(face, pal.highlight, 0.20)`. Bottom-row
     shadow: `mix(face, pal.shadow, 0.30)`. Drop the magic per-channel
     ±22/±26 deltas — this lerp does the same job consistently.
   - `genCryptStone(pal)` — three-octave value noise (scales 8 / 16 / 32,
     strengths 1.00 / 0.55 / 0.30). Output color =
     `mix3(pal.shadow, pal.base, pal.highlight, n)` where `n` is the
     normalized noise value clamped to [0, 1]. No blue tint — color
     comes entirely from the palette's grey-blue base.
   - `genCryptMossy(pal)` — same noise scaffolding as `genCryptStone`,
     same `mix3` ramp, then overlay a moss patch pass: a single
     `addOctave(field, 8, 1.0, rand)` field; for each pixel where the
     overlay > 0.62, replace the pixel with
     `mix(currentPixel, pal.extra, 0.55 + overlay*0.30)`. ~15-25% of
     pixels should read as moss splotches over the stone.
   - `genCryptFloor(pal)` — 16-px tile grid (same structure as today's
     `genFloor`). Mortar = `pal.shadow`. Tile face =
     `mix(pal.shadow, pal.base, 0.45 + 0.45*v)` where `v` is the
     per-tile variation. Drop the warm-brown floor tint — crypt floor
     now reads as the same slate-blue family as crypt stone walls.
   - `genCryptCeiling(pal)` — single-octave value noise (scale 8). Color
     = `mix(pal.shadow, pal.base, 0.30 + 0.40*n)`. Slightly darker than
     the floor so up/down still reads correctly.

7. **Foundry generators.** Three walls + floor + ceiling, all driven by
   `THEME_PALETTES[1]`:

   - `genFoundryIron(pal)` — horizontal plate pattern, plates 8-px tall,
     16-px wide (same row/col grid as `genCryptBrick`). Plate face =
     `mix(pal.shadow, pal.accent, 0.55 + 0.30*v)`. Top edge of each
     plate: `mix(face, pal.highlight, 0.18)`. Bottom edge:
     `mix(face, pal.shadow, 0.35)`. Rivets: 2×2 dark squares at every
     plate's two visible corners colored `mix(pal.shadow, [0,0,0], 0.5)`
     — palette-derived shadow squared.
   - `genFoundryPanel(pal)` — dark grey metal sheet. Single-octave value
     noise (scale 16, strength 1.0), color =
     `mix(pal.shadow, pal.base, 0.55 + 0.40*n)`. Vertical seam: column
     `x === 32` colored `mix(pal.shadow, [0,0,0], 0.25)`. Horizontal
     seam: row `y === 32` same color. Reads as a 2×2 panel grid at any
     tile.
   - `genFoundryScorch(pal)` — charred concrete: very dark base with
     embers. Single-octave value noise (scale 16, strength 1.0), color
     = `mix(pal.shadow, pal.base, 0.30 + 0.40*n)`. Then a sparse ember
     pass: per-pixel hash via `(x * 0x1f1f1f1f) ^ (y * 0x9e3779b1) ^
     0xemberseed` finalized and modulo'd; where `h % 1000 < 18`
     (i.e. ~1.8% of pixels) overwrite with `pal.extra` (the hot ember
     anchor). Embers must be 1-px (no 2×2) so they read as sparks.
   - `genFoundryFloor(pal)` — dark tread plate. Single-octave value
     noise (scale 16), color = `mix(pal.shadow, pal.base, 0.40 + 0.35*n)`.
     Then a 4-pixel diagonal tread stripe: where `((x + y) % 8) < 4`,
     darken to `mix(currentPixel, pal.shadow, 0.35)`. No mortar grid.
   - `genFoundryCeiling(pal)` — black iron with girder striping.
     Single-octave value noise (scale 8), color =
     `mix(pal.shadow, [0,0,0], 0.40 + 0.20*(1-n))` — i.e. always darker
     than the floor. Every 8th row (`y % 8 === 0`): darken to
     `mix(currentPixel, pal.shadow, 0.40)` for a single pixel-row girder
     hint.

8. **Cavern generators.** Three walls + floor + ceiling, all driven by
   `THEME_PALETTES[2]`:

   - `genCavernRock(pal)` — weathered limestone. Three-octave value
     noise (scales 8 / 16 / 32, strengths 1.00 / 0.65 / 0.40 — slightly
     higher than crypt for more pitting). Color =
     `mix3(pal.shadow, pal.base, pal.highlight, n)`.
   - `genCavernMoss(pal)` — rock heavily overgrown. Same noise
     scaffolding as `genCavernRock`, then a heavy moss overlay: an
     `addOctave(field, 8, 1.0, rand)` pass; for each pixel where the
     overlay > 0.45 (lower threshold than crypt mossy → much more moss),
     replace with `mix(currentPixel, pal.accent, 0.55 + overlay*0.35)`.
     Then a darker speckle pass: per-pixel hash where `h % 100 < 20`,
     `mix(currentPixel, pal.shadow, 0.35)` for moss-clump texture.
   - `genCavernDirt(pal)` — packed earth. Two-octave value noise
     (scales 8 / 16, strengths 1.0 / 0.5), color =
     `mix3(pal.shadow, pal.extra, pal.base, n)` — uses `pal.extra`
     (packed earth brown) as the mid-tone instead of `pal.base`. Then a
     darker grit pass: per-pixel hash where `h % 100 < 22`, multiply
     pixel by 0.75. No banding pattern.
   - `genCavernFloor(pal)` — wet earthen rock. Two-octave value noise
     (scales 8 / 16), color = `mix(pal.shadow, pal.extra, 0.40 + 0.40*n)`.
     Sparse darker puddle patches: an `addOctave(field, 8, 1.0, rand)`
     pass; where the overlay > 0.55, multiply pixel by 0.55 for the
     wet-puddle dim. No tile grid.
   - `genCavernCeiling(pal)` — rough cave roof. Two-octave value noise
     (scales 8 / 16, strengths 1.0 / 0.45), color =
     `mix(pal.shadow, pal.base, 0.30 + 0.35*n)`. Slightly higher
     contrast than `genCryptCeiling` so it reads as natural rock.

9. **`TEXTURES` block reorganized.** Replace the existing `TEXTURES`
   literal (`index.html:1394`-ish) with one structured per-theme:
   ```js
   const TEXTURES = {
     crypt_brick:     genCryptBrick(THEME_PALETTES[0]),
     crypt_stone:     genCryptStone(THEME_PALETTES[0]),
     crypt_mossy:     genCryptMossy(THEME_PALETTES[0]),
     crypt_floor:     genCryptFloor(THEME_PALETTES[0]),
     crypt_ceiling:   genCryptCeiling(THEME_PALETTES[0]),
     foundry_iron:    genFoundryIron(THEME_PALETTES[1]),
     foundry_panel:   genFoundryPanel(THEME_PALETTES[1]),
     foundry_scorch:  genFoundryScorch(THEME_PALETTES[1]),
     foundry_floor:   genFoundryFloor(THEME_PALETTES[1]),
     foundry_ceiling: genFoundryCeiling(THEME_PALETTES[1]),
     cavern_rock:     genCavernRock(THEME_PALETTES[2]),
     cavern_moss:     genCavernMoss(THEME_PALETTES[2]),
     cavern_dirt:     genCavernDirt(THEME_PALETTES[2]),
     cavern_floor:    genCavernFloor(THEME_PALETTES[2]),
     cavern_ceiling:  genCavernCeiling(THEME_PALETTES[2]),
   };
   ```
   The keys' string ids are unchanged from today (so the
   `WALL_VARIANTS` / `FLOOR_VARIANTS` / `CEIL_VARIANTS` lookup arrays
   keep working with no rename). The 14-generator order in the
   `TEXTURES` literal mirrors theme order (crypt → foundry → cavern),
   matching the source-file's reading order (#10).

   The old generator names (`genBrick`, `genStone`, `genFloor`,
   `genCeiling`) are renamed in place to `genCryptBrick`,
   `genCryptStone`, `genCryptFloor`, `genCryptCeiling` so the per-theme
   prefix is consistent across all 14 generators. Bodies are rewritten
   per #6.

10. **Generator source-order mirrors theme order.** In `index.html`,
    declare in this order, in this single contiguous block (replacing
    the current `genBrick`/.../`genCavernCeiling` block at
    `index.html:886`-`index.html:1390`-ish):
    1. `mix`, `mix3` helpers (after `rgba32`, before any generator).
    2. `lcg` (unchanged).
    3. `addOctave` (unchanged — still the value-noise primitive).
    4. `genCryptBrick`, `genCryptStone`, `genCryptMossy`,
       `genCryptFloor`, `genCryptCeiling`.
    5. `genFoundryIron`, `genFoundryPanel`, `genFoundryScorch`,
       `genFoundryFloor`, `genFoundryCeiling`.
    6. `genCavernRock`, `genCavernMoss`, `genCavernDirt`,
       `genCavernFloor`, `genCavernCeiling`.
    7. `THEMES`, `THEME_PALETTES`, `TEXTURES`, `WALL_VARIANTS`,
       `FLOOR_VARIANTS`, `CEIL_VARIANTS` (in that order).

    Source-file reading order matches `THEMES` array order — when the
    next aesthetic spec adds a fourth theme, the slot to add is
    visually obvious.

11. **Per-room material assignment.** Inside `generateDungeon`
    (`index.html:1818`-`index.html:2035`), in the per-room theme
    assignment loop (currently at `index.html:1953`):
    ```js
    for (let r = 0; r < rooms.length; r++) {
      rooms[r].themeIdx    = Math.floor(rand() * THEMES.length);
      rooms[r].materialIdx = Math.floor(rand() * 3);
    }
    ```
    Two `rand()` calls per room, both seeded by the existing dungeon
    `rand`. The order of calls (theme first, then material) is part of
    the determinism contract — swapping them changes the output for a
    given seed.

    No "force diversity" guard — a level may legitimately end up with
    every room landing on `materialIdx = 0` if RNG lands that way. The
    natural variety of theme + material combinations across ~10 rooms
    per level gives enough visual interest without a guard.

12. **BFS propagates theme AND material.** The existing multi-source
    BFS (`index.html:1961`-`index.html:1990`) currently produces only
    `themeMap`. Extend it to produce a parallel `materialMap`:
    ```js
    const themeMap    = new Uint8Array(W * H);
    const materialMap = new Uint8Array(W * H);
    const tDist = new Int16Array(W * H);
    tDist.fill(-1);
    const tQueue = [];

    for (let r = 0; r < rooms.length; r++) {
      const room = rooms[r];
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) {
          const i = y * W + x;
          themeMap[i]    = room.themeIdx;
          materialMap[i] = room.materialIdx;
          tDist[i] = 0;
          tQueue.push(i);
        }
      }
    }

    let head = 0;
    while (head < tQueue.length) {
      const i = tQueue[head++];
      const cx = i % W, cy = (i / W) | 0;
      for (let n = 0; n < 4; n++) {
        const nx = cx + dxs[n], ny = cy + dys[n];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (tDist[ni] !== -1) continue;
        tDist[ni] = tDist[i] + 1;
        themeMap[ni]    = themeMap[i];
        materialMap[ni] = materialMap[i];
        tQueue.push(ni);
      }
    }
    ```
    Same iteration order, same tiebreak (first-seen wins), same
    determinism guarantee. Only addition is the parallel `materialMap`
    write per visited cell. `materialMap` is consumed in the wall-cell
    assignment loop (#13) and then discarded (no need to keep it past
    `generateDungeon`'s return).

13. **Wall-cell texture index is per-room, not per-cell-hashed.**
    Replace the wall-type assignment at `index.html:1998-1999`:
    ```js
    const variant = pickWallVariant(x, y, seed);
    map[y][x] = themeMap[y * W + x] * 3 + variant + 1;
    ```
    with the BFS-derived material:
    ```js
    map[y][x] = themeMap[y * W + x] * 3 + materialMap[y * W + x] + 1;
    ```
    Same range (1..9), same encoding (themeIdx*3 + materialIdx + 1),
    but the variant is now read from the cell's BFS-propagated material
    rather than computed by spatial hash. All wall cells inside one
    room (same theme + same material) write the same `map` value;
    corridors inherit from their nearest room.

14. **`pickWallVariant` removed.** Delete the function entirely
    (`index.html:1807`-ish, ~12 lines including the comment block above
    it). No callers remain after #13. Grep for `pickWallVariant`
    post-edit; should be zero matches.

15. **`MAP` cell value semantics unchanged.** `MAP[y][x] === 0` is
    "empty (passable)". Any non-zero value is "wall (blocking)", with
    the value 1..9 encoding which wall texture exactly as today. All
    existing readers (`tryMove`, `castColumn`, `castRay`, `isWall`,
    `enemyCanSeePlayer`, AI movement, `drawMinimap`) keep working
    unchanged — none of them care that variant selection moved from
    per-cell-hash to per-room.

16. **`THEME_MAP` semantics unchanged.** Still a `Uint8Array(MAP_W *
    MAP_H)` storing themeIdx ∈ {0,1,2} per cell. Still populated by
    `generateDungeon`'s BFS (unchanged from #12). Still consumed by
    `castFloorCeiling` per-pixel (unchanged) and `drawMinimap`
    per-cell (unchanged). The only renderer change is in
    `castFloorCeiling`'s floor/ceiling lookup — `FLOOR_VARIANTS[theme]`
    and `CEIL_VARIANTS[theme]` reads are unchanged, but the
    *contents* of those textures are different per #6/#7/#8.

17. **`MM_THEME_COLOR` retuned to match new palettes.** Update
    `index.html:3024`:
    ```js
    const MM_THEME_COLOR = ['#5a6878', '#a85c30', '#52744a'];
    // crypt = slate blue-grey, foundry = rust orange, cavern = mossy green.
    ```
    Each minimap dot is a recognizable mid-tone reading of the theme's
    `accent` (or `base`, where `accent` would be too saturated). The
    colors are pure visual cues — they don't need to match a sampled
    pixel exactly, but they must read as the theme at minimap scale.
    The old `'#c8503c'` (warm-red crypt) is replaced because crypt's
    new palette is cool slate-blue dominant; the warm-red dot would
    misrepresent the biome.

18. **Determinism preserved end-to-end.** Same dungeon `seed` →
    deterministically same map, same theme assignment, same material
    assignment, same BFS tiebreak, same per-pixel texture bytes.
    Verifiable by running `?seed=12345` twice and confirming the first
    rendered frame is byte-identical (existing test for prior texture
    work). All new generators use `lcg(constant)` with distinct
    constants per generator (no shared PRNG between them), so adding a
    16th generator later doesn't shift existing texture output.

19. **Performance.** ≥ 30 FPS at 480×270 with the existing 48×48
    procedural dungeon. The renderer hot-path cost is unchanged from
    today — `THEME_MAP` lookup count per frame is identical, wall
    lookup is one array index, no per-pixel branching on theme. The
    only new bake-time cost is the rewritten generators (still 14
    generators, still ~64×64 each); total bake budget stays under
    50 ms on modern hardware. The `mix` / `mix3` helpers add a few
    arithmetic ops per pixel during bake but not in the render loop.

20. **Atmosphere fog and vignette unchanged.** `FOG_C`, `FOG_NEAR`,
    `FOG_FAR`, `SKY_TOP`, `VIGNETTE_INNER`, `VIGNETTE_OUTER`,
    `VIGNETTE_DARKEN` are all untouched. The fog blend in
    `castFloorCeiling` and `render` reads the just-sampled texel and
    lerps it toward `FOG_C` exactly as today. With the new palette-
    aligned textures, the cool blue-grey fog now sits comfortably
    against crypt (it shares hue family) and against foundry/cavern
    (it desaturates them with distance, which reads as atmospheric
    haze). No per-theme fog tinting in this task — that's deferred
    explicitly (out of scope below).

21. **No regressions.** The following all keep working identically:
    - Pointer-lock click hint, `WASD`/arrow movement, mouse-look.
    - Player firing, hit-confirms, kill pops, ammo HUD, gun viewmodel,
      muzzle flash and wash.
    - Enemy AI (windup/fire/contact damage), enemy projectiles,
      damage flash, damage arrow, damage vignette.
    - Level exit, `R` reset, `N` regenerate, `?seed=` URL param.
    - `L` lighting toggle (still flips atmosphere on/off; both paths
      now read theme-aware floor/ceiling textures with the new
      palette-driven content).
    - `M` mute toggle, all SFX cadence.
    - Mobile DOM joystick, tap-fire, drag-look, util-row N / L / M,
      RESET on death, tap-to-begin overlay.
    - FPS counter, lighting debug label.
    - Sprite z-buffer (sprites still occlude correctly behind walls).
    - Minimap player triangle, enemy dots, exit cell rendering.

22. **No new console errors or warnings** during a 60-second walk that
    visits at least one room of each theme, regenerates the dungeon
    (`N`) at least three times, exits to a new level at least once,
    and toggles `L` at least twice. Also verify via `node --check`
    against the extracted `<script>` body, as in prior tasks:
    ```
    grep -oP '(?s)(?<=<script>).*?(?=</script>)' index.html > /tmp/script.js
    node --check /tmp/script.js
    ```

23. **Single-file, single-IIFE invariant.** All new helpers (`mix`,
    `mix3`), palette declarations (`THEME_PALETTES`), and rewritten
    generators live inside the existing IIFE. No top-level
    declarations, no globals.

## Out of Scope

- Adding a fourth theme. The `THEMES` / `THEME_PALETTES` /
  `WALL_VARIANTS` / `FLOOR_VARIANTS` / `CEIL_VARIANTS` shapes are sized
  for exactly three; a fourth would be a future spec.
- Per-theme fog tint. `FOG_C` stays global. The user evaluated the
  trade-off and decided themes carry mood through surface color alone
  in this task.
- Per-theme music or SFX cadence. Audio is unchanged.
- Per-theme enemy palettes or sprite recolors. Sprites continue to use
  their existing single palette regardless of theme.
- Theme-locked rooms or theme-as-difficulty-tier. All themes coexist
  on level 1 onward; no progression gating.
- Per-level theme lock (e.g., "level 3 is all-foundry"). Themes and
  materials are assigned per-room within each level.
- Cross-theme transition effects (gradients along corridors, fade-in
  zones). Hard cell-by-cell change at the boundary, exactly as today.
- More than three materials per theme. The 9-wall slot count stays.
- Animated textures (flickering scorch embers, dripping moss, etc.).
  Textures still bake once at startup and remain static.
- Decorative props or pickups (torches, barrels, crates, bones). World
  content is still empty rooms + walls; visual variety comes from
  surface treatment only.
- Theme-tinted minimap *floor* fill. The minimap continues to leave
  floor cells transparent against the dark backdrop; only wall cell
  fill gets theme color (#17).
- A theme picker, debug overlay listing each room's theme/material, or
  `?themes=` / `?materials=` URL parameters. The seed already controls
  everything deterministically.
- Reworking `addOctave`, `lcg`, `rgba32`, `castColumn`,
  `castFloorCeiling`'s structure, `generateDungeon`'s room placement /
  corridor carving / connectivity check / exit pick / enemy spawn, or
  `applyDungeon`. The only additions to `generateDungeon` are the
  per-room `materialIdx` (#11) and the parallel `materialMap` in the
  BFS (#12).
- Stats/counters for "rooms by theme" or "rooms by material". `stats`
  is unchanged.
- Tuning combat constants (`PROJECTILE_*`, `MUZZLE_*`, `KICK_*`,
  damage, ammo, `FIRE_COOLDOWN_MS`, etc.). This is a pure-aesthetics
  spec.

## Design Notes

### Why per-room material instead of per-cell-hashed

The existing 50/30/20 hash works fine in *theory* — every cell
deterministically picks one of three materials, weighted toward the
"base." In practice, the human eye reads a 4-cell-wide room with each
wall containing a randomly-spotted mix of brick, stone, and mossy stone
as **cluttered**, not **textured**. The unification gain is one of
visual grammar: "this room is the brick room" reads instantly; "this
wall has 2 brick cells, 1 stone cell, 1 mossy cell" reads as noise.

Cross-room variety still lands. With ~10 rooms per typical level and 9
total wall materials, the average level shows 4-7 different materials
across rooms — plenty of variety, but each *room* is internally
consistent.

### Why unified palettes

Generators originally specced their own RGB constants independently:
`crypt_floor` was `(112, 100, 84)` (warm brown), `crypt_brick` was
`(175, 78, 56)` (warm red), `crypt_stone` was `(92, 110, 148)` (cool
blue). The three colors don't share a family; standing in a crypt room
means looking at a warm-brown floor under cool-blue walls behind a
warm-red brick wall. Each individual texture is fine; together they
fight.

A 5-anchor palette (shadow / base / highlight / accent / extra) gives
generators just enough degrees of freedom to differentiate three wall
materials within one theme (each material picks a different lerp
weighting / overlay structure) while guaranteeing they share a value
range and hue family.

The `mix` / `mix3` helpers encode this as a discipline: if you can't
express a color as a lerp between palette anchors, you don't get to
write that color into the texture.

### Why exactly 5 anchors per theme

- `shadow` and `base` cover the dark-to-mid value range that 80% of
  texture pixels live in.
- `highlight` covers the 10% bright-edge pixels (lit faces, top brick
  rows, rivets-edge highlights).
- `accent` is the theme's "signature" warm or saturated color: brick
  red, rust orange, moss green. Used heavily in one wall material
  (variant 0 = base material — brick / iron / rock all use accent
  prominently), sparingly in floor/ceiling.
- `extra` is the per-theme third wall material's distinguishing color:
  crypt mossy → muted moss-on-stone; foundry scorch → hot ember
  orange; cavern dirt → packed earth brown.

Five anchors is enough for three meaningfully-different walls + a
floor + a ceiling without forcing repetition. Four would push two of
the wall materials onto identical color territory; six would let
generators drift outside the theme's family.

### Why corridor inheritance is BFS-from-rooms

Corridors are 1 cell wide and connect two rooms. A naive "corridor
takes its own material" approach would make corridors visually distinct
from both rooms, creating a sandwich (brick room → corridor → stone
room would render as brick-X-stone). Inheriting nearest-room material
makes the corridor visually belong to whichever room it's closer to,
with the transition happening at the BFS-equidistant midpoint cell.

Because the BFS is multi-source (every room cell seeds with `tDist=0`),
the equidistance tiebreak is "first room iterated wins" — deterministic
per seed. Two adjacent rooms with different materials produce a clean
single-cell boundary; the player crosses one cell line and the wall
material flips.

### Why same-theme adjacency reads fine

Two adjacent rooms of the same theme but different materials (say,
crypt-brick and crypt-stone) share palette anchors. The boundary cell
flips wall texture but both walls live in the same color family —
shared shadow, shared highlight, shared mid-tones. The transition is
visible (different silhouette: brick lines vs noise field) but not
jarring (no hue mismatch).

Two adjacent rooms of *different* themes (say, foundry-iron next to
cavern-rock) flip palette entirely. That's the intended biome
boundary — the player feels they've stepped into a different place.
The hard cell-line transition is fine because corridors funnel the
player's attention and the new room's full palette envelops the view
within ~2 steps.

### Crypt floor color regression note

The previous spec preserved `genFloor` byte-identical, which kept the
old warm-brown stone-tile floor under crypt's blue walls. This spec
deliberately drops that color — the new `genCryptFloor` reads as
slate-blue tile, matching the wall family. **First rendered frame on
crypt-only seeds will NOT be byte-identical to the prior implementation.**
That's expected; the spec's contract is determinism *within this
revision*, not parity with the previous one.

### Material seeded ordering

`rand()` advances inside `generateDungeon`'s seeded LCG. The two new
calls per room (`themeIdx`, `materialIdx`) consume two PRNG draws each.
Adding any further per-room properties later (e.g., a `lightLevel`)
must append after `materialIdx` to preserve seed compatibility — the
current `themeIdx`-then-`materialIdx` order is the contract.

### Hot-path discipline

- `castColumn` returns `MAP[mapY][mapX]` as `wallType`, used as the
  index into `WALL_VARIANTS`. Unchanged.
- `castFloorCeiling`'s per-pixel `THEME_MAP` lookup is unchanged from
  the prior spec.
- BFS runs once per dungeon generation (not per frame). The added
  parallel `materialMap` write doubles the per-cell work in BFS — but
  BFS visits at most ~2300 cells per gen, so it's microseconds.
- Bake-time generator rewrites stay within the existing 50ms total
  budget. The added `mix` / `mix3` arithmetic is negligible vs the
  noise-field generation cost they sit on top of.

### Symbols added

```js
const THEME_PALETTES = [/* 3 entries */];
function mix(a, b, t) { /* ... */ }
function mix3(a, b, c, t) { /* ... */ }
function genCryptBrick(pal)    { /* ... */ }
function genCryptStone(pal)    { /* ... */ }
function genCryptMossy(pal)    { /* ... */ }
function genCryptFloor(pal)    { /* ... */ }
function genCryptCeiling(pal)  { /* ... */ }
function genFoundryIron(pal)   { /* ... */ }
function genFoundryPanel(pal)  { /* ... */ }
function genFoundryScorch(pal) { /* ... */ }
function genFoundryFloor(pal)  { /* ... */ }
function genFoundryCeiling(pal){ /* ... */ }
function genCavernRock(pal)    { /* ... */ }
function genCavernMoss(pal)    { /* ... */ }
function genCavernDirt(pal)    { /* ... */ }
function genCavernFloor(pal)   { /* ... */ }
function genCavernCeiling(pal) { /* ... */ }
// In generateDungeon():
rooms[r].materialIdx = Math.floor(rand() * 3);
const materialMap = new Uint8Array(W * H);
```

### Symbols removed

- `genBrick`, `genStone`, `genFloor`, `genCeiling` (renamed +
  rewritten as the `genCrypt*` set).
- `genCryptMossy`, `genFoundryIron`, `genFoundryPanel`,
  `genFoundryScorch`, `genFoundryFloor`, `genFoundryCeiling`,
  `genCavernRock`, `genCavernMoss`, `genCavernDirt`, `genCavernFloor`,
  `genCavernCeiling` (current bodies — replaced with palette-driven
  rewrites).
- `pickWallVariant` (entire function).

### Where edits land in `index.html`

- `<style>` block: unchanged.
- `rgba32` (`index.html:866`): unchanged. `mix` / `mix3` declared
  immediately below.
- `lcg` / `addOctave` (`index.html:881-951`): unchanged.
- Generator block (`index.html:886`-`index.html:1390`-ish): full
  rewrite per #6/#7/#8/#10. Same line count band, just different
  bodies.
- `pickWallVariant` (`index.html:1807`-ish): delete.
- `TEXTURES` / `WALL_VARIANTS` / `FLOOR_VARIANTS` / `CEIL_VARIANTS`
  declarations (`index.html:1394`-`index.html:1440`-ish): keep keys
  the same; reorder per-theme as in #9.
- `THEMES` and the new `THEME_PALETTES`: declared together near the
  generators.
- `generateDungeon` (`index.html:1818`-`index.html:2035`):
  - Add `materialIdx = Math.floor(rand() * 3)` per room (#11).
  - Add `materialMap` allocation + parallel write in BFS (#12).
  - Replace wall-cell assignment to read `materialMap` instead of
    `pickWallVariant` (#13).
- `applyDungeon` (`index.html:2041`-): unchanged. (It already assigns
  `THEME_MAP = d.themeMap`; we don't need `materialMap` in module
  scope — it's consumed inside `generateDungeon` only.)
- `castColumn` / `castFloorCeiling` / `render` wall fill: unchanged.
- `drawMinimap` (`index.html:3026`-): unchanged. Only the
  `MM_THEME_COLOR` constant values are retuned (#17).

## Agent Notes

- **Read first:** `AGENTS.md`, `CLAUDE.md`, this spec, the prior
  `specs/tasks/room-themes.md` (for the data-model contract you're
  refining), then in `index.html`:
  - texture helpers + generators (`index.html:866-1392`).
  - `pickWallVariant` + `generateDungeon`
    (`index.html:1807-2035`).
  - `applyDungeon` + `regenerateDungeon` (`index.html:2041-2068`).
  - `castColumn` + `castFloorCeiling` + `render` wall fill
    (`index.html:818-2620`-ish, just for context — no changes
    required there).
  - `drawMinimap` + `MM_THEME_COLOR` (`index.html:3024-3070`-ish).
  All edits stay inside the assigned worktree only.

- **Order of work:**
  1. Add `mix` / `mix3` next to `rgba32`.
  2. Declare `THEME_PALETTES` (the 3 palette objects) near `THEMES`.
  3. Rewrite `genCryptBrick` from the existing `genBrick` body —
     swap RGB literals for `mix` / `mix3` calls against
     `THEME_PALETTES[0]`. Verify by booting the game on a known seed
     and confirming the crypt brick rooms render cleanly (different
     pixels from before, but coherent).
  4. Rewrite the other four crypt generators in sequence; verify after
     each that the level still renders without errors.
  5. Rewrite the five foundry generators.
  6. Rewrite the five cavern generators.
  7. Reorganize `TEXTURES` literal per #9 and confirm
     `WALL_VARIANTS` / `FLOOR_VARIANTS` / `CEIL_VARIANTS` arrays
     reference the new generator outputs.
  8. Add `rooms[r].materialIdx = Math.floor(rand() * 3)`. Verify a
     known seed is still deterministic across reloads (same dungeon,
     same theme assignment) — but the *materials* will differ from
     the prior spec because the new `rand()` call advances the PRNG.
  9. Add `materialMap` to BFS. Replace the `pickWallVariant`-based
     wall assignment with the BFS-derived material lookup. Delete
     `pickWallVariant`.
  10. Retune `MM_THEME_COLOR` values (#17).
  11. Run `node --check` against the extracted `<script>` body.
  12. Smoke-test in the browser per the checklist below.

- **Common pitfalls:**
  - **Forgetting to read `materialMap` in the wall assignment loop.**
    Easy mistake: extend BFS to compute `materialMap`, then forget to
    use it and leave the old `pickWallVariant` line. Result: walls
    look hashed-per-cell again, no harmony improvement. Grep for
    `pickWallVariant` after the edit; should be zero matches.
  - **`mix` returning unclamped or non-integer pixels.** The helper
    must return a packed `rgba32` with each channel ∈ [0, 255] integer.
    The `| 0` truncation in #4's body is the right shape; if you swap
    in `Math.round` you'll get off-by-one differences from prior bakes
    and lose byte-determinism guarantees on `?seed=` reload.
  - **Palette anchor leaks across themes.** Each generator takes one
    `pal` argument and must only reference that argument's keys. Don't
    accidentally close over `THEME_PALETTES[0]` inside a foundry
    generator — typo-prone if you copy-paste from a sibling. Convention:
    inside every generator body, immediately destructure
    `const { shadow, base, highlight, accent, extra } = pal;` so a
    typo'd anchor name fails fast.
  - **Per-pixel hash `seed` constants colliding with existing seeds.**
    The ember pass in `genFoundryScorch` uses a per-pixel hash; pick a
    seed constant that doesn't collide with `lcg` constants or the
    `pickWallVariant` constants used elsewhere. A fresh 32-bit literal
    is the cheapest path.
  - **Rewriting `addOctave` to take a palette.** Don't. `addOctave`
    writes into a `Float32Array` (the noise field), not pixel colors.
    Color application happens *after* the noise field is built, in
    each generator's per-pixel loop. Keep `addOctave` palette-blind.
  - **Material seeded ordering.** `rooms[r].themeIdx` first,
    `rooms[r].materialIdx` second — the contract for seed
    compatibility. If you reverse them, every existing seed produces
    different theme-material pairings. Trivial bug, easy to ship by
    mistake.
  - **`materialMap` leaked to module scope.** It's consumed only
    inside `generateDungeon` (in the wall-cell assignment loop
    immediately after BFS). Don't return it from `generateDungeon` or
    assign it to a module-scope `let MATERIAL_MAP` — the renderer
    doesn't need it (the wall texture index in `MAP[y][x]` already
    encodes both theme and material together).
  - **Crypt regression hunt.** Don't compare the first frame of
    `?seed=12345` against an old build expecting byte-identity. The
    crypt rewrite intentionally changes pixels (#11 in the prior spec
    preserved old genBrick/genStone bytes; this spec drops that
    preservation). The byte-determinism contract is *within this
    revision* — `?seed=12345` reloaded yields the same first frame as
    `?seed=12345` reloaded immediately, not as a build from before
    this task.
  - **Foundry scorch ember density.** 1.8% (h % 1000 < 18) is
    deliberate — the texture should read as "scattered sparks" not
    "smoldering field." If you overshoot to 5% the wall reads as
    glowing rather than charred. Tune toward sparser if in doubt.
  - **Cavern moss overlay threshold.** 0.45 (vs crypt mossy's 0.62)
    is deliberate — cavern_moss should read as "rock heavily
    overgrown" while crypt_mossy is "stone with occasional moss."
    Don't standardize the thresholds; the difference is the
    aesthetic.
  - **Minimap color contrast.** The new `MM_THEME_COLOR` values
    (#17) must remain distinguishable from the player triangle, enemy
    dots, and exit cell at minimap scale. Sanity-check by visually
    confirming the minimap still reads cleanly with the new wall
    fills.
  - **`THEME_PALETTES` declaration before generators.** Generators
    reference `THEME_PALETTES[i]` at module-init time (the `TEXTURES`
    literal is evaluated immediately). If `THEME_PALETTES` is
    declared *after* the `TEXTURES` literal, you'll get a temporal
    dead zone error. Declare palettes *before* `TEXTURES`, after the
    generator function declarations (functions are hoisted; consts
    are not).
  - **Forgetting to update generator names in `TEXTURES`.** The
    rename `genBrick → genCryptBrick` must be applied inside the
    `TEXTURES` literal as well as at the function definition. A
    half-applied rename produces `ReferenceError: genBrick is not
    defined` at module load.

- **Smoke test before reporting:**
  - Serve with `python3 -m http.server` and open in a browser.
  - On first load, walk through each room. Confirm each room's four
    walls use a single, consistent material (no per-cell hashed
    mix). Cross-room variety persists — different rooms show
    different wall materials.
  - Stand inside a `crypt` room. Confirm walls + floor + ceiling
    share a slate-blue family with warm brick or mossy accents
    depending on the room's chosen material. Floor reads as slate
    tile, NOT the previous warm-brown stone tile.
  - Walk into a `foundry` room. Confirm walls + floor + ceiling
    share a dark iron family. Rust-orange shows as the accent on
    `foundry_iron` rooms; embers as scattered single pixels on
    `foundry_scorch` rooms; clean panel grids on `foundry_panel`
    rooms. All three foundry materials read as "the same
    foundry."
  - Walk into a `cavern` room. Confirm walls + floor + ceiling
    share a warm-grey-brown family with green moss accents.
    `cavern_moss` rooms read as heavily overgrown; `cavern_dirt`
    rooms as packed earth; `cavern_rock` rooms as bare limestone.
  - Stand at the corridor mouth between two same-theme,
    different-material rooms. Confirm the transition is a single-cell
    flip and the two materials read as siblings (shared family) rather
    than strangers.
  - Stand at the corridor mouth between two different-theme rooms.
    Confirm the transition is a clean single-cell biome change.
  - Press `N` three times. Confirm each new dungeon shows different
    theme + material distributions; all three themes typically appear
    on each level.
  - Walk to the exit cell. Step on it. Confirm the new level loads
    with new theme + material assignments and the same per-room-
    consistency property.
  - Press `R` after dying. Confirm the run resets to the same dungeon
    layout (same seed) with the same theme + material assignments.
  - Press `L` to disable atmosphere. Confirm walls and floor/ceiling
    still texture-sample correctly with the new palettes. Press `L`
    again to re-enable.
  - Open the minimap. Confirm wall cells around the player are colored
    per-theme using the new `MM_THEME_COLOR` values; transitions
    follow theme boundaries; player triangle / enemy dots / exit cell
    remain visually distinct.
  - Visit `?seed=12345` twice in succession (close tab, reopen).
    Confirm the first rendered frame is byte-identical (use a
    screenshot diff tool, or compare pixel data via
    `canvas.toDataURL()` in DevTools).
  - FPS counter ≥ 30 throughout. Spin in a `cavern_moss`-heavy room
    (the moss overlay is the most pixel-expensive variant) — verify
    no FPS regression.
  - DevTools console: zero errors, zero warnings. No
    `pickWallVariant is not defined` regressions; no `genBrick is not
    defined` regressions; no `THEME_PALETTES is not defined`
    temporal-dead-zone errors.

- **At minimum** run `node --check` against the extracted `<script>`
  body before reporting:
  ```
  grep -oP '(?s)(?<=<script>).*?(?=</script>)' index.html > /tmp/script.js
  node --check /tmp/script.js
  ```

- Keep generators clustered by theme (`genCrypt*` → `genFoundry*` →
  `genCavern*`), `THEME_PALETTES` adjacent to `THEMES`, the `mix` /
  `mix3` helpers adjacent to `rgba32`, and the rewritten `TEXTURES`
  literal grouped by theme. Subsequent specs (a fourth theme,
  per-theme fog tints, theme-specific enemy palettes) should be able
  to find the relevant slot at a glance.

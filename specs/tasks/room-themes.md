---
id: room-themes
area: frontend
priority: 50
depends_on: []
description: Add three named visual themes (crypt, foundry, cavern) assigned per-room with three wall variants each plus theme-specific floor and ceiling textures, so rooms read as visually distinct biomes.
---

# Room Themes — Per-Room Wall/Floor/Ceiling Variety

## Goal

Today the dungeon is visually monolithic. Every cell picks from the same two
wall textures (`brick` red, `stone` blue-grey) at a fixed ~70/30 ratio, and
every floor/ceiling shares one global texture. A player walking from one
room to the next sees no aesthetic shift — the corridor and the chamber on
the far side are indistinguishable except for their layout.

This task introduces three named **themes** — `crypt`, `foundry`, `cavern` —
and assigns each room (and the surrounding corridors and walls) a theme
during dungeon generation. Each theme has its own three wall variants, one
floor texture, and one ceiling texture, all procedurally baked at startup
with the existing seeded-LCG pipeline. Rooms of different themes look
clearly different — different palette, different surface character — while
rooms of the same theme share enough family resemblance that the player
reads them as part of one biome.

The renderer's hot path stays integer-only and table-driven: walls look up
their texture from `MAP[y][x]` directly (the cell value becomes the wall
texture index 1..9), and the floor/ceiling cast looks up its texture per
pixel from a parallel `THEME_MAP[y][x]`. No per-pixel branching on theme.
Atmosphere fog and the vignette pass continue to compose unchanged.

## Acceptance Criteria

1. **Single-file constraint preserved.** Still one `index.html` at the repo
   root, no `package.json`, no external assets, no build step, no
   `localStorage`, no network requests. All new texture pixels and theme
   state live inside the existing IIFE.

2. **Three themes are defined**, each with a string id used in code and
   diagnostics. The id strings are part of the contract:
   - `crypt`   — the legacy aesthetic (red brick + blue-grey stone), plus a
     new mossy stone variant for accent.
   - `foundry` — industrial: rusted iron plate, dark metal panels, charred
     scorch concrete.
   - `cavern`  — organic: weathered grey rock, mossy green stone, packed
     dirt.
   The set of theme ids lives in a `THEMES = ['crypt', 'foundry', 'cavern']`
   array near the existing texture block. Order is part of the contract: a
   theme's index in this array equals its `themeIdx` everywhere else in the
   code (e.g., the `THEME_MAP` cell values 0/1/2).

3. **Nine wall textures.** Each theme contributes three 64×64 wall textures.
   They live in a flat array `WALL_VARIANTS` indexed by `MAP` cell value:
   ```
   WALL_VARIANTS[1] = TEXTURES.crypt_brick    // existing genBrick output
   WALL_VARIANTS[2] = TEXTURES.crypt_stone    // existing genStone output
   WALL_VARIANTS[3] = TEXTURES.crypt_mossy    // new
   WALL_VARIANTS[4] = TEXTURES.foundry_iron   // new
   WALL_VARIANTS[5] = TEXTURES.foundry_panel  // new
   WALL_VARIANTS[6] = TEXTURES.foundry_scorch // new
   WALL_VARIANTS[7] = TEXTURES.cavern_rock    // new
   WALL_VARIANTS[8] = TEXTURES.cavern_moss    // new
   WALL_VARIANTS[9] = TEXTURES.cavern_dirt    // new
   ```
   `WALL_VARIANTS[0]` is left unused (slot reserved for "empty / no wall");
   the existing `WALL_TEX = { 1: brick, 2: stone }` object is removed in
   favor of this flat array. Indices 1..3 are the crypt variants, 4..6 are
   foundry, 7..9 are cavern, in that order.

4. **Three floor and three ceiling textures.** Each theme contributes one
   floor and one ceiling texture, also 64×64. They live in flat arrays
   indexed by `themeIdx`:
   ```
   FLOOR_VARIANTS[0] = TEXTURES.crypt_floor     // existing genFloor output
   FLOOR_VARIANTS[1] = TEXTURES.foundry_floor   // new
   FLOOR_VARIANTS[2] = TEXTURES.cavern_floor    // new
   CEIL_VARIANTS[0]  = TEXTURES.crypt_ceiling   // existing genCeiling output
   CEIL_VARIANTS[1]  = TEXTURES.foundry_ceiling // new
   CEIL_VARIANTS[2]  = TEXTURES.cavern_ceiling  // new
   ```

5. **All generators are pure and deterministic.** Each new generator uses a
   fresh `lcg(SEED_CONSTANT)` (no shared state). `Math.random()` is
   forbidden — bytes-per-pixel must be identical across reloads of the same
   page. New seed constants are arbitrary 32-bit numbers; pick distinct
   ones per generator so noise fields do not accidentally overlap.

6. **Texture palettes (visual contract).** Generators may use any internal
   technique (value noise via `addOctave`, brick-row patterns, hash-based
   speckles) but the *output palette and silhouette* must read as listed
   below. "Reads as X at any in-game distance" is the bar. Suggested
   palette anchors are starting points — adjust ±10% if a value looks off,
   but do not depart from the family.

   **Crypt** (existing + 1 new):
   - `crypt_brick`  — existing `genBrick` output, unchanged. (Re-export under
     this name.)
   - `crypt_stone`  — existing `genStone` output, unchanged. (Re-export.)
   - `crypt_mossy`  — `genStone`-style value noise but tinted toward
     blue-green. Suggested base `BR=72, BG=124, BB=104`. Add a sparse
     darker-green moss patch overlay (octave-8 noise, threshold > 0.55,
     colored `rgba32(40, 80, 56)`) so ~15-25% of pixels read as moss
     splotches over the stone.

   **Foundry** (3 new):
   - `foundry_iron`  — rust-orange rough metal in horizontal plates ~8 px
     tall. Brick-row pattern from `genBrick` is a good starting structure
     but swap the palette: base `BR=148, BG=78, BB=42`, mortar
     `rgba32(40, 26, 18)`. Add small dark "rivet" pixels (2×2 darker
     squares) at every plate's corners — at `(plateX*PLATE_W + 2, y*PLATE_H + 2)`
     and the mirror corner, colored `rgba32(20, 14, 10)`.
   - `foundry_panel` — dark grey metal sheet, value-noise base. Suggested
     `BR=70, BG=72, BB=78`, low-contrast (k = 0.7 + n × 0.5). Add a single
     vertical seam line down the center column (x === 32) colored
     `rgba32(28, 28, 32)` and a single horizontal seam line at y === 32 of
     the same color, so the texture reads as a 2×2 panel grid at any tile.
   - `foundry_scorch` — charred concrete: very dark base (`BR=44, BG=38,
     BB=34`) with sparse hot-orange ember pixels. Use one octave of value
     noise (scale 16) to drive base lightness, then overlay individual
     bright pixels at hash > 0.95 with color `rgba32(220, 110, 40)` — gives
     a "smoldering" feel. Ember pixels must be 1-px (no 2×2 blocks) so they
     read as sparks, not fires.

   **Cavern** (3 new):
   - `cavern_rock`  — weathered grey stone with a brown undertone.
     `genStone`-style multi-octave noise, suggested base
     `BR=104, BG=96, BB=84`, contrast slightly higher than crypt_stone
     (k = 0.5 + n × 0.95) so the rock reads as more pitted/varied than
     polished masonry.
   - `cavern_moss`  — heavy moss-coated rock. Same value-noise scaffolding
     as `cavern_rock` but green-shifted: base `BR=58, BG=110, BB=62`. Add
     a darker speckle pass at hash > 0.7 colored `rgba32(28, 60, 32)` for
     visible moss texture clumps.
   - `cavern_dirt`  — packed earth, warm brown. Value-noise base
     `BR=112, BG=84, BB=58`, with a darker grit pass at hash > 0.78 colored
     `rgba32(56, 36, 22)`. No banding — the texture must read as
     directionless, unlike the brick or iron-plate textures.

   **Floors** (1 existing + 2 new):
   - `crypt_floor`   — existing `genFloor` output, unchanged.
   - `foundry_floor` — dark metal plate with a diagonal tread pattern. Base
     `BR=66, BG=62, BB=56`, with a 4-pixel diagonal stripe (`(x + y) % 8 < 4`)
     darkened ×0.85 so the tread reads visibly. No mortar grid.
   - `cavern_floor`  — wet earthen rock. Value-noise base
     `BR=78, BG=68, BB=54`, with sparse darker "puddle" patches (octave-8
     noise, threshold > 0.62, color multiplier 0.55). No tile grid.

   **Ceilings** (1 existing + 2 new):
   - `crypt_ceiling`   — existing `genCeiling` output, unchanged.
   - `foundry_ceiling` — dark iron with subtle horizontal striping.
     Single-octave noise, base `BR=28, BG=30, BB=34`, with a dim stripe
     every 8 rows darkened ×0.8 to suggest girders. Darker overall than
     the floor so the player can still distinguish up from down.
   - `cavern_ceiling`  — rough cave roof. Two-octave value noise, base
     `BR=42, BG=38, BB=34`, slightly higher contrast than `crypt_ceiling`
     so it reads as natural rock rather than masonry.

7. **Cell-level theme storage.** A new module-scope `THEME_MAP[y][x]` array
   stores the theme index (0=crypt, 1=foundry, 2=cavern) for every cell
   (both floor and wall cells). It is allocated once during `applyDungeon`
   alongside `MAP`. Stored as a `Uint8Array(MAP_W * MAP_H)` for cache
   density; helpers `themeAt(mx, my)` read from it (with bounds-check →
   default theme 0). The renderer's hot floor/ceiling cast reads it
   directly via `THEME_MAP[my * MAP_W + mx]`, not via the helper.

8. **Per-room theme assignment.** Inside `generateDungeon`, after the room
   list is finalized, each room is assigned a theme using the seeded
   `rand()`:
   ```js
   for (let r = 0; r < rooms.length; r++) {
     rooms[r].themeIdx = Math.floor(rand() * THEMES.length);
   }
   ```
   No "force diversity" guard — a level may legitimately end up all-foundry
   if RNG lands that way; that's a thematic level. (The original
   `count1 === 0 || count2 === 0` guard for wall types is removed; see #11.)

9. **Multi-source BFS for cell themes.** After theme assignment, run a
   multi-source BFS over the floor cells, seeded from every room's interior
   simultaneously. Each interior cell starts with its room's theme; the
   BFS propagates that theme outward into corridor cells, marking each
   floor cell with the theme of the *nearest* room (Manhattan distance, by
   BFS step count). On a tie (corridor cells equidistant from two rooms),
   the first room visited in iteration order wins — deterministic and
   stable.

   Wall cells then inherit theme by the same BFS, *continuing into wall
   cells after the floor pass completes* — i.e., every wall cell takes the
   theme of the nearest floor cell it borders, again with deterministic
   tiebreak. (Walls bordering only the outer-boundary buffer take theme 0
   as a fallback; in practice the dungeon's outer ring is always adjacent
   to either a corridor or a room, so this only matters for unreachable
   exterior wall cells — which never get rendered anyway.)

   The BFS uses the same 4-connected `dxs/dys` arrays already declared in
   `generateDungeon` for the connectivity check. Reuse them; do not
   redeclare.

10. **Per-cell wall variant selection.** For each wall cell, the texture
    index `MAP[y][x]` is computed as:
    ```
    MAP[y][x] = themeIdx * 3 + variant + 1
    ```
    where `variant` is 0, 1, or 2, chosen deterministically by hashing
    `(x, y, dungeonSeed)`:
    ```js
    function pickWallVariant(x, y, seed) {
      // Stable per-cell hash; same (x,y,seed) → same variant.
      let h = (x * 0x1f1f1f1f) ^ (y * 0x9e3779b1) ^ seed;
      h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
      h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
      h = (h ^ (h >>> 16)) >>> 0;
      // Variant weighting: 50% base (variant 0), 30% accent A (variant 1),
      // 20% accent B (variant 2). Yields a "mostly base wall, occasional
      // accents" feel rather than a stripey 1/3 each.
      const r = h % 100;
      if (r < 50) return 0;
      if (r < 80) return 1;
      return 2;
    }
    ```
    The +1 offset in `MAP[y][x]` reserves slot 0 for empty cells. The
    chosen variant therefore picks among:
    - crypt:   `themeIdx=0` → `MAP` ∈ {1,2,3} (brick, stone, mossy)
    - foundry: `themeIdx=1` → `MAP` ∈ {4,5,6} (iron, panel, scorch)
    - cavern:  `themeIdx=2` → `MAP` ∈ {7,8,9} (rock, moss, dirt)
    Variant 0 is the "base" wall (brick / iron / rock), variant 1 is the
    "primary accent" (stone / panel / moss), variant 2 is the "secondary
    accent" (mossy / scorch / dirt).

11. **`MAP` cell value semantics change**, but its truthy/falsy contract
    does not. `MAP[y][x] === 0` still means "empty (passable)". Any
    non-zero value means "wall (blocking)". The 1..9 range now encodes
    which texture, not just which "type". All existing readers that test
    `MAP[y][x] > 0` (collision in `tryMove`, `castColumn`, `castRay`,
    `isWall`, `enemyCanSeePlayer`, AI movement, etc.) keep working
    unchanged. The single existing reader that branches on the *specific*
    value 1 vs 2 — the minimap at `index.html:2582`
    (`(cell === 2) ? '#4a78c8' : '#c8503c'`) — must be updated to read
    `THEME_MAP[my * MAP_W + mx]` and pick a per-theme color instead (#15).

    The `count1/count2` "both wall types must be present" guard at
    `index.html:1413-1422` is **removed** — it was a placeholder for the
    old two-type system and does not apply to themes.

12. **Renderer wall lookup.** `castColumn`'s `wallType` return field is
    repurposed: it now carries the `MAP` cell value 1..9 directly. In
    `render` (around `index.html:2059`), replace
    ```
    const tex = WALL_TEX[hit.wallType] || TEXTURES.brick;
    ```
    with
    ```
    const tex = WALL_VARIANTS[hit.wallType] || WALL_VARIANTS[1];
    ```
    No new branches; the lookup stays one array index. The existing
    `WALL_TEX = { 1: ..., 2: ... }` object is deleted.

13. **Renderer floor/ceiling lookup is per-pixel.** Inside both branches
    of `castFloorCeiling` (the `lightingEnabled` path at
    `index.html:1995-2016` and the legacy path at
    `index.html:2017-2037`), inside the inner `xx` loop, replace the
    fixed `FLOOR_TEX` / `CEIL_TEX` references with per-pixel lookups:
    ```js
    const mx = (fx | 0); // already a valid map cell at typical fx > 0
    const my = (fy | 0);
    let theme = 0;
    if (mx >= 0 && mx < MAP_W && my >= 0 && my < MAP_H) {
      theme = THEME_MAP[my * MAP_W + mx];
    }
    const FLOOR_TEX = FLOOR_VARIANTS[theme];
    const CEIL_TEX  = CEIL_VARIANTS[theme];
    const idx = ty * TEX_SIZE + tx;
    const cF = FLOOR_TEX[idx];
    const cC = CEIL_TEX[idx];
    // ... rest of fog/shade logic unchanged ...
    ```
    Two extra reads per pixel (one `THEME_MAP` lookup, one bounds check
    that compiles away in V8 hot paths) plus two extra array-of-arrays
    indirections. Floor cast is ≈ `H/2 × W` = 64,800 pixels per frame at
    480×270; the added cost is well under a millisecond. The `FLOOR_TEX`
    and `CEIL_TEX` const-hoists at the top of `castFloorCeiling`
    (`index.html:1972-1973`) are removed — the texture is now picked
    per-pixel. The `mx`/`my` bounds check is defensive: in normal play
    `fx`/`fy` lie inside the map, but a player at the dungeon edge with a
    grazing ray could produce out-of-bounds rows. Defaulting to theme 0
    keeps the renderer side-effect-free in that edge case.

14. **`applyDungeon` populates `THEME_MAP` and resizes it on level
    transitions.** Currently `applyDungeon` (around `index.html:1525-1532`)
    sets `MAP`, `MAP_W`, `MAP_H`, etc. Extend it to also receive
    `themeMap` from `generateDungeon`'s return value and assign
    `THEME_MAP = d.themeMap`. The `Uint8Array` sizing is per-level
    (`MAP_W * MAP_H`); allocating a fresh one each level is fine — the
    old one is GC'd. The current map is 48×48 = 2304 bytes per level;
    one allocation per N-press / exit-step is negligible.

15. **Minimap reflects theme color.** `drawMinimap` at
    `index.html:2548-2611`: replace the per-cell color branch
    ```
    ctx.fillStyle = (cell === 2) ? '#4a78c8' : '#c8503c';
    ```
    with a theme-color lookup:
    ```js
    const t = THEME_MAP[my * MAP_W + mx];
    ctx.fillStyle = MM_THEME_COLOR[t];
    ```
    where
    ```js
    const MM_THEME_COLOR = ['#c8503c', '#a06038', '#5c8a48'];
    // crypt = warm red, foundry = burnt orange, cavern = mossy green.
    ```
    Place `MM_THEME_COLOR` next to the existing minimap constants
    (`MM_X`/`MM_Y`/`MM_SIZE`/`MM_CELLS`). The colors are functional
    minimap dots — not pixel-accurate samples of the wall textures, just
    instantly recognizable per theme at minimap scale. Player triangle,
    enemy dots, and exit cell are unchanged.

16. **Determinism preserved end-to-end.** The same dungeon `seed`
    deterministically produces the same map, the same theme assignment,
    and the same per-cell wall variant choice. Verifiable by running
    `?seed=12345` twice and confirming the first rendered frame is
    byte-identical (existing test for prior texture work). Texture bakes
    are also deterministic (#5).

17. **Performance.** ≥ 30 FPS at 480×270 with the existing 48×48
    procedural dungeon. The per-pixel `THEME_MAP` lookup in the floor
    cast is the only new hot-path cost; the wall path is unchanged in
    iteration count (one extra array entry in `WALL_VARIANTS` is irrelevant
    to per-pixel cost). Texture bake at startup adds ~11 new generators,
    each doing one `Uint32Array(64*64)` fill — total new bake time ≤ 50
    ms on modern hardware. Bake still happens once at module init, before
    the first frame.

18. **Atmosphere fog and vignette compose unchanged.** The fog blend in
    `castFloorCeiling` and `render` reads the *just-sampled* texture pixel
    and lerps it toward `FOG_C`. With per-cell texture lookup this still
    works — the texture sample is per-pixel, and the fog blend is applied
    immediately afterward, exactly like today. `lightingEnabled = false`
    falls back to the legacy distance shade path (also updated to
    per-pixel theme lookup, see #13). Vignette pass is unchanged — it
    operates on `buf32` after walls/floor/ceiling write, regardless of
    theme.

19. **No regressions.** The following all keep working identically:
    - Pointer-lock click hint, `WASD`/arrow movement, mouse-look.
    - Player firing, hit-confirms, kill pops, ammo HUD.
    - Enemy AI (windup/fire/contact damage), enemy projectiles,
      damage flash, damage arrow, damage vignette.
    - Level exit, `R` reset, `N` regenerate, `?seed=` URL param.
    - `L` lighting toggle (still flips the atmosphere on/off; both paths
      now read theme-aware floor/ceiling textures).
    - `M` mute toggle, all SFX cadence.
    - Mobile touch joystick, look pad, fire button.
    - FPS counter, lighting debug label.
    - Sprite z-buffer (sprites still occlude correctly behind walls).

20. **No new console errors or warnings** during a 60-second walk that
    visits at least one room of each theme, regenerates the dungeon
    (`N`) at least three times, exits to a new level at least once, and
    toggles `L` at least twice.

21. **Single-file, single-IIFE invariant.** All new state, helpers,
    texture generators, and the `THEMES` / `WALL_VARIANTS` /
    `FLOOR_VARIANTS` / `CEIL_VARIANTS` / `THEME_MAP` /
    `MM_THEME_COLOR` declarations live inside the existing IIFE. No
    top-level declarations, no globals.

## Out of Scope

- Theme-specific enemies, palettes for sprites, or per-theme music/audio.
  Sprites and SFX continue to use their existing single palette/cadence
  regardless of which room the action happens in.
- Theme-specific lighting (e.g., warmer fog in `foundry`, cooler in
  `cavern`). `FOG_C`, `FOG_NEAR`, `FOG_FAR`, `VIGNETTE_*`, and `SKY_TOP`
  remain global.
- Cross-theme transition effects (gradients along corridors, fade-in zones
  at theme boundaries). The boundary is a hard cell-by-cell change, which
  reads fine in practice because corridors are 1 cell wide and walls
  separate the territories.
- More than three themes. The `THEMES` array and `WALL_VARIANTS` /
  `FLOOR_VARIANTS` / `CEIL_VARIANTS` shapes are sized for exactly three;
  extending to four would be a future spec.
- Animated textures (flickering scorch embers, dripping moss, etc.).
  Textures bake once at startup and remain static.
- Decorative props or pickups inside themed rooms (torches, barrels,
  crates, bones). World content is still empty rooms + walls; visual
  variety comes from surface treatment only.
- Doors, theme-locked rooms, or theme-as-difficulty-tier. All themes coexist
  on level 1 onward; no progression gating.
- Per-level theme lock (e.g., "level 3 is all-foundry"). Themes are assigned
  per-room within each level.
- Theme-tinted minimap *floor* fill. The minimap currently leaves floor
  cells transparent against the dark backdrop; that stays. Only wall cell
  fill gets theme color.
- A theme picker, debug overlay listing each room's theme, or `?themes=`
  URL parameter. The seed already controls everything determinstically.
- Reworking `addOctave`, `lcg`, `rgba32`, or any other shared texture-bake
  helper. New generators may *call* them; their internals don't change.
- Reworking `generateDungeon`'s room-placement, corridor-carving, BFS
  connectivity check, exit-pick, or enemy-spawn algorithms. The only
  additions to `generateDungeon` are theme assignment (#8) and the
  multi-source BFS that produces `themeMap` (#9). All other logic is
  read-only from this spec's perspective.
- Stats/counters for "rooms by theme" or similar. `stats` is unchanged.
- Tuning `PROJECTILE_*`, `MUZZLE_*`, `KICK_*`, or any combat constants.
  This is a pure-aesthetics spec.

## Design Notes

### Files involved

`index.html` only.

### Hook points

Line numbers reflect the current state of the file; expect small drift
after edits.

- **Texture block** (`index.html:798-962`): the existing
  `genBrick`/`genStone`/`genFloor`/`genCeiling` functions stay. Add seven
  new generators (`genCryptMossy`, `genFoundryIron`, `genFoundryPanel`,
  `genFoundryScorch`, `genCavernRock`, `genCavernMoss`, `genCavernDirt`)
  plus `genFoundryFloor`, `genCavernFloor`, `genFoundryCeiling`,
  `genCavernCeiling`. Group them in theme order (crypt accent → foundry
  three → foundry floor/ceiling → cavern three → cavern floor/ceiling)
  so the file's reading order mirrors `THEMES`.
- **`TEXTURES` object** (`index.html:957-962`): rename keys from
  `brick`/`stone`/`floor`/`ceiling` to `crypt_brick`/`crypt_stone`/
  `crypt_floor`/`crypt_ceiling`, plus the eleven new entries.
- **`WALL_TEX` declaration** (`index.html:964-969`): delete; replaced by
  the new flat `WALL_VARIANTS` array immediately below.
- **`THEMES` / `WALL_VARIANTS` / `FLOOR_VARIANTS` / `CEIL_VARIANTS`**:
  declare immediately after `TEXTURES`, in that order. All four are
  module-scope `const`s.
- **`THEME_MAP`** (`index.html:135-138`): declare a new
  `let THEME_MAP = null;` next to the existing `MAP` / `MAP_W` / `MAP_H`
  declarations. Populated by `applyDungeon`.
- **`generateDungeon`** (`index.html:1331-1523`): add
  `rooms[r].themeIdx = Math.floor(rand() * THEMES.length)` after rooms
  are finalized, then add the multi-source BFS to produce `themeMap`,
  then add `pickWallVariant` calls in the wall-type assignment loop.
  Replace the `t = rand() < 0.7 ? 1 : 2` line with the new theme +
  variant lookup. Remove the `count1`/`count2` diversity guard.
  Return `themeMap` as part of the result object.
- **`applyDungeon`** (`index.html:1525-1532`): assign `THEME_MAP = d.themeMap;`.
- **`castFloorCeiling`** (`index.html:1971-2043`): per-pixel
  `THEME_MAP` lookup inside both inner `xx` loops; remove the const-hoist
  of `FLOOR_TEX` / `CEIL_TEX` at the function top.
- **`render`** (`index.html:2059`): swap the `WALL_TEX` lookup for
  `WALL_VARIANTS`.
- **`drawMinimap`** (`index.html:2582`): swap the `cell === 2` branch
  for the `MM_THEME_COLOR[THEME_MAP[...]]` lookup. Add `MM_THEME_COLOR`
  near the existing minimap constants.

### Theme palette summary (for the implementer's eye)

| Theme   | Idx | Wall variants                 | Floor       | Ceiling     | Minimap |
|---------|-----|-------------------------------|-------------|-------------|---------|
| crypt   | 0   | brick (R), stone (B), mossy   | stone tile  | dark stone  | red     |
| foundry | 1   | iron, panel, scorch           | tread plate | iron grate  | orange  |
| cavern  | 2   | rock, moss, dirt              | wet earth   | cave roof   | green   |

Each row's three wall variants are the 50% base / 30% primary accent /
20% secondary accent assignment from `pickWallVariant`. The base
variants (brick / iron / rock) carry most of the visual weight; the
accents are the visual interest peppered through.

### Multi-source BFS sketch

```js
// Inside generateDungeon, after rooms[r].themeIdx is assigned, after
// connectivity BFS confirms the dungeon is valid:

const themeMap = new Uint8Array(W * H);    // 0 = crypt by default
const tDist = new Int16Array(W * H);
tDist.fill(-1);
const tQueue = [];

// Seed from every room interior cell.
for (let r = 0; r < rooms.length; r++) {
  const room = rooms[r];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const i = y * W + x;
      themeMap[i] = room.themeIdx;
      tDist[i] = 0;
      tQueue.push(i);
    }
  }
}

// 4-connected BFS over both floor and wall cells.
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
    themeMap[ni] = themeMap[i];
    tQueue.push(ni);
  }
}
```

The BFS visits floor cells first (since rooms seed it) and walls last (as
their floor neighbors are processed). Tie-break is "first-seen wins" by
push order — deterministic given the seeded room theme assignment.

### Why per-cell `THEME_MAP` and not per-room

A floor pixel inside a corridor needs to know its theme even though it's
not "inside" a room. A per-cell map handles corridors, walls, and rooms
uniformly. The alternative — looking up `roomFromXY(x, y)` per pixel — is
both more expensive (per-pixel point-in-rect over `rooms.length`) and
underspecified for corridors and walls. The 2304-byte per-level
`Uint8Array` is the right shape.

### Why hash-based variant selection (not LCG)

`pickWallVariant(x, y, seed)` must return the same variant for the same
cell across re-renders, regardless of *iteration order*. An LCG advanced
during `generateDungeon` would produce different variant pairings
depending on whether walls are scanned row-major or by some other order.
A pure spatial hash (input: `x, y, seed`) is order-independent — exactly
what we want for a property-of-the-cell rather than a property-of-the-walk.

The hash is the standard "splitmix64-style" finalizer cropped to 32 bits;
the seed input is the `dungeonSeed` so two levels with the same seed
share variant assignments (as expected for determinism), and different
seeds shuffle.

### Why MAP cell value 1..9 instead of a parallel WALL_TEX_IDX array

Two reasons:

1. **Hot-path simplicity.** `castColumn` already returns `MAP[mapY][mapX]`
   as `wallType`. Using that value directly as the `WALL_VARIANTS` index
   keeps the renderer's hot-loop array indirection at one read. A parallel
   `WALL_TEX_IDX[y][x]` array would add a second read per column.

2. **Backward compatibility for collision/AI.** Every existing
   "is this a wall?" check uses `MAP[y][x] > 0` or `MAP[y][x] !== 0`. As
   long as the index remains > 0 for walls, those checks keep working.
   Storing 1..9 instead of 1..2 changes nothing for the boolean reading.

The only reader that branches on the *specific* value is the minimap
(#15), and that one is migrating to `THEME_MAP` anyway.

### Why floor/ceiling are per-theme (not per-cell)

Per-cell floor would let us mix cavern moss patches into a foundry room's
floor for additional richness, but it's overkill for a first cut and
significantly complicates the texture-pick math. A single floor texture
per theme is enough variety to make rooms read distinctly. The wall
variants do the heavy lifting on per-cell aesthetic; floor/ceiling
provide the theme's "ground truth."

### Why no theme transition / blending

Hard boundaries at corridor entrances are fine in this engine because:

1. Corridors are ≤ 1 cell wide and their floor texture changes when the
   player crosses the cell line. By that point the player is usually
   already looking past the boundary into the next room.
2. The atmosphere fog dominates anything past 5-6 cells, hiding most of
   the seam between two floor textures at the corridor mouth.
3. Wall textures change at the cell boundary too, but the cell-aligned
   raycast u-coordinate already snaps to cell boundaries, so there's no
   bleed.

A blend pass would require either per-pixel sampling from two textures
(2× cost) or a multi-step gradient buffer (more memory). Out of scope.

### Performance check

Per-frame extra cost vs. baseline:
- Floor cast: 64,800 pixels × 1 `Uint8Array` read + 1 `Array` index per
  pixel = ~130k extra reads. Both are cache-friendly (sequential x-scan
  with localized `mx`/`my`); negligible.
- Wall cast: zero extra cost. The inner loop reads from `tex` exactly as
  before; only the `tex` reference changed.
- Minimap: one extra `Uint8Array` read per visible cell (≤ 64 cells).
  Negligible.

Bake-time extra cost:
- 11 new texture generators × ~64 × 64 pixels each = ~45k pixel writes
  per generator. With the existing patterns these run in microseconds —
  well under the existing 50 ms total bake budget.

## Agent Notes

- **Read first:** `AGENTS.md`, `CLAUDE.md`, this spec, then the texture
  and dungeon sections of `index.html` end-to-end:
  - tuning constants and texture seeds near `index.html:798-1010`
  - existing generators (`genBrick`, `genStone`, `genFloor`, `genCeiling`)
    near `index.html:812-955` — *read these closely;* the new generators
    follow the same patterns
  - `addOctave` near `index.html:854-877` — reuse for value-noise textures
  - `lcg` near `index.html:807-810`
  - `castFloorCeiling` near `index.html:1971-2043`
  - `render` per-column wall fill near `index.html:2045-2120`
  - `castColumn` near `index.html:744-789`
  - `generateDungeon` near `index.html:1331-1523`
  - `applyDungeon` near `index.html:1525-1532`
  - `drawMinimap` near `index.html:2548-2611`
  Make all edits inside the assigned worktree only.

- **Order of work:**
  1. Add the seven new wall generators and four new floor/ceiling
     generators. Bake-test by manually placing temporary
     `console.log(TEXTURES.foundry_iron[0])` lines and verifying the
     packed RGBA values look sane. Remove the logs before committing.
  2. Rename existing `TEXTURES.brick` → `TEXTURES.crypt_brick`,
     `TEXTURES.stone` → `TEXTURES.crypt_stone`,
     `TEXTURES.floor` → `TEXTURES.crypt_floor`,
     `TEXTURES.ceiling` → `TEXTURES.crypt_ceiling`. Add the eleven new
     entries.
  3. Replace `WALL_TEX = { 1: ..., 2: ... }` with the flat
     `WALL_VARIANTS = [null, ...]` array (10 entries; index 0 unused).
     Add `FLOOR_VARIANTS` and `CEIL_VARIANTS` (3 entries each).
  4. Add `THEMES = ['crypt', 'foundry', 'cavern']`.
  5. Declare `let THEME_MAP = null;` next to `MAP`. Update
     `applyDungeon` to receive and assign it.
  6. Add `pickWallVariant(x, y, seed)` inside the IIFE near the other
     pure helpers (just below `lcg` is a good spot).
  7. Inside `generateDungeon`:
     a. Assign `themeIdx` per room.
     b. Replace the wall-type assignment loop's `t = rand() < 0.7 ? 1 : 2`
        with a temporary `t = 1` placeholder so the first run still
        compiles — you'll fill the real value in step (d).
     c. Add the multi-source BFS to produce `themeMap`.
     d. Replace the placeholder with
        `const variant = pickWallVariant(x, y, seed);
         const t = (themeMap[y * W + x] * 3) + variant + 1;`
     e. Remove the `count1`/`count2` guard.
     f. Return `themeMap` as part of the result object.
  8. Update `castFloorCeiling` for per-pixel `THEME_MAP` lookup in both
     inner `xx` loops. Remove the `FLOOR_TEX` / `CEIL_TEX` const-hoist
     at the function top.
  9. Update `render`'s wall lookup to use `WALL_VARIANTS`.
  10. Update `drawMinimap` to read `THEME_MAP` for cell color.
  11. Run `node --check` against the extracted `<script>` body.
  12. Smoke-test in the browser.

- **Common pitfalls:**
  - **Forgetting to reserve `WALL_VARIANTS[0]`.** `MAP[y][x] === 0` is
    "empty" — that index must never be looked up by the wall renderer.
    `null` (or `undefined`) at slot 0 is fine because the renderer
    short-circuits with `WALL_VARIANTS[hit.wallType] || WALL_VARIANTS[1]`,
    but if you accidentally store a real texture there, a bug elsewhere
    (e.g., a stray off-map ray treating a 0 cell as wall) would silently
    render with that texture instead of failing loudly.
  - **Off-by-one in the variant math.** `MAP[y][x] = themeIdx * 3 + variant + 1`
    yields 1..9 for `themeIdx ∈ [0, 2]` and `variant ∈ [0, 2]`. If you
    drop the `+ 1`, you'll write 0 into wall cells (collision breaks).
    If you write `themeIdx * 3 + variant` with `variant ∈ [1, 3]`,
    you'll get 1..9 too but the variant 0 / 1 / 2 indexing in
    `pickWallVariant` will be off.
  - **Multi-source BFS that visits walls before floors.** If you naively
    put both wall and floor cells into the seed queue, walls' themes
    will be set by their own raw position rather than by the nearest
    room. Seed *only* from room-interior floor cells; let the BFS reach
    walls naturally. The dist sentinel `tDist[i] !== -1` guards against
    re-visit.
  - **Reading `THEME_MAP[my * MAP_W + mx]` without bounds-checking.**
    The floor cast can produce out-of-range `mx`/`my` near the dungeon
    edge with grazing rays. Without a bounds check you'll get a
    `Uint8Array` returns 0 (which is theme 0 = crypt) but the
    out-of-range *index* is still a JS-engine cost. Use the
    `if (mx >= 0 && mx < MAP_W && my >= 0 && my < MAP_H)` guard from #13.
  - **Dropping the `WALL_TEX` line without updating the renderer.** The
    spec deletes `WALL_TEX` and adds `WALL_VARIANTS`. The renderer's
    `tex` lookup line in `render` must be updated *in the same commit* —
    a half-applied diff will fail with `WALL_TEX is not defined`.
  - **Not removing the `count1`/`count2` diversity guard.** If left in,
    its `outer:` loop will hit cells whose `MAP` value is now 1..9
    rather than just 1..2, but the `if (count1 === 0)` test will read
    incorrectly because nothing increments `count1` for values 4..9.
    Worst case, the guard "fixes" a non-broken map by overwriting a
    valid wall with `t = 1`, leaking a stray crypt_brick into a
    foundry/cavern room. Delete the guard.
  - **Variant hash mismatched between the writer (`generateDungeon`) and
    any reader.** There is no reader; only `generateDungeon` invokes
    `pickWallVariant`. But if you ever need to look up "what variant did
    cell (x,y) get?", call `pickWallVariant` again — same input → same
    output, by design. Don't store variant in a parallel array; the
    `MAP` value already encodes it (`(MAP - 1) % 3`).
  - **Texture generators that share state via the same `lcg`.** Each
    generator must instantiate its *own* `lcg(seed)` with a unique
    seed constant. Sharing one PRNG between generators makes texture
    output depend on the order of generator calls — fragile, and breaks
    determinism when adding a 12th generator later.
  - **Foundry rivets / cavern speckles aliasing into a banding pattern.**
    Use the spatial hash (similar to `pickWallVariant`) for placement,
    not a simple `(x + y) % N` modulo, or you'll see diagonal stripes
    when the texture wraps. Value-noise via `addOctave` is also fine.
  - **`Uint8Array` allocation inside `generateDungeon`'s retry loop.**
    The function tries up to `MAX_TRIES = 60` layouts before settling.
    Allocating a fresh `Uint8Array(W * H)` per failed attempt is wasted
    GC pressure. Allocate `themeMap` *after* the connectivity check
    succeeds, just before `return`. Same for `tDist` and `tQueue` —
    they're only needed once per successful generation.
  - **Forgetting that `?seed=` URL param pins only the *initial* dungeon.**
    Pressing `N` regenerates with a fresh `pickRandomSeed()`. The first
    rendered frame after page load with a pinned seed must be
    byte-identical across reloads. Subsequent regenerations are
    deliberately non-deterministic.
  - **Drawing minimap with `MAP[y][x] === 2`-style logic still in place.**
    Search the file for any `=== 1` / `=== 2` references on `MAP` or
    `cell` — there's only the one in the minimap, but verify before
    reporting.
  - **Bake order changing.** The new generators must be invoked in the
    same order each load. Don't put a generator call inside an `if` or
    behind a condition that varies; the existing pattern (one
    invocation per `TEXTURES` literal entry) is what to copy.
  - **Crypt texture regression.** `genBrick`/`genStone`/`genFloor`/
    `genCeiling` are renamed in `TEXTURES` but their internals stay
    byte-identical. A pixel-for-pixel comparison against a pre-spec
    crypt-only level should match for the legacy textures (i.e., the
    first frame of a known-seed level whose rooms all happen to be
    `themeIdx=0`).

- **Smoke test before reporting:**
  - Serve with `python3 -m http.server` and open in a browser.
  - On first load, walk through the corridors. Confirm at least two
    visually distinct themes are visible across the rooms (typical
    seed will land all three — but two is a valid floor in case of an
    unusually theme-heavy roll).
  - Stand inside a `crypt` room (red brick + stone walls). Confirm
    floor reads as the existing stone-tile pattern; ceiling reads as
    the existing dark stone. Visual identity = pre-spec crypt.
  - Walk into a `foundry` room. Confirm walls read as warm
    rust-orange (with iron-plate banding) / dark grey panels / charred
    base with embers. Floor reads as dark tread plate; ceiling reads as
    near-black girder iron.
  - Walk into a `cavern` room. Confirm walls read as grey rock /
    mossy green / dirt brown. Floor reads as wet brown earth; ceiling
    reads as rough cave rock.
  - Stand at the corridor mouth between a `crypt` and a `cavern` room.
    Confirm the texture transition happens at a single cell boundary
    with no visible bleed or wrap artifact.
  - Press `N` three times. Confirm each new dungeon shows different
    theme distributions and that all three themes appear at least once
    across the three rolls.
  - Walk to the exit cell. Step on it. Confirm the new level loads
    with new theme assignments (different rooms, different theme mix).
  - Press `R` after dying. Confirm the run resets to the same dungeon
    layout (same seed) with the same theme assignments — the first
    frame of the reset run should match the first frame of the
    original run for the unchanged-by-reset assets.
  - Press `L` to disable atmosphere. Confirm walls and floor/ceiling
    still texture-sample correctly from the per-theme tables (the
    legacy `lightingEnabled = false` path uses distance shade instead
    of fog, but textures are the same). Press `L` again to re-enable.
  - Open the minimap (always visible). Confirm wall cells around the
    player are colored per-theme (red / orange / green) and that
    color transitions follow theme boundaries.
  - DevTools console: no new errors or warnings. No
    `WALL_TEX is not defined` regressions, no `THEME_MAP is null`
    on first frame.
  - Visit `?seed=12345` twice in succession (close tab, reopen).
    Confirm the first rendered frame is byte-identical (use a
    screenshot diff tool, or compare pixel data via
    `canvas.toDataURL()` in DevTools).
  - FPS counter ≥ 30 throughout (monitor while spinning in a
    `cavern_moss`-heavy room — the speckle overlay is the most
    pixel-expensive variant).

- **At minimum** run `node --check` against the extracted `<script>` body
  before reporting.

- Keep the new texture generators clustered in theme order
  (`crypt → foundry → cavern`), the `THEMES` / `WALL_VARIANTS` /
  `FLOOR_VARIANTS` / `CEIL_VARIANTS` declarations grouped together near
  `TEXTURES`, the `THEME_MAP` declaration adjacent to `MAP`, and
  `pickWallVariant` near `lcg` — so subsequent aesthetic specs (e.g., a
  fourth theme, theme-specific lighting tints) can locate the existing
  state quickly.

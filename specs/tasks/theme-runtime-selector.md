---
id: theme-runtime-selector
area: frontend
priority: 50
depends_on: []
description: Expand the theme set from 3 to 6 (3 new palettes + 2 new wall-texture generators) and add a runtime theme override cycled with the T key that re-skins the entire current dungeon in place, with a transient on-screen label, so a player can visually explore alternative visuals without regenerating the map.
---

# Theme Runtime Selector — Expand Themes + In-Place Re-Skin

## Goal

Today the dungeon mixes the three baked themes (`crypt`, `foundry`,
`cavern`) per-room via a multi-source BFS during generation (see the
shipped `room-themes` task). There is no way to *choose* a look at
runtime, and there are only three looks to choose from. A designer who
wants to compare aesthetics has to keep pressing `N` and hope the RNG
lands an all-one-theme level.

This task does two things:

1. **Expands the theme set from 3 to 6.** Three new themes — `abyss`,
   `bunker`, `sanctum` — each with its own 5-anchor palette. Two
   genuinely new 64×64 wall-texture generators (`genCrystalFacet`,
   `genHazardStencil`) give the new themes structures the existing
   generators can't produce; the remaining new-theme textures reuse the
   existing palette-parameterized generators fed the new palettes. The
   existing crypt/foundry/cavern generator+palette assignments are
   **unchanged**.

2. **Adds a runtime theme override.** A new module-scope
   `forcedThemeIdx` (`-1` = the natural per-room BFS mix, the default;
   `0..5` = force the *entire* dungeon to that one theme). The `T` key
   cycles `natural → crypt → foundry → cavern → abyss → bunker →
   sanctum → natural`, surfacing a ~2 s fading text label exactly like
   the existing `L` lighting toggle. The override is applied **only at
   render-time lookup sites** — walls, floor/ceiling cast, and minimap —
   so pressing `T` instantly re-skins the *current* dungeon with the
   same layout, enemies, pickups, and seed. It never regenerates and
   never mutates `MAP` or `THEME_MAP`.

The renderer's hot path stays table-driven. The override adds one
loop-invariant branch per column (walls) / per pixel (floor cast) keyed
off the frame-constant `forcedThemeIdx`; no new per-pixel texture
indirection beyond what `room-themes` already established. Atmosphere
fog and the vignette pass compose unchanged.

## Acceptance Criteria

1. **Single-file constraint preserved.** Still one `index.html` at the
   repo root, no `package.json`, no external assets, no build step, no
   `localStorage`, no network requests, no new URL parameters. All new
   palettes, generators, state, and the key handler live inside the
   existing IIFE. No top-level declarations, no globals.

2. **Six themes are defined.** `THEMES` grows from
   `['crypt', 'foundry', 'cavern']` to
   `['crypt', 'foundry', 'cavern', 'abyss', 'bunker', 'sanctum']`.
   Order is part of the contract: a theme's index in this array equals
   its `themeIdx` everywhere else (`THEME_MAP` cell values, the
   `themeIdx*3 + materialIdx + 1` wall encoding, `MM_THEME_COLOR` slot,
   the `forcedThemeIdx` value, and the `T`-cycle order). The three
   existing ids and their indices (0/1/2) are unchanged.

3. **Six palettes.** `THEME_PALETTES` grows to 6 entries. Entries 0–2
   (crypt/foundry/cavern) are **byte-identical to today** — do not
   retune them. Entries 3–5 are new, each with the same five named
   anchors in the same key order (`shadow`, `base`, `highlight`,
   `accent`, `extra`) — that order is the contract the generators
   destructure by name. Suggested anchors (adjust ±10% if a value reads
   off, but stay in the family):

   - **3: `abyss` — deep void, luminous crystal.** Cold and dark with a
     glowing accent.
     - `shadow:    [14, 16, 30]`   (near-black indigo)
     - `base:      [40, 46, 78]`   (deep blue-violet)
     - `highlight: [120, 134, 188]` (lit crystal facet)
     - `accent:    [96, 214, 220]` (luminous cyan — the signature glow)
     - `extra:     [128, 84, 188]` (violet vein)
   - **4: `bunker` — cold concrete, hazard markings.** Desaturated grey
     with a single high-vis warning accent.
     - `shadow:    [30, 31, 33]`   (shadowed concrete / form-line)
     - `base:      [96, 98, 96]`   (mid concrete)
     - `highlight: [156, 158, 154]` (lit concrete face)
     - `accent:    [222, 184, 44]` (caution yellow — hazard stencil)
     - `extra:     [70, 74, 80]`   (cold steel trim)
   - **5: `sanctum` — warm sandstone temple, gilt.** Warm light stone
     with a gold accent.
     - `shadow:    [54, 42, 30]`   (deep ochre shadow)
     - `base:      [150, 122, 84]` (sandstone)
     - `highlight: [208, 184, 138]` (sunlit stone)
     - `accent:    [196, 150, 60]` (warm gold)
     - `extra:     [120, 92, 60]`  (aged timber / inlay)

4. **Two new wall-texture generators.** Add exactly two new 64×64
   generators that produce structures the existing generators cannot:

   - **`genCrystalFacet(pal)`** — angular crystal/geode facets. A
     deterministic faceting field (e.g. a small set of Voronoi-ish seed
     points, or an `addOctave`-driven cellular threshold) partitions the
     64×64 into sharp-edged shards; each shard is shaded between
     `shadow`→`base`→`highlight` by its facet normal/id, with a sparse
     bright `accent` rim on facet edges so the wall reads as glinting
     crystal at any in-game distance. Seamless wrap at the 64-px edges
     (the renderer tiles it). Used as `abyss`'s base wall.
   - **`genHazardStencil(pal)`** — concrete panel with a stenciled
     hazard band. A low-contrast value-noise concrete field
     (`shadow`/`base`/`highlight`) overlaid with a diagonal
     hazard-chevron stripe band painted in `accent`, plus a thin
     `extra` panel-seam frame. The chevrons must read as a stencil at
     tile distance, not as moiré — drive them off a stable spatial
     function, not a raw `(x+y)%n` that aliases on wrap. Used as
     `bunker`'s base wall.

   Both follow the existing generator contract (`index.html:963-971`):
   single `pal` argument, return `new Uint32Array(TEX_SIZE*TEX_SIZE)`,
   **every output pixel is a `mix()`/`mix3()`/lerp of the five palette
   anchors — no hardcoded RGB literals**, and each instantiates its own
   `lcg(SEED_CONSTANT)` / spatial hash with a unique 32-bit seed
   constant distinct from all 15 existing generators' constants.

5. **The other new-theme textures reuse existing generators.** No other
   new generators are written. Each new theme's remaining 4 texture
   slots call an existing generator with the new palette. Exact
   `TEXTURES` additions (15 new keys, grouped by theme after the
   existing 15, in `THEMES` order):

   ```
   // abyss (themeIdx 3)
   abyss_crystal:  genCrystalFacet(THEME_PALETTES[3]),   // NEW gen, base
   abyss_stone:    genCryptStone(THEME_PALETTES[3]),     // reuse, accent A
   abyss_moss:     genCavernMoss(THEME_PALETTES[3]),     // reuse, accent B
   abyss_floor:    genCavernFloor(THEME_PALETTES[3]),    // reuse
   abyss_ceiling:  genCryptCeiling(THEME_PALETTES[3]),   // reuse

   // bunker (themeIdx 4)
   bunker_hazard:  genHazardStencil(THEME_PALETTES[4]),  // NEW gen, base
   bunker_panel:   genFoundryPanel(THEME_PALETTES[4]),   // reuse, accent A
   bunker_iron:    genFoundryIron(THEME_PALETTES[4]),    // reuse, accent B
   bunker_floor:   genFoundryFloor(THEME_PALETTES[4]),   // reuse
   bunker_ceiling: genFoundryCeiling(THEME_PALETTES[4]), // reuse

   // sanctum (themeIdx 5)
   sanctum_brick:  genCryptBrick(THEME_PALETTES[5]),     // reuse, base
   sanctum_rock:   genCavernRock(THEME_PALETTES[5]),     // reuse, accent A
   sanctum_mossy:  genCryptMossy(THEME_PALETTES[5]),     // reuse, accent B
   sanctum_floor:  genCryptFloor(THEME_PALETTES[5]),     // reuse
   sanctum_ceiling: genCryptCeiling(THEME_PALETTES[5]),  // reuse
   ```

   The existing 15 `TEXTURES` entries and their generator calls are
   **unchanged**. Reusing a generator with a different palette is sound
   precisely because the generator contract forbids hardcoded color
   literals; if any reused generator is found to contain a literal that
   defeats the recolor, parameterize that one literal from `pal` (and
   note it) rather than forking the generator.

6. **Lookup tables grow.** `WALL_VARIANTS` becomes a length-19 array
   (`null` at index 0; entries 1..18 = `themeIdx*3 + materialIdx + 1`
   for `themeIdx ∈ [0,5]`, `materialIdx ∈ [0,2]`), continuing the exact
   existing pattern:
   ```
   WALL_VARIANTS[10] = TEXTURES.abyss_crystal   // ... etc through
   WALL_VARIANTS[18] = TEXTURES.sanctum_mossy
   ```
   `FLOOR_VARIANTS` and `CEIL_VARIANTS` grow to 6 entries each
   (indices 3/4/5 = the new themes' floor/ceiling). `MM_THEME_COLOR`
   grows to 6 entries; the three new colors are functional, instantly
   distinguishable minimap dots in the new themes' family
   (suggested: `abyss` `#5a6aa8` cold blue, `bunker` `#c8a83a`
   caution yellow, `sanctum` `#b58a48` warm gold). The existing
   indices 0–2 of all four tables are unchanged.

7. **`forcedThemeIdx` state.** Declare `let forcedThemeIdx = -1;` at
   module scope inside the IIFE, near the other render-mode state
   (alongside `lightingEnabled` / `lightingToggledAtMs` is a good
   spot). `-1` = natural per-room mix (the BFS-assigned `THEME_MAP`,
   today's behavior). `0..THEMES.length-1` = force the whole dungeon to
   that theme. It is **render-only state** — nothing in
   `generateDungeon` / `applyDungeon` / collision / AI reads it.

8. **`T` cycles the override.** In the `keydown` handler (the
   edge-triggered block at `index.html:410-435`, next to the `KeyL`
   case), add a `KeyT` case:
   ```js
   } else if (e.code === 'KeyT') {
     forcedThemeIdx = (forcedThemeIdx + 2) % (THEMES.length + 1) - 1;
     themeToggledAtMs = nowMs;
   }
   ```
   so the cycle is `-1 → 0 → 1 → 2 → 3 → 4 → 5 → -1`. It is
   edge-triggered (ignores auto-repeat, same as the existing cases) and
   works whether the player is alive or dead (it is purely cosmetic, so
   it must not be gated on `player.hp`). `KeyT` must not be added to
   `blockedKeys` (it has no default browser action worth suppressing
   and is not a movement key).

9. **Transient label.** Declare `let themeToggledAtMs = -Infinity;` next
   to the existing `lightingToggledAtMs`. In `render()`, immediately
   after the existing lighting-label block
   (`index.html:3032-3040`), draw an analogous ~2 s fading label for
   the theme override, positioned so it does not overlap the lighting
   label (the lighting label uses a rect at `(2,20,96,16)` with text at
   `(6,22)`; draw the theme label one row below, e.g. rect
   `(2,38,96,16)`, text at `(6,40)`, same font/baseline/colors and the
   same `1 - elapsed/2000` alpha ramp). Label text:
   `theme: natural` when `forcedThemeIdx < 0`, otherwise
   `theme: ` + `THEMES[forcedThemeIdx]` (e.g. `theme: abyss`). Use the
   same `if (nowMs - themeToggledAtMs < 2000)` gate. After the 2 s
   window the label leaves no HUD presence (identical to the lighting
   label's behavior).

10. **Wall lookup honors the override (one branch per column).** In
    `render()` at the per-column wall fill (`index.html:2909`,
    `const tex = WALL_VARIANTS[hit.wallType] || WALL_VARIANTS[1];`),
    remap the cell value when an override is active, preserving the
    per-cell material variant so wall variety survives the re-skin:
    ```js
    let wt = hit.wallType;
    if (forcedThemeIdx >= 0 && wt > 0) {
      const variant = (wt - 1) % 3;          // 0/1/2, the cell's material
      wt = forcedThemeIdx * 3 + variant + 1; // same material, forced theme
    }
    const tex = WALL_VARIANTS[wt] || WALL_VARIANTS[1];
    ```
    This is one branch per screen column (≤ 480/frame), outside the
    per-pixel inner loop — no per-pixel cost added. The
    `|| WALL_VARIANTS[1]` guard is retained.

11. **Floor/ceiling cast honors the override.** In both branches of
    `castFloorCeiling` (the `lightingEnabled` path ≈ `index.html:2837-2842`
    and the legacy path ≈ `2865-2870`), the per-pixel theme pick must
    yield `forcedThemeIdx` when it is `≥ 0`, else the existing
    bounds-checked `THEME_MAP` lookup:
    ```js
    let theme;
    if (forced >= 0) {
      theme = forced;
    } else {
      theme = 0;
      if (mx >= 0 && mx < MAP_W && my >= 0 && my < MAP_H) {
        theme = THEME_MAP[my * MAP_W + mx];
      }
    }
    ```
    where `const forced = forcedThemeIdx;` is hoisted **once** to the
    top of `castFloorCeiling` (loop-invariant for the whole frame).
    Implementations may further fast-path the forced case by hoisting
    `FLOOR_VARIANTS[forced]` / `CEIL_VARIANTS[forced]` out of the pixel
    loop entirely, as long as behavior is identical; this is allowed but
    not required. The `forced < 0` path must remain byte-identical to
    today's output.

12. **Minimap honors the override.** In `drawMinimap` (`index.html:3412-3413`),
    replace
    ```js
    const t = THEME_MAP[my * MAP_W + mx];
    ```
    with
    ```js
    const t = (forcedThemeIdx >= 0) ? forcedThemeIdx
                                    : THEME_MAP[my * MAP_W + mx];
    ```
    so minimap wall dots recolor with the forced theme. Player triangle,
    enemy dots, pickup dots, and the exit cell are unchanged.

13. **No regeneration, no map mutation on `T`.** Pressing `T` must not
    call `generateDungeon`, `applyDungeon`, `regenerateDungeon`,
    `resetRun`, or `clearTransientFeedback`, and must not write to
    `MAP`, `THEME_MAP`, `enemies`, `pickups`, `player`, or any seed
    state. The layout, enemy positions/state, pickup positions, HP,
    ammo, score, and the dungeon seed are bit-for-bit unaffected by the
    override. Cycling back to `natural` restores exactly the look the
    dungeon had before any `T` press (the natural path is untouched).

14. **Determinism preserved (within a build).** `forcedThemeIdx`
    defaults to `-1`, so the first rendered frame after load with a
    pinned seed is unchanged by the *override mechanism* and is
    byte-identical across reloads of the same page
    (`?seed=12345` twice → identical first frame, the existing test).
    All new generators are pure/deterministic (#4). **Documented,
    intended contract change:** because `THEMES.length` grows from 3 to
    6, the existing per-room assignment
    `rooms[r].themeIdx = Math.floor(rand() * THEMES.length)`
    (`index.html:2180`) now draws from 6, so a given seed's *theme
    distribution* differs from the pre-expansion build. Room/corridor
    **geometry, connectivity, exit, enemy and pickup spawns are
    unaffected** — those RNG draws happen before theme assignment and
    are not reordered. No other line of `generateDungeon` changes; the
    `rand()` call order at `index.html:2180-2181` is not reordered.

15. **Performance.** ≥ 30 FPS at 480×270 with the existing 48×48
    procedural dungeon, in every override state including the new
    themes and `natural`. The wall path adds one per-column branch; the
    floor cast adds one loop-invariant-driven branch per pixel (the
    `room-themes` spec already accepted a per-pixel `THEME_MAP` read in
    this loop — this replaces, not stacks on, that read when forced).
    Texture bake adds 15 new generator invocations (2 new generators +
    13 reuse calls) at module init, before the first frame; total added
    bake time ≤ 50 ms on modern hardware. Bake still happens once,
    unconditionally, in fixed order.

16. **Atmosphere fog and vignette compose unchanged.** Fog/shade still
    reads the just-sampled texel and lerps toward `FOG_C`; the override
    only changes *which texture* is sampled, upstream of the blend.
    `lightingEnabled` (`L`) still toggles fog vs. legacy distance shade,
    independently of `forcedThemeIdx`; the two labels coexist without
    overlapping (#9). Vignette is unchanged.

17. **No regressions.** All of the following keep working identically:
    - Pointer-lock hint, `WASD`/arrow movement, Alt-arrow strafe,
      mouse-look.
    - Firing, hit-confirms, kill pops, ammo HUD.
    - Enemy AI (windup/fire/contact), enemy projectiles, damage flash,
      damage arrow, damage vignette.
    - `N` regenerate, `R` reset (on death), level exit progression,
      `?seed=` initial-map pin.
    - `L` lighting toggle + label, `M` mute toggle + SFX cadence.
    - Mobile touch joystick, look pad, fire button, and the existing
      N/L/M/RESET util buttons (unchanged — see Out of Scope re: no
      touch button for `T`).
    - FPS counter; sprite z-buffer occlusion.

18. **No new console errors or warnings** during a 60-second session
    that: walks through ≥ 2 natural-mix rooms, cycles `T` through all
    seven states (natural + 6 themes) and back, presses `N` at least
    twice, exits to a new level once, and toggles `L` and `M`.

## Out of Scope

- **An on-screen theme-picker menu/overlay.** The selection UX is the
  `T` cycle key + transient label only (consistent with the existing
  `L`/`M` toggle pattern). No list overlay, no numbered hotkeys, no
  click targets.
- **A touch/mobile button for the theme cycle.** The util button row
  (`UTIL_XS` has exactly 3 slots: N/L/M) is unchanged; adding a 4th
  button needs a touch-layout redesign and is a separate task. `T` is
  keyboard-only. (Note this as a possible follow-up; do not implement.)
- **Persisting the choice** across reloads or level transitions —
  no `localStorage` (forbidden by the single-file constraint), no
  `?theme=` URL param. `forcedThemeIdx` is session-only, in-memory, and
  resets to `-1` on page load. It deliberately *persists across* `N`,
  `R`, and level-exit within the same page session (it is render state,
  not dungeon state) — that is the intended "keep exploring this look
  across regenerations" behavior, not a bug.
- **More than the two specified new generators.** Exactly
  `genCrystalFacet` and `genHazardStencil`. The other 13 new-theme
  textures are existing-generator reuse with new palettes (#5). Do not
  author new floor/ceiling generators.
- **More than 6 themes**, or making `THEMES` dynamically sized via
  config/UI. Six fixed themes; the tables are sized for exactly six.
- **Retuning the existing crypt/foundry/cavern palettes or
  generators.** Indices 0–2 of `THEMES`, `THEME_PALETTES`,
  `WALL_VARIANTS`, `FLOOR_VARIANTS`, `CEIL_VARIANTS`, `MM_THEME_COLOR`,
  and all 15 existing `TEXTURES` entries are byte-identical to today.
- **Per-theme fog/lighting tints, sky/ground colors, or vignette.**
  `FOG_C`, `FOG_NEAR`, `FOG_FAR`, `VIGNETTE_*` stay global (matches the
  `room-themes` out-of-scope boundary).
- **Theme-specific enemies, sprite palettes, audio/music, props, or
  decorations.** Pure surface-treatment expansion.
- **Animated textures** (glowing/pulsing crystal, flashing hazard
  stripes). Textures bake once at startup and stay static.
- **Changing `generateDungeon`'s geometry, corridor carving, BFS
  connectivity/theme propagation, exit pick, or spawn algorithms.** The
  only effect on generation is the implicit one from `THEMES.length`
  growing (#14); no algorithm or `rand()`-order changes.
- **Reworking shared bake helpers** (`addOctave`, `lcg`, `rgba32`,
  `mix`, `mix3`). New generators may *call* them; their internals are
  unchanged.
- **Theme-as-difficulty / progression gating, per-level theme lock,
  cross-theme blending.** Out, exactly as in `room-themes`.

## Design Notes

### Files involved

`index.html` only.

### Hook points

Line numbers reflect the current file; expect small drift after edits.

- **Generator block** (`index.html:963-1442`): the contract comment at
  963-971 already states "no hardcoded RGB literals" — the two new
  generators must honor it. Add `genCrystalFacet` and `genHazardStencil`
  after the last existing generator (`genCavernCeiling`), before the
  `THEMES` / `THEME_PALETTES` block, so file order stays
  generators-then-tables.
- **`THEMES`** (`index.html:1445`): append `'abyss','bunker','sanctum'`.
- **`THEME_PALETTES`** (`index.html:1452-1474`): append entries 3–5;
  do not touch 0–2.
- **`TEXTURES`** (`index.html:1480-1496`): append the 15 keys from #5
  after the existing 15; do not touch the existing entries.
- **`WALL_VARIANTS` / `FLOOR_VARIANTS` / `CEIL_VARIANTS`**
  (`index.html:1502-1523`): extend each per #6.
- **`MM_THEME_COLOR`** (`index.html:3376`): extend to 6 entries.
- **Render-mode state** (near `lightingEnabled` /
  `lightingToggledAtMs`, `index.html:1562`): add `forcedThemeIdx` and
  `themeToggledAtMs`.
- **`keydown` handler** (`index.html:410-435`): add the `KeyT` case
  next to `KeyL`.
- **`render()` wall lookup** (`index.html:2909`): the remap from #10.
- **`render()` label block** (`index.html:3032-3040`): the second
  transient label from #9, directly after the lighting one.
- **`castFloorCeiling`** (`index.html:2829-2887`): hoist
  `const forced = forcedThemeIdx;` to the function top; apply #11 in
  both inner `xx` loops.
- **`drawMinimap`** (`index.html:3412-3413`): the `t` pick from #12.

### Theme summary (for the implementer's eye)

| Theme   | Idx | Wall base / accentA / accentB              | Floor (reuse) | Ceiling (reuse) | Minimap |
|---------|-----|--------------------------------------------|---------------|-----------------|---------|
| crypt   | 0   | brick / stone / mossy *(unchanged)*        | crypt_floor   | crypt_ceiling   | slate   |
| foundry | 1   | iron / panel / scorch *(unchanged)*        | foundry_floor | foundry_ceiling | rust    |
| cavern  | 2   | rock / moss / dirt *(unchanged)*           | cavern_floor  | cavern_ceiling  | moss    |
| abyss   | 3   | **crystal(NEW)** / cryptStone / cavernMoss | cavernFloor   | cryptCeiling    | blue    |
| bunker  | 4   | **hazard(NEW)** / foundryPanel / foundryIron | foundryFloor | foundryCeiling  | yellow  |
| sanctum | 5   | cryptBrick / cavernRock / cryptMossy        | cryptFloor    | cryptCeiling    | gold    |

The per-cell `materialIdx` (0/1/2) is preserved across the re-skin
(#10), so a forced dungeon still shows the 50/30/20 base/accentA/accentB
variety the `room-themes` `pickWallVariant` weighting produced — just in
the chosen theme's palette and (for `abyss`/`bunker`) with the new base
structure.

### Why apply the override at lookup-time, not by regenerating

The whole point of "visually explore alternative visuals" is comparing
looks on *the same* dungeon. Regenerating or rewriting `THEME_MAP` would
change the layout (new seed) or destroy the natural mix irreversibly,
defeating A/B comparison and breaking the "back to natural restores
exactly" guarantee (#13). A frame-constant `forcedThemeIdx` consulted at
the three read sites is O(1) state, instantly reversible, and leaves the
generation pipeline and determinism story untouched.

### Why `(wt - 1) % 3` for the wall remap

`MAP[y][x]` encodes `themeIdx*3 + materialIdx + 1` (the `room-themes`
contract). `(wt - 1) % 3` recovers the cell's `materialIdx` without a
parallel array; `forcedThemeIdx*3 + materialIdx + 1` re-encodes it under
the forced theme. This keeps per-cell material variety (base vs. the two
accents) instead of flattening every wall to one texture, so a forced
level still has internal texture interest.

### Why the contract change in #14 is acceptable

`room-themes` explicitly listed "more than three themes" as a future
spec and tied the seed contract to `THEMES.length`. Expanding the set is
exactly that future spec. Geometry/spawn determinism (the part players
and bug reports actually depend on) is preserved because those draws
precede theme assignment and are not reordered. Same-seed *visual*
reproduction across the 3→6 jump is explicitly not promised.

### New-generator sketches (non-binding, for orientation)

- `genCrystalFacet`: scatter ~10–16 deterministic seed points from
  `lcg(<unique>)`; for each pixel find the nearest seed (toroidal
  distance so it wraps), shade by `mix3(shadow, base, highlight, f)`
  where `f` derives from the seed's id/orientation; where the nearest
  and second-nearest distances are within a small epsilon, paint the
  facet edge as a `mix(base, accent, 0.7)` rim. Sparse `extra` veins
  optional.
- `genHazardStencil`: `addOctave`-driven low-contrast concrete in
  `mix3(shadow, base, highlight, n)`; overlay a horizontal band
  (rows ~26–38) where a wrap-stable chevron predicate selects between
  `accent` and `shadow`; frame the 64×64 tile with a 1–2px `extra`
  seam so it reads as a bolted panel. Keep the chevron period a divisor
  of 64 to avoid a wrap seam.

These are starting points — any technique that meets #4's "reads as
crystal / hazard-stenciled concrete at any in-game distance, seamless on
wrap, palette-only colors, own unique lcg seed" bar is acceptable.

## Agent Notes

- **Read first:** `AGENTS.md`, `CLAUDE.md`, this spec, the shipped
  `specs/tasks/room-themes.md` (the architecture this builds on), then
  in `index.html`:
  - generator contract + generators (`963-1442`) — read `genCryptBrick`,
    `genCryptStone`, `genCavernMoss`, `genFoundryPanel`,
    `genFoundryIron`, `genFoundryFloor/Ceiling`, `genCryptFloor/Ceiling`,
    `genCavernFloor` closely (these are the reused ones; confirm each
    derives all color from `pal`)
  - `addOctave` / `lcg` / `rgba32` / `mix` / `mix3`
  - `THEMES`/`THEME_PALETTES`/`TEXTURES`/`*_VARIANTS` (`1443-1523`)
  - `keydown` handler (`410-435`), render-mode state (`~1562`)
  - `render()` wall fill + label block (`2895-3041`)
  - `castFloorCeiling` (`2815-2887`)
  - `drawMinimap` + `MM_THEME_COLOR` (`3371-3416`)
  Make all edits inside the assigned worktree only.

- **Order of work:**
  1. Add `genCrystalFacet` and `genHazardStencil` after
     `genCavernCeiling`. Temporarily `console.log` a few output pixels
     to sanity-check packed RGBA; remove logs before committing.
  2. Append palettes 3–5 to `THEME_PALETTES` (leave 0–2 alone).
  3. Append the 15 `TEXTURES` keys (#5), then extend
     `THEMES`, `WALL_VARIANTS`, `FLOOR_VARIANTS`, `CEIL_VARIANTS`,
     `MM_THEME_COLOR`.
  4. Add `forcedThemeIdx` / `themeToggledAtMs` state and the `KeyT`
     case (verify the cycle math hits exactly `-1..5` and wraps).
  5. Wire the three lookup sites: wall remap (#10), floor/ceiling
     hoist+branch (#11), minimap (#12).
  6. Add the transient label (#9); confirm it does not overlap the
     lighting label when both fire within 2 s of each other.
  7. `node --check` the extracted `<script>` body.
  8. Browser smoke test (below).

- **Common pitfalls:**
  - **Cycle math off-by-one.**
    `forcedThemeIdx = (forcedThemeIdx + 2) % (THEMES.length + 1) - 1;`
    from `-1` → `0`, from `5` → `-1`. Verify all 7 transitions before
    relying on the label.
  - **Hardcoded literal in a reused generator.** The contract forbids
    them and a grep of `rgba32([0-9]` over `963-1442` currently returns
    nothing — but verify each reused generator before trusting the
    recolor. If one slipped in, parameterize that single value from
    `pal` and note it; do not fork the generator.
  - **Per-pixel branch in the floor cast keyed off a non-hoisted
    `forcedThemeIdx`.** Hoist `const forced = forcedThemeIdx;` once per
    `castFloorCeiling` call. The `forced < 0` path must stay
    byte-identical to today (don't reorder the bounds check).
  - **`WALL_VARIANTS` length / index drift.** Length must be 19, index
    0 `null`, `WALL_VARIANTS[forcedThemeIdx*3 + variant + 1]` in range
    for `forcedThemeIdx ≤ 5`. Keep the `|| WALL_VARIANTS[1]` guard.
  - **Mutating dungeon state on `T`.** No regenerate/reset/clear, no
    writes to `MAP`/`THEME_MAP`/`enemies`/`pickups`/`player`. `T` is
    cosmetic-only and must work while dead.
  - **Label overlap.** The theme label must sit at a different `y` than
    the lighting label (`room (2,20,..)` rect / `(6,22)` text). Use the
    row below.
  - **New generator wrap seam.** Crystal facets and hazard chevrons
    must tile seamlessly at the 64-px edge (the renderer repeats the
    texture). Use toroidal distance / a 64-divisor period; verify by
    standing close to a long wall and looking for a vertical seam.
  - **Touching crypt/foundry/cavern.** Indices 0–2 everywhere must stay
    byte-identical. A pre/post first-frame diff of a seed whose rooms
    are all `themeIdx ≤ 2` *will* differ only if you regressed an
    existing entry — but note the theme *distribution* for any given
    seed legitimately changes (#14), so compare a forced-`crypt`
    (`T` to crypt) render against a pre-spec crypt-only render for the
    legacy-texture regression check, not a natural-mix render.
  - **Shared `lcg` between generators.** Each new generator gets its
    own unique seed constant; never share a PRNG across generators.

- **Smoke test before reporting** (`make serve`, open in a browser):
  - Load with `?seed=12345`. Natural mix renders (default
    `forcedThemeIdx = -1`); confirm it looks like a normal
    multi-theme dungeon.
  - Press `T` once: label `theme: crypt`, the *whole* visible dungeon
    (walls, floor, ceiling, minimap dots) is crypt, layout/enemies
    unchanged.
  - Press `T` six more times stepping crypt→foundry→cavern→abyss→
    bunker→sanctum→natural. Each shows its label, re-skins instantly,
    and `sanctum→natural` returns to the exact original look.
  - In `abyss`, confirm the base walls read as glinting crystal facets
    (the new generator), not a recolored brick. In `bunker`, confirm
    the base walls read as stenciled hazard concrete. Stand close to a
    long wall in each: no vertical wrap seam.
  - With a theme forced, press `N`: a new dungeon generates and stays
    in the forced theme (override persists across regen by design).
    Press `T` to `natural`: the new dungeon shows its natural mix.
  - Force a theme, die, press `R`: reset run stays in the forced theme.
  - Toggle `L` while a theme is forced: fog on/off both render the
    forced theme's floor/ceiling correctly; the lighting and theme
    labels can both be visible without overlapping.
  - Walk to the exit, step on it: new level loads; the override state
    is unchanged across the transition.
  - FPS counter ≥ 30 in every state, including spinning in an
    `abyss`/`bunker` room (the new generators' textures bake once;
    runtime cost is unchanged from natural).
  - `?seed=12345` twice (close tab, reopen): first frame byte-identical
    (override defaults to `-1`; determinism within the build holds).
  - DevTools console: no new errors/warnings; no
    `forcedThemeIdx is not defined`, no `THEME_MAP is null`,
    no out-of-range `WALL_VARIANTS` lookups.

- **At minimum** run `node --check` against the extracted `<script>`
  body before reporting.

- Keep the two new generators clustered after the existing 15 (file
  order = generators then tables), the new palettes/textures/variant
  entries appended in `THEMES` order, and `forcedThemeIdx` /
  `themeToggledAtMs` adjacent to the existing render-mode state — so a
  future spec (more themes, a picker overlay, persistence) finds the
  extension points at a glance.

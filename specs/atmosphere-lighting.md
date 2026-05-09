---
id: atmosphere-lighting
area: frontend
priority: 45
depends_on: [raycaster-mvp]
description: Distance fog, vignette, and sky/floor gradient post-effects on the rendered frame
---

# Atmosphere & Lighting — Fog, Vignette, and Sky Gradient

## Goal

Replace the current "every wall pixel is a flat-shaded color, ceiling and floor are solid blocks" look with a cohesive atmospheric pass: distance fog that fades far walls toward a tunable horizon color, a soft vignette that pulls focus to the center of the screen, and a vertical gradient on the ceiling and floor so they read as sky and ground rather than colored stripes. The pass is purely *post*: it operates on whatever the renderer produced — solid colors today, textures tomorrow if `textured-surfaces` ships first — without knowing or caring which.

## Acceptance Criteria

1. **Single-file constraint preserved.** Still one `index.html` at the repo root, no build, no external assets, no network. The atmosphere pass is implemented entirely with arithmetic on the existing `buf32` / `buf8`.
2. **Distance fog on walls.** For each wall pixel written this frame, the final color is `lerp(wallColor, FOG_C, t)` where `t = clamp((d - FOG_NEAR) / (FOG_FAR - FOG_NEAR), 0, 1)` and `d` is the per-column `perpWallDist` returned by `castColumn`. Constants:
   - `FOG_C   = rgba32(70, 80, 110)`  (a desaturated blue-grey horizon)
   - `FOG_NEAR = 1.5`  cells (no fog at all closer than this)
   - `FOG_FAR  = 14.0` cells (fully fogged beyond this)
   These are tuneable but the names and meanings are part of this spec's contract.
3. **Distance shade replacement.** Fog *replaces* the existing `shade = Math.min(1, 5 / (d + 0.5))` darkening on walls. Do not run both — they fight each other and produce muddy mid-distance pixels. The fog blend toward `FOG_C` is the only distance-based color modification on walls. Side shading (`× 0.6` on `side === 1`) is still applied **before** the fog blend so corners still read as corners through the haze.
4. **Distance fog on floor.** If floor texturing has shipped (`textured-surfaces`), apply the same fog blend per-row using the row's `rowDist`. If textures have not shipped, the floor is currently a flat color block — in that case, replace `FLOOR_C` with a per-row gradient: at the row immediately below the horizon (`y === HALF_H`) the color equals `FOG_C`; at `y === H - 1` it equals a `GROUND_C = rgba32(60, 50, 40)` near-camera color; rows in between linearly interpolate. This produces a believable "ground recedes into haze" without doing any actual floor casting.
5. **Sky gradient ceiling.** Replace the flat `CEIL_C` with a vertical gradient: `y === 0` is `SKY_TOP = rgba32(20, 24, 48)`; `y === HALF_H - 1` equals `FOG_C` (so the sky meets the wall fog and the floor fog at the horizon). Linearly interpolated. Implemented as a precomputed `Uint32Array(HALF_H)` of sky colors filled once at startup, then `buf32.set(SKY_ROW, ...)` per row at the start of `render()` (or written into the buffer in a single per-row loop). Re-blend on top of textured ceiling pixels if `textured-surfaces` has shipped (see #9).
6. **Vignette.** A radial darkening applied in a final post-pass before the crosshair / FPS / HUD overlays. Per-pixel multiplier `m = lerp(1.0, VIGNETTE_DARKEN, smoothstep(VIGNETTE_INNER, VIGNETTE_OUTER, r))` where `r` is the normalized distance from screen center (`r = sqrt((px - W/2)² + (py - H/2)²) / sqrt((W/2)² + (H/2)²)`). Constants:
   - `VIGNETTE_INNER  = 0.55`  (no darkening at or below)
   - `VIGNETTE_OUTER  = 1.05`  (full darkening at or above)
   - `VIGNETTE_DARKEN = 0.55`  (1.0 = no effect, 0.0 = pure black at the corners)
   Precompute the multiplier into a `Uint8ClampedArray(W*H)` (or `Uint16Array` if you need more precision) at startup; the per-frame pass is a single multiply per channel per pixel.
7. **Application order in `render()`** (frozen contract):
   1. Fill the sky-gradient ceiling rows.
   2. Fill the ground-gradient floor rows (or run the textured-floor cast, with per-row fog applied).
   3. Cast walls and write fogged + side-shaded wall pixels.
   4. Draw sprites (if `sprite-enemies` has shipped). **Sprites are also fogged** using their `transformY` (perpendicular distance) — same `FOG_NEAR` / `FOG_FAR` curve, applied after the existing per-pixel transparency check.
   5. Vignette pass over the entire `buf32`.
   6. `ctx.putImageData(buf, 0, 0)`.
   7. Crosshair, HUD, FPS counter (these are drawn via `ctx.fillRect` / `fillText` on top of `putImageData` and **must not be vignetted**).
8. **Performance.** ≥ 30 FPS at 480×270 still holds. The vignette pass is `W*H = 129,600` pixel ops; with a precomputed multiplier table and `Uint32` channel extraction it sits well under a millisecond on modern hardware. Fog adds ~1 mul + 1 add per channel per wall/floor/ceiling pixel; that's the same order as the existing distance shade.
9. **Composition with `textured-surfaces`.**
   - If textures have shipped: fog and vignette operate on the *textured* RGBA values. Sky gradient is blended on top of the (sampled) ceiling pixels — `out = lerp(textureSample, skyRow[y], 0.85)` produces a pleasant haze-over-stone look. Ground gradient applies similarly to floor pixels. Walls are unmodified except for the fog blend.
   - If textures have not shipped: the existing solid wall colors are the input to the fog blend, and the ceiling/floor become pure gradients (no texture to blend against).
   The implementer must detect which path is active and produce a correct, attractive result either way; both compositions are part of this spec.
10. **Toggle key.** Pressing `L` (uppercase or lowercase) toggles a global `lightingEnabled` flag. When `false`, the renderer falls back to the previous behavior (flat ceiling/floor colors, no fog, no vignette). When `true`, the full atmosphere pipeline runs. Default is `true`. The toggle exists for visual debugging and direct comparison; it is **not** a "graphics quality" setting and is not surfaced in the HUD beyond a one-line debug overlay (`lighting: on/off`) shown in the corner only when toggled in the last 2 seconds (so it doesn't clutter the HUD).
11. **No regressions.** Existing FPS counter, crosshair, pointer-lock click hint, walking, mouse-look, and (if shipped) sprite z-buffer occlusion, ammo HUD, minimap, and audio all continue to work identically. The atmosphere pass must not write into any HUD region — HUD/overlay drawing happens *after* `putImageData`, so as long as you only touch `buf32`, you're fine.
12. **No new console errors** for a 60-second walk including pressing `L` to toggle lighting on/off at least three times.

## Out of Scope

- Real ray-traced lighting, light sources, lightmaps, or per-cell ambient values. The fog is purely distance-based; there are no in-world light emitters.
- Bloom, lens flares, motion blur, depth of field. Different visual languages — not this spec.
- Per-wall-type fog colors (e.g., red fog in a "fire room"). Single global `FOG_C`.
- Volumetric god rays. Not happening at 480×270 with a fill-rate-bound CPU renderer.
- A graphics-quality settings menu / preset system.
- Animating the fog or sky (rolling clouds, day/night cycle). The sky gradient is static.
- Tone mapping or HDR. Output is straight 8-bit-per-channel sRGB-ish via `Uint32`.
- Modifying `sprite-enemies`'s sprite renderer beyond the fog blend in #7.4 — no shader-style overhauls of how sprites are tinted.
- Changing texture generation (that's `textured-surfaces`'s domain).

## Design Notes

- **Symbols this spec depends on / will modify:**
  - `render()` — gains a sky-fill, a ground-fill (or textured-floor fog), a wall-pixel fog blend, and a final vignette pass.
  - `castColumn(x)` — `perpWallDist` is the fog-distance input.
  - `fillBackground()` — replaced by sky + ground gradients (or deleted if `textured-surfaces` already removed it).
  - `rgba32`, `buf32`, `buf8`, `HALF_H`, `W`, `H` — unchanged.
  - `keys`, key event handlers — extend with the `L` toggle.
- **Fog blend on a packed RGBA**:
  ```
  function fogBlend(c, t) {
    // c = textured/wall pixel; FOG_C32 = packed fog color; t in [0,1]
    const r = c & 0xff, g = (c >> 8) & 0xff, b = (c >> 16) & 0xff;
    const fr = FOG_C32 & 0xff, fg = (FOG_C32 >> 8) & 0xff, fb = (FOG_C32 >> 16) & 0xff;
    const it = (t * 256) | 0, ib = 256 - it;
    const or = (r * ib + fr * it) >> 8;
    const og = (g * ib + fg * it) >> 8;
    const ob = (b * ib + fb * it) >> 8;
    return (255 << 24) | (ob << 16) | (og << 8) | or;
  }
  ```
  Note this is integer-only; cheap. Inline at the call site if function-call overhead matters.
- **Vignette table**:
  ```
  const VIGNETTE = new Uint16Array(W * H); // 0..256, 256 = no darkening
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x - W * 0.5) / (W * 0.5);
      const dy = (y - H * 0.5) / (H * 0.5);
      const r = Math.sqrt(dx*dx + dy*dy);
      const t = Math.max(0, Math.min(1,
        (r - VIGNETTE_INNER) / (VIGNETTE_OUTER - VIGNETTE_INNER)));
      const ts = t * t * (3 - 2 * t); // smoothstep
      const m = 1 + (VIGNETTE_DARKEN - 1) * ts;
      VIGNETTE[y * W + x] = (m * 256) | 0;
    }
  }
  ```
  Per-pixel apply:
  ```
  const m = VIGNETTE[i];
  const c = buf32[i];
  const r = ((c & 0xff) * m) >> 8;
  const g = (((c >> 8) & 0xff) * m) >> 8;
  const b = (((c >> 16) & 0xff) * m) >> 8;
  buf32[i] = (255 << 24) | (b << 16) | (g << 8) | r;
  ```
  Tight loop, no branches.
- **Sky gradient as a pre-baked row table**:
  ```
  const SKY_ROW = new Uint32Array(HALF_H);
  for (let y = 0; y < HALF_H; y++) {
    const t = y / (HALF_H - 1);
    const r = ((SKY_TOP & 0xff) * (1 - t) + (FOG_C32 & 0xff) * t) | 0;
    const g = (((SKY_TOP >> 8) & 0xff) * (1 - t) + ((FOG_C32 >> 8) & 0xff) * t) | 0;
    const b = (((SKY_TOP >> 16) & 0xff) * (1 - t) + ((FOG_C32 >> 16) & 0xff) * t) | 0;
    SKY_ROW[y] = (255 << 24) | (b << 16) | (g << 8) | r;
  }
  // In render():
  for (let y = 0; y < HALF_H; y++) buf32.fill(SKY_ROW[y], y * W, (y + 1) * W);
  ```
- **Sprite fog** (if `sprite-enemies` has shipped). Inside that spec's per-sprite renderer, after the existing alpha and distance-shade math, blend the resulting pixel toward `FOG_C` with the same `t = clamp((transformY - FOG_NEAR) / (FOG_FAR - FOG_NEAR), 0, 1)`. This keeps enemies receding visually instead of "popping" at full color from the haze.
- **Tunable constants stay top-level.** All five constants (`FOG_C`, `FOG_NEAR`, `FOG_FAR`, `VIGNETTE_*`, `SKY_TOP`, `GROUND_C`) live in a single `LIGHTING` block near the other render constants. Don't bury them inside `render()`.

## Agent Notes

- Read `AGENTS.md` and `specs/raycaster-mvp.md` first. If `specs/textured-surfaces.md` and/or `specs/sprite-enemies.md` are *already implemented* on the branch you're working on, also read those — your fog/vignette pass has to compose with what they wrote. If they're authored-but-not-implemented, treat them as out of scope and design for the solid-color path; the next spec to land that adds textures/sprites will be responsible for hooking into your fog constants.
- Single-file, vanilla JS, no build, no `package.json`. Same constraint as every previous spec.
- **Do this spec second-pass-style.** Don't try to rewrite `render()` from scratch. Add the four pieces (sky fill, ground fill or textured-floor fog hook, wall fog inline, final vignette pass) as edits to the existing structure.
- **Composition discipline.** When `textured-surfaces` has shipped, this spec must *not* re-implement texture sampling — it operates on `buf32` after textures have been written. The only places it modifies the inner loops directly are the wall-pixel write (where the fog blend is cheapest to inline against the just-sampled texture pixel) and the floor row (same reason). The sky and vignette are purely post-pass.
- **Common pitfalls:**
  - **Stacking fog on top of the existing distance shade** — produces a muddy mid-distance band. Pick fog *or* shade for walls; this spec says fog (#3).
  - **Vignetting the HUD.** If you call the vignette loop after `ctx.putImageData` but you also re-render HUD elements *into the buffer* (you shouldn't, they go through `ctx.fill*`), you'll dim them. Keep HUD on the canvas overlay path only.
  - **Re-baking the vignette table every frame** — costs ~30ms; the table is fixed for the run, bake once at startup.
  - **Off-by-one at the horizon** — sky row `HALF_H - 1` should equal `FOG_C`, and the wall/ground rows starting at `y === HALF_H` should also start at `FOG_C`. If there's a visible seam at the horizon you've misaligned the gradient endpoints.
  - **Toggle leaks state.** When `lightingEnabled === false`, you must skip the vignette multiply *and* restore the old flat ceiling/floor fill. Don't run the post-pass with `m = 256` per pixel — it's a wasted full-buffer iteration.
  - **Sprite fog applied twice.** If you put sprite fog in this spec *and* also leave the existing sprite distance-shade in place, sprites will read too dark in the mid-field. Replace the existing distance-shade on sprites with the fog blend (mirror what walls do).
- Smoke-test before reporting:
  - Serve the file (`python3 -m http.server`). Walk to a far corner of the map. Confirm: distant walls fade smoothly toward `FOG_C`; near walls are unchanged; the ceiling reads as sky and meets the fog at the horizon; the corners of the screen are visibly darker than the center; the FPS counter and crosshair are *not* darkened by the vignette.
  - Press `L`. Confirm the entire post-pass disappears (ceiling becomes flat blue-grey, no fog, no vignette) and a brief `lighting: off` debug indicator shows. Press `L` again; debug shows `lighting: on` and disappears after 2 s.
  - Stand 10 cells from a stone block. The block's color should be a clearly-mixed `lerp(stoneBlue, fogColor, ~0.6)` — *not* the original solid blue, *not* full fog. Visually verify on a known reference frame.
  - Walk past a sprite enemy (if `sprite-enemies` has shipped). The enemy should also fade with distance, not pop at full saturation.
  - FPS counter stays ≥ 30 throughout. No console output.
  - Run `node --check` against the extracted `<script>` body.
- The constants `FOG_C`, `FOG_NEAR`, `FOG_FAR`, and `VIGNETTE_*` are part of this spec's *contract*, not just defaults. The next polish-tier spec (or a future "graphics tuning" spec, if it ever exists) is allowed to expose them as sliders, but the names and semantics must not be renamed under your watch.

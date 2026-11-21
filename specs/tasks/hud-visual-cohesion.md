---
id: hud-visual-cohesion
area: frontend
priority: 50
depends_on: []
description: Give the HUD one visual language — shared style tokens; a bottom strip with dim labels, bright values and fixed slots; a thicker colour-shifting HP bar; one toast slot replacing the stacked lighting/theme labels and announcing weapon switches; FPS moved off the minimap and framed minimap; death and level banners drawn by one panel helper; a gapped crosshair.
---

# HUD Visual Cohesion — One Look for Strip, Toasts, Banners and Crosshair

## Goal

The HUD grew one spec at a time: a flat 60 %-black strip whose weapon
token drifts with the width of the HP digits, a 2-px HP bar, an FPS box
painted *over* the top-left corner of the minimap with the `lighting:`
and `theme:` labels stacked beneath it (also over the minimap), a death
band and a `LEVEL N` banner drawn as two unrelated rectangles, and a
3-px crosshair. This task makes those elements read as one system
without changing any gameplay rule, keybind, timing constant or touch
hit-test: a single `HUD_STYLE` token set, a restyled strip that holds
on the desktop / medium / narrow tiers, a 4-px HP bar that shifts
colour as HP drops, one shared toast slot (also used to announce weapon
switches), the FPS readout relocated to the top-right, a framed
minimap, one banner helper for `YOU DIED` and `LEVEL N`, and a slightly
larger gapped crosshair. Everything that is not HUD — world render,
sprites, viewmodel, audio, AI, pickups — is untouched.

## Acceptance Criteria

1. **Shared style tokens, no new inputs or schema.** A single
   module-scope `const HUD_STYLE = { panel, border, label, value,
   accent, warn, shadow }` (names indicative; at least a panel fill, a
   border, a dim label colour, a bright value colour, the existing cyan
   accent `#7fd3ff` and the existing warning red `#f55`) is declared
   near `drawHUD`. Every colour painted by `drawHUD`, the toast, the FPS
   readout, the minimap frame, the banner helper and the crosshair comes
   from `HUD_STYLE` or from an existing named constant; those functions
   contain no new colour literals (the hud-feedback-polish low-ammo
   ramp `#f55` / `#a22` may stay inline or move into the tokens). No key
   is added to the `keydown` handler or to `blockedKeys`, the `stats`
   schema is unchanged, no `localStorage`, no DOM element, no second
   canvas, no `Math.random()` / `rand()` in any render path.

2. **Bottom strip: dim label, bright value, fixed slots, three tiers.**
   `drawHUD` draws each readout as a dim label (`HUD_STYLE.label`)
   followed by a bright value (`HUD_STYLE.value`): `HP`, the weapon
   token, `AMMO` as `n/MAX_AMMO`, `LEVEL`, `KILLS`. Slot x-positions are
   fixed per tier and do not depend on `measureText` of the live values
   (the weapon token's left edge no longer moves when HP goes from 100
   to 9). Observable: at `?seed=12345`, take damage so HP shows two
   digits, then one; the weapon token's `weaponHudRect.x` is identical
   in all three states. The strip holds on all three tiers (desktop
   12/18, touch medium 14/22, touch narrow 16/26): no token overlaps its
   neighbour and no text runs past `W` or below `H` when every value is
   at its widest (`HP 100`, `AMMO 24/24`, `LEVEL 99`, `KILLS 999`,
   weapon `SHOTGUN`). `weaponHudRect` is still refreshed every `drawHUD`
   and `weaponLabelHit` (with its 6-px pad) still cycles the weapon on
   touch. The low-ammo colour rules are unchanged (`ammo > 5` value
   colour, `1–5` solid `#f55`, `0` pulsing `#f55`/`#a22` at ~3 Hz) and
   apply to the AMMO *value* only. `HUD_STRIP_H` and `HUD_FONT_PX` per
   tier are unchanged.

3. **HP bar: 4 px, colour by threshold.** The bar directly above the
   strip is 4 px tall (occupying `H - HUD_STRIP_H - 4 … H - HUD_STRIP_H
   - 1`), full width, with a dark track and a filled fraction
   `player.hp / MAX_HP` rounded as today. Fill colour by HP: `> 60`
   green-ish, `31–60` amber, `≤ 30` the existing `#e22` red (the same
   threshold the heartbeat pulse uses). Exact colours are tokens in
   `HUD_STYLE`. Observable: with the pistol at `?seed=12345`, the bar
   reads green at HP 100, amber after dropping to 50, red at 25, and
   its width still tracks HP to the pixel (`(W * hpFrac) | 0`).

4. **One toast slot replaces the stacked L / T labels and announces
   weapon switches.** A single module-scope slot (`{ text, atMs,
   untilMs } | null`) and one `showToast(text, durMs)` helper replace
   `lightingToggledAtMs` and `themeToggledAtMs` (both declarations and
   all four writes: `KeyL`, `KeyT`, the touch `L` util button, and the
   two `render()` label blocks). `L` shows `lighting: on|off`, `T` shows
   `theme: <name>` (same strings as today, 2000 ms, linear fade), and an
   *actual* weapon change through `setWeapon` (not the redundant-key
   no-op, not `resetRun`'s direct `weapon = 'pistol'`, not load) shows
   the weapon's `WEAPONS[weapon].name` for ~900 ms. A new toast replaces
   the current one (newest wins; no queue, no stacking). The toast is a
   panel + text drawn top-centre, below the FPS/minimap row and above
   `(H * 0.32) | 0` so it never overlaps the minimap, the FPS readout,
   the touch util row at `UTIL_ROW_Y`, or the `LEVEL N` banner. It
   works while dead for `L` / `T` (as today) and weapon switches stay
   inert while dead (as today). Not cleared by `clearTransientFeedback`
   (matches today's labels, which survive N-regen); it simply expires.

5. **Top-left tidy: FPS off the minimap, minimap framed, nothing
   overlaps.** The FPS readout moves to the top-right corner, right-
   aligned to `W - 4`, in a 10-px monospace font on a `HUD_STYLE.panel`
   box no taller than 14 px, same `NN fps` text, same 0.5-s update
   cadence. The minimap keeps its exact rect (`MM_X`, `MM_Y`,
   `MM_SIZE` = 8, 8, 96) and contents, and gains a 1-px
   `HUD_STYLE.border` frame drawn *outside* the rect (`7, 7, 98, 98`),
   so the touch util row at `UTIL_ROW_Y = 110` and all hit-tests are
   untouched. After this task no two of {minimap + frame, FPS box,
   toast panel, util row, strip, HP bar} share a pixel in any tier; the
   `drawDamageArrow` radius (`min(W,H)/2 - 28`) and the damage vignette
   are unchanged and may still overlap them as they do today.

6. **One banner helper for `YOU DIED` and `LEVEL N`.** A single
   `drawBanner(text, centreY, { font, color, alpha, h })` draws a full-
   width `HUD_STYLE.panel` band with 1-px `HUD_STYLE.border` lines on its
   top and bottom edges and centred text; both the death overlay and the
   level banner call it. `LEVEL N` keeps its position (`(H * 0.32) | 0`,
   28 px band), 18-px font, 1200 ms duration and 400 ms fade; `YOU DIED
   — press R to restart` / `— tap RESET to restart` keeps its text, red
   `#f55`, 12-px font and a band no taller than 28 px centred on `H >>
   1`, so the touch RESET button at `(H/2) + 32` is still fully visible
   and tappable. `YOU DIED` still wins over `LEVEL N` when both are
   active, and `drawTouchHUD` still draws after the death band.

7. **Crosshair with a gap; weapon token flash on switch.** The crosshair
   stays centred on `(W >> 1, H >> 1)`, keeps its 1-px dark outline and
   its `hitTintUntil` red tint, and becomes four 3-px arms with a 2-px
   gap from the centre pixel (total extent ≤ 11 × 11 px, centre pixel
   unfilled) on both desktop and touch. On an actual weapon change the
   strip's weapon token renders in `HUD_STYLE.value` (bright) and eases
   back to `HUD_STYLE.accent` over ~300 ms, driven by the same timestamp
   the weapon toast uses (no second timer). Touch aim assist, which
   reads enemy angles and not crosshair pixels, is unaffected.

8. **Smoke, determinism, size, syntax.** `node --check` on the extracted
   `<script>` body passes; `make check` passes (the baked region is not
   touched); `index.html` grows by at most 6 KB over today's 207,100
   bytes. At `?seed=12345` the first rendered frame is byte-identical
   reload after reload (no new nondeterminism), and the world pixels
   above the HP bar and outside the minimap frame, FPS box, toast and
   crosshair are identical to today's first frame. The existing ≥ 30 FPS
   target holds with all enemies alive; the restyle adds only
   `fillRect` / `fillText` / `strokeRect` calls and at most one
   `measureText` per toast (none per frame in `drawHUD`). No console
   errors or warnings in a smoke session that: loads at `?seed=12345`;
   switches weapons with `1`, `2` after the shotgun pickup, `3`, `Q`
   (toast + token flash each time; no toast on a redundant `1`); presses
   `L` and `T` repeatedly (one toast, newest wins); takes damage through
   60 and 30 HP (bar amber then red, heartbeat still pulses); empties
   the magazine (AMMO value red then pulsing); dies (banner, no toast
   on the implicit pistol reset), presses `R`; walks onto the exit
   (`LEVEL 2` banner via the helper); presses `N` and `M`; and, with
   DevTools device emulation at a 375-px and a 412-px CSS width, shows
   the narrow and medium tiers with the weapon-label tap and util
   buttons still working.

## Out of Scope

- Any new keybind or settings UI (no FPS toggle key, no HUD-scale
  option), URL parameters, persistence.
- Changing `HUD_STRIP_H`, `HUD_FONT_PX`, the touch tier breakpoint
  (`clientWidth <= 380`), `UTIL_ROW_Y`, `UTIL_XS`, `BTN_W/H/R`, the
  joystick, the RESET button rect, or `pointInResetBtn` /
  `utilButtonAt` / `weaponLabelHit` geometry beyond `weaponHudRect`
  being refreshed from the new fixed slot.
- The hud-feedback-polish layer's *behaviour*: damage vignette,
  heartbeat (thresholds, rates, alphas), damage arrow, `+1` kill pops,
  pickup pops, low-ammo thresholds and pulse rate stay as they are.
  Only colours may be routed through `HUD_STYLE`.
- Ammo pips or a magazine graphic; a numeric HP-only or icon-only
  strip; weapon icons in the strip.
- Minimap content, size, position, scale, fog of war, theme colours,
  or the player triangle.
- Viewmodel placement (`baseY`, `GUN_*`), the gun shadow band, muzzle
  flash, muzzle wash, FOV punch, kick, bob, sway.
- Audio (no weapon-switch sound), AI, damage numbers, pickup rules,
  level progression, `stats`, `README.md` (no key changes, so the
  controls table stays as is), `assets/`, `tools/`, the baked region.
- The `TAP TO BEGIN` overlay (keep as is; it already uses `roundRect`
  and its own panel).

## Open Questions

- **Toast placement vs. the touch tap-to-begin overlay:** the overlay
  is drawn last and full-screen, so a toast under it is invisible for
  that one frame window; that is acceptable. If the implementer finds
  top-centre collides with anything on the narrow tier, top-centre at
  `y = 6` with the panel no wider than `W - 2 * (MM_X + MM_SIZE + 8)`
  is the fallback and still satisfies #5.
- **Whether `drawTouchHUD`'s util buttons and RESET adopt `HUD_STYLE`
  colours** is the implementer's call; they already share one palette
  and their rects must not move (#5, #6). Routing their colours through
  the tokens is welcome but not required.
- **Whether the HP bar's track colour tracks the fill (dark green /
  dark amber / dark red) or stays a single dark track** is open; one
  dark track is the simpler default.
- If this spec turns out too large for one run, the natural split is
  #1–#3 + #8 (strip and bar) first, then #4–#7 + #8 (toasts, top-left,
  banners, crosshair) as a second task; both halves are independently
  shippable because nothing in #4–#7 depends on the strip restyle.

## Design Notes

### Files involved

`index.html` only. Sections, with line numbers as of `031c34c`
(expect drift):

- State: `levelBannerAtMs` / `levelBannerUntilMs` `index.html:267-268`;
  `lightingToggledAtMs` `:1826`; `themeToggledAtMs` `:1835` (both
  deleted, replaced by one toast slot declared near the other HUD
  transient state at `:253-268`).
- Writes: `keydown` `KeyL` / `KeyT` `:474-483`; touch util `L` `:600`;
  `setWeapon` `:2773-2783` (add `showToast(WEAPONS[id].name, 900)` and
  the token-flash timestamp after `weapon = id`).
- `render()` overlay order `:3200-3326`: crosshair `:3204-3214`, FPS
  `:3226-3233`, lighting / theme label blocks `:3235-3256` (deleted),
  `drawHUD()` `:3258`, level banner `:3264-3282`, death band
  `:3284-3296`, `drawTouchHUD()` `:3301`.
- `drawHUD` `:3536-3601`; `roundRect` `:3450-3458` (reusable for the
  toast panel); minimap constants and `drawMinimap` `:3607-3718`.
- `clearTransientFeedback` `:2007-2039` (do **not** add the toast here;
  see #4).

### Suggested layering after this task (top of `render()` overlays)

1. `ctx.putImageData(buf, 0, 0)`; `drawEnemyMuzzleFlashes()`.
2. Crosshair (gapped), `drawMuzzleScreenWash`.
3. `drawDamageEdges`, `drawKillPops`, `drawPickupPops` (unchanged).
4. `drawMinimap()` then its 1-px frame.
5. FPS box, top-right.
6. Toast panel, top-centre.
7. `drawHUD()` (strip + 4-px bar + token flash).
8. `drawDamageArrow()`.
9. `drawBanner` for `LEVEL N`, then `drawBanner` for `YOU DIED`.
10. `drawTouchHUD()`, tap-to-begin overlay (unchanged).

### Fixed-slot strip sketch (desktop tier; scale labels by tier)

```
x=4        HP  100   ▌PISTOL     AMMO 24/24        LEVEL 1        KILLS 0  x=W-4
           ^label dim, value bright, value right-padded to 3 chars
```

Pick slot anchors as fractions of `W` (e.g. HP at `4`, weapon token at
a fixed `x` computed once per tier from the width of `'HP  100'` in the
tier font, AMMO centred at `0.40 W`, LEVEL at `0.65 W`, KILLS right at
`W - 4`) and verify the widest-value case per tier (#2). Measuring the
constant string `'HP  100'` once per tier (not the live value) is what
makes the token stop drifting.

### Toast sketch

```js
let toast = null; // { text, atMs, untilMs } | null
function showToast(text, durMs) {
  toast = { text, atMs: nowMs, untilMs: nowMs + durMs };
}
// in render(): if (toast && nowMs < toast.untilMs) { a = 1 - (nowMs - toast.atMs)/(toast.untilMs - toast.atMs); panel + text } else toast = null;
```

### Why a 4-px bar and a frame, not a redesign

Both are the smallest changes that make the strip and minimap read as
deliberate panels: the frame gives the minimap an edge against bright
walls without moving it (hit-tests stay valid), and 4 px is the
smallest height at which a three-colour threshold is legible at the
480 × 270 framebuffer once CSS-scaled.

## Agent Notes

- **Read first:** `AGENTS.md`, `CLAUDE.md`, this spec,
  `specs/tasks/hud-feedback-polish.md` (what the overlay layer does and
  why its order matters), `specs/tasks/mobile-mc-feel.md` and
  `specs/tasks/mobile-touch-polish.md` (tiers, util row, hit-tests),
  `specs/tasks/shotgun-weapon-pickup.md` (`weaponHudRect` contract),
  then `render()`, `drawHUD`, `drawMinimap`, `drawTouchHUD`,
  `setWeapon` and the `keydown` handler in `index.html`.
- **Order of work:**
  1. Capture a reference: open `?seed=12345`, save a screenshot (or
     `make screenshot` where Chromium runs) so world pixels can be
     compared after (#8).
  2. Add `HUD_STYLE`; restyle `drawHUD` and the bar (#2, #3); check
     the three tiers via DevTools device emulation (375 px → narrow,
     412 px → medium).
  3. Add the toast slot and `showToast`; rewire `L`, `T`, touch `L`,
     `setWeapon`; delete the two old timers and label blocks (#4, #7
     token flash).
  4. Move the FPS box, add the minimap frame (#5); add `drawBanner`
     and route both banners through it (#6); gapped crosshair (#7).
  5. `node --check`, `make check`, size check, full smoke (#8), report.
- **Common pitfalls:**
  - Leaving `lightingToggledAtMs` or `themeToggledAtMs` declared or
    written anywhere (grep both; the touch util `L` path at `:600` is
    the one people miss).
  - Calling `showToast` from `resetRun` or on load: `resetRun` assigns
    `weapon = 'pistol'` directly and must keep doing so; only
    `setWeapon`'s change path toasts.
  - Growing the death band past 28 px or moving its centre: the touch
    RESET button sits at `(H/2) + 32` and must stay clear and tappable.
  - Drawing the minimap frame *inside* the rect (it would hide the
    outer row of cells) or at `y = 104` (collides with nothing today,
    but keep it at `7, 7, 98, 98` so the util row gap is preserved).
  - Per-frame `measureText` on live values in `drawHUD`; measure
    constant strings once per tier instead (#2, #8).
  - Forgetting `ctx.textAlign` / `textBaseline` restores after the
    toast or banner; later helpers assume `left` / `top`.
  - Touching the baked region, `assets/`, `tools/` or `README.md`.
- **Smoke test before reporting** (`make serve`, open in a browser;
  then DevTools device emulation for the two touch tiers): follow the
  session in #8 end to end on desktop, then on narrow and medium touch
  tiers confirm the strip fits, the weapon-label tap cycles weapons
  with a toast, the util buttons work and nothing overlaps the minimap.
  DevTools console: no errors or warnings.
- Report completion with `spec report --status ok|…` per the Implement
  Agent Contract in `AGENTS.md`.

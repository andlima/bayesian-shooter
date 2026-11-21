---
id: viewmodel-mitten-placement
area: frontend
priority: 50
depends_on: []
description: Settle on the mitten hand style (delete the fingered / none / shadow frames, promote the mitten PNGs to the base names) and repurpose the H cycle into five viewmodel placement variants — base, two pure downward offsets, a compact redraw with a short hand wrap, and a wide Doom-style weapon redraw — so the operator can pick a classic low-slung Doom / Wolf3D framing in play.
---

# Viewmodel Mitten Placement — Narrow to Mitten + H-Cycle of Placement Variants

## Goal

`viewmodel-hand-styles` (#50) put four hand treatments on the `H` key. The
operator has compared them and picked **mitten**. What still looks wrong
is the *framing*, not the hand: the viewmodel box is blitted at
`y = H - GUN_H + 4 = 170`, so the pistol's hand (box rows 49–80) and most
of the sleeve (81–103) sit fully on screen above the 18-row HUD strip.
Doom and Wolfenstein 3D show the weapon low and centred with the hand as
a sliver at the bottom edge; here the hand is a bigger shape than the
pistol it holds.

This task does two things:

- **Narrow down.** The mitten frames become the only viewmodel art: the
  21 fingered / none / shadow PNGs and bindings are deleted, the seven
  mitten PNGs take over the base filenames and bindings, and the game
  shows the mitten on load.
- **Explore placement.** The `H` key now cycles five *placement
  variants* of that one mitten art, exactly like it cycled hand styles:
  `base` (today's framing, the reference), `low` and `lower` (the same
  frames blitted 12 / 24 px further down, hiding most of the hand under
  the HUD), `compact` (redrawn frames with the hand cut to a short wrap
  so the whole weapon stays above the HUD at its current size), and
  `wide` (redrawn frames where each weapon is also drawn bigger,
  Doom-style, filling the space the hand gave up). The operator plays
  with all five and picks a winner in a follow-up that removes the
  cycle and the losers; this task does not decide.

Everything else — kick, bob, sway, equip slide-in, FOV punch, drop
shadow, muzzle flash frames, muzzle wash, hitscan, ammo, stats, audio,
HUD, world sprites — is unchanged.

## Acceptance Criteria

1. **Mitten is the only hand style.** The 21 PNGs
   `vm_<weapon>_<frame>_{none,shadow}.png` and the seven fingered
   `vm_<weapon>_<frame>.png` are deleted from `assets/sprites/`; the
   seven `vm_<weapon>_<frame>_mitten.png` files are renamed to
   `vm_<weapon>_<frame>.png` with their pixels unchanged (the renamed
   PNG decodes byte-identically to the old mitten PNG). `MANIFEST` has
   exactly seven `vm_*` rows for the base frames, bound to the existing
   `VM_PISTOL_IDLE … VM_KNIFE_SLASH` names, plus the new rows from #5–#6.
   No `_MITTEN`, `_NONE`, `_SHADOW`, `fingered`, `HAND_STYLES` or
   `handStyle*` identifier remains in `index.html`, `tools/`, `README.md`
   or `assets/CREDITS.md` (git history is the only record of the losing
   art, per `AGENTS.md`).

2. **Placement registry.** A module-scope `VM_VARIANTS` array of exactly
   five entries, in this order (the index is the contract for the `H`
   cycle and the label):

   | Idx | `name` | `dropPx` | Frames |
   |---|---|---|---|
   | 0 | `base` | 0 | the seven base bindings (`VM_PISTOL_IDLE`, …) |
   | 1 | `low` | 12 | **same frame objects** as 0 |
   | 2 | `lower` | 24 | **same frame objects** as 0 |
   | 3 | `compact` | 0 | 7 new frames `VM_<WEAPON>_<FRAME>_COMPACT` |
   | 4 | `wide` | 0 | 7 new frames `VM_<WEAPON>_<FRAME>_WIDE` |

   Each entry is `{ name, dropPx, frames: { pistol: { idle, fire },
   shotgun: { idle, fire, pump }, knife: { idle, slash } }, barrel:
   { pistol: { x, y }, shotgun: { x, y }, knife: { x, y } } }`. The
   `barrel` anchors are the muzzle position *inside the box* for that
   variant's art: entries 0–2 carry today's values (pistol `48,6`,
   shotgun `48,2`, knife `48,6`); entries 3–4 carry whatever their redraw
   puts the muzzle at. `WEAPONS[*].barrelX/barrelY` are removed (the
   registry is the single source of truth; the `BARREL_X`/`BARREL_Y`
   constants may stay as the base values or go). `fireAnim`, `flash`,
   `kickScale`, `muzzleFlash` are untouched. The existing startup
   self-check is updated to walk `VM_VARIANTS` and also throws if a
   variant lacks a `barrel` entry for any weapon. New PNGs are
   `vm_<weapon>_<frame>_<variant>.png`, 96×104, 8-bit RGBA, appended to
   `MANIFEST` after the flash rows.

3. **Blit honours the variant.** In `drawGunViewmodel`, the frame is
   `VM_VARIANTS[vmVariantIdx].frames[weapon][frameKey]`, the blit origin
   is `dy = baseY + Math.round(bob + kick + sway) + equipOffY +
   variant.dropPx`, and the flash / `muzzleAnchorX/Y` use
   `dx + variant.barrel[weapon].x`, `dy + variant.barrel[weapon].y`.
   Nothing else in the function changes: still exactly one `GUN_W×GUN_H`
   blit plus one optional flash blit, rows past `H` clipped by the
   existing bounds test, HUD drawn over the gun as today. Observable: on
   `low`, every viewmodel pixel and the muzzle flash sit exactly 12 rows
   lower than on `base` for the same bob/kick/sway state; on `lower`,
   24 rows lower; the flash is centred on the drawn muzzle in all five
   variants for all three weapons.

4. **`H` cycles the variant with a label.** `let vmVariantIdx = 0;` and
   `let vmToggledAtMs = -Infinity;` replace `handStyleIdx` /
   `handStyleToggledAtMs`. The `KeyH` case becomes
   `vmVariantIdx = (vmVariantIdx + 1) % VM_VARIANTS.length;
   vmToggledAtMs = nowMs;` — still edge-triggered, still works while
   dead, still not in `blockedKeys`. The transient label reads
   `vm: <name>` at the same rect `(2, 56, 96, 16)`, text `(6, 58)`, same
   font / colours / `1 - elapsed / 2000` alpha ramp and `< 2000` gate;
   gone after 2 s. Pressing `H` is render-only: it does not call
   `setWeapon` or touch `fireAnimStartMs`, `weapon`, `equipFramesLeft`,
   the kick state, `ammo`, `stats` or any world state; pressed mid
   fire-animation the next frame shows the new variant for the same
   `fireAnim` segment. `vmVariantIdx` persists across weapon switches,
   `N`, `R`, death, level exit, `L`, `T` within the page session; `0` on
   every load; no `localStorage`, no URL parameter.

5. **`compact` art contract (7 frames).** Same weapon body pixels as the
   base frame at the same size (the steel / walnut / blade body in each
   `compact` frame is the base frame's body translated down by a single
   integer offset per weapon, 16–28 px, so it reads as the same weapon),
   with the mitten cut to a short wrap: every glove-ramp and sleeve pixel
   lies in rows `≥ GUN_H - 38` (box rows 66–103), so at `dropPx 0` on the
   desktop HUD at most 16 hand rows are visible. The weapon body's lowest
   non-grip row (slide / receiver / blade) is `≤ GUN_H - 24`, so the
   weapon itself is fully above the HUD. Rows `GUN_H-4 … GUN_H-1` are
   opaque under the weapon-plus-hand silhouette (no floating gun through
   the HUD trim). The shotgun's left hand on the fore-end is also a short
   mitten wrap in rows `≥ 66`. Fire / pump / slash frames move the same
   part that moves today, not the whole sprite. `barrel` entries record
   the translated muzzle.

6. **`wide` art contract (7 frames).** Hand rule identical to #5 (all
   glove and sleeve pixels in rows `≥ 66`). The weapon body is **redrawn
   larger**, Doom-style — seen from behind and slightly below, muzzle at
   the top-centre of the box: counting non-glove, non-sleeve opaque
   pixels in box rows 0–81 (the rows visible above the desktop HUD at
   `dropPx 0`), each `wide` frame has at least **1.5×** the count of the
   `base` frame with the same weapon and frame key, and the pistol's and
   knife's body bounding box is at least 1.4× as wide as the base
   frame's (pistol slide `≥ 36 px`, knife blade+handle `≥ 44 px`;
   the shotgun, already 61 px wide, grows in height / receiver mass
   instead). Uses only the existing ramps (steel
   `18,16,18 · 44,46,54 · 86,90,102 · 142,148,164 · 214,220,232`, walnut
   `60,36,20 · 104,66,36 · 140,92,52 · 176,124,74`, glove
   `18,14,16 · 52,40,36 · 92,70,58 · 138,108,88`, sleeve
   `102,114,72 · 74,84,52`) so `pickup_shotgun.png` still matches in
   colour; ≤ 24 colours per frame; no 2×2 doubling; no pure black; no
   transparent pixels inside the silhouette; upper-left light; the
   fire / pump / slash frame differs from idle in the part that moves.

7. **Default state and determinism.** With `vmVariantIdx = 0` and the
   pistol equipped on load, the first rendered frame for `?seed=12345`
   is byte-identical to today's first frame after one `H` press (i.e.
   today's mitten at today's placement), reload after reload; the only
   pixels that differ from today's *default* first frame are inside the
   viewmodel box. No new `rand()` / `Math.random()`. The pistol-only
   `make screenshot` (where Chromium runs) shows the mitten pistol.

8. **Pipeline, size, docs, smoke.** All 14 new PNGs are 8-bit RGBA and
   listed in `MANIFEST`; `make bake` then `make check` passes; running
   `make bake` twice produces no diff; `node --check` on the extracted
   `<script>` body passes; `index.html` is **no larger** than today's
   264,232 bytes (21 frames out, 14 in). `assets/CREDITS.md` drops the
   none / shadow / fingered rows, re-labels the seven base rows as the
   mitten art, and gains a row (or grouped rows) per new PNG, original to
   this repo. `README.md` is unchanged (`H` stays an undocumented
   exploration key like `T`). No console errors or warnings in a smoke
   session that, for **each** of the five variants, equips each weapon,
   fires, dry-fires (pistol / shotgun), lets the pump play, and also
   covers death, `R`, `N`, a level exit, `L`, `T`, and pressing `H`
   mid-animation and while dead.

## Out of Scope

- **Choosing the winner.** Deleting the losing variants, their PNGs and
  the `H` cycle, and folding the winner's `dropPx` / art into the
  constants is a follow-up task once the operator has compared them.
- Any X offset per variant (`GUN_RIGHT_SHIFT` stays `0`; variants are
  Y-only), changing `GUN_W` / `GUN_H`, scaling the blit, or any change
  to the blit maths beyond adding `dropPx` and reading the variant's
  barrel anchor.
- Per-variant kick / bob / sway / equip / FOV constants, fire-animation
  timings, cooldowns, damage, ammo, audio, `drawGunShadow`, the shadow
  band height, the crosshair, HUD layout, the minimap.
- Redrawing `pickup_shotgun.png` or any world sprite, muzzle-flash
  frames, or the muzzle wash.
- A touch / mobile button for `H`, a `?vm=` URL parameter, persistence
  across reloads, a settings overlay, numbered hotkeys.
- Reviving or keeping the fingered / none / shadow art in any form.
- Touch HUD tiers: the "≤ 16 hand rows visible" numbers in #5–#6 are
  measured against the desktop 18-row strip; on touch (22 / 26-row
  strips) fewer rows show, which is fine and not separately specified.

## Open Questions

- The `12` / `24` px drops for `low` / `lower` are reasoned from the
  pistol frame (hand rows 49–80): `+12` leaves ~21 hand rows visible,
  `+24` leaves ~9 and also pushes the pistol grip under the HUD. If the
  implementer finds `+24` buries the shotgun's left hand oddly, `+20` is
  acceptable; record the final values in the registry comment.
- Whether `wide` should lift the muzzle higher than `base` (bigger
  weapon ⇒ muzzle nearer the screen centre) is the implementer's call;
  the `barrel` entry just has to match the art.
- Whether `lower`'s buried grip reads as "continues below the screen" or
  as a cut-off gun is exactly what the operator wants to judge in play;
  do not compensate with art.

## Design Notes

### Files involved

`index.html` (registry, state, key, label, blit), `tools/bake-sprites.mjs`
(`MANIFEST` rows: 21 removed, 7 kept under base names, 14 added),
`assets/sprites/*.png` (21 deleted, 7 renamed, 14 new), `assets/CREDITS.md`.

### Hook points (line numbers as of `5c04290`; expect drift)

- Gun constants `index.html:157-161` — `BARREL_X` / `BARREL_Y` may stay
  as the base anchors or be inlined into `VM_VARIANTS[0].barrel`.
- Render-mode state `index.html:1842-1845` — `vmVariantIdx`,
  `vmToggledAtMs` replace `handStyleIdx` / `handStyleToggledAtMs`.
- `keydown` `index.html:484-488` — `KeyH` case.
- Transient label `index.html:3311-3320` — text becomes `vm: <name>`.
- `WEAPONS` `index.html:4043-4108` — drop `barrelX` / `barrelY` (and the
  comments pointing at `HAND_STYLES`).
- `HAND_STYLES` + self-check `index.html:4110-4161` — becomes
  `VM_VARIANTS`.
- `drawGunViewmodel` `index.html:4256-4345` — frame pick, `dy`, barrel.
- Baked region `index.html:1859-…` — rewritten by `make bake` only.
- `MANIFEST` `tools/bake-sprites.mjs:102-136`.

### Today's geometry (base mitten frames, measured)

| Frame | weapon body | glove | sleeve |
|---|---|---|---|
| pistol idle | x37–61, y6–103 (grip under hand to the box bottom) | x33–94, y44–103 | x50–93, y85–102 |
| shotgun idle | x34–94, y2–103 | x0–83, y36–103 (left hand on fore-end from row 36) | x1–30, y77–102 |
| knife idle | x32–63, y10–103 | x36–94, y55–103 | x54–93, y96–102 |

Box origin on screen is `(192, 170)`; desktop HUD strip starts at row
252 (box row 82), so box rows 82–103 are already under the HUD at
`dropPx 0`. The drop-shadow band darkens rows 242–269 before the blit.

### Why variants rather than one constant

The user wants to compare framings in play, not read numbers. Pure
offsets (`low`, `lower`) cost nothing and isolate "how low" from "how
much hand"; `compact` isolates "less hand, same weapon"; `wide` tests
"less hand, bigger weapon". Sharing frame objects between 0–2 keeps the
baked region small and makes the offset-only variants obviously
art-identical.

### Why `barrel` moves into the registry

`low` / `lower` keep the muzzle in the same box position, but `compact`
and `wide` move the weapon inside the box, so the anchor has to follow
the art. One table per variant per weapon is the only arrangement with a
single source of truth.

### Redraw guidance (non-binding)

- `compact`: `--dump` the base frame, delete every glove / sleeve row
  above box row 66, translate the body down so the slide / receiver /
  blade bottom lands at or above row 80, then draw a short mitten wrap
  (knuckles, a cuff of ≤ 4 rows) in rows 66–103 and fill rows 100–103
  under the silhouette. Doom's pistol shows roughly the top two thirds
  of the fist; aim for that.
- `wide`: start from `compact`, then widen the slide / receiver / blade
  by redrawing (not by nearest-neighbour scaling — no 2×2 doubling):
  pistol slide ~40 px wide with a visible ejection port and rear sight,
  shotgun receiver taller with the fore-end wrap larger, knife blade
  longer and broader. Keep the muzzle at the top-centre and the hand
  rule from #5.
- Verify each frame on the preview sheet (`make preview`) **and** in
  the browser with the HUD in place; the HUD line is what matters.

## Agent Notes

- **Read first:** `AGENTS.md` (Asset Baking), `CLAUDE.md`, this spec,
  `specs/tasks/viewmodel-hand-styles.md` (the registry / `H` / label
  pattern being reshaped, and the mitten art contract the base frames
  satisfy), then in `index.html`: gun constants, `WEAPONS`,
  `HAND_STYLES`, `drawGunViewmodel`, the `keydown` handler and the label
  block.
- **Order of work:**
  1. Narrow down: `git mv` the mitten PNGs over the base names, delete
     the 21 losers, rewrite the seven `MANIFEST` rows, `make bake &&
     make check`, update `CREDITS.md`. Rename `HAND_STYLES` →
     `VM_VARIANTS` with a single `base` entry and `vmVariantIdx`. Play it:
     the mitten shows on load (#1, #7).
  2. Add `dropPx` and `barrel` to the registry, `low` / `lower` sharing
     the base frames, the `dy` / barrel changes in `drawGunViewmodel`,
     the label text. Verify the three offset variants in the browser,
     including the flash on the muzzle (#2–#4).
  3. Author `compact` (7 frames), append manifest rows, bake, check,
     play. Then `wide`. Measure #5 / #6 with a scratch script that
     imports `pngToWords` from the bake module (glove / sleeve rows,
     visible body pixel counts vs base).
  4. `node --check`, size check, full smoke test, report.
- **Common pitfalls:**
  - Deleting the fingered base PNGs *before* renaming the mitten ones
    (`git mv` fails on an existing target; delete first, then move).
  - Leaving `WEAPONS[*].barrelX` in place so `drawGunViewmodel` reads the
    wrong anchor for `compact` / `wide` and the flash floats.
  - Forgetting that `low` / `lower` move the flash by `dropPx` too —
    that is correct; the anchor is `dy`-relative.
  - Glove pixels above row 66 in `compact` / `wide` (the shotgun's
    fore-end hand is the usual offender).
  - Scaling pixels for `wide` instead of redrawing (2×2 doubling fails
    #6 and looks wrong next to the 1× world sprites).
  - Rows `GUN_H-4 … GUN_H-1` transparent under the weapon in a redrawn
    frame (floating gun above the HUD trim).
  - Inserting manifest rows in the middle; append after the flash rows.
  - Any change to `README.md`; `H` is deliberately undocumented.
- **Smoke test before reporting** (`make serve`, open in a browser):
  - Load with `?seed=12345`: mitten pistol at today's placement, no
    label.
  - Press `H` five times: labels `vm: low`, `vm: lower`, `vm: compact`,
    `vm: wide`, `vm: base`; the viewmodel re-frames instantly; nothing
    else on screen changes.
  - Per variant: `1` / `2` (after the pickup) / `3`, fire, dry-fire,
    watch the pump and the slash; the flash sits on the muzzle; no world
    pixels through the silhouette; the HUD covers the box bottom cleanly.
  - `H` mid-pump and mid-slash: the animation continues in the new
    variant without restarting.
  - Die, press `H` (label shows, no viewmodel), `R`: the chosen variant
    survives the equip slide-in. `N`, level exit, `L`, `T`: unchanged.
  - DevTools console: no errors or warnings.
- Report completion with `spec report --status ok|…` per the Implement
  Agent Contract in `AGENTS.md`.

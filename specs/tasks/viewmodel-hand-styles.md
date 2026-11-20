---
id: viewmodel-hand-styles
area: frontend
priority: 50
depends_on: []
description: Redraw the shotgun viewmodel so the barrel reads as foreshortened instead of a vertical pipe, author three alternative hand treatments (mitten, none, shadow) for all three weapons alongside the current fingered glove, and add an H-key runtime cycle with a transient label so the four styles can be compared in-game and narrowed down.
---

# Viewmodel Hand Styles — Shotgun Perspective Fix + Runtime Hand-Style Cycle

## Goal

`weapon-viewmodel-art-pass` gave the pistol, shotgun and knife real pixel
art, and the guns themselves read well. Two things still look off at 1×:

1. **The shotgun is too vertical.** Its barrel is a constant-width 2 px
   pipe running straight up from the receiver to the top edge
   (`vm_shotgun_idle.png` rows ≈ 0–45). With no taper and no perspective
   shading it reads as a flagpole, not a gun seen from behind.
2. **The hand is distracting.** The fingered glove is a large fist with
   four horizontal finger bars and a wide sleeve, bigger than the pistol
   it holds. It dominates every frame and the fingers read as sausages.

This task does one fix and one exploration:

- **Fix:** redraw the shotgun body once (idle, fire, pump) so the barrel
  is foreshortened — wide where it meets the receiver, narrowing to the
  muzzle at the top-centre, shaded as a cylinder going away from the
  viewer — with the muzzle anchor unchanged. The same body is used in
  every hand style.
- **Exploration:** four hand styles, selectable at runtime. Style 0 is
  today's fingered glove (pistol/knife pixels untouched, so the default
  look is unchanged). Three new styles — `mitten` (glove with no finger
  separation), `none` (no hand or arm; weapon only, grip running off the
  bottom edge) and `shadow` (hand present but a dark two-tone silhouette
  mostly hidden behind the weapon) — are authored for all seven frames.
  The `H` key cycles the four styles exactly like `T` cycles themes:
  render-only state, instant, a 2 s fading `hands: <name>` label, no
  persistence. The operator will play with all four and pick a winner in
  a follow-up task; this task does not decide.

Everything else — kick, bob, sway, equip slide-in, FOV punch, drop
shadow, muzzle flash frames, muzzle wash, hitscan, ammo, stats, audio,
HUD — is unchanged.

## Acceptance Criteria

1. **Shotgun body redrawn (one fix, every style).** In every shotgun
   frame of every style, the barrel is drawn in perspective: at least
   8 px wide where it meets the receiver, no more than 4 px wide at the
   muzzle, tapering monotonically between, with the left/top face lighter
   than the right/bottom face (upper-left light) so it reads as a
   cylinder receding from the viewer. The far tip (muzzle) stays at the
   registry's `barrelX: 48, barrelY: 2` in idle, fire and pump, so
   `FLASH_SHOTGUN_*` and the muzzle wash remain anchored. The receiver,
   fore-end and stock are redrawn to match the wider base of the barrel,
   using the existing steel and walnut ramps. The fire frame still moves
   the hand/receiver, not the muzzle; the pump frame still shows the
   fore-end (and, in styles that have one, the left hand) pulled back
   toward the receiver. `pickup_shotgun.png` is **not** redrawn.

2. **Hand-style registry.** A module-scope `HAND_STYLES` array of exactly
   four entries, in this order (the index is the contract for the `H`
   cycle and the label):

   | Idx | `name` | Frames |
   |---|---|---|
   | 0 | `fingered` | existing `VM_PISTOL_*`, `VM_KNIFE_*` bindings (pixels byte-identical to today) + the redrawn `VM_SHOTGUN_*` |
   | 1 | `mitten` | 7 new frames |
   | 2 | `none` | 7 new frames |
   | 3 | `shadow` | 7 new frames |

   Each entry is `{ name, frames: { pistol: { idle, fire }, shotgun:
   { idle, fire, pump }, knife: { idle, slash } } }`. Every style provides
   every frame key that any `WEAPONS[*].fireAnim` segment names (so the
   frame pick can never yield `undefined`). The 21 new PNGs live in
   `assets/sprites/` as `vm_<weapon>_<frame>_<style>.png` with bindings
   `VM_<WEAPON>_<FRAME>_<STYLE>` (e.g. `vm_knife_slash_none.png` →
   `VM_KNIFE_SLASH_NONE`), all `GUN_W`×`GUN_H` (96×104, unchanged), and
   are **appended** to `MANIFEST` after the existing rows. The seven
   existing viewmodel files and bindings keep their names.
   `drawGunViewmodel` selects
   `HAND_STYLES[handStyleIdx].frames[weapon][frameKey]`; `WEAPONS[*]`
   no longer needs its own `frames` table (remove it or make it an alias
   — but there is exactly one source of truth for frames). `fireAnim`,
   `flash`, `barrelX`/`barrelY`, `kickScale`, `muzzleFlash` are untouched.

3. **Per-style art contract.** Across all seven frames of a style:
   - `fingered` (0): pistol idle/fire and knife idle/slash are
     byte-identical to the current PNGs. The shotgun frames use today's
     fingered glove (same 4-tone glove ramp, finger bars, sleeve) on the
     redrawn body from #1.
   - `mitten` (1): the hand is one continuous rounded wrap around the
     grip with **no finger separation** (no interior outline rows between
     fingers), at most one knuckle highlight line, a wrist cuff, and the
     same 4-tone glove ramp (`18,14,16` · `52,40,36` · `92,70,58` ·
     `138,108,88`) used verbatim. The shotgun's left hand on the fore-end
     is a mitten too. The hand's bounding box is no larger than the
     fingered hand's in the same frame.
   - `none` (2): **no hand, arm or sleeve pixels anywhere** — none of
     the four glove tones and none of the sleeve greens appear in the
     frame. The weapon's grip / stock / knife handle extends to the
     bottom edge of the box, with rows `GUN_H-4 … GUN_H-1` opaque under
     the weapon so the 4-row trim reads as "continues below the screen".
     The shotgun fore-end moves by itself in the pump frame.
   - `shadow` (3): the hand (and the shotgun's left hand) is drawn using
     **only** `18,14,16` and `52,40,36` (the two darkest glove tones)
     plus a cuff of at most 2 rows; it has no finger separation; and it
     extends no more than 12 px beyond the weapon silhouette on any side
     so the weapon stays the focus.
   - All styles: upper-left light; ≤ 24 colours per frame; no 2×2 pixel
     doubling; no pure black; no transparent pixels inside the
     weapon-plus-hand silhouette; the muzzle at `barrelX`/`barrelY` in
     every frame; the fire/pump/slash frame differs from idle in the part
     that moves (slide, fore-end, blade/hand), not by a whole-sprite
     shift; each weapon identifiable at 1× in a 480×270 frame.

4. **`H` cycles the style with a label.** Declare
   `let handStyleIdx = 0;` and `let handStyleToggledAtMs = -Infinity;`
   next to `forcedThemeIdx` / `themeToggledAtMs`. In the edge-triggered
   `keydown` block, next to the `KeyT` case:
   ```js
   } else if (e.code === 'KeyH') {
     handStyleIdx = (handStyleIdx + 1) % HAND_STYLES.length;
     handStyleToggledAtMs = nowMs;
   }
   ```
   Ignores auto-repeat (the existing `wasDown` guard), works while dead
   (not gated on `player.hp`), and `KeyH` is **not** added to
   `blockedKeys`. In `render()`, directly after the theme label, draw a
   label `hands: ` + `HAND_STYLES[handStyleIdx].name` one row below it —
   rect `(2, 56, 96, 16)`, text at `(6, 58)`, same font, colours and
   `1 - elapsed / 2000` alpha ramp, same `< 2000` gate — so the lighting,
   theme and hands labels can all be visible without overlapping. After
   2 s the label leaves no HUD presence.

5. **Switching is render-only and instant.** Pressing `H` does not call
   `setWeapon`, does not touch `fireAnimStartMs`, `weapon`,
   `equipFramesLeft`, the kick state, `ammo`, `stats`, `muzzleAnchorX/Y`,
   or any dungeon/player/enemy/pickup state. Pressed mid fire-animation,
   the very next rendered frame shows the new style's frame for the same
   `fireAnim` segment. `handStyleIdx` persists across weapon switches,
   `N`, `R`, death, level exit, `L` and `T` within the page session; it
   is `0` on every page load. No `localStorage`, no URL parameter.

6. **Default state unchanged; determinism kept.** With `handStyleIdx = 0`
   and the pistol equipped at start, the first rendered frame for a
   pinned seed (`?seed=12345`) is byte-identical to today's, reload after
   reload. No new `rand()` / `Math.random()` anywhere. The only visual
   change a player sees without pressing `H` is the shotgun body (#1),
   and only once the shotgun is equipped.

7. **Pipeline, performance, docs.** All 21 new PNGs are 8-bit RGBA and
   listed in `MANIFEST`; `make bake` then `make check` passes; running
   `make bake` twice produces no diff; `node --check` on the extracted
   `<script>` body passes; `index.html` grows by no more than 48 KB.
   Per-frame cost is unchanged (still exactly one `GUN_W×GUN_H` blit
   plus one optional flash blit; the style lookup is two property reads).
   No console errors or warnings in a smoke session that, for **each** of
   the four styles, equips each weapon, fires, dry-fires (pistol/shotgun),
   lets the shotgun pump play, and that also covers death, `R`, `N`, a
   level exit, `L`, `T`, and pressing `H` during a fire animation and
   while dead. `assets/CREDITS.md` gains a row (or grouped rows) for every
   new PNG, original to this repo. `README.md` is unchanged (`H` is an
   exploration key, documented the same way `T` is — i.e. not in the
   controls table).

## Out of Scope

- **Choosing the winner.** Removing the losing styles, deleting their
  PNGs and the `H` cycle, and settling on one hand treatment is a
  follow-up task once the operator has compared them in play.
- Redrawing `pickup_shotgun.png` to match the redrawn viewmodel (the
  ramps are shared so colours still match; a silhouette refresh is a
  follow-up if the operator wants it).
- Shotgun body variants. The body is redrawn once; only the hand differs
  between styles.
- A touch/mobile button for `H` (the util row has exactly three slots,
  same boundary as the `T` key), a `?hands=` URL parameter, or any
  persistence across reloads.
- Per-style muzzle flash frames, muzzle anchors, kick/bob/sway/equip/FOV
  constants, fire-animation timings, cooldowns, damage, ammo, audio,
  `drawGunShadow`, the crosshair, HUD text, the minimap.
- Changing `GUN_W`/`GUN_H`, `BARREL_X`/`BARREL_Y`, or the blit maths.
- Left-handed/mirrored layouts, skin-colour or sleeve-colour options, a
  settings/picker overlay, numbered hotkeys.
- Enemy, pickup, exit or projectile art.
- A startup self-check that every style has every frame key is allowed
  but not required; if added it must be a plain `throw` at module init
  (no test framework, no new files).

## Open Questions

- After the comparison, should the `H` cycle stay as a hidden debug key
  (like `T`) or be removed with the losing styles? Defaulting to
  "removed in the follow-up" unless the operator says otherwise.
- Should the `shadow` style show any sleeve at all? This spec allows a
  cuff of ≤ 2 rows; the implementer may use zero.
- Whether the shotgun pickup should get a silhouette refresh depends on
  how far the redraw moves the viewmodel's proportions; decide after
  seeing #1 in the preview sheet.

## Design Notes

### Files involved

`index.html` (registry, state, key, label, frame pick),
`tools/bake-sprites.mjs` (`MANIFEST` rows), `assets/sprites/*.png`
(3 replaced shotgun frames + 21 new frames), `assets/CREDITS.md`.

### Hook points (line numbers as of `9d73609`; expect drift)

- Gun constants `index.html:150-161` — unchanged, read only.
- Render-mode state `index.html:1826-1835` — add `handStyleIdx`,
  `handStyleToggledAtMs` beside `forcedThemeIdx` / `themeToggledAtMs`.
- `keydown` `index.html:455-500` — `KeyH` case beside `KeyT`.
- Transient labels `index.html:3236-3256` — hands label after the theme
  label; lighting rect is `(2,20,…)`, theme `(2,38,…)`, hands `(2,56,…)`.
- `WEAPONS` `index.html:3978-4040` — drop `frames` (or alias it).
- `HAND_STYLES` — define immediately after `WEAPONS` (it references the
  same baked bindings, which exist by then).
- `drawGunViewmodel` `index.html:4139-4225` — the frame pick becomes
  `HAND_STYLES[handStyleIdx].frames[weapon][frameKey]`; nothing else in
  the function changes.
- Baked region `index.html:1842-1880` — rewritten by `make bake` only.

### Why a frame set per style rather than a hand overlay layer

A separate hand layer composited at blit time would save PNGs (the hand
only moves in the shotgun pump and knife slash) but needs a second blit,
a z-order rule for where the hand goes over vs. under the grip, and a
per-style offset table. Full frames keep `drawGunViewmodel` at one blit
and make every style independently reviewable on the preview sheet. The
cost is 21 PNGs at ~1 KB each baked.

### Why style 0 keeps the current pixels

The operator wants to narrow down *from* the current look, so it has to
be in the cycle unchanged. It also keeps the first-frame determinism
contract trivially true (pistol is the starting weapon).

### Shotgun redraw guidance (non-binding)

Think Doom's shotgun seen from behind: the barrel is short on screen
because it points away, and it converges toward the far tip. Suggested
layout in the 96×104 box: muzzle tip at `(48, 2)` as a 3–4 px wide cap;
the barrel widens to ~10 px by row ~34 where it meets the receiver top;
receiver + fore-end occupy rows ~34–70 and ~30–40 px of width; stock
runs off the bottom-right. Shade the barrel's left third in steel
`light`, the middle in `mid`, the right third in `dark`, outline in
`18,16,18`, with a one-px `specular` along the upper-left. Keep the pump
frame's fore-end travel ~6–8 px toward the receiver. Use the existing
steel (`18,16,18 · 44,46,54 · 86,90,102 · 142,148,164 · 214,220,232`)
and walnut (`60,36,20 · 104,66,36 · 140,92,52 · 176,124,74`) ramps so
`pickup_shotgun.png` still matches in colour.

### Hand style guidance (non-binding)

- `mitten`: start from the fingered frame, fill the finger gaps with
  `glove mid`, round the outer contour, keep a single `highlight` arc
  across the knuckles and the existing cuff. Shrink the fist a few px if
  it still dwarfs the pistol.
- `none`: start from the fingered frame, erase every glove/sleeve pixel,
  then extend the grip (pistol), stock (shotgun) and handle (knife)
  straight down to the bottom edge using the weapon's own ramp. Where the
  hand used to cover the grip, draw the grip's texture (checkering /
  wood grain) rather than leaving flat colour.
- `shadow`: start from `mitten`, repaint the hand with `glove shadow`,
  outline in `glove outline`, drop the highlight, and pull the contour in
  so most of the hand sits behind the grip. Keep enough of a silhouette
  that the weapon reads as held.

## Agent Notes

- **Read first:** `AGENTS.md` (Asset Baking), `CLAUDE.md`, this spec,
  `specs/weapon-viewmodel-art-pass.md` (the art contract these frames
  inherit), `specs/tasks/theme-runtime-selector.md` (the `T` cycle +
  label pattern to mirror), then in `index.html`: gun constants,
  `WEAPONS`, `setWeapon`, `fireShot`, `getKickOffsets`,
  `drawGunViewmodel`, the `keydown` handler and the label block.
- **Art workflow (no browser needed):** `--dump` an existing frame to
  text, edit, `--encode` to the new filename, then **look at it** — open
  the PNG and `make preview` (`--scale 6`) and check against #3 before
  moving on. A scratch script that composes only the viewmodel frames at
  4× (import `pngToWords` / `encodePNG` from the bake module) is faster
  to iterate with than the full sheet.
- **Order of work:**
  1. Shotgun body redraw on the three existing shotgun files (fingered
     hand kept). `make bake && make check`, play it — this is the fix
     the operator asked for and stands on its own.
  2. `HAND_STYLES` registry, `handStyleIdx`, `KeyH`, the label, and the
     frame pick in `drawGunViewmodel`, with styles 1–3 temporarily
     pointing at the style-0 bindings. Verify the cycle, label and
     render-only behaviour (#4, #5) before any new art exists.
  3. Author `mitten` (7 frames), then `none`, then `shadow`; append
     manifest rows as you go; `make bake && make check` after each style.
  4. `assets/CREDITS.md`, `node --check`, full smoke test, report.
- **Common pitfalls:**
  - Moving the shotgun muzzle. The flash frames and wash are centred on
    `(dx + 48, dy + 2)`; if the redraw puts the tip elsewhere the flash
    floats. Verify with a fired shot in the browser.
  - Forgetting the shotgun's **left** hand (fore-end) when restyling —
    it must follow the style in idle, fire and pump.
  - The `none` style leaving the grip as a flat colour block where the
    hand used to be, or leaving rows `GUN_H-4…GUN_H-1` transparent under
    the weapon (the trim then shows a floating gun).
  - Letting a style miss a frame key (`pump`, `slash`): the blit then
    reads `undefined[...]` and throws on the first fire. Every style
    needs all seven frames.
  - Resetting `fireAnimStartMs` or calling `setWeapon` from the `KeyH`
    handler. `H` is cosmetic only.
  - Label overlap: hands label rect at `y = 56`, not `38`.
  - Inserting new manifest rows in the middle: it still works, but
    appending keeps the diff of the baked region minimal and reviewable.
  - Renaming the seven existing viewmodel files: do not; style 0 reuses
    them under their current bindings.
  - Touching `pickup_shotgun.png` or any world sprite.
- **Smoke test before reporting** (`make serve`, open in a browser):
  - Load with `?seed=12345`; confirm the first frame matches today's.
  - Press `2` (after picking up the shotgun) and confirm the barrel reads
    as foreshortened, the flash sits on the muzzle, the pump plays.
  - Press `H` four times: labels `hands: mitten`, `hands: none`,
    `hands: shadow`, `hands: fingered`; the viewmodel re-skins instantly
    each time; nothing else on screen changes.
  - For each style, cycle `1`/`2`/`3`, fire, dry-fire, watch the pump
    and the slash; check no world pixels show through the silhouette.
  - Press `H` mid-pump and mid-slash: the animation continues in the
    new style without restarting.
  - Die, press `H` (label shows, no viewmodel while dead), `R`: the
    chosen style is still active after the equip slide-in.
  - `N`, level exit, `L`, `T`: style unchanged throughout; the three
    labels can coexist without overlapping.
  - DevTools console: no errors or warnings.
- Report completion with `spec report --status ok|…` per the Implement
  Agent Contract in `AGENTS.md`.

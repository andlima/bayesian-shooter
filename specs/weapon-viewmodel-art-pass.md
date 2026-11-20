---
id: weapon-viewmodel-art-pass
area: frontend
priority: 65
depends_on: [sprite-bake-manifest]
description: Hand-authored pixel art for the pistol, shotgun and knife viewmodels — a gloved hand/forearm on every weapon, proper tonal ramps under one upper-left light, per-weapon fire animation frames (pistol slide-back, shotgun recoil + pump, knife slash), per-weapon muzzle-flash frames, and a matching world shotgun pickup — all through the PNG manifest pipeline.
---

# Weapon Viewmodel Art Pass

## Goal

The three weapon viewmodels are rectangle-fill placeholders: flat grey
boxes with no hand holding them, two or three tones per material, no
specular, and a single static pose that only moves because the whole
sprite is nudged by the kick. They read as "programmer art" and are the
most-looked-at pixels in the game.

This spec replaces them with hand-authored pixel art in the spirit of
Wolfenstein 3D / Doom first-person weapons:

- a **gloved right hand** (and forearm leaving the bottom edge) grips every
  weapon; the shotgun also gets a left hand on the fore-end;
- a real **tonal ramp** per material (metal, wood, glove) lit from the
  upper-left, with outline, mid-tones, a highlight line and a specular;
- a **fire animation** per weapon driven by a small data-driven segment
  list: pistol slide-back, shotgun recoil then a pump-cycle frame, knife
  slash pose;
- **per-weapon muzzle-flash** frames (compact starburst for the pistol, a
  wide bloom for the shotgun) sized by the frame itself;
- the **world shotgun pickup** redrawn to match the new shotgun.

All art is PNG under `assets/sprites/` listed in the bake `MANIFEST`; the
kick, bob, sway, equip slide-in, FOV punch, drop shadow, muzzle wash,
hitscan, ammo, stats and audio are unchanged.

## Acceptance Criteria

### Art assets

1. **Frames and files.** New or replaced PNGs, all listed in `MANIFEST`
   with these bindings:

   | File | Binding | Size |
   |---|---|---|
   | `vm_pistol_idle.png`, `vm_pistol_fire.png` | `VM_PISTOL_IDLE`, `VM_PISTOL_FIRE` | `GUN_W`×`GUN_H` |
   | `vm_shotgun_idle.png`, `vm_shotgun_fire.png`, `vm_shotgun_pump.png` | `VM_SHOTGUN_IDLE`, `VM_SHOTGUN_FIRE`, `VM_SHOTGUN_PUMP` | `GUN_W`×`GUN_H` |
   | `vm_knife_idle.png`, `vm_knife_slash.png` | `VM_KNIFE_IDLE`, `VM_KNIFE_SLASH` | `GUN_W`×`GUN_H` |
   | `flash_pistol_1.png`, `flash_pistol_2.png` | `FLASH_PISTOL_1`, `FLASH_PISTOL_2` | 24×24 |
   | `flash_shotgun_1.png`, `flash_shotgun_2.png` | `FLASH_SHOTGUN_1`, `FLASH_SHOTGUN_2` | 40×40 |
   | `pickup_shotgun.png` (replaced) | `weaponShotgunFrame` | 32×32 |

   `vm_pistol.png`, `vm_shotgun.png`, `vm_knife.png`, `flash_1.png`,
   `flash_2.png` and their bindings (`GUN_SPRITE`, `SHOTGUN_SPRITE`,
   `KNIFE_SPRITE`, `FLASH_FRAME_1`, `FLASH_FRAME_2`) are removed.

2. **Viewmodel box.** `GUN_W`/`GUN_H` may change, within
   `72 ≤ GUN_W ≤ 112` and `96 ≤ GUN_H ≤ 112`; all seven viewmodel PNGs
   share the same box. The blit keeps `baseX = ((W - GUN_W) >> 1) +
   GUN_RIGHT_SHIFT` (with `GUN_RIGHT_SHIFT = 0`) and `baseY = H - GUN_H + 4`,
   so the box stays horizontally centred and the bottom 4 rows are
   trimmed. Record the chosen box in the commit body.

3. **Hands.** Every viewmodel frame shows a gloved right hand gripping the
   weapon, with the forearm running off the bottom edge (rows
   `GUN_H-4 … GUN_H-1` are opaque wherever the arm is, so the trim reads as
   "arm continues below the screen"). The shotgun additionally shows a
   left hand on the fore-end; in `vm_shotgun_pump.png` that hand and the
   fore-end are pulled back toward the receiver. The knife frames show the
   hand holding the grip with the blade up (idle) and swung diagonally
   across the box (slash). The glove uses one shared 4-tone ramp in all
   seven frames — exactly these words so the hand matches across weapons:

   | Role | RGB |
   |---|---|
   | glove outline | 18, 14, 16 |
   | glove shadow | 52, 40, 36 |
   | glove mid | 92, 70, 58 |
   | glove highlight | 138, 108, 88 |

4. **Tonal ramps and light.** Light comes from the upper-left in every
   frame (top and left faces lighter, bottom and right darker; specular
   dots on the upper-left of cylinders). Metal uses ≥ 5 tones (outline,
   dark, mid, light, specular); wood ≥ 4; the blade ≥ 4 with a bright
   edge. No frame uses more than 24 colours. No 2×2 (or larger) pixel
   doubling: detail is authored at native resolution. Pure black
   (`0,0,0`) is not used; outlines are the near-black tints above or the
   weapon's own dark tint.

5. **Silhouette and opacity.** Each weapon is identifiable at 1× in a
   480×270 frame. Inside the weapon-plus-hand silhouette there are **no**
   transparent pixels (nothing from the world shows through a trigger
   guard, between fingers, or under the fore-end). Transparent pixels
   exist only outside the silhouette. The muzzle of each gun sits at the
   registry's `barrelX`/`barrelY` in *every* frame of that weapon (the
   fire/pump frames move the slide, hand or fore-end, not the muzzle), so
   the flash and the muzzle wash stay anchored.

6. **World shotgun pickup.** `pickup_shotgun.png` is redrawn with the new
   shotgun's colours (same steel and wood ramps), lying on the floor in
   the lower half of the 32×32 frame with a shadow row, consistent with
   the medkit/ammo floor convention. It is clearly the same gun the
   player then holds.

### Registry and animation

7. **Registry frames.** Each `WEAPONS` entry replaces `sprite` with
   `frames: { idle, … }` and gains `fireAnim`, an array of
   `{ frame, fromMs, toMs }` segments relative to the last *successful*
   fire:
   ```js
   pistol:  frames: { idle: VM_PISTOL_IDLE, fire: VM_PISTOL_FIRE },
            fireAnim: [{ frame: 'fire', fromMs: 0, toMs: 100 }],
   shotgun: frames: { idle: VM_SHOTGUN_IDLE, fire: VM_SHOTGUN_FIRE, pump: VM_SHOTGUN_PUMP },
            fireAnim: [{ frame: 'fire', fromMs: 0, toMs: 110 },
                       { frame: 'pump', fromMs: 260, toMs: 480 }],
   knife:   frames: { idle: VM_KNIFE_IDLE, slash: VM_KNIFE_SLASH },
            fireAnim: [{ frame: 'slash', fromMs: 0, toMs: 140 }],
   ```
   Segments must not overlap and every `toMs ≤ cooldownMs` for that
   weapon. The numbers above are starting values; keep the shotgun pump
   inside the 650 ms cooldown and the pistol/knife frame within their
   cooldowns.

8. **Animation clock.** Add module state `let fireAnimStartMs = -Infinity;`
   set to `now` in `fireShot` **only on the successful-fire path** (never
   on dry fire), and reset to `-Infinity` in `setWeapon` when the weapon
   actually changes and in `clearTransientFeedback`. `drawGunViewmodel`
   picks the frame with
   `t = nowMs - fireAnimStartMs` → first segment with
   `fromMs ≤ t < toMs`, else `frames.idle`. Dry fire therefore shows the
   idle frame with the existing small dry kick; switching weapons mid-
   animation never shows the new weapon's fire frame; a level transition
   or reset starts on idle. The first rendered frame after load is idle
   (`fireAnimStartMs = -Infinity`), preserving the byte-identical
   first-frame contract outside the art itself.

9. **Per-weapon flash.** Each gun entry carries `flash: [F1, F2]`
   (`[FLASH_PISTOL_1, FLASH_PISTOL_2]`, `[FLASH_SHOTGUN_1, FLASH_SHOTGUN_2]`);
   the knife carries `flash: null` and keeps `muzzleFlash: false`. The
   flash blit reads `frame.w`/`frame.h` (provided by the bake inflater)
   instead of `FLASH_W`/`FLASH_H`, centring the frame on the barrel
   anchor; `FLASH_W`/`FLASH_H` are deleted. Saturating-add blending,
   `flashFrame` 1→2 timing from `getKickOffsets`, and the muzzle wash are
   unchanged. The pistol flash is a compact 4-point starburst; the
   shotgun flash is a wide warm bloom that visibly exceeds the barrel
   width.

### Unchanged behaviour

10. **Feel constants untouched.** `KICK_UP_MS`, `KICK_RECOVER_MS`, kick
    magnitudes, `kickScale` values, bob, `SWAY_*`, `EQUIP_*`,
    `FOV_PUNCH_*`, `SHADOW_*`, `MUZZLE_*`, all `*_COOLDOWN_MS`, damage,
    ammo costs, `range`, `tracksAccuracy`, `fireSfx`, weapon select keys,
    HUD label, touch label cycling, `stats` schema — none change. Hitscan
    still fires along `player.dir`.

11. **Determinism.** No new `rand()` / `Math.random()`. For any seed the
    dungeon, enemy and pickup layout is byte-identical. Everything outside
    the viewmodel box and the flash blit in the first rendered frame is
    byte-identical to before.

12. **Performance.** Blit cost scales with `GUN_W × GUN_H` (≤ 12 544 px)
    plus one flash frame (≤ 1 600 px); frame selection is a ≤ 2-segment
    scan. ≥ 60 fps desktop, ≥ 30 fps mid-range mobile, as today.

### Pipeline and docs

13. **Pipeline only.** No procedural weapon builders return. All frames
    are PNG → `make bake`; `make check` passes; `make bake` twice gives
    no diff; `node --check` on the extracted script passes; no console
    errors in a smoke session (desktop and touch emulation) covering
    fire, dry fire, each weapon switch, death, `R`, `N`, level exit, `L`.

14. **Docs.** `assets/CREDITS.md` gains rows for every new PNG (original
    to this repo). `README.md` controls table unchanged. `AGENTS.md`
    unchanged (the pipeline section from `sprite-bake-manifest` already
    covers the workflow).

## Out of Scope

- New weapons, reload / ammo-count animations, shell ejection, smoke,
  brass, recoil-dependent spread, a different kick curve, idle fidgets
  beyond the existing sway, weapon-switch lowering/raising animation
  (the existing equip slide-in stays as the switch animation).
- Left-handed or mirrored layouts, hand-colour options, settings UI.
- Enemy, pickup (other than the shotgun pickup), exit or projectile art —
  see `enemy-sprite-art-pass` and `world-sprite-art-pass`.
- Lighting the gun by fog/distance (it stays HUD-class, drawn after the
  post-pass).
- Changing `drawGunShadow`, the crosshair, HUD text or the minimap.

## Design Notes

- **Composition (Doom convention).** Gun body on the screen's centre seam;
  right hand wraps the grip from the lower-right; forearm exits the
  bottom-right corner of the box. Pistol: slide top at about 10 % of
  `GUN_H`, grip + hand filling the lower half. Shotgun: long barrel from
  the top edge, fore-end at ~45 % height held by the left hand, receiver
  + trigger hand at ~65 %, stock running off the bottom-right. Knife:
  hand low-centre, blade rising to the upper-left of centre (idle); in
  the slash frame the blade is roughly 45° across the box and the hand
  moves left and up ~8 px.
- **Why a time-segment list instead of a frame counter.** The kick state
  machine is wall-clock based and the pump has to land *after* the kick
  recovers (260–480 ms), which a per-render counter would make frame-rate
  dependent. Segments relative to `fireAnimStartMs` keep the pump where
  the ear expects it regardless of fps and cost nothing when idle.
- **Why the muzzle stays fixed in every frame.** The flash and wash are
  anchored at `dx + barrelX`. Moving the muzzle in the fire frame would
  require per-frame anchors; moving the slide/hand instead gives the same
  "recoil" read with the existing kick offset doing the body motion.
- **Why the shotgun flash is 40×40.** Its spread cone is ±0.13 rad and it
  fires 7 pellets; a flash the same size as the pistol's undersells it.
  The frame-sized blit lets each weapon carry its own flash footprint.
- **Palette discipline.** Share the glove ramp (AC #3) verbatim; keep
  steel and wood ramps consistent between `vm_shotgun_*` and
  `pickup_shotgun`. Suggested steel ramp: outline 18,16,18 · dark 44,46,54 ·
  mid 86,90,102 · light 142,148,164 · specular 214,220,232. Suggested
  walnut: 60,36,20 · 104,66,36 · 140,92,52 · 176,124,74.
- **Code touch points in `index.html`:** gun constants block (`GUN_W`,
  `GUN_H`, remove `FLASH_W`/`FLASH_H`), module state (`fireAnimStartMs`),
  `fireShot` (set clock), `setWeapon` and `clearTransientFeedback`
  (reset clock), `WEAPONS` (frames/fireAnim/flash), `drawGunViewmodel`
  (frame pick; flash reads `.w`/`.h`), `SPRITES.weapon_shotgun` (keeps
  its binding; follow whatever entry shape the table currently uses).

## Agent Notes

- Read `AGENTS.md` (Asset Baking), `specs/sprite-bake-manifest.md`, this
  spec, then in `index.html`: the gun constants, `WEAPONS`, `fireShot`,
  `setWeapon`, `clearTransientFeedback`, `getKickOffsets`,
  `drawGunViewmodel`, and the baked region.
- **Art workflow (no browser needed):**
  1. `node tools/bake-sprites.mjs --dump assets/sprites/vm_pistol.png > scratch/pistol.txt`
     to start from the current layout and box.
  2. Edit the text (palette lines + rows). Keep rows equal width.
  3. `node tools/bake-sprites.mjs --encode scratch/pistol.txt assets/sprites/vm_pistol_idle.png`.
  4. **Look at it**: open the PNG with your image-reading tool, and run
     `make preview` (use `--scale 6` for a closer look) and open the
     sheet. Iterate until the checklist below passes; do not skip the
     look step.
  5. Update `MANIFEST`, `make bake`, `node --check`, `make check`.
- **Review checklist per frame** (apply to the preview sheet): hand
  visible and holding the weapon; light from upper-left; ≥ 5 metal tones;
  no see-through holes; muzzle at `barrelX/barrelY`; arm reaches the
  bottom edge; silhouette identifiable at 1×; ≤ 24 colours; fire frame
  differs from idle in the *part* that should move (slide, fore-end,
  blade), not by a whole-sprite shift.
- Order of work: (1) pipeline entries + idle frames for all three weapons
  with hands, wired as `frames.idle` so the game runs; (2) `fireAnim`
  machinery with pistol fire frame; (3) shotgun fire + pump; (4) knife
  slash; (5) per-weapon flash frames and the `.w/.h` blit; (6) shotgun
  pickup; (7) docs and verification.
- Pitfalls: `lastFireTime` is deliberately *not* the animation clock (it
  carries across level exits for cooldown); the dry-fire path must not
  touch `fireAnimStartMs`; `setWeapon` must reset the clock only on an
  actual change (a redundant key press is a no-op today and stays one);
  keep `barrelX`/`barrelY` consistent with where you actually drew the
  muzzle after changing the box; `flash: null` must be guarded by
  `muzzleFlash` before indexing.
- If `enemy-sprite-art-pass` has already landed, the `SPRITES` table uses
  an object-per-type shape — keep the `weapon_shotgun` entry in that
  shape. If it has not, keep the two-element array.

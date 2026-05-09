---
id: gun-muzzle-wash
area: frontend
priority: 50
depends_on: []
description: Replace the flat yellow rectangle muzzle scrim with a soft additive radial light wash anchored at the gun's barrel screen position.
---

# Gun Muzzle Wash — Replace Rectangle Scrim with Radial Light Wash

## Goal

When the player fires, the existing visual feedback stack is:

1. Audio (`sfxShot()`).
2. Procedural pistol kick (recoil up + left, eases back).
3. Small procedural circular flash sprite (`FLASH_FRAME_1`/`FLASH_FRAME_2`)
   blitted at the gun's barrel exit with saturating-add into `buf32`.
4. **A flat additive yellow rectangle covering 30–70% × 55–80% of the
   screen, drawn for `MUZZLE_FLASH_MS = 80`.**
5. Crosshair red tint on hit.

Item (4) is the ugly part. It's a single `ctx.fillRect` with a flat
`rgba(255, 220, 80, 0.55)` and `globalCompositeOperation = 'lighter'`. It
reads as a blocky yellow scrim with hard edges, not as light spilling from
the barrel.

This task rips out the rectangle and replaces it with a soft additive
radial light wash anchored at the gun's barrel screen position. The wash
peaks the moment the shot fires and decays over the same `MUZZLE_FLASH_MS`
window. Colors match the warm-white → yellow → orange falloff already used
by `FLASH_FRAME_1`, so the small barrel sprite reads as the bright core of
a larger soft glow that briefly illuminates the foreground. Recoil, the
barrel flash sprite, the crosshair tint, audio, and stats are untouched.

## Acceptance Criteria

1. **Single-file constraint preserved.** Still one `index.html` at the repo
   root, no `package.json`, no external assets, no build step, no
   `localStorage`, no network requests. All new state lives inside the
   existing IIFE.

2. **Rectangle scrim removed.** The block at `index.html:2159-2165`
   ```js
   if (nowMs < muzzleFlashUntil) {
     ctx.globalCompositeOperation = 'lighter';
     ctx.fillStyle = 'rgba(255, 220, 80, 0.55)';
     ctx.fillRect((W * 0.30) | 0, (H * 0.55) | 0, (W * 0.40) | 0, (H * 0.25) | 0);
     ctx.globalCompositeOperation = 'source-over';
   }
   ```
   is deleted in full and replaced with a single call:
   ```js
   drawMuzzleScreenWash(nowMs);
   ```
   The call site stays in the same z-order: after the crosshair
   (`index.html:2152-2157`) and before `drawDamageEdges()` /
   `drawKillPops()` / `drawMinimap()` (`index.html:2169-2172`). This keeps
   the damage vignette, kill pops, minimap, HUD strip, and damage arrow on
   top of the wash so they remain readable.

3. **`muzzleFlashUntil` and `MUZZLE_FLASH_MS` are kept.**
   - `MUZZLE_FLASH_MS = 80` is unchanged. It is the wash's full lifetime.
   - `muzzleFlashUntil` continues to be set to `now + MUZZLE_FLASH_MS` in
     `fireShot()` (`index.html:1880`) on a successful shot only. Dry-fire
     does **not** set it — confirmed at `fireShot:1870-1875` (the dry-fire
     branch returns before `muzzleFlashUntil` is touched). The wash
     therefore inherits the existing "no flash on dry fire" behavior with
     no extra code.
   - `clearTransientFeedback` continues to reset `muzzleFlashUntil = 0`
     (`index.html:1249`). On `R` (resetRun) and `N` (advanceLevel) the
     wash is killed mid-decay. No new clear sites needed.

4. **New tuning constants** added next to the existing `MUZZLE_FLASH_MS`
   declaration around `index.html:68`. These values are part of the spec;
   do not retune them.
   ```js
   const MUZZLE_WASH_RADIUS_FRAC = 0.45;  // fraction of min(W, H)
   const MUZZLE_WASH_PEAK_A      = 0.55;  // peak inner-stop alpha at t=1
   ```

5. **New module-scope barrel-anchor vars** added near the existing
   `let muzzleFlashUntil = 0;` declaration around `index.html:159`:
   ```js
   let muzzleAnchorX = W >> 1;
   let muzzleAnchorY = (H * 0.85) | 0;
   ```
   The defaults place the anchor at the bottom-center of the screen so a
   pathological first-frame draw (wash visible before `drawGunViewmodel`
   has run once) still reads as coming from "the gun" rather than the
   middle of the screen. In practice `drawGunViewmodel` runs every frame
   the player is alive and updates these before the wash needs them.

6. **`drawGunViewmodel` updates the anchor every frame it runs.** Inside
   `drawGunViewmodel` (around `index.html:3115-3116`), immediately after
   `barrelX`/`barrelY` are computed:
   ```js
   const barrelX = dx + BARREL_X;
   const barrelY = dy + BARREL_Y;
   muzzleAnchorX = barrelX;
   muzzleAnchorY = barrelY;
   ```
   This runs unconditionally — i.e., it is **not** gated on
   `k.flashFrame > 0` — so the anchor stays current between shots and the
   wash's first frame on a new shot reads the live position. (The existing
   gate on `k.flashFrame > 0` for the FLASH_FRAME blit stays in place.)

   `drawGunViewmodel` already early-returns on `player.hp <= 0`
   (`index.html:3073`), so the anchor is not updated during the death
   freeze. Combined with #7's `player.hp > 0` gate, the wash never draws
   from a stale anchor in the death state.

7. **New helper `drawMuzzleScreenWash(now)`.** Place it as a sibling of
   `drawEnemyMuzzleFlashes` (around `index.html:2780-2806`) so all
   flash-related ctx helpers cluster together. Implementation:
   ```js
   function drawMuzzleScreenWash(now) {
     if (player.hp <= 0) return;
     if (now >= muzzleFlashUntil) return;
     // t goes from 1 at the moment of firing to 0 at expiry.
     const t = (muzzleFlashUntil - now) / MUZZLE_FLASH_MS;
     // Quadratic ease-out: bright spike at fire, fast fade. Matches the
     // perceptual "punch" of a real muzzle blast — peaks instantly, decays
     // in <1 frame at 60 FPS to ~70% then trails off.
     const a = MUZZLE_WASH_PEAK_A * t * t;
     if (a <= 0) return;
     const R = Math.min(W, H) * MUZZLE_WASH_RADIUS_FRAC;
     const grad = ctx.createRadialGradient(
       muzzleAnchorX, muzzleAnchorY, 0,
       muzzleAnchorX, muzzleAnchorY, R
     );
     // Three-stop palette mirrors FLASH_FRAME_1: hot white core, warm
     // yellow ring, dim orange falloff, fully transparent at the edge.
     grad.addColorStop(0.00, `rgba(255, 250, 230, ${(a       ).toFixed(3)})`);
     grad.addColorStop(0.25, `rgba(255, 220,  90, ${(a * 0.72).toFixed(3)})`);
     grad.addColorStop(0.55, `rgba(220, 130,  40, ${(a * 0.32).toFixed(3)})`);
     grad.addColorStop(1.00, 'rgba(0, 0, 0, 0)');
     ctx.globalCompositeOperation = 'lighter';
     ctx.fillStyle = grad;
     ctx.fillRect(0, 0, W, H);
     ctx.globalCompositeOperation = 'source-over';
   }
   ```
   The fullscreen `fillRect` is correct: the gradient's outer stop is
   transparent, so pixels outside the wash radius contribute nothing. We
   do not need a tighter bounding box.

8. **Composite blend = `lighter` (additive).** Same blend mode as the
   deleted rectangle and the existing `drawEnemyMuzzleFlashes`. Restore
   `'source-over'` after the fill so the rest of the frame composites
   normally. The crosshair, drawn just before the wash, ends up *under*
   the wash — additive blend will only brighten it (it stays legible).

9. **Anchor follows the gun.** Bob (`bobOffX/bobOffY`), kick
   (`k.kickX/k.kickY`), sway (`swayX/swayY`), and equip-drop (`equipOffY`)
   already feed `dx`/`dy` in `drawGunViewmodel`, so `barrelX`/`barrelY`
   already track the gun's screen-space movement frame by frame. By
   reading `muzzleAnchorX/Y` (set from `barrelX/Y`) the wash inherits all
   of that motion for free. No extra math; do not duplicate the offset
   computation.

10. **Death freeze.** `update()` early-returns on `player.hp <= 0` (the
    existing death check), so `muzzleFlashUntil` is never advanced past a
    death frame. Combined with the `player.hp > 0` gate in
    `drawMuzzleScreenWash`, the wash is suppressed during the death
    overlay even if `muzzleFlashUntil` lingers from the last shot fired
    just before death. **No special-case code needed beyond the gate.**

11. **No new state on level transitions.** `clearTransientFeedback` already
    zeroes `muzzleFlashUntil`; the wash inherits that. The two new
    `muzzleAnchorX/Y` vars are deliberately *not* reset — they're a cache
    of the most recent barrel position. After R or N the next
    `drawGunViewmodel` frame overwrites them before the next shot.

12. **Performance.** One `createRadialGradient` + one fullscreen `fillRect`
    per visible-wash frame, only while `now < muzzleFlashUntil` (≤ ~5
    frames at 60 FPS per shot). Comparable to the deleted rectangle
    (which was also a fullscreen fillRect with `'lighter'`). No per-pixel
    JS, no `ctx.shadowBlur`, no buf32 work. ≥ 30 FPS target preserved
    even with sustained fire.

13. **No new console errors or warnings** during a 60-second session
    covering: rapid-fire bursts in an open corridor; dry fire with empty
    ammo; firing while equip-slide-in is still animating; firing while
    moving (head-bob non-zero); firing the same frame an enemy projectile
    lands and kills the player; firing then immediately pressing R or N.

14. **Stats / counters unchanged.** No edits to `stats.shotsFired`,
    `stats.shotsHit`, `ammo`, `hitTintUntil`, or any other counter.

15. **Out-of-band feedback unchanged.** `FLASH_FRAME_1`/`FLASH_FRAME_2`,
    `buildFlash1`/`buildFlash2`, the kick state machine
    (`kickState`/`kickKind`/`kickStart`, `KICK_UP_MS`,
    `KICK_RECOVER_MS`), the gun viewmodel (`buildGun`, `GUN_SPRITE`,
    `drawGunShadow`), the crosshair red tint
    (`hitTintUntil` / `HIT_TINT_MS`), `sfxShot`, and the dry-fire path
    (`sfxDryFire`) are untouched. **Read-only references only.**

16. **Single-file, single-IIFE invariant.** All new state, helpers, and
    tuning constants live inside the existing IIFE. No top-level
    declarations, no globals.

## Out of Scope

- Reworking `FLASH_FRAME_1`/`FLASH_FRAME_2` (the small barrel sprite). Its
  palette and falloff are kept verbatim.
- Reworking `buildFlash1` / `buildFlash2` baking pipeline.
- Crosshair red tint on hit (`hitTintUntil`, `HIT_TINT_MS`). Hit-confirm
  feedback is a separate system; do not adjust.
- Screen shake / camera jitter on shot.
- Spark particles ejected from the barrel.
- Light from the wash affecting world geometry (e.g., brightening walls
  ahead in the raycaster pass for one frame). The wash is a screen-space
  ctx overlay only.
- Per-shot variation: random color shift, animated rotation, jittered
  radius. The wash is fully deterministic — same color stops, same radius,
  same decay every shot.
- Touching `drawEnemyMuzzleFlashes` or any enemy-side feedback. Enemy
  fireballs / muzzle blocks stay as they are.
- New tuning of `MUZZLE_FLASH_MS`, `FIRE_COOLDOWN_MS`, `KICK_UP_MS`,
  `KICK_RECOVER_MS`, or any audio knob.
- Dry-fire visual feedback. Dry fire stays audio-only.
- HUD changes (HP bar, ammo readout, FPS counter, lighting toggle text).
- Any retuning of `SHOT_DAMAGE`, `MAX_AMMO`, `AMMO_REFUND`, or
  `ENEMY_RADIUS`.

## Design Notes

### Files involved
`index.html` only.

### Hook points
Line numbers reflect the current state of the file; expect small drift
after edits.

- **Tuning constants** (`index.html:68`): add the two new
  `MUZZLE_WASH_*` constants adjacent to `MUZZLE_FLASH_MS`.
- **State declarations** (`index.html:159`): add `muzzleAnchorX` and
  `muzzleAnchorY` adjacent to `let muzzleFlashUntil = 0;`.
- **`drawGunViewmodel`** (`index.html:3072-3136`): add the two anchor
  assignments immediately after `barrelX`/`barrelY` are computed
  (currently around `index.html:3115-3116`). They live at the top of the
  flash block but must run unconditionally — hoist them above the
  `if (k.flashFrame > 0)` check, or compute the barrel position outside
  the gate.
- **`drawScene` rectangle deletion + helper call** (`index.html:2159-2165`):
  replace the entire `if (nowMs < muzzleFlashUntil) { ... }` block with a
  single line `drawMuzzleScreenWash(nowMs);`.
- **`drawMuzzleScreenWash` definition** (around `index.html:2806`,
  immediately after `drawEnemyMuzzleFlashes`): new helper, ~25 lines.

### Why a radial gradient and not a buf32 pass

`ctx.createRadialGradient` is GPU-accelerated. A fullscreen `fillRect` of
that gradient with `'lighter'` is comparable in cost to the existing flat
fillRect — slightly more fragment work, but trivial. A buf32 implementation
would require a `Math.sqrt` per pixel (or a precomputed falloff table) and
would almost certainly be slower on a 1000x600+ canvas. Stay on ctx.

### Why anchor at the barrel and not screen-bottom-center

The deleted rectangle was screen-bottom-anchored (centered horizontally,
55–80% vertically). That made the flash feel "of the screen" rather than
"of the gun". Anchoring at `barrelX/barrelY` ties the wash to the same
pixel the existing FLASH_FRAME sprite blits to, so the small bright sprite
reads as the bright core of the larger soft glow — the two effects are
spatially coherent. As the gun bobs, kicks back, sways, and slides in,
the wash bobs with it.

### Why `t * t` decay

`t = remaining-life / MUZZLE_FLASH_MS` is in [0, 1]. A linear decay
(`a = peak * t`) makes the wash linger; `t * t` gives a steeper tail —
peak alpha at fire, ~25% peak at the half-life mark, ~6% at 25% remaining.
The 80 ms window is short enough that even the linear-decay version would
feel punchy, but the squared version gives the wash a cleaner "spike"
shape that pairs better with the existing recoil curve (which itself
front-loads at `KICK_UP_MS` then eases over `KICK_RECOVER_MS`).

### Why the warm-white → yellow → orange palette

These match the three rings of `FLASH_FRAME_1` exactly:
- `rgba32(255, 250, 230)` ↔ `rgba(255, 250, 230, ...)` — bright white core
- `rgba32(255, 220,  90)` ↔ `rgba(255, 220,  90, ...)` — warm yellow ring
- `rgba32(160, 110,  30)` (dim falloff) → boosted to `rgba(220, 130, 40, ...)`
  for visibility against bright wall textures

The boost on the outer stop is intentional: the FLASH_FRAME sprite uses a
dim color because it's small and saturating-added; the wash needs a richer
mid-falloff color because it covers a larger area and the peak alpha is
also lower at the outer radius.

### Composite layering recap

In `drawScene`, after the rectangle replacement, the order is:
```
ctx.putImageData(buf, 0, 0)        // walls + sprites + gun + barrel flash
drawEnemyMuzzleFlashes()           // enemy muzzle blocks (additive)
crosshair                          // 3-px cross (red on hit)
drawMuzzleScreenWash(nowMs)        // NEW: radial wash (additive)
drawDamageEdges()                  // red damage vignette
drawKillPops()                     // "+1" ammo/score pops
drawMinimap()
FPS overlay, lighting toggle text
drawHUD()                          // HP bar / ammo / etc.
drawDamageArrow()                  // off-screen damage indicator
LEVEL N banner / death overlay
```
The wash sits *under* damage vignette, kill pops, minimap, HUD, damage
arrow, and the level/death overlays — so all those readouts stay
unwashed-out. It sits *over* the crosshair, but additive blend brightens
the crosshair rather than erasing it; readability is preserved.

## Agent Notes

- **Read first:** `AGENTS.md`, `CLAUDE.md`, this spec, then the
  player-shot block of `index.html` end-to-end:
  - tuning constants near `index.html:64-95` (`MUZZLE_FLASH_MS`,
    `HIT_TINT_MS`, `BARREL_X`/`BARREL_Y`, `FLASH_W`/`FLASH_H`,
    `GUN_W`/`GUN_H`)
  - state declarations near `index.html:155-200` (`muzzleFlashUntil`,
    `hitTintUntil`, `kickState`)
  - `fireShot` near `index.html:1866-1919`
  - `clearTransientFeedback` near `index.html:1239-1270`
  - `drawScene`'s post-`putImageData` block near
    `index.html:2143-2210` (crosshair → rectangle → drawDamageEdges → …)
  - `drawEnemyMuzzleFlashes` near `index.html:2780-2806`
  - `drawGunViewmodel` near `index.html:3072-3136` (barrel anchor math)
  Make all edits inside the assigned worktree only.

- **Order of work:**
  1. Add the two `MUZZLE_WASH_*` tuning constants.
  2. Declare `muzzleAnchorX` / `muzzleAnchorY` next to `muzzleFlashUntil`.
  3. In `drawGunViewmodel`, hoist the `barrelX`/`barrelY` calc out of the
     `if (k.flashFrame > 0)` block (or just duplicate-write the anchors
     before the gate), and assign `muzzleAnchorX` / `muzzleAnchorY`.
  4. Add `drawMuzzleScreenWash(now)` next to `drawEnemyMuzzleFlashes`.
  5. Delete the rectangle block at `index.html:2159-2165` and replace
     with a single call to `drawMuzzleScreenWash(nowMs);`.
  6. Run `node --check` against the extracted `<script>` body.
  7. Smoke-test in the browser.

- **Common pitfalls:**
  - **Forgetting to hoist the anchor write outside the
    `if (k.flashFrame > 0)` gate.** If the anchor is only set during the
    flash frames (kicking phase), it will be stale between shots — the
    first frame of a new shot would read the *previous* shot's barrel
    position, which is fine in practice (the gun doesn't move much in
    one frame) but creates a subtle one-frame lag. Hoist it.
  - **Resetting the rectangle in `clearTransientFeedback` and not the
    helper call.** Don't add `muzzleAnchorX = …` to
    `clearTransientFeedback` — the anchor is a cache, not transient
    feedback. Resetting it would just force a default-position render
    on the next shot before `drawGunViewmodel` overwrites it.
  - **Dropping the `'source-over'` restore.** Forgetting to flip the
    composite back will tint the rest of the frame additively (damage
    vignette, kill pops, minimap, HUD). The deleted rectangle's
    bookend `ctx.globalCompositeOperation = 'source-over'` must be
    preserved in the new helper.
  - **Reading `nowMs` inside the helper instead of taking `now` as a
    parameter.** The drawScene call site passes `nowMs`; the helper
    should accept it and use it directly — matches the pattern of
    `drawDamageEdges(nowMs)` / `drawKillPops(nowMs)`. Don't sample
    `performance.now()` again inside.
  - **Drawing the wash on dry fire.** Confirm by inspection that
    `fireShot` only sets `muzzleFlashUntil` in the success branch
    (after `lastFireTime = now; ammo--; ...`). Do not move the
    `muzzleFlashUntil` assignment.
  - **Forgetting the `player.hp > 0` gate.** Without it, a shot fired
    in the same frame the player dies leaves a wash that draws over
    the death overlay. The gate is one line; keep it first in the
    helper.
  - **Using `ctx.shadowBlur` for the falloff.** It's slow and has
    inconsistent rendering across browsers. Use a radial gradient.
  - **Per-frame allocation in tight code paths.** Allocating a
    `createRadialGradient` per frame is fine — it's only created on
    visible-wash frames (≤ 5 per shot at 60 FPS). Don't try to
    cache it; the anchor changes between shots and the alpha changes
    every frame.
  - **Trying to bake the wash into a sprite at startup.** The radius
    depends on `min(W, H)` and the alpha decays per frame; baking a
    single sprite would lose the falloff scaling and cost a fullscreen
    blit per frame anyway. Stick with the live gradient.
  - **Inverting the `t` decay direction.** `t = (muzzleFlashUntil - now) /
    MUZZLE_FLASH_MS` should yield 1 at fire-time and 0 at expiry, so
    `t * t * peak` peaks at fire and decays to 0. If you accidentally
    write `(now - fireTime) / MUZZLE_FLASH_MS` you'll get a wash that
    fades *in* over 80 ms then snaps off — wrong shape, no punch.

- **Smoke test before reporting:**
  - Serve with `python3 -m http.server` and open in a browser.
  - Stand still, click once. Confirm:
    - small bright circular barrel flash (FLASH_FRAME_1 → 2) — unchanged
    - large soft warm wash radiating from the barrel, decaying over ~80 ms
    - no flat yellow rectangle anywhere
    - HUD strip / HP bar / ammo / FPS counter all readable through the wash
    - crosshair stays visible (additive brightens it)
  - Hold-fire a burst while strafing. Confirm the wash's center bobs
    with the gun (because `barrelX/Y` already includes head-bob), no
    visible rectangle borders, no z-order glitches.
  - Dry-fire with `ammo = 0` (fire until you run out). Confirm: distinct
    click SFX, recoil kick *not* triggered as a 'shot' kick (no flash
    sprite), and no wash. The `dry` fire path bypasses
    `muzzleFlashUntil`.
  - Fire while the equip-slide-in is still animating (R-restart and
    immediately click). Confirm the wash anchors at the gun's
    mid-slide-in barrel position (lower on screen) and follows the gun
    up as it lands.
  - Fire the same frame an enemy projectile kills you. Confirm the wash
    does NOT draw over the death overlay (gated by `player.hp > 0`).
  - Press R while a wash is mid-decay. Confirm it disappears immediately.
  - Press N mid-decay. Same.
  - DevTools console: no new errors or warnings. No
    `muzzleAnchorX is not defined` regressions on first frame.

- **At minimum** run `node --check` against the extracted `<script>` body
  before reporting.

- Keep `drawMuzzleScreenWash` as a sibling of `drawEnemyMuzzleFlashes`,
  the new tuning constants adjacent to `MUZZLE_FLASH_MS`, and the
  anchor-cache vars adjacent to `muzzleFlashUntil` so subsequent
  player-shot polish specs can locate the new state quickly.

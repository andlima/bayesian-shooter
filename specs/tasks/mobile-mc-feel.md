---
id: mobile-mc-feel
area: frontend
priority: 50
depends_on: []
description: Bring three Minecraft-Mobile-inspired patterns to the touch HUD — persistent faint joystick base as a learnability hint, utility-button column repositioned below the minimap with bigger touch targets, mild sticky-slowdown aim assist when the crosshair is near a visible enemy. Plus a one-step HUD font tier bump on narrow phone viewports.
---

# Mobile MC Feel

## Goal

The `mobile-touch-controls` and `mobile-touch-polish` tasks made the game
playable and pleasant on touch. This task borrows the most defensible
ideas from Minecraft Pocket Edition's mobile UI to make the game *feel
deliberate* on touch:

1. **Persistent faint joystick base** at a fixed bottom-left position so
   the input affordance is visible *before* the first touch (MC's
   always-on left-stick).
2. **Utility-button positioning** below the minimap with bigger touch
   targets (24×24 vs today's 22×18). Today the row at `y=22` overlaps
   the minimap rect.
3. **Mild sticky-slowdown aim assist** (touch only) when the crosshair
   is angularly near a visible alive enemy — analogous to MC's
   block-edge snap, scaled for an FPS context.
4. **HUD font tier bump** on narrow viewports (`clientWidth ≤ 380`):
   `16px / 26px` strip vs the standard `14px / 22px` touch tier.

The functional input layer (multi-touch dispatch, anchor-on-touch
joystick, look-drag, fire button geometry, viewport meta,
`touch-action: none`, `audioStarted`, `touchLookScale`, all existing
press-state and fade behavior) stays exactly as it is today. Desktop
input and rendering are byte-identical to today (no exception this
time — there is no crosshair-style cross-platform diff).

What this task is **not**: it does not add a settings UI, a
precision/walk modifier, magnetic crosshair pull, snap-to-target on
fire, hotbar/inventory, jump/crouch, or pinch/zoom. The
`mobile-touch-polish` spec already deferred a settings panel to a
hypothetical `mobile-settings-panel`; this task continues to defer it.

## Acceptance Criteria

1. **Single-file constraint preserved.** Still one `index.html` at the
   repo root, no build step, no external assets, no network requests,
   no `localStorage`, no images, no SVGs, no external CSS. All changes
   live in the existing inline `<style>` block (none expected — this
   task is canvas-only), the existing IIFE, and the existing
   `ctx.fillRect` / `ctx.fillText` HUD pattern. README receives a
   one-clause edit (AC #11).

2. **Persistent faint joystick base (touch only, alive only).** Add a
   draw block at the **top** of `drawTouchHUD()` (before the existing
   active-joystick block, `index.html:2122-2155`) that renders a faint
   stationary joystick outline at fixed framebuffer coordinates
   `(JOY_HOME_X, JOY_HOME_Y) = (60, H - 60)` with `JOY_RADIUS = 40`,
   gated on `isTouchDevice && !joyVec.active && player.hp > 0`:
   ```js
   const JOY_HOME_X = 60;
   const JOY_HOME_Y = H - 60;
   if (!joyVec.active && player.hp > 0) {
     ctx.lineWidth = 1;
     ctx.strokeStyle = 'rgba(255,255,255,0.10)';
     ctx.beginPath();
     ctx.arc(JOY_HOME_X, JOY_HOME_Y, JOY_RADIUS, 0, Math.PI * 2);
     ctx.stroke();
     // Centre dot to read as a joystick rest position, not a generic ring.
     ctx.fillStyle = 'rgba(255,255,255,0.10)';
     ctx.beginPath();
     ctx.arc(JOY_HOME_X, JOY_HOME_Y, 3, 0, Math.PI * 2);
     ctx.fill();
   }
   ```
   The persistent base is purely a visual hint — it does **not**
   change input semantics. The joystick still anchors on touch
   wherever the finger lands on the left half (existing
   `onTouchStart` behavior in `index.html:428-437` is unchanged).
   When the player touches anywhere — including the persistent base
   itself — the active joystick draws at the touch location and the
   persistent ring is hidden by the `!joyVec.active` gate.

   `JOY_HOME_X / JOY_HOME_Y` are local `const`s inside `drawTouchHUD()`
   (no module-scope additions). The persistent base is not drawn while
   the player is dead — the death state already swaps the touch HUD
   for the centred RESET button.

3. **Utility-button row repositioned below the minimap, bigger
   targets.** The existing util row is at `y=22` with buttons of
   `BTN_W × BTN_H = 22 × 18` at `xs = [2, 26, 50]`
   (`index.html:377-381`). Change to:
   ```js
   const BTN_W = 24, BTN_H = 24;     // was 22, 18
   const UTIL_ROW_Y = 110;           // new — below minimap (MM_Y + MM_SIZE = 104)
   const UTIL_XS    = [4, 32, 60];   // 4-px gaps; total span 4..84
   ```
   Apply consistently in **both** the hit-test and the renderer:
   - `utilButtonAt()` (`index.html:372-382`): use `UTIL_ROW_Y` and
     `UTIL_XS` and the new `BTN_W / BTN_H`.
   - `drawTouchHUD()` (`index.html:2179-2204`): use the same
     `UTIL_ROW_Y` and `UTIL_XS` for rendering. The mute strikethrough
     (`index.html:2194-2202`) stays anchored to the M button rect with
     a 3-px inset on each side; with the new 24×24 rect that becomes
     `(x+3, y+3) → (x+21, y+21)` automatically because the inset math
     uses `BTN_W - 3` / `BTN_H - 3`. **Verify** the strikethrough
     visually after the rect change.
   - The `roundRect(x, y, w, h, r)` helper (`index.html:2108-2116`) is
     unchanged — it already takes width/height as parameters.

   The press-state palette and the `utilPressed` state machine are
   unchanged. The RESET button (death state) keeps its current
   center-screen position and `80 × 24` rect (`index.html:367-369`,
   `index.html:2170-2178`) — only the alive-state row moves.

   Define `UTIL_ROW_Y` and `UTIL_XS` once at module scope near the
   existing `BTN_W / BTN_H / BTN_R` block (`index.html:273-274`) so
   both `utilButtonAt` and `drawTouchHUD` share one source of truth.

4. **Aim-assist sticky slowdown (touch only, alive only).** Add a
   pure function `aimAssistScale()` returning a multiplier in
   `[AIM_ASSIST_MIN_SCALE, 1]`:
   ```js
   const AIM_ASSIST_ANGLE_RAD = 0.18;   // ~10.3°
   const AIM_ASSIST_MIN_SCALE = 0.45;
   const AIM_ASSIST_MAX_DIST  = 8;      // world cells

   function aimAssistScale() {
     if (!isTouchDevice || player.hp <= 0) return 1;
     let best = 1;
     for (let i = 0; i < enemies.length; i++) {
       const e = enemies[i];
       if (!e.alive) continue;
       const lx = e.x - player.x;
       const ly = e.y - player.y;
       const tProj = lx * player.dirX + ly * player.dirY;
       if (tProj <= 0 || tProj > AIM_ASSIST_MAX_DIST) continue;
       const perpSign = lx * player.planeX + ly * player.planeY;
       const yawOffset = Math.atan2(perpSign, tProj);
       const absYaw = yawOffset < 0 ? -yawOffset : yawOffset;
       if (absYaw > AIM_ASSIST_ANGLE_RAD) continue;
       if (!enemyCanSeePlayer(e)) continue; // walls block aim assist
       const t = absYaw / AIM_ASSIST_ANGLE_RAD;
       const s = AIM_ASSIST_MIN_SCALE + (1 - AIM_ASSIST_MIN_SCALE) * t;
       if (s < best) best = s;
     }
     return best;
   }
   ```
   Apply in `update()` immediately before the existing rotation
   accumulation (`index.html:576-578`):
   ```js
   if ((pointerLocked || isTouchDevice) && mouseDx !== 0) {
     if (isTouchDevice) mouseDx *= aimAssistScale();
     rot += mouseDx * mouseSens;
   }
   mouseDx = 0;
   ```
   The `if (isTouchDevice)` gate is the only place this behavior fires
   — desktop's pointer-locked mouse-look is untouched. The reuse of
   `enemyCanSeePlayer(e)` (`index.html:1419`) keeps walls
   blocking aim-assist (an enemy on the other side of a wall does not
   slow your sweep). LOS by walls is symmetric, so reusing the
   enemy-to-player function is correct.

   **Place the function** just above `update()` (before
   `index.html:557`) so it's adjacent to its only caller. Cost
   per-frame on touch: one pass over `enemies` (≤16) plus up to 16
   `enemyCanSeePlayer` calls (each is a DDA bounded by `MAP_W +
   MAP_H` steps). Acceptable on the existing software-render
   per-frame budget.

   The slowdown applies symmetrically — sweeping *toward* the
   crosshair and *past* the crosshair both feel sticky. This matches
   the MC block-snap feel and is simpler than direction-aware logic.
   The 0.45 floor is mild enough that a determined yank still moves
   the crosshair; it does **not** lock the view. There is no
   crosshair pull (no active translation of `rot` toward an enemy) —
   sticky-slowdown only.

5. **No aim assist on dead state, no aim assist when no enemies in
   cone.** `aimAssistScale()` returns `1` (no-op) when:
   - `!isTouchDevice` (desktop never assists),
   - `player.hp <= 0` (no rotation happens during death freeze
     anyway, but defensive),
   - no alive enemy passes all three filters (in front, within 8
     cells, within 0.18 rad, with LOS).

   When any enemy qualifies, the **minimum** scale across all
   qualifying enemies wins (so two overlapping enemies at the
   crosshair don't multiply slowdowns; they just both vote and the
   smallest scale applies).

6. **HUD font tier bump on narrow viewports.** Compute a
   `touchHudTier` once at startup, mirroring the deferred-RAF
   structure already used for `touchLookScale` (which is the auto-tune
   block in the IIFE described in `mobile-touch-polish` AC #10):
   ```js
   let touchHudTier = 'medium';   // medium = 14/22, narrow = 16/26
   if (isTouchDevice) {
     requestAnimationFrame(() => {
       const cw = canvas.clientWidth || W;
       touchHudTier = (cw <= 380) ? 'narrow' : 'medium';
     });
   }
   ```
   In `drawHUD()` (`index.html:2237-2280`), replace the current
   two-state pick with a three-state pick:
   ```js
   const HUD_FONT_PX = !isTouchDevice ? 12 : (touchHudTier === 'narrow' ? 16 : 14);
   const HUD_STRIP_H = !isTouchDevice ? 18 : (touchHudTier === 'narrow' ? 26 : 22);
   ```
   The `H - HUD_STRIP_H - 2` HP bar position and `H - HUD_STRIP_H +
   4` text Y already adapt automatically. **Do not** change layout
   for desktop or for the medium-tier touch case — those render
   byte-identical to today.

   The auto-tune RAF should live alongside the existing
   `touchLookScale` RAF (one combined RAF callback is fine, two
   separate RAFs is fine — both are deferred-once on the first frame
   after canvas sizing stabilises). Do **not** recompute on resize /
   orientation change — same rationale as `touchLookScale` in the
   prior task (mid-session feel changes are worse than a one-shot
   pick). Adding the tier read inside the existing
   `requestAnimationFrame` callback is the cleaner consolidation if
   it sits naturally; otherwise a parallel RAF is fine.

7. **No regressions to desktop.** Keyboard movement, mouse-look,
   pointer-lock click-to-grab, click-to-fire, Space-to-fire, N / L /
   M keyboard handlers, R-on-death, FPS counter, minimap, atmosphere
   lighting toggle, level transitions, audio, AI, dungeon
   regeneration, sprite z-buffer occlusion, contact damage, kill
   pops, damage arrow, damage edges, level banner, crosshair (the 1-
   px outline from `mobile-touch-polish` stays as-is), gun viewmodel
   — every existing behavior is identical on desktop. **First-frame
   pixels on desktop are byte-identical to today.** There is no
   intentional desktop pixel diff in this task. Specifically:
   - HUD strip on desktop: still `12px monospace`, still `18px` tall.
   - Aim assist: gated on `isTouchDevice`, never affects pointer-lock
     mouse-look.
   - `aimAssistScale()` is defined unconditionally but the gate at
     the top means desktop frames pay one boolean check + early
     return. Acceptable.

8. **No regressions to touch input mechanics.** All semantics from
   `mobile-touch-controls` and `mobile-touch-polish` continue to hold:
   joystick anchor-on-touch, fire button hit-circle and held-fire,
   look-drag identifier-stable-through-mid-line-cross, util-row
   hit-test edge-triggered, multi-touch up to 3 concurrent fingers
   with a 4th silently ignored, viewport / `touch-action`
   suppressions, no `requestPointerLock` on touch, audio unlock on
   first touch, joystick fade in/out, press-state visuals, mute
   strikethrough, tap-to-begin overlay, touch-look sensitivity
   auto-tune. None of those mechanics change here.

   The only **observable** touch behavior changes are:
   - A faint persistent joystick ring is visible bottom-left when no
     joystick is active and the player is alive (AC #2).
   - The N / L / M buttons are now `24 × 24` and live just below the
     minimap at `y=110, x=[4, 32, 60]` (was `22 × 18` at
     `y=22, x=[2, 26, 50]`).
   - Touch look-rotation is mildly damped when sweeping near a
     visible enemy (AC #4).
   - HUD strip text is `16px` in a `26px` strip on viewports with
     `clientWidth ≤ 380` (AC #6).

9. **Determinism preserved.** No `Math.random()` introduced.
   `aimAssistScale()` is a pure function of `player`, `enemies`, and
   the static map (via `enemyCanSeePlayer`). The persistent joystick
   ring is a pure function of `joyVec.active` and `player.hp`. The
   HUD tier read is a one-shot RAF. First rendered frame on desktop:
   byte-identical to today. First rendered frame on touch (before
   the deferred RAF fires): the persistent ring is visible and the
   util column is at the new position; the HUD tier is `'medium'`
   (default), which matches today's touch values. The narrow-tier
   bump only kicks in after the RAF resolves — same one-frame
   latency as `touchLookScale`.

10. **Performance.** Net per-frame cost on desktop:
    - One additional `if (!isTouchDevice) return 1;` early-return in
      `aimAssistScale()` — but it's never called on desktop because
      of the `if (isTouchDevice)` guard at the call site. Effective
      cost: zero.
    - Persistent joystick ring is gated on `isTouchDevice` via
      `drawTouchHUD()`'s existing early return (`index.html:2123`).
    - HUD tier branch is one ternary per frame.

    Net per-frame cost on touch (alive):
    - `aimAssistScale()`: one pass over `enemies` (N ≤ 16) — cheap
      until an enemy is in cone. When in cone, up to one
      `enemyCanSeePlayer()` call per qualifying enemy (each is a
      DDA, ≤ `MAP_W + MAP_H` steps).
    - Persistent joystick ring: one stroked circle + one filled
      circle when joystick not active.
    - Repositioned util row: same draw cost as today (3 rounded
      rects), just at new coordinates.

    Aim for ≥ 30 FPS on a mid-range mobile (iPhone 11 / equivalent
    Android), as before.

11. **README touch-up.** Update the existing mobile paragraph in
    `README.md:54-60` to reflect the new util-row position and to
    mention aim assist briefly. Keep tight — replace one clause and
    add one short sentence; do not add a new paragraph. Approximate
    target:
    > On phones and tablets, **tap the screen once to start** (this
    > unlocks audio), then drag your left thumb anywhere on the left
    > half of the screen for a virtual joystick (forward / strafe),
    > drag your right thumb to look, and press the red dot at the
    > bottom-right to fire. Tap the small N / L / M buttons just
    > below the minimap to regenerate / toggle lighting / mute. Look
    > rotation slows automatically when your crosshair is near a
    > visible enemy — you don't need pixel-perfect aim. Pointer lock
    > is not used on touch devices, so there is no initial click-to-
    > lock step.

    No other README edits.

12. **No new console errors or warnings.** A 60-second smoke session
    on touch (tap-to-start → joystick around → drag-look 360° → hold
    fire through a magazine → dry-fire → tap N / L / M → die → tap
    RESET → portrait → landscape) must produce zero console errors
    or warnings. The new things to verify in the smoke session:
    - Persistent faint joystick ring is visible bottom-left on first
      load and disappears the moment a left-side touch begins.
    - Tapping each util button at the new `y=110` position visibly
      flashes the pressed state and releases on lift. The buttons
      are clearly *below* the minimap (no overlap).
    - Mute strikethrough still draws correctly through the larger M
      rect (3-px inset on each side; visible diagonal red line).
    - Slow-sweeping the right thumb past a nearby enemy noticeably
      slows look rotation; sweeping over empty walls or distant
      enemies feels normal.
    - On a small viewport (DevTools "iPhone SE" or smaller, ~375 CSS-
      px wide), HUD strip text is visibly larger than on a larger
      emulator. On a larger phone (~414+) it matches today.
    - Death overlay still reads "tap RESET to restart" on touch and
      "press R to restart" on desktop — RESET button still appears
      centred (its layout did not change).

## Out of Scope

- **Settings UI / sensitivity slider / aim-assist toggle.** Continues
  to be deferred — `mobile-settings-panel` is the future home if it
  ever ships. **Do not** add a panel.
- **Crosshair magnetic pull / target snap on fire / auto-aim.**
  Sticky-slowdown only (AC #4). The crosshair never moves on its own.
- **Precision / walk modifier (held button to slow movement and
  look).** Explicitly excluded by scope choice for this task.
- **Pitch / vertical look.** Same constraint as prior tasks — the
  renderer assumes a fixed horizon. **Do not** add a pitch axis.
- **Hotbar / inventory / weapon switching.** Not applicable — the
  game has one weapon.
- **Auto-jump / auto-step / sneak.** No vertical traversal in this
  game.
- **Pinch / zoom / two-finger gestures.** Breaks the software
  renderer's fixed framebuffer math.
- **Gyro / device-orientation look.** Defer.
- **Re-tuning combat constants** (`FIRE_COOLDOWN_MS`, `MAX_AMMO`,
  damage, enemy AI, `SHOT_DAMAGE`, `ENEMY_RADIUS`, etc.).
- **Re-tuning desktop controls** (mouse sensitivity, keyboard rotation
  speed, FOV, etc.).
- **Re-styling the minimap, FPS counter, lighting toggle indicator,
  level banner, damage arrow / edges, kill pops, gun viewmodel,
  muzzle flash, or HUD strip alignment** beyond the tier bump in
  AC #6.
- **Adding new icons / glyphs / SVGs / sprite sheets.** Same as
  prior tasks — single-file constraint forbids it.
- **Moving the fire button.** Still at `(W - 36, H - 36)` with
  `FIRE_BTN_R = 28`.
- **Moving or resizing the RESET button** (death state). Still
  centred, still `80 × 24`.
- **PWA install, service worker, manifest, orientation lock.** Same
  as prior tasks.
- **Refactoring `drawTouchHUD()` / `update()` / `onTouchStart` etc.
  beyond what these ACs require.** Keep changes localised so the
  diff is reviewable against prior task specs.

## Design Notes

- **Why a *persistent hint* base instead of a fixed-anchor joystick.**
  MC's joystick is fixed-position, but on mobile FPSes that's a
  worse trade because thumbs don't always rest in the same place
  (handedness, phone size, grip style). Anchor-on-touch is more
  forgiving. The persistent ring captures the *learnability* benefit
  of MC's design (you see where the joystick "lives" before you
  touch) without the *flexibility* cost of forcing the user to a
  fixed spot. A new player learns "this region is the joystick
  area"; a returning player anchors wherever feels natural.

- **Why bottom-left at `(60, H - 60)` for the persistent base.**
  `JOY_RADIUS = 40`, so the ring extends `x: 20..100, y: H-100..H-20`.
  That keeps it clear of the bottom-left corner without crowding the
  HUD strip (which sits at `y: H-22..H` on touch — the ring's bottom
  edge is `H-20`, a 2-px gap above the strip top). It also doesn't
  overlap the new util-row column on the left edge (`y: 110..134` →
  the ring starts at `y: H-100 = 170`, well below). One layout that
  fits everything.

- **Why move N / L / M to `y=110` instead of bigger or relocated to
  the right.** The current `y=22` row visually overlaps the minimap
  rectangle (`y: 8..104`) — they draw on top of each other. Moving
  to `y=110` puts the row in clean space immediately below the
  minimap, with the same left-edge column as the minimap. Moving to
  the *right* edge (mirroring MC's right-side action stack) was
  considered and rejected: a fast right-thumb look-drag starting in
  the top-right corner would land on a util button first and trigger
  N / L / M instead of look. That's a real mis-tap risk for
  destructive actions (especially N, which regenerates the dungeon
  mid-run). Keeping utility on the left preserves the "primary
  action lives on the right" rule MC is actually following — it just
  happens that this game's only primary action is fire.

- **Why bump util buttons from 22×18 to 24×24.** 24×24 is roughly
  the minimum recommended touch target on phones (Apple HIG and
  Android Material both cite ~44 CSS-px ≈ 24-26 framebuffer-px on
  this game's typical letterbox). 22×18 is below that on the
  vertical axis. The horizontal change is a smaller ergonomic
  improvement; the vertical change is the meaningful one.

- **Why `0.18 rad` and `0.45` for aim assist.** `0.18 rad ≈ 10.3°` is
  the angular subtense of an enemy at ~6 cells distance with
  `ENEMY_RADIUS = 0.4` — i.e., the assist kicks in roughly when the
  enemy is "filling the crosshair area" visually, not when the enemy
  is anywhere on screen. `0.45` is a 55% slowdown — enough to feel
  tactile (the user notices the stickiness), gentle enough that it
  doesn't fight a deliberate yank. Both are tunable constants; if a
  reviewer wants stronger or weaker assist, change one number and
  re-test. **Do not** expose either as a runtime setting in this
  task.

- **Why slowdown only, no crosshair pull.** Active pull (translating
  `rot` toward an enemy without touch input) is the controversial
  part of "aim assist" — it can feel like the game is taking the
  shot for you. Sticky-slowdown is the *least intrusive* form: you
  still have to aim, you just have a tiny window of forgiveness when
  you're already nearly on target. This is also the only form that
  is truly defensive — if all enemies are dead or behind walls, the
  scale is `1` and the player feels nothing. Pull would be visible
  even when you're not trying to aim (e.g., during a spin to look
  around).

- **Why LOS-gate aim assist via `enemyCanSeePlayer()`.** Without LOS,
  rotation would slow as you sweep past walls hiding an enemy on
  the other side. That feels like a ghost in the input — confusing
  and detached from what the player sees. With LOS, the slowdown
  only happens when an enemy is *visible* — exactly when the player
  intuitively wants it. The cost is up to N raycasts per frame on
  touch, where N is the number of enemies inside the
  `AIM_ASSIST_MAX_DIST` cone — typically 0-3 in this game.

- **Why a single `cw ≤ 380` HUD tier instead of a 3-step ladder.**
  The `mobile-touch-polish` task already established that touch
  needs `14 / 22` everywhere by default. The remaining gap is
  small phones (iPhone SE 1/2 at 375 CSS-px, older Androids at
  360-) where 14-px text is uncomfortably small. A single bump to
  `16 / 26` covers that without complicating the math. Tablets and
  larger phones are already comfortable at `14 / 22` — adding a
  third tier (e.g., `12 / 18` for big screens) would shrink text
  *back* on people who don't need it.

- **Why the deferred RAF for `touchHudTier` (instead of computing
  inline at startup).** Same reason as `touchLookScale`:
  `canvas.clientWidth` may be `0` during initial IIFE execution.
  The first RAF callback fires after layout, so `clientWidth` is
  correct then. The medium-tier default means the first frame uses
  today's pixel layout — the bump kicks in one frame later if the
  viewport is narrow. Imperceptible.

- **Symbols added (state at top of IIFE):**
  ```js
  const UTIL_ROW_Y = 110;          // was inline y=22 in two places
  const UTIL_XS    = [4, 32, 60];  // was [2, 26, 50]
  // BTN_W / BTN_H change in place: 22 -> 24 / 18 -> 24
  const AIM_ASSIST_ANGLE_RAD = 0.18;
  const AIM_ASSIST_MIN_SCALE = 0.45;
  const AIM_ASSIST_MAX_DIST  = 8;
  let touchHudTier = 'medium';     // 'medium' | 'narrow'
  ```

- **Symbols added (functions / helpers):**
  - `aimAssistScale()` — pure function, defined just above
    `update()`. ~20 lines.
  - No new draw helpers — the persistent joystick ring is two
    `arc()` calls inline in `drawTouchHUD()`.

- **Where edits land in `index.html`:**
  - State block (`index.html:265-288`): change `BTN_W / BTN_H` to
    `24 / 24`; add `UTIL_ROW_Y`, `UTIL_XS`,
    `AIM_ASSIST_ANGLE_RAD`, `AIM_ASSIST_MIN_SCALE`,
    `AIM_ASSIST_MAX_DIST`, `let touchHudTier = 'medium'`.
  - `utilButtonAt` (`index.html:372-382`): rewrite the alive
    branch to use `UTIL_ROW_Y` and the `UTIL_XS` array.
  - `update()` rotation block (`index.html:576-579`): insert
    `if (isTouchDevice) mouseDx *= aimAssistScale();` before the
    `rot += ...` line, gated as in AC #4.
  - New `aimAssistScale()` function: just above `update()`
    (before `index.html:557`).
  - `drawTouchHUD` (`index.html:2122-2208`): add the persistent-
    base draw block at the top (after the `if (!isTouchDevice)
    return;` early-return, before the active-joystick block); use
    `UTIL_ROW_Y` and `UTIL_XS` in the alive branch
    (`index.html:2179-2204`).
  - `drawHUD` (`index.html:2237-2280`): replace the binary
    ternaries on `isTouchDevice` with the three-state read from
    `touchHudTier`.
  - Deferred RAF for `touchHudTier`: alongside the existing
    `touchLookScale` RAF (or merged into the same callback).
  - README mobile paragraph (`README.md:54-60`): update util-row
    location ("just below the minimap") and add the aim-assist
    sentence per AC #11.

- **Hot-path discipline.** All new logic is gated on `isTouchDevice`
  or runs only when the touch HUD is being drawn. Desktop frame
  cost delta is essentially zero. Touch frame cost delta is one
  enemies-array iteration plus up to N raycasts.

- **Test in DevTools first.** Same pattern as prior tasks. Chrome
  DevTools mobile emulation with **Touch: forced** reproduces
  `'ontouchstart' in window === true`. Verify:
  - Persistent ring shows on first load (before touching).
  - Util column is below minimap, larger touch targets.
  - Aim assist: spawn near an enemy, pan the right thumb slowly
    past it — rotation visibly stickies as the crosshair
    approaches the enemy and releases as it passes.
  - HUD tier: try iPhone SE preset (375-px wide) → larger text;
    try iPhone 12 Pro (390-px) → still medium.

## Agent Notes

- **Read first:** `AGENTS.md`, `CLAUDE.md`, this task spec, the prior
  `specs/tasks/mobile-touch-controls.md` and
  `specs/tasks/mobile-touch-polish.md` (for the touch contract you
  must preserve), then in `index.html`:
  - lines 55-65 (W, H, ENEMY_RADIUS).
  - lines 265-290 (input state + new constants land here).
  - lines 370-385 (`utilButtonAt`).
  - lines 384-520 (touch handlers — read for context, **do not
    modify** input semantics).
  - lines 555-590 (`update()` rotation accumulator — single-line
    insertion site).
  - line 1419 (`enemyCanSeePlayer` signature for aim-assist LOS).
  - lines 1620-1690 (existing `fireShot()` enemy iteration — gives
    you the same `tProj / perp` math you'll mirror in
    `aimAssistScale`, except using `planeX/Y` instead of squared
    perpendicular).
  - lines 1900-1925 (crosshair — for context, **do not modify**).
  - lines 2105-2210 (`roundRect` + `drawTouchHUD` — primary
    surface).
  - lines 2237-2280 (`drawHUD` — HUD tier read).
  All edits stay inside the assigned worktree only.

- **Order of work (recommended):**
  1. New constants in the state block (AC #2 / #3 / #4 / #6).
     Verify nothing else broke (`node --check`).
  2. Util row reposition (AC #3) — change `BTN_W / BTN_H`,
     `utilButtonAt`, `drawTouchHUD` alive-branch xs/ys.
     DevTools mobile → buttons below minimap, bigger; press-state
     still works; mute strikethrough still draws.
  3. Persistent joystick base (AC #2). DevTools mobile → faint
     ring visible bottom-left on load; disappears on first
     left-half touch; reappears on touch release; not drawn while
     dead.
  4. `aimAssistScale()` function + call site (AC #4 / #5).
     DevTools mobile → spawn an enemy, slow-pan past it, observe
     rotation stickiness. Walk behind a wall → no stickiness when
     enemy is hidden. Desktop → unchanged feel.
  5. HUD tier (AC #6). Set DevTools to iPhone SE (375 CSS-px) →
     bigger HUD strip text. Switch to iPhone 12 Pro (390) → today's
     size.
  6. README touch-up (AC #11).
  7. `node --check` against the extracted `<script>` body:
     ```
     grep -oP '(?s)(?<=<script>).*?(?=</script>)' index.html > /tmp/script.js
     node --check /tmp/script.js
     ```
  8. Smoke test in DevTools mobile emulation, then on a real phone
     if available.

- **Common pitfalls:**
  - **Util row constants changed in only one place.** `utilButtonAt`
    and `drawTouchHUD` both encode `xs` and `y0` today as inline
    literals. Replace **both** with the shared `UTIL_XS` and
    `UTIL_ROW_Y` constants. If the hit-test and the renderer
    disagree on rect coordinates, taps in the visual button area
    will silently miss.
  - **Aim assist not gated on `isTouchDevice` at the call site.**
    The function returns `1` on desktop because of the internal
    guard, but for symmetry and clarity also gate the multiplication
    at the call site (`if (isTouchDevice) mouseDx *= ...`). This
    keeps desktop's per-frame cost provably zero (no function call
    at all).
  - **Aim assist ignoring LOS.** Without `enemyCanSeePlayer()`,
    sweeping past walls slows for invisible enemies. Confusing.
    Always include the LOS check.
  - **Persistent joystick ring drawing while dead.** The
    `player.hp > 0` gate is required — otherwise the ring shows up
    underneath the death overlay and competes with the centred
    RESET prompt. Easy to forget.
  - **Mute strikethrough math broken by new rect size.** The
    strikethrough uses `(x+3, y+3)` to `(x + BTN_W - 3, y + BTN_H -
    3)`. With `BTN_W = BTN_H = 24`, that becomes `(x+3, y+3) →
    (x+21, y+21)` — still correct because the inset uses the
    constants. Verify by toggling M in DevTools mobile.
  - **HUD tier read before RAF resolves.** The default `'medium'`
    means frame 0 looks like today on touch. If you initialise
    `touchHudTier` to anything else, you'll see a one-frame flash.
    Keep the default.
  - **Aim assist applied to keyboard rotation.** The
    `keys['ArrowLeft']` / `keys['ArrowRight']` rotation path
    (`index.html:574-575`) is a separate accumulator from
    `mouseDx`. The aim-assist multiplication only touches
    `mouseDx`, so keyboard rotation is unaffected — verify by
    panning with arrow keys on desktop.
  - **`enemies` array empty during cinematic transitions.** Level
    transitions and `resetRun()` rebuild `enemies` before update
    runs again, but if anything in your scaffolding references
    `enemies[i]` before that, you'll need a defensive empty-loop.
    The `for (let i = 0; i < enemies.length; i++)` pattern handles
    `length === 0` correctly.

- **Smoke test before reporting:**

  *Desktop (must be byte-identical to today):*
  - Reload in Chrome / Firefox. Click canvas → pointer locks.
    WASD walks, mouse looks, click fires, Space fires, N regens, L
    toggles lighting, M mutes, R resets after death. `.hint` div
    visible. FPS counter correct. HUD strip identical (font 12,
    strip 18). Death prompt reads "press R to restart". Crosshair
    still has the 1-px black halo from the prior task. **No new
    visual diff.** No new console errors.

  *Mobile emulation (Chrome DevTools, mobile mode, Touch: forced):*
  - Reload at iPhone 12 Pro (~390 CSS-px). `.hint` hidden.
    Tap-to-begin overlay visible centred. Persistent faint
    joystick ring visible bottom-left.
  - Tap-to-begin → overlay dismisses, audio unlocks, ring
    persists.
  - Touch left half (anywhere) → ring fades; active joystick
    fades in at touch point. Drag → thumb tracks. Lift →
    joystick fades out, ring fades back in.
  - Touch right half → look responds. Drift toward an enemy
    until crosshair is ~10° away → rotation visibly stickies.
    Continue past → stickiness releases.
  - Walk to a corridor with an enemy on the other side of a
    wall → look-pan over the wall area → no stickiness (LOS
    blocked). Open the door / round the corner → enemy visible
    → stickiness returns.
  - Tap each util button at `y=110` (below minimap) → flashes
    pressed; release on lift. Tap M → strikethrough on. Tap M
    again → strikethrough clears.
  - Walk into enemies until dead → death overlay reads "tap
    RESET". Util column hides; persistent joystick ring hides;
    centred RESET appears. Tap RESET → run resets, util column
    + ring return.
  - Switch to iPhone SE preset (375 CSS-px) → HUD strip text
    visibly larger (16-px) in a 26-px strip. HP bar sits 2 px
    above the strip. Reload at iPhone 12 Pro → back to 14-px /
    22-px (medium tier).
  - Concurrent multi-touch: walk forward + look + hold fire →
    all three work. Aim assist still applies to look while
    walking.
  - Console: zero errors, zero warnings.

  *Real device (if available):*
  - iPhone Safari and Android Chrome. Verify the persistent ring
    is faintly visible (not invisible), util column doesn't
    overlap minimap, aim assist feels noticeable on a slow drag
    past an enemy and unnoticeable when no enemies are visible,
    and HUD strip readability is comfortable at the device's
    actual pixel density.

- **At minimum** run `node --check` against the extracted
  `<script>` body before reporting:
  ```
  grep -oP '(?s)(?<=<script>).*?(?=</script>)' index.html > /tmp/script.js
  node --check /tmp/script.js
  ```

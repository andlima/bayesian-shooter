---
id: mobile-touch-polish
area: frontend
priority: 50
depends_on: []
description: Polish the touch experience — rounded buttons with press feedback, joystick fade in/out, mute icon shows muted state, larger HUD readouts, touch-aware death prompt, tap-to-begin overlay, and one-shot look-sensitivity auto-tune.
---

# Mobile Touch Polish

## Goal

The `mobile-touch-controls` task made the game *playable* on phones. This
task makes it *feel right*. The functional input layer (joystick / look /
fire / N-L-M / RESET, multi-touch dispatch, viewport meta, `touch-action:
none`) stays exactly as it is today; only the look-and-feel of the touch
HUD, the readability of the HUD strip on small screens, the audio-unlock
UX, and one tiny one-shot sensitivity adjustment change. Desktop is
visually and behaviourally untouched.

## Acceptance Criteria

1. **Single-file constraint preserved.** Still one `index.html` at the
   repo root, no build step, no external assets, no network requests, no
   `localStorage`, no images, no SVGs, no external CSS. All polish lives
   in the existing inline `<style>` block, the existing IIFE, and the
   existing `ctx.fillRect` / `ctx.fillText` HUD pattern.

2. **Rounded buttons with consistent palette.** Replace the current flat
   `fillRect` + `strokeRect` pattern in `drawTouchHUD()`
   (`index.html:2076-2099`) for the N / L / M utility row and the RESET
   button with rounded rectangles (corner radius `BTN_R = 4` framebuffer
   px). Add a small helper `roundRect(x, y, w, h, r)` in the touch HUD
   helpers area (just above `drawTouchHUD()`) that builds a path via
   `ctx.moveTo` + `ctx.arcTo` (4 sides, 4 corners). Stroke / fill colours
   stay close to today's palette but with a touch more contrast:
   - Idle background: `rgba(0,0,0,0.55)` (was `0.45`)
   - Idle border:     `rgba(255,255,255,0.65)` (was `0.55`)
   - Pressed background: `rgba(255,255,255,0.18)` (new — see AC #3)
   - Pressed border:     `rgba(255,255,255,0.85)` (new)
   - Label text:      `#fff` (unchanged)

   The fire button stays a circle (no rounded-rect for it — it's already
   round) but gets the same press-state treatment per AC #3 and a softer
   resting fill (`rgba(255,255,255,0.06)`, was `0.10`) so the red
   pressed state stands out more.

3. **Press-state feedback for utility buttons and fire button.** Track a
   per-button `pressedAtMs` timestamp on `touchstart` (set to `nowMs`)
   and clear on `touchend` / `touchcancel` for the same identifier. New
   state object in the input block (`index.html:265-278`):
   ```js
   const utilPressed = { N: 0, L: 0, M: 0, RESET: 0 };  // 0 = not pressed
   ```
   In `onTouchStart` (`index.html:374+`), after the existing util-button
   hit-test sets `touches.set(t.identifier, 'util')`, also stash which
   button was pressed by extending the hit-test:
   ```js
   const util = utilHitTest(fb.x, fb.y);  // already returns 'N'|'L'|'M'|null
   if (util) {
     utilPressed[util] = nowMs;
     // store the label on the touch so onTouchEnd can clear it
     touches.set(t.identifier, 'util:' + util);
     ...existing handler dispatch...
     continue;
   }
   ```
   And similarly for RESET in the death branch: `utilPressed.RESET = nowMs`,
   `touches.set(t.identifier, 'util:RESET')`. In `onTouchEnd`, when the
   role string starts with `'util:'`, parse the label and clear:
   `utilPressed[label] = 0`.

   In `drawTouchHUD()`, a button is rendered "pressed" iff
   `utilPressed[label] !== 0`. Pressed state uses the pressed background
   + border colours from AC #2. The fire button uses `firePressed`
   directly (already exists) — no separate `utilPressed.FIRE` needed.

   Press visuals are **immediate** on touch (no animation curve), and
   release is **immediate** on lift. No tween / fade for press state —
   the visual response must feel snappy. The fade only applies to the
   joystick (AC #4), not to button press states.

4. **Joystick fade-in / fade-out.** The joystick currently pops into and
   out of existence with the touch. Add a 120 ms ease-in / ease-out
   alpha envelope:
   - On `touchstart` for a joy touch: set `joyVec.shownAtMs = nowMs`
     and (already) `joyVec.active = true`.
   - On `touchend` / `touchcancel` for the joy touch: set
     `joyVec.hiddenAtMs = nowMs` (new field, init `0`), but **defer**
     setting `joyVec.active = false` — instead, keep `active` true and
     mark `joyVec.fading = true`. The joystick contribution to
     `mvX/mvY` in `update()` (currently gated on `joyVec.active`) must
     additionally early-out when `joyVec.fading === true`, so a fading
     joystick does **not** keep moving the player. Drop `joyVec.active`
     to `false` (and clear `fading`, `id`, `x`, `y`) once the fade-out
     completes (in `drawTouchHUD()` at the end of the fade pass — see
     below). Do **not** reset `joyVec.ax / ay` until `active` flips
     false, or the fade-out would draw at the wrong position.

   In `drawTouchHUD()`, compute `joyAlpha`:
   ```js
   const FADE_MS = 120;
   let joyAlpha = 0;
   if (joyVec.active) {
     if (joyVec.fading) {
       joyAlpha = Math.max(0, 1 - (nowMs - joyVec.hiddenAtMs) / FADE_MS);
       if (joyAlpha === 0) {
         // fade complete — fully clear so a future touch starts fresh
         joyVec.active = false; joyVec.fading = false;
         joyVec.id = -1; joyVec.x = 0; joyVec.y = 0;
       }
     } else {
       joyAlpha = Math.min(1, (nowMs - joyVec.shownAtMs) / FADE_MS);
     }
   }
   ```
   Then multiply the joystick base + thumb stroke / fill alphas by
   `joyAlpha`. The fade is purely a draw-side effect — input is gated by
   `joyVec.active && !joyVec.fading`. The `joyVec.x / y` inputs are
   already zeroed at fade start.

5. **Mute button shows muted state.** When `muted === true`, the `M`
   button renders with a 1-px diagonal strikethrough line drawn from the
   button's top-left to its bottom-right (inset by 3 px on each side).
   Use `ctx.beginPath` + `ctx.moveTo` + `ctx.lineTo` + `ctx.stroke` with
   `strokeStyle = 'rgba(255,80,80,0.9)'` and `lineWidth = 1`. The label
   stays `'M'` (don't change the text). This communicates muted state at
   a glance without adding a new icon. When `muted === false`, no
   strikethrough is drawn.

6. **HUD strip readouts scale up on touch devices.** The bottom HUD
   strip in `drawHUD()` (`index.html:2133-2171`) currently uses
   `12px monospace` and an 18-px-tall background strip
   (`fillRect(0, H - 18, W, 18)`). On `isTouchDevice`, scale to
   `14px monospace` in a `22`-px-tall strip:
   ```js
   const HUD_FONT_PX = isTouchDevice ? 14 : 12;
   const HUD_STRIP_H = isTouchDevice ? 22 : 18;
   ```
   Update the four `fillText` calls and the strip background `fillRect`
   to use these constants. The HP bar above the strip
   (`fillRect(0, H - 20, W, 2)` and the red overlay) shifts up to sit
   immediately above the strip — always exactly 2 px above the strip
   regardless of strip height: `H - HUD_STRIP_H - 2`. Vertical text
   placement inside the strip: `H - HUD_STRIP_H + 4` (was `H - 14`),
   keeps a 4-px top margin in both modes. **Do not** change layout for
   non-touch — desktop must render byte-identical to today.

   Define the constants near the top of `drawHUD()` (not at module
   scope) so the function stays self-contained. They're cheap to
   recompute per frame.

7. **Death overlay text is touch-aware.** In `render()` at
   `index.html:1957-1966`, replace the hard-coded
   `'YOU DIED — press R to restart'` with:
   ```js
   const deathText = isTouchDevice
     ? 'YOU DIED — tap RESET to restart'
     : 'YOU DIED — press R to restart';
   ```
   No layout / colour / sizing change — only the literal string. The
   RESET button is already rendered by `drawTouchHUD()` per AC #9 of
   the prior task, and the touch HUD is already drawn above the death
   overlay (verify in current code; if not, reorder so touch HUD draws
   *after* the death overlay too — same caveat as the prior task's AC
   #10). On desktop, the string is unchanged.

8. **Tap-to-begin overlay (touch only, one-shot).** On touch devices,
   the user has to tap the canvas once to unlock the AudioContext (the
   existing `ensureAudio()` call inside `onTouchStart` handles that),
   but today that first tap also doubles as a real input event
   (joystick anchor / look / fire). That means: (a) audio sometimes
   misses the very first shot, and (b) there's no visible "tap here to
   start" prompt, so a confused first-time user might tap a non-canvas
   area and never unlock audio.

   Add a one-shot overlay that:
   - Renders in `render()`, **after** the death overlay block at
     `index.html:1957-1966` and **after** `drawTouchHUD()`. That is, it
     is the very last thing drawn each frame.
   - Gates on `isTouchDevice && !audioStarted`. New module-scope flag:
     ```js
     let audioStarted = false;   // flips true on first touch (any kind)
     ```
     Set it to `true` at the **top** of `onTouchStart`, immediately
     after the existing `ensureAudio()` call. (Don't gate on the
     AudioContext's actual state — `ensureAudio` is the one-time unlock
     and once it's called we consider audio started for HUD purposes.)
   - Visual: full-screen `rgba(0,0,0,0.55)` dim, then a centered
     panel ~`160 × 32` framebuffer-px with the same rounded-rect style
     as the utility buttons (AC #2 idle palette), text `'TAP TO BEGIN'`
     in `14px monospace`, centered. Use the existing `ctx` text
     primitives.
   - The first touch dismisses the overlay (because `audioStarted`
     becomes true) **and** is consumed normally as a joystick / look /
     fire / util touch — no special "first tap is consumed by the
     overlay only" behaviour. The user expects their first tap to also
     do something in the game.
   - Purely visual: it does not block input. The early-return at the
     top of the gate is a single boolean check on desktop (where
     `isTouchDevice === false`), so per-frame cost is one branch.
   - Reset on `resetRun()` is **not** required — once audio is unlocked
     in a session it stays unlocked, and the user has already learned
     the touch controls by the time they die. The overlay is strictly
     a first-launch hint.

9. **Crosshair contrast (1-px outline, both desktop + touch).** The
   crosshair at `index.html:1885-1890` is a 3-px white cross that's
   easy to lose against bright walls. Add a 1-px black outline by
   drawing the same cross one pixel larger first in `#000`, then the
   coloured cross on top:
   ```js
   const crossColor = (nowMs < hitTintUntil) ? '#f44' : '#fff';
   const cx = W >> 1, cy = H >> 1;
   // 1-px black outline
   ctx.fillStyle = '#000';
   ctx.fillRect(cx - 2, cy - 1, 5, 3);
   ctx.fillRect(cx - 1, cy - 2, 3, 5);
   // coloured cross on top
   ctx.fillStyle = crossColor;
   ctx.fillRect(cx - 1, cy, 3, 1);
   ctx.fillRect(cx, cy - 1, 1, 3);
   ```
   This is an intentional cross-platform readability fix. The crosshair
   silhouette is unchanged (still a 3-px cross visually) but it's now
   legible against any background. The slight halo is a deliberate
   trade — universally readable beats pixel-pure.

10. **One-shot look-sensitivity auto-tune for touch.** Touch deltas
    arrive in framebuffer pixels (per `touchToFramebuffer`), and the
    existing `mouseSens = 0.0022 rad/px` (`index.html:545`) was tuned
    for desktop mouse-event pixels. On a wide phone the canvas may be
    ~800 CSS-px wide vs `W = 480` framebuffer-px, which makes one
    framebuffer-px touch delta correspond to a *larger* physical
    finger-arc than one CSS-px mouse delta — so today's touch look
    feels too slow on some devices and too fast on others.

    Compute a per-session multiplier **once at startup**, after canvas
    sizing has stabilized (use a `requestAnimationFrame` callback in
    the IIFE to defer one frame so `canvas.clientWidth` is non-zero):
    ```js
    let touchLookScale = 1;  // desktop default
    if (isTouchDevice) {
      requestAnimationFrame(() => {
        const cw = canvas.clientWidth || W;
        // Map fb-px deltas back to CSS-px-equivalent feel.
        // A wider canvas → fewer fb-px per finger-mm → scale up.
        // Clamp to a sane range so weird viewports don't go wild.
        touchLookScale = Math.max(0.6, Math.min(2.0, cw / W));
      });
    }
    ```
    Apply in the look-touch branch of `onTouchMove`
    (`index.html:457-465`):
    ```js
    mouseDx += (fb.x - lookTouch.lastX) * touchLookScale;
    ```
    Desktop is unaffected (`touchLookScale === 1` and the look branch
    isn't entered for mouse anyway). The multiplier is fixed for the
    session — it does **not** recompute on resize / orientation
    change. (If a user rotates the phone the canvas reflows but
    sensitivity stays consistent — a small inconsistency that's
    preferable to mid-session feel changes.)

    Do **not** add a settings UI / slider — auto-tune is the entire
    sensitivity story for this task.

11. **No new touch state leaks across `resetRun()`.** When the player
    dies and taps RESET, `resetRun()` already restores game state.
    Verify that `joyVec`, `lookTouch`, `fireTouch`, `firePressed`,
    `touches`, `utilPressed`, and the new `joyVec.fading` /
    `joyVec.shownAtMs` / `joyVec.hiddenAtMs` fields don't carry stale
    values across a reset — specifically:
    - If a finger is still on the screen at the moment RESET is tapped
      (e.g., joystick held with one thumb, RESET tapped with another),
      the joystick should resume working without glitches once the new
      run starts. Today's `touchend` handlers clean up per-touch state
      so this *should* already work; just confirm by smoke-test, no
      extra code needed.
    - `audioStarted` (AC #8) stays `true` across resets — no overlay
      re-appears.

12. **No regressions to desktop.** Keyboard movement, mouse-look,
    pointer-lock click-to-grab, click-to-fire, Space-to-fire, N / L / M
    keyboard handlers, R-on-death, FPS counter, minimap, atmosphere
    lighting toggle, level transitions, audio, AI, dungeon
    regeneration, sprite z-buffer occlusion, contact damage, kill
    pops, damage arrow, damage edges, level banner — every existing
    behavior is identical on desktop. Specifically:
    - HUD strip on desktop: byte-identical pixels (font 12, strip 18,
      same text positions). Acceptance test: take a screenshot of the
      first frame today, compare to the first frame after this change
      with `isTouchDevice === false`. They must match.
    - Crosshair outline (AC #9) is the **only** intentional desktop
      pixel diff. Note this clearly in the commit message.
    - Death overlay text is unchanged on desktop (AC #7).

13. **No regressions to touch input mechanics.** The previous
    `mobile-touch-controls` task's behavioural contract still holds —
    joystick anchor-on-touch, fire button hit-circle and held-fire
    semantics, look-drag identifier-stable-through-mid-line-cross,
    util-row hit-test edge-triggered, multi-touch up to 3 concurrent
    fingers with a 4th silently ignored, viewport / `touch-action`
    suppressions, no `requestPointerLock` on touch, audio unlock on
    first touch. None of those mechanics change here.

14. **Determinism preserved.** No `Math.random()` introduced. The
    crosshair outline (AC #9) and the joystick fade alpha (AC #4) are
    pure functions of `nowMs` and game state. `audioStarted` (AC #8)
    is a one-way flag set on first touch. The sensitivity auto-tune
    (AC #10) reads `canvas.clientWidth` once on a deferred RAF; on
    desktop the branch never executes. First rendered frame on
    desktop: byte-identical to today (modulo the 1-px crosshair
    outline, which is the deliberate AC #9 change).

15. **Performance.** Net per-frame cost on desktop:
    - One extra `fillRect` pair for the crosshair outline (negligible).
    - One additional `if (isTouchDevice)` early-return in
      `drawTouchHUD()` (already there — unchanged).
    - One additional `if (isTouchDevice && !audioStarted)` branch at
      the end of `render()` (one boolean check, returns immediately
      on desktop).

    Net per-frame cost on touch:
    - Rounded rects via `arcTo` instead of straight `fillRect` /
      `strokeRect`: ~4 extra path ops per button, 3-4 buttons → < 20
      extra path ops, all on a 480 × 270 canvas — well within budget.
    - Joystick fade arithmetic: a few math ops per frame when joystick
      is active or fading.
    - Mute strikethrough: 1 extra path when `muted`.
    - Tap-to-begin overlay: 1 fullscreen `fillRect` + 1 panel + 1
      text, only until first touch.

    Aim for ≥ 30 FPS on a mid-range mobile (iPhone 11 / equivalent
    Android), as before.

16. **No new console errors or warnings.** The same 60-second smoke
    session as the prior task (tap-to-start → joystick around →
    drag-look 360° → hold fire through a magazine → dry-fire → tap N /
    L / M → die → tap RESET → portrait → landscape) must produce zero
    console errors or warnings. New things to verify in the smoke
    session:
    - Tap-to-begin overlay appears on first load and dismisses on
      first touch.
    - All four utility-row taps visibly flash the pressed state then
      release.
    - Tap M → strikethrough appears on M button. Tap M again →
      strikethrough disappears.
    - Joystick visibly fades in (~120 ms) on touch and out on lift.
      Player movement does not lag the visual fade — input starts
      immediately on touch and stops immediately on lift.
    - Death screen on touch reads "tap RESET to restart". Desktop
      reads "press R to restart" (unchanged).
    - HUD strip text (HP / AMMO / LEVEL / KILLS) is visibly larger and
      easier to read at thumb-distance on phone. On desktop it is
      identical to today.
    - Crosshair is visibly more readable on bright walls on both
      platforms.

17. **README touch-up.** Update the existing mobile paragraph in
    `README.md` (added by the prior task, near the bottom of the
    Controls section) to mention "Tap the screen once to start". Keep
    it tight — one extra clause, not a new paragraph. Example:
    > On phones and tablets, **tap the screen once to start** (this
    > unlocks audio), then drag your left thumb anywhere on the left
    > half of the screen for a virtual joystick (forward / strafe),
    > drag your right thumb to look, and press the red dot at the
    > bottom-right to fire. …
    No other README edits.

## Out of Scope

- Haptics (`navigator.vibrate`). Explicitly opted out for this task —
  defer.
- Settings UI / sensitivity slider. Auto-tune (AC #10) is the entire
  sensitivity story. **Do not** add a panel.
- Pitch / vertical look. Same constraint as the prior task — the
  renderer assumes a fixed horizon. **Do not** add a pitch axis.
- Gyro / device-orientation look. Defer.
- Tutorial overlay beyond the one-shot "TAP TO BEGIN" panel. The
  joystick anchor-on-touch and the visible fire button are
  self-explanatory after the first try.
- Re-tuning combat constants (`FIRE_COOLDOWN_MS`, `MAX_AMMO`, damage,
  enemy AI, etc.).
- Re-tuning desktop controls (mouse sensitivity, keyboard rotation
  speed, FOV, etc.). Desktop input is unchanged.
- Re-styling the minimap, FPS counter, lighting toggle indicator,
  level banner, or damage arrow / edges. The strip text size change
  (AC #6) is the only HUD-area visual change.
- Adding new icons / glyphs / SVGs. The mute strikethrough (AC #5) is
  drawn with a `lineTo` path — that's the only "icon" added.
- PWA install, service worker, manifest. Same as prior task.
- Orientation lock. Same as prior task — letterbox both orientations.
- Refactoring `drawTouchHUD()` into smaller helpers beyond the
  `roundRect` helper (AC #2). Keep the function as one body so
  changes are easy to review against the prior task's spec.

## Design Notes

- **Why immediate press-state instead of animated.** A 60–120 ms
  press-down animation looks nice in mockups but on touch it feels
  *delayed* — the user wants instant confirmation that the tap
  registered. Snappy press, snappy release. The fade is reserved for
  the joystick (AC #4) where the slow-in / slow-out reads as
  "appearing under your thumb" rather than as input lag.

- **Why a 120 ms joystick fade specifically.** Faster (60 ms) feels
  glitchy and brings back the "pop" feel; slower (200+ ms) feels
  laggy and you start to see the joystick base lingering after lift.
  120 ms is the sweet spot from mobile-shooter convention. Input is
  gated on `active && !fading`, so the fade-out doesn't keep moving
  the player — it's purely a draw-side smoothing.

- **Why mute strikethrough, not a swap to a different glyph.** The
  HUD palette is text-only (12-px monospace). Adding a speaker icon
  would require either a sprite sheet (forbidden by single-file rule)
  or a hand-drawn glyph. A 1-px diagonal line through the existing
  'M' label is unambiguous, draws in two `lineTo` calls, and reads
  correctly on both platforms (desktop sees no change because the M
  button isn't drawn there).

- **Why scale only the HUD strip, not the whole HUD.** The minimap,
  FPS counter, lighting indicator, and level banner all sit at the
  top of the framebuffer where there's plenty of headroom for tiny
  text on a phone. The bottom HUD strip is the one area with
  high-density readouts (HP / AMMO / LEVEL / KILLS) that you actually
  glance at mid-combat. Scaling just the strip is the minimal
  intervention.

- **Why `HUD_STRIP_H = 22` not 24.** 22 = 18 + 4, so the readouts
  shift down by 4 px and the strip background grows by 4. Anything
  larger pushes into the centre of the screen and starts obscuring
  the world during firefights. 22 px is ~16% of the framebuffer
  height — on the edge of acceptable.

- **Why one-shot tap-to-begin instead of always-on prompt.**
  Once the user knows to tap to start, the prompt becomes noise. A
  per-session one-shot (gated on `audioStarted`) shows it exactly
  when needed: the very first interaction. It does **not** persist
  across page reloads (no `localStorage` allowed, and we wouldn't
  want to anyway — first-run UX should always show the hint).

- **Why crosshair outline applies to desktop too.** The crosshair is
  hard to see against bright walls on desktop too — the 1-px black
  outline is a clean readability win on both platforms. It is the
  one intentional desktop pixel diff in this task and the only
  exception to "desktop is byte-identical".

- **Why auto-tune sensitivity once on first RAF, not on canvas
  resize.** Recomputing on resize means a user who rotates from
  landscape → portrait → landscape would get three different
  sensitivities mid-session. That feels worse than picking once and
  sticking with it. The first-RAF defer is needed because
  `canvas.clientWidth` may be 0 during initial IIFE execution.

- **Why no settings UI.** Building an in-game settings panel
  (touch-friendly slider, persistence, layout, dismissal) is at
  least as large as this entire task on its own. If the auto-tune
  range `[0.6, 2.0]` doesn't cover real devices, the follow-up is a
  separate `mobile-settings-panel` spec, not a tacked-on slider.

- **Symbols added (state at top of IIFE, near
  `index.html:265-278`):**
  ```js
  const utilPressed = { N: 0, L: 0, M: 0, RESET: 0 };
  let audioStarted = false;
  let touchLookScale = 1;
  // joyVec gets two new fields: shownAtMs, hiddenAtMs, fading.
  ```

- **Symbols added (functions / helpers):**
  - `roundRect(x, y, w, h, r)` — 4-corner rounded path builder, called
    inside `drawTouchHUD()` for utility row + RESET. ~10 lines.
  - No new top-level functions — all changes integrate into existing
    `onTouchStart` / `onTouchMove` / `onTouchEnd` / `drawTouchHUD` /
    `drawHUD` / `render`.

- **Where edits land in `index.html`:**
  - `<style>`: no changes (rounded-rect HUD is canvas-side).
  - State block (`index.html:265-278`): add `utilPressed`,
    `audioStarted`, `touchLookScale`. Extend `joyVec` literal with
    `shownAtMs: 0, hiddenAtMs: 0, fading: false`.
  - `onTouchStart` (`index.html:374+`): set `audioStarted = true`
    after `ensureAudio()`; set `joyVec.shownAtMs` on joy-touch start;
    extend util / RESET branches to set `utilPressed[label] = nowMs`
    and stash `'util:' + label` as the role.
  - `onTouchMove` (`index.html:457+`): apply `* touchLookScale` to
    the look-delta accumulation.
  - `onTouchEnd` (`index.html:470+`): if role starts with `'util:'`,
    parse and clear `utilPressed[label]`; on joy end, set
    `joyVec.hiddenAtMs = nowMs` and `joyVec.fading = true` (do not
    clear `active` immediately).
  - `update()` joystick block (`index.html:381-392` area): change
    gate to `joyVec.active && !joyVec.fading`.
  - Crosshair (`index.html:1885-1890`): add 1-px black outline first.
  - `drawHUD` (`index.html:2133-2171`): introduce `HUD_FONT_PX` and
    `HUD_STRIP_H` locals, replace the four hard-coded 12 / 18 / -14
    constants accordingly.
  - `drawTouchHUD` (`index.html:2051-2104`): use `roundRect` for
    util / RESET, add fade-alpha math for joystick, add mute
    strikethrough, swap palette colours per AC #2, use `utilPressed`
    for press-state visuals.
  - Death overlay text (`index.html:1957-1966`): branch on
    `isTouchDevice`.
  - Tap-to-begin overlay: append at the very end of `render()` after
    the death overlay.
  - Sensitivity auto-tune RAF defer: anywhere in the IIFE after
    `canvas` is defined and before the main `requestAnimationFrame`
    loop registration.
  - README mobile paragraph: prepend "**tap the screen once to
    start**" clause.

- **Hot-path discipline.** All new visual code is gated on
  `isTouchDevice` or `nowMs`-based timestamps. Desktop frame cost
  delta is two extra `fillRect`s for the crosshair outline + ~3
  boolean branches — call it < 1 µs.

- **Test in DevTools first.** Same as the prior task. Chrome
  DevTools mobile emulation with **Touch: forced** reproduces
  `'ontouchstart' in window === true` and dispatches real touch
  events. Verify the tap-to-begin overlay shows, joystick fades in
  smoothly, mute strikethrough toggles, HUD strip is visibly larger,
  death prompt swaps text, and the crosshair has a halo on bright
  walls.

## Agent Notes

- **Read first:** `AGENTS.md`, `CLAUDE.md`, this task spec, the prior
  `specs/tasks/mobile-touch-controls.md` (for the existing touch
  contract you must preserve), then in `index.html`:
  - lines 1-50 (`<head>`, `<style>`, `<canvas>`, `.hint` div).
  - lines 265-490 (input state + touch handlers + util-button
    hit-test + listener registration).
  - lines 530-570 (`update()` rotation + mouseDx consumption).
  - lines 575-605 (`update()` move-vector composition + joystick
    contribution gate).
  - lines 1880-1970 (`render()` flow — `putImageData`, crosshair,
    HUD overlays, death overlay).
  - lines 2051-2105 (`drawTouchHUD` — primary surface for AC #2-#5).
  - lines 2133-2171 (`drawHUD` — primary surface for AC #6).
  All edits stay inside the assigned worktree only.

- **Order of work (recommended):**
  1. Crosshair outline (AC #9). Reload desktop → halo visible. One
     of the lowest-risk changes; do it first to warm up.
  2. HUD strip scaling (AC #6). Reload desktop → byte-identical;
     reload mobile emulation → strip is taller, font larger.
  3. Rounded buttons + new palette (AC #2). Reload mobile emulation
     → util row + RESET have rounded corners and slightly higher
     contrast.
  4. Press-state feedback (AC #3). Tap each util button → visible
     press flash that releases on lift.
  5. Mute strikethrough (AC #5). Tap M → strikethrough on. Tap again
     → off.
  6. Joystick fade (AC #4). Touch left half → joystick eases in over
     ~120 ms. Lift → eases out. Player movement starts/stops with
     touch, not with the fade.
  7. Tap-to-begin overlay + `audioStarted` flag (AC #8). Reload
     mobile emulation → overlay appears. First tap → overlay
     dismisses, audio unlocks (verify by firing — should hear gunshot
     on the very first hold).
  8. Death prompt swap (AC #7). Walk into enemies until dead on
     mobile → prompt reads "tap RESET". Reload desktop, die → prompt
     reads "press R" (unchanged).
  9. Look sensitivity auto-tune (AC #10). Test in mobile emulation
     at multiple viewport widths (320, 414, 768, 1024) — look feel
     should be roughly consistent across them.
  10. README touch-up (AC #17).
  11. `node --check` against the extracted `<script>` body:
      ```
      grep -oP '(?s)(?<=<script>).*?(?=</script>)' index.html > /tmp/script.js
      node --check /tmp/script.js
      ```
  12. Smoke test in DevTools mobile emulation, then on a real phone
      if available.

- **Common pitfalls:**
  - **Joystick fade-out keeps moving the player.** If you forget to
    gate `update()`'s joystick contribution on `!joyVec.fading`, the
    fade window (~120 ms) silently keeps applying the last `(jx, jy)`
    to the move vector. Always gate input on
    `active && !fading`, draw on `active` (with fade-alpha).
  - **Fade-out reads stale `joyVec.x / y` and explodes the move
    vector.** Zero `joyVec.x / y` when the touch ends, *before* the
    fade-out begins. (The `active && !fading` gate also catches it,
    but defensive zeroing is cheap.)
  - **`utilPressed` not cleared on `touchcancel`.** `touchcancel` is
    routed to the same `onTouchEnd` handler today (per
    `index.html:259-260`) — verify your role-parsing branch handles
    both.
  - **`audioStarted` set in the wrong place.** Set it immediately
    after `ensureAudio()` at the top of `onTouchStart`, not at the
    bottom — that way even if the rest of the handler errors out,
    the overlay dismisses and audio starts on the next frame.
  - **HUD strip changes break desktop pixel-identity.** When
    `isTouchDevice === false`, every constant (`HUD_FONT_PX = 12`,
    `HUD_STRIP_H = 18`, text Y at `H - HUD_STRIP_H + 4 = H - 14`)
    must evaluate to today's hard-coded values. Verify with a
    side-by-side desktop screenshot.
  - **Crosshair outline drawn after the cross, not before.** The
    outline is the larger black rect; it must draw *first* so the
    coloured cross sits on top. Reverse order = no outline visible.
  - **`touchLookScale` stays at `1` forever because RAF defer
    didn't fire.** If the IIFE schedules its main loop with
    `requestAnimationFrame(loop)`, the auto-tune RAF will fire on
    the same tick — that's fine. Just don't put the auto-tune inside
    a `DOMContentLoaded` listener; the IIFE already runs after
    `<canvas>` is parsed.
  - **Tap-to-begin overlay drawn before death overlay.** It must
    draw *after* the death overlay (and after `drawTouchHUD`) so it
    sits on top of everything. The first-touch dismiss makes this
    moot in practice (the overlay only shows pre-first-touch, when
    the player can't be dead yet), but the layering matters if any
    future code shows a death state pre-input.

- **Smoke test before reporting:**

  *Desktop (must be byte-identical to today, except crosshair):*
  - Reload in Chrome / Firefox. Click canvas → pointer locks.
    WASD walks, mouse looks, click fires, Space fires, N regens, L
    toggles lighting, M mutes, R resets after death. `.hint` div
    visible. FPS counter correct. HUD strip identical (font 12,
    strip 18). Death prompt reads "press R to restart". Crosshair
    has a 1-px black halo (only intentional desktop diff). No new
    console errors.

  *Mobile emulation (Chrome DevTools, mobile mode, Touch: forced):*
  - Reload. `.hint` hidden. Tap-to-begin overlay visible centered.
  - Tap anywhere → overlay dismisses, audio unlocks (next fire
    plays sound on the first frame, not the second).
  - Touch left half → joystick fades in over ~120 ms, base + thumb
    visible at touch point. Drag → thumb tracks, clamped to
    `JOY_RADIUS`. Player moves immediately (not waiting on fade).
    Lift → joystick fades out over ~120 ms; player stops
    immediately on lift.
  - Touch right half → look responds smoothly. Auto-tuned
    sensitivity feels comfortable at the emulator's viewport
    width. Try a few different emulator presets (iPhone SE,
    iPhone 12 Pro, Pixel 5, iPad).
  - Hold fire button → button flashes pressed-red, gun fires once
    per `FIRE_COOLDOWN_MS`. Release → press visual clears
    immediately.
  - Tap N / L / M utility buttons → each flashes pressed-state
    while finger is down, releases on lift. Tap M → strikethrough
    appears. Tap M → strikethrough clears.
  - HUD strip text (HP / AMMO / LEVEL / KILLS) is visibly larger
    than desktop (font 14, strip 22). Position adjusted (HP bar
    sits 2 px above strip).
  - Walk into enemies until dead. Death overlay reads "tap RESET
    to restart". Util row hides, RESET button appears. Tap RESET
    → run resets, util row returns, joystick / look / fire all
    work.
  - Joystick + look + fire concurrent: walk forward + look left +
    hold fire → all three work (multi-touch path unchanged).
  - Rotate emulator portrait ↔ landscape → game letterboxes both
    ways; touch HUD remains tappable. Look sensitivity stays the
    same (auto-tune is one-shot, doesn't recompute on resize).
  - Console: zero errors, zero warnings.

  *Real device (if available):*
  - Same flow on iPhone Safari and Android Chrome. Verify the
    crosshair halo is visible against bright walls, the HUD strip
    is comfortably readable, and the tap-to-begin overlay reads
    correctly at the device's actual pixel density.

- **At minimum** run `node --check` against the extracted
  `<script>` body before reporting:
  ```
  grep -oP '(?s)(?<=<script>).*?(?=</script>)' index.html > /tmp/script.js
  node --check /tmp/script.js
  ```

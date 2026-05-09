---
id: mobile-touch-overlay
area: frontend
priority: 50
depends_on: []
description: Move the move-joystick to an HTML/CSS overlay so it's always circular and pinned bottom-left, replace held-fire-button with tap-anywhere-fires, allow drag-to-look anywhere on the canvas, and bump touch look sensitivity ~3× to a Minecraft-Bedrock-like feel.
---

# Mobile Touch Overlay

## Goal

Three concrete changes to the touch-only input layer. Desktop input is
byte-identical to today.

1. **Joystick is a fixed-position, perfectly circular DOM overlay.**
   Today the joystick is canvas-drawn and anchor-on-touch (lands wherever
   the first left-half finger touches), and because the canvas
   framebuffer (480×270) is stretched to `100vw × 100vh` the
   `ctx.arc(...)` ring renders as a non-uniform ellipse on any viewport
   that isn't 16:9. The fix is to render the joystick base + thumb as
   `<div>`s in a fixed `position: fixed` overlay that sits over the
   canvas. CSS keeps the shape circular (`border-radius: 50%`) and the
   position stable (bottom-left, safe-area-inset aware) at all viewport
   ratios.

2. **Tap anywhere fires; drag anywhere looks.** Today firing is a
   dedicated bottom-right red circular button (hold-to-fire) and look
   is right-half-only drag. New model: a touchstart on the canvas (i.e.
   not on the joystick overlay, not on a util button) is a "potential
   tap"; if it ends within `TAP_MAX_MS` and never moves more than
   `TAP_MAX_DIST_FB` framebuffer-px, fire one shot via `fireShot()`. If
   it moves past the threshold, it becomes a look-drag and accumulates
   into the existing `mouseDx` accumulator (no fire on lift). Holding
   without moving does nothing (no autofire). The dedicated fire button
   is removed.

3. **Touch look sensitivity ~3×.** Add a constant `TOUCH_LOOK_MULT = 3`
   applied multiplicatively where touch deltas accumulate into
   `mouseDx`. Target feel: a horizontal sweep across the full canvas
   width rotates the camera roughly 270° (today: roughly 100°). The
   existing aim-assist sticky-slowdown still applies via
   `aimAssistScale()`, which becomes more important at the higher base
   sensitivity for fine aim near enemies.

The functional contract everywhere else stays:
`isTouchDevice` one-shot at startup, `touch-action: none` on the
canvas, viewport meta unchanged, `requestPointerLock` skipped on touch,
audio unlock on first touch, util-row N/L/M behavior + RESET-on-death
unchanged, multi-touch dispatch + 3-finger cap unchanged in spirit
(joystick + one look-or-tap concurrent — see AC #11), aim assist
unchanged, HUD strip / minimap / FPS / crosshair / muzzle flash / damage
edges / tap-to-begin overlay / death overlay all unchanged.

## Acceptance Criteria

1. **Single-file constraint preserved.** Still one `index.html` at the
   repo root, no build step, no external assets, no network requests,
   no `localStorage`, no images, no SVGs, no external CSS. The DOM
   joystick is a small block of inline HTML inside the existing
   `<body>` and a small block of inline CSS inside the existing
   `<style>`. README receives a one-paragraph edit (AC #18).

2. **DOM joystick markup.** Add inside `<body>`, immediately after the
   existing `<canvas id="c" …>` element (`index.html:50`) and before
   the existing `.hint` div (`index.html:51`-ish):
   ```html
   <div id="touch-joy" aria-hidden="true">
     <div id="touch-joy-thumb"></div>
   </div>
   ```
   `aria-hidden` because this is a visual / pointer-only affordance and
   should not be announced to screen readers; the keyboard / mouse path
   continues to work for non-touch users.

3. **DOM joystick CSS.** Add to the existing `<style>` block. The
   joystick is hidden by default (desktop) and shown via the
   `@media (pointer: coarse)` rule that already hides `.hint`. Use
   safe-area insets so notched phones don't clip it. Sizes in CSS
   pixels (so the shape is independent of the canvas framebuffer
   stretch).
   ```css
   #touch-joy {
     display: none;
     position: fixed;
     left: calc(20px + env(safe-area-inset-left, 0px));
     bottom: calc(20px + env(safe-area-inset-bottom, 0px));
     width: 110px;
     height: 110px;
     border-radius: 50%;
     border: 1px solid rgba(255, 255, 255, 0.35);
     background: rgba(255, 255, 255, 0.08);
     touch-action: none;
     -webkit-tap-highlight-color: transparent;
     user-select: none;
     -webkit-user-select: none;
     z-index: 10;
     box-sizing: border-box;
   }
   #touch-joy-thumb {
     position: absolute;
     left: 50%;
     top: 50%;
     width: 44px;
     height: 44px;
     margin-left: -22px;
     margin-top: -22px;
     border-radius: 50%;
     background: rgba(255, 255, 255, 0.45);
     pointer-events: none;
     transform: translate(0, 0);
     transition: none;
   }
   @media (pointer: coarse) {
     .hint { display: none; }
     #touch-joy { display: block; }
   }
   ```
   The base (`#touch-joy`) accepts touches; the thumb
   (`#touch-joy-thumb`) does not (`pointer-events: none`) so the touch
   target is the whole base, regardless of where the thumb has drifted.
   The thumb's offset is driven by JS via `transform: translate(...)`.

   The base is hidden while the player is dead — see AC #11.

4. **Joystick state simplified.** Replace the existing `joyVec` literal
   (the one with `ax / ay / fading / shownAtMs / hiddenAtMs / id`,
   currently around `index.html:332-339`) with:
   ```js
   const joyVec = { active: false, x: 0, y: 0 };
   ```
   The new `joyVec.x / y` are still in `[-1, 1]^2` with a circular
   clamp (`hypot(x, y) <= 1`) and the same `JOY_DEADZONE = 0.15`
   semantics. `JOY_RADIUS` is no longer used in framebuffer-px math —
   use a CSS-px constant `JOY_RADIUS_CSS = 55` (= half of the base's
   110-px CSS width) for the touch-clamp math inside the joystick
   handler. `JOY_RADIUS` and `JOY_DEADZONE` constants stay defined
   (other code may reference `JOY_DEADZONE`); `JOY_RADIUS` becomes
   unused after this task — remove it.

   Remove: `joyVec.ax`, `joyVec.ay`, `joyVec.fading`,
   `joyVec.shownAtMs`, `joyVec.hiddenAtMs`, `joyVec.id`. Also remove
   the entire fade-alpha branch in `drawTouchHUD()` and the persistent
   faint-base draw block at the top of `drawTouchHUD()` (both replaced
   by the always-visible DOM base). The player-alive gate moves to a
   `display` toggle on the DOM element (AC #11).

5. **Joystick handlers (DOM).** Bind directly to `#touch-joy`. The
   handler dispatches by `identifier` like the canvas handlers and
   handles a single concurrent joystick touch.
   ```js
   const joyEl    = document.getElementById('touch-joy');
   const joyThumb = document.getElementById('touch-joy-thumb');
   const JOY_RADIUS_CSS = 55;
   let joyTouchId = -1;

   function joyAnchorCss() {
     const r = joyEl.getBoundingClientRect();
     return { x: r.left + r.width  / 2, y: r.top + r.height / 2 };
   }

   function onJoyStart(e) {
     ensureAudio();
     audioStarted = true;
     e.preventDefault();
     if (joyTouchId !== -1) return;     // already tracking
     const t = e.changedTouches[0];
     joyTouchId = t.identifier;
     joyVec.active = true;
     joyVec.x = 0;
     joyVec.y = 0;
     joyThumb.style.transform = 'translate(0px, 0px)';
   }

   function onJoyMove(e) {
     e.preventDefault();
     if (joyTouchId === -1) return;
     for (let i = 0; i < e.changedTouches.length; i++) {
       const t = e.changedTouches[i];
       if (t.identifier !== joyTouchId) continue;
       const a = joyAnchorCss();
       let dx = t.clientX - a.x;
       let dy = t.clientY - a.y;
       const len = Math.hypot(dx, dy);
       const clamped = Math.min(1, len / JOY_RADIUS_CSS);
       const nx = (len > 0) ? (dx / len) * clamped : 0;
       const ny = (len > 0) ? (dy / len) * clamped : 0;
       joyVec.x = (clamped < JOY_DEADZONE) ? 0 : nx;
       joyVec.y = (clamped < JOY_DEADZONE) ? 0 : ny;
       const tx = nx * JOY_RADIUS_CSS;
       const ty = ny * JOY_RADIUS_CSS;
       joyThumb.style.transform = 'translate(' + tx.toFixed(1) + 'px, ' + ty.toFixed(1) + 'px)';
       break;
     }
   }

   function onJoyEnd(e) {
     e.preventDefault();
     for (let i = 0; i < e.changedTouches.length; i++) {
       const t = e.changedTouches[i];
       if (t.identifier !== joyTouchId) continue;
       joyTouchId = -1;
       joyVec.active = false;
       joyVec.x = 0;
       joyVec.y = 0;
       joyThumb.style.transform = 'translate(0px, 0px)';
       break;
     }
   }

   if (isTouchDevice) {
     joyEl.addEventListener('touchstart',  onJoyStart, { passive: false });
     joyEl.addEventListener('touchmove',   onJoyMove,  { passive: false });
     joyEl.addEventListener('touchend',    onJoyEnd,   { passive: false });
     joyEl.addEventListener('touchcancel', onJoyEnd,   { passive: false });
   }
   ```
   The element-scoped listeners receive `touchmove` and `touchend` for
   the original target throughout the touch's lifetime per the W3C
   touch-events spec (implicit pointer capture), so the finger may drag
   off the base without losing the joystick — desired joystick UX.

   Movement composition in `update()` (currently around
   `index.html:698-701`) loses the `!joyVec.fading` term:
   ```js
   if (isTouchDevice && joyVec.active) {
     mvX += player.dirX * (-joyVec.y) + player.planeX * joyVec.x;
     mvY += player.dirY * (-joyVec.y) + player.planeY * joyVec.x;
   }
   ```
   Everything else in the move-vector composition / normalize stays.

6. **Remove the dedicated fire button.** Delete:
   - `pointInFireBtn(...)` helper.
   - The fire-button branch in `onTouchStart` (the `if (pointInFireBtn(fb.x, fb.y)) { ... }` block).
   - The fire-button rendering block in `drawTouchHUD()` (the
     `ctx.arc(W - 36, H - 36, FIRE_BTN_R, ...)` + fill + stroke).
   - `FIRE_BTN_R` constant (no longer referenced).
   - `fireTouch` state object (`{ active, id }`).
   - `firePressed` module-level let.
   - The `if (firePressed) fireShot();` line in `update()` (currently
     around `index.html:736`).
   - The `else if (role === 'fire' && fireTouch.id === t.identifier) { … }`
     branch in `onTouchEnd`.

   Held-fire is gone. Tap-anywhere fires once per tap (AC #7); rapid
   taps on the canvas re-fire each gated by the existing
   `FIRE_COOLDOWN_MS = 250` inside `fireShot()`. The cooldown self-
   regulates to ~4 shots/sec just like desktop click-spam — same as
   today's held-fire effective rate.

7. **Tap anywhere on the canvas fires.** New constants near the touch
   constants block:
   ```js
   const TAP_MAX_MS       = 250;   // touch ends faster than this → tap
   const TAP_MAX_DIST_FB  = 4;     // total move ≤ 4 fb-px → still a tap
   ```
   In `onTouchStart` for any canvas touch that is *not* a util button
   tap (the existing util branch stays edge-triggered and `continue`s
   — unchanged), assign role `'tap'` and stash:
   ```js
   touches.set(t.identifier, 'tap');
   tapTouch = {
     id: t.identifier,
     startMs: nowMs,
     startX: fb.x,
     startY: fb.y,
     totalDist: 0,
   };
   ```
   `tapTouch` is a single-slot module-scope object (a 2nd concurrent
   tap-or-look touch is silently ignored — see AC #11). Replace the
   existing `lookTouch` object's role with this `tapTouch` object — they
   are the same touch, just renamed for clarity (it may either become
   a tap on lift or a look-drag mid-touch). Migrate the
   `lastX / lastY` fields onto `tapTouch` so the look-drag math (AC #8)
   has them.

   In `onTouchEnd`, when `role === 'tap'` (or `'look'` — same touch,
   see AC #8) **and** `tapTouch.totalDist <= TAP_MAX_DIST_FB` **and**
   `nowMs - tapTouch.startMs <= TAP_MAX_MS`: call `fireShot()` exactly
   once. Otherwise (drag or held-still), do not fire. Always clear
   `tapTouch.id = -1` and remove the touch from the `touches` map.

   `fireShot()` already gates on ammo / cooldown / death — no
   additional gating needed.

8. **Drag anywhere on the canvas looks.** In `onTouchMove`, for the
   `tapTouch.id` touch:
   ```js
   const dx = fb.x - tapTouch.lastX;
   const dy = fb.y - tapTouch.lastY;
   tapTouch.totalDist += Math.hypot(dx, dy);
   mouseDx += dx * touchLookScale * TOUCH_LOOK_MULT;
   tapTouch.lastX = fb.x;
   tapTouch.lastY = fb.y;
   ```
   The look math is unchanged from today except for the
   `* TOUCH_LOOK_MULT` factor (AC #9) and the role rename. Vertical
   delta is still ignored (no pitch axis). The accumulated `totalDist`
   is what disqualifies the touch from being a tap on lift (AC #7).

   The role transition from `'tap'` to `'look'` is purely informational
   for `onTouchEnd`'s decision — you can keep one role string `'tap'`
   throughout and decide tap-vs-drag at `onTouchEnd` purely from
   `totalDist` and elapsed time, which is simpler. Use that one-role
   approach.

9. **Touch look sensitivity ~3×.** Add a module-scope constant near the
   existing touch constants:
   ```js
   const TOUCH_LOOK_MULT = 3;   // ~3× today's effective sensitivity
   ```
   Apply at the single look-accumulation site in `onTouchMove` (AC #8).
   Do **not** modify `mouseSens`, the `touchLookScale` auto-tune, or
   the desktop pointer-locked mouse-look path — those continue to work
   exactly as today for desktop and the per-canvas-width auto-tune
   stays as the secondary scale factor.

   Target feel: a horizontal drag across the full canvas CSS width
   rotates the camera roughly 270° (today: ~100° with `touchLookScale`
   at the typical landscape clamp). If smoke-testing finds 3× too hot
   on a real phone, drop `TOUCH_LOOK_MULT` to `2.5` or `2.0` — values
   in `[2.0, 3.5]` are acceptable. Tune by feel, not by math.

10. **Util-row + RESET + tap-to-begin all stay canvas-rendered and
    behave exactly as today.** No changes to:
    - `utilButtonAt(...)`, `utilPressed`, the N / L / M handlers in
      `onTouchStart`, the `utilPressed[label] = 0` clear in
      `onTouchEnd`, the `roundRect` helper, the rendering of the util
      row in `drawTouchHUD()`, the mute strikethrough.
    - `pointInResetBtn(...)`, the RESET branch in `onTouchStart`, the
      RESET rendering in `drawTouchHUD()` (under `player.hp <= 0`).
    - The tap-to-begin overlay block at the end of `render()` and the
      `audioStarted` flag (already set at the top of `onTouchStart`).
    - The `audioStarted` set inside the new `onJoyStart` (AC #5) — first
      touch on the joystick also unlocks audio and dismisses the
      overlay; that's intentional, the user might tap the joystick
      first.

    The util row's hit-test still operates in framebuffer coords on
    the canvas. Util-row touches that start in the util rect never
    enter the tap/look path because the existing `if (util) { ...
    continue; }` branch in `onTouchStart` is unchanged and runs first.

11. **Joystick base hidden while dead.** Add a one-line update in
    `update()` (or in `render()` — pick a place that runs every frame
    after `player.hp` may have changed) to keep the DOM element's
    visibility in sync with the alive state:
    ```js
    if (isTouchDevice) {
      const joyDisplay = (player.hp <= 0) ? 'none' : 'block';
      if (joyEl.style.display !== joyDisplay) joyEl.style.display = joyDisplay;
    }
    ```
    Avoids touching `style.display` every frame. When dead, the canvas
    RESET button is the only touch affordance; on RESET tap,
    `resetRun()` restores `player.hp` and the next frame re-shows the
    joystick. The `@media (pointer: coarse)` rule sets the *initial*
    display; this JS re-toggles based on alive state.

12. **Multi-touch.** Concurrent touches accepted:
    - One joystick touch (DOM-routed; identifier tracked in
      `joyTouchId`).
    - One canvas tap-or-look touch (identifier tracked in
      `tapTouch.id`).
    - Util-row taps are edge-triggered and don't count against the
      concurrent slot count (a util tap completes within one
      `touchstart` and doesn't hold a slot).

    The earlier 3-finger limit (`if (touches.size >= 3) break;`) in
    the canvas `onTouchStart` becomes a 2-finger effective limit on
    the canvas + 1 on the joystick. Keep the `if (touches.size >= 2)
    break;` guard in canvas `onTouchStart` to silently ignore extra
    canvas touches — replace the `>= 3` with `>= 2`. Joystick is
    DOM-routed and not in the `touches` map.

    A 2nd canvas tap-or-look while one is active is ignored (matches
    the existing `if (!lookTouch.active) { ... }` gate, just renamed
    to `if (tapTouch.id === -1) { ... }`).

13. **Touch listeners on canvas.** Keep the existing four listeners
    (`touchstart` / `touchmove` / `touchend` / `touchcancel`) on the
    canvas with `passive: false`. The handler bodies change per AC #6
    / #7 / #8 / #12 but the registration is unchanged. The DOM
    joystick has its own four listeners on `#touch-joy` (AC #5).

14. **Aim assist unchanged.** `aimAssistScale()` still applies in
    `update()` immediately before `rot += mouseDx * mouseSens`:
    ```js
    if ((pointerLocked || isTouchDevice) && mouseDx !== 0) {
      if (isTouchDevice) mouseDx *= aimAssistScale();
      rot += mouseDx * mouseSens;
    }
    mouseDx = 0;
    ```
    Constants (`AIM_ASSIST_ANGLE_RAD`, `AIM_ASSIST_MIN_SCALE`,
    `AIM_ASSIST_MAX_DIST`) and the function body are unchanged. With
    the higher base sensitivity from `TOUCH_LOOK_MULT`, the existing
    0.45 floor will feel a bit stronger in practice — this is
    intentional and acceptable. Do **not** retune the assist constants
    in this task.

15. **No regressions to desktop.** Keyboard movement, mouse-look,
    pointer-lock click-to-grab, click-to-fire, Space-to-fire, N / L /
    M keyboard handlers, R-on-death, FPS counter, minimap, atmosphere
    lighting toggle, level transitions, audio, AI, dungeon
    regeneration, sprite z-buffer occlusion, contact damage, kill
    pops, damage arrow, damage edges, level banner, crosshair, gun
    viewmodel, HUD strip — every existing behavior is identical on
    desktop. Specifically:
    - The DOM `#touch-joy` element exists in the DOM but is hidden by
      the default `display: none` until `@media (pointer: coarse)`
      flips it. On a desktop, that media query never matches and the
      element is invisible and inert.
    - `drawTouchHUD()` still early-returns on `!isTouchDevice`. The
      removed fire-button + persistent-ring + fade blocks shrink it,
      but desktop pays the same one-branch cost.
    - **First-frame pixels on desktop are byte-identical to today.**
      No intentional desktop visual diff in this task. Verify by
      side-by-side screenshot of the first rendered frame before and
      after.

16. **No regressions to touch input mechanics that aren't being
    explicitly changed.**
    - Util-row N / L / M: edge-triggered tap, press visual flash,
      mute strikethrough — all preserved.
    - RESET on death: position, size, colour, behaviour — all
      preserved.
    - `audioStarted` flag + tap-to-begin overlay — preserved (the flag
      is now set on the *earlier* of canvas `touchstart` or joystick
      `touchstart`).
    - Aim assist — preserved (AC #14).
    - Multi-touch dispatch — preserved in spirit (joystick + tap-or-
      look; util taps still edge-triggered).
    - `touch-action: none` on the canvas, `touch-action: none` on the
      joystick element — page never scrolls / pinches / pulls-to-
      refresh on either.
    - Pointer lock skipped on touch — unchanged.
    - Audio unlock on first touch — unchanged.
    - HUD tier (narrow / medium) — unchanged.

17. **Determinism preserved.** No `Math.random()` introduced. All new
    behaviour is a pure function of touch events and `nowMs` /
    `player` state. First rendered frame on desktop: byte-identical
    to today. First rendered frame on touch: same canvas pixels as
    today minus the persistent faint joystick ring + dedicated fire
    button (now both gone) — DOM joystick is layered over the canvas
    and is visible from the very first frame on touch.

18. **README touch-up.** Replace the existing mobile paragraph in
    `README.md` (the one in the Controls section, added by the
    `mobile-touch-controls` task and updated by `mobile-touch-polish`
    + `mobile-mc-feel`). New paragraph (one paragraph, no new table):
    > On phones and tablets, **tap the screen once to start** (this
    > unlocks audio). Use the on-screen joystick in the bottom-left
    > corner to move (forward / strafe). **Tap anywhere on the screen
    > to fire**, or **drag anywhere on the screen to look around** —
    > both gestures use the same finger. Tap the small N / L / M
    > buttons just below the minimap to regenerate / toggle lighting /
    > mute. Look rotation slows automatically when your crosshair is
    > near a visible enemy. Pointer lock is not used on touch devices.
    No other README edits.

19. **Performance.** Net per-frame cost on desktop is unchanged
    (DOM joystick is hidden, listeners are bound but never fire).
    Touch frame cost: one inline-style write to `joyEl.style.display`
    only when alive-state flips (cheap). Joystick handlers run only
    while a finger is on the joystick — typically 0–1 events per
    frame. Look accumulation is one extra multiplication per
    `touchmove`. Aim for ≥ 30 FPS on a mid-range mobile (iPhone 11 /
    equivalent Android), as before.

20. **No new console errors or warnings.** A 60-second smoke session
    on touch — tap-to-start, joystick around the dungeon, tap-fire
    rapidly, drag-look 360°, drag-look + simultaneous joystick, tap
    N / L / M, walk into enemies until dead, tap RESET, rotate to
    portrait then back — produces zero console errors and zero
    warnings. Also verify via `node --check` against the extracted
    `<script>` body, as in prior tasks:
    ```
    grep -oP '(?s)(?<=<script>).*?(?=</script>)' index.html > /tmp/script.js
    node --check /tmp/script.js
    ```

## Out of Scope

- Adding a settings UI / sensitivity slider. The user explicitly chose
  the fixed `TOUCH_LOOK_MULT = 3` route; `mobile-settings-panel`
  remains the future home for runtime tuning.
- Re-tuning aim-assist (`AIM_ASSIST_ANGLE_RAD`, `AIM_ASSIST_MIN_SCALE`,
  `AIM_ASSIST_MAX_DIST`). Defer follow-up if the higher base
  sensitivity makes fine aim too hard.
- Pitch / vertical look — same constraint as prior tasks. Don't add
  a pitch axis.
- Gyro / device-orientation look. Defer.
- Haptics (`navigator.vibrate`). Defer.
- Re-tuning combat constants (`FIRE_COOLDOWN_MS`, `MAX_AMMO`, damage,
  enemy AI, `SHOT_DAMAGE`, `ENEMY_RADIUS`, etc.).
- Re-tuning desktop input (`mouseSens`, keyboard rotation speed, FOV,
  pointer-lock click-to-grab).
- Moving the util row, RESET button, tap-to-begin overlay, minimap,
  FPS counter, lighting toggle indicator, level banner, damage arrow
  / edges, kill pops, gun viewmodel, muzzle flash, HUD strip
  alignment.
- Adding new icons / glyphs / SVGs / sprite sheets. The DOM joystick
  is two divs styled with `border-radius: 50%` — that's the only new
  visual.
- Letterboxing the canvas to a fixed 16:9 ratio. The user picked the
  HTML/CSS overlay route specifically to avoid touching the canvas
  CSS sizing.
- Compensating for canvas stretch in framebuffer coordinates (drawing
  ellipses that become circles on screen). Same reason — the DOM
  overlay is the chosen approach.
- Restoring a held-fire affordance (e.g., a "hold to autofire" toggle
  reachable by long-press on the canvas). Tap-anywhere is the entire
  fire story for this task.
- Multi-finger fire (e.g., two thumbs each tap-firing). The canvas
  tap-or-look slot is single (AC #12). Two simultaneous fires would
  exceed the cooldown anyway; deferring is the right call.
- Customising the joystick size, position, or colour. The fixed
  bottom-left position with the CSS values in AC #3 is the contract.
- PWA install, service worker, manifest, orientation lock — same as
  prior tasks.

## Design Notes

- **Why DOM overlay for the joystick (not letterbox, not framebuffer
  compensation).** Letterbox forces black bars on every non-16:9 phone
  (i.e. every modern phone) and is a substantial visual change to
  every existing rendered frame. Framebuffer compensation requires per-
  frame measurement of the canvas's CSS aspect ratio and conversion of
  every circular HUD element to a stretched ellipse — fragile, and on
  very tall portrait viewports the compensated ellipse becomes
  uncomfortably flat in framebuffer space (you lose precision on the
  short axis). DOM overlay is the only option that gives a guaranteed-
  circular shape at every viewport ratio without touching the canvas
  framebuffer at all. It also opens the door to using real CSS pixel
  sizes (110-px base, 44-px thumb) which line up with Apple HIG / Material
  guidance — sizing the joystick in framebuffer-px today gave you
  whatever the canvas's CSS-to-fb ratio happened to be on each phone.

- **Why fixed-position instead of anchor-on-touch.** The user's
  request was explicit: "stable in terms of position". Anchor-on-touch
  gives flexibility but the user has decided learnability / muscle
  memory beats flexibility for this game. A fixed-position joystick
  also makes the DOM overlay simpler — one element with a fixed
  bounding rect to compute the anchor against.

- **Why bottom-left at `(20px, 20px-from-bottom)` with safe-area
  inset.** Mirrors the framebuffer position used by the persistent
  hint ring (`(60, H-60)`) but in CSS pixels for guaranteed circular
  shape. 20-px margin from the corners is comfortable for thumbs in
  landscape, the safe-area inset prevents the notch / home-bar from
  clipping it, and the 110-px base diameter exceeds the 44-pt Apple
  HIG threshold by a healthy margin.

- **Why `JOY_RADIUS_CSS = 55` (= half of 110-px base).** Touch math
  clamps the finger offset from anchor to the visual base — when the
  thumb visually reaches the rim, the input is saturated at `len = 1`.
  Anything larger would let the finger drag outside the visible base
  and still drive the joystick (confusing); anything smaller would
  saturate before the finger reaches the rim (also confusing). Using
  the visual radius is the cleanest mental model.

- **Why tap = single shot, not touchstart-fires-immediately.** The
  user explicitly chose this option. Compared to fire-on-touchstart,
  this design avoids accidental shots when the user puts their finger
  down to start a look-drag. The trade-off is a small latency between
  the finger-down and the shot (the duration up to `TAP_MAX_MS = 250
  ms` plus until-touchend), but in practice the user's tap rhythm is
  fast enough that they don't perceive it. Hold-to-autofire is gone —
  if the player wants to rapid-fire they tap repeatedly. The cooldown
  rate of one shot per 250 ms naturally caps repeat-tap rate.

- **Why `TAP_MAX_DIST_FB = 4` and `TAP_MAX_MS = 250`.** Both are
  forgiving enough that an intentional tap (which is rarely
  perfectly still) reliably registers as a tap, and small enough
  that an intentional drag (which is fast and crosses many pixels)
  reliably registers as a drag. 4 fb-px is roughly 7 CSS-px on a
  typical landscape phone — well below the iOS-default
  `recognizes-tap` threshold (~10 CSS-px). 250 ms matches the
  existing `FIRE_COOLDOWN_MS` so the user can't tap-fire faster than
  the cooldown anyway.

- **Why `TOUCH_LOOK_MULT = 3` is multiplicative on `touchLookScale`.**
  `touchLookScale` already scales for canvas-CSS-width-vs-fb-width
  variation (so iPhone-mini and iPad-Pro feel comparable). The
  `TOUCH_LOOK_MULT` is a separate intentional sensitivity knob —
  multiplicative composition gives "Minecraft-Bedrock-style fast
  panning" on every device that already had the auto-tune working.
  Adding it to `mouseSens` directly would also bump desktop, which
  we don't want.

- **Why aim assist becomes more important.** At 3× sensitivity, the
  thumb-arc-per-degree is small; small thumb tremors translate to
  visible crosshair jitter. The existing `aimAssistScale()`
  sticky-slowdown (0.45 floor when crosshair is angularly near a
  visible enemy) effectively dampens that jitter when it matters
  most — during enemy engagement. We're not retuning the assist
  here because the existing constants were set with mid-distance
  combat in mind, and they still produce a reasonable engagement
  feel at the higher base sensitivity. If smoke-testing shows
  fine-aim is too jittery, the follow-up is to lower
  `AIM_ASSIST_MIN_SCALE` from 0.45 to ~0.30 — that's a one-constant
  change in a follow-up spec.

- **Why hide the joystick (not the entire DOM overlay) on death.**
  The joystick's only purpose is to drive movement; on death, movement
  is frozen, so the joystick is meaningless. The util-row + RESET
  affordances are canvas-rendered today (and the spec keeps that), so
  there's no DOM overlay to hide other than the joystick. One
  `display: none` flip is simpler than rebuilding the whole touch HUD
  in DOM just to hide it together.

- **Why keep util-row + RESET + tap-to-begin canvas-rendered.** The
  user's distortion concern is specifically about the circular
  joystick shape. Util-row buttons are rectangles — modest stretch
  doesn't read as broken. RESET is a single rectangle. Tap-to-begin
  is a darken + a centred rectangle + text. None of those reads as
  visually wrong on a stretched canvas, and moving them to DOM would
  drift them out of alignment with their hit zones (which are in
  framebuffer coords today). Mixing DOM (joystick) and canvas (rest)
  is pragmatic — the alternative is a much larger refactor.

- **Symbols added (state at top of IIFE):**
  ```js
  // joyVec is reduced to { active, x, y } — see AC #4
  let joyTouchId = -1;
  const JOY_RADIUS_CSS  = 55;
  const TAP_MAX_MS      = 250;
  const TAP_MAX_DIST_FB = 4;
  const TOUCH_LOOK_MULT = 3;
  // tapTouch replaces lookTouch — see AC #7
  const tapTouch = { id: -1, startMs: 0, startX: 0, startY: 0, lastX: 0, lastY: 0, totalDist: 0 };
  // joyEl, joyThumb DOM refs
  const joyEl    = document.getElementById('touch-joy');
  const joyThumb = document.getElementById('touch-joy-thumb');
  ```

- **Symbols removed:**
  - `pointInFireBtn`, `FIRE_BTN_R`, `fireTouch`, `firePressed`, the
    fire-button branches in the canvas touch handlers, the fire-button
    rendering in `drawTouchHUD()`, the per-frame `if (firePressed) fireShot();`.
  - `joyVec.ax`, `.ay`, `.fading`, `.shownAtMs`, `.hiddenAtMs`,
    `.id`, the joystick fade-alpha block in `drawTouchHUD()`, the
    persistent faint-base draw block in `drawTouchHUD()`,
    `JOY_RADIUS` constant.
  - `lookTouch` (renamed and repurposed as `tapTouch`).

- **Where edits land in `index.html`:**
  - `<body>` after `<canvas id="c">`: insert the two-element joystick
    markup (AC #2).
  - `<style>` block (`index.html:6-40`): add the
    `#touch-joy / #touch-joy-thumb / @media (pointer: coarse)` rules
    (AC #3); the existing `.hint { display: none }` rule inside the
    media query stays.
  - State block (`index.html:265-345`-ish): replace `joyVec` literal,
    add new constants + DOM refs + `tapTouch` + `joyTouchId`, remove
    `fireTouch / firePressed / FIRE_BTN_R / lookTouch / JOY_RADIUS`.
  - `pointInFireBtn` (`index.html:424-428`): delete.
  - DOM joystick handlers + listener registration (AC #5): just before
    or just after the canvas-touch listener registration block.
  - `onTouchStart` (canvas, `index.html:446-514`): rewrite the
    fire-button + joystick + look branches per AC #7; util-row branch
    unchanged.
  - `onTouchMove` (canvas, `index.html:516-551`): replace the
    `'joy'` and `'look'` branches with the single `'tap'` branch per
    AC #8.
  - `onTouchEnd` (canvas, `index.html:553-580`): drop the `'joy'` /
    `'fire'` branches; rewrite `'look'` → `'tap'` branch with
    fire-on-lift logic per AC #7.
  - `update()` joystick contribution (`index.html:698-701`): drop the
    `!joyVec.fading` clause.
  - `update()` held-fire dispatch (`index.html:736`): delete the
    `if (firePressed) fireShot();` line.
  - `drawTouchHUD()` (`index.html:2825-2925`): delete the persistent-
    ring block, the fade-alpha block, and the fire-button block.
    Util-row + RESET + mute strikethrough rendering blocks are
    unchanged.
  - DOM joystick visibility toggle (AC #11): one block in `update()`
    (or `render()`).
  - README mobile paragraph: rewrite per AC #18.

- **Hot-path discipline.** All new state is module-scope so no
  per-frame allocations. The joystick handler's `joyAnchorCss()` calls
  `getBoundingClientRect()` which is cheap and only invoked on
  `touchmove` events — typically tens of times per second when the
  joystick is in use, never otherwise. The `display` flip in AC #11
  reads `joyEl.style.display` and only writes when the value actually
  changed.

- **Test in DevTools first.** Same workflow as prior tasks — Chrome
  DevTools mobile emulation with **Touch: forced**. Verify the DOM
  joystick is a clean circle at iPhone SE (375 × 667), iPhone 12 Pro
  (390 × 844), Pixel 5 (393 × 851), iPad (768 × 1024), and a desktop
  emulator that has touch (e.g., a generic tablet preset).

## Agent Notes

- **Read first:** `AGENTS.md`, `CLAUDE.md`, this task spec, the prior
  `specs/tasks/mobile-touch-controls.md`,
  `specs/tasks/mobile-touch-polish.md`, and
  `specs/tasks/mobile-mc-feel.md` (for the existing touch contract you
  must preserve), then in `index.html`:
  - lines 1-50 (`<head>`, `<style>`, `<canvas>`, `.hint` div).
  - lines 265-345 (input state + touch constants + state objects).
  - lines 414-444 (`touchToFramebuffer`, `pointInRect`, `pointInFireBtn`,
    `pointInResetBtn`, `utilButtonAt`).
  - lines 446-587 (touch handlers + listener registration).
  - lines 670-740 (`update()` rotation + joystick + held-fire blocks).
  - lines 2825-2925 (`drawTouchHUD` — primary surface).
  - the death overlay + tap-to-begin block at the end of `render()`.
  All edits stay inside the assigned worktree only.

- **Order of work (recommended):**
  1. Add the DOM joystick markup + CSS (AC #2 / #3). Reload desktop →
     element exists in the DOM but is `display: none`; no visual diff.
     Reload in DevTools mobile emulation → faint circular joystick
     visible bottom-left, perfectly circular at all viewport ratios.
  2. Add the new state (`joyVec` reduced, `joyTouchId`, `JOY_RADIUS_CSS`,
     `TAP_MAX_*`, `TOUCH_LOOK_MULT`, `tapTouch`) and remove the obsolete
     state (`FIRE_BTN_R`, `fireTouch`, `firePressed`, old `joyVec`
     fields, `lookTouch`, `JOY_RADIUS`). `node --check` should pass.
  3. Implement the DOM joystick handlers (AC #5) + listener
     registration. In DevTools mobile, dragging on the joystick should
     visually move the thumb and `joyVec.x / y` (verify by dropping a
     temporary console.log in `update()`).
  4. Update the canvas-touch handlers per AC #6 / #7 / #8 / #12 — drop
     the fire button + joystick branches, rename look→tap, accumulate
     `tapTouch.totalDist`, fire on lift if it qualified as a tap.
  5. Update `update()`: drop `!joyVec.fading` from the joystick gate,
     delete `if (firePressed) fireShot();`, add the `joyEl.style.display`
     toggle (AC #11).
  6. Apply the `* TOUCH_LOOK_MULT` factor at the look-accumulation site
     (AC #9).
  7. Strip `drawTouchHUD()` of the now-removed blocks (persistent
     joystick ring, fade alpha, fire button); util / RESET / mute
     strikethrough stay.
  8. README update (AC #18).
  9. `node --check` against the extracted `<script>` body.
  10. Smoke test in DevTools mobile emulation, then on a real phone if
      available. Check for: circular joystick at all viewport ratios,
      tap fires + drag looks + hold does nothing, ~3× faster look,
      joystick still works concurrent with tap-fire, util / RESET /
      tap-to-begin all behave as before, desktop byte-identical.

- **Common pitfalls:**
  - **Tap-vs-drag threshold too tight.** If `TAP_MAX_DIST_FB` is `1`
    or `2`, every intentional tap on a slightly-shaky thumb registers
    as a drag and never fires. `4` is forgiving without bleeding into
    drag territory. Don't tune below 3.
  - **Forgetting `e.preventDefault()` on the joystick touch handlers.**
    Without it, the page may scroll / pinch under the joystick
    element, especially on iOS. `passive: false` is required *and* you
    must call `preventDefault`.
  - **`getBoundingClientRect()` returning stale coords mid-frame.**
    Browsers update the rect on layout changes; for a `position: fixed`
    element the rect is stable per frame. The handler reads the rect
    every `touchmove` to handle orientation changes mid-touch — that's
    the safe path. Don't cache it across the touch.
  - **Fire-on-lift counted while dead.** `fireShot()` early-returns on
    `player.hp <= 0`, so calling it during the death freeze is a
    no-op. No extra guard needed at the call site, but verify by dying
    mid-tap.
  - **Joystick base hidden but `joyVec.active` still true.** When
    `player.hp` flips to `≤ 0`, the joystick element is hidden but a
    finger may still be on it. The joystick handlers' touch event
    will continue firing for that finger (implicit pointer capture).
    The `update()` death early-return prevents movement, but defensively
    clear `joyVec.active` and `joyVec.x / y` when the player dies. Add
    a one-liner at the top of `update()`'s death-early-return area.
  - **Rendering the joystick "below" the canvas.** Make sure the
    `#touch-joy` z-index is above the canvas. The canvas is in normal
    document flow with no `z-index`; `z-index: 10` on `#touch-joy`
    keeps it on top. Verify by visually checking the joystick is
    visible over the rendered world, not behind it.
  - **Removing `FIRE_BTN_R` while the constant is still referenced
    somewhere subtle.** Grep for `FIRE_BTN_R` after the edit; should
    be zero matches.
  - **Removing `lookTouch` references in stale code paths.** Grep for
    `lookTouch` after the edit; should be zero matches.
  - **Mixing CSS-px and fb-px in tap-distance math.** `tapTouch.totalDist`
    accumulates from `touchToFramebuffer(t)` deltas (fb-px) → compare
    to `TAP_MAX_DIST_FB` (also fb-px). Don't accidentally feed
    `clientX/Y` deltas (CSS-px) into the same accumulator.

- **Smoke test before reporting:**

  *Desktop (must be byte-identical to today, no exceptions):*
  - Reload in Chrome / Firefox. Click canvas → pointer locks. WASD
    walks, mouse looks, click fires, Space fires, N regens, L toggles
    lighting, M mutes, R resets after death. `.hint` div visible. FPS
    counter correct. HUD strip identical. Crosshair has the 1-px
    halo from prior tasks. Death prompt reads "press R to restart".
    No `#touch-joy` visible. No console errors / warnings.

  *Mobile emulation (Chrome DevTools, mobile mode, Touch: forced):*
  - Reload at iPhone 12 Pro (~390 CSS-px wide). `.hint` hidden.
    Tap-to-begin overlay visible centred. DOM joystick visible
    bottom-left as a clean circle.
  - Tap anywhere → tap-to-begin dismisses, audio unlocks, gun fires
    on the very first tap (sound plays).
  - Hold a finger on the joystick and drag → thumb tracks the finger
    inside the base radius, player moves in the dragged direction.
    Lift → thumb recenters, player stops.
  - Tap anywhere on the canvas (not joystick, not util) → fires one
    shot. Repeat-tapping fires at ~4 shots/sec (cooldown-limited).
  - Drag a finger across the canvas (anywhere not on joystick / util) →
    camera turns. Speed is noticeably faster than today (full canvas
    sweep ≈ 270°). Lift → no extra shot fired.
  - Hold a finger still on the canvas (no movement, > 250 ms) → lift →
    no shot fires. (Important: held-still is not a tap.)
  - Joystick + tap: walk forward with left thumb on joystick + tap with
    right thumb to fire → both work concurrently.
  - Joystick + drag-look: walk forward + drag right thumb across canvas
    → both work.
  - Tap N / L / M (util row) → each flashes pressed; N regenerates
    dungeon, L toggles lighting, M mutes / unmutes (with strikethrough).
    Tapping a util button does **not** also fire (util branch returns
    early).
  - Walk into enemies until dead → death overlay shows "tap RESET to
    restart"; util row hides; RESET button appears centred; **DOM
    joystick is hidden**. Tap RESET → run resets, joystick reappears.
  - Aim-assist sticky-slowdown still kicks in when sweeping the
    crosshair past a visible enemy at the new higher base
    sensitivity. (Slow drag past a nearby enemy → look noticeably
    stickies.)
  - Rotate emulator portrait ↔ landscape → joystick stays clean
    circular at the bottom-left in both. Look sensitivity is
    consistent (no mid-session retune).
  - Test at iPhone SE (375 wide), iPhone 12 Pro (390), iPad (768) —
    joystick is circular at every preset.
  - Console: zero errors, zero warnings.

  *Real device (if available):*
  - Same flow on iPhone Safari and Android Chrome. Verify the
    joystick is a clean circle (not an ellipse), tap-fire is
    responsive (no perceptible delay between tap-end and gunshot
    sound), drag-look feels Minecraft-fast but controllable near
    enemies thanks to aim assist, and held-still does nothing.

- **At minimum** run `node --check` against the extracted `<script>`
  body before reporting:
  ```
  grep -oP '(?s)(?<=<script>).*?(?=</script>)' index.html > /tmp/script.js
  node --check /tmp/script.js
  ```

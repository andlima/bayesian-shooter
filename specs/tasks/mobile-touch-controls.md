---
id: mobile-touch-controls
area: frontend
priority: 50
depends_on: []
description: Make the game playable on phones — viewport meta, touch detection, virtual joystick (move), drag-to-look, hold-to-fire button, small N/L/M/R utility row. Desktop kbd/mouse path is untouched.
---

# Mobile Touch Controls

## Goal

Today the game is unplayable on a phone. There is no keyboard, the canvas
relies on `requestPointerLock` + `mousemove` for look (pointer lock is
broken or absent on iOS Safari and most mobile browsers), and any touch
in the page triggers browser scroll / pinch-zoom / pull-to-refresh
because nothing calls `preventDefault` on touch events.

Add a touch-input layer that:

- Detects touch devices at startup (single check; not toggled mid-session).
- On touch devices, draws a small touch HUD (virtual joystick anchor, fire
  button, utility-row buttons) and binds `touchstart` / `touchmove` /
  `touchend` / `touchcancel` listeners.
- Routes joystick output into the same `mvX`/`mvY` move-vector composition
  the keyboard already drives, and routes look-drag deltas into the same
  `mouseDx` accumulator the mouse already drives — so `update()` and
  `fireShot()` need no behavior change, just an additional input source.
- Suppresses `requestPointerLock` on touch devices.
- Adds a viewport `<meta>` and a small CSS block so the canvas doesn't
  pinch-zoom, doesn't pull-to-refresh, and respects safe-area insets on
  notched phones.

Desktop keyboard + mouse continues to work exactly as it does today. A
hybrid touch-laptop user gets touch *in addition to* the desktop path —
both input sources read into the same state.

## Acceptance Criteria

1. **Single-file constraint preserved.** Still one `index.html` at the repo
   root, no build step, no external assets, no network requests, no
   `localStorage`. All touch HUD pixels are drawn at runtime by the
   existing `ctx.fillRect` / `ctx.fillText` HUD pattern (see
   `index.html:1686-1731`). No new files added under `specs/` other than
   this one. No images, no SVGs, no external CSS.

2. **Touch device detection is a one-shot at startup.** Add a constant
   near the top of the IIFE (next to the `keys` / `pointerLocked` block
   around `index.html:248-251`):
   ```js
   const isTouchDevice =
     ('ontouchstart' in window) ||
     (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
   ```
   `isTouchDevice` is read-only after this point. All touch-only
   behavior — listener registration, HUD draw, pointer-lock suppression
   — gates on this flag. **Do not** flip it based on actual touch events
   at runtime; the result must be deterministic so a desktop user with no
   touch input never sees the HUD even if a hover event fires on the
   canvas.

3. **Viewport + CSS for mobile browsers.** In the `<head>`, add:
   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
   ```
   (Place immediately after the existing `<meta charset>` at
   `index.html:4`.) In the `<style>` block (`index.html:6-40`):
   - On `html, body`: add `overscroll-behavior: none;` to suppress
     pull-to-refresh.
   - On `canvas`: add `touch-action: none;` to suppress browser
     scroll / pinch / double-tap-zoom on the canvas.
   - On `canvas`: add `-webkit-tap-highlight-color: transparent;` so iOS
     doesn't flash a grey overlay on each touch.
   - Existing rules (`width: 100vw`, `height: 100vh`,
     `image-rendering: pixelated`, etc.) stay verbatim.
   The existing `.hint` div stays, but on touch devices it is hidden via
   a `@media (pointer: coarse)` rule:
   ```css
   @media (pointer: coarse) {
     .hint { display: none; }
   }
   ```

4. **Pointer lock is not requested on touch devices.** The
   `canvas.addEventListener('click', …)` block at `index.html:291-296`
   currently calls `canvas.requestPointerLock()`. Wrap the lock call in
   `if (!isTouchDevice) { … }` so a tap on a hybrid touch-laptop's canvas
   does not pop a "this site is requesting pointer lock" prompt. The
   `mousedown` handler at `index.html:298-304` stays as-is — `pointerLocked`
   will simply remain `false` on touch devices and the early-return
   already there (`if (!pointerLocked) return;`) prevents desktop-mouse
   fire-on-tap. Mobile firing comes from the touch fire button (AC #7),
   not from a synthesized mouse click.

5. **Coordinate mapping helper.** Touch event coordinates arrive in CSS
   pixels relative to the viewport, but the HUD lives in framebuffer
   coordinates (`W = 480`, `H = 270`). Add a single helper near the
   touch-state block:
   ```js
   function touchToFramebuffer(t) {
     const r = canvas.getBoundingClientRect();
     return {
       x: ((t.clientX - r.left) / r.width)  * W,
       y: ((t.clientY - r.top)  / r.height) * H,
     };
   }
   ```
   All hit-testing and joystick math operate in framebuffer space so the
   HUD scales 1:1 with the canvas regardless of screen size or letterbox.
   The helper is allocated-per-call (one tiny object) — fine, touches are
   rare.

6. **Virtual joystick (left thumb).** Anchor-on-touch in the **left half**
   of the framebuffer (`x < W / 2`) — the joystick base center appears
   wherever the first left-half touch lands, not at a fixed position. On
   `touchmove`, the thumb tracks the finger but is clamped to a maximum
   radius `JOY_RADIUS = 40` framebuffer-px from the anchor. On
   `touchend` / `touchcancel`, the joystick clears.

   Output: a normalized `(jx, jy)` vector in `[-1, 1]^2`,
   `jLen = min(1, hypot(touchX-anchorX, touchY-anchorY) / JOY_RADIUS)`,
   with the *direction* of `(touchX-anchorX, touchY-anchorY)`. A small
   dead zone (`JOY_DEADZONE = 0.15`) zeroes the vector when `jLen` falls
   below it, so a resting thumb does not crawl forward.

   Mapping into the move composition in `update()` (`index.html:381-392`):
   ```js
   if (isTouchDevice && joyVec.active) {
     // jy < 0 (finger above anchor) = forward; jx > 0 = strafe right.
     mvX += player.dirX   * (-joyVec.y) + player.planeX * joyVec.x;
     mvY += player.dirY   * (-joyVec.y) + player.planeY * joyVec.x;
   }
   ```
   Add this block *after* the existing keyboard `if (keys[…]) { mvX += … }`
   chain, *before* the `mvLen = Math.hypot(mvX, mvY)` normalize. The
   normalize already clamps the magnitude, so a player on a touch laptop
   pressing W *and* pushing the joystick still moves at exactly
   `moveSpeed`. **Do not** scale `moveSpeed` separately for touch — the
   normalize is enough.

7. **Fire button (lower right, hold-to-fire).** A single circular button
   in the bottom-right corner of the framebuffer:
   - Center: `(W - 36, H - 36)` framebuffer-px (i.e. 36 px in from each
     edge).
   - Radius: `FIRE_BTN_R = 28` framebuffer-px.
   Hit-test on `touchstart`: if the touch is within `FIRE_BTN_R` of the
   center, mark this touch as the "fire touch" (track its `identifier`)
   and set `firePressed = true`. While `firePressed` is true, call
   `fireShot()` once per frame from `update()` (placed at the very end of
   `update()`, after `applyContactDamage` and the level-exit check). The
   existing `FIRE_COOLDOWN_MS = 250` (`index.html:53`) naturally throttles
   to ~4 shots/sec — do not add a second cooldown here. On `touchend` /
   `touchcancel` for the fire-touch identifier, clear `firePressed`. If
   the finger drags off the button while held, **keep firing** — the
   identifier-based tracking means we don't lose the press just because
   the finger moved a few pixels (this matches the joystick semantics and
   how every mobile shooter works).

8. **Look drag (right-half, anywhere not on a button).** Any touch whose
   `touchstart` lands in the **right half** (`x >= W / 2`) AND **not**
   inside the fire button's hit circle AND **not** inside any utility
   button (AC #9) becomes the "look touch". Track its `identifier` and
   `lastX` / `lastY`. On `touchmove`:
   ```js
   const fb = touchToFramebuffer(t);
   const dx = fb.x - lookTouch.lastX;
   mouseDx += dx * LOOK_SENS_TOUCH_TO_MOUSE;
   lookTouch.lastX = fb.x;
   lookTouch.lastY = fb.y;
   ```
   `LOOK_SENS_TOUCH_TO_MOUSE = (canvas.clientWidth || W) / W` is the
   wrong shape — touch deltas were already converted to framebuffer
   pixels, but the existing `mouseSens = 0.0022 rad/px` was tuned for
   *mouse-movement-event pixels at desktop scale* (which are roughly
   browser CSS pixels). On a touch device the canvas is ~360–800 CSS px
   wide while `W = 480`, so a one-framebuffer-pixel touch move is roughly
   one CSS pixel. **Use `mouseSens` directly** with the framebuffer-pixel
   delta — at typical phone widths the result feels close to native. If
   it ends up too sensitive in smoke testing, scale the touch delta by a
   constant `TOUCH_LOOK_SCALE = 1.5` (acceptable range `[1.0..2.5]`); add
   the constant to the gun-constants block area (`index.html:72-83`) only
   if needed. Tune by feel during the smoke test, not before.

   `mouseDx` is consumed and zeroed in `update()` already
   (`index.html:366-369`); the existing path applies `mouseSens` and
   rotates the camera. **Do not** add a second sensitivity path. Look
   only acts on horizontal drag — vertical look is not supported in this
   game (no pitch axis), matching the desktop mouse path.

9. **Utility-button row (top-left, small).** A row of three labeled
   buttons in the top-left, below the FPS counter (which sits at
   `(2, 2)` to `(66, 18)` per `index.html:1709-1715`). Place at
   `y = 22`, with each button `BTN_W = 22` × `BTN_H = 18`, `2 px` gap:
   - `[N]` at `x = 2`  → calls `regenerateDungeon()` on tap.
   - `[L]` at `x = 26` → toggles `lightingEnabled` (set
     `lightingToggledAtMs = nowMs` so the existing fade-in indicator at
     `index.html:1718-1725` triggers, just like the keyboard path).
   - `[M]` at `x = 50` → toggles `muted` and applies the same
     `masterGain.gain.value = muted ? 0 : MASTER_VOL` line as the
     keyboard path (`index.html:272-275`).

   When `player.hp <= 0`, **replace** the row with a single larger
   `[RESET]` button centered horizontally (`(W/2 - 40, H/2 + 32)`,
   `80 × 24`) that calls `resetRun()`. The keyboard `R` path
   (`index.html:266-268`) is unchanged. Keep N/L/M hidden during death
   to mirror the keyboard contract (only `R` and `M` are responsive then;
   on mobile, only the `RESET` button is exposed during death — `M` can
   wait until reset).

   Hit-test is edge-triggered on `touchstart` only — a tap inside any
   utility-button rectangle calls its handler exactly once per finger-down
   and does **not** become a look or joystick touch. Drag-off after press
   does nothing (no held semantics for utility buttons).

10. **Touch HUD render.** Draw the touch HUD using `ctx.fillRect` /
    `ctx.fillText` calls, placed **after** `drawHUD()` at
    `index.html:1727` and **before** `drawDamageArrow()` at
    `index.html:1731` — i.e. on top of the HUD strip but below the
    damage arrow / death overlay / level banner. Single new function
    `drawTouchHUD()`:
    - **Joystick**, only when `joyVec.active`: faint outlined circle at
      the anchor (radius `JOY_RADIUS`, stroke
      `rgba(255,255,255,0.25)`), filled circle at the thumb position
      (radius 12, fill `rgba(255,255,255,0.35)`).
      Use `ctx.beginPath` + `ctx.arc` + `ctx.stroke` / `ctx.fill`
      (the canvas-2d path that the crosshair/HUD already uses).
    - **Fire button**: outlined circle at `(W-36, H-36)` radius
      `FIRE_BTN_R`. Stroke `rgba(255,255,255,0.35)`, fill
      `rgba(255,80,80,0.25)` when `firePressed`, else
      `rgba(255,255,255,0.10)`. No label (the position + color reads
      unambiguously as "shoot").
    - **Utility row**: when alive, three rectangles
      `rgba(0,0,0,0.45)` background, `rgba(255,255,255,0.55)` border
      (1 px), with `12px monospace` text 'N' / 'L' / 'M' centered.
      When dead, the single RESET rectangle in the same style with
      'RESET' text.
    - **Early return** when `!isTouchDevice`. Zero per-frame cost on
      desktop.

    The render-pass order is: world → vignette → gun viewmodel →
    `putImageData` → crosshair → muzzle flash overlay → damage edges →
    kill pops → minimap → FPS → lighting toggle indicator → HUD →
    **touch HUD (new)** → damage arrow → death overlay → level banner.
    The touch HUD must NOT sit under the death overlay's full-screen
    dim (so the RESET button is visible) — verify by checking the death
    overlay code (look for "YOU DIED" or similar near the bottom of
    `render()`); if necessary, reorder so touch HUD draws *after* the
    death overlay too. Either ordering is acceptable as long as the
    RESET button is legible and tappable.

11. **Touch listeners.** Register four listeners on the canvas (not
    window — keeps page-level scrolling unaffected if the canvas is
    ever embedded), gated on `isTouchDevice`:
    ```js
    if (isTouchDevice) {
      canvas.addEventListener('touchstart',  onTouchStart,  { passive: false });
      canvas.addEventListener('touchmove',   onTouchMove,   { passive: false });
      canvas.addEventListener('touchend',    onTouchEnd,    { passive: false });
      canvas.addEventListener('touchcancel', onTouchEnd,    { passive: false });
    }
    ```
    `passive: false` is required so each handler can call
    `e.preventDefault()` to suppress default touch behaviors (scroll,
    long-press menu). Each handler iterates `e.changedTouches` and
    dispatches per-touch by `identifier`. Each handler calls
    `ensureAudio()` once at the top so audio unlocks on first touch
    (mirroring the keyboard / mouse `ensureAudio()` calls at
    `index.html:259, 299`).

    **Multi-touch is required.** Joystick + look + fire can be
    simultaneous — three concurrent touches must work. Track active
    touches in a small map keyed by `identifier`:
    ```js
    const touches = new Map();  // id -> {role: 'joy'|'look'|'fire'|'util', …}
    ```
    Roles are assigned at `touchstart` time and fixed for the life of
    the touch. A 4th simultaneous touch is silently ignored.

12. **`update()` integration.** Add the touch joystick contribution
    (AC #6) and the held-fire call (AC #7) to `update()`. The held-fire
    call must early-return when `player.hp <= 0` (the existing death
    early-return at `index.html:348-358` already covers this — the
    held-fire goes inside `update()` after `applyContactDamage(dt)` so
    it never reaches a dead player). Do **not** edit `fireShot()` itself
    — it already enforces ammo + cooldown + audio (`index.html:1408+`).

13. **Death-state behavior.**
    - Joystick / look / fire touches are accepted by listeners but have
      no effect (the existing `update()` death-return drains `mouseDx`
      and skips movement; `firePressed` calls `fireShot()` which is
      cooldown-and-ammo-gated; both are no-ops or harmless).
    - Visually, touch HUD swaps to RESET-only as in AC #9.
    - On RESET tap, `resetRun()` runs the same path as the keyboard `R`.

14. **Letterbox / portrait.** No orientation lock. The `100vw / 100vh`
    canvas + `image-rendering: pixelated` already letterboxes the
    `480 × 270` framebuffer correctly in either orientation. The touch
    HUD lives in framebuffer coordinates and scales with the canvas, so
    it remains tappable in portrait (smaller, but still ≥ ~30 CSS-px on
    a typical 360-wide phone — within Apple/Material 44/48 px guidance
    when scaled, since framebuffer-32 px ≈ 24 CSS-px on a 360-wide
    portrait *but* much bigger in landscape). Smoke-test both
    orientations; if portrait buttons are uncomfortably small, the
    follow-up is "force landscape", not retuning HUD scale here.

15. **Determinism preserved.** No `Math.random()` introduced anywhere.
    The touch HUD draws are pure stroke / fill calls with constant
    color values. The first rendered frame on a *desktop* (where
    `isTouchDevice` is false) is byte-identical to today's first frame —
    nothing in the world / framebuffer pipeline changes for desktop
    users. (Mobile first-frame-determinism is not part of the contract,
    since the touch HUD's joystick anchor depends on touch input and
    the joystick is correctly invisible until first touch anyway.)

16. **No regressions to desktop.** Keyboard movement, mouse-look,
    pointer-lock click-to-grab, click-to-fire, Space-to-fire, N / L / M
    keyboard handlers, R-on-death, the FPS counter, the HUD, the
    crosshair, the muzzle flash overlays, the gun viewmodel, the
    minimap, atmosphere lighting toggle, level transitions, audio,
    AI, dungeon regeneration, sprite z-buffer occlusion, contact
    damage, kill pops, damage arrow, damage edges, level banner —
    every existing behavior is identical on desktop. The only desktop
    diffs are: viewport meta tag in `<head>`, three new CSS
    declarations on `html/body/canvas`, a `@media (pointer: coarse)`
    block hiding `.hint`, and the `if (!isTouchDevice)` wrapper on the
    pointer-lock request (which fires on the same `click` path
    desktop already uses — desktop has `isTouchDevice === false` and
    the wrapper is transparent).

17. **Performance.** Touch HUD adds at most ~10 `ctx.fillRect` /
    `ctx.fillText` calls per frame (joystick base + thumb + fire +
    three util buttons + their text labels), all on a 480×270 canvas —
    negligible. Aim for ≥ 30 FPS on a mid-range mobile (e.g. iPhone 11
    or equivalent Android). On desktop, `drawTouchHUD()` returns
    immediately, so cost is ~one branch per frame. **Do not** allocate
    inside the touch listeners' hot path beyond the
    `touchToFramebuffer` helper's small object; the touches map and
    `joyVec` / `lookTouch` / `firePressed` state are reused.

18. **No new console errors or warnings.** A 60-second mobile session
    covering: tap-to-start (audio unlock), joystick around the dungeon,
    drag-look 360°, hold fire through a full magazine, dry-fire,
    tap-fire-while-look-dragging, tap N to regen, tap L to toggle
    lighting, tap M to mute / unmute, take damage to death, tap RESET,
    rotate phone to portrait then back to landscape — all clean. Test
    on a real device or in DevTools mobile-emulation mode (with
    `Touch: forced` enabled).

19. **README touch-up.** Add a short paragraph to `README.md` (after
    the existing **Controls** table at lines 32-52) describing the
    touch controls. Keep it concise — one paragraph, no new table:
    "On phones and tablets, drag your left thumb anywhere on the left
    half of the screen for a virtual joystick (forward / strafe), drag
    your right thumb to look, and press the red dot at the bottom-right
    to fire. Tap the small N / L / M buttons in the top-left to
    regenerate / toggle lighting / mute. Pointer lock is not used on
    touch devices, so there is no initial click-to-lock step." Update
    the existing "Click the canvas once to grab pointer lock"
    paragraph at lines 27-29 to start with "On desktop, …" so the
    contrast with mobile is clear. Do **not** rewrite the rest of the
    README — only these two paragraphs change.

20. **`index.html` `.hint` text.** The existing `<div class="hint">`
    text at line 44 is desktop-specific. Leave it as-is (it's hidden
    on touch devices via the new `@media (pointer: coarse)` rule per
    AC #3). No new mobile hint div is needed — the touch HUD's visible
    buttons are self-documenting.

## Out of Scope

- Pitch / vertical look. The game has no pitch axis; touch look is
  horizontal-only, matching the desktop mouse path. **Do not** add a
  pitch axis to support touch.
- Gyro / device-orientation look. Cool but adds permission prompts
  and per-device calibration. Defer.
- Haptics (`navigator.vibrate`). Not needed for the MVP touch feel;
  defer.
- Gamepad API. Out of scope — the user asked specifically about
  phones, not controllers.
- Screen-orientation API lock or fullscreen request. Letterbox both
  orientations per AC #14. If portrait turns out unplayable, that is
  a follow-up spec.
- PWA install (`manifest.json`, service worker). Game still has to run
  from `file://` per the original architecture; PWA installability is
  a separate, substantial spec.
- Touch HUD theming, button icons, or graphic flourishes. Plain
  rect / circle / text in the existing HUD palette is sufficient.
- Tutorial overlay or first-time-touch hint. The HUD is small, the
  fire button is unambiguous, the joystick anchor-on-touch is
  self-explanatory after one try.
- Re-tuning desktop input (mouse sens, keyboard speed, etc.). The
  desktop path is unchanged. **Do not** fold desktop-feel changes into
  this task.
- Re-tuning combat constants (`FIRE_COOLDOWN_MS`, `MAX_AMMO`,
  damage, etc.). Held-fire on touch uses the existing cooldown — the
  resulting ~4 shots/sec is identical to desktop click-spam.
- Changes to AI, dungeon generation, sprite renderer, atmosphere
  lighting, gun viewmodel, audio synthesis, minimap, or any other
  unrelated subsystem.
- Detection logic that flips between touch and desktop at runtime.
  `isTouchDevice` is a one-shot at startup per AC #2.

## Design Notes

- **Why anchor-on-touch instead of fixed joystick.** A fixed joystick
  forces the user to hunt for it without looking down. Anchor-on-touch
  is the standard for mobile shooters (PUBG, COD Mobile, Call of Duty
  Mobile) and removes the need to render a "resting" joystick when
  no finger is down — saving HUD clutter and matching what touch-FPS
  players already expect.

- **Why hit-test in framebuffer space.** The HUD is drawn in
  framebuffer coordinates and scales with the canvas via CSS. If we
  hit-tested in CSS pixels, the touch zones and the visible buttons
  could drift apart on letterboxed orientations (the `100vw/100vh` +
  `image-rendering: pixelated` combo letterboxes the rendered output
  but the canvas element itself fills the viewport — `getBoundingClientRect`
  returns the *element* size, not the *rendered framebuffer* size). By
  mapping `(clientX, clientY) → framebuffer-(x, y)` once per touch
  event, hit zones and HUD pixels stay locked together. The mapping
  is a single linear scale per axis — cheap, allocated-per-touch is
  fine.

- **Why `touch-action: none` not `touch-action: manipulation`.**
  `manipulation` still allows pinch-zoom and double-tap-zoom; only
  `none` fully disables browser default touch behaviors on the
  element. The `viewport` meta's `user-scalable=no` is a belt-and-
  suspenders for browsers that honor the meta but ignore CSS
  `touch-action` (Safari historically). Both are needed.

- **Why `passive: false` on listeners.** Browsers default touch
  listeners to passive (can't `preventDefault`). Without
  `preventDefault`, the page would still scroll on touch-drag even
  with `touch-action: none` honored on the canvas — Safari has bugs
  here. Explicit `passive: false` ensures `preventDefault` fires.

- **Why hold-to-fire instead of tap-to-fire.** Tapping repeatedly on
  a phone is finger-fatiguing and the cooldown means rapid taps
  produce inconsistent rate-of-fire. Holding the button drives
  `fireShot()` once per frame and the cooldown self-regulates to
  one shot per `FIRE_COOLDOWN_MS = 250 ms`, identical to desktop
  click-spam. Mobile shooters have converged on hold-to-fire for
  this reason.

- **Why util row in top-left below FPS, not bottom or in a menu.**
  Bottom screen real estate is for thumbs (joystick, fire, look). A
  pull-out menu is one extra tap and adds a state machine. Top-left
  is reachable by either thumb in landscape, doesn't conflict with
  any other touch zone, and the buttons are small enough not to
  obscure the world. They sit *below* the FPS counter so the FPS
  read stays in its current spot — moving the FPS counter is a
  separate, unrelated change.

- **Why no pitch axis.** Adding pitch means changing the renderer
  (the y-shear / floor-and-ceiling cast assumes fixed horizon). Out
  of scope for an input task. Touch look stays horizontal, matching
  the desktop mouse path.

- **Mapping joystick to move composition.** The joystick's `(jx, jy)`
  is in screen space (jy negative = up = forward). The move-vector
  composition uses world-space basis vectors `player.dirX/Y`
  (forward) and `player.planeX/Y` (right strafe). So forward
  contribution is `dir * (-jy)`, strafe is `plane * jx` — the pattern
  matches the desktop W/A/S/D block at `index.html:382-385` exactly.
  Both inputs sum into `(mvX, mvY)`, then the existing normalize
  caps the move-per-frame so dual-input doesn't double-speed.

- **Why `JOY_RADIUS = 40 fb-px`.** At a typical 800-wide phone in
  landscape, the canvas is ~800 CSS-px wide → 480 fb-px maps to ~800
  CSS-px → 40 fb-px ≈ 67 CSS-px. That's a comfortable thumb-arc.
  Smaller (~24 fb-px) was tested in mocks and felt cramped; larger
  (~64 fb-px) ate too much screen and reduced precision near the
  rim. `40` is a round number in the middle.

- **Why `FIRE_BTN_R = 28 fb-px` and the corner offset.** Apple
  guidance is 44 CSS-px minimum tap target. 28 fb-px ≈ 47 CSS-px on
  an 800-wide phone — comfortably above the threshold in landscape;
  in portrait it's smaller (~28-30 CSS-px) which is the trade-off
  per AC #14. Centered at `(W-36, H-36)` puts the button just inside
  the safe area on a notched phone (`viewport-fit=cover` lets the
  page extend under the notch but the framebuffer's bottom-right
  corner is well clear of any notch in landscape).

- **Symbols added (all new state lives at the top of the IIFE next
  to the existing input block at `index.html:248-251`):**
  ```js
  const isTouchDevice = …;          // AC #2
  const JOY_RADIUS = 40, JOY_DEADZONE = 0.15;
  const FIRE_BTN_R = 28;
  const BTN_W = 22, BTN_H = 18;
  const joyVec   = { active: false, id: -1, ax: 0, ay: 0, x: 0, y: 0 };
  const lookTouch = { active: false, id: -1, lastX: 0, lastY: 0 };
  const fireTouch = { active: false, id: -1 };
  let firePressed = false;
  const touches  = new Map();        // id -> role
  ```

- **Symbols added (functions):**
  - `touchToFramebuffer(t)` — coordinate helper.
  - `onTouchStart(e)`, `onTouchMove(e)`, `onTouchEnd(e)` — listeners.
  - `drawTouchHUD()` — renderer.
  - One small helper `pointInRect(px, py, x, y, w, h)` for util-button
    hit-testing is acceptable; inline if preferred.

- **Where to insert each block in `index.html`:**
  - `<head>` viewport meta: after line 4.
  - `<style>` additions: inside the existing block (lines 6-40).
  - `isTouchDevice` + JOY/FIRE/BTN constants + state objects: just
    after the existing `mouseDx` / `pointerLocked` / `blockedKeys`
    block at `index.html:248-256`.
  - `if (!isTouchDevice)` wrap of `requestPointerLock`: edit
    `index.html:291-296`.
  - Touch listener registration: after the existing
    `document.addEventListener('mousemove', …)` at `index.html:312-314`.
  - `touchToFramebuffer` + `pointInRect` helpers: just before the
    listener handlers.
  - `onTouchStart` / `onTouchMove` / `onTouchEnd`: with the other
    input handlers around `index.html:258-314`.
  - Joystick contribution + held-fire call: inside `update()`,
    joystick contribution after the keyboard W/A/S/D block at
    `index.html:381-392` (before normalize), held-fire call after
    `applyContactDamage(dt)` at `index.html:409`.
  - `drawTouchHUD()` definition: with the other HUD draw helpers
    around `index.html:1786+` (`drawDamageEdges`, `drawDamageArrow`,
    etc.). Call it from `render()` after `drawHUD()` at
    `index.html:1727`, before `drawDamageArrow()` at
    `index.html:1731`.

- **Hot path discipline.** `drawTouchHUD()` early-returns when
  `!isTouchDevice` so desktop pays only one branch per frame. The
  per-frame held-fire `if (firePressed) fireShot()` similarly returns
  immediately when `firePressed === false`. The joystick contribution
  in `update()` is gated on `isTouchDevice && joyVec.active` so its
  cost is one comparison on desktop.

- **Test in DevTools first.** Chrome's DevTools mobile emulation
  (Cmd-Shift-M / Ctrl-Shift-M) with **Touch enabled** correctly
  reproduces `'ontouchstart' in window === true` and dispatches real
  `touchstart` / `touchmove` / `touchend` events. Most issues
  (joystick anchor drift, button hit-test miss, look sensitivity)
  are catchable in emulation. Real-device test is the final gate.

## Agent Notes

- **Read first:** `AGENTS.md`, `CLAUDE.md`, this task spec, then in
  `index.html`:
  - lines 1-44 (`<head>`, `<style>`, `<canvas>`, `.hint` div).
  - lines 248-314 (input state + keyboard / mouse / pointer-lock
    handlers).
  - lines 347-419 (`update()` — movement composition, mouse-dx
    consumption, level-exit).
  - lines 1408+ (`fireShot()` — what held-fire dispatches into).
  - lines 1583-1735 (`render()` flow + HUD overlays).
  - lines 1786-1900-ish (existing HUD helpers like `drawDamageEdges`,
    `drawDamageArrow`, `drawHUD`, etc. — model `drawTouchHUD()` on
    these).
  All edits stay inside the assigned worktree only.

- **Order of work (recommended):**
  1. Add the viewport meta + CSS additions + the `@media
     (pointer: coarse)` rule for `.hint`. Reload in desktop browser →
     no visible change. Reload in DevTools mobile emulation → `.hint`
     hides, no pinch-zoom on canvas.
  2. Add `isTouchDevice` + the JOY/FIRE/BTN constants + the state
     objects (`joyVec`, `lookTouch`, `fireTouch`, `firePressed`,
     `touches` map). Wrap the pointer-lock request. Reload → desktop
     unchanged; mobile no longer prompts for pointer lock on canvas
     tap.
  3. Add the four touch listeners, `touchToFramebuffer`, and the
     `onTouchStart` / `onTouchMove` / `onTouchEnd` dispatch logic.
     Initially make them log roles to the console (don't connect to
     game state yet). Reload in mobile emulation → check that
     joystick / look / fire / util roles are assigned to the right
     touches at the right places.
  4. Connect joystick to `update()`'s move composition. Connect
     `firePressed` to a per-frame `fireShot()` call. Connect look
     deltas to `mouseDx`. Connect util-button taps to
     `regenerateDungeon` / `lightingEnabled` / `muted` / `resetRun`.
     Reload → game is playable on mobile but with no visible HUD.
  5. Implement `drawTouchHUD()` and wire it into `render()`. Reload →
     full feature works.
  6. `node --check` against the extracted `<script>` body:
     ```
     grep -oP '(?s)(?<=<script>).*?(?=</script>)' index.html > /tmp/script.js
     node --check /tmp/script.js
     ```
  7. Update README.md per AC #19.
  8. Smoke-test in DevTools mobile emulation, then on a real phone
     if available.

- **Common pitfalls:**
  - **Forgetting `e.preventDefault()` in touch handlers.** Without
    it, the page scrolls / pulls-to-refresh / triggers iOS magnifier.
    `passive: false` is required *and* you must actually call
    `preventDefault`. Call it once at the top of each handler.
  - **Treating `e.touches` like `e.changedTouches`.** `touches` is
    *all currently active* touches; `changedTouches` is *only the
    touches involved in this event*. For start/end you almost always
    want `changedTouches` (assigning roles only to the new touches,
    cleaning up only the touches that ended). For move, you want
    `changedTouches` too (only update positions for touches that
    actually moved).
  - **Joystick "active but no anchor" bug.** If `joyVec.active` is
    true but `joyVec.ax / ay` were never set, the move vector
    explodes. Always set anchor + clear `active` together at
    `touchstart` and `touchend`.
  - **Hit-test in CSS pixels instead of framebuffer pixels.**
    `clientX/Y` arrives in CSS pixels relative to the viewport, not
    the framebuffer. Always pipe through `touchToFramebuffer` before
    comparing to `JOY_RADIUS`, `FIRE_BTN_R`, button rects, or the
    `W/2` left-half threshold.
  - **`requestPointerLock` still firing on touch devices.** If you
    forget the `if (!isTouchDevice)` guard, hybrid touch-laptop users
    will see a pointer-lock prompt every time they tap the canvas.
    Test on a touch laptop or with DevTools touch emulation.
  - **Held-fire firing during death.** If you put the
    `if (firePressed) fireShot()` call *before* the `update()` death
    early-return, dead-state held-fire does nothing destructive (the
    cooldown still ticks) but feels wrong if it advances ammo
    counters. Place the call after `applyContactDamage(dt)` so the
    death early-return at the top of `update()` already returned.
  - **Touch HUD drawn before `putImageData`.** It must draw with
    `ctx` calls *after* the `putImageData(buf, 0, 0)` at
    `index.html:1682`, otherwise the pixels would be overwritten by
    the framebuffer blit. Place the call near the existing HUD `ctx`
    calls (FPS, crosshair, HUD strip).
  - **Dragging finger out of the look zone into the joystick zone.**
    The role of a touch is fixed at `touchstart` time — a touch that
    started in the right half stays a "look" touch even if the
    finger crosses the midline mid-drag. Don't reassign roles on
    move.
  - **Multi-touch identifier reuse across events.** Browsers reuse
    `identifier` values after a touch ends. Always check that the
    touch is in your `touches` map before dispatching; ignore unknown
    identifiers (could be from a quickly-released-and-re-pressed
    finger).
  - **Test only on desktop and shipping a broken mobile experience.**
    Use Chrome DevTools mobile emulation with **Touch: forced** as the
    minimum gate. Real-device test is the final gate. Don't rely on
    just resizing the desktop window.

- **Smoke test before reporting:**

  *Desktop (must be byte-identical to today):*
  - Reload in Chrome / Firefox. Click canvas → pointer locks. WASD
    walks, mouse looks, click fires, Space fires, N regens, L
    toggles lighting, M mutes, R resets after death. `.hint` div
    visible at bottom-left. FPS counter correct. No new console
    errors.

  *Mobile emulation (Chrome DevTools, mobile mode, Touch: forced):*
  - Reload. `.hint` is hidden; touch HUD is not visible until first
    touch.
  - Touch left half → joystick base + thumb appear at touch point.
    Drag → thumb tracks, clamped to `JOY_RADIUS`. Player moves in
    the dragged direction (forward = up, strafe = left/right). Lift
    → joystick disappears, player stops.
  - Touch right half (not on fire button) → drag → camera turns.
    Releasing keeps the camera where you left it (no "snap back").
  - Hold the bottom-right circular button → gun fires repeatedly,
    once per `FIRE_COOLDOWN_MS`. Release → firing stops mid-cooldown
    (no extra shot).
  - Tap N (top-left) → dungeon regenerates. Tap L → lighting toggle
    + indicator banner appears. Tap M → audio mutes / unmutes.
  - Walk into enemies until dead. Util row vanishes; RESET button
    appears centered. Tap RESET → run resets, util row returns.
  - Joystick + look + fire all simultaneously: walk forward, look
    left, hold fire — all three should work concurrently.
  - Rotate emulator to portrait → game letterboxes; touch HUD
    smaller but still tappable. Rotate back → no glitches.
  - DevTools console: zero errors, zero warnings.

  *Real device (if available):*
  - All of the above on an iPhone (Safari) and an Android (Chrome).
    Pay attention to: pinch-zoom suppressed, pull-to-refresh
    suppressed, no iOS grey tap highlight, audio unlocks on first
    touch.

- **At minimum** run `node --check` against the extracted `<script>`
  body before reporting:
  ```
  grep -oP '(?s)(?<=<script>).*?(?=</script>)' index.html > /tmp/script.js
  node --check /tmp/script.js
  ```

---
id: gun-feel-polish
area: frontend
priority: 50
depends_on: []
description: Layer four cheap "feels alive" polishes onto the existing pistol viewmodel — idle sway under the bob, equip slide-in on respawn / N-regen / level transition, brief FOV punch on successful shots, and a vertical drop-shadow band under the gun that anchors it to the player.
---

# Gun Feel Polish

## Goal

The pistol viewmodel today (`gun-viewmodel`, `gun-viewmodel-fps-perspective`)
already has a clean back-view sprite, smoothed bob synced to movement, a
two-stage kick state machine with a procedural muzzle flash, and a lower-right
Doom anchor. The motion is solid in motion — but the gun *freezes solid* when
the player stands still, *pops in cold* on a fresh life or a level transition,
*never reacts to the world* with anything bigger than a 10-px screen-space kick,
and *floats* against the wall rendering with no visual tie to the player's body.

This task layers four cheap, procedural polishes onto the existing setup:

1. **Idle sway** — a sub-pixel breath sine under the bob, so the gun never sits
   perfectly still even when the bob has eased to rest.
2. **Equip slide-in** — on `resetRun()`, `regenerateDungeon()` (N), and
   `advanceLevel()`, slide the gun up from ~24 px below baseY over ~250 ms with
   an ease-out, so the gun visibly enters every fresh-context frame.
3. **FOV punch on fire** — on every `'shot'` kick (not dry-fire), briefly
   widen the camera plane vector by ~2% for ~110 ms with an ease-out, so the
   world reads a one-frame "punch" alongside the gun kick.
4. **Drop shadow** — a vertical alpha gradient darkening the bottom ~28 rows
   of the framebuffer, drawn into `buf32` *before* `drawGunViewmodel()`, so the
   gun reads as sitting in front of an implied torso/body rather than floating
   over the wall.

Bob math, kick state machine, muzzle-flash sprites, hitscan integration, the
gun sprite itself, the lower-center additive yellow flash overlay, the
crosshair, and the determinism / single-file contracts are all unchanged.

## Acceptance Criteria

1. **Single-file constraint preserved.** Still one `index.html` at the repo
   root, no build step, no external assets, no network requests, no
   `localStorage`. All polish lives in the existing inline IIFE. No new files.

2. **Idle sway — sub-pixel breath under the bob.** In `drawGunViewmodel`
   (`index.html:2779-2825`), where today's offsets are:
   ```js
   const bobOffX = Math.sin(bobPhase) * 3 * bobIntensity;
   const bobOffY = -Math.abs(Math.sin(bobPhase * 2)) * 2 * bobIntensity;
   const k = getKickOffsets(performance.now());
   ...
   const dx = baseX + Math.round(bobOffX + k.kickX);
   const dy = baseY + Math.round(bobOffY + k.kickY);
   ```
   Add a sway pair derived from `nowMs` directly (lissajous-style: different
   frequencies on x and y so the motion never repeats simply):
   ```js
   const swayX = Math.sin(nowMs * SWAY_FREQ_X) * SWAY_AMP_X;
   const swayY = Math.cos(nowMs * SWAY_FREQ_Y) * SWAY_AMP_Y;
   ```
   New constants in the gun-constants block (`index.html:77-90`):
   ```js
   const SWAY_FREQ_X = 0.0011;  // rad/ms ≈ 0.18 Hz
   const SWAY_FREQ_Y = 0.0014;  // rad/ms ≈ 0.22 Hz
   const SWAY_AMP_X  = 0.6;     // sub-pixel; quantization gives ±1 px
   const SWAY_AMP_Y  = 0.5;
   ```
   Apply by adding `swayX` and `swayY` into the same `Math.round(...)`
   expression that produces `dx` and `dy`:
   ```js
   const dx = baseX + Math.round(bobOffX + k.kickX + swayX);
   const dy = baseY + Math.round(bobOffY + k.kickY + swayY);
   ```
   The amplitudes are deliberately under 1 px — quantization through
   `Math.round` produces an alternating ±1 px breath that's barely-there in
   motion (overpowered by bob + kick) but clearly alive when standing still.
   The frequencies are chosen so the x and y sines drift in/out of phase over
   tens of seconds — the motion never reads as a simple loop.

3. **Idle sway is layered on top of the bob's idle ease.** The existing
   "ease `bobPhase` toward the nearest π-multiple when idle" logic at
   `index.html:619-624` is **not** removed — bob still glides to a stop, then
   sway becomes the only motion. The two systems compose without coupling.

4. **Equip slide-in — module state.** Add at the gun-state block
   (next to `bobPhase`, `bobIntensity`, `kickState` near `index.html:153-162`):
   ```js
   // Frame counter; ticked in drawGunViewmodel (the only consumer). Starts at
   // 0 (no slide on initial page load — preserves byte-identical first frame).
   // Set to EQUIP_FRAMES at the four user-facing transitions (KeyR + touch
   // RESET + regenerateDungeon + advanceLevel) so respawn / N-regen / level-
   // transition all replay the slide. NOT armed by clearTransientFeedback()
   // because the IIFE init calls that helper once on startup.
   let equipFramesLeft = 0;
   ```
   Frame-counter (not timestamp-based) so the slide is deterministic across
   reloads — the wall-clock at first-rAF is browser-dependent, but a counter
   ticked once per render frame is not.

5. **Equip slide-in — duration constant.** In the gun-constants block
   (`index.html:77-90`):
   ```js
   const EQUIP_FRAMES   = 15;  // ≈ 250 ms at 60 fps
   const EQUIP_DROP_PX  = 24;  // start offset below baseY
   ```
   Co-locate with the existing `KICK_UP_MS` / `KICK_RECOVER_MS`. Keep them
   integers for determinism; the math below stays integer-only.

6. **Equip slide-in — trigger at the four user-facing call sites.**
   `clearTransientFeedback` is **not** the right place to arm the slide:
   the IIFE init at `index.html:1401-1407` calls `resetRun()` →
   `clearTransientFeedback()` once during startup, which would arm a
   slide on the very first frame and break the byte-identical
   first-frame contract. Instead, arm explicitly at each user-driven
   transition:

   a. `KeyR` keyboard handler (`index.html:298-299`):
   ```js
   } else if (e.code === 'KeyR' && player.hp <= 0) {
     resetRun();
     equipFramesLeft = EQUIP_FRAMES;
   }
   ```

   b. Touch `RESET` button handler (`index.html:401-402`):
   ```js
   if (util === 'reset') {
     resetRun();
     equipFramesLeft = EQUIP_FRAMES;
   }
   ```

   c. `regenerateDungeon` (`index.html:1370-1375`), at the end of the
   function body (after the existing `resetRun()` call). This single
   site covers both the keyboard `KeyN` handler and the touch `N`
   button — both call `regenerateDungeon()`:
   ```js
   function regenerateDungeon() {
     const seed = pickRandomSeed();
     console.info('[seed] ' + seed);
     applyDungeon(generateDungeon(seed));
     resetRun();
     equipFramesLeft = EQUIP_FRAMES;
   }
   ```

   d. `advanceLevel` (`index.html:1381-1397`), at the end of the
   function body (after the existing `clearTransientFeedback()` call):
   ```js
   function advanceLevel() {
     ...existing body...
     clearTransientFeedback();
     sfxLevelExit();
     levelBannerAtMs = nowMs;
     levelBannerUntilMs = nowMs + 1200;
     equipFramesLeft = EQUIP_FRAMES;
   }
   ```

   The IIFE init's `resetRun()` call at `index.html:1406` is **not**
   followed by an `equipFramesLeft = EQUIP_FRAMES` line — that's the
   whole point. First-frame `equipFramesLeft` stays at its initial
   value of `0`, the slide is not played, and the byte-identical
   first-frame contract is preserved. Verify by `grep -n 'resetRun()' index.html`
   — the IIFE init call (line ~1406) is the unique site with no slide
   arming after it.

7. **Equip slide-in — apply offset in `drawGunViewmodel`.** Compute the
   per-frame extra Y offset just below the bob/kick/sway lines:
   ```js
   let equipOffY = 0;
   if (equipFramesLeft > 0) {
     // Linear ramp 1 → 0, eased with quadratic ease-out:
     // tProg = (EQUIP_FRAMES - equipFramesLeft) / EQUIP_FRAMES, so 0 at start, 1 at end.
     // Slide offset = (1 - tProg)^2 * EQUIP_DROP_PX.
     const tProg = (EQUIP_FRAMES - equipFramesLeft) / EQUIP_FRAMES;
     const ease  = (1 - tProg) * (1 - tProg);
     equipOffY = (ease * EQUIP_DROP_PX) | 0;
     equipFramesLeft--;
   }
   ```
   Then add `equipOffY` into the `dy` expression:
   ```js
   const dy = baseY + Math.round(bobOffY + k.kickY + swayY) + equipOffY;
   ```
   The ease-out means most of the motion happens in the first ~1/3 of the
   slide — the gun "lands" softly at baseY rather than crawling up. `| 0`
   keeps the offset integer-pixel, matching the rest of the blit.
   `equipFramesLeft` is **not** decremented while `player.hp <= 0`: the
   `if (player.hp <= 0) return;` early-return at `index.html:2780` skips
   the entire body, so the counter is suspended through death and resumes
   on respawn (where the user-facing handler explicitly re-arms the
   counter to `EQUIP_FRAMES` per AC #6 — so the effect is "death freezes
   the slide; respawn restarts it from full"). This is correct.

8. **Equip slide-in — drop shadow follows.** When the gun is mid-slide
   (`equipFramesLeft > 0`), the drop shadow (AC #11-#12) **stays at full
   strength**. Rationale: the shadow represents the player's torso, which
   doesn't slide in with the gun — only the gun does. Tying the shadow's
   alpha to the equip phase would make the world flash during respawn,
   which is louder than this task wants.

9. **FOV punch — module state.** Add next to the equip state:
   ```js
   // Multiplier applied to player.planeX / player.planeY at the four ray-
   // emitting reader sites. 1.0 = idle, briefly > 1.0 after a 'shot' kick.
   // Decays exponentially each frame back toward 1.0.
   let fovPunch = 1.0;
   ```
   Initial value is exactly `1.0` so first-frame raycasting is byte-identical
   to today.

10. **FOV punch — trigger and decay.** In `onPlayerFire(kind)` at
    `index.html:2723-2727`:
    ```js
    function onPlayerFire(kind) {
      kickState = 'kicking';
      kickKind  = (kind === 'dry') ? 'dry' : 'shot';
      kickStart = performance.now();
      // gun-feel-polish: only 'shot' fires the FOV punch. Dry-fire stays small.
      if (kind !== 'dry') fovPunch = 1.0 + FOV_PUNCH_AMOUNT;
    }
    ```
    Decay each frame at the **bottom** of `update()` (after the bob/kick
    tick, before `aiTick(dt)`), so it ticks on alive frames only:
    ```js
    // Decay toward 1.0; ~110 ms half-life at 60 fps.
    fovPunch += (1.0 - fovPunch) * Math.min(1, FOV_PUNCH_DECAY * dt);
    ```
    Constants in the gun-constants block:
    ```js
    const FOV_PUNCH_AMOUNT = 0.022;  // ~2.2% wider plane on shot
    const FOV_PUNCH_DECAY  = 12;     // 1/s; (1 - e^{-12*0.11}) ≈ 0.74 in 110 ms
    ```
    `FOV_PUNCH_AMOUNT = 0.022` is a 2.2% widening of the plane vector — small
    enough to read as kinetic feedback rather than a zoom, large enough to
    be visible at 480×270. Higher amounts (≥ 5%) start to look like a
    fish-eye on every shot.

11. **FOV punch — apply at the four reader sites.** The raycaster reads
    `player.planeX` / `player.planeY` directly at four spots. Replace each
    with the punched value:

    a. `castColumn` (`index.html:649-650`):
    ```js
    const rayDirX = player.dirX + player.planeX * fovPunch * cameraX;
    const rayDirY = player.dirY + player.planeY * fovPunch * cameraX;
    ```

    b. `castFloorCeiling` (`index.html:1737-1740`):
    ```js
    const rayDirX0 = player.dirX - player.planeX * fovPunch;
    const rayDirY0 = player.dirY - player.planeY * fovPunch;
    const rayDirX1 = player.dirX + player.planeX * fovPunch;
    const rayDirY1 = player.dirY + player.planeY * fovPunch;
    ```

    c. `drawKillPops` camera transform (`index.html:2076` and `2089`):
    ```js
    const invDet = 1 / (player.planeX * fovPunch * player.dirY - player.dirX * player.planeY * fovPunch);
    ...
    const transformY = invDet * (-player.planeY * fovPunch * camX + player.planeX * fovPunch * camY);
    ```
    Same camera transform as the sprite pass — kill pops are screen-
    projected world entities, so they need the same FOV-punch handling
    as sprites and walls.

    d. `drawSprites` camera transform (`index.html:2417` and `2424`):
    ```js
    const invDet = 1.0 / (player.planeX * fovPunch * player.dirY - player.dirX * player.planeY * fovPunch);
    ...
    const transformY = invDet * (-player.planeY * fovPunch * camX + player.planeX * fovPunch * camY);
    ```

    **Math note.** With both `planeX` and `planeY` scaled by `fovPunch`,
    the determinant scales by `fovPunch` and `invDet` by `1/fovPunch`.
    `transformX` (which multiplies invDet against an expression in
    `dirX/dirY` only) therefore shrinks by `1/fovPunch` — sprites and
    kill pops shift *toward the screen center* during the punch, exactly
    as wall columns do (the same world-angle covers a smaller fraction
    of the wider FOV). `transformY` (which multiplies invDet against an
    expression in `planeX/Y`) ends up invariant — meaning sprite **size**
    does not change with FOV. This is correct: in a raycaster, both wall
    line-height (`H / perpWallDist`) and sprite height (`H / transformY`)
    are functions of distance, not FOV. Only the screen-X mapping is
    FOV-dependent. The "zoom out" feel of the punch comes entirely from
    that screen-X compression.

    The rotation math at `index.html:586-588` is **not** modified — it
    rotates the canonical `planeX/Y` and is independent of the punch.
    Movement composition at `index.html:594-595` and `601-603` (strafe via
    `planeX/Y`) is also **not** modified — punching the strafe vector would
    physically change the player's strafe speed during the punch, which
    feels wrong.

    Smoke-test for completeness: `grep -n 'planeX\|planeY' index.html` and
    verify every read used for **camera ray emission or sprite projection**
    is gated on `fovPunch`, while every read used for **rotation, movement,
    or rendering offsets unrelated to ray emission** is not. The reference
    list above is canonical for today's tree; if a future read site is
    added by a parallel spec, that spec is responsible for opting in.

12. **FOV punch — first-frame byte-identical.** Initial `fovPunch = 1.0`
    means the first frame's raycasts and sprite projections are
    bit-identical to today. Determinism contract preserved.

13. **Drop shadow — band size and gradient.** Add a helper just before
    `drawGunViewmodel` (around `index.html:2779`):
    ```js
    // gun-feel-polish: vertical gradient darkening the bottom band of buf32.
    // Drawn BEFORE the gun blit so opaque gun pixels are not darkened.
    // Pure RGB scale (alpha byte preserved) — saturating-add not needed
    // because we only ever multiply, never add.
    const SHADOW_H        = 28;   // rows; ~10% of H = 270
    const SHADOW_MAX_DARK = 0.40; // 0 = no shadow, 1 = full black at bottom
    function drawGunShadow() {
      if (player.hp <= 0) return;  // no shadow during death freeze
      const top = H - SHADOW_H;
      for (let y = 0; y < SHADOW_H; y++) {
        // Linear ramp: 0 at top of band, SHADOW_MAX_DARK at bottom row.
        const a   = (y / (SHADOW_H - 1)) * SHADOW_MAX_DARK;
        const inv = 1 - a;
        const py  = top + y;
        const rowBase = py * W;
        for (let x = 0; x < W; x++) {
          const i = rowBase + x;
          const c = buf32[i];
          const r = ((c       ) & 0xff) * inv;
          const g = ((c >>>  8) & 0xff) * inv;
          const b = ((c >>> 16) & 0xff) * inv;
          buf32[i] = (255 << 24) | ((b & 0xff) << 16) | ((g & 0xff) << 8) | (r & 0xff);
        }
      }
    }
    ```
    The shadow is **suppressed during death** (`player.hp <= 0`) so the
    death-freeze frame doesn't have a darkened bottom strip floating without
    the gun. The existing crosshair / damage-flash / death-overlay drawing
    is unaffected — they all run after `putImageData`.

14. **Drop shadow — call site.** In `render()`, the gun blits at
    `index.html:1905` (`drawGunViewmodel()`). Insert the shadow pass
    *immediately before* that call:
    ```js
    drawGunShadow();
    drawGunViewmodel();
    ```
    Order matters: shadow first (darkens the wall pixels under the gun),
    gun second (opaque pixels overwrite the shadowed wall). Atmosphere
    lighting / vignette / sky / floor / ceiling / sprites / wall columns
    have all already been drawn by this point — the shadow is a final
    post-pass over the world before the HUD-class gun lands on top.

15. **Drop shadow — performance budget.** `SHADOW_H * W = 28 * 480 = 13,440`
    pixel ops per frame, with ~6 arithmetic ops per pixel. On a release
    build that's ≈ 80,000 ops, well under one ms even on a mid-range
    laptop. The existing per-frame world rendering is already in the same
    ballpark per row. If profiling shows this as a hot spot, a future
    follow-up can pre-bake a 28-row dark mask and SIMD-multiply via
    `Uint32Array` typed-array tricks — out of scope here.

16. **Death freeze still hides the gun, the sway, the slide, the shadow.**
    The gun blit is gated on `player.hp > 0` at `index.html:2780` and the
    shadow gate is added in AC #13. The sway / slide-in / FOV-punch
    decay continue to *tick* during death where they have side-effects on
    pixels (FOV punch on the world; the others are gun-only and skip when
    the gun isn't drawn). FOV punch decays naturally toward 1 even
    through death, so the world is not "stuck zoomed-in" if the player
    fires the killing shot the same frame they die. Verify by
    `update()`'s death early-return at `index.html:558-568`: today it
    bails after `tickKick` and a `bobIntensity` decay — append the
    `fovPunch` decay there too:
    ```js
    if (player.hp <= 0) {
      mouseDx = 0;
      tickKick(performance.now());
      bobIntensity += (0 - bobIntensity) * Math.min(1, 8 * dt);
      // gun-feel-polish: FOV punch must continue to decay through death so
      // the world settles back to its idle FOV by the time the player
      // presses R; otherwise the death frame freezes mid-zoom.
      fovPunch += (1.0 - fovPunch) * Math.min(1, FOV_PUNCH_DECAY * dt);
      return;
    }
    ```
    The duplicate decay line in alive-vs-dead branches is intentional —
    the same physics applies in both states, but `aiTick` and friends
    don't run during death, so we can't share the alive-branch's bottom
    decay. ~1 line of duplication is cheap.

17. **Reset behavior — fovPunch is reset to 1.0 in `clearTransientFeedback`.**
    Append at the bottom of `clearTransientFeedback`
    (`index.html:1097-1118`):
    ```js
    fovPunch = 1.0;  // gun-feel-polish: world FOV settles at neutral on every
                     // R-reset / N-regen / level transition, even if mid-decay.
    ```
    Unlike `equipFramesLeft` (per AC #6), this line **is** safe to put in
    `clearTransientFeedback` — first-frame `fovPunch` is initialized to
    `1.0` (per AC #9), so the IIFE init's call resets `1.0 → 1.0`,
    a no-op that does not affect first-frame determinism.
    This guarantees the first frame of a fresh context has the canonical
    FOV — important so the equip slide-in (which is visible in the
    same frame) doesn't compete visually with a still-decaying punch from
    the last context.

18. **Determinism — first frame byte-identical.** After this task,
    reloading the page produces the same first-frame canvas pixels as
    today, because:
    - Initial `equipFramesLeft = 0`, so `equipOffY = 0`.
    - Initial `fovPunch = 1.0`, so all four punched reads compute the
      same value as today.
    - Initial `bobPhase = bobIntensity = 0`, so `bobOffX = bobOffY = 0`.
    - Initial sway is `sin(nowMs * 0.0011) * 0.6`. **This is non-zero
      on frame 1**. Quantized through `Math.round`, frame-1 sway is
      either `0` or `±1` px depending on `nowMs` at first rAF — which
      is browser-dependent.
    - **Therefore: AC #2 introduces a controlled, ≤ 1 px first-frame
      diff vs today.** Note this in the commit message. The diff is
      bounded (the gun shifts by at most 1 px on either axis on first
      frame), and is a deliberate consequence of "always alive" sway;
      it does *not* propagate to the world rendering (sway only
      affects the gun blit).
    - All four polishes use `Math.sin/cos/round`/integer counters only;
      no `Math.random`. Verify with `grep -n 'Math.random' index.html`
      → still no hits anywhere outside the seeded LCG paths (which
      were the existing exemptions).

19. **No regressions to existing systems.** All currently-shipped behaviors
    continue to work and look the same in motion:
    - **Bob, kick, muzzle flash, dry-fire, death freeze, R-reset, N-regen,
      level transition.** The bob math is unchanged at the call site; sway
      is added on top, equip-slide-in shifts only `dy`. Kick state
      machine and flash are untouched.
    - **Mouse-look, pointer lock, click-to-fire, Space-to-fire, WASD
      movement, joystick, look-touch, all touch-HUD interactions.** None
      of these read `fovPunch`, `equipFramesLeft`, or the sway constants.
    - **Hitscan accuracy.** `fireShot` and the hitscan probe at
      `index.html:1647+` are not modified. Note: the hitscan ray uses
      `player.dirX/dirY` (the camera *forward*), not `planeX/Y`, so the
      FOV punch does **not** alter where bullets land — only the visible
      world widens. This is by design: punching also shifting hits
      would feel like the gun shoots randomly during the punch.
    - **Crosshair, hit-tint, ammo HUD, kills HUD, FPS counter, minimap,
      damage flash, damage arrow, kill pops, level banner.** All draw
      after `putImageData`, unaffected by the shadow band (which lives
      in `buf32`).
    - **Atmosphere lighting toggle (L).** The shadow band is drawn into
      `buf32` *after* the vignette pass — so toggling lighting still
      reaches the shadow band; the band darkens whatever the world
      already rendered to. Both lighting modes look fine; the shadow's
      perceived contrast is slightly lower in dark-fog mode, which is
      correct (the world is already dim, so additional darkening reads
      less).
    - **Sprite z-buffer occlusion, contact damage, AI line-of-sight,
      ranged attacks, enemy muzzle flashes, enemy aim accuracy.** All
      sprite-related reads of `planeX/Y` for the ray emission /
      transform are punched (per AC #11). Any AI-side reads of those
      vectors (which there shouldn't be — AI uses world coords, not
      camera coords) are unchanged.

20. **Performance.** Aggregate per-frame cost increase, alive frames:
    - **Sway:** 2 × `sin/cos`, 2 × multiply, 2 × add. < 1 µs.
    - **Equip slide:** one branch + ≤ 4 arithmetic ops. < 1 µs (and
      strictly zero when `equipFramesLeft === 0`, the steady state).
    - **FOV punch:** one extra multiply at each of 4 reader sites
      (`castColumn` runs `W = 480` times → +480 multiplies/frame;
      `castFloorCeiling` is one-shot, +4; sprite passes are
      `n_enemies * O(1)`, +~20 in the worst case). Total < 5 ms even on
      slow hardware. No allocations.
    - **Drop shadow:** `28 × 480 × 6 ops ≈ 80,000 ops/frame ≈ 0.5 ms`
      on mid-range laptops, suspended during death.
    - Aggregate: well under a 1-frame budget at 60 fps. Aim ≥ 30 fps on
      all targets that hit it today.

21. **Visual identity bar.** A user reloading the page after this task
    should be able to articulate, without prompting:
    - "When I stand still, the gun is breathing slightly." (sway)
    - "When I respawn or hit N, the gun slides up into place." (equip)
    - "Each shot makes the world feel like it gets pushed back a bit."
      (FOV punch)
    - "There's a darker band at the bottom of the screen — like I'm
      seeing my own torso through the camera." (shadow)
    None of these polishes should be loud — none should make the user
    say "what's that flickering at the bottom" or "the gun is jiggling
    weirdly". If smoke-testing turns up a "loud" reading, dial down the
    associated constant (`SWAY_AMP_*`, `EQUIP_DROP_PX`,
    `FOV_PUNCH_AMOUNT`, `SHADOW_MAX_DARK`) by 25-40% and re-test rather
    than removing the feature.

22. **No new console errors or warnings.** A 60-second smoke session —
    fresh load, walk around (sway visible), fire a magazine (kick + FOV
    punch + flash), dry-fire (kick only, no punch), die (gun + shadow
    disappear), `R` (slide-in visible), `N` regen (slide-in visible),
    walk to exit (slide-in visible on level transition), toggle `L`
    (shadow visible in both lighting modes), mute/unmute — must produce
    zero console errors or warnings.

## Out of Scope

- **Dynamic crosshair** (spread that grows with movement / fire,
  contracts when standing still). Considered and explicitly skipped this
  pass — it'd be visual-only unless paired with a real per-shot accuracy
  spread, and the hitscan path is currently perfect-aim. If we add real
  spread later, the dynamic crosshair becomes a natural follow-up.
- **Wall-column brightening on muzzle flash.** Cool but invasive — would
  touch `castColumn` and the per-column write loop. Defer.
- **Lighting integration on the gun** (tinting the gun by the same
  fog/distance shading as walls). The current spec's design choice is
  HUD-class "gun never darkened"; revisiting that is a design pivot,
  not a polish, and would surface the gun-on-dark-walls visibility
  problem.
- **3-frame slide-cycle animation on fire** (slide pulling back, shell
  ejecting). Inherited from the existing `gun-viewmodel-fps-perspective`
  Out of Scope list — needs real animation work, not a procedural
  polish. Defer.
- **Equip animation on initial page load.** Deferred to preserve the
  byte-identical-first-frame contract. The slide plays on every R /
  N / level transition, which covers the user-visible cases; first
  load is a one-time miss.
- **Configuring or tuning kick magnitudes, bob magnitudes, dry-fire
  feel, KICK_UP_MS / KICK_RECOVER_MS.** Out of scope per the prior
  gun specs; this task only adds new layers.
- **Modifying `fireShot`, the crosshair, the hitscan path, the legacy
  lower-center additive yellow flash overlay (`muzzleFlashUntil`), or
  any HUD overlay.** All untouched.
- **Persistent settings (slider for sway amplitude, a "no FOV punch"
  toggle, etc.).** No `localStorage`, no settings UI. Tuning is
  by-constant only.
- **Haptics / `navigator.vibrate`.** Inherited Out of Scope from the
  mobile-touch tasks.

## Design Notes

- **Why a frame counter for equip, not a timestamp.** The wall-clock at
  the first `requestAnimationFrame` callback is browser-dependent and
  not byte-identical across reloads. Anchoring the slide on
  `nowMs - equipStartMs` would inject non-determinism if the slide
  happened to be active on frame 1. A frame counter avoids that
  entirely — and since the slide is only ever armed by user-driven
  transitions (R / N / exit), all of which happen well after first
  frame, the counter approach is also strictly easier to reason about.

- **Why decay FOV punch toward 1.0, not zero-then-snap.** A sharp
  decay-to-zero plus snap-to-1.0 boundary creates a visible "click"
  when the punch ends. Exponential decay is smooth and free
  (one multiply-add per frame). The `12 / s` constant gives ~110 ms
  to reach 90% recovered, which feels in sync with the gun's own
  ~140 ms kick recovery.

- **Why 2.2% punch and not 3-5%.** At 480×270, a 2% plane widening
  shifts the leftmost wall column by roughly 1 px and the rightmost
  by 1 px the other way — visible as a "world widens" without
  becoming a fish-eye. 3% starts to look like a zoom-out FX, 5% is
  unambiguously a zoom. Punchy but understated reads as kinetic; loud
  reads as a bug.

- **Why hitscan stays unaffected.** The hit ray uses `player.dirX/dirY`
  (camera forward), not `planeX/Y`. The crosshair is anchored to the
  forward vector by definition (it's at screen center, where camera_x = 0,
  so `cameraX * planeX/Y = 0`). Punching the plane widens the FOV but
  does not move the crosshair off the dir vector. Therefore the
  bullet still goes exactly where the crosshair points, even mid-punch.
  This is the desired behavior — the world reads as recoiling, not
  the aim.

- **Why drop the shadow during death.** The death frame freezes the
  world and shows "YOU DIED — press R to restart". A darkened bottom
  strip in that frame distracts from the prompt and reads as a UI
  gradient rather than a body-shadow. Killing it on death keeps the
  death frame clean, and the shadow re-appears on the first alive
  frame after `R`.

- **Why the shadow is a multiply, not an alpha-blend.** Multiplying
  RGB by `(1 - a)` gives the same effect as alpha-blending against
  black, but with one less typed-array round-trip per pixel. For a
  band this size (~13K pixels) the difference is small — but the
  multiply form is also easier to read at a glance ("scales darkness
  per row"), which matters more than the cycles.

- **Sway frequencies (0.18 / 0.22 Hz) vs amplitudes (0.6 / 0.5 px).**
  Picked by ear in similar games. Sub-1 Hz reads as a breath, not a
  shimmer. Sub-pixel amplitudes mean sway is invisible during walking
  bob (which is ±3 px x / ±2 px y) but very visibly alive during
  idle. Lissajous (different x/y freqs) avoids the "mechanical loop"
  read of identical-frequency sways.

- **Symbols added (state):**
  ```js
  let equipFramesLeft = 0;   // ticked in drawGunViewmodel
  let fovPunch = 1.0;        // multiplier on planeX/Y at ray-emit sites
  ```

- **Symbols added (constants in the gun-constants block,
  `index.html:77-90`):**
  ```js
  const SWAY_FREQ_X = 0.0011;
  const SWAY_FREQ_Y = 0.0014;
  const SWAY_AMP_X  = 0.6;
  const SWAY_AMP_Y  = 0.5;
  const EQUIP_FRAMES   = 15;
  const EQUIP_DROP_PX  = 24;
  const FOV_PUNCH_AMOUNT = 0.022;
  const FOV_PUNCH_DECAY  = 12;
  const SHADOW_H        = 28;
  const SHADOW_MAX_DARK = 0.40;
  ```

- **Symbols added (functions):**
  - `drawGunShadow()` — bottom-band gradient pass into `buf32`,
    suppressed during death. ~14 lines.
  - No new top-level functions otherwise; the rest is inline arithmetic
    in `update()`, `onPlayerFire()`, `clearTransientFeedback()`, and
    `drawGunViewmodel()`.

- **Where edits land in `index.html`:**
  - **Gun constants block** (`index.html:77-90`): add the 10 new
    constants listed above.
  - **Gun-state block** (`index.html:153-162` area): add
    `equipFramesLeft = 0` and `fovPunch = 1.0` next to existing bob /
    kick state.
  - **`update()` death branch** (`index.html:558-568`): append
    `fovPunch` decay alongside the `bobIntensity` decay.
  - **`update()` alive bottom** (after `index.html:625` `tickKick`,
    before `aiTick(dt)`): append `fovPunch` decay.
  - **`onPlayerFire`** (`index.html:2723-2727`): set
    `fovPunch = 1.0 + FOV_PUNCH_AMOUNT` on `'shot'` only.
  - **`castColumn`** (`index.html:649-650`): multiply `planeX*Y` reads
    by `fovPunch`.
  - **`castFloorCeiling`** (`index.html:1737-1740`): same, four reads.
  - **`drawKillPops` camera transform** (`index.html:2076` and `2089`):
    same, four reads.
  - **`drawSprites` camera transform** (`index.html:2417` and `2424`):
    same, four reads.
  - **`render()`** (`index.html:1905`): insert `drawGunShadow()` call
    immediately before `drawGunViewmodel()`.
  - **`drawGunShadow`** (new helper, just above
    `drawGunViewmodel` near `index.html:2779`).
  - **`drawGunViewmodel`** (`index.html:2779-2825`): add `swayX/swayY`,
    `equipOffY` lines; fold into existing `dx`/`dy` expressions.
  - **`clearTransientFeedback`** (`index.html:1097-1118`): append
    `fovPunch = 1.0;` only. (`equipFramesLeft` arming lives at the four
    user-facing call sites — see below.)
  - **`KeyR` handler** (`index.html:298-299`): append
    `equipFramesLeft = EQUIP_FRAMES;` after `resetRun()`.
  - **Touch `RESET` handler** (`index.html:401-402`): append
    `equipFramesLeft = EQUIP_FRAMES;` after `resetRun()`.
  - **`regenerateDungeon`** (`index.html:1370-1375`): append
    `equipFramesLeft = EQUIP_FRAMES;` at the end of the body.
  - **`advanceLevel`** (`index.html:1381-1397`): append
    `equipFramesLeft = EQUIP_FRAMES;` at the end of the body.

- **Hot-path discipline.** Sway is 4 trig calls in the gun blit (~once
  per frame). Equip slide is one branch + ~4 ops. FOV punch is +1
  multiply at each of `W + 4 + ~20` ray emission sites per frame —
  bounded and tiny. Shadow band is `28 * 480 = 13,440` pixel ops with 6
  arithmetic ops each, gated on alive frames. None of these scale with
  enemy count or wall count beyond what's already in those loops.

- **Readability check.** The four polishes add ~30 lines total across
  ~8 edit sites. None of the existing functions grow by more than ~5
  lines. The `drawGunShadow` helper is the only new top-level
  identifier added. This is a deliberately small task.

- **Test in DevTools first.** Mobile emulation reproduces the bob /
  sway / equip / shadow correctly because they're not touch-gated; the
  FOV punch is identical on both platforms. Verify on desktop with a
  side-by-side: today's first frame vs after-task first frame should
  differ by at most 1 px in the gun blit area (per AC #18) and be
  identical everywhere else.

## Agent Notes

- **Read first:** `AGENTS.md`, `CLAUDE.md`, this task spec,
  `specs/gun-viewmodel.md`, `specs/tasks/gun-viewmodel-fps-perspective.md`
  (for the existing gun contract you must preserve), then in
  `index.html`:
  - lines 60-90 (gun + combat constants — primary edit site for new
    constants),
  - lines 130-165 (per-frame state, gun-state block — primary edit site
    for `equipFramesLeft` / `fovPunch`),
  - lines 540-630 (`update()` movement + bob/kick tick — edit site for
    FOV-punch decay in both branches),
  - lines 645-695 (`castColumn` — edit site for FOV-punch read),
  - lines 1090-1135 (`clearTransientFeedback` + `resetRun` — edit site
    for slide-in arming + fovPunch reset),
  - lines 1730-1745 (`castFloorCeiling` header — edit site for
    FOV-punch read),
  - lines 1900-1910 (`render()` gun-blit call site — edit site for
    `drawGunShadow()` insertion),
  - lines 2070-2095 (`drawKillPops` camera transform — edit site for
    FOV-punch read),
  - lines 2415-2425 (`drawSprites` camera transform — edit site for
    FOV-punch read),
  - lines 2715-2825 (`buildGun`, `onPlayerFire`, `tickKick`,
    `getKickOffsets`, `drawGunViewmodel` — primary edit site for sway /
    equip / shadow).
  All edits stay inside the assigned worktree only.

- **Order of work (recommended):**
  1. Add the new constants (sway / equip / FOV-punch / shadow).
     `node --check` after each block addition.
  2. Add `equipFramesLeft = 0` and `fovPunch = 1.0` to the gun-state
     block. `node --check`.
  3. Implement sway in `drawGunViewmodel` (AC #2, #3). Reload — gun
     visibly breathes when standing still, walking feels identical.
  4. Implement equip slide-in (AC #4-#7). Reload — initial load: no
     slide. Press `R` after death: slide visible. Press `N`: slide
     visible. Walk to exit: slide visible.
  5. Implement FOV punch — state, trigger, decay (AC #9-#10), and
     reader-site multiplications (AC #11). Reload — fire one shot,
     watch the world widen briefly. Verify hitscan still hits exactly
     where the crosshair is.
  6. Implement drop shadow (AC #13-#14). Reload — shadow visible at
     bottom in both lighting modes; absent during death.
  7. Append `fovPunch = 1.0;` to `clearTransientFeedback` (AC #17).
     Append `equipFramesLeft = EQUIP_FRAMES;` at each of the four
     user-facing sites (AC #6: `KeyR` handler, touch `RESET` handler,
     `regenerateDungeon`, `advanceLevel`). Verify R / N / exit all
     replay the slide and all reset FOV. **Verify the IIFE init's
     `resetRun()` (line ~1406) does NOT replay a slide on first load.**
  8. Append the FOV-punch decay to the death branch of `update()` (AC
     #16). Verify dying mid-shot: world settles back to neutral over
     ~110 ms even though the player is dead.
  9. `node --check` against the extracted `<script>` body:
     ```
     grep -oP '(?s)(?<=<script>).*?(?=</script>)' index.html > /tmp/script.js
     node --check /tmp/script.js
     ```
  10. Smoke test (see below).

- **Common pitfalls:**
  - **Forgetting one of the four FOV-punch reader sites.** If
    `castColumn` is gated but `castFloorCeiling` is not, the wall
    columns widen on shot but the floor/ceiling rays don't — visually
    you get a "tearing" at the horizon for ~110 ms. Use the explicit
    line-by-line list in AC #11 and grep to confirm.
  - **Punching a non-camera-ray reader.** The strafe vectors at lines
    594-595 and the rotation at 586-588 also read `planeX/Y`. Do
    **not** multiply those by `fovPunch` — strafe direction is a world
    quantity, not a camera quantity. If you do, the player physically
    side-steps faster during the punch, which feels wrong.
  - **Sway accumulating across reloads.** `nowMs * SWAY_FREQ_X` is
    bounded by the JS double precision (good for hours), but using
    `bobPhase` or another mutable accumulator instead of `nowMs`
    would let the sway phase couple to the bob's rest-snapping logic
    and read as random jitter on rest. Use `nowMs` directly.
  - **`equipFramesLeft` decremented while dead.** The
    `if (player.hp <= 0) return;` early-return at the top of
    `drawGunViewmodel` means the counter is naturally suspended
    during death — that's the intended behavior. Do not decrement
    `equipFramesLeft` from `update()` (which doesn't have access to
    the gun-blit scope anyway); keep the decrement strictly inside
    `drawGunViewmodel`.
  - **Arming the slide in `clearTransientFeedback` instead of at
    user-facing sites.** This is the wrong place: the IIFE init at
    `index.html:1401-1407` calls `resetRun()` → `clearTransientFeedback()`
    once during startup, and arming the slide there breaks the
    byte-identical first-frame contract. Arm at the four explicit user-
    facing sites listed in AC #6 (KeyR / touch RESET / regenerateDungeon /
    advanceLevel). The `fovPunch = 1.0` line is fine to keep in
    `clearTransientFeedback` because `1.0 → 1.0` is a no-op on first
    frame. Verify with `grep -n 'resetRun()' index.html` that the IIFE
    init call site is the unique one *without* an `equipFramesLeft`
    arming line after it.
  - **Drop shadow after the gun blit.** If you draw the shadow after
    `drawGunViewmodel`, the shadow darkens the gun's grip + frame +
    slide pixels — the gun reads as "buried in fog at the bottom" and
    the muzzle-flash gradient is also dimmed. Order is: shadow first,
    gun second.
  - **Drop shadow during death.** If you forget the
    `if (player.hp <= 0) return;` guard in `drawGunShadow`, the death
    overlay frame shows a darkened bottom strip with no gun in it —
    reads as a UI element rather than a body-shadow. Always gate.
  - **Camera-transform `invDet` consistency.** When inserting
    `* fovPunch` into both `planeX*dirY` and `dirX*planeY` of the
    sprite/kill-pops `invDet`, both terms scale by `fovPunch` so
    `invDet` scales by `1/fovPunch`. **This is the desired behavior**:
    `transformX` (used in screen-X) shrinks by `1/fovPunch` so sprites
    shift toward center during the punch (matching wall columns), and
    `transformY` (used in size + depth) ends up invariant — sprite
    *scale* is FOV-independent in raycasters by construction. If
    smoke-testing shows sprites *resizing* during a punch, you have
    introduced an extra `fovPunch` factor in `transformY`'s
    `camX`/`camY` terms (which are world-frame, not camera-frame); back
    that out. The reference AC #11(c) and #11(d) forms are correct.
  - **`Math.random` slipping in.** Forbidden in any per-frame path.
    The polishes here use only `Math.sin/cos/round` and integer
    counters — no random. Verify by `grep -n 'Math.random' index.html`.

- **Smoke test before reporting:**

  *Desktop (Chrome / Firefox):*
  - Reload. Click canvas → pointer locks. **First-frame check:** gun
    is in idle pose at lower-right; no slide animation on initial
    load. Bottom band is visibly darkened (drop shadow). Walls /
    sprites / floor / ceiling render exactly as today (FOV is
    1.0×).
  - **Idle.** Stand still. Gun is visibly breathing — alternating
    ±1 px sway on x and y, period in the 5-10 second range as the
    Lissajous drifts.
  - **Walk.** WASD around the dungeon. Bob is visible (same as
    before this task); sway is invisible underneath. Stop walking →
    bob settles, sway re-emerges. Smooth handoff.
  - **Fire.** Click. Gun kicks (same as before). World widens
    visibly for ~110 ms (FOV punch); walls at the screen edges
    shift outward by 1-2 px. Crosshair stays put. Bullet still
    hits exactly where the crosshair points (verify by aiming at a
    specific wall column edge and shooting).
  - **Dry-fire.** Empty mag, click. Gun does small dip (no flash).
    World does **not** widen (FOV punch is gated on `kind !== 'dry'`).
  - **Death.** Walk into enemies until dead. Gun disappears, drop
    shadow disappears (death overlay reads cleanly). FOV punch
    decays naturally if you fired the killing shot. Press `R` →
    gun visibly slides up from below baseY over ~250 ms with
    ease-out. Drop shadow re-appears the same frame.
  - **N regen.** Press `N`. Dungeon regenerates; gun slides up
    from below over ~250 ms. Same animation as `R`.
  - **Level transition.** Walk to exit cell. Banner shows "LEVEL N";
    gun slides up over ~250 ms.
  - **Lighting toggle (`L`).** Toggle off. Drop shadow still visible
    (a slightly darker bottom band atop the now-uniform fog). Toggle
    on. Drop shadow visible against the foggy gradient. Both modes
    read fine.
  - **Determinism.** Reload twice; the two first-frame canvases are
    identical *modulo* a possible ±1 px shift in the gun blit area
    (per AC #18). The world-rendering area (everything outside
    `[baseX, baseX+GUN_W] × [baseY, H]`) is byte-identical.
  - **DevTools console.** Zero errors, zero warnings.

  *Mobile emulation (Chrome DevTools, mobile mode, Touch: forced):*
  - Reload, `.hint` hidden, tap-to-begin overlay shows. Tap → game
    starts. All four polishes visible on touch as on desktop:
    sway when joystick is at rest (idle), equip slide on `R` /
    level transition, FOV punch on every fire-button hold cycle,
    drop shadow always visible.
  - Multi-touch: hold joystick + drag look + tap fire. Sway is
    overpowered by joystick-driven bob (correct). FOV punch is
    visible on each fire. Drop shadow stable.

- **At minimum** run `node --check` against the extracted `<script>`
  body before reporting:
  ```
  grep -oP '(?s)(?<=<script>).*?(?=</script>)' index.html > /tmp/script.js
  node --check /tmp/script.js
  ```

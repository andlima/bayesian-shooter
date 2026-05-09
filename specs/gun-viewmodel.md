---
id: gun-viewmodel
area: frontend
priority: 40
depends_on: [hitscan-weapon]
description: Procedural gun viewmodel at the bottom of the screen with view-bob, fire kick, and muzzle flash
---

# Gun Viewmodel — A Pistol You Can See, That Bobs and Kicks

## Goal

Draw a procedural pistol at the bottom-center of the screen that bobs while the player walks, kicks up and flashes when they fire, and dips slightly on dry-fire. This is a "feels like a real FPS" upgrade — the viewmodel is the single biggest sensory cue that your inputs are doing something, and the muzzle flash is what sells the hitscan as a *shot* rather than a stat-counter increment. Everything is procedural pixels into the existing `buf32` — no PNG, no SVG, no external assets.

## Acceptance Criteria

1. **Single-file constraint preserved.** Still one `index.html` at the repo root, no build, no external assets, no network.
2. **Gun sprite is procedurally generated once at startup.** A `GUN_SPRITE` is a `Uint32Array(GUN_W * GUN_H)` holding packed RGBA where the alpha channel is either `0` (transparent — skip in blit) or `255` (opaque). Dimensions:
   - `GUN_W = 96`, `GUN_H = 80`.
   The sprite shape is a stylized pistol silhouette pointing slightly up-right with the grip at the bottom-left of the sprite, the slide horizontal across the upper half, the barrel exit at roughly `(GUN_W - 8, 16)`. Pixel-art quality bar: a player should immediately read it as "a pistol", not "an abstract shape". Use a small palette of 5–6 colors (e.g., dark grey body, mid-grey slide, light-grey highlights, near-black outline, brown grip, single warm-yellow accent on the front sight).
3. **Sprite generator is pure code.** No `Math.random`, no IO, no `<img>`. Generate by writing into the `Uint32Array` directly using rectangle / line / per-pixel fills described in code (e.g., `fillRect(spr, x, y, w, h, color)`, `outline(spr, x, y, w, h, color)`). Output must be byte-identical run-to-run.
4. **Blit to `buf32` once per frame.** Drawing happens after `ctx.putImageData(buf, 0, 0)` is **not** acceptable — the viewmodel is part of the world frame and must be antialiasing-pixel-rule consistent with everything else, and (critically) must not be vignetted by `atmosphere-lighting` if that spec has shipped. Therefore the gun is composited *into `buf32`* before `putImageData` but *after* walls / sprites / fog so the fog never tints the gun. Concretely: insert the gun blit between step (4) "draw sprites" and step (5) "vignette pass" of `atmosphere-lighting`'s render order — and make sure the gun is **excluded from the vignette** by either (a) skipping the vignette multiply on pixels in the gun bounding rect, or (b) blitting the gun *after* the vignette pass with the same buf32 (the latter is simpler and is the recommended approach despite being a step out of `atmosphere-lighting`'s ordering — the gun is HUD-class, not world-class).
5. **Anchor position.** Idle (no bob, no kick) draw position is:
   - `gunX = (W - GUN_W) >> 1`
   - `gunY = H - GUN_H + 4`  (the bottom 4 pixels of the gun are clipped — this puts the grip out of frame, which reads correctly).
   These constants are fixed; only the **offset** changes per frame.
6. **View-bob.** When the player is moving (`mvLen > 0` after the existing input gathering), accumulate a `bobPhase` at speed `BOB_SPEED * dt * (mvLen / moveSpeed)` where `BOB_SPEED = 8.0`. When idle, `bobPhase` does *not* reset to zero — it eases toward the nearest "rest" angle (multiple of `π`) at rate `8.0 * dt` so the gun glides to rest instead of snapping. Per-frame offsets:
   - `bobOffX = Math.sin(bobPhase) * 3 * bobIntensity`  (px)
   - `bobOffY = -Math.abs(Math.sin(bobPhase * 2)) * 2 * bobIntensity`  (px; the `abs` makes it bounce *up* on every footfall, not down — shoulders drop, hands rise, which reads as walking)
   Where `bobIntensity` is a smoothed scalar in `[0,1]` that tracks `mvLen / moveSpeed` with a ~150 ms time constant.
7. **Fire kick** (state machine, per-frame). Drives an additional `(kickX, kickY)` offset and a `flashFrame` 0..2:
   - `idle` — `kickY = 0`, `flashFrame = 0`.
   - `kicking` — entered the moment the existing hitscan-weapon "fire" event happens (a non-empty-magazine click). Duration `KICK_UP_MS = 60 ms`. During: `kickY = -10 px` (gun visibly jumps up), `kickX = -2 px` (recoils slightly into the player's view), `flashFrame` cycles 1 → 2 over the 60 ms.
   - `recovering` — entered at `kicking` end. Duration `KICK_RECOVER_MS = 140 ms`. `kickY` and `kickX` ease back to `0` with a quadratic ease-out; `flashFrame = 0` for the entire recover.
   - On a *dry-fire* (click with empty mag, which the existing hitscan-weapon spec already differentiates), enter `kicking` with smaller magnitudes (`kickY = -2`, `kickX = 0`, `flashFrame = 0` — no flash) and use only the `recovering` ease-back. The dry-fire kick must not trigger a muzzle flash.
8. **Muzzle flash sprite.** A second small `Uint32Array(FLASH_W * FLASH_H)` (`FLASH_W = FLASH_H = 24`) holding two visually distinct frames (`FLASH_FRAME_1` and `FLASH_FRAME_2`, each its own `Uint32Array(FLASH_W*FLASH_H)`). Frame 1 is a smaller bright-white core; frame 2 is a larger warm-yellow burst with rays. **Additive blend** when blitting (not transparent overlay): for each opaque flash pixel, `buf32[i] = saturatingAdd(buf32[i], flashPixel)`. The flash is anchored at the gun's "barrel exit" point — relative to the gun sprite's top-left, that's `(GUN_W - 4, 16)` — and follows all the same offsets (`gunX/Y + bobOff + kick + barrel`). The flash is centered on that point (blit position = `barrelX - FLASH_W/2`, `barrelY - FLASH_H/2`).
9. **Saturating add for the flash blend.**
   ```
   function addPixel(dst, src) {
     const r = Math.min(255, (dst & 0xff) + (src & 0xff));
     const g = Math.min(255, ((dst >> 8) & 0xff) + ((src >> 8) & 0xff));
     const b = Math.min(255, ((dst >> 16) & 0xff) + ((src >> 16) & 0xff));
     return (255 << 24) | (b << 16) | (g << 8) | r;
   }
   ```
   Inline at call site for speed.
10. **Hooking into `hitscan-weapon`'s fire event.** This spec depends on the hitscan-weapon spec's existing fire path. It hooks in as follows:
    - On a successful fire (ammo decrement, hit-or-miss): call `onPlayerFire('shot')` from this spec's module-scope state.
    - On a dry-fire (click with no ammo): call `onPlayerFire('dry')`.
    `onPlayerFire(kind)` transitions the kick state machine into `kicking` with the appropriate magnitudes per #7.
    The hitscan-weapon spec's existing crosshair flash, ammo HUD, and contact-damage paths are unchanged.
11. **Delta-time correctness.** All animation timings (`KICK_UP_MS`, `KICK_RECOVER_MS`, the bob's time constant) are in **milliseconds** and the state machine uses `performance.now()` for transitions. The bob phase's per-frame increment uses `dt` (seconds) — do not mix the two units.
12. **Performance.** ≥ 30 FPS at 480×270 still holds. The gun blit is a `GUN_W * GUN_H = 7,680` pixel sweep per frame with an alpha-test branch; the flash is `FLASH_W * FLASH_H = 576` pixels and only when active. Together they're a small fraction of the existing renderer's cost.
13. **No regressions.** Every previously-shipped behavior continues to work: walking, mouse-look, pointer lock, FPS counter, sprite z-buffer occlusion, `castColumn`, click-to-fire hitscan, ammo HUD, kills HUD, contact damage, death freeze + `R` reset, audio (if shipped), minimap (if shipped), atmosphere lighting (if shipped), textures (if shipped). The viewmodel only adds a frame-final blit; it does not modify the existing renderer's data flow.
14. **Death freeze hides the gun.** When the existing hitscan-weapon death state is active (player HP ≤ 0), the gun viewmodel is not drawn. The kick state machine still ticks (no harm in it ticking) but the blit is skipped. On `R` reset, the gun reappears in idle state with `bobPhase = 0` and `kickState = 'idle'`.
15. **No new console errors** for a 60-second session that includes: walking around, firing through a full magazine, dry-firing repeatedly, dying, and pressing `R` to reset.

## Out of Scope

- Multiple weapons / weapon switching (no shotgun, no rifle, no slot keys). Single pistol.
- Reload animation. The existing hitscan-weapon spec doesn't have a reload mechanic; this spec doesn't add one.
- Aiming-down-sights / iron sights. The gun stays at hip-level always.
- Bullet casings ejecting from the slide. Cool but out of scope; might land in a future "particle effects" spec.
- Gun hands / arms attached to the gun. The pistol is drawn alone; this is a stylistic choice that also halves the sprite work.
- A 3D gun model. This is a 2D billboard, period.
- Sound effects for fire / dry-fire (those are `polish-audio-minimap`'s domain — don't add audio inside this spec, even if `polish-audio-minimap` hasn't shipped yet).
- Camera shake on enemy hits. The "screen kick on fire" in #7 is the only screen-feel effect; player-take-damage shake belongs to a different spec if anyone wants it.
- Damage flash / hit indicators on the gun (e.g., gun turning red when low ammo). Not this spec.
- A scope overlay or zoom effect.

## Design Notes

- **Symbols this spec depends on / will modify:**
  - `render()` — gains a final blit step for the gun (and conditional flash) before / after the vignette per #4.
  - `update(dt)` — gains the bob accumulator and the kick state-machine tick. Both run before `render()` so all positions are up-to-date when blitting.
  - `hitscan-weapon`'s fire path — calls `onPlayerFire('shot' | 'dry')` at the moments described in #10.
  - `keys`, key event handlers — unchanged.
  - The death state from `hitscan-weapon` — read it (don't write it) to gate the gun blit per #14.
- **Gun sprite construction sketch** (one approach; implementer is free to refine):
  ```
  const PALETTE = {
    outline:   rgba32(20, 18, 22),
    bodyDark:  rgba32(60, 60, 70),
    bodyMid:   rgba32(100, 100, 110),
    bodyHi:    rgba32(170, 170, 180),
    grip:      rgba32(85, 55, 35),
    gripDark:  rgba32(55, 35, 22),
    sight:     rgba32(220, 200, 80),
    transparent: 0
  };
  function buildGun() {
    const spr = new Uint32Array(GUN_W * GUN_H);
    // 1. fill transparent (already 0)
    // 2. slide: horizontal box, body mid + top highlight + outline
    // 3. barrel: thinner box on right side of slide
    // 4. front sight: 3px tall warm-yellow nub at the muzzle top
    // 5. body / frame: triangle/parallelogram below the slide
    // 6. trigger guard: hollow ellipse approximation (or a hollow rectangle outlined)
    // 7. grip: angled box, brown with darker stippling
    // 8. outline pass: any pixel with a transparent neighbor and an opaque self gets the outline color
    return spr;
  }
  ```
  Use simple primitives (`fillRect`, `outlineRect`, `fillTriangle` if you want — easy enough to write inline). Don't overinvest in shading detail; pixel art reads better with fewer, more confident shapes.
- **Flash construction sketch.**
  - Frame 1 (smaller, hotter): a near-white center fading to warm yellow over ~6 px radius. Implement as nested radial fills.
  - Frame 2 (bigger, with rays): center yellow, plus 4–6 radial rays drawn as thin lines outward to ~10 px. Each ray gets dimmer-warm-orange tail.
  Both are written into their `Uint32Array(FLASH_W * FLASH_H)` once at startup.
- **Bob easing.** A simple low-pass on `bobIntensity`:
  ```
  const targetBob = mvLen / moveSpeed;
  bobIntensity += (targetBob - bobIntensity) * Math.min(1, 8 * dt);
  ```
  This produces the ~150 ms time constant called for in #6.
- **Kick state machine sketch.**
  ```
  let kickState = 'idle';
  let kickStart = 0;
  let kickKind  = 'shot'; // or 'dry'
  function onPlayerFire(kind) {
    kickState = 'kicking';
    kickKind  = kind;
    kickStart = performance.now();
  }
  function tickKick(now) {
    if (kickState === 'kicking') {
      const t = (now - kickStart) / KICK_UP_MS;
      if (t >= 1) { kickState = 'recovering'; kickStart = now; return; }
      // kickX, kickY, flashFrame computed from t and kickKind
    } else if (kickState === 'recovering') {
      const t = (now - kickStart) / KICK_RECOVER_MS;
      if (t >= 1) { kickState = 'idle'; return; }
      // ease kickX/Y back to 0 with (1 - t)^2
    }
  }
  ```
- **Blit with alpha test:**
  ```
  function blitGun(dx, dy, mulR=256, mulG=256, mulB=256) {
    for (let sy = 0; sy < GUN_H; sy++) {
      const py = dy + sy;
      if (py < 0 || py >= H) continue;
      for (let sx = 0; sx < GUN_W; sx++) {
        const px = dx + sx;
        if (px < 0 || px >= W) continue;
        const sc = GUN_SPRITE[sy * GUN_W + sx];
        if (sc === 0) continue;
        // optional: tint by mulR/G/B (used if you want a hit-feedback red tint someday;
        //           by default these stay 256 and the multiply is a no-op)
        buf32[py * W + px] = sc;
      }
    }
  }
  ```

## Agent Notes

- Read `AGENTS.md`, `specs/raycaster-mvp.md`, and `specs/hitscan-weapon.md` first. If `specs/atmosphere-lighting.md` is *implemented* on the branch you're on, read it too — its render-order ordering matters for #4. Make all changes inside the assigned worktree only.
- Single-file, vanilla JS, no build, no `package.json`. Same constraint as every previous spec.
- This spec is a pure addition: walk through `update(dt)` to add the bob and kick tick, walk through `render()` to add the blit, and find the two call sites in the existing hitscan-weapon code to fire `onPlayerFire('shot')` and `onPlayerFire('dry')`. Do not rearchitect the existing weapon code — *call into this spec from theirs*, don't move logic around.
- **Common pitfalls:**
  - **Gun pixels get vignetted** (if `atmosphere-lighting` is live). Per #4, blit the gun *after* the vignette pass. If you blit before, the gun corners darken and look wrong; if you exclude the gun bounding rect from the vignette, you also exclude any wall pixels inside that rect from the vignette — which is fine here because nothing important is behind the gun, but blitting after the vignette is cleaner.
  - **Bob doesn't decay smoothly.** A common bug is to set `bobIntensity = 0` when `mvLen === 0`; that snaps the gun. Use the low-pass.
  - **Bob direction wrong.** With `bobOffY = -Math.abs(Math.sin(bobPhase * 2)) * 2`, the gun rises on each footfall. If yours dips, you forgot the `Math.abs` (a raw `sin` makes it dip half the time, which feels like the floor is hitting the gun).
  - **Fire kick on dry-fire shows a flash.** Per #7 the dry-fire path *must not* draw the flash sprite. If it does, players will think they fired without ammo.
  - **Off-by-one alpha.** If your sprite generator writes `(0 << 24) | rgb` for "opaque" pixels you'll skip them in the alpha test (`sc === 0`). Use `(255 << 24) | rgb` for opaque, exact `0` for transparent.
  - **`onPlayerFire` called twice per click.** If hitscan-weapon's existing handler runs the same code on `mousedown` and `click`, you'll double-kick. One call per fire — read the hitscan-weapon source to find the canonical fire call site and hook there only.
  - **Death freeze leaves a winding-up gun on screen.** Per #14, skip the blit when dead. The kick state machine ticking is fine; just don't draw.
- Smoke-test before reporting:
  - Serve the file (`python3 -m http.server`). Confirm the gun is visible, idle, at the bottom-center.
  - Walk forward; gun should bob with a clear "footfall up" rhythm. Stop walking; gun glides to rest in ~150 ms.
  - Click; gun jumps up ~10 px, a yellow muzzle flash appears at the barrel exit for ~60 ms, then the gun eases back. Crosshair, ammo HUD, and any audio still fire as before.
  - Empty the magazine; click again; the gun does a small dip with no flash. Repeat several times — no flash, no bug.
  - Die (let an enemy kill you, if `enemy-ai-combat` is implemented; otherwise stand in contact damage). Gun disappears. Press `R`. Gun reappears in idle.
  - FPS counter stays ≥ 30 throughout. No console output.
  - Run `node --check` against the extracted `<script>` body.
- The viewmodel is the most-watched pixels on screen. Iterate on the sprite art — the pistol *must* read as a pistol at first glance. If yours doesn't, refine the silhouette before reporting done.

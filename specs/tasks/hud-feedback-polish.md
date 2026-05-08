---
id: hud-feedback-polish
area: frontend
priority: 50
depends_on: [hitscan-weapon, enemy-ai-combat, polish-audio-minimap]
description: Damage vignette, low-HP heartbeat pulse, low-ammo warning, damage-direction arrow, and kill-confirmation +1 pops
---

# HUD Feedback Polish — Make Damage and Kills Read at a Glance

## Goal

Layer five small visual-feedback elements onto the existing HUD so the player
can read the combat state without thinking: a damage flash when they get hit,
a heartbeat pulse at low HP, a low-ammo warning on the AMMO readout, a
direction arrow showing where damage came from, and a "+1" pop where each
kill happened. All additions are pure rendering and short-lived state — no
gameplay tuning, no `stats` schema changes, no new keybinds, no audio changes.

## Acceptance Criteria

1. **Single-file constraint preserved:** still one `index.html` at the repo root,
   no build, no external assets, no network requests, no `localStorage`. All new
   state lives in module-scope variables inside the existing IIFE.
2. **Existing HUD untouched:** crosshair (and its `hitTintUntil` red flick when
   *your* shot lands), muzzle flash overlay, FPS counter, minimap, HP bar +
   HP/AMMO/KILLS readouts, and the `YOU DIED — press R to restart` overlay all
   remain in their current positions and behave as they did before. The
   `stats` schema (`shotsFired`, `shotsHit`, `kills`, `deaths`,
   `enemyShotsFired`, `enemyShotsHit`) is not modified.
3. **Damage vignette on hit:** when the player takes any damage (ranged shot or
   contact), a translucent red border draws on all four screen edges and fades
   out over **~250 ms** (start alpha ~0.45, ease to 0). It is triggered:
   - Once per ranged hit, at the line where `enemyFireShot` applies
     `player.hp -= e.rangedDamage`.
   - At most once per **300 ms** while in continuous contact damage — throttle
     identically to the existing `nextContactHurtMs` pattern (use a separate
     `nextDmgFlashMs` so the audio and visual cadences stay independent).
4. **Low-HP heartbeat pulse:** while `player.hp > 0 && player.hp <= 30`, a
   gentle red pulse around the same screen edges modulates with a sine wave.
   Beat rate is **~1 Hz at HP=30** and ramps to **~2.5 Hz at HP=1** (linear in
   HP). Peak alpha is small (~0.20) so it reads as ambient pressure, not a
   flash. Heartbeat and damage vignette can be active simultaneously; the
   final edge alpha is the *max* of the two contributions, not their sum
   (max keeps the colour from saturating to opaque red).
5. **Low-ammo warning:** the existing **AMMO** readout in `drawHUD()` changes
   colour:
   - `ammo > 5` → unchanged (`#fff`).
   - `1 ≤ ammo ≤ 5` → solid warning red (e.g. `#f55`).
   - `ammo === 0` → pulses between two reds at ~3 Hz so the dry-fire state is
     unmissable.
   The HP and KILLS readouts are not affected. The HP-bar above the strip is
   not affected.
6. **Damage direction arrow:** when the player takes damage, a small filled
   triangle/wedge draws near the corresponding screen edge pointing *toward*
   the attacker, fades over **~600 ms**, and disappears.
   - The angle is computed from `(srcEnemy.x - player.x, srcEnemy.y - player.y)`
     converted to a *screen-space* angle relative to `player.dirX, player.dirY`
     (the player's forward maps to the top of the screen, so an enemy
     directly ahead produces an arrow at the top edge; directly behind →
     bottom edge; right → right edge; left → left edge).
   - Source for ranged hits: the firing `e` in `enemyFireShot`.
   - Source for contact damage: the *nearest* touching enemy (extend
     `applyContactDamage` to remember which enemy supplied the smallest
     squared distance and use that as the source).
   - Re-projected each frame using the current `player` state so the arrow
     stays aimed at the *world* point of the attacker even if the player
     turns. Stored angle is therefore world-relative (e.g. raw `atan2(dy, dx)`
     captured at the hit, plus the source-enemy reference is sufficient — pick
     one approach and document it).
   - If a fresh damage event fires while a prior arrow is still active,
     replace it (single-slot, not a list).
7. **Kill confirmation pop:** when an enemy dies in `fireShot()` (the
   `bestE.alive = false` branch), spawn a screen-space `+1` mark at the
   enemy's last world position. The mark:
   - Renders as `+1` in a small monospace font (e.g. `10px monospace`),
     bright colour (`#ffe` or `#ffd`), with a 1-px dark drop-shadow for
     legibility against bright walls.
   - Floats upward by ~12 px and fades from alpha 1 → 0 over **~500 ms**.
   - Is projected each frame via the same camera math used by `drawSprites()`
     (transformX / transformY); skip drawing when `transformY <= 0` (behind the
     player) — do *not* delete the pop in that case, just hide it that frame.
   - Multiple kills produce multiple independent pops; they are stored in an
     array and pruned on expiry. Cap the array at **16 active pops** as a
     safety; further pops are dropped silently rather than overflowing.
8. **Layering order in `render()`** (after the existing world buffer + sprite
   passes write to `buf32`):
   1. `ctx.putImageData(buf, 0, 0)` *(existing)*.
   2. `drawEnemyMuzzleFlashes()` *(existing)*.
   3. Crosshair + existing additive muzzle-flash overlay *(existing)*.
   4. **Damage edge vignette / heartbeat pulse (new)** — under the HUD strip.
   5. **Kill `+1` pops (new)** — between the world overlays and the HUD strip
      so they never cover the readouts.
   6. `drawMinimap()` *(existing)*.
   7. FPS counter *(existing)*.
   8. `drawHUD()` *(existing)*, with the new low-ammo colour logic inside it.
   9. **Damage direction arrow (new)** — on top of the HUD bar so it stays
      visible even when standing still in a corner; sits below the death
      overlay.
   10. `YOU DIED — press R to restart` overlay *(existing)*, topmost when
       active.
9. **Death state behaviour:**
   - Heartbeat pulse stops as soon as `player.hp <= 0` (gated on `> 0`).
   - The damage vignette and direction arrow may still finish their currently
     scheduled fade if death happens mid-flash — do not force-clear them.
   - Active kill pops continue to play out their fade; no new pops can spawn
     because no shots fire after death.
   - On **R-restart** (`resetWorld()` or whatever the existing reset path is
     called), all new transient state is cleared: `dmgVignetteUntil`,
     `nextDmgFlashMs`, the direction-arrow slot, and the kill-pops array.
     Add this reset alongside the existing `muzzleFlashUntil = 0; hitTintUntil = 0;`
     lines so the next run starts clean.
10. **Performance:** with all five elements active during normal play with all
    initial enemies alive, the existing **≥ 30 FPS** target still holds. Per
    frame this spec adds at most a handful of `fillRect` / `fillText` calls
    plus one `Math.sin` for the heartbeat — keep it that cheap (no
    per-pixel work, no shadow blurs, no extra `getContext`).
11. **No new console errors** for a 60-second session covering: getting shot,
    getting cornered into contact damage, dropping HP below 30, draining ammo
    to 0 and dry-firing, killing several enemies in quick succession, dying
    once and restarting with R.

## Out of Scope

- Audio changes — all existing SFX (`sfxShot`, `sfxHit`, `sfxKill`,
  `sfxHurt`, `sfxDryFire`) keep their current trigger sites and parameters.
- Numeric damage popups (other than the kill `+1`).
- Hit markers beyond the existing crosshair tint.
- Persistent settings (no localStorage, no in-game volume / vignette toggle).
- Replacing the death overlay or the R-restart flow.
- Modifying `stats`, gameplay tuning constants (`SHOT_DAMAGE`, `MAX_HP`,
  `CONTACT_DPS`, etc.), enemy AI, or weapon behaviour.
- Camera shake or motion blur.
- Accessibility colour-blind toggles or alternate palettes.
- Any Bayesian / adaptive logic.

## Design Notes

- **Symbols this task depends on** (already present from earlier specs):
  - `player.{x,y,dirX,dirY,planeX,planeY,hp}` — used for projection and angles.
  - `enemies` — for the contact-damage source lookup.
  - `MAX_HP`, `MAX_AMMO`, `ammo`, `stats.kills` — for HUD state read-only.
  - `nowMs` — already updated each frame; reuse it as the time source for all
    new `*Until` / `*At` timers (do not call `performance.now()` in render
    paths).
  - The sprite projection math at the top of `drawSprites()` — reuse it for
    kill-pop projection. Either factor a tiny helper `worldToScreenX(x, y)`
    that returns `{ screenX, transformY }` or copy the four-line camera block
    inline with a comment pointing at `drawSprites`.
- **New module-scope state to add (close to the existing
  `muzzleFlashUntil` / `hitTintUntil` declarations):**
  ```js
  let dmgFlashUntil = 0;       // expiry for the red-edge damage flash
  let dmgFlashAt = 0;          // nowMs when the flash was triggered (for fade math)
  let nextDmgFlashMs = 0;      // throttle for continuous contact damage
  // Single-slot direction arrow.
  // worldAngle = atan2(srcY - player.y, srcX - player.x) at trigger time;
  // re-derived to screen-relative angle each frame using current player.dir*.
  let dmgArrow = null;         // { worldAngle, untilMs, atMs } | null
  // FIFO of active kill pops, bounded by KILL_POP_MAX.
  const killPops = [];         // [{ x, y, untilMs, atMs }, …]
  const KILL_POP_MAX = 16;
  ```
- **Hook points (one-line additions, kept adjacent to the existing
  hp-mutation lines):**
  - In `enemyFireShot()` after `player.hp -= e.rangedDamage`:
    ```js
    triggerDamageFlash(now);
    setDamageArrow(e, now);
    ```
  - In `applyContactDamage()`: while iterating the enemies for the radius
    check, also track the smallest squared distance and the corresponding
    enemy reference. After `player.hp -= CONTACT_DPS * dt`:
    ```js
    if (nowMs >= nextDmgFlashMs) {
      triggerDamageFlash(nowMs);
      nextDmgFlashMs = nowMs + 300;
    }
    if (nearestE) setDamageArrow(nearestE, nowMs);
    ```
    `setDamageArrow` itself can run every frame (it just overwrites the slot);
    only the *flash* needs the 300 ms throttle.
  - In `fireShot()` after `bestE.alive = false`:
    ```js
    if (killPops.length < KILL_POP_MAX) {
      killPops.push({ x: bestE.x, y: bestE.y, atMs: now, untilMs: now + 500 });
    }
    ```
- **Vignette / heartbeat drawing** — single function, called between the
  crosshair/muzzle-flash overlays and the kill-pop pass:
  ```js
  function drawDamageEdges() {
    let alphaFlash = 0;
    if (nowMs < dmgFlashUntil) {
      const t = 1 - (dmgFlashUntil - nowMs) / 250;       // 0 → 1
      alphaFlash = 0.45 * (1 - t);                       // ease-out linear is fine
    }
    let alphaPulse = 0;
    if (player.hp > 0 && player.hp <= 30) {
      const hpFrac = player.hp / 30;                     // 1 at full bar, 0 at zero
      const rateHz = 1 + (1 - hpFrac) * 1.5;             // 1 → 2.5 Hz
      const phase = (nowMs / 1000) * rateHz * 2 * Math.PI;
      alphaPulse = 0.10 + 0.10 * (Math.sin(phase) * 0.5 + 0.5);
    }
    const a = Math.max(alphaFlash, alphaPulse);
    if (a <= 0) return;
    ctx.fillStyle = `rgba(220, 30, 30, ${a.toFixed(3)})`;
    const T = 28;                                        // edge thickness
    ctx.fillRect(0, 0, W, T);
    ctx.fillRect(0, H - T, W, T);
    ctx.fillRect(0, 0, T, H);
    ctx.fillRect(W - T, 0, T, H);
  }
  ```
- **Kill-pop drawing** — runs after vignette, before HUD:
  ```js
  function drawKillPops() {
    for (let i = killPops.length - 1; i >= 0; i--) {
      const p = killPops[i];
      if (nowMs >= p.untilMs) { killPops.splice(i, 1); continue; }
      const t = (nowMs - p.atMs) / (p.untilMs - p.atMs); // 0 → 1
      // World → screen via existing sprite camera math:
      const camX = p.x - player.x;
      const camY = p.y - player.y;
      const invDet = 1 / (player.planeX * player.dirY - player.dirX * player.planeY);
      const transformX = invDet * (player.dirY * camX - player.dirX * camY);
      const transformY = invDet * (-player.planeY * camX + player.planeX * camY);
      if (transformY <= 0) continue;                     // behind the player
      const screenX = ((W >> 1) * (1 + transformX / transformY)) | 0;
      const screenY = (H >> 1) - (12 * t) | 0;           // float up ~12 px
      const a = 1 - t;
      ctx.font = '10px monospace';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(0,0,0,${(a*0.7).toFixed(3)})`;
      ctx.fillText('+1', screenX + 1, screenY + 1);      // shadow
      ctx.fillStyle = `rgba(255,255,224,${a.toFixed(3)})`;
      ctx.fillText('+1', screenX, screenY);
    }
  }
  ```
- **Direction arrow** — runs after `drawHUD()` so it stays readable on top of
  the strip:
  ```js
  function drawDamageArrow() {
    if (!dmgArrow) return;
    if (nowMs >= dmgArrow.untilMs) { dmgArrow = null; return; }
    const t = (nowMs - dmgArrow.atMs) / (dmgArrow.untilMs - dmgArrow.atMs);
    const a = 1 - t;
    // Convert world angle → screen-relative angle.
    // forward is "up" on screen, so screenAngle = worldAngle - playerForwardAngle - π/2
    const fwd = Math.atan2(player.dirY, player.dirX);
    const screenAngle = dmgArrow.worldAngle - fwd - Math.PI / 2;
    const cx = W / 2, cy = H / 2;
    const radius = Math.min(W, H) / 2 - 28;
    const ax = cx + Math.cos(screenAngle) * radius;
    const ay = cy + Math.sin(screenAngle) * radius;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(screenAngle + Math.PI / 2); // tip points outward
    ctx.fillStyle = `rgba(220, 30, 30, ${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-5, 4);
    ctx.lineTo(5, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ```
  ⚠️ The exact rotation expression above is the reference; the implementing
  agent should sanity-check it by triggering damage from each cardinal
  direction (front / back / left / right of the player) before claiming the
  spec is done. See *Agent Notes — Common pitfalls*.
- **`setDamageArrow(srcEnemy, t)`**:
  ```js
  function setDamageArrow(srcEnemy, t) {
    const dx = srcEnemy.x - player.x;
    const dy = srcEnemy.y - player.y;
    if (dx === 0 && dy === 0) return;
    dmgArrow = {
      worldAngle: Math.atan2(dy, dx),
      atMs: t,
      untilMs: t + 600,
    };
  }
  ```
- **Low-ammo colour change** — inside `drawHUD()`, replace the single
  `ctx.fillStyle = '#fff'` for the AMMO line with a small ternary:
  ```js
  let ammoColor = '#fff';
  if (ammo === 0) {
    // ~3 Hz between two reds
    ammoColor = (Math.floor(nowMs / 167) % 2 === 0) ? '#f55' : '#a22';
  } else if (ammo <= 5) {
    ammoColor = '#f55';
  }
  // …draw HP white, set fillStyle = ammoColor before AMMO, restore '#fff' before KILLS.
  ```

## Agent Notes

- Read `AGENTS.md`, `specs/raycaster-mvp.md`, `specs/sprite-enemies.md`,
  `specs/hitscan-weapon.md`, `specs/enemy-ai-combat.md`, and
  `specs/polish-audio-minimap.md` first. Make all changes inside the assigned
  worktree only.
- Single-file, vanilla JS, no build, no `package.json`, no external assets.
  Same constraint as every previous spec.
- **Do not modify gameplay-affecting state.** This task adds rendering side
  effects only. The `stats` schema is frozen by `hitscan-weapon`. Tuning
  constants (`SHOT_DAMAGE`, `MAX_HP`, `CONTACT_DPS`, `MAX_AMMO`, etc.) are
  unchanged.
- Reuse the existing sprite projection math; do not re-derive a different
  camera transform for kill pops. If you find yourself writing matrix code,
  you've gone too deep — a four-line copy of the `drawSprites()` block is the
  intended solution.
- Common pitfalls:
  - **Vignette stacking on continuous contact damage.** The contact-damage
    path runs every frame while the player overlaps an enemy. Without the
    `nextDmgFlashMs` throttle, the vignette is constantly retriggered and
    becomes a steady opaque red wash instead of a pulse.
  - **Heartbeat continuing after death.** Gate on `player.hp > 0`, not just
    `<= 30`. Otherwise the death overlay sits on top of an oscillating red
    pulse and looks broken.
  - **Direction arrow rotation off by 90° or 180°.** The player's forward
    `(dirX, dirY)` maps to the *top* of the screen, not the right. The
    reference formula in *Design Notes* uses
    `screenAngle = worldAngle − atan2(dirY, dirX) − π/2`. Verify by getting
    shot from each cardinal direction:
      - directly ahead → arrow on top edge,
      - directly behind → bottom edge,
      - to the player's right → right edge,
      - to the player's left → left edge.
    If any of those four are wrong, the formula is wrong; fix it before
    declaring done.
  - **Kill pop drawn for an enemy behind the player.** The sprite projection
    only valid for `transformY > 0`. Skip drawing for that frame, but keep
    the pop alive — when the player turns around the pop should resume
    rendering until its own expiry.
  - **Forgetting to clear new state on R-restart.** The existing reset clears
    `muzzleFlashUntil` and `hitTintUntil`; add `dmgFlashUntil`,
    `nextDmgFlashMs`, `dmgArrow = null`, and `killPops.length = 0`. A second
    run that starts already pulsing or with stale pops is a regression.
  - **Drawing kill pops on top of the HUD bar.** The HUD strip is the
    primary readout; pops floating across it are noise. Draw pops *before*
    `drawHUD()` (between the vignette and the HUD), per the layering order
    in AC #8.
  - **Using `performance.now()` inside the new draw helpers.** `nowMs` is
    already updated once per frame in the existing `loop()`; reuse it so all
    timers stay in sync.
- Smoke-test before reporting:
  - Serve locally (`python3 -m http.server`) and open in a browser.
  - Stand in the open and let an enemy shoot you: red border flash, brief
    direction arrow pointing at the shooter; AMMO unchanged; no `+1` pop.
  - Walk into an enemy: continuous contact damage produces a *pulsing* (not
    stuck-on) vignette; arrow tracks the touching enemy as you turn.
  - Take damage until HP ≤ 30: heartbeat pulse becomes visible; speeds up
    visibly as HP drops further.
  - Empty the magazine: AMMO turns red at 5, pulses at 0, dry-fire still
    plays the existing dry-click SFX.
  - Kill one enemy in front of you: a `+1` pops near where it was, drifts up,
    fades out in ~½ s. Kill three in a quick burst: three independent pops.
  - Die, press R: HUD resets, no leftover vignette / pops / arrow.
  - Open DevTools and confirm no new errors or warnings during the above.
  - At minimum, run `node --check` against the extracted `<script>` body to
    catch syntax errors.
- Keep the new draw helpers (`drawDamageEdges`, `drawKillPops`,
  `drawDamageArrow`) in a clearly delimited section near the existing
  `drawHUD` / `drawMinimap`, so subsequent specs can locate them quickly.

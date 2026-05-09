---
id: enemy-attack-feel-polish
area: frontend
priority: 50
depends_on: []
description: Per-type imp/grunt attack cadence in TYPE_TABLE plus distinct fire and windup SFX with distance volume rolloff
---

# Enemy Attack Feel — Differentiated Imp / Grunt Cadence and Audio

## Goal

Imps and grunts currently fire identical hitscan attacks: same windup, same
cooldown, no audio cue for the shot itself, and no audible "tell" for
off-screen telegraphs. This task differentiates the two enemy types by attack
*cadence* (windup / cooldown) and adds four new SFX so every enemy shot is
heard — even when it misses or comes from behind. The change is purely about
attack feel: damage, HP, movement speed, attack range, the visual red
telegraph, hit detection, and the gameplay state machine all stay as they are.

## Acceptance Criteria

1. **Single-file constraint preserved.** Still one `index.html` at the repo
   root, no `package.json`, no external assets, no build step, no
   `localStorage`, no network requests. All new state lives inside the
   existing IIFE.
2. **`stats` schema unchanged.** No new fields, no renames. The existing
   `enemyShotsFired` / `enemyShotsHit` counters keep their current trigger
   sites in `enemyFireShot`.
3. **Per-type cadence in `TYPE_TABLE`.** Each entry of `TYPE_TABLE` (around
   `index.html:504-507`) gains two new numeric fields:
   - `windupMs` — duration of the wind telegraph for this type
   - `cooldownMs` — duration of the post-fire cool freeze for this type

   Concrete values for this spec:

   | type   | windupMs | cooldownMs |
   |--------|---------:|-----------:|
   | imp    | 350      | 700        |
   | grunt  | 900      | 1600       |

   These numbers are part of the spec; do not retune them. Future balance
   work is a separate spec.
4. **Existing global constants `WINDUP_MS` and `ATTACK_COOLDOWN_MS` are
   removed.** Every read site in `aiTick` / `enemyFireShot` reads
   `TYPE_TABLE[e.type].windupMs` / `.cooldownMs` instead. `ATTACK_RANGE`,
   `ENEMY_FIRE_FLASH_MS`, `CONTACT_DPS`, `CONTACT_RADIUS`, `ENEMY_AI_RADIUS`,
   and `ENEMY_SEPARATION_R` are unchanged.
5. **Wind-mode entry plays a per-type "tell" SFX exactly once.** When an
   enemy transitions into `wind` (from `idle` or from `chase`), a short
   per-type windup-start SFX plays:
   - `imp`  → `sfxImpWindup()` (brief high chirp)
   - `grunt` → `sfxGruntWindup()` (brief low growl)

   The tell does **not** replay every frame, does not replay if a wind is
   cancelled and re-entered in the same frame, and does not play on
   `cool → idle` or `idle → chase` transitions. A fresh `idle/chase → wind`
   transition on a later frame replays the tell normally — there is no
   per-enemy suppression beyond "play it on the transition".
6. **`enemyFireShot` plays a per-type fire SFX every shot, before the
   LOS / range gate.** Concretely:
   - `imp`  → `sfxImpFire(vol)` (light high-pitched "pew")
   - `grunt` → `sfxGruntFire(vol)` (low sweep "thud")

   The fire SFX is heard regardless of whether the shot connects, breaks LOS,
   or fizzles on range — i.e., it sits at the top of `enemyFireShot`,
   alongside `e.fireFlashUntil = now + ENEMY_FIRE_FLASH_MS`, **before** the
   `if (!e.alive) return;` and the LOS / range early-returns.
7. **Distance volume rolloff.** Both the windup tell and the fire SFX scale
   their `peak` linearly by a `distanceVolume(srcX, srcY)` helper:
   ```js
   const MAX_AUDIBLE_DIST = 12; // cells; ~2.4× ATTACK_RANGE
   function distanceVolume(srcX, srcY) {
     const dx = srcX - player.x, dy = srcY - player.y;
     const d = Math.hypot(dx, dy);
     if (d >= MAX_AUDIBLE_DIST) return 0;
     return 1 - d / MAX_AUDIBLE_DIST;
   }
   ```
   - At dist 0 → full volume (1.0).
   - At dist `ATTACK_RANGE` (5.0) → ~58% volume.
   - At dist ≥ `MAX_AUDIBLE_DIST` (12) → 0; the SFX function early-returns
     without scheduling a Web Audio node, so far-away enemies are free.

   No panning is added. No `StereoPannerNode`, no `PannerNode`. The masterGain
   path is the only audio path.
8. **Existing player-hit SFX (`sfxHurt`) is unchanged.** It still triggers
   inside `enemyFireShot` only after a confirmed hit (the existing
   `stats.enemyShotsHit++; player.hp -= e.rangedDamage; sfxHurt();` block
   stays intact). It is **not** affected by `distanceVolume`.
9. **Visual telegraph unchanged.** The red wind-mode sprite tint, the
   `fireFlashUntil` red-flash on shot, the muzzle-flash overlays, and the
   damage vignette / direction arrow / kill pops from
   `hud-feedback-polish` all behave exactly as before.
10. **No new console errors or warnings** during a 60-second session that
    covers: getting shot by an imp, getting shot by a grunt, hearing a
    windup from behind without facing the enemy, an enemy windup that
    cancels (player breaks LOS mid-windup), an enemy at exactly
    `ATTACK_RANGE` firing, an enemy past `MAX_AUDIBLE_DIST` (no audio at
    all), dying mid-fire, R-restart, and N-regenerate.
11. **Performance.** With all initial enemies alive, the existing ≥ 30 FPS
    target still holds. Per frame this spec adds at most one
    `Math.hypot` call per AI transition (already cheap) and at most one
    `blip` per windup start + one per fire — no per-pixel work, no shadow
    blurs, no extra `getContext`.
12. **R-restart and N-regenerate don't require any new state to clear.**
    No new module-scope mutable state is introduced by this spec — `TYPE_TABLE`
    is read-only data, the new SFX functions are pure, `distanceVolume` is
    pure, and the windup-tell / fire SFX are fired at transition / call
    sites without any new `*Until` flags. Verify that after R or N the
    next shot still produces correctly-tuned audio.

## Out of Scope

- Per-type `ATTACK_RANGE` differentiation. Range stays a single shared
  constant.
- Spatial / panned audio (`StereoPannerNode`, `PannerNode`, HRTF). Mono via
  `masterGain` only.
- Burst fire (multiple shots per windup), spread, projectile travel time,
  miss-chance dice rolls. Hitscan accuracy is unchanged.
- New enemy types or sprites.
- Damage / HP / move-speed retuning. `rangedDamage`, `hp`, `moveSpeed`,
  `meleeRadius` in `TYPE_TABLE` are not edited.
- Stats schema changes. No new counters, no renames.
- HUD changes (no on-screen "incoming!" indicator beyond the existing
  damage arrow once a shot lands).
- Volume / mute UI controls beyond the existing `M`-mute toggle.
- Anything Bayesian or adaptive.

## Design Notes

- **Files involved:** `index.html` only.
- **Hook points (line numbers reflect current state of the file, expect
  small drift after edits):**
  - `TYPE_TABLE` literal at `index.html:504-507`: add `windupMs` /
    `cooldownMs` to each entry.
  - `WINDUP_MS = 600` and `ATTACK_COOLDOWN_MS = 1200` near
    `index.html:65-66`: delete both lines. Replace each downstream read.
  - `aiTick` near `index.html:911-972`: three uses of `WINDUP_MS` /
    `ATTACK_COOLDOWN_MS` need to be replaced and the wind-entry needs to
    play the tell SFX.
  - `enemyFireShot` near `index.html:885-909`: insert the per-type fire SFX
    at the top, before the early-return guards.
  - SFX block near `index.html:183-187`: add four new `sfx*` helpers and
    one `distanceVolume` helper. Keep them adjacent to the existing
    `sfxShot` / `sfxHit` / `sfxKill` / `sfxHurt` / `sfxDryFire` so future
    audio work is co-located.

- **Shape of the new SFX helpers** (mirror the existing `blip`-wrapper
  style at lines 183-187):

  ```js
  // dist-scaled blips: peak is multiplied by `vol` (0..1). Caller is
  // expected to pass `distanceVolume(srcX, srcY)`. vol === 0 ⇒ no node
  // scheduled — early return keeps far enemies free.
  function sfxImpFire(vol) {
    if (vol <= 0) return;
    blip({ type: 'square',   freq: 580, dur: 0.05, attack: 0.001, decay: 0.045, peak: 0.55 * vol });
  }
  function sfxGruntFire(vol) {
    if (vol <= 0) return;
    blip({ type: 'sawtooth', freq: 240, endFreq: 90,  dur: 0.12, attack: 0.003, decay: 0.115, peak: 0.65 * vol });
  }
  function sfxImpWindup(vol) {
    if (vol <= 0) return;
    blip({ type: 'sine',     freq: 700, endFreq: 900, dur: 0.10, attack: 0.005, decay: 0.090, peak: 0.40 * vol });
  }
  function sfxGruntWindup(vol) {
    if (vol <= 0) return;
    blip({ type: 'sawtooth', freq: 110, endFreq: 80,  dur: 0.18, attack: 0.005, decay: 0.170, peak: 0.45 * vol });
  }
  ```

  These numbers are starting values; minor tweaks for taste are fine but
  the *character* must be preserved (imp = bright + short, grunt =
  low + sweep-down + slightly longer). Don't restructure `blip` itself.

- **Wiring `windupSfx` / `fireSfx` per type.** Either of these is fine,
  pick one:
  1. Add `windupSfx` / `fireSfx` function references to each `TYPE_TABLE`
     entry and call `TYPE_TABLE[e.type].windupSfx(vol)` / `.fireSfx(vol)`.
  2. Use a `switch (e.type)` block at each call site (only two sites:
     `enemyFireShot` and the wind-entry helper).

  Option 1 keeps the dispatch table-driven; option 2 keeps `TYPE_TABLE`
  data-only. Either is acceptable as long as the call sites are short.

- **Wind-entry helper** to centralise the two transitions (idle→wind and
  chase→wind):

  ```js
  function enterWind(e, now) {
    e.mode = 'wind';
    e.modeUntil = now + TYPE_TABLE[e.type].windupMs;
    const vol = distanceVolume(e.x, e.y);
    if (e.type === 'imp') sfxImpWindup(vol);
    else if (e.type === 'grunt') sfxGruntWindup(vol);
  }
  ```

  Then in `aiTick`, replace both occurrences of:

  ```js
  e.mode = 'wind';
  e.modeUntil = now + WINDUP_MS;
  ```

  with `enterWind(e, now);`. The fire-then-cool block at lines 930-934
  becomes:

  ```js
  if (e.mode === 'wind' && now >= e.modeUntil) {
    enemyFireShot(e, now);
    e.mode = 'cool';
    e.modeUntil = now + TYPE_TABLE[e.type].cooldownMs;
    continue;
  }
  ```

- **Fire SFX placement inside `enemyFireShot`.** Add the per-type fire
  SFX call **before** any early returns, right after the existing
  `stats.enemyShotsFired++` / `e.fireFlashUntil = now + ENEMY_FIRE_FLASH_MS`
  pair. This way a shot whose windup completed but whose ray ends up
  blocked by a wall / out of range still produces audible feedback —
  matching the visual flash that already plays in that case.

  Sketch:

  ```js
  function enemyFireShot(e, now) {
    stats.enemyShotsFired++;
    e.fireFlashUntil = now + ENEMY_FIRE_FLASH_MS;
    const fireVol = distanceVolume(e.x, e.y);
    if (e.type === 'imp') sfxImpFire(fireVol);
    else if (e.type === 'grunt') sfxGruntFire(fireVol);
    // …existing early-returns + hit math + sfxHurt() / triggerDamageFlash() …
  }
  ```

- **`MAX_AUDIBLE_DIST` constant** lives at the top of the file alongside
  the other tuning constants (e.g., next to `ATTACK_RANGE`). One line.

## Agent Notes

- **Read first:** `AGENTS.md`, `CLAUDE.md`, this spec, then the AI block in
  `index.html` end-to-end (lines ~480-1000 cover audio + AI + contact
  damage). Make all edits inside the assigned worktree only.
- **Order of work:**
  1. Add `MAX_AUDIBLE_DIST` and `distanceVolume(srcX, srcY)`.
  2. Add the four `sfx*` helpers next to the existing `sfx*` block.
  3. Edit `TYPE_TABLE` entries to include `windupMs` / `cooldownMs` (and
     optionally `windupSfx` / `fireSfx` refs if going with the
     table-driven dispatch).
  4. Delete the global `WINDUP_MS` and `ATTACK_COOLDOWN_MS` constants.
  5. Add `enterWind(e, now)` and replace both wind-entry sites in
     `aiTick`.
  6. Replace the cooldown line in `aiTick` to use
     `TYPE_TABLE[e.type].cooldownMs`.
  7. Insert the per-type fire SFX call near the top of `enemyFireShot`.
  8. Run `node --check` against the extracted `<script>` body to catch
     syntax errors.
  9. Smoke-test in the browser.
- **Common pitfalls:**
  - **Forgetting one of the two wind-entry sites.** `aiTick` enters `wind`
    from both `idle` and `chase`. Both must call `enterWind` (or
    equivalently set `modeUntil` from the type table and play the tell).
    Missing one means imp/grunt cadence will silently fall back to the
    deleted constant and crash with `ReferenceError`.
  - **Tell SFX replaying every frame.** The tell must only play on the
    transition into `wind`, not while the enemy *is* in wind. The
    `enterWind` helper structure naturally guards this — don't add it
    inside the per-frame "if mode === 'wind'" branch.
  - **Wind cancellation re-firing the tell.** A wind that gets cancelled
    by losing LOS goes to `idle`; if LOS comes back the same frame, the
    next wind-entry plays the tell again. That is the intended behavior —
    do not add suppression. Just make sure cancellation paths
    (`e.mode = 'idle'; e.modeUntil = 0;` at lines 961-962 and 964-965) do
    not call `enterWind`.
  - **Fire SFX placed after the LOS/range gate.** That would suppress the
    SFX for every shot that gets blocked, which is exactly the case where
    audible feedback matters most (the player just dodged). Place it
    above the gates, mirroring `e.fireFlashUntil`.
  - **`sfxHurt` left scaled by distance.** The player-hit SFX is for the
    *player*, not the enemy in the world. Leave it at full volume — do
    not pass `vol` into it.
  - **Distance computed against `e.x, e.y` after the enemy moved.** All
    new SFX calls happen at AI tick time (before `separateEnemies`); the
    enemy's position is current. Just don't move the SFX call below
    `separateEnemies` — keep them in the same code paths as the visual
    flash.
  - **Cool-mode using the wrong type's `cooldownMs`.** The cool transition
    happens immediately after `enemyFireShot`; `e.type` is still that
    enemy's type. Read `TYPE_TABLE[e.type].cooldownMs`, not a captured
    value from earlier in the loop.
  - **`MAX_AUDIBLE_DIST` defined inside a function.** Constants live at
    file-scope inside the IIFE, alongside `ATTACK_RANGE` etc. A function-
    local re-declaration on every call is wasteful and obscures the
    tuning surface.
- **Smoke test before reporting:**
  - Serve with `python3 -m http.server` and open in a browser.
  - Stand near an imp; confirm a brief high chirp ~350 ms before its
    shot, followed by a snappy "pew" on fire. Get hit; `sfxHurt` still
    plays. Imp re-fires roughly once per second.
  - Lure a grunt into LOS; confirm a low growl ~900 ms before its shot,
    followed by a low sweep "thud". Grunt re-fires roughly once per
    2.5 s.
  - Strafe out of LOS during a windup; the windup tell already played
    but no fire SFX should follow. Step back into LOS — a fresh wind
    plays a fresh tell.
  - Get within attack range and let an enemy fire while you face away;
    confirm both the windup tell and the fire are audible from behind
    (no panning, just full mono).
  - Stand far away (past the audible distance) from a lone enemy; you
    should not hear its windup or fire even when it's actively shooting
    (e.g., at another enemy is not a thing, so just confirm
    no audio when the enemy is well past `MAX_AUDIBLE_DIST`).
  - Empty the magazine, walk into a contact-damaging clump; the contact
    damage path is unchanged — `sfxHurt` cadence is the same as before.
  - Die, press R: a freshly-revived enemy should still produce the
    correct tell + fire SFX on its first attack.
  - Press N to regenerate: same — the new map's first enemy attacks
    audibly with correct per-type SFX.
  - DevTools console: no new errors or warnings.
- **At minimum** run `node --check` against the extracted `<script>`
  body before reporting.
- Keep `sfxImpFire`, `sfxGruntFire`, `sfxImpWindup`, `sfxGruntWindup`,
  and `distanceVolume` in a single visually-grouped block immediately
  below the existing `sfxDryFire` line so subsequent audio specs can
  locate them quickly.

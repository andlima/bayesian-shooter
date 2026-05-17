---
id: shotgun-weapon-pickup
area: frontend
priority: 50
depends_on: []
description: Add a second weapon — a spread shotgun found as a seed-safe world pickup — with a shared ammo pool, its own procedural viewmodel, and pistol/shotgun switching on keyboard and touch
---

# Shotgun — A Second Weapon, Found in the Dungeon

## Goal

The game ships exactly one weapon: a single-shot hitscan pistol. Add a
**spread shotgun** as a second weapon. The player still starts every run
with the pistol; somewhere in each dungeon there is exactly one shotgun
pickup. Walking over it grants the shotgun for the rest of the run (it
carries across level exits, and is lost only on a full run reset). The two
weapons share the existing single ammo pool — the shotgun just costs more
ammo per trigger pull and fires a fixed cone of pellets instead of one
ray. The player switches weapons with `1`/`2` (or a cycle key) on desktop,
and by tapping the weapon label on touch devices.

This is a self-contained gameplay + rendering addition. It must not change
the pistol's existing feel, the seeded dungeon/enemy/pickup layout for any
existing `?seed=` URL, or the `stats` schema that downstream Bayesian specs
depend on.

## Acceptance Criteria

### Single-file & determinism constraints

1. Still one `index.html` at the repo root: no build step, no new files
   (no separate JS/CSS/asset files), no bundler, no network requests, no
   dependencies. All new sprites are generated procedurally in JS at
   startup, exactly like the existing gun viewmodel and pickup sprites.
2. **Seed contract preserved.** Adding the shotgun world pickup must not
   change the byte-for-byte enemy, health/ammo-pickup, or dungeon-tile
   layout produced by `generateDungeon(seed)` for any seed that worked
   before this change. Concretely: every `rand()` call the shotgun
   placement makes must occur **strictly after** the existing
   `newPickupSpawns` construction loop completes (i.e. appended just
   before `generateDungeon`'s `return`), so no pre-existing roll's
   consumed RNG value shifts. Same seed → same shotgun location across
   reloads. `Math.random()` is forbidden in this placement path (use the
   generator's `rand()`), consistent with the rest of the dungeon
   generator.
3. The first rendered frame remains deterministic across reloads for a
   fixed seed (the existing project invariant).

### Weapon data model

4. A module-scope `WEAPONS` registry holds two entries keyed by id —
   `'pistol'` and `'shotgun'` — each carrying at minimum: display `name`,
   `cooldownMs`, `ammoCost` (ammo consumed per trigger pull), `pellets`
   (rays cast per trigger pull), `spreadRad` (total cone half-extent in
   radians; `0` for the pistol), per-pellet `damage`, the viewmodel
   `sprite`, and the muzzle-flash barrel anchor (`barrelX`, `barrelY`).
   The pistol's entry must reproduce **today's exact behavior**:
   `cooldownMs = FIRE_COOLDOWN_MS (250)`, `ammoCost = 1`, `pellets = 1`,
   `spreadRad = 0`, `damage = SHOT_DAMAGE (2)`, the existing `GUN_SPRITE`,
   and the existing `BARREL_X`/`BARREL_Y` anchor.
5. Shotgun tuning constants live in the constants block (the
   `// Combat tuning` region around `index.html:93`) as named `const`s, not
   magic numbers buried in `fireShot`. Required initial values (these are
   the contract — implement exactly, do not "rebalance"):
   - `SHOTGUN_PELLETS = 7`
   - `SHOTGUN_SPREAD_RAD = 0.13` (total cone is `±SHOTGUN_SPREAD_RAD`)
   - `SHOTGUN_PELLET_DAMAGE = 1`
   - `SHOTGUN_AMMO_COST = 3`
   - `SHOTGUN_COOLDOWN_MS = 650`
   Pellet ray directions are a **fixed, deterministic, symmetric** fan:
   `SHOTGUN_PELLETS` rays evenly spaced across
   `[-SHOTGUN_SPREAD_RAD, +SHOTGUN_SPREAD_RAD]` (the middle pellet is dead
   center on the player's facing). No randomness in the spread — same aim
   → same pattern every time.
6. Current weapon is tracked in a single module-scope binding (e.g.
   `let weapon = 'pistol';`) plus an ownership flag (e.g.
   `let hasShotgun = false;`). The shotgun cannot be selected while
   `hasShotgun` is false.

### Firing

7. `fireShot()` is generalized to fire the **currently selected weapon**
   using its `WEAPONS` entry, and the pistol path is behaviorally
   unchanged (same single ray, same `SHOT_DAMAGE`, same 250 ms cooldown,
   same muzzle flash/kick/SFX/hit-tint, same dry-fire behavior). The
   cooldown gate uses the active weapon's `cooldownMs`. The dry-fire
   branch triggers when `ammo < activeWeapon.ammoCost` (so the shotgun
   dry-fires when fewer than `SHOTGUN_AMMO_COST` rounds remain), playing
   `sfxDryFire()` and `onPlayerFire('dry')` exactly as today, with no
   ammo/stat mutation and no cooldown reset.
8. A shotgun trigger pull: decrements `ammo` by `SHOTGUN_AMMO_COST`
   (never below 0), casts `SHOTGUN_PELLETS` independent hitscan rays along
   the fixed fan, and for each pellet resolves the nearest live enemy
   using the **same wall-block + ray-vs-circle (`ENEMY_RADIUS`) primitive
   the pistol uses today** (`castRay` for the wall distance, the existing
   projected-distance / perpendicular test for enemies). Each connecting
   pellet deals `SHOTGUN_PELLET_DAMAGE` to the enemy it hits; an enemy
   crossing `hp <= 0` dies exactly as in the current pistol path
   (`alive = false`, `stats.kills++`, `sfxKill()`, the capped `+1`
   `killPops` entry). Multiple pellets may hit the same enemy in one pull
   and stack damage. Enemy hit-flash (`hitFlashUntil`) and the player
   hit-tint (`hitTintUntil`) fire if **any** pellet connects.
9. **`stats` schema and Bernoulli contract preserved.** One trigger pull
   is **one** Bernoulli trial regardless of weapon: each successful
   (non-dry) trigger pull increments `stats.shotsFired` by exactly `1`,
   and increments `stats.shotsHit` by exactly `1` **iff at least one
   pellet connected** (never by the pellet count). `stats.kills` /
   `stats.deaths` / `enemyShotsFired` / `enemyShotsHit` semantics and the
   object's field names are unchanged. No new fields are added to `stats`.
10. The shotgun reuses the existing kick / muzzle-flash / FOV-punch /
    muzzle-wash state machine via `onPlayerFire('shot')` — no second copy
    of that machinery. It is acceptable (and encouraged) for the shotgun
    to feel punchier; if you scale the kick, do it through a per-weapon
    multiplier read from the `WEAPONS` entry inside the existing
    `getKickOffsets`, not by forking the state machine. The muzzle flash
    must anchor at the active weapon's barrel anchor.

### Viewmodel

11. A `SHOTGUN_SPRITE` is built once at startup by a `buildShotgun()`
    function analogous to `buildGun()`, into a `Uint32Array(GUN_W * GUN_H)`
    with the same alpha convention (`0` = transparent/skip, fully opaque
    otherwise) so it drops into the existing `drawGunViewmodel` blit with
    **no change to the blit math, `GUN_W`/`GUN_H`, bob, sway, equip-slide,
    or shadow code**. `drawGunViewmodel` selects the sprite and barrel
    anchor from the active weapon's `WEAPONS` entry. Pixel-art quality bar:
    a player must immediately read it as a **shotgun** (long horizontal
    barrel(s), pump/fore-end under the barrel, stock to the lower-rear),
    visibly distinct from the pistol, drawn in a small cohesive palette in
    the same flat Doom-style centered framing as the pistol.
12. With the pistol selected the rendered frame is **byte-identical to
    today** (the pistol sprite, its barrel anchor, kick magnitudes, and
    flash are unchanged). Switching to the shotgun re-arms the existing
    equip slide-in (`equipFramesLeft = EQUIP_FRAMES`) so the new weapon
    "lands" rather than popping in.

### The world pickup

13. `generateDungeon` places exactly **one** `weapon_shotgun` pickup per
    dungeon, in a valid open floor cell of a non-starting room, not
    colliding with an enemy spawn or an existing pickup cell, chosen with
    the generator `rand()` (placement rolled after the existing pickup
    loop per AC #2). If no eligible cell exists in any non-starting room
    (degenerate dungeon), the dungeon may ship without a shotgun pickup —
    do not crash, do not place it on the player spawn or in a wall.
14. `weapon_shotgun` is added to the `SPRITES` registry with a new
    procedurally-built billboard frame (built the same way the existing
    `medkitSmallFrame` / `ammoSmallFrame` pickup frames are built), so it
    renders as a world sprite through the existing `drawSprites` path with
    z-buffer occlusion — no special-case rendering. It must read as a
    weapon on the ground and be visually distinct from the medkit/ammo
    pickups. It carries the same duck-typed entity fields as other pickups
    via `makePickup` (no new entity shape).
15. Walking within `PICKUP_RADIUS` of an un-taken `weapon_shotgun`
    pickup grants the shotgun: sets the ownership flag, **auto-equips the
    shotgun** (re-arming the equip slide-in), marks the pickup taken
    (`alive = false`), spawns a worldspace pop (e.g. `SHOTGUN` via the
    existing `spawnPickupPop`), and plays a distinct pickup SFX (a new
    short `blip()`-based cue, ≤ 200 ms, in the existing audio style). If
    the shotgun is **already owned**, the pickup is left in place and
    grants nothing (mirrors the existing "skip if full" health/ammo
    pattern) — it must not duplicate, refill ammo, or re-trigger SFX.

### Switching, carry & reset

16. Desktop weapon switch: pressing `Digit1` selects the pistol; pressing
    `Digit2` selects the shotgun **only if owned** (otherwise it is a
    no-op — no crash, no state change, no error). A cycle key (`KeyQ`)
    cycles through owned weapons (pistol-only until the shotgun is owned,
    then toggles the two). These are edge-triggered (ignore auto-repeat,
    matching the existing keydown handling) and inert during the death
    freeze (`player.hp <= 0`), like other gameplay input. Any new keys
    that would otherwise scroll/select are added to `blockedKeys` if and
    only if needed; do not block keys that don't need it.
17. Touch weapon switch: tapping the weapon label region in the HUD
    cycles owned weapons. This tap is consumed with the **same
    edge-tap precedence the existing util buttons (`utilButtonAt`) use** —
    a tap there must cycle the weapon and must **not** also fire. With
    only the pistol owned it is a visible no-op. The existing N/L/M util
    button row and joystick are unchanged (do not restructure that row).
18. The HUD shows the active weapon's name in the bottom strip without
    overflowing on the desktop tier or either touch tier. Keep it compact
    (e.g. beside or appended to the `AMMO X / Y` readout). The existing
    HP / AMMO / LEVEL / KILLS readouts, the HP bar, ammo warning colors,
    minimap, and crosshair are otherwise unchanged.
19. Carry & reset semantics:
    - `advanceLevel()` carries `weapon`, `hasShotgun`, `ammo`, and `hp`
      forward (it already carries ammo/hp/lastFireTime — extend the same
      "carry forward" intent to the two new bindings; do not reset them on
      level exit).
    - `resetRun()` resets to the pistol: `weapon = 'pistol'`,
      `hasShotgun = false`, alongside the existing `ammo = MAX_AMMO` /
      `hp = MAX_HP` / `level = 1` resets. After `R` (death) or `N`
      (regen), the player is back to pistol-only and the new dungeon again
      contains exactly one shotgun pickup.
    - Live `pickups` are rebuilt from `pickupSpawns` on `resetRun` and
      `advanceLevel` exactly as today; the shotgun pickup participates in
      that rebuild with no special-casing.

### No regressions

20. No new console errors/warnings during normal play (load, fire both
    weapons, switch, pick up shotgun, exit a level, die, reset, regen,
    on both a desktop and a touch code path). `node --check` on the
    extracted `<script>` body passes. No change to: the pistol's feel,
    enemy AI, projectiles, contact damage, atmosphere lighting, themes,
    minimap, audio mute, or the kill/pickup ammo audit (the only `ammo`
    mutation sites remain: declaration, `resetRun`, the `fireShot`
    decrement — now by the active weapon's `ammoCost` — and the pickup
    grant loop).

## Out of Scope

- Any third weapon, weapon upgrades/mods, alt-fire, melee, or reloading
  mechanic.
- Separate per-weapon ammo pools or per-weapon ammo pickups. Ammo is one
  shared pool; ammo crates are unchanged.
- Randomized shotgun spread, recoil bloom, or accuracy that changes with
  movement/fire-rate. The fan is fixed and deterministic.
- Multiple shotgun pickups per dungeon, weapon pickups that respawn, or a
  weapon-drop-on-enemy-kill mechanic.
- Any Bayesian / adaptive-difficulty logic. This task only consumes the
  `stats` contract correctly (AC #9); it does not add adaptive behavior.
- Retuning enemy HP, pistol damage, ammo economy, pickup spawn rates, or
  `MAX_AMMO` to "balance around" the shotgun. Ship the constants in AC #5
  as written.
- Restructuring the touch util-button row, the joystick, the gun
  bob/sway/equip/shadow systems, the dungeon generator beyond the single
  appended placement, or the single-file `<script>` IIFE structure.
- Asset baking / `tools/bake-sprites.mjs`. The shotgun viewmodel and
  pickup sprites are code-generated, not PNG-baked (only the imp/grunt
  enemy sprites are PNG-sourced).

## Design Notes

Relevant code paths in `index.html` (line numbers are **approximate** —
the file changes as you edit; locate by symbol, not by line):

- Constants / combat tuning: `~93–166`. Add the `SHOTGUN_*` consts here,
  near `FIRE_COOLDOWN_MS` / `SHOT_DAMAGE` / `MAX_AMMO`.
- `stats` schema + Bernoulli comment: `~201–208`. **Do not change the
  field set.** Re-read the comment there and at `~93` — they document the
  contract you must honor in AC #9.
- State bindings: `let ammo`, `let level`, `let lastFireTime` at
  `~210–212`. Add `weapon` / `hasShotgun` near these.
- keydown handler: `~410–440` (note the `wasDown` auto-repeat guard at
  `~415` and `blockedKeys` at `~356`). Add `Digit1`/`Digit2`/`KeyQ`
  branches here, gated like the other gameplay keys.
- Mouse fire `~456–462`, Space fire `~416`. These already funnel into
  `fireShot()`; no change needed beyond `fireShot` itself.
- Touch input: `onTouchStart ~505`, util-button precedence comment
  ("Util buttons take priority — edge-triggered tap") `~516`,
  `utilButtonAt ~494`, `pointInRect ~485`, fire dispatch `~589`. Add a
  weapon-label hit-test with the same precedence as `utilButtonAt` so the
  tap cycles instead of firing.
- `fireShot()`: `~2856–2908`. This is the core change. Generalize it to
  read the active `WEAPONS` entry; keep the pistol branch behaviorally
  identical. The existing enemy-resolution loop (projected distance
  `tProj`, `perp2`, `r2 = ENEMY_RADIUS²`, `dWall` from
  `castRay(player.x, player.y, player.dirX, player.dirY)`) is the exact
  primitive to reuse per pellet — for pellet `k`, rotate
  `(player.dirX, player.dirY)` by the pellet's fixed angle and re-run the
  same wall + enemy resolution with that direction.
- `applyContactDamage` / `applyPickups`: `~2910–2980`. Add the
  `weapon_shotgun` grant branch to the pickup loop next to the
  `health_*` / `ammo_*` branches, following the same
  squared-distance / "skip if already owned" structure.
- `makePickup` `~2122`, `SPRITES` registry `~2075`, pickup spawn loop
  `~2465–2502` (note the explicit "Roll order … is the seeded-PRNG
  contract" comment — your placement rolls go **after** this loop, before
  `return` at `~2502`).
- `applyDungeon` (`pickupSpawns = d.pickupSpawns` `~2515`), `resetRun()`
  (`~2185–2199`: `player.hp = MAX_HP` `~2194`, `ammo = MAX_AMMO` `~2195`,
  `level = 1` `~2196`, `lastFireTime = -Infinity` `~2197`), `advanceLevel`
  (`~2528–2537`, "Carries HP, ammo, and lastFireTime forward").
- Viewmodel: `buildGun()` `~3942–4010`, `buildFlash1/2` `~4012–4062`,
  `GUN_SPRITE` const `~4064`, `onPlayerFire`/`tickKick`/`getKickOffsets`
  `~4071–4124`, `drawGunShadow` `~4130`, `drawGunViewmodel` `~4152+`
  (`baseX`/`baseY` `~4174`, gun blit `~4180`, barrel/flash anchor
  `~4193`). Write `buildShotgun()` next to `buildGun()`, build
  `SHOTGUN_SPRITE` next to `GUN_SPRITE`, and make `drawGunViewmodel`
  read sprite + barrel anchor from the active weapon.
- `drawHUD()` `~3542–3581` (AMMO text `~3575`, LEVEL `~3580`). Add the
  weapon-name readout here and remember its rect for the touch hit-test
  in AC #17.
- Pickup frame builders: `medkitSmallFrame = buildFrame([...])` `~1929`,
  `ammoSmallFrame` `~2006`, `ammoLargeFrame` `~2040`. Build the
  `weapon_shotgun` frame the same way.

### Balance rationale (informational — implement AC #5 as written)

Enemy HP today (`TYPE_TABLE` `~2093`): imp `3`, grunt `5`. Pistol
`SHOT_DAMAGE = 2`. With 7 pellets × 1 damage, a tight point-blank shotgun
blast can drop an imp or grunt in one pull, but the fixed fan plus the
per-enemy `ENEMY_RADIUS` (0.4) intersection means fewer pellets connect as
range grows — the shotgun naturally degrades with distance. Paired with
the 650 ms cooldown and 3-ammo cost vs. the pistol's 250 ms / 1-ammo, the
two weapons occupy distinct niches without any enemy/economy retuning.

## Agent Notes

- **Read `AGENTS.md` first.** All edits happen inside the assigned
  worktree only (`index.html` only — no new files).
- Suggested ordering: (1) constants + `WEAPONS` registry + state
  bindings; (2) generalize `fireShot` and verify the pistol is
  byte-for-byte unchanged before touching the shotgun branch; (3)
  `buildShotgun()` + `drawGunViewmodel` selection; (4) world pickup
  (sprite, seed-safe spawn, grant); (5) switching input (keyboard, then
  touch); (6) HUD readout; (7) carry/reset wiring.
- The single highest-risk item is AC #2/#9: do **not** insert `rand()`
  calls anywhere before the existing pickup loop, and do **not** count
  pellets as separate `shotsFired`/`shotsHit`. Re-read the `stats`
  contract comments before editing `fireShot`.
- Validate seed-safety empirically: load `index.html?seed=12345` before
  and after your change and confirm the enemy/health/ammo-pickup/wall
  layout is identical (only the new single shotgun pickup is added).
- Smoke-test before reporting (`make serve`, open in a browser):
  - Pistol behaves exactly as before (rate, damage, flash, dry-fire).
  - Find and walk over the shotgun pickup: `SHOTGUN` pop + new SFX,
    auto-equips, equip slide-in plays, label updates.
  - Shotgun: ~7-pellet spread, one-shots a point-blank imp/grunt,
    weaker at range, costs 3 ammo, ~650 ms between pulls, dry-fires
    when fewer than 3 rounds remain.
  - `1`/`2`/`Q` switch on desktop (`2` is a no-op before pickup); on a
    touch code path, tapping the weapon label cycles without firing and
    the N/L/M buttons + joystick still work.
  - Exit a level: weapon + ownership + ammo + HP carry forward; the new
    dungeon has its own single shotgun pickup.
  - Die → `R`, and `N` regen: back to pistol-only, shotgun re-spawns in
    the world.
  - Mute (`M`) silences the new SFX; no new console errors anywhere.
- Run `node --check` on the extracted `<script>` body before reporting.
- Report completion with `spec report --status ok|blocked|error|needs-input`
  and wait for the `Completion recorded` line before exiting. Use
  `needs-input` only for genuine contract ambiguity, not for balance
  opinions (the constants in AC #5 are fixed by this spec).

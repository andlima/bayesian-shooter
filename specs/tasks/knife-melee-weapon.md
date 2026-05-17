---
id: knife-melee-weapon
area: frontend
priority: 50
depends_on: []
description: Add a knife — an always-owned, non-ammo, short-range melee weapon usable as a last resort when ammo runs out — as a third WEAPONS entry with its own procedural viewmodel and swing SFX, excluded from the Bayesian accuracy stats
---

# Knife — An Always-Owned Melee Last Resort

## Goal

Today the game has two ammo-consuming hitscan weapons (pistol, shotgun)
that share one ammo pool. When that pool is empty, the player can only
dry-fire and run. Add a **knife**: a short-range, non-ammo, always-owned
melee weapon so a player who runs out of ammo still has a way to fight.

The knife is a third entry in the existing `WEAPONS` registry and reuses
the existing hitscan/equip/kick machinery — it is **not** a new combat
system. It differs from the guns in exactly four ways:

- **Always owned.** No world pickup, no ownership flag. The player can
  select it at any time from the first frame of every run.
- **No ammo.** A swing never consumes ammo and never dry-fires.
- **Short range.** It only hits enemies within a small reach in front of
  the player; the guns stay unlimited-range.
- **Excluded from accuracy stats.** A swing never touches
  `stats.shotsFired` / `stats.shotsHit` (kills still count).

Per the agreed design: the knife is **manual-only** (the player must
switch to it; nothing auto-equips it), and it is a **modest chip weapon**
(moderate damage — a few swings to down most enemies, not a one-shot).

This is a self-contained gameplay + rendering addition. It must not change
the pistol's or shotgun's existing feel, must not add or shift any
`rand()` call (so every existing `?seed=` layout is byte-identical), and
must not change the `stats` schema that downstream Bayesian specs depend
on.

## Acceptance Criteria

### Single-file & determinism constraints

1. Still one `index.html` at the repo root: no build step, no new files
   (no separate JS/CSS/asset files), no bundler, no network requests, no
   dependencies. The knife viewmodel sprite is generated procedurally in
   JS at startup, exactly like `buildGun()` / `buildShotgun()`.
2. **Seed contract preserved — strictly.** The knife is always owned and
   has **no world pickup**, so this change must introduce **zero** new
   `rand()` / RNG calls anywhere and must not reorder any existing one.
   `generateDungeon(seed)` must produce a byte-for-byte identical
   dungeon-tile, enemy, and health/ammo-pickup layout for every seed.
   Verify by loading `index.html?seed=12345` before and after the change
   and confirming the layout is identical (no new pickups, nothing moved).

### Weapon data model

3. Add a `knife` entry to the `WEAPONS` registry (`index.html` ~line
   4381) carrying the **same property set every weapon already has**
   (`name`, `cooldownMs`, `ammoCost`, `pellets`, `spreadRad`, `damage`,
   `sprite`, `barrelX`, `barrelY`, `kickScale`). The knife's `ammoCost`
   is `0` and its `pellets` is `1` with `spreadRad` `0` (a single forward
   ray, like the pistol's geometry).
4. Add new tuning constants in the combat-constants block (`index.html`
   ~lines 93–123), named in the existing `KNIFE_*` / `SHOTGUN_*` style,
   for the knife's damage, cooldown, and reach. Recommended starting
   values (tunable — the **behavioural intent below is binding, the exact
   numbers are not**):
   - `KNIFE_DAMAGE = 2` — equal to `SHOT_DAMAGE`. With current enemy HP
     (imp = 3, grunt = 5) this is 2 swings to down an imp and 3 to down a
     grunt: a "modest chip weapon", never a one-shot on a standard enemy.
   - `KNIFE_COOLDOWN_MS = 380` — slower than the pistol's 250 ms so a
     gun-with-ammo is always the better choice.
   - `KNIFE_RANGE_CELLS = 1.3` — short. (For reference: `CONTACT_RADIUS`
     is 0.6 and `ENEMY_RADIUS` is 0.4, so the player must close to near
     contact-damage range to land a hit.)
   The binding intent: knife damage MUST require **more than one swing**
   to kill a standard enemy (no one-shots), its cooldown MUST be **no
   faster than the pistol's**, and its reach MUST be a short fixed cap
   well under unlimited range.
5. Generalise weapon range instead of hardcoding it. Add a per-weapon
   range to the registry: the **pistol and shotgun entries get an
   effectively-unlimited range** (e.g. `Infinity`) and the knife gets
   `KNIFE_RANGE_CELLS`. The firing hit test must clamp the hittable
   distance to `min(wallDistance, weaponRange)` so that — for the guns,
   whose range is `Infinity` — the computed bound is **exactly** the
   current wall distance and behaviour is byte-identical (see AC #11).

### Firing

6. Generalise `fireShot()` (`index.html` ~line 3031) so the knife is the
   same code path as the guns, parameterised by its `WEAPONS` entry:
   - **No ammo, no dry-fire.** With `ammoCost = 0` the existing
     `ammo < wpn.ammoCost` dry-fire branch is never taken for the knife,
     and `ammo = Math.max(0, ammo - wpn.ammoCost)` leaves ammo unchanged.
     A knife swing MUST NOT consume ammo, MUST NOT ever play the dry-fire
     click, and MUST work at `ammo === 0`.
   - **Range cap.** The pellet/ray hit test rejects any enemy whose
     projected distance exceeds the weapon's range (per AC #5). At range
     `Infinity` the guns are unaffected.
   - **Cooldown.** The knife respects `wpn.cooldownMs` exactly like the
     guns (swing rate gating via `lastFireTime`).
   - **Hit & kill feedback.** A connecting swing flashes the enemy
     (`hitFlashUntil`), applies `wpn.damage`, and on a lethal hit sets
     `alive=false`, **increments `stats.kills`**, plays the kill SFX, and
     spawns the `+1` kill pop — identical to the guns. A connecting swing
     also triggers the existing hit-tint (`hitTintUntil`) and hit SFX.
7. **Accuracy stats exclude the knife.** A knife swing MUST NOT increment
   `stats.shotsFired` or `stats.shotsHit`, whether it connects or not.
   Gate those two increments on a weapon property (e.g. a registry flag
   such as `tracksAccuracy` that is `true` for pistol & shotgun and
   `false` for the knife) — do **not** special-case the string `'knife'`
   inline if a registry-driven flag is cleaner. `stats.kills` is **not**
   gated: a knife kill still counts as a kill. No other `stats` field is
   added, removed, renamed, or re-typed.
8. **No gunshot effects on a swing.** A knife swing MUST NOT show the
   muzzle flash and MUST NOT play the gunshot SFX. Instead it plays a new
   distinct swing/slash cue (AC #13). The swing still drives the existing
   kick/FOV-punch feedback via `onPlayerFire` (reusing the `'shot'` kick
   kind is acceptable) tuned by the knife's `kickScale`, so it reads as a
   melee lunge rather than recoil.

### Viewmodel

9. Add a `buildKnife()` builder next to `buildGun()` / `buildShotgun()`
   (`index.html` ~line 4247) that returns a `Uint32Array(GUN_W * GUN_H)`
   (72×96) using the same alpha-test convention (`0` ⇒ transparent,
   non-zero ⇒ opaque ARGB) and is built once at startup into a
   `KNIFE_SPRITE` constant referenced by the registry's `sprite` field.
   It must depict a recognisable hand-held knife (blade + grip), visually
   distinct from both guns.
10. `drawGunViewmodel()` already reads `WEAPONS[weapon].sprite`, the kick,
    the equip slide-in, and the sway from the active entry — selecting the
    knife MUST render its sprite through that existing path with the equip
    slide-in playing on the switch, and **no muzzle flash drawn** for the
    knife (consistent with AC #8). The registry's `barrelX`/`barrelY` are
    retained for property-set uniformity even though the knife draws no
    flash.

### No regressions (pistol & shotgun unchanged)

11. With the **pistol** selected, the rendered frame and all firing
    behaviour (fire rate, single-ray damage, muzzle flash, kick, hit-tint,
    dry-fire, ammo cost, `stats` increments) are **byte-identical** to
    pre-change. With the **shotgun** selected, likewise (7-pellet fixed
    cone, ammo cost, cooldown, kick scale, `stats`). Concretely: the
    weapon-range generalisation in AC #5 MUST evaluate to exactly the
    current wall distance for both guns, and their accuracy-stat
    increments and SFX are untouched.

### Switching, carry & reset

12. **Selection.**
    - Desktop: `1` selects pistol, `2` selects shotgun (still a no-op
      until owned), and a new key — **`3`** — selects the knife (always
      available). `Q` cycles through the **owned** weapons. Define an
      explicit, stable cycle order: `pistol → shotgun (if owned) → knife
      → pistol`. Because the knife is always owned, `Q` is **no longer a
      no-op** in a pistol-only run — it now toggles pistol ↔ knife. This
      is an intended change to the previous "pistol-only ⇒ no-op" `Q`
      contract; update the related code comments accordingly.
    - `setWeapon` must accept `'knife'` unconditionally (always owned),
      still reject `'shotgun'` while `!hasShotgun`, still reject unknown
      ids, and still re-arm the equip slide-in only on an actual change
      (a redundant `3` while already on the knife is a no-op — it must
      not re-pop the slide-in).
    - Touch: tapping the weapon label (`weaponLabelHit`) cycles through
      the same owned-weapon order as `Q` (knife included) and, as today,
      never also fires; the tap is always consumed. Update the
      now-stale "pistol-only is a visible no-op" touch comment.
    - All selection inputs remain edge-triggered and inert during the
      death freeze (`player.hp <= 0`), exactly like the existing ones.
13. **Audio.** Add one new procedural swing/slash SFX (e.g.
    `sfxKnife()`), ≤ ~150 ms, in the same `blip()` style as the existing
    cues and audibly distinct from `sfxShot` / `sfxPickupShotgun`. It is
    silenced by the existing mute toggle (`M`) exactly like every other
    cue (route it through the same audio gate — do not bypass mute). Hit
    and kill feedback reuse the existing `sfxHit` / `sfxKill`.
14. **HUD.** The weapon-name readout already renders
    `WEAPONS[weapon].name`; with the knife selected it shows the knife's
    `name` (e.g. `KNIFE`) in the existing style, and the cached
    `weaponHudRect` is recomputed from that name's width as it is for the
    other weapons. No other HUD element changes.
15. **Carry & reset.** The selected weapon and the shared ammo pool carry
    across level exits exactly as today. On a full run reset
    (`resetRun()` / death-then-regen) the selected weapon returns to the
    pistol as today; the knife remains available (it is always owned —
    there is no ownership flag to reset and none is added).

## Out of Scope

- **Any auto-equip / auto-switch behaviour.** Dry-firing an empty gun
  still just plays the dry-fire click; it does NOT switch to the knife.
  Switching to the knife is entirely manual. Dry-fire behaviour for the
  guns is byte-for-byte unchanged.
- **A knife world pickup or ownership flag.** The knife is unconditionally
  owned from the first frame; there is no spawned pickup, no `hasKnife`
  flag, and therefore no RNG/seed impact.
- Directional/backstab damage bonuses, lunge movement, multi-hit sweeps,
  blocking/parry, or any new melee animation system beyond reusing the
  existing kick + equip slide-in.
- Melee-specific enemy reactions (stagger, knockback, new AI states).
- A dedicated on-screen knife button for touch (touch uses the existing
  weapon-label cycle) and any gamepad/controller support.
- Changes to the pistol, the shotgun, contact damage, enemy HP/AI, the
  dungeon generator, or the `stats` schema beyond what AC #3–#15 require.

## Design Notes

- **Why excluded from accuracy stats.** The game's Bayesian accuracy
  metric is about *aimed ranged fire*. A melee swing at point-blank is a
  different action; counting it would pollute `shotsHit/shotsFired`.
  Kills, however, are kills regardless of weapon, so `stats.kills` still
  increments — only the two accuracy counters are gated (AC #7).
- **Why range must be generalised, not branched.** Both guns are
  currently unlimited-range hitscan with the hit bound being purely the
  wall distance. Introducing a registry range with `Infinity` for the
  guns keeps `min(wallDistance, Infinity) === wallDistance`, so AC #11's
  byte-identical guarantee falls out of the data model rather than from a
  fragile `if (weapon === 'knife')` in the hot loop.
- **Why no-ammo falls out of the data model.** With `ammoCost = 0` the
  existing dry-fire guard (`ammo < wpn.ammoCost` ⇒ `ammo < 0`) is never
  true and `Math.max(0, ammo - 0)` is a no-op, so the knife needs no
  special ammo branch — the generalised `fireShot` already does the right
  thing. Keep it that way; avoid knife-specific ammo code.
- **Balance rationale (informational — implement AC #4 as written).**
  The knife is intentionally strictly worse than a gun-with-ammo: shorter
  range than the guns' unlimited reach, no faster than the pistol, no
  accuracy credit, and forces the player into contact-damage range. Its
  only advantages — always owned, never out of ammo — make it exactly a
  last-resort "modest chip weapon", which is the agreed design.
- **Touch precedence unchanged.** The weapon-label tap keeps its current
  edge-tap precedence (checked before the tap-or-look slot and consumed),
  so cycling to/from the knife on touch never also fires.

## Agent Notes

Suggested implementation order: (1) add `KNIFE_*` constants and the
`knife` registry entry plus the per-weapon range field on **all** entries;
(2) generalise `fireShot` for range + the `tracksAccuracy` gate, and
verify pistol & shotgun are byte-identical (range resolves to wall
distance, stats/SFX/flash untouched); (3) add `buildKnife()` /
`KNIFE_SPRITE` and confirm `drawGunViewmodel` renders it with the equip
slide-in and no flash; (4) wire `setWeapon`/`cycleWeapon`, the `3` key,
and the touch label cycle, updating the now-stale "no-op" comments;
(5) add `sfxKnife()` behind the mute gate.

Verify locally with `make serve` (`python3 -m http.server`) and
`node --check` on the extracted script body. Manual smoke tests:

1. Pistol and shotgun behave exactly as before (rate, damage, flash,
   kick, dry-fire, ammo cost, accuracy stats, SFX).
2. Press `3` (or cycle with `Q`) → knife equips, equip slide-in plays,
   HUD shows the knife name, no muzzle flash on swing, distinct swing SFX.
3. With `ammo` at 0: the knife still swings (no dry-fire click, no ammo
   change) and downs an imp in >1 swing and a grunt in more — never a
   one-shot; a kill increments the kill count and spawns the `+1` pop.
4. Stand just outside `KNIFE_RANGE_CELLS` and swing → no hit; step in →
   hits. A wall between player and enemy still blocks the swing.
5. After several knife swings (some hitting, some missing) the accuracy
   readout is unchanged — `shotsFired`/`shotsHit` did not move; kills did.
6. `1`/`2`/`3` and `Q` switch correctly on desktop (`Q` now toggles
   pistol↔knife in a pistol-only run); touch weapon-label tap cycles
   through pistol → (shotgun if owned) → knife without firing.
7. Exit a level → selected weapon + ammo + HP carry forward; die → `R`
   regen returns to pistol with the knife still available.
8. Load `index.html?seed=12345` before vs. after the change → identical
   dungeon/enemy/pickup layout (no new pickups, nothing moved).
9. Mute (`M`) silences the new swing SFX; no console errors anywhere.

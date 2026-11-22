---
id: renumber-weapon-keys
area: frontend
priority: 50
depends_on: []
description: Renumber the desktop weapon-select keys so 0 = knife, 1 = pistol, 2 = shotgun (3 unbound); make Q and the touch weapon-label tap cycle in that same 0 → 1 → 2 order; document the weapon keys in the README controls table.
---

# Renumber Weapon Keys — Knife 0, Pistol 1, Shotgun 2

## Goal

Today `Digit1` selects the pistol, `Digit2` the shotgun, `Digit3` the
knife, and `KeyQ` / the touch weapon-label tap cycle pistol → shotgun →
knife. This task moves the knife to `0` (freeing `3`), keeps the pistol
on `1` and the shotgun on `2`, and makes the cycle walk the same
numbering (knife → pistol → shotgun → knife) so keys and cycle agree.
No weapon behaviour, ownership rule, toast, HUD geometry, or hit-test
changes; the README controls table, which currently lists no weapon
keys at all, gains the rows for `0`, `1`, `2` and `Q`.

## Acceptance Criteria

1. **Number keys.** In the `keydown` handler, `e.code === 'Digit0'`
   calls `setWeapon('knife')`, `'Digit1'` calls `setWeapon('pistol')`,
   `'Digit2'` calls `setWeapon('shotgun')`, each still gated on
   `player.hp > 0` and still edge-triggered through the existing
   `wasDown` guard. `'Digit3'` is no longer handled anywhere: pressing
   `3` changes nothing (no weapon change, no toast, no console output).
   `blockedKeys` is unchanged (no digit is added to it) and no other key
   mapping moves.

2. **Cycle follows the numbering.** `cycleWeapon` walks
   `['knife', 'pistol', 'shotgun']` when `hasShotgun` is true and
   `['knife', 'pistol']` otherwise, wrapping after the last entry. Both
   `KeyQ` and the touch weapon-label tap (`weaponLabelHit` →
   `cycleWeapon`) use this one order. Observable at `?seed=12345` before
   any shotgun pickup: starting on the pistol, `Q` goes to the knife,
   `Q` again back to the pistol. After the shotgun pickup, from the
   pistol `Q` goes to shotgun, then knife, then pistol.

3. **`setWeapon` semantics are untouched.** A redundant key (pressing
   `0` while on the knife, `1` while on the pistol) is still a no-op
   with no toast and no equip slide-in; `2` while the shotgun is not
   owned is still a no-op; every actual change still re-arms
   `equipFramesLeft`, resets `fireAnimStartMs`, and shows the
   `WEAPONS[id].name` toast with the strip token flash. The shotgun
   pickup still auto-equips via `setWeapon('shotgun')`, `resetRun`
   still assigns `weapon = 'pistol'` directly (no toast), and the
   starting weapon is still the pistol. All weapon keys and the cycle
   stay inert while dead (`player.hp <= 0`).

4. **Stale comments updated.** Every in-source comment that names the
   old mapping or order is rewritten to the new one: the `Digit1` block
   in `keydown` ("Digit2 is a no-op until… Digit3 always selects the
   knife…"), the `setWeapon` / `cycleWeapon` header ("pistol → shotgun
   (if owned) → knife → pistol", "a redundant Digit1/Digit3"), and the
   touch weapon-label tap comment in `onTouchStart`. A grep of
   `index.html` for `Digit3` returns nothing.

5. **README controls table.** `README.md`'s Controls table gains rows
   for `0` (Knife), `1` (Pistol), `2` (Shotgun, once picked up) and
   `Q` (Cycle owned weapons), placed together after the `Space` row, and
   the phones-and-tablets paragraph says that tapping the weapon label
   in the bottom strip cycles weapons. Nothing else in `README.md`
   changes.

6. **Smoke, determinism, size, syntax.** `node --check` on the
   extracted `<script>` body passes; `make check` passes (the baked
   region is not touched); `index.html` grows by at most 1 KB over
   today's 210,330 bytes. The first rendered frame at `?seed=12345` is
   byte-identical to today's (no render path is touched). A browser
   smoke session with no console errors or warnings: load at
   `?seed=12345`; press `0` (knife toast, slide-in), `0` again (nothing),
   `1` (pistol), `2` (nothing, shotgun not owned), `3` (nothing), `Q`
   (knife), `Q` (pistol); pick up the shotgun (auto-equips); `2`, `1`,
   `0`, `Q` × 3 (pistol → shotgun → knife → pistol); die, confirm `0` /
   `1` / `2` / `Q` do nothing, press `R`; and with DevTools device
   emulation at a 375-px width, tap the weapon label three times and
   see knife → pistol → shotgun (or knife ↔ pistol before the pickup),
   each with its toast and never firing.

## Out of Scope

- Numpad keys (`Numpad0`–`Numpad2`), mouse-wheel weapon switching,
  gamepad support, or user rebinding.
- Keeping `3` as an alias for the knife (the user asked for a switch,
  not an addition); `3` is simply unbound.
- Any change to weapon behaviour, damage, cooldowns, ammo rules,
  the knife's always-owned status, shotgun ownership or its pickup.
- HUD changes: no slot numbers drawn next to the weapon token, no
  change to `drawHUD`, `weaponHudRect`, `weaponLabelHit` geometry, the
  toast, or the strip token flash.
- `blockedKeys`, the touch util row, joystick, RESET button, and all
  other keybinds (`N`, `L`, `T`, `M`, `R`, `Space`, movement).
- Audio, AI, pickups, level progression, `stats`, `assets/`, `tools/`,
  the baked region, `AGENTS.md`, `CLAUDE.md`.

## Open Questions

- None blocking. The two decisions already taken by the user: the
  cycle order follows the numbering (knife → pistol → shotgun), and the
  README documents the weapon keys.

## Design Notes

### Files involved

`index.html` and `README.md` only. Line numbers as of `9cab80a` (expect
small drift):

- `blockedKeys` `index.html:404-408` (read only; must not change).
- `keydown` weapon block `:493-508` (`Digit1` / `Digit2` / `Digit3` /
  `KeyQ` branches and the comment).
- Touch weapon-label tap and comment in `onTouchStart` `:618-629`.
- `setWeapon` and `cycleWeapon` with their header comment `:2772-2800`.
- Shotgun pickup auto-equip `:2974` (read only).
- `WEAPONS` registry `:4052` (read only; `name` strings drive the toast).
- `README.md` Controls table `:31-48` and touch paragraph `:55-62`.

### Sketch

```js
} else if (e.code === 'Digit0') {
  if (player.hp > 0) setWeapon('knife');
} else if (e.code === 'Digit1') {
  if (player.hp > 0) setWeapon('pistol');
} else if (e.code === 'Digit2') {
  if (player.hp > 0) setWeapon('shotgun');
} else if (e.code === 'KeyQ') {
  if (player.hp > 0) cycleWeapon();
}

function cycleWeapon() {
  const order = hasShotgun
    ? ['knife', 'pistol', 'shotgun']
    : ['knife', 'pistol'];
  const i = order.indexOf(weapon);
  setWeapon(order[(i + 1) % order.length]);
}
```

`e.code` is layout-independent, so `Digit0` is the physical `0` key on
every keyboard layout, matching how `Digit1` / `Digit2` already behave.

### Danger zones

- **Determinism / render:** nothing in a render path or RNG path is
  touched; the first frame must stay byte-identical (#6).
- **Dead-state gating:** keep the `player.hp > 0` guard on every branch;
  a `0` while dead must not equip the knife.
- **Cycle start:** the starting weapon stays the pistol, so the first `Q`
  of a run now goes to the knife (not the shotgun as before when owned);
  this is the intended consequence of the new order, not a bug.

## Agent Notes

- **Read first:** `AGENTS.md`, this spec,
  `specs/tasks/knife-melee-weapon.md` (why the knife is always owned and
  the cycle is explicit), `specs/tasks/shotgun-weapon-pickup.md` (the
  `weaponHudRect` / label-tap contract), then the `keydown` handler,
  `onTouchStart`, `setWeapon` and `cycleWeapon` in `index.html`.
- **Order of work:** (1) rewrite the `keydown` digit branches (#1);
  (2) reorder `cycleWeapon` (#2); (3) update the three comment blocks
  and grep for `Digit3` (#4); (4) README rows and touch note (#5);
  (5) `node --check`, `make check`, size check, smoke (#6), report.
- **Common pitfalls:**
  - Leaving `Digit3` handled "for compatibility" (it is explicitly
    unbound) or adding digits to `blockedKeys`.
  - Reordering only the `hasShotgun` branch of `cycleWeapon` and
    forgetting the pistol-only branch (both must start with `knife`).
  - Touching `setWeapon`'s guards or toast call; they are correct as is.
  - Editing anything between the baked-sprite markers.
- **Smoke test before reporting:** `make serve`, open
  `http://localhost:8000/?seed=12345`, run the #6 session on desktop,
  then at 375-px device emulation for the label tap. DevTools console:
  no errors or warnings.
- Report completion with `spec report --status ok|…` per the Implement
  Agent Contract in `AGENTS.md`.

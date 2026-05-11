---
id: remove-kill-ammo-refund
area: frontend
priority: 50
depends_on: []
description: Remove the silent +3 ammo refund granted on every enemy kill, so the ammo counter never changes without a visible cause
---

# Remove Silent Kill-Refund of Ammo

## Goal

The ammo counter currently goes *up* on every enemy kill (+3, capped at `MAX_AMMO`) with no on-screen feedback. This was introduced in `specs/hitscan-weapon.md` and preserved by `specs/tasks/pickups-health-ammo.md`, but in play it reads as "ammo recharges for no reason" — there is a `+1` kill pop at the kill location but no `+3 AMMO` indicator to explain the bump.

Remove the kill-refund entirely. After this change, the only ways the `ammo` counter changes are the player firing (decrement, visible because the player pressed the trigger), walking onto an ammo pickup (already shows a `+N AMMO` worldspace pop), and a full run reset (`R` after death, or `N` to regenerate — both visibly reset the world). No silent paths remain.

## Acceptance Criteria

1. Killing an enemy **never increases** the displayed `AMMO  X / 24` HUD value. Firing the last round and landing a kill leaves ammo at `0`; the next click triggers the dry-fire click sound (`sfxDryFire`), exactly as it does today when the magazine is empty without a kill.
2. The "+1" kill-confirmation worldspace pop at the kill location still appears, and `stats.kills` still increments. Only the `ammo` mutation on kill is removed.
3. The `AMMO_REFUND` constant is removed from the constants block (it has exactly one caller — the kill branch in `fireShot()` — so the constant becomes dead after the change). `MAX_AMMO`, `PICKUP_AMMO_SMALL`, `PICKUP_AMMO_LARGE`, and all other tuning constants are unchanged.
4. Ammo pickups (`ammo_small`, `ammo_large`) continue to grant `+6` / `+14`, clamped to `MAX_AMMO`, with the existing `+N AMMO` pop and `sfxPickupAmmo()` cue. No regression to the pickup path.
5. Ammo still carries forward across level exits (`advanceLevel`) and still resets to `MAX_AMMO` inside `resetRun()` (player-initiated: death `R`, regen `N`). No new resets, no new refunds, no new code paths that mutate `ammo`.
6. After the change, the only assignments to the `ammo` binding in `index.html` are: (a) initial declaration, (b) `resetRun()`, (c) decrement inside `fireShot()`, (d) pickup grant inside the pickup loop. Grep `\bammo\s*=` and `\bammo--` against `index.html` should return exactly those four sites and nothing else.
7. No new console errors during play. No visual changes to the HUD, minimap, sprites, gun viewmodel, hit-tint, kill pop, pickup pops, audio, or any other rendering. No change to gameplay state schema (`stats` fields, level-carry behavior, pickup spawn rules).

## Out of Scope

- Retuning `MAX_AMMO`, `PICKUP_AMMO_SMALL`, `PICKUP_AMMO_LARGE`, `PICKUP_LARGE_CHANCE`, or any other gameplay value to compensate for the lost refund. The economy shifts toward "you must find ammo crates" deliberately — do not soften it by buffing pickup amounts or spawn rates in this task.
- Editing the historical specs that originally introduced the refund (`specs/hitscan-weapon.md`, `specs/tasks/pickups-health-ammo.md`). They are a record of past decisions; this new task supersedes them.
- Any new HUD element, on-kill VFX, ammo regen mechanic, reload mechanic, or weapon-swap mechanic.
- Refactoring `fireShot()`, the pickup loop, `resetRun()`, or any surrounding code beyond removing the refund line and the now-unused constant.
- Touching the inline `<script>` IIFE structure, build process, or file layout (still single-file `index.html`, no dependencies).

## Design Notes

The refund lives in `fireShot()` in `index.html`, inside the "enemy killed" branch. As of this writing it is at line 2844 (one line, immediately after `sfxKill()`):

```js
if (bestE.hp <= 0) {
  bestE.alive = false;
  stats.kills++;
  sfxKill();
  ammo = Math.min(MAX_AMMO, ammo + AMMO_REFUND);   // <- delete this line
  // hud-feedback-polish: spawn a "+1" pop at the kill location. Cap at
  // KILL_POP_MAX so a long burst can't grow the array unbounded.
  if (killPops.length < KILL_POP_MAX) {
    killPops.push({ x: bestE.x, y: bestE.y, atMs: now, untilMs: now + 500 });
  }
}
```

The `AMMO_REFUND` constant declaration is at `index.html:98`:

```js
const AMMO_REFUND = 3;   // <- delete this line as well
```

`AMMO_REFUND` has no other references in the file. After the deletion, also verify no comment in the constants block or anywhere else still references it; if one does, remove the stale reference or rewrite it to describe current behavior.

### Audit of ammo-change paths (for AC #6)

The five existing sites that read/write `ammo` are:

| Site | Line (approx) | Change | Player-visible cause |
|---|---|---|---|
| Declaration | 211 | `let ammo = MAX_AMMO;` | Game start |
| `resetRun()` | 2138 | `ammo = MAX_AMMO;` | Player pressed `R` or `N`, world visibly resets |
| `fireShot()` decrement | 2810 | `ammo--;` | Player pulled the trigger; muzzle flash + shot SFX |
| `fireShot()` kill-refund | 2844 | `ammo = Math.min(...)` | **Silent — REMOVE** |
| Pickup grant | 2916 | `ammo = Math.min(...)` | Pickup `+N AMMO` worldspace pop + `sfxPickupAmmo()` |
| HUD read | 3477 | read-only | n/a |

Confirm during implementation that this table still holds *after* your edit — if a future spec has added another site you weren't aware of, surface it via `spec report --status needs-input` rather than guessing whether to remove it.

`advanceLevel()` at `index.html:2474` does *not* touch `ammo`; it intentionally carries it forward, with the comment "Carries HP, ammo, and lastFireTime forward". No change there.

## Agent Notes

- Read `AGENTS.md` first. All edits inside the assigned worktree only.
- This is a **two-line deletion** (one in `fireShot()`, one in the constants block), plus any tidy-up of comments that mention `AMMO_REFUND`. Do not refactor, do not retune, do not add comments explaining the absence — the deletion speaks for itself.
- Single-file constraint still holds: `index.html` only, no new files, no build, no dependencies.
- Smoke-test before reporting:
  - Serve `python3 -m http.server` and open in a browser.
  - Fire and kill several enemies in a row. Watch the `AMMO  X / 24` HUD: it must only ever **decrease** between pickups. Each kill still spawns a `+1` worldspace pop.
  - Empty the magazine completely (kill the last enemy in range on your final round, then keep clicking). The HUD should land on `0` and stay there; clicks should produce the dry-fire click only, no visible change.
  - Walk onto an ammo crate — the `+6 AMMO` or `+14 AMMO` pop and SFX must still play and the counter must rise accordingly.
  - Press `N` and `R` to confirm both still reset ammo to `24`.
  - Step onto a level-exit and confirm ammo carries forward (does not snap back to `MAX_AMMO`).
- After editing, grep `index.html` for `AMMO_REFUND` and confirm zero matches. Grep `\bammo\s*=` and confirm only the four expected assignment sites remain.
- Run `node --check` against the extracted `<script>` body to catch syntax errors before reporting.
- Confirm no new console errors during play.

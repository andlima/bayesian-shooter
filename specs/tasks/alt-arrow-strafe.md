---
id: alt-arrow-strafe
area: frontend
priority: 50
depends_on: []
description: Hold Alt to make ArrowLeft/ArrowRight strafe (Doom-style) instead of turning, mirroring the A/D strafe keys
---

# Alt + Arrow Strafe (Doom-style strafe modifier)

## Goal

Add the classic Doom keyboard strafe modifier. While either Alt key is held,
the `ArrowLeft` / `ArrowRight` keys should **strafe** instead of turning the
camera:

- `Alt` + `←` → strafe left, identical to pressing `A`
- `Alt` + `→` → strafe right, identical to pressing `D`

Without Alt, `←` / `→` continue to turn the camera exactly as they do today.
`A` / `D` continue to strafe exactly as they do today. Mouse-look turning is
unaffected, so a player can hold Alt, strafe with the arrows, and still turn
with the mouse simultaneously (the intended Doom-style feel).

## Background

The game is a single-file `index.html` raycaster. Input is sampled each frame
from a `keys` map keyed by `KeyboardEvent.code`. The relevant code is the
per-frame update block:

- Camera turn from arrows: `index.html:760-767`

  ```js
  let rot = 0;
  if (keys['ArrowLeft'])  rot -= rotSpeed * dt;
  if (keys['ArrowRight']) rot += rotSpeed * dt;
  if ((pointerLocked || isTouchDevice) && mouseDx !== 0) {
    if (isTouchDevice) mouseDx *= aimAssistScale();
    rot += mouseDx * mouseSens;
  }
  mouseDx = 0;
  ```

- Strafe from A/D (plane vector): `index.html:782-783`

  ```js
  if (keys['KeyA']) { mvX -= player.planeX; mvY -= player.planeY; }
  if (keys['KeyD']) { mvX += player.planeX; mvY += player.planeY; }
  ```

- `blockedKeys` set + `e.preventDefault()` call: `index.html:356-360` and
  `index.html:414`
- `keyup` clears `keys[e.code]`: `index.html:436-438`
- `blur` resets every key (sticky-modifier backstop): `index.html:439-442`

There is no existing `AltLeft`/`AltRight`/`altKey` handling anywhere in
`index.html` — confirmed by grep — so this is a clean addition.

## Acceptance Criteria

1. **Alt+arrow strafes, mirroring A/D.** With `AltLeft` *or* `AltRight` held,
   `ArrowLeft` produces exactly the same movement contribution as `KeyA`
   (`mvX -= player.planeX; mvY -= player.planeY`) and `ArrowRight` produces
   exactly the same contribution as `KeyD`. Strafe speed matches `A`/`D`
   strafe speed (same `moveSpeed`, same normalization path — no separate
   tuning constant).
2. **Alt suppresses arrow turn.** While Alt is held, `ArrowLeft`/`ArrowRight`
   contribute **zero** rotation — the camera does not turn from the arrows.
   `ArrowUp`/`ArrowDown` (forward/back) are unaffected by Alt.
3. **No-Alt behavior unchanged.** With no Alt held, `←`/`→` turn the camera at
   the current `rotSpeed`, and `A`/`D` strafe, exactly as before this change.
   Mouse-look turning (the `mouseDx` branch) is unchanged whether or not Alt
   is held.
4. **Alt-state tracked via the `keys` map**, consistent with existing input
   architecture: derive a single boolean from
   `keys['AltLeft'] || keys['AltRight']` and read it in the per-frame update
   block. Do not restructure the event handlers to thread `e.altKey` into the
   loop.
5. **No double-application.** Holding `A` and `Alt`+`←` at the same time adds
   the left-strafe vector at most once that frame (i.e. the A/D strafe lines
   gain an `|| (alt && Arrow…)` condition rather than introducing a second
   independent `if` that adds the vector again). Same for the right side.
   Holding `Alt`+`←` and `Alt`+`→` together cancels out, exactly like
   pressing `A`+`D` together does today.
6. **Alt default suppressed.** `'AltLeft'` and `'AltRight'` are added to the
   `blockedKeys` set so the existing `e.preventDefault()` path fires on Alt
   keydown, preventing the browser from stealing focus to the menu bar (a
   real problem on Firefox/Chrome on Linux/Windows that would otherwise eat
   the Alt `keyup` and leave strafe stuck on). The existing `blur`-resets-all
   handler remains the backstop and is not modified.
7. **Per-frame switching is clean.** Pressing or releasing Alt while an arrow
   is held switches that arrow between turn and strafe on the next frame with
   no stuck rotation or stuck strafe (this falls out naturally from sampling
   `keys` every frame; the criterion is that no state is latched across
   frames that would prevent the switch).
8. **README controls table updated.** `README.md:39`
   (`| ` `` `←` `` ` / ` `` `→` `` ` | Turn (alt to mouse) |`) is updated so
   the documented controls reflect that Alt makes the arrows strafe. Add/adjust
   a row so a reader learns: `Alt` + `←`/`→` = strafe (mirrors `A`/`D`). Keep
   the table style consistent with the surrounding rows.
9. **No regressions.** No new console errors during play. No change to: WASD
   movement, forward/back arrows, mouse-look, touch/joystick input, firing,
   HUD, rendering, audio, dungeon regen, or any tuning constant
   (`moveSpeed`, `rotSpeed`, `mouseSens` unchanged). Still a single-file
   `index.html` with no new files, build step, or dependencies.

## Out of Scope

- Any general key-rebinding system, settings UI, or config object. This is a
  hard-coded behavior matching the existing hard-coded keymap.
- Changing what `A`/`D` do, adding new movement keys, or retuning movement /
  rotation speed.
- A dedicated "strafe speed" distinct from normal strafe — Alt+arrow strafe
  uses the same speed as `A`/`D`.
- The in-game hint line at `index.html:86`
  (`Click to lock mouse · WASD to move · …`). It is deliberately terse and
  does not even mention `A`/`D` strafe today; leave it unchanged. The README
  controls table is the canonical controls reference and the only doc to
  update.
- Touch / mobile / joystick input paths (`index.html:789-791` and the touch
  HUD). Unaffected; do not touch.
- Mouse-button or pointer-lock behavior.

## Design Notes

Recommended minimal edit. Introduce the Alt boolean once at the top of the
turn/move section (near `index.html:760`), then gate the arrow-turn lines and
extend the strafe lines:

```js
const altStrafe = keys['AltLeft'] || keys['AltRight'];

let rot = 0;
if (keys['ArrowLeft']  && !altStrafe) rot -= rotSpeed * dt;
if (keys['ArrowRight'] && !altStrafe) rot += rotSpeed * dt;
// …mouseDx branch unchanged…

// …forward/back lines unchanged…
if (keys['KeyA'] || (altStrafe && keys['ArrowLeft']))  { mvX -= player.planeX; mvY -= player.planeY; }
if (keys['KeyD'] || (altStrafe && keys['ArrowRight'])) { mvX += player.planeX; mvY += player.planeY; }
```

And extend `blockedKeys` (`index.html:356-360`):

```js
const blockedKeys = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'Space', 'KeyN', 'AltLeft', 'AltRight'
]);
```

Notes:

- Using `keys['AltLeft'] || keys['AltRight']` (not `e.altKey`) keeps the read
  inside the existing per-frame sampling model — the update loop has no event
  object, and every other input is already read this way.
- The single-`if` form on the strafe lines (criterion 5) prevents a
  double-speed bug when `A` and `Alt`+`←` are pressed together, and makes the
  `Alt`+`←`+`→` cancel-out behavior identical to today's `A`+`D`.
- Line numbers above are approximate anchors as of this writing; locate the
  blocks by content if they have shifted.

## Agent Notes

- Read `AGENTS.md` first. All edits in the assigned worktree only. Single-file
  constraint: `index.html` (+ the one `README.md` line), no new files, no
  build, no dependencies.
- This is a small, surgical change: ~4 modified lines in `index.html`'s
  per-frame block, 2 strings added to `blockedKeys`, and one README table
  row. Do not refactor surrounding input code.
- Run `node --check` on the extracted `<script>` body (or equivalent syntax
  check) before reporting, to catch typos.
- Smoke-test in a browser (`make serve`, then open `http://localhost:8000`):
  - Plain `←`/`→` still turn the camera; `A`/`D` still strafe; mouse-look
    still turns.
  - Hold `Alt`: `←`/`→` now slide the player sideways and the camera no
    longer turns from the arrows. The slide direction and speed match
    `A`/`D`.
  - While holding `Alt`+`←`, also move the mouse — camera still turns from
    the mouse while strafing (Doom-style).
  - Release `Alt` while still holding `←` — it immediately reverts to turning
    with no stuck strafe; press `Alt` again mid-hold — immediately strafes.
  - Press `Alt` alone — focus is not stolen to the browser menu bar and no
    movement/rotation occurs.
  - Confirm no new console errors throughout.
- Report completion with `spec report --status ok|...` per the Implement
  Agent Contract in `AGENTS.md`.

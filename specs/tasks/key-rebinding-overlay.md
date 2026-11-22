---
id: key-rebinding-overlay
area: frontend
priority: 50
depends_on: []
description: Desktop key rebinding — a canvas-drawn settings overlay (opened with `) lets the player reassign the core gameplay keys (move, turn, fire, weapon select, cycle) with a primary and secondary slot per action, swap-on-conflict, reserved-key refusal, restore-defaults, and localStorage persistence. Utility keys (N/L/T/M/R/Esc), mouse, touch, and every render path are untouched.
---

# Key Rebinding Overlay

## Goal

Every gameplay key is hard-coded today: `update()` polls
`keys['KeyW']`, `keys['ArrowLeft']`, … directly and the `keydown`
handler branches on literal `e.code` strings. This task introduces a
small action→key binding table with a primary and a secondary slot per
action, routes all core gameplay input through it, and adds a
canvas-drawn settings overlay (toggled with the physical `` ` `` key,
`Backquote`) where the player selects an action, presses a new key,
and has the change persisted in `localStorage` across reloads. The
default table reproduces today's layout exactly, so a player who never
opens the overlay sees no change. The fixed utility keys, mouse input,
the touch path, and the renderer are not touched.

## Acceptance Criteria

1. **Binding table replaces hard-coded codes.** A single table lists
   exactly these eleven actions, each with a `[primary, secondary]`
   pair of `KeyboardEvent.code` strings (or `null`), and these
   defaults: `moveForward` `KeyW`/`ArrowUp`, `moveBack`
   `KeyS`/`ArrowDown`, `strafeLeft` `KeyA`/–, `strafeRight` `KeyD`/–,
   `turnLeft` `ArrowLeft`/–, `turnRight` `ArrowRight`/–, `fire`
   `Space`/–, `weaponKnife` `Digit0`/–, `weaponPistol` `Digit1`/–,
   `weaponShotgun` `Digit2`/–, `cycleWeapon` `KeyQ`/–. The movement
   and turn reads in `update()` and the `Space` / `Digit0` / `Digit1` /
   `Digit2` / `KeyQ` branches in `keydown` consult the table instead of
   literal codes; a grep of the game script for `keys['Key`,
   `keys['Arrow`, `'Digit0'`, `'Digit1'`, `'Digit2'`, `'KeyQ'` and
   `'Space'` matches only the defaults table and the reserved list. The
   Alt-strafe modifier generalises: holding `AltLeft`/`AltRight` makes
   whichever keys are bound to `turnLeft`/`turnRight` strafe instead of
   turn (so Alt+arrows behaves exactly as today). `preventDefault` is
   applied to every code currently bound to any action plus the fixed
   `KeyN`, `AltLeft`, `AltRight`; the static `blockedKeys` set is
   removed or reduced to that fixed trio. With the default table every
   existing key behaves exactly as before, including the `player.hp >
   0` gating, the `wasDown` edge guard, `setWeapon` no-op semantics and
   the weapon toast; the utility keys `KeyN`, `KeyL`, `KeyT`, `KeyM`,
   `KeyR` and the mouse (`mousedown` fire, `mousemove` look) are not
   routed through the table and are unchanged.

2. **`` ` `` opens and closes a modal overlay that pauses the game.**
   Pressing `Backquote` (edge-triggered; auto-repeat ignored) toggles
   `settingsOpen`. On open: `document.exitPointerLock()` is called if
   locked, every entry of `keys` is cleared and `mouseDx` is zeroed
   (as the `blur` handler does), and `update(dt)` returns immediately
   on every frame while open, so the player, enemies, projectiles,
   kick/bob and the fire cooldown are frozen; `render()` keeps running
   so the world stays visible and toasts still expire. While open: all
   table-driven actions, the utility keys `N`/`L`/`T`/`M`/`R` (in their
   normal meaning), the canvas `click` pointer-lock grab and the
   `mousedown` fire are inert; `KeyM` mute is the one utility key that
   still works. `Backquote` or `Escape` (when not capturing, see #4)
   closes it; closing does not re-request pointer lock (the player
   clicks as usual). The overlay can be opened while dead (`player.hp
   <= 0`) and the death banner stays visible under it. On a touch
   device nothing changes: no touch gesture opens the overlay, and the
   touch HUD, joystick and tap-to-begin overlay are not modified.

3. **Overlay layout.** Drawn into the framebuffer by `render()` after
   every other HUD element (after the tap-to-begin block), only when
   `settingsOpen` is true, using `HUD_STYLE` colours, `drawBanner` for
   the title band (`KEY BINDINGS`) and `roundRect`/`fillRect` panels,
   `12px monospace` text. One row per action in the order of #1, each
   showing a human label (`Forward`, `Back`, `Strafe left`, `Strafe
   right`, `Turn left`, `Turn right`, `Fire`, `Knife`, `Pistol`,
   `Shotgun`, `Cycle weapon`) and two slot cells showing a short key
   name (`W`, `↑`, `Space`, `0`, `–` for empty; `Digit*`→digit,
   `Key*`→letter, `Arrow*`→arrow glyph, otherwise the raw code). The
   selected row/slot cell is highlighted with `HUD_STYLE.accent`; a cell
   in capture mode shows `press key…` in `HUD_STYLE.warn`. A footer line
   reads `↑↓ row · ←→ slot · Enter rebind · Backspace clear · R defaults
   · ` close`. Navigation while open and not capturing: `ArrowUp` /
   `ArrowDown` move the row cursor (wrapping), `ArrowLeft` /
   `ArrowRight` pick the primary / secondary slot, `Enter` starts
   capture on the selected slot, `Backspace` clears it, `KeyR` restores
   the defaults (with a `defaults restored` toast). All eleven rows, the
   title band and the footer fit inside the 480×270 framebuffer with no
   clipping.

4. **Capture and assignment rules.** In capture mode the next `keydown`
   (edge-triggered, `preventDefault` applied) is the candidate `code`,
   and exactly one of the following happens, each ending capture:
   (a) `Escape` cancels with no change; (b) a code in the reserved set
   — `KeyN`, `KeyL`, `KeyT`, `KeyM`, `KeyR`, `Escape`, `Backquote`,
   `AltLeft`, `AltRight`, `ShiftLeft`, `ShiftRight`, `ControlLeft`,
   `ControlRight`, `MetaLeft`, `MetaRight`, `CapsLock`, `Tab` — is
   refused with a `reserved key` toast and the slot is unchanged; (c)
   the code already in that slot is a no-op; (d) the code sits in
   another slot (same or different action): the two slots swap, so
   the other slot receives this slot's previous value — unless that
   would leave the other action with two empty slots, in which case
   the assignment is refused with a `would unbind <label>` toast;
   (e) otherwise the slot is set to the code. `Backspace` on a slot
   clears it only if the action's other slot is non-empty; otherwise a
   `needs one key` toast shows and nothing changes. The invariant
   "every action has at least one key and no code appears in two
   slots" holds after every operation, and the new binding takes
   effect immediately on close (no reload).

5. **Persistence.** Every successful change (#4 assign, clear, swap,
   restore defaults) writes `localStorage['bs.keybinds.v1']` as JSON
   `{ "v": 1, "binds": { "<action>": [code|null, code|null], … } }`.
   At startup the value is read once, before the first frame: it is
   applied only if it parses, has `v === 1`, contains exactly the
   eleven actions of #1 with two-element arrays of string-or-null, uses
   no reserved code, and satisfies the invariant of #4; otherwise the
   defaults are used, nothing is written until the player next changes
   a binding, and no console error or warning is emitted. Every
   `localStorage` access is wrapped so a throwing or absent storage
   (private mode, blocked storage) leaves the game fully playable with
   in-memory bindings. A rebound key survives a page reload at the same
   URL; hand-corrupting the stored value in DevTools and reloading
   yields the defaults silently.

6. **Hint and README.** The DOM `.hint` line gains `` ` to rebind keys
   `` before `Esc to release`. `README.md`'s Controls table gains a
   `` ` `` row (`Open / close key bindings`), the existing `W / ↑`, `S /
   ↓`, `A`, `D`, `← / →`, `Alt + ← / →`, `Space`, `0`, `1`, `2`, `Q`
   rows are kept as the defaults, and a short paragraph after the
   table explains that those keys can be rebound from the overlay, that
   bindings are saved in the browser's `localStorage`, and that `R` in
   the overlay restores the defaults. Nothing else in `README.md`
   changes.

7. **Smoke, determinism, size, syntax.** `node --check` on the
   extracted `<script>` body passes; `make check` passes (the baked
   region is untouched); `index.html` grows by at most 9 KB over
   today's 210,498 bytes. The first rendered frame at `?seed=12345`
   with empty `localStorage` is byte-identical to today's (the overlay
   is closed at load and no render path is modified). A browser smoke
   session with no console errors or warnings: load at `?seed=12345`
   with cleared storage; confirm W/A/S/D, arrows, Alt+arrows, Space,
   `0`/`1`/`2`/`Q` behave as before; press `` ` `` (pointer lock
   released, world frozen, overlay visible, enemies do not move);
   confirm W, Space, `1`, `N`, `L`, `T` do nothing while open and `M`
   still toggles mute; move the cursor to `Fire`, Enter, press `F` →
   slot shows `F`; Enter, press `N` → `reserved key` toast, slot still
   `F`; move to `Forward` primary, Enter, press `F` → `Forward` shows
   `F`/`↑` and `Fire` shows `W`/–; on `Fire` press Backspace → `needs
   one key` toast; on `Forward` secondary press Backspace → `F`/–;
   close with `` ` ``, confirm `F` moves forward, `W` fires, `Space`
   does nothing; reload → bindings persist; open overlay, `R` → defaults
   restored and persisted; reload → defaults. Repeat the open/close
   while dead (after `R`-reset the death banner stays under the
   overlay). At a 375-px DevTools touch emulation, confirm the touch
   HUD is unchanged and nothing opens the overlay.

## Out of Scope

- Rebinding the utility keys (`N`, `L`, `T`, `M`, `R`, `Esc`) or the
  overlay's own navigation keys; rebinding mouse buttons, the mouse
  wheel, or any gamepad; touch control customisation.
- Modifier combinations as bindings (`Ctrl+F`), chords, or a third
  slot; per-action "hold vs toggle" behaviour.
- Any other setting in the overlay (mouse sensitivity, FOV, volume,
  theme); a general pause menu or pause key separate from the overlay.
- Changing what any action does: movement speed, turn speed, fire,
  cooldown, weapon ownership, `setWeapon` semantics, the weapon toast.
- Any change to the touch path, `drawTouchHUD`, the joystick, the
  tap-to-begin overlay, or the death banner text.
- Export/import of bindings, URL-parameter bindings, cross-tab sync, or
  migrating future schema versions (only `v: 1` exists).
- Audio, AI, pickups, level progression, `stats`, `assets/`, `tools/`,
  the baked region, `AGENTS.md`, `CLAUDE.md`.

## Open Questions

- None blocking. Decisions taken by the user in scoping: core gameplay
  actions only; canvas-drawn overlay (no DOM panel); `Backquote` opens
  it and the game pauses while open; conflicts swap; reserved keys are
  refused; two slots per action with defaults equal to today's layout;
  slug `key-rebinding-overlay`.
- `Tab` is in the reserved set to avoid focus traversal surprises; if
  the implementer finds `preventDefault` makes it safe, keeping it
  reserved is still the conservative choice and should not be changed
  without a note in the report.

## Design Notes

### Files involved

`index.html` and `README.md` only. Line numbers as of `bf31dc7`
(expect small drift):

- `.hint` div `index.html:86`.
- `nowMs` `:249`; `showToast` `:274` (reuse for every toast in #3/#4).
- `keys` map `:400`, `mouseDx`/`pointerLocked` `:401-402`,
  `blockedKeys` `:404-408`.
- `keydown` handler `:463-511` (Space / weapon branches to re-route;
  insert the overlay branch before the gameplay branches), `keyup`
  `:512`, `blur` `:515` (model for the clear-on-open), canvas `click`
  `:520` and `mousedown` `:527` (gate on `!settingsOpen`).
- `update(dt)` `:825` — add `if (settingsOpen) return;` before the
  death branch; movement/turn reads `:861-886`.
- `setWeapon` `:2782`, `cycleWeapon` `:2796` (read only).
- `render()` `:3102`; tap-to-begin block ends `:3334` — draw the
  overlay right after it. `roundRect` `:3459`, `HUD_STYLE` `:3548`,
  `drawBanner` `:3566`.
- Game loop `:4344` (unchanged; `render()` must still run while paused).
- `README.md` Controls table `:31-52`.

### Sketch

```js
const ACTIONS = [
  ['moveForward',  'Forward',      ['KeyW', 'ArrowUp']],
  ['moveBack',     'Back',         ['KeyS', 'ArrowDown']],
  ['strafeLeft',   'Strafe left',  ['KeyA', null]],
  ['strafeRight',  'Strafe right', ['KeyD', null]],
  ['turnLeft',     'Turn left',    ['ArrowLeft', null]],
  ['turnRight',    'Turn right',   ['ArrowRight', null]],
  ['fire',         'Fire',         ['Space', null]],
  ['weaponKnife',  'Knife',        ['Digit0', null]],
  ['weaponPistol', 'Pistol',       ['Digit1', null]],
  ['weaponShotgun','Shotgun',      ['Digit2', null]],
  ['cycleWeapon',  'Cycle weapon', ['KeyQ', null]],
];
const RESERVED = new Set(['KeyN','KeyL','KeyT','KeyM','KeyR','Escape',
  'Backquote','AltLeft','AltRight','ShiftLeft','ShiftRight',
  'ControlLeft','ControlRight','MetaLeft','MetaRight','CapsLock','Tab']);
const binds = Object.create(null);          // action -> [code|null, code|null]
const codeToAction = new Map();             // code -> action (rebuilt on change)
function isDown(action) { const b = binds[action]; return !!(keys[b[0]] || keys[b[1]]); }
function actionFor(code) { return codeToAction.get(code) || null; }

// update():
const altStrafe = keys['AltLeft'] || keys['AltRight'];
if (isDown('turnLeft')  && !altStrafe) rot -= rotSpeed * dt;
if (isDown('moveForward')) { … }
if (isDown('strafeLeft') || (altStrafe && isDown('turnLeft'))) { … }

// keydown, after the wasDown guard:
if (e.code === 'Backquote') { toggleSettings(); return; }
if (settingsOpen) { handleSettingsKey(e); return; }   // nav / capture
switch (actionFor(e.code)) {
  case 'fire': fireShot(); break;
  case 'weaponKnife': if (player.hp > 0) setWeapon('knife'); break;
  …
}
```

`localStorage` read/write live in two tiny helpers (`loadBinds()`,
`saveBinds()`) with `try { … } catch (_) {}` around every access; the
validator rejects on the first failed check and returns `null`.

### Danger zones

- **Determinism / first frame:** the overlay is closed at load and the
  table is only consulted from input paths, so the first frame stays
  byte-identical (#7). Do not touch `castColumn`, sprites, HUD strip
  or the minimap.
- **Stored-data integrity:** a stale, hand-edited or foreign value in
  `localStorage` must never throw, never half-apply, and never leave an
  action unbound (#5). Validate the whole document before applying
  any of it.
- **Storage unavailable:** `file://` in some browsers, private mode and
  storage-blocked profiles throw on access; the game must still start
  and the overlay must still work in-memory (#5).
- **Pause leakage:** clear `keys` and `mouseDx` on open so a held `W`
  does not resume movement after close; keep `dt` clamped by the loop
  so the resume frame does not teleport (#2).
- **Pointer lock:** exit on open; never request lock while open; the
  `pointerlockchange` handler already zeroes `mouseDx` (#2).
- **Browser defaults:** `preventDefault` must follow the live table so
  a player who binds `Space`, arrows or `Tab`-adjacent keys does not
  scroll or lose focus; `Tab` itself is reserved (#1, #4).
- **Dead state:** overlay open/close works while dead; `R` inside the
  overlay restores defaults and must not also restart the run (#2, #3).

## Agent Notes

- **Read first:** `AGENTS.md`, this spec,
  `specs/tasks/renumber-weapon-keys.md` (current weapon-key contract),
  `specs/tasks/alt-arrow-strafe.md` (Alt-strafe semantics to
  generalise), `specs/tasks/hud-visual-cohesion.md` (`HUD_STYLE` /
  `drawBanner` rules), then the `keydown` handler, `update()` input
  block and `render()` tail in `index.html`.
- **Order of work:** (1) `ACTIONS`/`RESERVED`/`binds`/`codeToAction`
  plus `loadBinds`/`saveBinds` with validation (#1, #5); (2) re-route
  `update()` reads and the `keydown` gameplay branches through the
  table and make `preventDefault` dynamic (#1); (3) `settingsOpen`,
  toggle, pause gate, pointer-lock and click/mousedown gating (#2);
  (4) overlay drawing (#3); (5) navigation, capture, swap/refuse rules
  (#4); (6) hint + README (#6); (7) `node --check`, `make check`, size,
  first-frame and smoke (#7), then report.
- **Common pitfalls:**
  - Leaving a literal `keys['KeyW']`-style read behind in `update()`.
  - Forgetting the Alt+turn strafe path when turn keys move.
  - Letting `Backquote` reach `ensureAudio` only — it must still call
    it (first keypress unlocks audio) but must not fall through to the
    gameplay switch.
  - Writing to `localStorage` on load (invalid data must be ignored, not
    "repaired", until the player changes something).
  - Drawing the overlay before the tap-to-begin block or the death
    banner, or restoring `ctx.textAlign`/`textBaseline` incorrectly
    (every HUD helper leaves `left`/`top`).
  - Editing anything between the baked-sprite markers.
- **Smoke test before reporting:** `make serve`, open
  `http://localhost:8000/?seed=12345` with DevTools → Application →
  clear site data, run the #7 session on desktop, then the 375-px touch
  emulation check. DevTools console: no errors or warnings.
- Report completion with `spec report --status ok|…` per the Implement
  Agent Contract in `AGENTS.md`.

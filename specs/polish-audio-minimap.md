---
id: polish-audio-minimap
area: frontend
priority: 60
depends_on: [hitscan-weapon]
description: Procedural Web Audio sound effects and a corner minimap with player and enemy markers
---

# Polish: Audio + Minimap — Make the World Feel Alive

## Goal

Layer two pieces of feedback polish onto the existing combat loop without changing any gameplay rules: short procedural Web Audio blips for the most important game events, and a small top-corner minimap so the player can orient themselves. Both are pure additions — no balance changes, no new entities, no new spec dependencies beyond what `hitscan-weapon` already produced.

## Acceptance Criteria

1. Single-file constraint preserved: still one `index.html` at the repo root, no build, no external assets, no network requests. Audio is generated procedurally; the minimap is drawn from the existing `MAP` and entity arrays.
2. **Audio context lifecycle:** a single `AudioContext` is created lazily on the first user gesture (key press or click) and reused for every subsequent sound. Browsers reject `AudioContext` creation before a user gesture — the lazy-init must succeed silently if called before any input has happened (e.g., during script load) and must not throw on Safari (`webkitAudioContext` fallback).
3. **Five distinct procedural sounds**, each ≤ 200 ms long, with no clipping at default browser volume:
   - **Shot fired** — short noise/square blip with quick decay.
   - **Shot hits enemy** — higher-pitched ping (e.g., square or sine ~900 Hz, ~60 ms).
   - **Enemy killed** — descending tone (e.g., sine 400 → 100 Hz over ~180 ms).
   - **Player takes damage** — low buzz (e.g., square ~120 Hz with light vibrato, ~150 ms).
   - **Dry fire** (trigger pulled with `ammo === 0`) — short low click distinct from the shot blip.
4. **Sounds are non-overlapping per source but don't queue:** if a sound for the same event triggers while still playing, just start a new one — overlapping decays are fine. Do not pre-allocate a pool; one fresh `OscillatorNode`/`GainNode` per blip is acceptable for this spec.
5. **Master volume / mute:** a single master `GainNode` sits between every sound source and `audioCtx.destination`. Pressing `M` toggles mute (master gain 0 ↔ a default ~0.4). The mute state persists for the rest of the session (no `localStorage`).
6. **Minimap location & size:** a square minimap is drawn in the **top-left** corner of the viewport, inset by 8 px from each edge, sized 96×96 px. It uses `ctx` (post-`putImageData`) so it sits crisp on top of the upscaled world buffer, like the FPS counter.
7. **Minimap content:**
   - A semi-transparent dark background (e.g., `rgba(0,0,0,0.55)`) covers the full 96×96.
   - Wall cells from `MAP` are drawn as small filled squares colored by wall type (the same two colors used in the world view, or close enough — a visual hint, not pixel-matched).
   - The player is drawn as a small **triangle** pointing along `(dirX, dirY)`, ~6 px tall, in a clearly distinguishable color (e.g., bright cyan or yellow).
   - Each `alive` enemy is drawn as a 2×2 px dot in red. Dead enemies are not drawn.
8. **Minimap centering and scale:** the minimap is *centered on the player* and shows a fixed window (recommended ~12 cells across — i.e., scale ≈ 8 px per cell). Cells outside the window are not drawn. The player triangle therefore stays at the minimap's geometric center.
9. **Performance:** with audio enabled and the minimap on, the existing **≥ 30 FPS** target still holds during normal play with all initial enemies alive. Audio nodes from finished sounds must be allowed to garbage-collect (call `osc.stop(stopTime)` and let the node disconnect, or explicitly `disconnect()` on `onended`); after a 60-second session of continuous fire, the live-node count must stay bounded (no monotonic growth).
10. **No new console errors** for a 60-second session of normal play (firing, hitting, killing, taking damage, dry-firing, muting and unmuting, walking around to see different parts of the map).

## Out of Scope

- Loaded audio assets (`.wav`, `.mp3`, `.ogg`) — procedural only.
- Spatial audio: panning, distance attenuation, Doppler.
- Music or ambient loops.
- Footstep sounds, door sounds, ambient enemy growls.
- Persistent mute (no `localStorage`, no settings menu).
- Volume slider or any settings UI.
- Fog-of-war or line-of-sight gating on the minimap — every wall and live enemy is always shown within the visible window.
- Minimap pan/zoom controls.
- Replacing the existing HUD or FPS overlay; the minimap sits beside them, not on top.
- Any Bayesian / adaptive logic.

## Design Notes

- **Symbols this spec depends on** (added by previous specs):
  - `MAP`, `MAP_W`, `MAP_H` — wall grid.
  - `player.{x,y,dirX,dirY}` — for the minimap triangle.
  - `enemies` — array; iterate and skip `!alive`.
  - `stats.{shotsFired, shotsHit, kills, deaths}` — *do not modify*; the audio cues fire alongside the existing increments in `fireShot()`, the enemy-hit branch, the kill branch, the contact-damage branch, and the dry-fire branch.
  - `ctx` — visible canvas 2D context, used after `putImageData` for the existing crosshair, FPS counter, and HUD. Minimap draws here too.
- **Audio architecture:**
  ```
  let audioCtx = null;
  let masterGain = null;
  let muted = false;
  function ensureAudio() {
    if (audioCtx) return;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;             // graceful no-op
    audioCtx = new Ctor();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = muted ? 0 : 0.4;
    masterGain.connect(audioCtx.destination);
  }
  function blip({ type='square', freq=440, dur=0.08, attack=0.005, decay=0.07 }) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const env = audioCtx.createGain();
    osc.type = type; osc.frequency.value = freq;
    const t = audioCtx.currentTime;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    osc.connect(env).connect(masterGain);
    osc.start(t); osc.stop(t + dur);
    osc.onended = () => { osc.disconnect(); env.disconnect(); };
  }
  ```
  Every individual SFX is a thin wrapper that calls `blip(...)` with appropriate parameters, possibly with a `frequency.linearRampToValueAtTime` for the descending-tone "kill" cue.
- **Lazy init:** call `ensureAudio()` from the existing `keydown` and `mousedown` handlers (top of the function, before any other logic). No need for a separate "click to enable audio" overlay — the player will press a key or click within the first second of play.
- **Mute toggle:** in the `keydown` handler, intercept `KeyM`, flip `muted`, and write `masterGain.gain.value = muted ? 0 : 0.4`. Skip if `audioCtx` is `null` (not yet initialized).
- **Minimap rendering:**
  - Compute `cellPx = 8`, `windowCells = 12` (so 96 px / 12 cells = 8 px/cell).
  - Camera offset: `originX = player.x - windowCells/2`, same for Y.
  - For each cell `(mx, my)` with `mx ∈ [floor(originX), floor(originX) + windowCells]`, draw the wall fill if `MAP[my][mx] !== 0`.
  - Player triangle: pre-compute three points in local space (e.g., `(0, -3), (-2, 2), (2, 2)`), rotate by `atan2(dirY, dirX) - π/2` (so "up" on the minimap is the player's facing), translate to the minimap center, and `ctx.fill()` a path.
  - Enemy dots: `mxScreen = (e.x - originX) * cellPx + minimapX`, `myScreen = (e.y - originY) * cellPx + minimapY`, draw a 2×2 `fillRect`.
- **Layering order in `render()`** (after wall + sprite passes write to `buf32`):
  1. `ctx.putImageData(buf, 0, 0)` (existing).
  2. Crosshair / muzzle flash / hit-tint (existing).
  3. HUD bar + HP/AMMO/KILLS text (existing).
  4. **Minimap (new).**
  5. FPS counter (existing).

## Agent Notes

- Read `AGENTS.md`, `specs/raycaster-mvp.md`, `specs/sprite-enemies.md`, and `specs/hitscan-weapon.md` first. Make all changes inside the assigned worktree only.
- Single-file, vanilla JS, no build, no `package.json`, no external assets. Same constraint as every previous spec.
- **Do not modify gameplay-affecting state.** This spec adds rendering and audio side effects only. The `stats` schema is frozen by `hitscan-weapon`; do not add or rename fields.
- **Do not pre-create the `AudioContext`.** Browsers (especially Safari and locked-down Chromium policies) reject creation before a user gesture. The lazy `ensureAudio()` pattern is non-negotiable.
- Common pitfalls:
  - **Forgetting `osc.onended` cleanup:** without it, oscillator nodes accumulate. Over 60 seconds of continuous fire that's hundreds of nodes.
  - **Audio firing during the death freeze:** the death state freezes the world. Enemy-related sounds (kill, etc.) won't trigger because nothing dies. Player-damage sounds shouldn't either — but `M` to toggle mute *should* still work even when dead.
  - **Minimap drawn before `putImageData`:** if you write to `buf32` instead of using `ctx`, the upscaled blit will pixelate the triangle and dots into mush. Always draw minimap via `ctx` after the blit.
  - **Triangle rotation off by 90°:** the player faces along `(dirX, dirY)`. If you draw the triangle with its "tip" at `(0, -3)` in local coordinates (screen-up), you must rotate by `atan2(dirY, dirX) - π/2`, not just `atan2(dirY, dirX)`.
  - **Mute key conflicts:** `M` is currently unused. Confirm by grepping the keydown handler before claiming it.
- Smoke-test before reporting:
  - Serve locally (`python3 -m http.server`), open in browser, fire a shot — hear the shot blip. Hit a wall: only shot blip. Hit an enemy: shot + ping. Kill an enemy: shot + ping + descending tone. Walk into an enemy: hurt buzz. Drain ammo, click again: dry click only (no shot blip). Press `M`: silence. Press `M` again: sound returns.
  - Watch the minimap as you walk: the wall pattern shifts under the centered triangle; enemies appear as red dots; dead enemies disappear from the dots.
  - Open DevTools' Performance / Memory tab during a 60-second auto-fire session if available; confirm `OscillatorNode` count stays bounded.
  - At minimum, run `node --check` against the extracted `<script>` body to catch syntax errors.
- Keep audio constants and the minimap renderer in clearly delimited sections of the existing IIFE so subsequent specs can locate them without re-reading the whole file.

# Bayesian Shooter

A single-file, no-build, browser-based raycaster FPS (in-source title:
*Raycaster MVP*).

The entire game — renderer, dungeon generator, textures, sprites, audio,
HUD, AI — lives in one `index.html`. There is no build step, no package
manager, no external asset pipeline. Open the file and play.

The renderer is software, the world is procedurally generated, and the
constraints are deliberate: keeping everything in a single file with no
external assets makes the project easy to read end-to-end, easy to fork,
and easy to extend one spec at a time.

## Run it

Two ways, both work today with no install step:

- **Open `index.html` directly** in a modern browser. The `file://`
  protocol is fine; everything is inlined.
- **Or serve from the repo root** and visit `http://localhost:8000`:
  ```
  python3 -m http.server
  ```
  Any other static file server works equally well.

On desktop, click the canvas once to grab pointer lock — the
browser requires a user gesture before mouse-look will activate. Press
`Esc` at any time to release the pointer.

## Controls

| Input | Action |
|---|---|
| `W` / `↑` | Walk forward |
| `S` / `↓` | Walk backward |
| `A` | Strafe left |
| `D` | Strafe right |
| `←` / `→` | Turn (alt to mouse) |
| Mouse | Look (requires pointer lock) |
| Left-click | Fire (and lock pointer if not locked) |
| `Space` | Fire (alt to click) |
| `N` | Regenerate dungeon |
| `L` | Toggle atmosphere lighting |
| `R` | Reset run (after death) |
| `M` | Toggle mute |
| `Esc` | Release pointer lock |

The keyboard arrow keys exist as a fallback for situations where pointer
lock isn't available or convenient (e.g. before the first click, or when
testing in DevTools). Mouse-look is the intended primary input once the
pointer is locked.

On phones and tablets, **tap the screen once to start** (this unlocks
audio). Use the on-screen joystick in the bottom-left corner to move
(forward / strafe). **Tap anywhere on the screen to fire**, or **drag
anywhere on the screen to look around** — both gestures use the same
finger. Tap the small N / L / M buttons just below the minimap to
regenerate / toggle lighting / mute. Look rotation slows automatically
when your crosshair is near a visible enemy. Pointer lock is not used on
touch devices.

## Architecture

- The whole game lives in a single `index.html` — HTML shell, inline CSS,
  and one inline JS IIFE. No build step, no bundler, no external assets.
- The logical framebuffer is `480 × 270`. Pixels are written into a
  `Uint32Array`-backed `ImageData`, blitted to a `<canvas>`, then CSS-scaled
  with `image-rendering: pixelated` to fill the window. The low internal
  resolution is what gives the renderer its retro feel and what keeps
  software rendering in plain JS fast enough.
- Walls are drawn by a textbook DDA raycaster — one ray cast per screen
  column. Sprites are drawn as sorted billboards against a per-column
  z-buffer, so walls correctly occlude enemies and enemies correctly
  occlude each other.
- The dungeon, wall/floor/ceiling textures, enemy sprites, the gun
  viewmodel, and the muzzle flash are all generated procedurally at
  startup. Generators use a seeded LCG; `Math.random()` is forbidden in
  generator paths, so the first rendered frame is byte-identical across
  reloads.
- Atmosphere lighting (distance fog + sky/ground gradient + vignette) is a
  post-pass over the textured world, toggled with `L`. The gun viewmodel
  is drawn last, into the same framebuffer, with bob, kick, and a brief
  muzzle flash overlay on fire.
- Combat is hitscan, with a small enemy AI doing line-of-sight ranged
  attacks and contact damage. The HUD (ammo, kills, HP) and the top-left
  minimap are hand-drawn into the same framebuffer — there is no DOM
  overlay, no second canvas, no WebGL.
- Audio is synthesised on demand with the Web Audio API: short oscillator
  blips for the player shot, hit confirms, enemy windup and fire, hurt,
  dry-fire, and the level-exit cue, all routed through a master gain that
  mute (`M`) drops to zero. Like the visuals, no audio files ship with
  the repo.

## Project layout

```
.
├── index.html        # the entire game
├── README.md         # you are here
├── LICENSE           # MIT
├── AGENTS.md         # workflow + conventions for human and agent contributors
├── CLAUDE.md         # Claude-Code-specific notes (additive to AGENTS.md)
└── specs/            # feature specs implemented via the `spec` CLI
    └── tasks/        # short-form task specs (one-shot work)
```

Each spec under `specs/` describes one self-contained feature or fix, in
enough detail for an agent to implement it from scratch. Browse the
directory if you want to see the kinds of changes that have been made.

## Contributing

Features and fixes are described as **specs** under `specs/` and
implemented by coding agents driven by the `spec` CLI. Dispatchable specs
live directly in `specs/`; small one-shot work goes under `specs/tasks/`.
The full workflow — branch and worktree conventions, the implement-agent
contract, and the `spec` command surface — lives in
[AGENTS.md](AGENTS.md). Read that before authoring a spec or running an
implementation. Claude Code users should also skim [CLAUDE.md](CLAUDE.md)
for a few harness-specific notes that supplement (and never contradict)
`AGENTS.md`.

## License

MIT — see [LICENSE](LICENSE).

---
id: enemy-sprite-art-pass
area: frontend
priority: 55
depends_on: [sprite-bake-manifest]
description: Redraw the imp and grunt at native 32×32 resolution (no 2×2 pixel doubling) with distinct silhouettes, tonal shading and outlines, add a wind-up pose and a fire pose per enemy, and generalise the sprite renderer's frame pick to named frame sets (idle / wind / fire) of any length.
---

# Enemy Sprite Art Pass

## Goal

The imp and grunt are 16×16 drawings doubled to 32×32: every "pixel" is a
2×2 block, each has two or three flat tones, the walk cycle is two
near-identical frames, and the attack wind-up is signalled only by a red
tint. At close range they look like icons, not creatures.

This spec redraws both enemies as native-resolution 32×32 pixel art with
real shading and gives each a small **named frame set**: two walk frames,
one **wind-up** pose (the telegraph before a shot) and one **fire** pose
(shown for the brief fire-flash window). The renderer learns to pick a
frame set by the entity's state and a frame by phase, for any set length.
Hit flash (white silhouette), wind tint, AI, stats, speeds, HP and seeds
are untouched.

## Acceptance Criteria

### Art assets

1. **Files and bindings** (all 32×32, listed in `MANIFEST`):

   | File | Binding |
   |---|---|
   | `imp_walk_1.png`, `imp_walk_2.png` | `impWalk1`, `impWalk2` |
   | `imp_wind.png`, `imp_fire.png` | `impWind`, `impFire` |
   | `grunt_walk_1.png`, `grunt_walk_2.png` | `gruntWalk1`, `gruntWalk2` |
   | `grunt_wind.png`, `grunt_fire.png` | `gruntWind`, `gruntFire` |

   `imp_1/2.png`, `grunt_1/2.png` and the `impFrame*`/`gruntFrame*`
   bindings are removed. Up to two extra walk frames per enemy
   (`*_walk_3/4`) are allowed if the implementer wants a 4-step cycle;
   the renderer must handle either length.

2. **Native resolution.** No frame contains 2×2-aligned pixel doubling as
   its drawing unit; detail (eyes, fingers, teeth, rifle, visor, belt) is
   authored at 1 px. Each enemy uses 8–20 colours with ≥ 4 tones on its
   main material plus a near-black outline (not pure `0,0,0`). Light from
   the upper-left, matching the weapon and pickup conventions.

3. **Silhouettes.** The imp is lean (torso ≤ 14 px wide), horned, hunched,
   red, with long arms and clawed hands, glowing eyes. The grunt is bulky
   (torso ≤ 24 px wide), green-armoured, helmeted with a dark visor, and
   **holds a rifle** that is visible in every frame. Each must be
   identifiable as which enemy at 1:1 (≈ 8 cells away, when the sprite
   is ~34 px tall on screen) and look intentional at 4× (close range).

4. **Floor anchoring.** Feet occupy rows 29–30 and a floor-shadow row 31
   (2–4 tones darker than the floor, opaque, as today); the head reaches
   row 0–2. The sprite is drawn centred at eye level and scaled to the
   cell height, so the bottom row is the floor contact — do not leave
   empty rows at the bottom.

5. **Poses.**
   - *Walk 1/2*: alternate leg and arm positions so the 4 Hz alternation
     reads as a step, not a flicker (shift the weight, not the outline
     position of the whole body).
   - *Wind*: the imp raises an arm with a glowing fireball forming in the
     palm; the grunt shoulders the rifle and leans in. Both poses must be
     different in silhouette from every walk frame so the telegraph is
     readable even before the tint is applied.
   - *Fire*: the imp's arm is thrust forward with the palm open; the
     grunt's rifle shows recoil (muzzle raised, body rocked back).

### Renderer

6. **Frame sets.** Every `SPRITES` entry becomes an object of named arrays:
   ```js
   imp:   { idle: [impWalk1, impWalk2], wind: [impWind], fire: [impFire] },
   grunt: { idle: [gruntWalk1, gruntWalk2], wind: [gruntWind], fire: [gruntFire] },
   exit:  { idle: [exitFrame, exitFrame] },
   imp_proj: { idle: [impProjFrame, impProjFrame] },
   // … every other type: { idle: [frame, frame] } exactly as its array was
   ```
   `drawSprites` picks the set then the frame:
   ```js
   const sets = SPRITES[o.e.type];
   const set = (sets.fire && nowMs < o.e.fireFlashUntil) ? sets.fire
             : (sets.wind && o.e.mode === 'wind')        ? sets.wind
             : sets.idle;
   const sprite = set[(o.e.animPhase | 0) % set.length];
   ```
   For a 2-frame `idle` set this is exactly today's `& 1` pick, so
   pickups, projectiles and the exit render byte-identically. The
   `animPhase` advance rate (`dt * 4` in `aiTick`) is unchanged.

7. **Tint and flash unchanged.** The `wind` red tint and the hit-flash
   white silhouette still apply exactly as today, on top of whichever
   frame is chosen. Death still removes the sprite immediately.

### Unchanged behaviour

8. **No gameplay change.** `TYPE_TABLE`, AI modes and timings,
   `ENEMY_RADIUS`, contact damage, projectile spawn, `stats`,
   `makeEnemy` (including its pre-existing `Math.random()` phase
   de-sync), dungeon generation and every `rand()` call are untouched;
   any seed produces the same layout.

9. **Everything else byte-identical.** Walls, floor, ceiling, HUD,
   minimap, gun, pickups, exit and projectiles render identically; only
   enemy pixels differ.

### Pipeline, docs, verification

10. All frames are PNG → `make bake`; `make check` passes; `make bake`
    twice gives no diff; `node --check` on the extracted script passes.
    No console errors in a smoke session: approach an imp and a grunt,
    watch the walk cycle, get shot at (wind pose → fire pose → projectile),
    shoot each (white flash), kill each, `N`, `R`, `L` both ways.

11. `assets/CREDITS.md` gains rows for the eight (or up to twelve) new
    PNGs, original to this repo; the old imp/grunt rows are removed.
    `README.md` and `AGENTS.md` need no edit.

## Out of Scope

- Death animations, corpses, gibs, pain stagger frames, idle-vs-chase
  distinction, directional (8-way) sprites, new enemy types, bosses.
- Changing the `wind` tint colour, `ENEMY_FLASH_MS`, `ENEMY_FIRE_FLASH_MS`,
  the enemy muzzle-flash square, or the projectile art
  (`world-sprite-art-pass` owns projectiles).
- Any AI, balance or audio change.
- Resolution above 32×32 or per-enemy sprite scale.

## Design Notes

- **Why a fire pose on `fireFlashUntil`.** The window already exists
  (80 ms, set in `enemyFireShot`) and the additive square flash is drawn
  at the same moment; borrowing it costs no new state and makes the
  shot's origin legible. If the window feels too short to perceive the
  pose, raise nothing here — note it in the report; tuning the constant
  belongs to a feel spec.
- **Why `idle` is also the chase/walk set.** Enemies in `idle` mode stand
  still but still animate at 4 Hz today; keeping one set for both avoids
  a stand/walk split that would need AI mode plumbing. A future spec can
  add `chase:` without touching the renderer again.
- **Readability over fidelity.** Faces and weapons are what the eye looks
  for: give the imp 2-px bright eyes and a visible mouth; give the grunt
  a 1-px visor slit highlight and a rifle whose barrel breaks the body
  silhouette. Avoid noisy dithering — it strobes under the sprite's
  nearest-neighbour scaling.
- **Palette sharing.** Keep the floor-shadow tone in the same family as
  the body's darkest tone so the shadow reads as part of the sprite.

## Agent Notes

- Read `AGENTS.md` (Asset Baking), `specs/sprite-bake-manifest.md`, this
  spec, then in `index.html`: the baked region and `SPRITES`, `makeEnemy`,
  `aiTick` (phase advance and mode machine), `enterWind`/`enemyFireShot`
  (`fireFlashUntil`), and `drawSprites`.
- **Art workflow:** `--dump` the old PNG to text to get a starting
  silhouette; redraw at 1 px; `--encode`; **look at the PNG** with your
  image-reading tool and at `make preview --scale 6`; iterate. If
  `make screenshot` works in your environment, also screenshot with an
  enemy in view. Do not report without having looked at every frame.
- Order of work: (1) renderer frame-set generalisation with the old art
  wrapped as `{ idle: [...] }` for every type — zero visual change, test
  it; (2) imp walk/wind/fire; (3) grunt walk/wind/fire; (4) manifest,
  bake, docs, verification.
- Pitfalls: `% set.length` on a negative `animPhase` would be wrong —
  `animPhase` is never negative today, but guard with `| 0` as shown;
  `fireFlashUntil` exists on every duck-typed entity (pickups, exit,
  projectiles) as `0`, so the `sets.fire &&` guard is what keeps them on
  `idle`; keep the floor-shadow row.
- If `world-sprite-art-pass` landed first, its new exit/projectile/pickup
  frames just get wrapped into `{ idle: [...] }` — no art change here.

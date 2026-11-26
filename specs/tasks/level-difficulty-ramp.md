---
id: level-difficulty-ramp
area: frontend
priority: 50
depends_on: []
description: Per-level enemy pressure ramp — generateDungeon takes the level being entered and scales enemies-per-room, the imp/grunt mix and the MAX_ENEMIES cap linearly from level 1 to a level-6 plateau, without adding or reordering any seeded PRNG draw (level 1 stays byte-identical for every ?seed=). Adds a ?level=N start-level URL parameter and a [spawn] console line for verification. Enemy stats, pickups, exit placement and all render paths are untouched.
---

# Level Difficulty Ramp

## Goal

Level progression exists (`advanceLevel()` on the exit cell, `LEVEL N`
in the HUD) but every dungeon is generated with the same pressure:
`generateDungeon(seed)` rolls 1–3 enemies per non-starting room with a
50/50 imp/grunt split and a hard cap of 36, whatever the level counter
says. This task makes the generator aware of the level the player is
*entering* and ramps enemy count and the grunt share linearly from level
1 to a plateau at level 6, so a run gets meaningfully harder as it goes.
Level 1 must stay exactly what it is today for every `?seed=`. A
`?level=N` URL parameter lets a tester start a run at any level, and a
`[spawn]` console line makes the spawn roll observable without DevTools
breakpoints. This is the deterministic, non-Bayesian step; the adaptive
estimator that reads `stats` remains a future spec.

## Acceptance Criteria

1. **Generator takes the level and the level-1 output is unchanged.**
   `generateDungeon(seed, lvl)` gains a second parameter (default `1`)
   and returns `level: lvl` alongside the existing fields. For `lvl === 1`
   the returned `map`, `rooms`, `playerSpawn`, `enemySpawns`,
   `pickupSpawns`, `exitCell` and `themeMap` are identical to today's for
   every seed: no `rand()` call is added, removed or reordered anywhere in
   the generator. The only behavioural edits inside it are (a) an additive
   per-room enemy bonus that is `0` at level 1, (b) a grunt threshold that
   is `0.5` at level 1 applied to the *same* single `rand()` draw that
   picks the type today, and (c) a cap value that is `36` at level 1.
   `Math.random()` is still absent from the generator.

2. **Ramp table.** With `t = clamp((lvl - 1) / 5, 0, 1)` the generator
   uses `extraPerRoom = Math.round(2 * t)`, `gruntChance = 0.5 + 0.3 * t`
   and `maxEnemies = 36 + 6 * extraPerRoom`, giving exactly:

   | level | extra per room | per-room count | grunt chance | cap |
   |---|---|---|---|---|
   | 1 | 0 | 1–3 | 0.50 | 36 |
   | 2 | 0 | 1–3 | 0.56 | 36 |
   | 3 | 1 | 2–4 | 0.62 | 42 |
   | 4 | 1 | 2–4 | 0.68 | 42 |
   | 5 | 2 | 3–5 | 0.74 | 48 |
   | 6 and above | 2 | 3–5 | 0.80 | 48 |

   Per-room count is `min(cells.length, 1 + floor(rand() * 3) + extraPerRoom)`,
   so a small room never overflows; the cap check keeps its existing
   position in both loop conditions. The three constants (`6` plateau
   level, `2` max extra, `0.3` grunt swing) are named module-scope
   constants next to `PICKUP_*` with a one-line comment each, not inline
   literals. `TYPE_TABLE`, `makeEnemy`, `ATTACK_RANGE`, projectile and
   contact-damage constants are not modified: an individual imp or grunt
   fights exactly as it does today.

3. **Every generation site passes the level being entered.**
   `advanceLevel()` calls `generateDungeon(seed, level + 1)` *before*
   incrementing `level` (today the increment follows the call; the
   argument must be the destination level, not the one being left).
   `regenerateDungeon()` (N) and the initial IIFE block pass `START_LEVEL`
   (see #4). `resetRun()` sets `level = START_LEVEL` instead of `1`, so R
   after death returns to the dungeon that was actually generated (same
   seed, same level). No other caller of `generateDungeon` exists; a grep
   confirms every call passes a level argument.

4. **`?level=N` start-level parameter.** A `parseLevelFromUrl()` helper
   modelled on `parseSeedFromUrl()` reads `level` from the URL. It returns
   the integer when the value is a base-10 integer in `1..999`, otherwise
   `null`, swallowing any exception; the module-scope `const START_LEVEL`
   is that value or `1`. With `?seed=12345&level=6` the first frame shows
   `LEVEL 6` in the HUD and the dungeon is generated with the level-6 row
   of #2 for seed 12345; with `?level=0`, `?level=abc`, `?level=2.5`,
   `?level=` or `?level=1000` the game starts at level 1 with no console
   output about the bad value. `?seed=` alone behaves exactly as today.
   The parameter is read once at startup; it does not pin later levels
   (`advanceLevel` keeps picking random seeds and incrementing).

5. **`[spawn]` console line.** `applyDungeon(d)` logs exactly one line
   per generation, immediately after the existing `[seed]` line of the
   caller is emitted (i.e. the `[seed]` line format `'[seed] ' + seed` is
   not changed):
   `[spawn] level=<d.level> enemies=<n> grunts=<g> cap=<maxEnemies>`
   where `n` is `d.enemySpawns.length` and `g` the number of `grunt`
   entries. `maxEnemies` is returned from the generator for this purpose.
   At `?seed=12345` with no `level` parameter the logged `enemies` and
   `grunts` equal the counts produced at commit `c7ee5c5` (the
   implementer records those baseline numbers by instrumenting the
   baseline the same way, or by comparing the first-frame screenshot in
   #8); at `?seed=12345&level=6` `enemies` is strictly greater than at
   level 1 for that seed and `cap=48`.

6. **Level flow.** From level 1, stepping onto the exit shows the
   `LEVEL 2` banner and the console shows a `[spawn] level=2` line; dying
   at level 3 and pressing R shows `LEVEL 1` (or `LEVEL <START_LEVEL>`
   when `?level=` was given) with no new `[seed]`/`[spawn]` lines (R does
   not regenerate); pressing N at level 3 shows a fresh `[seed]` and a
   `[spawn] level=<START_LEVEL>` line. HP, ammo, weapon and shotgun
   ownership carry across the exit exactly as today.

7. **Performance at the plateau.** At `?level=6` on a 12-room seed with
   all enemies alive, standing in the start room and then walking into
   view of a crowded room, the FPS counter stays at or above 30 on the
   same desktop class that meets today's target. `separateEnemies()`
   stays O(n²) over at most 48 enemies and no per-frame allocation is
   added. If the implementer cannot meet 30 FPS at 48 enemies, the fix is
   to lower the plateau cap constant and say so in the report, not to
   change AI or render code.

8. **README, syntax, determinism, size.** `README.md` gains a short
   paragraph after the pickups paragraph: levels get harder up to level 6
   (more enemies per room, more grunts), and a one-line mention of the
   two debug URL parameters `?seed=<u32>` and `?level=<1..999>`. Nothing
   else in `README.md` changes. `node --check` on the extracted `<script>`
   body passes; `make check` passes (baked region untouched);
   `index.html` grows by at most 3 KB over today's 219,453 bytes. The
   first rendered frame at `?seed=12345` with no `level` parameter is
   byte-identical to today's (verify with `make screenshot` against a
   baseline screenshot when Chromium runs; otherwise by the `[spawn]`
   baseline numbers in #5 plus visual comparison of the minimap).

## Out of Scope

- Anything Bayesian or adaptive: reading `stats` to tune difficulty,
  Beta posteriors, per-player skill estimates. The `stats` schema is not
  touched.
- Scaling enemy HP, damage, speed, windup or cooldown (`TYPE_TABLE`),
  projectile speed, contact damage, or player stats.
- New enemy types, bosses, a win condition or a level cap.
- Scaling pickups, ammo, the shotgun pickup, room count, map size or
  exit placement with level.
- Any HUD or banner change beyond what `LEVEL N` already shows; no
  difficulty readout, no "harder" toast.
- Persisting the reached level, high scores or run summaries
  (`localStorage` is not used by this task).
- Changing the `[seed]` log format or the meaning of `?seed=`.
- Touch controls, settings overlay, audio, art, `assets/`, `tools/`,
  the baked region, `AGENTS.md`, `CLAUDE.md`.

## Open Questions

- None blocking. Decisions taken in scoping: count and type mix only;
  linear ramp with a plateau at level 6; `?level=N` test hook included;
  slug `level-difficulty-ramp`.
- The ramp constants in #2 are a first balance guess. The implementer
  may not change them without a note in the report; if the plateau cap
  must drop for #7, the table's `48` becomes the new value and the
  README sentence needs no change.

## Design Notes

### Files involved

`index.html` and `README.md` only. Line numbers as of `c7ee5c5` (expect
small drift):

- Constants block `:122-131` (`PICKUP_*`) — add the three ramp constants
  after `MAX_PICKUPS`.
- `let level = 1;` `:236`.
- `resetRun()` `:2228`, `level = 1;` at `:2245` → `START_LEVEL`.
- `parseSeedFromUrl()` `:2266` — model for `parseLevelFromUrl()`.
- `generateDungeon(seed)` `:2282`; enemy spawn loop `:2480-2510`
  (`MAX_ENEMIES` `:2483`, `want` `:2498`, type roll `:2505`); return
  `:2590`.
- `applyDungeon(d)` `:2595` — `[spawn]` log.
- `regenerateDungeon()` `:2606`, `advanceLevel()` `:2623` (generate
  call `:2626`, `level += 1` `:2627`), initial block `:2645-2651`.
- `README.md` pickups paragraph `:76-78`.

### Sketch

```js
// Constants (next to MAX_PICKUPS)
const LEVEL_RAMP_PLATEAU = 6;   // level at which the ramp stops growing
const LEVEL_RAMP_MAX_EXTRA = 2; // extra enemies per room at the plateau
const LEVEL_RAMP_GRUNT_SWING = 0.3; // grunt chance rises 0.5 → 0.8

function generateDungeon(seed, lvl = 1) {
  const rand = mulberry32(seed);
  const t = Math.min(1, Math.max(0, (lvl - 1) / (LEVEL_RAMP_PLATEAU - 1)));
  const extraPerRoom = Math.round(LEVEL_RAMP_MAX_EXTRA * t);     // 0 at lvl 1
  const gruntChance = 0.5 + LEVEL_RAMP_GRUNT_SWING * t;          // 0.5 at lvl 1
  const maxEnemies = 36 + 6 * extraPerRoom;                      // 36 at lvl 1
  …
  // in the spawn loop (same rand() calls, same order):
  const want = 1 + Math.floor(rand() * 3) + extraPerRoom;
  const count = Math.min(want, cells.length);
  …
  type: rand() < (1 - gruntChance) ? 'imp' : 'grunt',  // today: rand() < 0.5 ? imp : grunt
  …
  return { …, exitCell, themeMap, seed, level: lvl, maxEnemies };
}

function applyDungeon(d) {
  …
  let g = 0;
  for (const s of d.enemySpawns) if (s.type === 'grunt') g++;
  console.info('[spawn] level=' + d.level + ' enemies=' + d.enemySpawns.length +
               ' grunts=' + g + ' cap=' + d.maxEnemies);
}

// advanceLevel(): generate for the destination level
applyDungeon(generateDungeon(seed, level + 1));
level += 1;
```

Note the imp/grunt comparison: today `rand() < 0.5` selects imp. Keep
imp on the low side of the draw and move the threshold to
`1 - gruntChance` (which is `0.5` at level 1) so the same draw yields the
same type at level 1 for every seed.

### Danger zones

- **Seeded determinism (`?seed=` contract).** Every existing seed URL
  and the first-frame byte-identity check depend on the `rand()` call
  sequence. Do not roll an extra draw for the bonus, do not roll the
  type with a second draw, do not move the cap check. Verify #1 by
  reading the diff: the spawn loop must show only threshold/additive
  changes.
- **Destination vs current level.** `advanceLevel()` must generate with
  `level + 1`. Passing `level` makes level 2 play like level 1 and shifts
  the whole table by one.
- **R-reset consistency.** `resetRun()` does not regenerate; with
  `?level=4` it must restore `level = 4`, not `1`, or the HUD lies about
  the dungeon the player is standing in.
- **Room capacity.** Rooms are 4–8 cells a side and pickups avoid enemy
  cells afterwards; `min(want, cells.length)` already prevents overflow,
  and a room full of enemies simply yields fewer pickup cells. Do not
  reorder the enemy and pickup loops to "fix" this.
- **Performance / failure recovery.** 48 enemies is a 33 % increase over
  today's worst case; AI LOS is one DDA per enemy per frame and
  separation is pairwise. Measure at `?level=6` before reporting; lower
  the cap constant rather than touching AI or render code.
- **URL parsing.** `parseLevelFromUrl()` must never throw (wrap in
  `try`/`catch` like the seed parser) and must reject non-integers so a
  typo cannot produce `NaN` in the ramp math.

## Agent Notes

- **Read first:** `AGENTS.md`, this spec,
  `specs/tasks/level-exit-progression.md` (the `level` / `advanceLevel`
  / `clearTransientFeedback` contract), `specs/tasks/procedural-dungeon.md`
  and the seeded-PRNG comments inside `generateDungeon`
  (`shotgun-weapon-pickup` and `pickups-health-ammo` both document why
  draw order is sacred), then `resetRun`, `regenerateDungeon`,
  `advanceLevel` and the initial block.
- **Order of work:** (1) constants and `parseLevelFromUrl` /
  `START_LEVEL` (#2, #4); (2) `generateDungeon(seed, lvl)` with the
  table math and the two loop edits, plus `level` / `maxEnemies` in the
  return (#1, #2); (3) call sites and `resetRun` (#3); (4) `[spawn]` log
  in `applyDungeon` (#5); (5) README (#8); (6) `node --check`,
  `make check`, size, baseline comparison, level-flow and FPS smoke
  (#5–#8), then report.
- **Common pitfalls:**
  - Writing `rand() < gruntChance ? 'imp' : 'grunt'` — that flips the
    level-1 type for every seed. Imp stays on the low side.
  - Incrementing `level` before generating in `advanceLevel()`, or
    generating with the old level.
  - Leaving `level = 1` in `resetRun()` after introducing `START_LEVEL`.
  - Logging `[spawn]` from the generator instead of `applyDungeon` (the
    generator's retry loop would log once per attempt).
  - Editing anything between the baked-sprite markers.
- **Baseline numbers for #5:** before touching the spawn loop, run the
  baseline with a temporary `console.info` of `enemySpawns.length` and
  the grunt count at `?seed=12345` (and one or two other seeds), note
  the values, revert the temporary line, and compare after the change.
  A `make screenshot` of the baseline at `?seed=12345` (the Makefile
  uses `?seed=1234`; override the URL or run the chromium command by
  hand) is the stronger check when Chromium runs on the host.
- **Smoke test before reporting:** `make serve`, open
  `http://localhost:8000/?seed=12345` → `LEVEL 1`, `[spawn] level=1`
  with baseline counts, `cap=36`; `?seed=12345&level=6` → `LEVEL 6`,
  more enemies, `cap=48`, visibly more grunts in a 60-second walk;
  `?level=abc` → `LEVEL 1`, no console warning; play level 1 to the exit
  → `LEVEL 2` banner and `[spawn] level=2`; die, press R → `LEVEL 1` and
  no new log lines; press N → fresh `[seed]` and `[spawn] level=1`;
  `?level=4`, die, R → `LEVEL 4`. Watch the FPS counter at `?level=6`
  with a crowded room in view. DevTools console: no errors or warnings.
- Report completion with `spec report --status ok|…` per the Implement
  Agent Contract in `AGENTS.md`.

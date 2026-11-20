---
id: sprite-bake-manifest
area: frontend
priority: 70
depends_on: []
description: Generalise tools/bake-sprites.mjs into a manifest-driven pipeline that bakes every pixel-art asset (enemies, pickups, exit, projectiles, the three weapon viewmodels, the muzzle-flash frames) from PNGs of any size into index.html with a compact palette+RLE encoding, and add offline --preview / --dump / --encode / --check modes so art can be authored and reviewed without a browser. Zero rendered-pixel change.
---

# Sprite Bake Manifest — every sprite PNG-sourced, reviewable offline

## Goal

Today only the imp and grunt frames are PNG-sourced. The three weapon
viewmodels (`buildGun`, `buildShotgun`, `buildKnife`), the two muzzle-flash
frames (`buildFlash1/2`), the exit pillar, both projectiles, the four
pickups and the shotgun pickup are still hand-written in `index.html` as
rect-fill code or ASCII rows. That split blocks an art pass in two ways:

1. **Nobody can look at the art without a browser.** The autonomous
   implementation sandbox cannot launch Chromium, so an agent redrawing a
   sprite has no feedback loop. A PNG on disk can be opened by a human in
   any pixel editor and viewed by an agent with its image-reading tool.
2. **The bake script is hard-wired to four 32×32 files.** It cannot carry a
   72×96 viewmodel or a 24×24 flash frame, and its base64-of-raw-words
   encoding would cost ~37 KB per viewmodel frame.

This spec turns `tools/bake-sprites.mjs` into a **manifest-driven** pipeline
that bakes *every* sprite from `assets/sprites/*.png` (any rectangular size)
into the existing sentinel region using a **palette + run-length** encoding
with a tiny synchronous inflater, and adds four offline modes:
`--preview` (contact sheet PNG), `--dump` (PNG → editable text),
`--encode` (text → PNG), `--check` (drift detection). It is a pure
infrastructure change: **every rendered pixel is identical before and
after.** The three follow-up art specs (`weapon-viewmodel-art-pass`,
`enemy-sprite-art-pass`, `world-sprite-art-pass`) build on it.

## Acceptance Criteria

### Manifest and sources

1. **`MANIFEST` in `tools/bake-sprites.mjs`.** A single exported array of
   `{ file, binding, w, h }` entries is the only list of baked sprites.
   Initial contents (file → binding, size):

   | `file` (in `assets/sprites/`) | `binding` (const in `index.html`) | w×h |
   |---|---|---|
   | `imp_1.png`, `imp_2.png` | `impFrame1`, `impFrame2` | 32×32 |
   | `grunt_1.png`, `grunt_2.png` | `gruntFrame1`, `gruntFrame2` | 32×32 |
   | `exit.png` | `exitFrame` | 32×32 |
   | `proj_imp.png`, `proj_grunt.png` | `impProjFrame`, `gruntProjFrame` | 32×32 |
   | `medkit_small.png`, `medkit_large.png` | `medkitSmallFrame`, `medkitLargeFrame` | 32×32 |
   | `ammo_small.png`, `ammo_large.png` | `ammoSmallFrame`, `ammoLargeFrame` | 32×32 |
   | `pickup_shotgun.png` | `weaponShotgunFrame` | 32×32 |
   | `vm_pistol.png`, `vm_shotgun.png`, `vm_knife.png` | `GUN_SPRITE`, `SHOTGUN_SPRITE`, `KNIFE_SPRITE` | 72×96 |
   | `flash_1.png`, `flash_2.png` | `FLASH_FRAME_1`, `FLASH_FRAME_2` | 24×24 |

   Binding names are the **existing** const names so no consumer
   (`SPRITES`, `WEAPONS`, `drawGunViewmodel`) changes. The bake fails with
   a clear message if a listed PNG is missing, is not 8-bit RGBA, or has
   dimensions that differ from the manifest entry.

2. **Seed PNGs are pixel-exact.** All 13 new PNGs are produced from the
   *current* procedural / ASCII output and are element-for-element
   identical to what the old code built (see AC #9 for the oracle). The
   four existing imp/grunt PNGs are unchanged (byte-identical files).

3. **Old builders removed from `index.html`.** `buildGun`, `buildShotgun`,
   `buildKnife`, `buildFlash1`, `buildFlash2`, the `exitPalette`/`exitFrame`,
   `impProjPalette`/`impProjFrame`, `gruntProjPalette`/`gruntProjFrame`,
   `medkitPalette`/`medkitSmallFrame`/`medkitLargeFrame`,
   `ammoPalette`/`ammoSmallFrame`/`ammoLargeFrame`,
   `shotgunPalette`/`weaponShotgunFrame` definitions, and the five
   `const GUN_SPRITE = buildGun();`-style lines are deleted. `buildFrame`
   is deleted too if nothing else calls it (grep first). `rgba32`,
   `gunFillRect`, `gunOutlineRect` stay only if they still have callers;
   delete them otherwise. No dead sprite-builder code remains. The
   section comment "Sprite assets — procedurally baked at startup. No
   external files." is rewritten to describe the baked region.

4. **`--bootstrap` and the embedded ASCII imp/grunt definitions are
   removed** from the bake script. The PNGs are the sole source of truth;
   git history is the record of the pre-pipeline art. `AGENTS.md` and the
   script header are updated accordingly (AC #12).

### Encoding and runtime

5. **Palette + RLE encoding.** For each manifest entry the generated region
   carries one object literal:
   ```js
   "GUN_SPRITE": { w: 72, h: 96, pal: [4279440660, 4282794044, …], rle: "AQIB…" },
   ```
   - `pal`: the distinct non-zero `rgba32` words in the frame, **sorted
     ascending as unsigned 32-bit integers** (deterministic). At most 255
     entries; the bake errors above that.
   - Index stream: one byte per pixel, row-major; `0` = transparent,
     `k` = `pal[k - 1]`.
   - RLE: greedy maximal runs, emitted as `(runLength, index)` byte pairs
     with `runLength ∈ 1..255`. A run longer than 255 is split.
   - `rle`: base64 of those bytes, one line per frame.
   Pixel word format is unchanged from today's `rgba32` packing (R in the
   least-significant byte, A = 255 in the most-significant; transparent =
   word `0`). PNG alpha `0` ⇒ transparent; any other alpha ⇒ opaque word
   with the PNG's RGB (the seeds contain only alpha 0 / 255).

6. **Runtime inflater.** The generated region defines one synchronous
   function, roughly:
   ```js
   function inflateSprite(d) {
     const out = new Uint32Array(d.w * d.h);
     const bin = atob(d.rle);
     for (let i = 0, p = 0; i < bin.length; i += 2) {
       const run = bin.charCodeAt(i), k = bin.charCodeAt(i + 1);
       const v = k ? d.pal[k - 1] : 0;
       for (let r = 0; r < run; r++) out[p++] = v;
     }
     out.w = d.w; out.h = d.h;
     return out;
   }
   ```
   followed by one `const <binding> = inflateSprite(BAKED_SPRITES.<binding>);`
   line per manifest entry, in manifest order. The returned `Uint32Array`
   carries **own properties `w` and `h`** so later specs can size blits
   from the frame itself. No `Image()`, no `fetch`, no `<canvas>` decode,
   no `await` — startup stays synchronous and `file://` keeps working.

7. **Sentinel contract preserved.** The bake rewrites only the lines
   strictly between `// <BAKED_SPRITES_BEGIN> …` and
   `// <BAKED_SPRITES_END>`; every other byte of `index.html` is untouched
   by the bake. Output is deterministic (manifest order, fixed formatting);
   running the bake twice yields no diff. The region keeps its current
   location in the file (before the `SPRITES` table); all bindings are
   therefore declared before their first use in `SPRITES` and `WEAPONS`.

8. **Size budget.** After this spec `index.html` is **no larger than
   before** (the RLE'd region plus removed builders must net ≤ 0 bytes),
   and the generated region is under 48 KB. Record both byte counts in
   the commit body.

### Zero visual regression

9. **Objective oracle.** Before editing, capture all 17 frame arrays from
   the current code (copy the pure builders — `rgba32`, `buildFrame`,
   `gunFillRect`, `gunOutlineRect`, the five `build*` functions, the
   palettes and row literals, plus the `SPRITE_SIZE`/`GUN_W`/`GUN_H`/
   `FLASH_W`/`FLASH_H` constants — into a scratch Node script and run it;
   inflate the existing four base64 blobs for imp/grunt). After editing,
   inflate every entry of the new `BAKED_SPRITES` in Node with the new
   `inflateSprite` and assert element-wise equality for all 17 bindings.
   Describe the method and result in the commit body. (Because the
   renderer, `SPRITES` and `WEAPONS` are untouched, equal arrays ⇒ equal
   pixels on screen.)

### Offline tooling

10. **New CLI modes** (zero npm dependencies; Node ≥ 24 built-ins only;
    the CLI body runs only when the script is executed directly, so the
    codec can be imported by scratch scripts):
    - `node tools/bake-sprites.mjs` — bake (default, unchanged meaning).
    - `--check` — exit `0` if baking would leave `index.html` unchanged,
      exit `1` with a message naming the stale bindings otherwise. Writes
      nothing.
    - `--preview <out.png> [--scale N]` — write a contact sheet: every
      manifest sprite decoded from its PNG, upscaled `N`× (default 4,
      nearest-neighbour) on a two-tone grey checkerboard (transparent
      pixels show the checkerboard), laid out in manifest order with an
      8 px gutter, wrapping rows at 1024 px. Print a legend to stdout:
      `index  file  binding  w×h  colours`.
    - `--dump <png>` — print the PNG as editable text (format in AC #11)
      to stdout.
    - `--encode <txt> <png>` — read that text format and write an 8-bit
      RGBA PNG; dimensions come from the rows.
    The module **exports** `MANIFEST`, `encodePNG`, `decodePNG`,
    `pngToWords`, `wordsToText`, `textToWords`.

11. **Text sprite format** (for `--dump` / `--encode`; also the format the
    art specs author in):
    ```
    # lines starting with # are comments; blank lines ignored
    R 220 60 50
    r 140 30 25
    ---
    ....RRrr....
    ....RRrr....
    ```
    Palette lines are `<symbol> <r> <g> <b>` with a single non-space,
    non-`.` character symbol. The line `---` separates palette from rows.
    Every row has the same length; `.` is transparent. `--dump` assigns
    symbols deterministically in order of first appearance from the
    alphabet `A–Z a–z 0–9 @#$%&*+=?!~^<>:;,/|` and errors past 76
    colours; `--encode` errors on ragged rows or an unknown symbol.

### Docs, build, invariants

12. **Docs.** `AGENTS.md` → "Asset Baking" is rewritten: the manifest,
    the encoding, `make bake` / `make check` / `make preview`, the
    `--dump`/`--encode` text workflow, no bootstrap. `README.md`'s
    architecture bullet that says enemy sprites, the gun viewmodel and
    the muzzle flash "are all generated procedurally at startup" is
    corrected (textures still are; sprite art is PNG-sourced and baked
    into the single file). `assets/CREDITS.md` lists every manifest PNG,
    each marked as seeded from the repo's prior procedural art.
    `CLAUDE.md` is not edited.

13. **Makefile.** Targets: `bake` (unchanged), `serve` (unchanged),
    `check` (`node tools/bake-sprites.mjs --check`), `preview`
    (`node tools/bake-sprites.mjs --preview "$${TMPDIR:-/tmp}/sprites-preview.png"`
    and echo the path), and a **best-effort** `screenshot` target:
    ```make
    screenshot:
    	chromium --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
    	  --user-data-dir="$${TMPDIR:-/tmp}/bs-chrome-profile" \
    	  --window-size=960,540 --virtual-time-budget=2000 \
    	  --screenshot="$${TMPDIR:-/tmp}/bs-screenshot.png" \
    	  "file://$(CURDIR)/index.html?seed=1234"
    ```
    `screenshot` is allowed to fail where Chromium cannot run (the
    default sandbox denies the Unix socket Chromium needs and the
    process aborts) — it must not be part of `check`. All `.PHONY`.

14. **Invariants.** Still one `index.html`, opens over `file://`, no build
    step for players, no network, no new `Math.random()`, no change to
    `SPRITES`, `WEAPONS`, `drawSprites`, `drawGunViewmodel`, any constant,
    any gameplay path. `node --check` on the extracted `<script>` body
    passes; `make bake` then `make check` passes; `make bake` twice gives
    no diff.

## Out of Scope

- Any change to rendered pixels, frame counts, animation, or sprite sizes.
  The art itself is the job of the three follow-up specs.
- Changing `GUN_W`/`GUN_H`/`FLASH_W`/`FLASH_H` or making the blits read
  frame dimensions (`.w`/`.h` are provided here but not consumed yet).
- Wall / floor / ceiling textures — they stay procedural.
- A JSON manifest file, an image-editor plugin, CC0 art downloads, npm
  dependencies, GitHub Actions.
- Indexed-colour or paletted PNG input. Sources are 8-bit RGBA, as today.

## Design Notes

- **Why palette + RLE instead of raw words or PNG bytes.** Raw little-
  endian words cost 4 B/px (a 72×96 viewmodel ≈ 37 KB in base64). Base64
  PNG bytes would need an inflate implementation or an async decode.
  Pixel art is flat-coloured, so one index byte per pixel with run-length
  pairs typically compresses 8–20× and decodes in a dozen synchronous
  lines. Sorting the palette makes the output canonical.
- **Why bindings keep the old const names.** `SPRITES` and `WEAPONS`
  reference `impFrame1`, `GUN_SPRITE`, etc. Keeping the names makes this
  spec a pure move with no consumer edits, which is what makes the oracle
  in AC #9 sufficient proof.
- **Why `--dump`/`--encode`.** An agent cannot run a pixel editor, but it
  can write and read text. The round trip PNG → text → PNG is lossless
  for ≤ 76-colour art, which covers everything here. The art specs tell
  the implementer to dump, edit, encode, then look at the PNG and the
  preview sheet.
- **Where the region sits.** Keep it where it is today (just after the
  `SPRITE_SIZE` constant, before `SPRITES`). The viewmodel/flash consts
  move from ~line 4479 up into the region; they are only read inside
  `WEAPONS` (declared later) and at render time, so hoisting is safe.
- **PNG codec.** The existing minimal encoder/decoder is reused; drop the
  `SPRITE_SIZE === width` assertion in favour of the manifest check.
  Keep handling filter types 0–4 on decode.

## Agent Notes

- Read `AGENTS.md`, this spec, then `tools/bake-sprites.mjs` end-to-end and
  these `index.html` regions: the sprite section (`SPRITE_SIZE` … the
  `SPRITES` table), `buildGun` … `FLASH_FRAME_2` and the `WEAPONS`
  registry, and `drawGunViewmodel` (read-only — do not edit it).
- Suggested order:
  1. Write the oracle scratch script (AC #9) and save the 17 arrays.
  2. Rewrite the bake script: codec exports, `MANIFEST`, palette+RLE,
     `--check`, `--preview`, `--dump`, `--encode`, direct-run guard.
  3. Generate the 13 seed PNGs from the oracle arrays with `encodePNG`
     (scratch script, not committed).
  4. Delete the builders from `index.html`; run `make bake`; run
     `node --check`.
  5. Inflate the new region in Node and diff against the oracle.
  6. `make check`, bake twice for idempotency, size budget, docs,
     `CREDITS.md`, Makefile.
- Pitfalls: R/B byte order in PNG↔word; transparent must be word `0`, not
  opaque black; a run of exactly 256+ pixels must split; `atob` is only
  available at runtime, so the Node-side oracle uses `Buffer.from(…,
  'base64')`; keep the two sentinel marker lines byte-stable; the
  `vm_*.png` files are 72×96 (portrait) — don't transpose.
- No browser is required to prove this spec; `make serve` is optional.
  If `make screenshot` works in your environment (Chromium installed and
  the sandbox allows Unix sockets), a before/after screenshot pair is a
  nice extra confirmation of zero regression, but the Node oracle in
  AC #9 is the proof.

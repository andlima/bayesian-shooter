# Asset Credits

## Enemy sprites — `assets/sprites/`

| File | Sprite | Source |
|------|--------|--------|
| `imp_1.png`, `imp_2.png` | Imp idle animation (2 frames) | Derived from this repo's prior procedural generator |
| `grunt_1.png`, `grunt_2.png` | Grunt idle animation (2 frames) | Derived from this repo's prior procedural generator |

The four 32×32 RGBA PNGs above were **seeded** by re-expressing the game's
original hand-written `impFrame*` / `gruntFrame*` procedural pixel art as
PNGs (see `tools/bake-sprites.mjs --bootstrap`). They are pixel-identical to
the pre-pipeline procedural output — this is a deliberate zero-regression
bootstrap, **not** third-party art. No external attribution is required for
the seeded art; it is covered by this repository's existing license.

## Replacing the seeded art with CC0 sprites

The pipeline exists so the seeded art can be swapped for real
hand-authored / CC0 sprites in a one-step follow-up:

1. Replace the PNG(s) in `assets/sprites/` with new **32×32, 8-bit RGBA
   (PNG color type 6)** art keeping the same filenames.
2. Run `make bake` (rewrites only the baked region of `index.html`).
3. Add an attribution row below for any sprite that is **not** original to
   this repo. CC0 / public-domain art still warrants a courtesy credit:

   ```
   | imp_1.png, imp_2.png | Imp | "<Asset name>" by <Author>,
   <source URL> — CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/) |
   ```

   For other licenses (e.g. CC-BY) record the licence and the exact
   attribution string the licence requires.

### Third-party / CC0 attributions

_None yet — the current sprites are the repo's own seeded art._

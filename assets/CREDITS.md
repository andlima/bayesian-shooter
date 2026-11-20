# Asset Credits

## Sprites — `assets/sprites/`

Every PNG below is listed in `MANIFEST` in `tools/bake-sprites.mjs` and
baked into `index.html` by `make bake`. All of them are **seeded from this
repository's prior procedural art**: each file was produced by running the
game's original hand-written builder (ASCII rows or rect-fill code) once and
writing the resulting pixels out as an 8-bit RGBA PNG, so it is
pixel-identical to the pre-pipeline output. None of it is third-party art;
no external attribution is required and it is covered by this repository's
existing license.

| File | Binding | Size | Source |
|------|---------|------|--------|
| `imp_1.png`, `imp_2.png` | `impFrame1`, `impFrame2` | 32×32 | Seeded from the repo's prior procedural art (imp idle, 2 frames) |
| `grunt_1.png`, `grunt_2.png` | `gruntFrame1`, `gruntFrame2` | 32×32 | Seeded from the repo's prior procedural art (grunt idle, 2 frames) |
| `exit.png` | `exitFrame` | 32×32 | Seeded from the repo's prior procedural art (exit pillar) |
| `proj_imp.png` | `impProjFrame` | 32×32 | Seeded from the repo's prior procedural art (imp fireball) |
| `proj_grunt.png` | `gruntProjFrame` | 32×32 | Seeded from the repo's prior procedural art (grunt bolt) |
| `medkit_small.png`, `medkit_large.png` | `medkitSmallFrame`, `medkitLargeFrame` | 32×32 | Seeded from the repo's prior procedural art (health pickups) |
| `ammo_small.png`, `ammo_large.png` | `ammoSmallFrame`, `ammoLargeFrame` | 32×32 | Seeded from the repo's prior procedural art (ammo pickups) |
| `pickup_shotgun.png` | `weaponShotgunFrame` | 32×32 | Seeded from the repo's prior procedural art (shotgun pickup) |
| `vm_pistol.png` | `GUN_SPRITE` | 72×96 | Seeded from the repo's prior procedural art (pistol viewmodel) |
| `vm_shotgun.png` | `SHOTGUN_SPRITE` | 72×96 | Seeded from the repo's prior procedural art (shotgun viewmodel) |
| `vm_knife.png` | `KNIFE_SPRITE` | 72×96 | Seeded from the repo's prior procedural art (knife viewmodel) |
| `flash_1.png`, `flash_2.png` | `FLASH_FRAME_1`, `FLASH_FRAME_2` | 24×24 | Seeded from the repo's prior procedural art (muzzle flash, 2 frames) |

## Replacing the seeded art

The pipeline exists so the seeded art can be swapped for hand-authored or
CC0 sprites in a one-step follow-up:

1. Replace the PNG(s) in `assets/sprites/` with new **8-bit RGBA (PNG color
   type 6)** art of the size recorded in `MANIFEST`, keeping the filenames
   (or add a new file plus a manifest row).
2. Run `make bake` (rewrites only the baked region of `index.html`), then
   `make check` and `make preview` to review.
3. Add an attribution row below for any sprite that is **not** original to
   this repo. CC0 / public-domain art still warrants a courtesy credit:

   ```
   | imp_1.png, imp_2.png | Imp | "<Asset name>" by <Author>,
   <source URL> — CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/) |
   ```

   For other licenses (e.g. CC-BY) record the licence and the exact
   attribution string the licence requires.

### Third-party / CC0 attributions

_None yet — every current sprite is the repo's own seeded art._

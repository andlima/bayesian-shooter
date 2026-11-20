# Asset Credits

## Sprites — `assets/sprites/`

Every PNG below is listed in `MANIFEST` in `tools/bake-sprites.mjs` and
baked into `index.html` by `make bake`. Each is either **seeded from this
repository's prior procedural art** (produced by running the game's original
hand-written builder once and writing the pixels out as an 8-bit RGBA PNG,
pixel-identical to the pre-pipeline output) or **original pixel art authored
for this repository** (the weapon viewmodels, muzzle flashes and shotgun
pickup from `weapon-viewmodel-art-pass`). None of it is third-party art; no
external attribution is required and it is covered by this repository's
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
| `pickup_shotgun.png` | `weaponShotgunFrame` | 32×32 | Original to this repo (weapon-viewmodel-art-pass: shotgun pickup redrawn to match the viewmodel) |
| `vm_pistol_idle.png`, `vm_pistol_fire.png` | `VM_PISTOL_IDLE`, `VM_PISTOL_FIRE` | 96×104 | Original to this repo (weapon-viewmodel-art-pass: pistol viewmodel, idle + slide-back) |
| `vm_shotgun_idle.png`, `vm_shotgun_fire.png`, `vm_shotgun_pump.png` | `VM_SHOTGUN_IDLE`, `VM_SHOTGUN_FIRE`, `VM_SHOTGUN_PUMP` | 96×104 | Original to this repo (weapon-viewmodel-art-pass: shotgun viewmodel, idle + recoil + pump) |
| `vm_knife_idle.png`, `vm_knife_slash.png` | `VM_KNIFE_IDLE`, `VM_KNIFE_SLASH` | 96×104 | Original to this repo (weapon-viewmodel-art-pass: knife viewmodel, idle + slash) |
| `flash_pistol_1.png`, `flash_pistol_2.png` | `FLASH_PISTOL_1`, `FLASH_PISTOL_2` | 24×24 | Original to this repo (weapon-viewmodel-art-pass: pistol muzzle flash, 2 frames) |
| `flash_shotgun_1.png`, `flash_shotgun_2.png` | `FLASH_SHOTGUN_1`, `FLASH_SHOTGUN_2` | 40×40 | Original to this repo (weapon-viewmodel-art-pass: shotgun muzzle flash, 2 frames) |

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

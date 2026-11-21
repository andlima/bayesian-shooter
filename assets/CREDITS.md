# Asset Credits

## Sprites — `assets/sprites/`

Every PNG below is listed in `MANIFEST` in `tools/bake-sprites.mjs` and
baked into `index.html` by `make bake`. Every file is **original to this
repository**. Some are *seeded from the repo's prior procedural art*: each
was produced by running the game's original hand-written builder (ASCII rows
or rect-fill code) once and writing the resulting pixels out as an 8-bit RGBA
PNG, so it is pixel-identical to the pre-pipeline output. The rest are
**hand-authored pixel art drawn in-repo**: the imp and grunt frames for
`enemy-sprite-art-pass`, the weapon viewmodels, muzzle flashes and
shotgun pickup for `weapon-viewmodel-art-pass`, both via the
`--dump` / `--encode` text workflow, and the redrawn shotgun viewmodel plus
the mitten / none / shadow hand-style frames for `viewmodel-hand-styles`
(composed procedurally from the same ramps with a scratch script that
imports the bake module's codec). None of it is third-party art; no
external attribution is required and it is covered by this repository's
existing license.

| File | Binding | Size | Source |
|------|---------|------|--------|
| `imp_walk_1.png`, `imp_walk_2.png` | `impWalk1`, `impWalk2` | 32×32 | Original to this repo (enemy-sprite-art-pass): imp walk cycle, 2 frames, native 32×32 |
| `imp_wind.png` | `impWind` | 32×32 | Original to this repo (enemy-sprite-art-pass): imp wind-up pose, fireball forming in raised palm |
| `imp_fire.png` | `impFire` | 32×32 | Original to this repo (enemy-sprite-art-pass): imp fire pose, arm thrust forward |
| `grunt_walk_1.png`, `grunt_walk_2.png` | `gruntWalk1`, `gruntWalk2` | 32×32 | Original to this repo (enemy-sprite-art-pass): grunt walk cycle, 2 frames, native 32×32 |
| `grunt_wind.png` | `gruntWind` | 32×32 | Original to this repo (enemy-sprite-art-pass): grunt wind-up pose, rifle shouldered |
| `grunt_fire.png` | `gruntFire` | 32×32 | Original to this repo (enemy-sprite-art-pass): grunt fire pose, rifle recoil with muzzle raised |
| `exit_1.png`, `exit_2.png` | `exitFrame1`, `exitFrame2` | 32×32 | Original to this repo (`world-sprite-art-pass`): floor pad + light beam, 2-frame pulse |
| `proj_imp_1.png`, `proj_imp_2.png` | `impProjFrame1`, `impProjFrame2` | 32×32 | Original to this repo (`world-sprite-art-pass`): imp fireball, 2-frame flicker |
| `proj_grunt_1.png`, `proj_grunt_2.png` | `gruntProjFrame1`, `gruntProjFrame2` | 32×32 | Original to this repo (`world-sprite-art-pass`): grunt plasma bolt, 2-frame flicker |
| `medkit_small.png`, `medkit_large.png` | `medkitSmallFrame`, `medkitLargeFrame` | 32×32 | Original to this repo (`world-sprite-art-pass`): bevelled 3/4-view medkits |
| `ammo_small.png`, `ammo_large.png` | `ammoSmallFrame`, `ammoLargeFrame` | 32×32 | Original to this repo (`world-sprite-art-pass`): bevelled 3/4-view ammo crates |
| `pickup_shotgun.png` | `weaponShotgunFrame` | 32×32 | Original to this repo (weapon-viewmodel-art-pass: shotgun pickup redrawn to match the viewmodel) |
| `vm_pistol_idle.png`, `vm_pistol_fire.png` | `VM_PISTOL_IDLE`, `VM_PISTOL_FIRE` | 96×104 | Original to this repo (weapon-viewmodel-art-pass: pistol viewmodel, idle + slide-back) |
| `vm_shotgun_idle.png`, `vm_shotgun_fire.png`, `vm_shotgun_pump.png` | `VM_SHOTGUN_IDLE`, `VM_SHOTGUN_FIRE`, `VM_SHOTGUN_PUMP` | 96×104 | Original to this repo (weapon-viewmodel-art-pass: shotgun viewmodel, idle + recoil + pump) |
| `vm_knife_idle.png`, `vm_knife_slash.png` | `VM_KNIFE_IDLE`, `VM_KNIFE_SLASH` | 96×104 | Original to this repo (weapon-viewmodel-art-pass: knife viewmodel, idle + slash) |
| `flash_pistol_1.png`, `flash_pistol_2.png` | `FLASH_PISTOL_1`, `FLASH_PISTOL_2` | 24×24 | Original to this repo (weapon-viewmodel-art-pass: pistol muzzle flash, 2 frames) |
| `flash_shotgun_1.png`, `flash_shotgun_2.png` | `FLASH_SHOTGUN_1`, `FLASH_SHOTGUN_2` | 40×40 | Original to this repo (weapon-viewmodel-art-pass: shotgun muzzle flash, 2 frames) |
| `vm_pistol_idle_mitten.png`, `vm_pistol_fire_mitten.png` | `VM_PISTOL_IDLE_MITTEN`, `VM_PISTOL_FIRE_MITTEN` | 96×104 | Original to this repo (viewmodel-hand-styles: pistol with a fingerless mitten glove, same body as style 0) |
| `vm_shotgun_idle_mitten.png`, `vm_shotgun_fire_mitten.png`, `vm_shotgun_pump_mitten.png` | `VM_SHOTGUN_IDLE_MITTEN`, `VM_SHOTGUN_FIRE_MITTEN`, `VM_SHOTGUN_PUMP_MITTEN` | 96×104 | Original to this repo (viewmodel-hand-styles: foreshortened shotgun body with mitten gloves on grip and fore-end) |
| `vm_knife_idle_mitten.png`, `vm_knife_slash_mitten.png` | `VM_KNIFE_IDLE_MITTEN`, `VM_KNIFE_SLASH_MITTEN` | 96×104 | Original to this repo (viewmodel-hand-styles: knife with a mitten glove) |
| `vm_pistol_idle_none.png`, `vm_pistol_fire_none.png` | `VM_PISTOL_IDLE_NONE`, `VM_PISTOL_FIRE_NONE` | 96×104 | Original to this repo (viewmodel-hand-styles: pistol only, checkered grip running off the bottom edge) |
| `vm_shotgun_idle_none.png`, `vm_shotgun_fire_none.png`, `vm_shotgun_pump_none.png` | `VM_SHOTGUN_IDLE_NONE`, `VM_SHOTGUN_FIRE_NONE`, `VM_SHOTGUN_PUMP_NONE` | 96×104 | Original to this repo (viewmodel-hand-styles: foreshortened shotgun only, grip and stock running off the bottom edge) |
| `vm_knife_idle_none.png`, `vm_knife_slash_none.png` | `VM_KNIFE_IDLE_NONE`, `VM_KNIFE_SLASH_NONE` | 96×104 | Original to this repo (viewmodel-hand-styles: knife only, handle running off the bottom edge) |
| `vm_pistol_idle_shadow.png`, `vm_pistol_fire_shadow.png` | `VM_PISTOL_IDLE_SHADOW`, `VM_PISTOL_FIRE_SHADOW` | 96×104 | Original to this repo (viewmodel-hand-styles: pistol with a two-tone shadow hand tucked behind the grip) |
| `vm_shotgun_idle_shadow.png`, `vm_shotgun_fire_shadow.png`, `vm_shotgun_pump_shadow.png` | `VM_SHOTGUN_IDLE_SHADOW`, `VM_SHOTGUN_FIRE_SHADOW`, `VM_SHOTGUN_PUMP_SHADOW` | 96×104 | Original to this repo (viewmodel-hand-styles: foreshortened shotgun with two-tone shadow hands behind grip and fore-end) |
| `vm_knife_idle_shadow.png`, `vm_knife_slash_shadow.png` | `VM_KNIFE_IDLE_SHADOW`, `VM_KNIFE_SLASH_SHADOW` | 96×104 | Original to this repo (viewmodel-hand-styles: knife with a two-tone shadow hand behind the handle) |

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
   | imp_walk_1.png, imp_walk_2.png | Imp | "<Asset name>" by <Author>,
   <source URL> — CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/) |
   ```

   For other licenses (e.g. CC-BY) record the licence and the exact
   attribution string the licence requires.

### Third-party / CC0 attributions

_None yet — every current sprite is the repo's own seeded art._

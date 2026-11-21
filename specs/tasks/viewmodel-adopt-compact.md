---
id: viewmodel-adopt-compact
area: frontend
priority: 50
depends_on: []
description: Adopt the `compact` viewmodel placement as the one and only framing — promote the seven compact PNGs to the base names, delete the base and wide art, fold the compact muzzle anchors into WEAPONS, and remove VM_VARIANTS, the H cycle and the "vm:" label.
---

# Viewmodel Adopt Compact — Fold the Winner In, Remove the H Cycle

## Goal

`viewmodel-mitten-placement` (#51) put five placement variants of the
mitten viewmodel on the `H` key so the operator could compare them in
play. The operator has compared them and picked **`compact`** (the base
weapon body translated down with the mitten cut to a short wrap, so the
whole weapon sits above the HUD), exactly as it renders today at
`vmVariantIdx = 3`.

This task makes `compact` the only viewmodel art and removes the
exploration scaffolding: the seven `compact` PNGs take over the base
`vm_<weapon>_<frame>.png` filenames and `VM_<WEAPON>_<FRAME>` bindings,
the seven base and seven `wide` PNGs are deleted, the per-weapon frames
and muzzle anchors move back into `WEAPONS`, and `VM_VARIANTS`,
`vmVariantIdx`, `vmToggledAtMs`, the `KeyH` handler and the `vm:` label
are deleted. The game must look **pixel-identical** to today's `compact`
variant; nothing else about the viewmodel (kick, bob, sway, equip
slide-in, FOV punch, drop shadow, muzzle flash frames, muzzle wash) or
the rest of the game changes.

## Acceptance Criteria

1. **Compact is the only viewmodel art.** In `assets/sprites/`, the
   seven `vm_<weapon>_<frame>_compact.png` files are renamed to
   `vm_<weapon>_<frame>.png` with their pixels unchanged (each renamed
   PNG decodes to the same `rgba32` words as today's `_compact` PNG),
   and the seven `vm_<weapon>_<frame>_wide.png` files plus today's seven
   base `vm_<weapon>_<frame>.png` files are deleted. Exactly seven
   `vm_*.png` files remain (`pistol_idle`, `pistol_fire`,
   `shotgun_idle`, `shotgun_fire`, `shotgun_pump`, `knife_idle`,
   `knife_slash`). `MANIFEST` in `tools/bake-sprites.mjs` has exactly
   seven `vm_*` rows, bound to `VM_PISTOL_IDLE … VM_KNIFE_SLASH`, all
   96×104, and no `_compact` / `_wide` rows or the
   "viewmodel-mitten-placement" manifest comment; the `make bake` output
   region therefore contains exactly seven viewmodel literals.

2. **Frames and anchors live in `WEAPONS`.** `VM_VARIANTS`,
   `VM_BASE_FRAMES` and `VM_BASE_BARREL` are deleted. Each `WEAPONS`
   entry carries `frames` (`pistol: { idle, fire }`, `shotgun: { idle,
   fire, pump }`, `knife: { idle, slash }`, referencing the seven base
   bindings) and the compact muzzle anchor as `barrelX` / `barrelY`:
   pistol `48, 28`, shotgun `48, 18`, knife `48, 24` (the knife's is
   kept for property-set uniformity and is never drawn, as today). The
   module-scope `BARREL_X` / `BARREL_Y` constants are removed (the
   pistol and knife anchors now differ, so a shared constant no longer
   describes them). The startup self-check walks `WEAPONS` instead of
   `VM_VARIANTS`: it still throws at module init if any weapon lacks a
   `GUN_W×GUN_H` frame for `'idle'` or for any `fireAnim` segment's
   `frame`, or lacks numeric `barrelX` / `barrelY`.

3. **Blit reads `WEAPONS` and loses `dropPx`.** In `drawGunViewmodel`
   the frame is `wpn.frames[frameKey]`, `dy = baseY + Math.round(bob +
   kick + sway) + equipOffY` (no `dropPx` term), and the flash /
   `muzzleAnchorX/Y` use `dx + wpn.barrelX`, `dy + wpn.barrelY`. Nothing
   else in the function changes: still exactly one `GUN_W×GUN_H` blit
   plus one optional flash blit, the same bounds tests, HUD drawn over
   the gun as today. Observable: for every weapon, frame key and
   bob / kick / sway / equip state, the viewmodel pixels and the flash
   land exactly where today's `compact` variant puts them.

4. **`H` is unbound and the label is gone.** The `KeyH` case in the
   `keydown` handler, the `let vmVariantIdx` / `let vmToggledAtMs`
   declarations and the `vm:` transient-label block are deleted.
   Pressing `H` (alive or dead, any weapon, mid-animation) changes
   nothing: no label, no state, no frame change; `H` is not added to
   `blockedKeys`. The `L` and `T` labels are unchanged (same rects,
   fonts, alpha ramps and timings).

5. **Pixel-identical to today's `compact`.** With the pistol equipped on
   load at `?seed=12345`, the framebuffer (`buf32`) of the first
   rendered frame is byte-identical to today's first frame after three
   `H` presses (`vmVariantIdx = 3`, `compact`), reload after reload. The
   same holds for the shotgun and knife idle / fire / pump / slash
   frames and for the muzzle flash position under identical bob / kick /
   sway / equip state. The only pixels that differ from today's
   *default* (`base`) first frame are inside the viewmodel box. No new
   `rand()` / `Math.random()`. The pistol-only `make screenshot` (where
   Chromium runs) shows the compact pistol with the whole slide above
   the HUD strip.

6. **No scaffolding identifiers remain.** None of `VM_VARIANTS`,
   `VM_BASE_FRAMES`, `VM_BASE_BARREL`, `vmVariantIdx`, `vmToggledAtMs`,
   `dropPx`, `BARREL_X`, `BARREL_Y`, `_COMPACT`, `_WIDE`, `_compact`,
   `_wide`, `'vm: '`, `KeyH` or the words "placement variant" appear in
   `index.html` (outside the baked region, which is generated),
   `tools/bake-sprites.mjs`, `README.md` or `assets/CREDITS.md`.
   Comments in `WEAPONS`, the gun constants and `drawGunViewmodel` that
   today point at `VM_VARIANTS` are rewritten to describe the
   `WEAPONS[*].frames` / `barrelX` / `barrelY` arrangement. Git history
   is the only record of the base and `wide` art, per `AGENTS.md`.

7. **Pipeline, size, docs.** The seven remaining PNGs are 8-bit RGBA;
   `make bake` then `make check` passes; running `make bake` twice
   produces no diff; `node --check` on the extracted `<script>` body
   passes; `index.html` is **strictly smaller** than today's 247,412
   bytes (14 frames out, none in). `assets/CREDITS.md` drops the
   `_compact` / `_wide` rows, re-labels the seven base rows as the
   compact art (base mitten body translated down with the short hand
   wrap, original to this repo), and its prose paragraph no longer
   describes `compact` / `wide` as separate variant sets. `README.md`
   is unchanged (`H` was never documented).

8. **Smoke.** No console errors or warnings in a smoke session that
   equips each weapon (`1`, `2` after the shotgun pickup, `3`, `Q`),
   fires, dry-fires (pistol / shotgun), lets the pump and the slash
   play, presses `H` alive, dead and mid-animation, and also covers
   death, `R`, `N`, a level exit, `L`, `T` and `M`.

## Out of Scope

- Any change to the compact art itself, the muzzle-flash frames, the
  muzzle wash, `pickup_shotgun.png` or any world sprite.
- Any X or Y offset (`GUN_RIGHT_SHIFT` stays `0`; `baseY` stays
  `H - GUN_H + 4`), changing `GUN_W` / `GUN_H`, or scaling the blit.
- Kick / bob / sway / equip / FOV constants, fire-animation timings,
  cooldowns, damage, ammo, audio, `drawGunShadow`, the shadow band, the
  crosshair, HUD layout, the minimap.
- Re-binding `H` to anything else, a settings overlay, URL parameters,
  persistence.
- Reviving or keeping the `base`, `low`, `lower` or `wide` placements in
  any form (no hidden registry, no dead constants).
- Touching `specs/tasks/viewmodel-mitten-placement.md` or any other
  spec; they are historical records.

## Open Questions

- Whether `frames` / `barrelX` / `barrelY` sit directly on each
  `WEAPONS` entry (the pre-#50 shape, assumed above) or in a single
  parallel `VM_FRAMES` / `VM_BARREL` table keyed by weapon id is the
  implementer's call; #2 names the `WEAPONS` shape, but a keyed table
  is acceptable if the self-check and `drawGunViewmodel` read from it
  and #3, #5 and #6 still hold. Do not keep an array of variants.
- Whether to keep a one-line comment in `WEAPONS` noting that the art
  is the `compact` placement chosen in #51 is fine either way; the
  words "placement variant" must not survive (#6).

## Design Notes

### Files involved

`index.html` (gun constants, state declarations, `keydown`, label block,
`WEAPONS`, self-check, `drawGunViewmodel`; baked region via `make bake`),
`tools/bake-sprites.mjs` (`MANIFEST`: 14 rows removed, 7 kept),
`assets/sprites/*.png` (14 deleted, 7 renamed), `assets/CREDITS.md`.

### Hook points (line numbers as of `5e6187a`; expect drift)

- Gun constants `index.html:157-164` — `BARREL_X` / `BARREL_Y` go.
- State `index.html:1846-1851` — `vmVariantIdx` / `vmToggledAtMs` go.
- `keydown` `index.html:487-492` — `KeyH` case goes.
- Label block `index.html:3302-3311` — goes.
- `WEAPONS` `index.html:4035-4095` — gains `frames`, `barrelX`,
  `barrelY`; comments at `4001-4002`, `4022-4025`, `4043`, `4059`,
  `4077-4078`, `4086` rewritten.
- `VM_VARIANTS` + self-check `index.html:4097-4176` — registry deleted,
  self-check rewritten over `WEAPONS`.
- `drawGunViewmodel` `index.html:4288-4291`, `4315`, `4330-4333`.
- Baked region `index.html:1864-1966` — rewritten by `make bake` only.
- `MANIFEST` `tools/bake-sprites.mjs:102-131`.

### Today's compact anchors (from `VM_VARIANTS[3].barrel`)

| Weapon | x | y |
|---|---|---|
| pistol | 48 | 28 |
| shotgun | 48 | 18 |
| knife | 48 | 24 |

`dropPx` for `compact` is `0`, so dropping the term from `dy` is a
no-op for the chosen art.

### Why delete rather than keep a registry of one

A one-entry registry would keep `vmVariantIdx`-shaped indirection alive
for no reader. Moving `frames` / `barrelX` / `barrelY` back onto the
weapon entries restores the data-driven shape `fireShot` /
`drawGunViewmodel` had before #50, keeps one source of truth per weapon,
and lets the self-check stay a plain loop over `WEAPONS`.

## Agent Notes

- **Read first:** `AGENTS.md` (Asset Baking), `CLAUDE.md`, this spec,
  `specs/tasks/viewmodel-mitten-placement.md` (the registry being
  removed and the compact art contract the surviving frames satisfy),
  then in `index.html`: gun constants, the `keydown` handler, the label
  block, `WEAPONS`, `VM_VARIANTS` + self-check, `drawGunViewmodel`.
- **Order of work:**
  1. Before touching anything, capture a reference: open
     `?seed=12345`, press `H` three times (label `vm: compact`), and
     keep a copy of the compact PNGs' decoded words via a scratch script
     that imports `pngToWords` from the bake module, so #1 and #5 can be
     checked against them.
  2. Art: `git rm` the seven base and seven wide PNGs, then `git mv`
     each `_compact` PNG to the base name (delete first; `git mv` fails
     on an existing target). Rewrite `MANIFEST` to the seven rows,
     `make bake && make check`.
  3. Code: delete `VM_VARIANTS` / `VM_BASE_*`, `BARREL_X/Y`, the state,
     the `KeyH` case and the label; add `frames` / `barrelX` /
     `barrelY` to `WEAPONS`; rewrite the self-check and the three
     `drawGunViewmodel` sites; fix comments.
  4. `node --check`, size check, grep for every identifier in #6,
     `CREDITS.md`, full smoke test, report.
- **Common pitfalls:**
  - Leaving `BARREL_X` / `BARREL_Y` with the old base values (`48, 6`)
    and reading them anywhere — the compact pistol muzzle is at `y 28`;
    a stale constant floats the flash 22 px above the barrel.
  - Forgetting the knife's `barrelX` / `barrelY` so the self-check
    throws at load.
  - Deleting the label block but leaving `vmToggledAtMs` declared (or
    the reverse) — grep for both.
  - Hand-editing the baked region; only `make bake` writes it.
  - Editing `README.md` or the historical spec.
- **Smoke test before reporting** (`make serve`, open in a browser):
  - Load with `?seed=12345`: compact mitten pistol, whole slide above
    the HUD, no label. Press `H` several times: nothing happens.
  - `1` / `2` (after the pickup) / `3` / `Q`: fire, dry-fire, watch the
    pump and the slash; the flash sits on the muzzle; no world pixels
    through the silhouette; the HUD covers the box bottom cleanly.
  - Die, press `H` (nothing), `R`: the compact pistol slides in. `N`,
    level exit, `L`, `T`, `M`: unchanged.
  - DevTools console: no errors or warnings.
- Report completion with `spec report --status ok|…` per the Implement
  Agent Contract in `AGENTS.md`.

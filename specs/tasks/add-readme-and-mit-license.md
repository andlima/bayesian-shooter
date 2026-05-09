---
id: add-readme-and-mit-license
area: docs
priority: 50
depends_on: []
description: Add a top-level README.md (player intro + dev section with architecture and pointers to AGENTS.md / specs) and an MIT LICENSE file.
---

# Add README.md and MIT LICENSE

## Goal

The repo currently has no `README.md` and no `LICENSE` file at the root —
visitors landing on the GitHub page see only `index.html`, `AGENTS.md`,
`CLAUDE.md`, and `specs/` with no entry-point explanation. Add both files so
that a first-time visitor can (a) understand what the project is, (b) play it
in under a minute, and (c) find their way to the architecture and the
spec-driven workflow if they want to contribute.

`AGENTS.md` already documents the spec workflow exhaustively for agents and
contributors; the README must **link** to it rather than duplicate it.

## Acceptance Criteria

1. **`README.md` exists at the repo root**, written in GitHub-Flavored
   Markdown, and renders cleanly on GitHub (no broken links, no malformed
   code fences). No images, no badges, no embedded HTML — markdown only.

2. **README sections, in this order:**

   1. **Title + tagline.** `# Bayesian Shooter` (or whatever the repo's actual
      working name is — see Design Notes for how to confirm) followed by a
      one-line pitch describing it as a single-file, no-build, browser-based
      raycaster FPS.
   2. **Run it.** Two options, both verified to work today:
      - Open `index.html` directly in a modern browser (`file://`).
      - Or serve from the repo root: `python3 -m http.server` then visit
        `http://localhost:8000`.
      Note that pointer lock requires a user click after the page loads.
   3. **Controls.** A compact table or bulleted list covering every key
      handled in `index.html` (see Design Notes for the authoritative list).
      Mouse-look, click/Space to fire, WASD/arrows to move, `N` regenerate
      dungeon, `L` toggle atmosphere lighting, `R` reset after death,
      `M` mute, `Esc` release pointer.
   4. **Architecture / tech notes.** A short section (4–8 bullets or 1–2
      short paragraphs) covering: single `index.html` with no build step
      and no external assets; ~480×270 software-rendered framebuffer drawn
      into a `<canvas>` and CSS-scaled with `image-rendering: pixelated`;
      raycaster wall renderer plus sprite renderer with a per-column
      z-buffer; procedurally-generated dungeon, textures, sprites, and
      gun viewmodel — all deterministic (seeded LCG, no `Math.random()`
      in generators) so the first frame after reload is byte-identical;
      hitscan combat with enemy AI, atmosphere fog/vignette, minimap, HUD.
      Keep this descriptive, not exhaustive — the goal is "you understand
      the shape of the code before opening the file", not a full feature
      inventory.
   5. **Project layout.** A 4–8 line tree showing `index.html`,
      `AGENTS.md`, `CLAUDE.md`, `specs/` (with one-line descriptions of
      the dispatchable specs vs `specs/tasks/`), `LICENSE`, `README.md`.
      Do not enumerate every spec file.
   6. **Contributing / spec workflow.** ~3–5 sentences. Mention that
      features are described as specs under `specs/` and implemented by
      coding agents via the `spec` CLI; link to `AGENTS.md` for the full
      workflow and conventions. Do not duplicate `AGENTS.md`'s command
      table or branch naming rules — link to it.
   7. **License.** One line: "MIT — see [LICENSE](LICENSE)."

3. **`LICENSE` exists at the repo root** containing the standard MIT License
   text (the canonical OSI / SPDX-identifier `MIT` form). Copyright line
   reads exactly:
   ```
   Copyright (c) 2026 Andre Lima
   ```
   Year is `2026` (today's date is 2026-05-09). No additional clauses, no
   modifications to the standard text.

4. **Tone is concise and accurate.** No marketing fluff, no emojis, no
   "🚀 blazing fast", no aspirational features that don't exist yet
   (no "multiplayer coming soon"). Every claim must be true of the code
   as it stands on `main` today.

5. **Controls table is accurate and complete.** Cross-check against the
   `keydown` handler in `index.html` (around lines 258–282). At minimum:
   `WASD` / arrows (move + look), mouse (look, requires pointer lock),
   left-click (fire and lock pointer), `Space` (fire), `N` (regenerate
   dungeon), `L` (toggle atmosphere lighting), `R` (reset after death),
   `M` (mute toggle), `Esc` (release pointer). Don't invent shortcuts that
   don't exist.

6. **No code or behavior changes.** `index.html` is not modified by this
   task. No new dependencies, no `package.json`, no build config, no CI
   files, no `.gitignore` entries, no GitHub templates. Only `README.md`
   and `LICENSE` are created. The single-file game constraint is
   unchanged.

7. **Length cap.** The README should fit comfortably on one screen of
   reasonable width — target **120–200 lines** of markdown. If it grows
   past 220 lines you've probably duplicated `AGENTS.md` content; trim and
   link instead.

8. **Links are valid.** Any in-repo links (`AGENTS.md`, `LICENSE`,
   `specs/`) use repo-relative paths and resolve when viewed on GitHub.
   No external links beyond the OSI / MIT reference if you choose to
   include one (optional).

## Out of Scope

- Editing `index.html`, `AGENTS.md`, `CLAUDE.md`, or any file under
  `specs/`. Read-only references to them only.
- Adding screenshots, animated GIFs, or any binary assets. The single-file
  no-assets philosophy extends to the README — if a future task wants to
  add a screenshot, it can do so deliberately.
- Adding badges (build status, license shield, etc.) — out of scope; no CI
  exists and a license badge without a corresponding CI/release pipeline
  is noise.
- Adding a `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue templates, PR
  templates, or `.github/` directory contents.
- Adding `package.json`, `node_modules`, lint config, formatter config, or
  any tooling that would imply a build step.
- Choosing a different license. MIT was specified; do not relitigate.
- Renaming the project, changing the page title in `index.html`, or
  touching the favicon.
- Documenting the `spec` CLI's full command surface — link to `AGENTS.md`
  instead.
- Listing every shipped spec or feature exhaustively — the architecture
  bullets cover the shape; readers can browse `specs/` themselves.

## Design Notes

- **Project name.** The repo directory is `bayesian-shooter`, so use
  **Bayesian Shooter** as the display title. The page `<title>` in
  `index.html:5` says "Raycaster MVP" — that's the development codename
  and should *not* be promoted to the README title; mention it parenthetically
  if at all (optional, e.g. "(in-source title: Raycaster MVP)").

- **Authoritative controls list.** Read the `keydown` handler in
  `index.html` around lines 252–282 and the movement block around lines
  382–385. Today's set:

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

  A markdown table is recommended; a tight bullet list is also fine. Do
  not cite line numbers in the README — those rot.

- **Architecture bullets — pull from these, don't copy verbatim:**
  - `index.html` is the entire game (~2,500 lines): HTML shell, inline
    CSS, inline JS in a single IIFE.
  - Logical framebuffer is `480 × 270` (`W`, `H` constants at the top of
    the IIFE), drawn pixel-by-pixel into a `Uint32Array`-backed
    `ImageData` and CSS-scaled with `image-rendering: pixelated`.
  - Wall renderer is a textbook DDA raycaster (`castColumn`); sprite
    renderer is a sorted billboard pass with a per-column z-buffer for
    occlusion.
  - All assets are procedurally generated at startup — wall/floor/ceiling
    textures, enemy sprites, the gun viewmodel, the muzzle flash, and the
    dungeon layout itself. Generators use a seeded LCG; `Math.random()`
    is forbidden in the generator paths so the first rendered frame is
    byte-identical across reloads.
  - Atmosphere lighting (fog + sky/ground gradient + vignette) is a
    post-pass over the textured world, toggled with `L`.
  - Combat is hitscan with a small enemy AI (line-of-sight ranged
    attacks, contact damage). HUD is a hand-drawn ammo / kills / HP
    overlay; minimap is top-left.

- **Project layout snippet — recommended shape:**

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

  Do not list every file under `specs/` — naming a couple of recent specs
  in passing is fine but not required.

- **MIT LICENSE — exact form to use.** Standard SPDX `MIT` text. The
  canonical body (after the copyright line) is the one-paragraph
  permission grant + warranty disclaimer in all-caps, ~21 lines total
  including the copyright header. Do not paraphrase. The expected file
  starts:

  ```
  MIT License

  Copyright (c) 2026 Andre Lima

  Permission is hereby granted, free of charge, to any person obtaining a copy
  ...
  ```

  If unsure of the exact wording, copy the form published at
  <https://opensource.org/license/mit/> verbatim, with only the year and
  name substituted.

- **No content beyond the listed sections.** Resist adding a "Roadmap",
  "FAQ", "Changelog", or "Acknowledgements" section unless it carries
  load. Each extra section dilutes the README's job, which is to land a
  visitor on the right next link in under thirty seconds.

## Agent Notes

- **Read first:** `AGENTS.md`, `CLAUDE.md`, this task spec. Then skim
  `index.html` lines 1–80 (page shell + top-of-IIFE constants) and lines
  250–290 (input handlers) to confirm the controls list. You do not need
  to read any other code.

- **Files to create (exactly two, both at repo root):**
  - `README.md`
  - `LICENSE`

  All edits stay inside the assigned worktree only.

- **Order of work:**
  1. Write `LICENSE` first — it's mechanical (copy MIT text, substitute
     year/name). Get it out of the way.
  2. Write `README.md`. Draft each section in the order specified by
     AC #2.
  3. Self-review against AC #4 (no fluff), AC #5 (controls accurate),
     AC #6 (no other files touched), AC #7 (length 120–200 lines).
  4. `git status` should show **only** `README.md` and `LICENSE` as new
     files — nothing modified.

- **Verification before reporting:**
  - Render the README locally if you want (`grip` or just preview on
    GitHub after push); verify links resolve and code fences close
    properly.
  - Re-read the controls table against `index.html`'s `keydown` handler.
  - Confirm the LICENSE file is the standard MIT text and the copyright
    line reads exactly `Copyright (c) 2026 Andre Lima`.
  - Confirm `index.html` is byte-identical to `main` (`git diff main --
    index.html` is empty).

- **Common pitfalls:**
  - **Inventing controls.** Don't list a key that isn't actually handled
    — e.g. there's no jump, no crouch, no reload, no inventory, no
    pause. If a key isn't in the `keydown` handler, it doesn't exist.
  - **Promoting "Raycaster MVP" to the README title.** That's the
    in-source `<title>` — the project name on disk and on GitHub is
    `bayesian-shooter`. Use "Bayesian Shooter" in the README.
  - **Duplicating AGENTS.md.** The Contributing section should be
    ~3–5 sentences plus a link, not a re-paste of the spec workflow
    table. If you find yourself listing `spec implement`, `spec status`,
    etc., stop and link to `AGENTS.md` instead.
  - **Adding a screenshot or GIF.** Out of scope and would break the
    no-assets philosophy. Resist.
  - **Wrong license year.** Today is `2026-05-09`. Year is `2026`, not
    `2024` or `2025`. Don't write a range (`2024-2026`).
  - **Touching `index.html`.** Out of scope; this task is README + LICENSE
    only.

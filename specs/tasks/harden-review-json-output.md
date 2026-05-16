---
id: harden-review-json-output
area: docs
priority: 50
depends_on: []
description: Harden .github/prompts/review.md so the independent reviewer emits exactly one raw JSON object (no code fences, no preamble), eliminating the "Malformed JSON review output (line 1, column 2)" review-gate failure class. Output-delivery discipline only — the injected JSON schema, severity rubric, and decision values are preserved unchanged.
---

# Harden the reviewer JSON-output contract in `.github/prompts/review.md`

## Goal

Make the review prompt force the independent reviewer to return its verdict
as **exactly one raw JSON object and nothing else**, so the review gate can
always parse the result.

The only file changed is `.github/prompts/review.md`. This is a
prompt-wording hardening, not a schema or policy change: the JSON schema,
severity rubric, decision values, and review priorities stay semantically
identical — only the *delivery discipline* (no code fences, no preamble, one
object) is strengthened and made unambiguous and prominent.

## Background

A recent task run (`theme-runtime-selector`) implemented, verified, and
published cleanly (PR #38), then **failed at the review gate** — not on the
code, but on the reviewer's output:

```
[spec] theme-runtime-selector: phase review failed (attempt 1/21):
Independent review status 'failed' via review-decision-gate
(conclusion=failure, ..., findings=0):
Malformed JSON review output:
  .spec-state/runs/.../local-review/codex-review.json (line 1, column 2).
Key findings: (none)
```

`findings=0` plus a parse error at **line 1, column 2** is the classic
signature of the reviewer prefixing its JSON with something — a markdown
code fence (```` ```json ````), a one-line preamble ("Here is the
review:"), a stray leading character, or a blank line — so the gate's strict
JSON parser fails on the very first line before any verdict can be read. The
reviewer almost certainly produced a sensible review; the *envelope* was
unparseable.

The review-decision-gate and the code that parses `codex-review.json` live
in the `spec` CLI / `.spec-state/` harness, **outside this repository**, and
cannot be edited from here. The only in-repo lever over reviewer output is
the prompt the reviewer is given: `.github/prompts/review.md`.

The current prompt already gestures at this in its "Output requirements"
block (`.github/prompts/review.md:55-61`):

```
Output requirements:
- Return STRICT JSON only, matching the provided output schema.
- Do not wrap JSON in markdown.
- Keep findings concise and actionable.
- Every finding must include concrete file/line evidence from the PR diff.
- Set reviewed_base_sha exactly to ${BASE_SHA}.
- Set reviewed_head_sha exactly to ${HEAD_SHA}.
```

These two lines ("Return STRICT JSON only", "Do not wrap JSON in markdown")
are buried mid-list, easy to under-weight, and do not state the concrete,
mechanical rules that actually prevent a "line 1, column 2" failure (first
character must be `{`, last must be `}`, no preamble, no fences, valid JSON
even for `blocked`/`failed`/no-findings). This task makes that contract
explicit, mechanical, and prominent.

Important: the JSON **schema itself** (the exact keys and types — the
verdict field, `findings` object shape, etc.) is injected into the prompt
by the harness at runtime as "the provided output schema". The field names
referenced *literally* in `.github/prompts/review.md` today are limited to
`reviewed_base_sha`, `reviewed_head_sha`, and `findings`; the verdict
field's exact key is **not** stated in-repo (the gate log calls it
"status", but that is not authoritative for this file). The hardening must
therefore continue to defer keys/types to the provided schema and must
**not** invent, rename, add, or remove schema fields.

## Acceptance Criteria

1. **Single-file change.** Only `.github/prompts/review.md` is modified. No
   other tracked file changes; no new files are created. `git status` shows
   exactly one modified path.

2. **Placeholders preserved.** Every `${...}` placeholder present today
   (`${REPO}`, `${PR_NUMBER}`, `${BASE_SHA}`, `${HEAD_SHA}`, `${HEAD_REF}`,
   `${SPEC_ID}`) remains present, identically spelled, and used in the same
   role. None is removed, renamed, or added.

3. **Review semantics unchanged.** The meaning of these is preserved (wording
   may be reorganized, but the contract must not be weakened, removed, or
   altered): the "Review only the changes" / run-the-diff instruction; the
   branch-type context rules (implementation vs. spec-authoring vs. other);
   the prioritized issue list (1–4); the "Ignore" list; the P0–P3 severity
   rubric; the four verdict values `approved`, `request_changes`, `blocked`,
   `failed` and their decision policy; and the rule that `blocked`/`failed`
   summaries must name the exact failing command/file.

4. **JSON-only delivery contract is explicit, mechanical, and prominent.**
   The output section is rewritten so it states, unambiguously, at least all
   of the following:
   - The entire response MUST be exactly one JSON object and nothing else.
   - The first character of the response MUST be `{` and the last character
     MUST be `}`. No leading/trailing whitespace, blank lines, byte-order
     mark, label, prose, or commentary before or after the object.
   - No markdown code fences or surrounding backticks anywhere. Explicitly
     forbid ```` ``` ```` and ```` ```json ````. The JSON MUST NOT be
     wrapped.
   - This applies to **every** verdict, including `blocked` and `failed`,
     and to the zero-findings case: the response is still one valid JSON
     object (e.g. `findings` present as an empty array, summary populated).
     No code path may emit prose, an apology, or an explanation instead of
     the JSON object.
   This contract must be visually prominent — not buried mid-list. Placing
   it as the final block the reviewer reads (so it is the last instruction
   before it responds) is the recommended treatment.

5. **Schema still deferred to the harness.** The prompt continues to say the
   keys/types are governed by the provided output schema. The change does
   **not** redefine, rename, add, or remove any schema field. No concrete
   field name appears that is not already literally in the file today
   (`reviewed_base_sha`, `reviewed_head_sha`, `findings`); the verdict field
   is referred to by its policy values, not by an invented key name. The
   existing `reviewed_base_sha = ${BASE_SHA}` / `reviewed_head_sha =
   ${HEAD_SHA}` instructions are retained.

6. **Any added example is valid JSON and framing-only.** If an illustrative
   output example is included (recommended), it MUST itself be literally
   valid JSON (parses with `python3 -m json.tool` or `node`), it MUST be
   captioned as illustrating output *framing only* and explicitly
   subordinate to the provided output schema, and it MUST NOT assert any
   concrete schema field name beyond those already literally in the file —
   use placeholder string values/keys (e.g. `"<per the provided schema>"`)
   for anything schema-defined. Literal `"${BASE_SHA}"` / `"${HEAD_SHA}"`
   as quoted string values is acceptable. The example must not itself be
   wrapped in a way that contradicts criterion 4's "no code fences" rule for
   the live response (a fenced example *inside the prompt instructions* is
   fine and is not the reviewer's response; make this distinction clear so
   the reviewer does not copy a fence into its actual output).

7. **No leftover contradictions.** The old "Return STRICT JSON only" and
   "Do not wrap JSON in markdown" lines are folded into the strengthened
   contract, not left as weaker duplicates that compete with it. The file
   still reads as one coherent, internally consistent set of reviewer
   instructions with no dangling or contradictory statements.

8. **Scope containment / no regressions.** No changes to `index.html`,
   sprites/assets, `specs/**`, `.spec-state/**`, `Makefile`,
   `tools/**`, `AGENTS.md`, `CLAUDE.md`, or any other file. The
   `theme-runtime-selector` work and PR #38 are not touched. The repo
   remains a single-file game with its existing build/serve flow unchanged.

## Out of Scope

- The `spec` CLI, the `review-decision-gate`, anything under `.spec-state/`,
  and any code that *parses* `codex-review.json`. These live outside this
  repository and cannot be edited here. This task changes only the
  *instructions given to the reviewer*, never the parser or harness.
- Changing the review JSON schema, field names/types, the severity rubric
  (P0–P3), the verdict values, the decision policy thresholds, the
  prioritized issue list, or the "Ignore" list. Semantics are preserved;
  only output-delivery discipline is hardened.
- Re-running, re-implementing, or re-scoping `theme-runtime-selector`;
  modifying, re-reviewing, merging, or otherwise touching PR #38 or its
  branch. (Its code already passed implement/verify/publish; the failure
  was the reviewer envelope, addressed generically here for all future
  reviews.)
- Any game/runtime code, enemy/sprite art, audio, README, or other docs.
- Adding CI jobs, scripts, git hooks, or automated validation of live
  reviewer output. The harness already validates the JSON; we cannot and
  should not duplicate that here.
- Switching review agents or editing `.spec.toml` agent settings.

## Design Notes

Recommended approach: leave lines 1–54 of `.github/prompts/review.md`
substantively intact (priorities, branch-type context, severity rubric,
decision policy) and replace the `Output requirements:` block
(`.github/prompts/review.md:55-61`) with a stronger, mechanical, and
prominent contract placed as the **final** thing the reviewer reads.

A sketch (the implementer may refine wording, but it must satisfy criteria
4–7):

```
## Response format — read this last, obey it exactly

Your ENTIRE response is one JSON object matching the provided output
schema. Nothing else.

- The first character you output is `{`. The last character is `}`.
- No text before `{` and none after `}`: no preamble, no
  "Here is the review", no explanation, no apology, no trailing notes.
- No markdown. No code fences. Do NOT begin with ``` or ```json and do
  NOT wrap the object in backticks. (The fenced example below is part of
  these instructions — your real response must NOT be fenced.)
- This holds for every verdict. `blocked` and `failed` are still a single
  valid JSON object with the failure named in the summary and `findings`
  as an empty array. Never replace the JSON with prose.
- Keys and types come from the provided output schema. Set
  reviewed_base_sha to ${BASE_SHA} and reviewed_head_sha to ${HEAD_SHA}
  exactly. Keep findings concise with concrete file/line evidence.

Shape (framing only — the provided schema is authoritative for keys/types):

{"<verdict per the provided schema>": "approved",
 "summary": "<one or two sentences>",
 "findings": [],
 "reviewed_base_sha": "${BASE_SHA}",
 "reviewed_head_sha": "${HEAD_SHA}"}
```

Notes:

- "line 1, column 2" is the signature of a non-`{` first line (a fence,
  a preamble line, or a leading stray character). The explicit
  first-char-`{` / last-char-`}` / no-fence rules are the targeted
  countermeasure; everything else in this section reinforces it.
- Recency matters: putting the contract last (so it is the final
  instruction before the model answers) measurably improves format
  compliance, hence "read this last".
- The example deliberately uses a placeholder key for the verdict field
  rather than guessing `decision` vs. `status`, satisfying criterion 5.
  Verify the example parses: extract it and run
  `python3 -m json.tool` (it is valid JSON as written — `${BASE_SHA}` /
  `${HEAD_SHA}` are quoted string values).
- Line numbers above are anchors as of this writing; if they have
  shifted, locate the `Output requirements:` block by content.

## Agent Notes

- Read `AGENTS.md` first. All edits in the assigned worktree only. This is
  a single-file prompt edit: `.github/prompts/review.md`. No new files, no
  game code, no build step, no dependencies.
- Verification is by inspection, not a game build/serve:
  - `git status --porcelain` shows only `.github/prompts/review.md`.
  - Re-read the full file end to end and check criteria 2–7 hold (no lost
    placeholder, no weakened/duplicated/contradictory semantics, the
    JSON-only contract is explicit, mechanical, and prominent).
  - If an example block was added, extract just that block and confirm it
    parses: `python3 -m json.tool` (or `node -e 'JSON.parse(require("fs")
    .readFileSync(0,"utf8"))'`). It must be valid JSON.
- Do not edit `.spec-state/**`, the `spec` CLI, or PR #38. Do not re-run
  or re-scope `theme-runtime-selector`.
- Report completion with `spec report --status ok|...` per the Implement
  Agent Contract in `AGENTS.md`.

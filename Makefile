.PHONY: bake check preview screenshot serve

# Decode every assets/sprites/*.png listed in the bake MANIFEST and rewrite
# the baked sprite region of index.html (see AGENTS.md → Asset Baking).
bake:
	node tools/bake-sprites.mjs

# Exit non-zero if index.html's baked region is stale relative to the PNGs.
check:
	node tools/bake-sprites.mjs --check

# Render a contact sheet of every manifest sprite for offline review.
preview:
	node tools/bake-sprites.mjs --preview "$${TMPDIR:-/tmp}/sprites-preview.png"
	@echo "$${TMPDIR:-/tmp}/sprites-preview.png"

# Best-effort headless screenshot of the first frame. Allowed to fail where
# Chromium cannot run (e.g. a sandbox that denies its Unix socket); it is
# deliberately NOT part of `check`.
screenshot:
	chromium --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
	  --user-data-dir="$${TMPDIR:-/tmp}/bs-chrome-profile" \
	  --window-size=960,540 --virtual-time-budget=2000 \
	  --screenshot="$${TMPDIR:-/tmp}/bs-screenshot.png" \
	  "file://$(CURDIR)/index.html?seed=1234"

# Serve the repo root over HTTP so index.html can be opened in a browser.
serve:
	python3 -m http.server

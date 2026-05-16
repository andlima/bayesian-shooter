.PHONY: bake serve

# Decode assets/sprites/*.png and rewrite the baked sprite region of
# index.html (see the sentinel contract in AGENTS.md → Asset Baking).
bake:
	node tools/bake-sprites.mjs

# Serve the repo root over HTTP so index.html can be opened in a browser.
serve:
	python3 -m http.server

# Agent notes — antora-supplemental docs hub

Project facts for agents. Workstation/env facts live only in `$CODE_ROOT/MEMORIES.md`.

- Antora playbooks do **not** support YAML `extends`. Local playbooks must be full copies (duplicate site/ui/asciidoc; only content sources differ).
- Valentus 2.x brand overlays: override `--adt-*` tokens after `site-visual.css` / `site-read-width.css`; element scrapes lose to `!important` in site-visual.
- Valentus pin: rolling major `v2` (`…/releases/download/v2/ui-bundle.zip` + `snapshot: true`). Dual-axis public label is `VALENTUS_SEMVER+antora.N`; git/download tags stay pure semver.
- Org private GitHub config: `antora-supplemental/.github-private` (public counterpart: `.github`).
- Domain map: apex `antora-supplemental.org` (welcome Astro), `docs.antora-supplemental.org` (this hub), `registry.antora-supplemental.org` (SolidStart catalog). DNS notes live in welcome-site `DOMAIN.adoc`.
- Former `antora-dark-theme` → `valentus-theme` (full) + `antora-dark-mode` (overlay).
- Math: `stem: latexmath` + KaTeX `site-math.js` (even when unused).

# Agent notes

## Editorial titles

When writing or editing **news** or **blog** titles, follow **STYLE.adoc**.

Short form:

- **News:** subject + present-tense verb (headline present).
- **Essay with an action:** implied **[On]** test (gerund / parallel), not bare imperatives.
- **Essay claim without a verb:** OK for theses.
- **Antora topic titles:** concept names; no forced verb.
- Sentence case; accurate; not a whitepaper section label dressed as news.

Project facts live in this file; machine-wide notes in `$CODE_ROOT/MEMORIES.md`.

## Antora playbooks

- Playbooks do **not** support YAML `extends`. `local-antora-playbook.yml` must be a full playbook (duplicate site/ui/asciidoc; only content sources differ).

## Valentus

- Brand overlays should override `--adt-*` tokens after `site-visual.css` / `site-read-width.css`; element scrapes lose to `!important` in site-visual.
- Pin rolling major `v2` (`…/releases/download/v2/ui-bundle.zip` + `snapshot: true`). Public label `VALENTUS_SEMVER+antora.N` (e.g. `2.0.2+antora.3`); git/download tags stay pure semver.

## Org config & domains

- Private GitHub config: `antora-supplemental/.github-private` (not personal `antora-supplemental-private`). Public: `.github`.
- Domain map: apex `antora-supplemental.org` (welcome Astro), `docs.antora-supplemental.org` (this hub), `registry.antora-supplemental.org` (SolidStart catalog). DNS notes: welcome-site `DOMAIN.adoc`.
- Former `antora-dark-theme` → `valentus-theme` (full) + `antora-dark-mode` (overlay). Personal forks of the old name are obsolete.

## Math

- Enable on every docs site: `stem: latexmath` + KaTeX `site-math.js` (even when unused).

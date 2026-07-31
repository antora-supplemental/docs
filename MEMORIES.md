# Agent memories (local / durable)

Facts worth keeping across sessions. Usage count starts at 1; increment when reused.

| Fact | Uses |
|------|------|
| Antora playbooks do **not** support YAML `extends`. `local-antora-playbook.yml` must be a full playbook (duplicate site/ui/asciidoc; only content sources differ). | 1 |
| Docs hub CI last failed on `main` (2026-06-10) with duplicated `branches`/`start_path` under `antora-extensions-registry` in `antora-playbook.yml` — not a theme download issue. | 1 |
| Valentus 2.x brand overlays should override `--adt-*` tokens after `site-visual.css` / `site-read-width.css`; element scrapes lose to `!important` in site-visual. | 1 |
| Valentus pin: rolling major `v2` (`…/releases/download/v2/ui-bundle.zip` + `snapshot: true`). Dual-axis public label is `VALENTUS_SEMVER+antora.N` (e.g. `2.0.2+antora.3`); git/download tags stay pure semver. | 2 |
| Org private GitHub config is `antora-supplemental/.github-private` (not a personal `antora-supplemental-private`). Public counterpart: `.github`. | 1 |
| Domain map: apex `antora-supplemental.org` (welcome Astro), `docs.antora-supplemental.org` (this hub), `registry.antora-supplemental.org` (SolidStart catalog). DNS: welcome-site `DOMAIN.adoc`. | 1 |
| Former `antora-dark-theme` → `valentus-theme` (full) + `antora-dark-mode` (overlay). Personal forks of the old name are obsolete. | 1 |
| GitLab Default UI fork (contributions): `Z:\code\gitlab.com\AMDphreak\.forks\antora-ui-default`; upstream clone: `Z:\code\gitlab.com\.clones\antora\antora-ui-default`. Do not host Antora GitLab forks on GitHub. | 1 |

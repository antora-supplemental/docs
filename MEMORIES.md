# Agent memories (local / durable)

Facts worth keeping across sessions. Usage count starts at 1; increment when reused.

| Fact | Uses |
|------|------|
| Antora playbooks do **not** support YAML `extends`. `local-antora-playbook.yml` must be a full playbook (duplicate site/ui/asciidoc; only content sources differ). | 1 |
| Docs hub CI last failed on `main` (2026-06-10) with duplicated `branches`/`start_path` under `antora-extensions-registry` in `antora-playbook.yml` — not a theme download issue. | 1 |
| Valentus 2.x brand overlays should override `--adt-*` tokens after `site-visual.css` / `site-read-width.css`; element scrapes lose to `!important` in site-visual. | 1 |
| Valentus pin: exact `v2.0.0` or rolling `v2` — see valentus-theme version-pinning docs. Dual-axis label is `2.0.0+antora.3`. | 1 |

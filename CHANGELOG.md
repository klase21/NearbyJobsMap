# Changelog

All notable changes are documented here. Version 0.1.1 remains unreleased.

## 0.1.1 — Unreleased hardening

- Updated official GitHub Actions to Node 24-based action runtimes while preserving offline validation.
- Added bounded Chromium installation, a repair command, richer doctor checks, and sanitized support bundles.
- Added in-app help, installation readiness, first-user troubleshooting, and issue intake guidance.
- Restored the bounded Albamon public-listing URL contract (`excludeBar=true`), sanitized transport classification, canonical HTTPS redirect checks, bounded rendering stabilization, and active-result empty-page semantics.
- Prevented title/company text from being used as an Albamon location fallback. The bounded validation reached HTTP 200 and isolated 100 cards, but its one write was rolled back after detecting a title-derived location; live Albamon inventory remains zero pending a separately approved confirmation run.

## Unreleased

- Sanitized documentation screenshots and a local v0.1.0 release candidate package.
- Owner review checklist and release notes for manual GitHub publication.

## 0.1.0 — Local MVP

- Unified job list and supplementary map with local filters.
- Bounded manual JobKorea collection and listing fallback.
- Albamon listing adapter with conservative live-transport limitations.
- Local collection dashboard, presets, saved profiles, profile comparison, and import/export.
- Personal workflow, notes, dates, saved views, observations, and change history.
- SQLite backup and guarded restore tooling.

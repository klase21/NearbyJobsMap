# Changelog

All notable public changes are documented here.

## 0.2.0 - 2026-08-11

- Added scalable server-side filtering, deterministic sorting, 25/50/100 pagination, and bounded page hydration.
- Added conservative same-source semantic duplicate grouping without merging source identities or personal state.
- Added richer listing-only JobKorea and Albamon metadata, including registration evidence, salary/pay type, workplace, safe coordinates, schedules, and deadlines where available.
- Added structured monthly salary and distance filtering plus the transparent 70% salary / 30% distance `monthly_distance` ranking.
- Added server-readable local personal Albamon profiles, safe URL import, and source-neutral exclusion filtering before grouping, ranking, and pagination.
- Added manually triggered JobKorea date backfill and Albamon personal-profile backfill with bounded pagination, run locking, cancellation, dry-run/write separation, backup protection, and compact run history.
- Added 30-minute, single-use preview authorization so an interactive write reuses the completed preview decision while still performing a fresh source traversal.
- Fixed personal workspace feature boundaries, bounded persistence errors, collapsed support panels, and paginated state updates.
- Added deterministic cleanup for legacy Albamon payment badges incorrectly stored as salary.

## 0.1.1

- Hardened Windows installation, browser readiness, diagnostics, support bundles, backup/restore, and public packaging.
- Added bounded local collection controls, saved collection profiles, profile comparison, and configuration-only import/export.
- Added personal workflow state, observations, change history, saved job views, and first-run guidance.

## 0.1.0

- Initial local-first unified job list and supplementary map MVP.
- Added isolated JobKorea and Albamon source adapters, SQLite persistence, conservative normalization, and offline fixture tests.

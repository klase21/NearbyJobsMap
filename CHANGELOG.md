# Changelog

All notable changes are documented here. Version 0.1.1 remains unreleased.

## 0.1.1 — Unreleased hardening

- Updated official GitHub Actions to Node 24-based action runtimes while preserving offline validation.
- Added bounded Chromium installation, a repair command, richer doctor checks, and sanitized support bundles.
- Added in-app help, installation readiness, first-user troubleshooting, and issue intake guidance.
- Restored the bounded Albamon public-listing URL contract (`excludeBar=true`), sanitized transport classification, canonical HTTPS redirect checks, bounded rendering stabilization, and active-result empty-page semantics.
- Verified the recorded Albamon area mapping (`I000` Seoul, `B000` Gyeonggi), made displayed location optional, and persisted source-filter evidence separately from original location.
- Rejected title/company/card-wide location contamination and explicit region conflicts before the candidate cap. A bounded two-page Seoul dry-run selected 20 of 100 valid cards and the matching write inserted 20 listing-only records, 20 observations, and no failures or duplicates; no BFF or detail request was made.
- Added a separate, manually confirmed JobKorea listing-only backfill boundary with an explicit 1–10 page range, 200-candidate maximum, zero retries, zero detail requests, deterministic region filtering, and transactional post-write integrity gates without weakening ordinary collection limits.
- Completed the approved capital-region backfill: 10 pages yielded 206 unique valid cards, 196 selected records, 177 inserts, 5 updates, 14 unchanged records, 196 observations, 5 bounded change events, and no failed item or duplicate identity.
- Added deterministic address and salary quality classifications plus conservative coordinate/full-address commute-readiness counts. No geocoding, unit conversion, commute calculation, or tax calculation is performed.
- Created and verified the post-backfill schema-0012 SQLite backup with 243 jobs, 12 ingestion runs, 330 items, 282 provenance rows, 262 observations, and 5 change events.

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

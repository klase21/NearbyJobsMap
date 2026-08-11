# NearbyJobsMap

[![CI](https://github.com/klase21/NearbyJobsMap/actions/workflows/ci.yml/badge.svg)](https://github.com/klase21/NearbyJobsMap/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

NearbyJobsMap is a local-first workspace for discovering and reviewing Korean job listings. Source records live in local SQLite, the job list is the primary interface, and the map is a secondary way to explore the current bounded result page.

## Live Demo

https://nearby-jobs-map.vercel.app

The hosted version is a read-only public demo using synthetic job data. Filters, pagination, the map, and salary/distance ranking are available; collection, backfill, and persistent personal workspace state are disabled.

The local version is SQLite-backed and supports the personal workspace, a local personal search profile, and explicitly enabled manual collection/backfill. Real JobKorea/Albamon collection, historical backfill, and personal workspace persistence remain local-only.

> NearbyJobsMap is not an official source API client or hosted service. Source permission is `unverified`; this project does not grant permission to collect data. Source terms, robots policies, and applicable rules remain the user's responsibility.

## Highlights

- Server-side SQLite filtering, deterministic sorting, and pagination; page sizes are 25, 50, or 100 with 50 as the default.
- Same-source semantic duplicate grouping using conservative normalized company and title equality. Source identities and per-job personal state remain independent.
- URL-backed filters, saved job views, favorites, workflow status, notes, application dates, follow-up dates, personal deadlines, hidden state, and archives.
- Source-neutral literal exclusion filtering. A local personal exclusion profile can be imported from a normal Albamon search URL and is applied before grouping, ranking, and pagination.
- Current-page map markers only. Missing, estimated, conflicting, and source-observed locations remain distinct; no geocoding is performed.

## Supported sources

### JobKorea

The current safe listing path reads public Seoul/Gyeonggi recruitment-list responses without login, cookies, browser profiles, private credentials, or detail-page crawling. It extracts numeric listing identity, company, title, structured listing metadata, registration evidence, deadline, location, employment information when present, and source-visible salary text.

The observed listing transport is a public-page contract rather than an official API. If it begins requiring authentication, signed values, or access-control workarounds, collection must stop.

### Albamon

The Albamon listing adapter uses normal public `/jobs/total` listing pages for Seoul and Gyeonggi. The listing-only parser preserves identity, company, title, workplace area and address, conflict-safe region evidence, safe source coordinates, salary and pay type, working schedule, posting evidence, deadline, categories, and payment-condition badges.

It does not call private BFF endpoints or crawl detail pages. A payment-condition badge such as `당일지급` is never treated as salary.

## Salary and distance

Filters support original structured salary periods and straight-line Haversine distance from a locally configured origin. Available sorts include newest, salary-highest, nearest, and `monthly_distance`.

`monthly_distance` ranks eligible jobs with a transparent combined score:

- 70% normalized structured monthly salary
- 30% normalized distance

Only structured monthly salary participates in monthly comparison. Hourly, daily, and annual pay are not converted to monthly values, and no working-hour assumptions are invented.

## Manual collection and backfill

Collection and backfill are manual only.

Collection controls are local-only and disabled unless explicitly enabled. There is no scheduler, recurring worker, remote queue, automatic startup collection, or retry loop.

Manual backfill supports:

- JobKorea registration-ordered Seoul/Gyeonggi listing traversal to an explicit date cutoff.
- A personal Albamon profile using ALL period, Seoul/Gyeonggi, and user-configured exclusions.
- A full read-only preview before write.
- A server-issued, single-use preview authorization valid for 30 minutes.
- Configuration and profile-hash binding; relevant changes require a new preview.
- One verified SQLite backup immediately before write.
- A fresh source traversal during write, allowing bounded live-source changes since preview.
- One active collection run, concurrency 1 for backfill, zero retries, cancellation between pages, and explicit page ceilings.

The personal profile is stored only in ignored local data. A fresh clone treats a missing profile as a normal unconfigured state.

## Safety boundaries

- Collection is manually initiated and bounded.
- No login automation, cookie/session reuse, CAPTCHA solving, stealth, proxy rotation, or access-control bypass.
- No undocumented private endpoints.
- Dry-runs do not write jobs, provenance, ingestion history, or observations.
- Source salary, address, schedule, and posting evidence are preserved; missing data is not fabricated.
- Exact source identity is `(source, sourcePostingId)`. Probable duplicates are presentation groups, never destructive merges.
- Runtime databases, backups, personal profiles, environment files, browser state, and support artifacts are ignored and excluded from public packaging.

## Screenshots

The committed screenshots use deterministic synthetic data (정제된 데모 데이터) and block external browser requests.

![Job list and secondary map](docs/images/jobs-list-map-desktop.png)

![Collection dashboard](docs/images/collection-dashboard-desktop.png)

![Collection execution](docs/images/collection-execution-desktop.png)

![Saved profile comparison](docs/images/profile-comparison-desktop.png)

![Personal job workspace](docs/images/job-workspace-mobile.png)

![First-run onboarding](docs/images/onboarding-mobile.png)

See [docs/SCREENSHOTS.md](docs/SCREENSHOTS.md) for the synthetic capture process.

## Architecture

- Next.js 16 App Router and React 19
- Strict TypeScript
- Local SQLite with append-only migrations and server-only repositories
- Isolated JobKorea and Albamon adapters
- Server-side job query, grouping, ranking, and bounded hydration
- Versioned browser preferences plus server-readable ignored personal profile storage
- No cloud database, account system, telemetry, or required hosted service

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full boundaries and data flow.

## Requirements

- Windows 10 or Windows 11
- Windows PowerShell 5.1 or PowerShell 7
- Node.js 20.9 or newer
- npm 10 or newer
- Playwright Chromium only for explicitly enabled browser-backed collection

## Quick start

```powershell
git clone https://github.com/klase21/NearbyJobsMap.git
Set-Location NearbyJobsMap
.\scripts\install.ps1
.\scripts\start.ps1
```

Open <http://127.0.0.1:3000>. Collection remains disabled unless the application is started with the explicit local collection option.

Manual npm setup:

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run setup:local
npm.cmd run typecheck
npm.cmd run dev -- --hostname 127.0.0.1 --port 3000
```

The default database is `data/nearby-jobs.sqlite`; it is ignored by Git. Fresh setup applies migrations and can load only sanitized fixture-derived and explicitly fictional demo records.

## Validation

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run db:status
```

Automated tests use temporary SQLite databases and must not contact JobKorea or Albamon.

## License and contributing

Licensed under the [MIT License](LICENSE). See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

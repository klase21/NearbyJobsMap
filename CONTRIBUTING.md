# Contributing to NearbyJobsMap

## Development setup

Use Node.js 20.9 or newer and npm 10 or newer.

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run setup:local
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

Create a focused branch from the current default branch. Keep changes small enough to review and preserve unrelated local data.

## Source-adapter safety

- Automated tests must use synthetic or sanitized fixtures and must not make live JobKorea or Albamon requests.
- Never add login automation, CAPTCHA handling, cookie/session reuse, stealth, proxy rotation, or access-control bypasses.
- Do not commit raw source HTML, full descriptions, personal contact data, tokens, credentials, browser profiles, or runtime databases.
- Source parsers remain network-free; transports and adapters remain isolated.
- Do not increase collection limits, concurrency, or retries without explicit product review.

## Database changes

- Committed migrations are append-only. Never rewrite an applied migration.
- Database tests use a unique temporary SQLite file and clean it afterward.
- Personal workflow state, source lifecycle, provenance, and observations remain separate.

## Code expectations

- Keep strict TypeScript; do not hide failures with broad type or lint suppression.
- Reuse shared domain, validation, repository, and UI contracts.
- Preserve list-first and map-secondary behavior.
- Add focused tests for behavior changes and use parameterized SQL.

## Pull-request checklist

- [ ] Typecheck, lint, tests, and production build pass.
- [ ] Migrations and public behavior are documented.
- [ ] No secrets, runtime DB, backups, exports, raw HTML, screenshots, or personal data are included.
- [ ] Automated tests make no live source request.
- [ ] Responsive and keyboard behavior was checked when UI changed.
- [ ] README or other public documentation was updated when necessary.

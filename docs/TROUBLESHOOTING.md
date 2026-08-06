# Troubleshooting

## Node or npm is not found

Install a supported Node.js release from the official Node.js distribution, reopen PowerShell, and run `node --version` and `npm.cmd --version`. The minimum Node version is 20.9.

## Unsupported Node version

Upgrade Node before installing dependencies. The scripts never download or replace Node automatically.

## `npm ci` fails

Confirm network access to the npm registry, available disk space, and that `package-lock.json` is unchanged. Do not delete the lockfile to work around a dependency issue.

## Playwright Chromium is missing

Run:

```powershell
npx.cmd playwright install chromium
```

This is needed only for explicitly initiated public-page rendering. Tests and normal list/map use do not contact sources.

## Port already in use

Choose another local port:

```powershell
.\scripts\start.ps1 -Port 3100
```

The launcher does not terminate unrelated processes.

## Database is locked

Stop NearbyJobsMap and any SQLite inspection tool, then retry. Do not delete WAL/SHM files while a process is using the database.

## Migrations are pending

Run `npm.cmd run db:migrate`, then `npm.cmd run db:status`. Applied migration files are append-only and must not be edited.

## Collection UI is disabled

This is the default. Restart with `.\scripts\start.ps1 -EnableCollectionUI`. The server must also be accessed through a loopback address.

## Nonlocal collection rejection

Collection execution is intentionally rejected on non-loopback hosts. Do not add authentication or a bypass; run it locally.

## JobKorea unexpected page or detail login response

The public page may have changed or anonymous detail access may require login/verification. Do not export cookies, automate login, bypass CAPTCHA, rotate proxies, or use stealth tooling. Listing-only fallback may remain available where validated.

The one-time maintenance backfill uses `backfill:jobkorea:once` only when separately authorized. It renders explicit public search pages, accepts numeric posting IDs with isolated title/company evidence inside the known result root, and does not visit detail pages. Legacy ordinary-selector classification remains diagnostic metadata: a page with valid bounded listing cards is not discarded solely because that older classifier reports `malformed_results`. A page with no valid card evidence remains unresolved and blocks the write transaction.

Backfill location and salary fields are conservative. Title/company/card-wide text cannot become location, unknown addresses and salaries remain unknown, no coordinates are fabricated, and salary units are not converted. Run `npm.cmd run audit:jobkorea-quality` for a read-only aggregate integrity and quality report. The command prints no job title, company, posting ID, or personal workflow data.

## Albamon transport failure

The adapter uses only explicit browser-rendered public `/jobs/total` pages with `size=50`, `sortType=POSTED_DATE`, `searchPeriodType=TODAY`, and `excludeBar=true`. It waits for `DOMContentLoaded`, performs bounded rendering stabilization, and never treats duplicate-only or zero-new-ID pages as empty. A valid empty page requires visible no-result evidence in the active result region.

The August 2026 bounded probe returned HTTP 200 with no DNS, TLS, timeout, redirect, crash, or cleanup error. A later approved Seoul run used the historically recorded public area mapping `I000 → Seoul` (`B000 → Gyeonggi`), isolated 100 numeric posting-ID cards across two pages, and wrote 20 listing-only records. None exposed a trustworthy displayed location, so their original location remains `null` and their Seoul classification is explicitly attributed to the single-region source filter. Title/company/card-wide text is prohibited as a location fallback, and a displayed region that contradicts the source filter is excluded before the candidate cap.

Use `--diagnostic` only for a specifically authorized bounded run when transport classification is needed. It reports sanitized URL/status/redirect, elapsed time, failure category, lifecycle state, and cleanup—never HTML, response bodies, cookies, headers, or page text. Area codes are an observed public-page contract, not an official API or permission grant. Do not call undocumented BFF endpoints, automate authentication, or add detail crawling.

## Map tiles are unavailable

The job list remains usable. Check ordinary internet access to the configured tile provider; do not invent coordinates or geocode missing locations.

## Backup verification fails

Do not restore the file. Keep the current database, compare its manifest and checksum, and create a new backup if possible.

## Restore confirmation fails

Use the exact phrase `RESTORE DATABASE`. Restore also refuses unsafe paths and a running app.

## Stale PID file

Run `.\scripts\status.ps1` or `.\scripts\stop.ps1`. They remove stale runtime metadata without killing unrelated Node processes.

## PowerShell execution policy

Use `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\doctor.ps1` for one process. Do not permanently weaken system policy.

## Chromium installation appears stuck

The installer reports progress and stops only its own Playwright installation process tree after the configured timeout. A proxy, firewall, or slow network may prevent the official download; do not bypass organizational controls. Retry `.\scripts\install-browser.ps1`, or use `-SkipBrowserInstall` for non-collection usage. Use `-RequireBrowserInstall` only when collection readiness is mandatory.

## Collection features unavailable

Run `.\scripts\doctor.ps1`, confirm Chromium can launch, explicitly enable the collection UI, and use a loopback host. No login, cookie, CAPTCHA, or access-control bypass is provided. Non-collection features remain usable without Chromium.

## Creating a support bundle

Run `.\scripts\support-bundle.ps1`, audit the ZIP, and inspect every file. Attach it only when comfortable. Never attach the runtime DB, `.env`, cookies, credentials, raw source HTML, personal notes, or unsanitized screenshots. Nothing is uploaded automatically.

## Build or test failure

Run commands individually and review the first error:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

Never “fix” failures by enabling live source access or disabling broad safety/type rules.

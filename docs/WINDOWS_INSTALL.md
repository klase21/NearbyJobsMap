# Windows Installation

## Prerequisites

- Windows 10 or Windows 11
- Windows PowerShell 5.1 or PowerShell 7
- Node.js 20.9 or newer
- npm 10 or newer
- About 2 GB free disk space for dependencies, build output, Chromium, data, and backups

The launcher does not require administrator rights and never changes the global PowerShell execution policy.

## Download and install

Clone the repository after the owner publishes it, or download and extract the source archive. Open PowerShell in the project folder.

If local policy blocks scripts, use a process-scoped command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

This bypass applies only to that PowerShell process; it does not weaken the machine-wide policy.

Normal installation:

```powershell
.\scripts\install.ps1
```

Useful options:

```powershell
.\scripts\install.ps1 -SkipBrowserInstall
.\scripts\install.ps1 -SkipValidation
.\scripts\install.ps1 -SeedDemoData
```

`-FreshDatabase` refuses to replace an existing database unless paired with `-ResetConfirmation "RESET LOCAL DATABASE"`. Back up valuable data first.

## Start and stop

```powershell
.\scripts\start.ps1
.\scripts\status.ps1
.\scripts\stop.ps1
```

The default URL is <http://127.0.0.1:3000>. Collection execution is disabled. To enable the local collection controls explicitly:

```powershell
.\scripts\start.ps1 -EnableCollectionUI
```

The launcher rejects collection enablement with a non-loopback host. It never binds to `0.0.0.0` by default.

Production mode requires a build:

```powershell
npm.cmd run build
.\scripts\start.ps1 -Production
```

## Database and demo data

The default runtime database is `data/nearby-jobs.sqlite`. It is never committed.

```powershell
npm.cmd run db:init
npm.cmd run setup:local
npm.cmd run db:status
```

`setup:local` idempotently adds sanitized fixture records and fictional demo records. It performs no JobKorea or Albamon request.

To use another project-local path, edit `.env.local`:

```dotenv
NEARBY_JOBS_DB_PATH=./data/my-nearby-jobs.sqlite
```

## Backup, update, and restore

```powershell
.\scripts\backup.ps1
.\scripts\backup.ps1 -List
.\scripts\update.ps1
.\scripts\restore.ps1 -File "nearby-jobs-<timestamp>.sqlite" -Confirm "RESTORE DATABASE"
```

`update.ps1` does not pull or download code. Replace or pull files yourself, stop the app, and then run it. It creates a pre-update backup unless `-SkipBackup` is explicitly supplied.

Restore checks the backup path, manifest, SHA-256 hash, SQLite integrity, running-app state, and exact phrase. It creates another pre-restore backup.

## Diagnostics

```powershell
.\scripts\doctor.ps1
npm.cmd run release:audit
```

See [Troubleshooting](TROUBLESHOOTING.md) for common failures.

## Uninstall

1. Run `.\scripts\stop.ps1`.
2. Back up `data/nearby-jobs.sqlite` if it matters.
3. Remove the project directory manually.

By default the database and backups live inside the project under `data/`. If `.env.local` points elsewhere, remove or preserve that location separately. No destructive uninstall script is provided.

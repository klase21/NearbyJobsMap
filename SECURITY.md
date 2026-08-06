# Security Policy

## Supported versions

For the local MVP, only the latest release and the latest commit on the default branch are supported. No formal long-term support or response-time SLA is promised.

## Reporting a vulnerability

Open a **private GitHub security advisory** for this repository. Do not open a public issue containing credentials, cookies, personal notes, private job-application data, database files, or exploitable details.

If private advisories are not yet available, wait for the repository owner to publish a private reporting channel rather than posting sensitive material publicly. This document intentionally does not invent an email address.

## Local-first threat model

- Jobs, profiles, workflow state, observations, and backups are local SQLite data.
- Collection execution is disabled by default, restricted to localhost, and additionally requires `NEARBY_JOBS_ENABLE_COLLECTION_UI=1`.
- The application has no account or authorization system and must not be exposed as a public collection service.
- Import, restore, and local write endpoints strictly validate input but local machine and filesystem access remain trusted boundaries.
- No telemetry or automatic source access is included.

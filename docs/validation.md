# Validation and rollout

## Local evidence

- Dirty/untracked source snapshot created before replacement; original secrets remain excluded and untouched.
- Turso migration validation: production Next.js build, strict TypeScript checks, ESLint, and Git whitespace validation passed. All 34 unit/database tests and 27 browser tests passed. A local file database migration also passed. Hosted Turso schema migration and authenticated Spotify connection also passed; see live evidence below. The earlier provider contract probe passed in both request orders.
- Provider probe on 2026-09-18: two requested Spotify IDs produced one valid feature record carrying its explicit Spotify URL. Reversing request order preserved the mapping. Unknown IDs were omitted. Two-ID batches are the verified size used by the adapter; no larger limit or fixed public quota is assumed.
- Unit checks cover authenticated token encryption, constant-time state comparison, token reuse/rotation, reordered provider records, invalid/missing features, pagination and hostile next links, deduplication and source membership, unsupported items, deterministic grouping, small/constant libraries, overlap/caps, metadata-only libraries, exact revision approval invalidation, and uncertain append reconciliation.
- The generated migration is exercised in libSQL (SQLite) for active-run uniqueness, user ownership queries, publication idempotency, and cascading session/data removal. This does not prove hosted Turso connectivity.
- Browser fixtures cover source selection, progress, editable names, moving/removing tracks, playlist selection, reapproval after edits, explicit publishing, and Spotify result links at 375/768/1024/1440. A separate landing check verifies mobile overflow. Real unauthenticated route tests check OAuth state cookie properties, forged/replayed callback rejection, login requirements, and same-origin write rejection. Fixture screenshots live in ignored `outputs/`.

## Remaining live acceptance checks

The Turso production deployment, schema migration, Spotify authorization, session persistence, and source-list reads are verified below. Authenticated track import/organization, hosted Inngest execution with Turso, and Spotify playlist writes have not been tested after this cutover. App access/quota mode and owner Premium status cannot be inferred from credentials or `/me` (Development Mode no longer exposes `product`).

1. Turso schema and Vercel Production configuration are complete. Confirm hosted Inngest execution against the migrated app.
2. Confirm the existing Spotify app's developer access, owner Premium, exact callback, and allowlisted account in its dashboard.
3. Connect that account and import a small Liked Songs or owned/collaborative playlist selection. Compare the imported counts, skipped items, memberships, progress, and internal matching evidence.
4. Review and edit a suggestion. Approve the exact revision and explicitly select one small playlist for creation.
5. Create it, verify ownership and `public: false`, compare exact track order/count, and record the Spotify URL. Existing playlists must remain unchanged.
6. Exercise a controlled interrupted publish. Confirm completed operations/batches resume without duplicate playlists/items. Unknown creation or append outcomes must pause rather than blindly repeat.
7. Record hosted results, account prerequisites, and any remaining exceptions separately from local fixtures.

## Neon quota diagnosis (2026-09-18)

The signed-in Sortify project dashboard explicitly reports exhaustion of the monthly network transfer allowance. Usage was 5.8 GB transfer, 35.45 MB storage, and 1.12 CU-hours compute. Production OAuth completed token/profile stages and failed at session persistence. The old database rejected direct connections with Postgres code 53000. The unconditional three-second full-state poll was a likely contributor, but its exact share of transfer was not measured.

## Turso live evidence (2026-09-18)

- Free hosted libSQL database `sortify` was provisioned in AWS US East (Virginia). Its token is a Vercel Production Secret and is stored in the ignored local environment; no token values are recorded here.
- SQLite migration applied successfully. Hosted account/session/run inserts, JSON/date/boolean storage and transaction rollback passed without retaining test records.
- Final deployment `dpl_J4nHUFnWAwpWH9MF6GfMquKRbsLV` returned `READY`, `target=production`, and was aliased to `https://sortifi.vercel.app`.
- The existing account successfully reconnected through the unchanged Spotify callback. UI displayed the authenticated account, 704 Liked Songs and eight accessible playlist sources. Reloading the final deployment retained the login and loaded sources again.
- Hosted database counts after login: one account, one session, zero runs. No organization or Spotify playlist write was started during this check.
- Original Neon data remains untouched and was not transferred because the exhausted network quota prevents source reads. `db:import-neon` requires an empty destination and is a recovery tool for a separate empty database, not a merge into the now-populated production database.
- `.vercelignore` explicitly excludes local secrets, legacy runtime state, backups and QA artifacts from CLI deployments.

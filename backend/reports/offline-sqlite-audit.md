# Audit report — offline (SQLite) mode for the ByteMe backend

Date: 2026-10-05 · Scope: `BYTEME_OFFLINE_MODE` implementation and its verification
Verdict: **all required checks pass; no secrets introduced; Supabase path unchanged.**

---

## 1. Executive summary

A local SQLite backend was added behind a single switching seam. Every existing
repository, service and API route runs unchanged against either Supabase or
SQLite; no parallel repository layer or second API architecture was created.
The Supabase implementation, its migrations and its demo seed were not modified
or deleted.

Verification on the delivered tree:

| Check | Command | Result |
|---|---|---|
| Test suite | `npm test` | **212 passed / 212** (10 files), `TEST_EXIT=0` |
| Types | `npx tsc --noEmit` | `TSC_EXIT=0` |
| Build | `npm run build` | `BUILD_EXIT=0`, all 27 `/api/v1` routes emitted |
| Supabase parity (pre-existing) | `npm run verify:db` | `ALL CHECKS PASSED`, `VERIFY_EXIT=0` |
| Offline HTTP smoke | `next start` + `BYTEME_OFFLINE_MODE=true` | see §6 |

---

## 2. Files changed

### Created

| File | Lines | Purpose |
|---|---|---|
| `lib/offline/schema.ts` | 502 | SQLite DDL mirroring migration `0001`; `TABLES`, per-table `COLUMN_TYPES`, `schemaSql()` |
| `lib/offline/adapter.ts` | 739 | PostgREST-compatible query builder + value codec + Postgres error mapping |
| `lib/offline/seed.ts` | 321 | Generic, industry-neutral demo dataset (idempotent) |
| `scripts/seed-offline.ts` | 58 | Async CLI entry point for seeding |
| `tests/offline-sqlite.test.ts` | 870 | 53 tests driving the real repositories through the seam |

### Rewritten (pre-existing offline stubs)

| File | Lines | Change |
|---|---|---|
| `lib/offline/db.ts` | 99 | Lazy connection (no import-time filesystem work), `BYTEME_OFFLINE_DB_PATH`, `:memory:` support, WAL / `foreign_keys=ON` / `busy_timeout=5000` |
| `lib/offline/init.ts` | 53 | Idempotent schema creation, `isOfflineSchemaReady()` |
| `lib/offline/index.ts` | 42 | Barrel, side-effect free |

### Edited (minimal, online behaviour preserved)

| File | Change |
|---|---|
| `lib/repositories/base.ts` | `client()` returns the SQLite adapter when offline, else `getServiceClient()`; added `isOffline()` |
| `lib/env.ts` | Supabase vars `.optional()`; added `BYTEME_OFFLINE_DB_PATH`; per-variable `ConfigurationError` issues, thrown only when offline mode is off |
| `lib/supabase/client.ts` | `getSupabaseAdmin()` refuses to build a client in offline mode, and still throws `ConfigurationError` when credentials are missing |
| `app/api/v1/health/route.ts` | `probeDatabase()` checks the SQLite schema in offline mode; response body shape unchanged |
| `package.json` | Added `offline:seed` script |
| `.env.example` | Documented `BYTEME_OFFLINE_MODE`, `BYTEME_OFFLINE_DB_PATH` |
| `.gitignore` | Ignored `*.db`, `*.db-journal`, `*.db-wal`, `*.db-shm` |
| `README.md` | Offline mode section, structure and testing updates |
| `.env.local` (untracked) | Left at `BYTEME_OFFLINE_MODE=false`; both offline keys present |

Nothing under `supabase/migrations/`, `supabase/seed.sql`, any existing
repository, service, API route or pre-existing test was deleted.

---

## 3. Architecture — one seam, no fork

```
service / API route
        │
        ▼
  lib/repositories/*.ts          (unchanged)
        │  client()  ← the ONLY backend switch
        ▼
  ┌─────────────────────┬────────────────────────────────┐
  │ isOfflineMode()     │ !isOfflineMode()               │
  │ createOfflineClient │ getServiceClient()             │
  │ (SQLite adapter)    │ (Supabase / PostgREST)         │
  └─────────────────────┴────────────────────────────────┘
```

The adapter implements only the query surface the codebase actually uses
(counted by grep over `lib/repositories`, `lib/services`, `app/api`):

`select` (47), `eq` (64), `update` (22), `order` (17), `maybeSingle` (16),
`or` (5), `insert` (5), `lte` (4), `limit` (4), `gte` (4), `delete` (4),
`single` (3), `in` (2), `upsert` (1), `range` (1), `neq` (1), `lt` (1),
`gt` (1) — plus `is()` for the `.or()` filters.

All of these are implemented (`lib/offline/adapter.ts:339-480`). Unknown filter
syntax raises instead of guessing, so a future unsupported call fails loudly in
tests rather than silently returning wrong rows.

---

## 4. Schema coverage

All eleven ByteMe tables are created, verified present in a seeded database file:

| Table | Seeded rows |
|---|---|
| `factories` | 1 |
| `machines` | 7 |
| `processes` | 6 |
| `process_dependencies` | 5 |
| `production_orders` | 2 |
| `energy_data` | 192 |
| `electricity_tariffs` | 4 |
| `schedules` / `schedule_entries` | 0 (by design — no fabricated optimizer output) |
| `optimization_requests` / `optimization_results` | 0 (created on demand) |

Type mapping: `uuid`→TEXT, `jsonb`/arrays→TEXT (JSON), `numeric`→REAL,
`integer`→INTEGER, `boolean`→INTEGER 0/1, `timestamptz`→TEXT ISO-8601,
`time`→TEXT. CHECK constraints from migration `0001` are ported. The uniqueness
index is reproduced as
`energy_data_unique_interval_idx ON energy_data (factory_id, ifnull(machine_id,''), recorded_at)`,
which is what makes the energy upsert conflict target resolvable.

---

## 5. Defects found and fixed during implementation

1. **Upsert conflict target was truncated.** A naive `split(',')` cut
   `coalesce(machine_id,'…')` in half, so `ON CONFLICT` did not match any
   unique index and every energy upsert failed with
   `ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint`.
   Fixed with a paren-aware `splitTopLevel()` plus translation of
   `coalesce(X, …)` → `ifnull(X, '')`, matching the SQLite expression index.
2. **`undefined` was written as NULL.** Where Postgres omits an absent key and
   lets the column DEFAULT apply, the adapter violated `NOT NULL`. Fixed by
   stripping undefined keys on insert and update (`withoutUndefined`); explicit
   `null` is preserved as a real clear.
3. **Upserts returned nothing.** Writes re-selected by the *attempted* id, which
   is absent when a conflict was resolved. Replaced with `RETURNING *`. The
   `DO UPDATE SET` list also excludes `id`, so re-seeding preserves the original
   primary key and child rows keep pointing at the same parent.
4. **Seed script closed the database mid-run** (`The database connection is not
   open`) because the entry point was synchronous. Now `async main()` with
   `.catch`/`.finally(closeDb)`.

---

## 6. Test coverage (53 tests, `tests/offline-sqlite.test.ts`)

| Group | What it proves |
|---|---|
| the backend seam (3) | routes `client()` to SQLite, never constructs a Supabase client offline, reads no credential at all |
| schema (4) | every table created, init idempotent, foreign keys on, no credential stored |
| value encoding (2) | json/bool/number/array round-trip; json is not double-encoded |
| `.or()` translation (3) | `effective_from.is.null,lte.X`, `lt.X`, the two-sided `.in.` form, and refusal on unknown syntax |
| factories (5) | CRUD, shallow config merge, 404 on missing, exact-count pagination |
| machines (4) | json/boolean integrity, create/read/delete, limit+offset+sort, head count |
| processes & dependencies (4) | dependency resolution, `depends_on` attach, empty-id maps |
| production orders (2) | numeric/json integrity, empty patch rejected |
| energy data (4) | window listing, `gte`/`lte`, upsert returns rows, `on_conflict=skip`, totals |
| electricity tariffs (3) | null/`lte` filter, overlap search, exclusion of expired windows |
| schedules & entries (6) | schedule creation, chronological entries, full replacement + recomputed totals, cross-schedule `.in()` count, overlap detection, cleanup |
| error mapping (4) | 23505→409, 23503→400, 23514→400, Zod range rule still enforced |
| optimizer offline (4) | still 503 (no invented contract), attempt recorded locally, real payload from SQLite, dry run |
| guardrails (2) | no industry vocabulary in `lib/offline/*`; no secret name/value written |
| configuration (1) | missing Supabase env is a `ConfigurationError`, not a 400 |

---

## 7. Live HTTP verification (offline)

Server started with `BYTEME_OFFLINE_MODE=true` and a temporary database:

- `GET /api/v1/health` → 200, body identical in shape to online
  (`status`, `app`, `timestamp`, `checks.database.configured/reachable`,
  `checks.optimizer`, `checks.environment.missing_variables`).
- Factory-scoped reads → 200: detail, summary, machines, processes,
  process-dependencies, production-orders, tariffs, energy-data (with limit),
  schedules, optimization-requests.
- `POST /optimization-requests` with `dry_run:false` → 503
  `service_unavailable` carrying `reason` and the real
  `payload_would_be_sent`; the attempt is stored locally and listed afterwards
  with status `not_configured`. No fabricated schedule or cost.
- `dry_run:true` → 201 with the stored payload.
- Malformed body → 400 `validation_error` with Zod issues (unchanged envelope).
- Energy bulk upsert verified for both `update` and `skip` conflict policies.

---

## 8. Secret audit

- The live service key (41 chars) and project URL (40 chars) were extracted
  from the git-ignored `.env.local` and grepped for literally across the
  workspace: **zero hits** outside `.env.local` (excluding `node_modules`,
  `.next`).
- The generated SQLite database was scanned as raw strings for `sb_secret_`,
  `service_role`, `supabase.co`, JWT prefixes and the literal key/URL:
  **zero hits**.
- `lib/offline/*.ts`, `scripts/seed-offline.ts` and
  `tests/offline-sqlite.test.ts` mention secret *names* only, inside negative
  assertions that would fail if a value were written.
- `assertSecretsAreNotPublic()` still guards against any secret being mirrored
  into a `NEXT_PUBLIC_*` variable.
- The seed CLI prints only the database path, slug, factory id and row counts.

---

## 9. Limitations and residual risk

1. **No Git repository on this host.** `git status` fails in the backend
   directory, so the "tracked files" audit was performed with filesystem grep
   rather than `git ls-files`. Worth re-running `git grep` in a real clone.
2. **Online behaviour was verified by tests and `verify:db`, not by writing to
   the live Supabase project.** `npm run verify:db` still passes, but the
   offline work did not perform live online mutations.
3. **`schedule_entries` / `optimization_results` HTTP write paths** are covered
   by repository tests but were not separately exercised over HTTP, because no
   optimizer is configured to produce a schedule.
4. **Expression indexes are emulated.** `ifnull(machine_id,'')` matches the
   Postgres `coalesce(machine_id,'0000…'::uuid)` semantics for conflict
   purposes; a future migration that changes that expression must be mirrored
   in `lib/offline/schema.ts`.
5. **The adapter supports exactly the query surface measured above.** A new
   repository using an unimplemented PostgREST modifier will fail loudly
   (unsupported syntax raises) rather than silently misbehaving — but it will
   need an adapter addition.

---

## 10. Reproduction

```bash
# online / default
npm test && npx tsc --noEmit && npm run build && npm run verify:db

# offline
BYTEME_OFFLINE_MODE=true npm run offline:seed
BYTEME_OFFLINE_MODE=true npm run dev
curl -s localhost:3000/api/v1/health
```

Set `BYTEME_OFFLINE_MODE=true` and optionally `BYTEME_OFFLINE_DB_PATH` in
`.env.local` (see `.env.example`). No Supabase credentials are read in offline
mode.
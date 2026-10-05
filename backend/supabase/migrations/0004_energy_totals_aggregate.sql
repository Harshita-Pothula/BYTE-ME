-- ===========================================================================
-- ByteMe — 0004_energy_totals_aggregate
--
-- Moves the energy-data summary out of the application and into the database.
--
-- THE DEFECT THIS FIXES
-- ---------------------
-- GET /api/v1/factories/:factoryId/energy-data/summary answered by fetching
-- every matching reading into the Node process and summing it there:
--
--   SELECT consumption_kwh, generation_kwh, recorded_at
--     FROM energy_data WHERE factory_id = ... ORDER BY recorded_at
--     LIMIT 50000
--
--   for (row of data) consumption += row.consumption_kwh   // in JS
--
-- Two problems, one of them a correctness bug:
--
--   1. SILENT TRUNCATION. The limit is 50,000 rows. A factory with 50,001
--      readings in range returns a total computed from the first 50,000 and
--      reports `intervals: 50000` as though that were the true count. Nothing
--      in the response says the number is partial, because the limit was
--      invisible. A summary that silently under-reports is worse than one that
--      fails: an energy budget built on it is wrong and there is no signal to
--      look for.
--
--   2. THE DATABASE WAS USED AS A FILE READER. Every reading crossed the
--      network only to be discarded by a loop that could have been a SUM().
--      At 50,000 rows that is 50,000 rows of JSON parsed per request.
--
-- WHY A FUNCTION
-- --------------
-- PostgREST cannot express `SELECT sum(x)` as a query — it does not do
-- implicit aggregate functions. Aggregates have always required a database
-- function, which is exactly what migration 0003 established as the pattern
-- for "something the client cannot express as a query". The repository calls
-- `rpc('energy_totals', ...)`, which is the same seam `replace_schedule_entries`
-- uses, so there is still one way to reach the database.
--
-- It also fixes the from/to values. The old code took them from the first and
-- last row of the FETCHED PAGE, so `from` and `to` described the page, not
-- the filter. min() and max() describe the filter.
--
-- EMPTY INPUT
-- -----------
-- With no matching rows the old code returned zeros with null bounds. SUM() over
-- no rows is null, so coalesce() restores exactly that: 0 and null bounds.
--
-- PRIVILEGES
-- ----------
-- service_role ONLY, revoked from PUBLIC first. Postgres grants EXECUTE on new
-- functions to PUBLIC by default, and `authenticated` has full table access via
-- the 0002 grants — so leaving the default in place would let a caller read
-- any factory's energy totals straight through PostgREST, bypassing the factory
-- authorization in lib/auth. Same rule, same reason as 0003.
--
-- SECURITY INVOKER so RLS still governs it.
--
-- Idempotent: re-running replaces the function and re-asserts the grants.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- energy_totals
--
-- p_factory_id  the factory whose readings are summed.
-- p_from        inclusive lower bound on recorded_at, or NULL for no bound.
-- p_to          inclusive upper bound on recorded_at, or NULL for no bound.
-- p_machine_id  restrict to one machine's readings, or NULL for all of them.
--
-- Returns one row. `interval_count` is the number of readings that contributed,
-- which is what makes truncation detectable from the response rather than
-- something a reader has to know about.
-- ---------------------------------------------------------------------------
create or replace function public.energy_totals(
  p_factory_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_machine_id uuid default null
)
returns table (
  consumption_kwh numeric,
  generation_kwh numeric,
  interval_count bigint,
  first_recorded_at timestamptz,
  last_recorded_at timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    coalesce(sum(e.consumption_kwh), 0),
    coalesce(sum(e.generation_kwh), 0),
    count(*),
    min(e.recorded_at),
    max(e.recorded_at)
  from public.energy_data e
  where e.factory_id = p_factory_id
    and (p_from is null or e.recorded_at >= p_from)
    and (p_to is null or e.recorded_at <= p_to)
    and (p_machine_id is null or e.machine_id = p_machine_id);
$$;

-- ---------------------------------------------------------------------------
-- Grants: service_role only. PUBLIC's default is revoked first.
-- ---------------------------------------------------------------------------
revoke execute on function public.energy_totals(uuid, timestamptz, timestamptz, uuid) from public;
revoke execute on function public.energy_totals(uuid, timestamptz, timestamptz, uuid) from anon;
revoke execute on function public.energy_totals(uuid, timestamptz, timestamptz, uuid) from authenticated;

grant execute on function public.energy_totals(uuid, timestamptz, timestamptz, uuid) to service_role;

-- PostgREST caches its function list; without this the function reports as
-- missing (PGRST202) until the cache is reloaded.
notify pgrst, 'reload schema';

-- ===========================================================================
-- ByteMe — 0002_grant_table_privileges
--
-- Fixes a real defect in 0001: it created the tables and enabled RLS, but
-- never GRANTed table-level privileges to the API roles.
--
-- Symptom observed on a live project after applying 0001 + seed:
--   GET /rest/v1/factories -> HTTP 403
--   {"code":"42501","message":"permission denied for table factories"}
--
-- WHY THIS HAPPENS
--   Enabling RLS is not the same as granting access. Postgres evaluates
--   privileges BEFORE row-level security: a role with no table-level GRANT is
--   refused outright with 42501 permission_denied. This is distinguishable
--   from RLS filtering, which returns HTTP 200 with an empty array.
--
--   0001 assumed Supabase's default privileges already covered these tables.
--   That assumption does not hold when tables are created by a role other
--   than the one the defaults were set for, or when the project's
--   `alter default privileges` do not include the API roles.
--
-- WHAT THIS DOES
--   Grants the minimum privileges each role actually needs:
--     service_role  -> full access. It bypasses RLS, so it needs table
--                      privileges but no row filtering. This is the key the
--                      ByteMe API server uses.
--     authenticated -> full access, subject to the RLS policies from 0001.
--     anon          -> nothing. No grant at all, which is stricter than
--                      relying on RLS alone and keeps anonymous callers out
--                      even if a policy were later loosened by mistake.
--
-- Idempotent: re-running is harmless.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Sequence privileges
--
-- Needed because several ByteMe columns use `default gen_random_uuid()`.
-- That function is provided by pgcrypto and does NOT consume a sequence, so
-- these grants are not strictly required today. They are included so that a
-- future `identity`/`serial` column does not silently fail at insert time.
-- ---------------------------------------------------------------------------
grant usage, select on all sequences in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Existing tables
--
-- `grant all` covers select, insert, update and delete. RLS from 0001 still
-- constrains `authenticated`; `service_role` bypasses it by design.
-- ---------------------------------------------------------------------------
grant all on all tables in schema public to service_role;
grant all on all tables in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Future tables
--
-- 0001 and 0002 are applied as a batch in the SQL Editor, so the statements
-- above cover the tables 0001 just created. These ALTER DEFAULT PRIVILEGES
-- statements make the same guarantees hold for anything added later, which is
-- what was missing in the first place.
-- ---------------------------------------------------------------------------
alter default privileges in schema public
  grant all on tables to service_role;

alter default privileges in schema public
  grant all on tables to authenticated;

alter default privileges in schema public
  grant all on sequences to service_role;

alter default privileges in schema public
  grant all on sequences to authenticated;

-- ---------------------------------------------------------------------------
-- Function privileges
--
-- public.set_updated_at() is invoked by triggers as the table owner, so this
-- grant is not strictly required either. It is included so the trigger
-- function remains callable if ownership ever changes.
-- ---------------------------------------------------------------------------
grant execute on function public.set_updated_at() to service_role, authenticated;

-- ---------------------------------------------------------------------------
-- Verification
--
-- Raises a notice listing every ByteMe table the service_role can now read.
-- Notices are often hidden by the Supabase SQL Editor; to check explicitly:
--
--   select table_name, privilege_type
--     from information_schema.role_table_grants
--    where grantee = 'service_role'
--      and table_schema = 'public'
--    order by table_name, privilege_type;
--
-- Expected: 11 tables x {INSERT, SELECT, UPDATE, DELETE}.
-- `anon` should return zero rows, confirming anonymous callers stay locked out.
-- ---------------------------------------------------------------------------
do $$
declare
  target text;
  granted_count integer := 0;
begin
  foreach target in array array[
    'factories',
    'machines',
    'processes',
    'process_dependencies',
    'production_orders',
    'energy_data',
    'electricity_tariffs',
    'optimization_requests',
    'optimization_results',
    'schedules',
    'schedule_entries'
  ]
  loop
    if has_table_privilege('service_role', format('public.%I', target), 'select') then
      granted_count := granted_count + 1;
    else
      raise warning 'service_role still lacks SELECT on public.%', target;
    end if;
  end loop;

  raise notice 'ByteMe tables readable by service_role: % of 11', granted_count;
end;
$$;
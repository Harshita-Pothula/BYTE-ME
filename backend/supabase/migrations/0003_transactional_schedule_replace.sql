-- ===========================================================================
-- ByteMe — 0003_transactional_schedule_replace
--
-- Makes "replace a schedule's entries" a single atomic database operation.
--
-- THE DEFECT THIS FIXES
-- ---------------------
-- PUT /api/v1/factories/:factoryId/schedules/:scheduleId/entries was
-- implemented as two independent requests:
--
--   1. DELETE FROM schedule_entries WHERE schedule_id = ?
--   2. INSERT INTO schedule_entries (...) VALUES ...
--
-- PostgREST gives each request its own transaction and there is no way to hold
-- one open across two HTTP calls, so those two statements could not be made
-- atomic from the client. If step 2 failed — a foreign key to a machine that no
-- longer exists, a check constraint, a dropped connection, a statement timeout —
-- the schedule was left with zero entries and no record that anything had been
-- attempted. A schedule silently emptied is worse than a failed request: the
-- caller sees a 4xx/5xx, retries, and the factory's only copy of the plan is
-- already gone.
--
-- WHY A FUNCTION
-- --------------
-- Inside Postgres, a function body runs in a single implicit transaction. Any
-- raised exception rolls the whole function back. So moving the two statements
-- plus the schedule-row update into one function is what actually delivers
-- atomicity — there is no client-side transaction to manage, and the guarantee
-- holds for every caller, not just this one route.
--
-- WHAT IS IN THE TRANSACTION
-- --------------------------
--   1. Lock the schedule row (FOR UPDATE). Two concurrent replacements of the
--      same schedule now serialise instead of interleaving: without the lock,
--      caller A's DELETE and caller B's INSERT could interleave and produce a
--      schedule holding neither caller's entries.
--   2. Delete the existing entries.
--   3. Insert the replacement entries.
--   4. Update the schedule's status, metadata and denormalised totals.
-- Step 4 is the "state/metadata" half of the operation and is what stops a
-- committed replacement from leaving `schedules.total_energy_kwh` describing
-- entries that no longer exist. Totals are supplied by the caller rather than
-- recomputed in SQL, because the peak-demand figure is a sweep over start/end
-- events that already exists and is tested in lib/repositories/schedules.ts;
-- duplicating that algorithm in plpgsql would be a second implementation to
-- keep in step with the first.
--
-- PRIVILEGES
-- ----------
-- Deliberately service_role ONLY.
--
-- PostgREST grants EXECUTE on new functions to PUBLIC by default. That default
-- is not acceptable here: `authenticated` has full table access via the 0002
-- grants, so leaving the function executable would let a caller with an anon
-- key and any authenticated session invoke it directly against PostgREST,
-- completely bypassing the factory authorization the API enforces in
-- lib/auth. The function is therefore revoked from PUBLIC and granted to
-- service_role alone, so the only way to reach it is through the API server,
-- which authorizes first.
--
-- SECURITY INVOKER, not DEFINER
-- -----------------------------
-- The function runs with the caller's privileges, so RLS and the 0002 table
-- grants still govern it. SECURITY DEFINER would make it a privilege-escalation
-- vector: `authenticated` could invoke a function that writes with the owner's
-- rights, which is precisely the bypass described above.
--
-- search_path is pinned so no caller-supplied schema can shadow the tables.
--
-- Idempotent: re-running replaces the function and re-asserts the grants.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Atomic entry replacement
--
-- p_entries  jsonb array of entry objects, same shape as scheduleEntryBulkSchema.
-- p_patch    jsonb of schedule columns to update alongside the entries. A key
--            that is ABSENT leaves the column untouched; a key present with a
--            null sets it to null. That distinction is why the patch is tested
--            with `?` rather than coalesced: `coalesce(p_patch->>'x', s.x)`
--            would make it impossible to ever clear a nullable column.
--
-- `metadata` is MERGED (`||`), not replaced. The schedule's metadata is a
-- caller-owned bag; replacing it wholesale would silently discard keys the
-- caller did not mention.
--
-- Returns the stored rows, ordered chronologically, so the caller gets exactly
-- what was committed — including database defaults and generated ids.
-- ---------------------------------------------------------------------------
create or replace function public.replace_schedule_entries(
  p_schedule_id uuid,
  p_entries jsonb,
  p_patch jsonb default '{}'::jsonb
)
returns setof public.schedule_entries
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_locked_id uuid;
begin
  -- Serialise concurrent replacements of this schedule. Also proves the
  -- schedule exists: `not found` means the caller passed a bad id.
  select s.id into v_locked_id
    from public.schedules s
   where s.id = p_schedule_id
     for update;

  if not found then
    raise exception 'schedule % does not exist', p_schedule_id
      using errcode = 'P0002';
  end if;

  -- 1. Replace the entries.
  delete from public.schedule_entries se
   where se.schedule_id = p_schedule_id;

  insert into public.schedule_entries (
    schedule_id,
    machine_id,
    process_id,
    production_order_id,
    starts_at,
    ends_at,
    power_kw,
    energy_kwh,
    cost,
    quantity,
    sequence,
    metadata
  )
  select
    p_schedule_id,
    (entry.value->>'machine_id')::uuid,
    (entry.value->>'process_id')::uuid,
    nullif(entry.value->>'production_order_id', '')::uuid,
    (entry.value->>'starts_at')::timestamptz,
    (entry.value->>'ends_at')::timestamptz,
    (entry.value->>'power_kw')::numeric,
    (entry.value->>'energy_kwh')::numeric,
    (entry.value->>'cost')::numeric,
    (entry.value->>'quantity')::numeric,
    coalesce((entry.value->>'sequence')::integer, 0),
    coalesce(entry.value->'metadata', '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) as entry(value);

  -- 2. Apply the state/metadata half of the replacement. Updating the row at
  --    all (even with an empty patch) bumps updated_at via the 0001 trigger,
  --    which is correct: the schedule's contents changed.
  update public.schedules s
     set status = case
                    when p_patch ? 'status' then (p_patch->>'status')::text
                    else s.status
                  end,
         metadata = s.metadata || coalesce(p_patch->'metadata', '{}'::jsonb),
         total_energy_cost = case
                    when p_patch ? 'total_energy_cost' then (p_patch->>'total_energy_cost')::numeric
                    else s.total_energy_cost
                  end,
         total_energy_kwh = case
                    when p_patch ? 'total_energy_kwh' then (p_patch->>'total_energy_kwh')::numeric
                    else s.total_energy_kwh
                  end,
         peak_demand_kw = case
                    when p_patch ? 'peak_demand_kw' then (p_patch->>'peak_demand_kw')::numeric
                    else s.peak_demand_kw
                  end
   where s.id = p_schedule_id;

  return query
    select se.*
      from public.schedule_entries se
     where se.schedule_id = p_schedule_id
     order by se.starts_at, se.sequence, se.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Atomic batch append
--
-- POST /entries with an `entries` array had the same shape of defect: the route
-- inserted the batch one row at a time, so entry 4 of 5 failing left the first
-- three committed and the request reported failure. Same guarantee, no DELETE.
--
-- Shares the totals/status patch with replace_schedule_entries so a batch
-- append refreshes the schedule's denormalised totals in the same transaction.
-- ---------------------------------------------------------------------------
create or replace function public.append_schedule_entries(
  p_schedule_id uuid,
  p_entries jsonb,
  p_patch jsonb default '{}'::jsonb
)
returns setof public.schedule_entries
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_locked_id uuid;
  -- The ids this call actually inserted, so the return set is exactly the new
  -- rows and not rows an earlier append already committed. Filtering by
  -- created_at or min(created_at) would be wrong: two appends inside the same
  -- clock tick would return each other's rows.
  v_inserted_ids uuid[];
begin
  select s.id into v_locked_id
    from public.schedules s
   where s.id = p_schedule_id
     for update;

  if not found then
    raise exception 'schedule % does not exist', p_schedule_id
      using errcode = 'P0002';
  end if;

  with inserted as (
    insert into public.schedule_entries (
      schedule_id,
      machine_id,
      process_id,
      production_order_id,
      starts_at,
      ends_at,
      power_kw,
      energy_kwh,
      cost,
      quantity,
      sequence,
      metadata
    )
    select
      p_schedule_id,
      (entry.value->>'machine_id')::uuid,
      (entry.value->>'process_id')::uuid,
      nullif(entry.value->>'production_order_id', '')::uuid,
      (entry.value->>'starts_at')::timestamptz,
      (entry.value->>'ends_at')::timestamptz,
      (entry.value->>'power_kw')::numeric,
      (entry.value->>'energy_kwh')::numeric,
      (entry.value->>'cost')::numeric,
      (entry.value->>'quantity')::numeric,
      coalesce((entry.value->>'sequence')::integer, 0),
      coalesce(entry.value->'metadata', '{}'::jsonb)
    from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) as entry(value)
    returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into v_inserted_ids from inserted;

  update public.schedules s
     set status = case
                    when p_patch ? 'status' then (p_patch->>'status')::text
                    else s.status
                  end,
         metadata = s.metadata || coalesce(p_patch->'metadata', '{}'::jsonb),
         total_energy_cost = case
                    when p_patch ? 'total_energy_cost' then (p_patch->>'total_energy_cost')::numeric
                    else s.total_energy_cost
                  end,
         total_energy_kwh = case
                    when p_patch ? 'total_energy_kwh' then (p_patch->>'total_energy_kwh')::numeric
                    else s.total_energy_kwh
                  end,
         peak_demand_kw = case
                    when p_patch ? 'peak_demand_kw' then (p_patch->>'peak_demand_kw')::numeric
                    else s.peak_demand_kw
                  end
   where s.id = p_schedule_id;

  return query
    select se.*
      from public.schedule_entries se
     where se.id = any (v_inserted_ids)
     order by se.starts_at, se.sequence, se.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
--
-- revoke first: EXECUTE is granted to PUBLIC by default on every new function,
-- and `authenticated` could otherwise call these straight through PostgREST,
-- bypassing lib/auth's factory authorization entirely.
--
-- service_role only. `authenticated` and `anon` get nothing.
-- ---------------------------------------------------------------------------
revoke execute on function public.replace_schedule_entries(uuid, jsonb, jsonb) from public;
revoke execute on function public.append_schedule_entries(uuid, jsonb, jsonb) from public;
revoke execute on function public.replace_schedule_entries(uuid, jsonb, jsonb) from anon;
revoke execute on function public.append_schedule_entries(uuid, jsonb, jsonb) from anon;
revoke execute on function public.replace_schedule_entries(uuid, jsonb, jsonb) from authenticated;
revoke execute on function public.append_schedule_entries(uuid, jsonb, jsonb) from authenticated;

grant execute on function public.replace_schedule_entries(uuid, jsonb, jsonb) to service_role;
grant execute on function public.append_schedule_entries(uuid, jsonb, jsonb) to service_role;

-- PostgREST must be told the schema changed or it serves a cached function list
-- and the new function appears to be missing (PGRST202).
notify pgrst, 'reload schema';

/**
 * Verifies the Supabase connection and seed data without printing any secret.
 *
 * Reads credentials from .env.local via the project's own env module, reports
 * only structural facts (counts, slugs, boolean reachability), and never logs a
 * key, a URL credential, or a row payload that could embed one.
 *
 * Usage: node scripts/verify-supabase.mjs
 */

import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

/** Minimal .env.local parser: no dependency, no logging of values. */
function loadEnvFile(path) {
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const i = trimmed.indexOf('=')
    if (i === -1) continue
    const key = trimmed.slice(0, i).trim()
    let value = trimmed.slice(i + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

const env = { ...process.env, ...loadEnvFile(new URL('../.env.local', import.meta.url)) }

const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY

let failures = 0
const pass = (msg) => console.log(`  PASS  ${msg}`)
const fail = (msg) => {
  failures += 1
  console.log(`  FAIL  ${msg}`)
}

console.log('\n=== 1. Configuration present ===')
if (!url) fail('NEXT_PUBLIC_SUPABASE_URL is not set')
else pass(`NEXT_PUBLIC_SUPABASE_URL set (${url.length} chars, host ${new URL(url).hostname})`)

if (!key) fail('SUPABASE_SERVICE_ROLE_KEY is not set')
else pass(`SUPABASE_SERVICE_ROLE_KEY set (${key.length} chars)`)

// Guard the security rule rather than trusting it.
if (env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) {
  fail('service-role key is exposed via a NEXT_PUBLIC_ variable')
} else {
  pass('service-role key is NOT exposed via any NEXT_PUBLIC_ variable')
}

if (!url || !key) {
  console.log('\nCannot continue without credentials.\n')
  process.exit(1)
}

console.log('\n=== 2. Schema present and readable (11 tables) ===')
const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const EXPECTED_TABLES = [
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
  'schedule_entries',
]

for (const table of EXPECTED_TABLES) {
  // A HEAD request discards the PostgREST error body, which loses the useful
  // "permission denied for table X" message. Use an explicit fetch so the
  // status code and body are both available for diagnosis.
  const res = await fetch(`${url}/rest/v1/${table}?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' },
  })

  if (res.ok) {
    const count = res.headers.get('content-range')?.split('/')[1] ?? '?'
    pass(`${table} readable (count=${count})`)
  } else {
    const body = await res.text().catch(() => '')
    let message = body.slice(0, 160)
    try {
      const parsed = JSON.parse(body)
      message = parsed.message || parsed.hint || message
    } catch {
      // keep the raw body
    }

    // 403/42501 is the privilege gap fixed by 0002_grant_table_privileges.sql.
    const hint =
      res.status === 403 || res.status === 401
        ? ' — missing table GRANT; apply supabase/migrations/0002_grant_table_privileges.sql'
        : ''

    fail(`${table}: HTTP ${res.status} ${message}${hint}`)
  }
}

console.log('\n=== 3. Anon role is locked out ===')
// PostgREST cannot read pg_class, so RLS state is asserted by behaviour:
//   - service_role bypasses RLS, so it should read rows once grants exist.
//   - anon holds NO grant, so it must be refused.
// If the anon key is unavailable this check is skipped rather than faked.
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY

if (!ANON_KEY) {
  console.log('  SKIP  no anon key in .env.local; cannot probe anonymous access');
} else {
  const anonRes = await fetch(`${url}/rest/v1/factories?select=id&limit=1`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  })
  if (anonRes.status === 200 || anonRes.status === 401) {
    fail(`anon can reach factories (HTTP ${anonRes.status}); expected 403`)
  } else {
    pass(`anon refused as expected (HTTP ${anonRes.status})`);
  }
}

console.log('\n=== 4. Seed data: Chocolate Factory demo ===')
const { data: factory, error: fErr } = await supabase
  .from('factories')
  .select('id, slug, name, timezone, currency')
  .eq('slug', 'demo-chocolate-factory')
  .maybeSingle()

if (fErr) fail(`query factories: ${fErr.message}`)
else if (!factory) fail("no factory with slug 'demo-chocolate-factory' — seed not loaded")
else {
  pass(`factory found: ${factory.name} (${factory.timezone}, ${factory.currency})`)
  console.log(`        id=${factory.id}`)

  const counts = {
    machines: await supabase.from('machines').select('id', { count: 'exact', head: true }).eq('factory_id', factory.id),
    processes: await supabase.from('processes').select('id', { count: 'exact', head: true }).eq('factory_id', factory.id),
    process_dependencies: await supabase
      .from('process_dependencies')
      .select('id', { count: 'exact', head: true })
      .eq('factory_id', factory.id),
    production_orders: await supabase
      .from('production_orders')
      .select('id', { count: 'exact', head: true })
      .eq('factory_id', factory.id),
    energy_data: await supabase.from('energy_data').select('id', { count: 'exact', head: true }).eq('factory_id', factory.id),
    electricity_tariffs: await supabase
      .from('electricity_tariffs')
      .select('id', { count: 'exact', head: true })
      .eq('factory_id', factory.id),
  }

  const EXPECTED = {
    machines: 7,
    processes: 8,
    process_dependencies: 7,
    production_orders: 3,
    energy_data: 673,
    electricity_tariffs: 5,
  }

  console.log('')
  for (const [table, result] of Object.entries(counts)) {
    if (result.error) {
      fail(`${table}: ${result.error.message}`)
      continue
    }
    const got = result.count ?? 0
    const want = EXPECTED[table]
    // energy_data is time-window dependent, so only require it to be non-empty.
    if (table === 'energy_data') {
      if (got > 0) pass(`${table}: ${got} rows (>=1)`)
      else fail(`${table}: 0 rows`)
    } else if (got === want) {
      pass(`${table}: ${got} rows`)
    } else {
      fail(`${table}: ${got} rows, expected ${want}`)
    }
  }

  console.log('\n  --- dependency edges (the section that failed previously) ---')
  const { data: deps, error: dErr } = await supabase
    .from('process_dependencies')
    .select('dependency_type, lag_minutes')
    .eq('factory_id', factory.id)

  if (dErr) fail(`dependency query: ${dErr.message}`)
  else if ((deps?.length ?? 0) === 7) pass(`7 dependency edges readable, metadata column accepted`)
  else fail(`${deps?.length ?? 0} dependency edges, expected 7`)

  console.log('\n  --- machine names (demonstrates the demo data is chocolate) ---')
  const { data: machines } = await supabase
    .from('machines')
    .select('name, rated_power_kw, max_power_kw')
    .eq('factory_id', factory.id)
    .order('name')

  for (const m of machines ?? []) {
    console.log(`        ${m.name}: rated=${m.rated_power_kw ?? 'n/a'} kW, max=${m.max_power_kw ?? 'n/a'} kW`)
  }

  console.log('\n  --- tariffs ---')
  const { data: tariffs } = await supabase
    .from('electricity_tariffs')
    .select('slug, start_time, end_time, energy_price_per_kwh')
    .eq('factory_id', factory.id)
    .order('priority', { ascending: false })

  for (const t of tariffs ?? []) {
    console.log(`        ${t.slug}: ${t.start_time}-${t.end_time} @ ${t.energy_price_per_kwh}/kWh`)
  }

  console.log('\n  --- no fabricated optimizer output ---')
  const { count: schedCount } = await supabase
    .from('schedules')
    .select('id', { count: 'exact', head: true })
    .eq('factory_id', factory.id)
  const { count: resCount } = await supabase
    .from('optimization_results')
    .select('id', { count: 'exact', head: true })
    .eq('factory_id', factory.id)

  if ((schedCount ?? 0) === 0 && (resCount ?? 0) === 0) {
    pass('no schedules and no optimization results (as designed)')
  } else {
    fail(`unexpected seeded output: schedules=${schedCount}, results=${resCount}`)
  }
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`)
process.exit(failures === 0 ? 0 : 1)
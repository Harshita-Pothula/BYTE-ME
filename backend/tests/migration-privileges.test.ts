/**
 * Guards the privilege model in the migrations.
 *
 * This exists because 0001 shipped a real defect: it created tables and
 * enabled RLS but never GRANTed table privileges, so a live project answered
 * every PostgREST request with:
 *
 *   HTTP 403 {"code":"42501","message":"permission denied for table factories"}
 *
 * Enabling RLS is not granting access. Postgres checks privileges first, so a
 * role with no table-level GRANT is refused outright. These tests assert the
 * migration layer grants what the API needs and nothing more.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join('supabase', 'migrations')
const P1 = join(MIGRATIONS_DIR, '0001_initial_schema.sql')
const P2 = join(MIGRATIONS_DIR, '0002_grant_table_privileges.sql')

const TABLES = [
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

const m1 = readFileSync(P1, 'utf8')
const m2 = readFileSync(P2, 'utf8')

describe('migration 0001 — table definitions', () => {
  it('creates all eleven tables', () => {
    for (const table of TABLES) {
      expect(m1, `create table public.${table}`).toContain(`create table public.${table}`)
    }
  })

  it('enables row level security on every table', () => {
    for (const table of TABLES) {
      expect(m1).toMatch(
        new RegExp(`alter table public\\.${table}\\s+enable row level security;`),
      )
    }
  })

  it('creates no policies for the anon role', () => {
    // anon must match zero policies, so it is denied on every table.
    expect(m1).not.toMatch(/to\s+anon/i)
  })

  it('grants nothing itself, which is why 0002 is required', () => {
    // Documents the original defect as a permanent, explicit assertion: if
    // someone later adds grants to 0001, this reminds them 0002 still exists.
    expect(m1).not.toMatch(/^\s*grant\b/im)
  })
})

describe('migration 0002 — table privileges', () => {
  it('exists', () => {
    expect(existsSync(P2)).toBe(true)
  })

  it('grants table privileges to service_role, the key the API uses', () => {
    expect(m2).toMatch(/grant all on all tables in schema public to service_role;/)
  })

  it('grants table privileges to authenticated, whose access RLS governs', () => {
    expect(m2).toMatch(/grant all on all tables in schema public to authenticated;/)
  })

  it('grants nothing to anon', () => {
    // Stricter than relying on RLS alone: even a mistaken policy cannot expose
    // data to anonymous callers.
    expect(m2).not.toMatch(/grant[^\n;]*\bto anon\b/i)
  })

  it('sets ALTER DEFAULT PRIVILEGES so later tables are covered too', () => {
    expect(m2).toMatch(/alter default privileges in schema public\s+grant all on tables to service_role;/)
    expect(m2).toMatch(/alter default privileges in schema public\s+grant all on tables to authenticated;/)
  })

  it('grants sequence and function privileges needed by triggers and defaults', () => {
    expect(m2).toMatch(/grant usage, select on all sequences in schema public to service_role;/)
    expect(m2).toMatch(/grant execute on function public\.set_updated_at\(\)/)
  })

  it('is idempotent, so re-running is safe', () => {
    // GRANT and ALTER DEFAULT PRIVILEGES are both no-ops when already applied.
    expect(m2).not.toMatch(/create (table|policy|function)/i)
  })

  it('verifies service_role can read all eleven tables', () => {
    for (const table of TABLES) {
      expect(m2).toContain(`'${table}'`)
    }
    expect(m2).toMatch(/has_table_privilege\('service_role'/)
  })
})

describe('combined migration set', () => {
  it('never mentions a chocolate-specific table', () => {
    const combined = `${m1}\n${m2}`.toLowerCase()
    for (const term of ['chocolate', 'cocoa', 'conche', 'tempering', 'mould', 'cacao']) {
      expect(combined).not.toContain(term)
    }
  })

  it('keeps every ByteMe table defined in 0001 and none added in 0002', () => {
    const created = [...m2.matchAll(/create table public\.(\w+)/g)].map((m) => m[1])
    expect(created).toEqual([])
  })

  it('applies a least-privilege model: service_role and authenticated only', () => {
    const roles = new Set(
      [...`${m1}\n${m2}`.matchAll(/to\s+(service_role|authenticated|anon)\b/gi)].map(
        (m) => (m[1] as string).toLowerCase(),
      ),
    )
    expect([...roles].sort()).toEqual(['authenticated', 'service_role'])
  })
})
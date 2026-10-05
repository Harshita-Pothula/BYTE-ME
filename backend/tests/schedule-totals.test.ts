/**
 * Verifies schedule totals, including the peak-demand sweep.
 *
 * Peak demand is the largest SUM of concurrently running machine power, not the
 * largest single entry, which is the whole point of scheduling. A naive
 * `max(power_kw)` would report a much lower number for a plan that deliberately
 * runs machines in parallel.
 */

import { describe, expect, it } from 'vitest'
import { computeTotals } from '@/lib/repositories/schedules'
import type { ScheduleEntryRow } from '@/lib/schemas/schedules'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function entry(overrides: Partial<ScheduleEntryRow> = {}): ScheduleEntryRow {
  return {
    id: overrides.id ?? '11111111-1111-4111-8111-111111111111',
    schedule_id: '22222222-2222-4222-8222-222222222222',
    machine_id: '33333333-3333-4333-8333-333333333333',
    process_id: '44444444-4444-4444-8444-444444444444',
    production_order_id: null,
    starts_at: '2026-03-02T09:00:00.000Z',
    ends_at: '2026-03-02T10:00:00.000Z',
    power_kw: 100,
    energy_kwh: 100,
    cost: 10,
    quantity: 50,
    sequence: 0,
    metadata: {},
    created_at: '2026-03-02T08:00:00.000Z',
    updated_at: '2026-03-02T08:00:00.000Z',
    ...overrides,
  }
}

describe('computeTotals', () => {
  it('returns zeroed totals for an empty schedule', () => {
    expect(computeTotals([])).toEqual({
      total_energy_kwh: 0,
      total_energy_cost: 0,
      peak_demand_kw: 0,
      duration_minutes: 0,
    })
  })

  it('sums energy and cost across entries', () => {
    const totals = computeTotals([
      entry({ energy_kwh: 100, cost: 21 }),
      entry({
        id: '55555555-5555-4555-8555-555555555555',
        energy_kwh: 250,
        cost: 54,
      }),
    ])

    expect(totals.total_energy_kwh).toBe(350)
    expect(totals.total_energy_cost).toBe(75)
  })

  it('reports peak demand as the largest concurrent sum, not the largest entry', () => {
    const totals = computeTotals([
      // Two machines overlapping in time.
      entry({
        id: '11111111-1111-4111-8111-111111111111',
        power_kw: 120,
        starts_at: '2026-03-02T09:00:00.000Z',
        ends_at: '2026-03-02T11:00:00.000Z',
      }),
      entry({
        id: '22222222-2222-4222-8222-222222222222',
        power_kw: 200,
        starts_at: '2026-03-02T10:00:00.000Z',
        ends_at: '2026-03-02T12:00:00.000Z',
      }),
    ])

    // 320 kW in the 10:00-11:00 window, not max(120, 200) = 200.
    expect(totals.peak_demand_kw).toBe(320)
  })

  it('does not double-count two entries that touch but do not overlap', () => {
    const totals = computeTotals([
      entry({
        id: '11111111-1111-4111-8111-111111111111',
        power_kw: 150,
        starts_at: '2026-03-02T09:00:00.000Z',
        ends_at: '2026-03-02T10:00:00.000Z',
      }),
      entry({
        id: '22222222-2222-4222-8222-222222222222',
        power_kw: 150,
        starts_at: '2026-03-02T10:00:00.000Z',
        ends_at: '2026-03-02T11:00:00.000Z',
      }),
    ])

    expect(totals.peak_demand_kw).toBe(150)
  })

  it('handles three overlapping machines', () => {
    const totals = computeTotals([
      entry({ id: '11111111-1111-4111-8111-111111111111', power_kw: 100 }),
      entry({ id: '22222222-2222-4222-8222-222222222222', power_kw: 100 }),
      entry({ id: '33333333-3333-4333-8333-333333333333', power_kw: 100 }),
    ])

    expect(totals.peak_demand_kw).toBe(300)
  })

  it('treats a null power reading as zero rather than NaN', () => {
    const totals = computeTotals([entry({ power_kw: null }), entry({ power_kw: 80 })])

    expect(totals.peak_demand_kw).toBe(80)
  })

  it('sums durations in minutes across entries', () => {
    const totals = computeTotals([
      entry({
        starts_at: '2026-03-02T09:00:00.000Z',
        ends_at: '2026-03-02T09:30:00.000Z',
      }),
      entry({
        id: '22222222-2222-4222-8222-222222222222',
        starts_at: '2026-03-02T11:00:00.000Z',
        ends_at: '2026-03-02T11:45:00.000Z',
      }),
    ])

    expect(totals.duration_minutes).toBe(75)
  })
})

/**
 * Guardrail against domain-specific logic leaking into the generic code.
 *
 * The demo factory in supabase/seed.sql is chocolate, but nothing under app/
 * or lib/ may branch on it. If someone later adds chocolate-specific handling
 * to a route or repository, this test fails.
 */
describe('generic-domain guardrail', () => {
  const industryTerms = [
    'chocolate',
    'cocoa',
    'conche',
    'tempering',
    'mould',
    'roasting drum',
    'cacao',
  ]

  it('keeps industry-specific vocabulary out of app/ and lib/', () => {
    const roots = ['app', 'lib']
    const offenders: string[] = []

    for (const root of roots) {
      const walk = (dir: string) => {
        for (const entryName of require('node:fs').readdirSync(dir)) {
          const full = join(dir, entryName)
          const stat = require('node:fs').statSync(full)
          if (stat.isDirectory()) {
            walk(full)
          } else if (/\.(ts|tsx)$/.test(entryName)) {
            const contents = readFileSync(full, 'utf8').toLowerCase()
            for (const term of industryTerms) {
              if (contents.includes(term)) offenders.push(`${full}: ${term}`)
            }
          }
        }
      }
      walk(root)
    }

    expect(offenders).toEqual([])
  })

  it('documents the demo factory only in seed.sql', () => {
    const seed = readFileSync(join('supabase', 'seed.sql'), 'utf8')
    expect(seed.toLowerCase()).toContain('chocolate')

    // The migration must stay industry-neutral too.
    const migration = readFileSync(
      join('supabase', 'migrations', '0001_initial_schema.sql'),
      'utf8',
    )
    for (const term of industryTerms) {
      expect(migration.toLowerCase()).not.toContain(term)
    }
  })
})
import { z } from 'zod'
import {
  jsonObjectSchema,
  numericFromDb,
  paginationSchema,
  slugSchema,
  sortSchema,
  timestamptzSchema,
  uuidSchema,
} from './common'

/* -------------------------------------------------------------------------- */
/* Row                                                                       */
/* -------------------------------------------------------------------------- */

export const factoryRowSchema = z.object({
  id: uuidSchema,
  slug: slugSchema,
  name: z.string(),
  description: z.string().nullable(),
  timezone: z.string(),
  currency: z.string(),
  config: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()),
  is_active: z.boolean(),
  created_at: timestamptzSchema,
  updated_at: timestamptzSchema,
})

export type FactoryRow = z.infer<typeof factoryRowSchema>

/* -------------------------------------------------------------------------- */
/* Create / update                                                            */
/* -------------------------------------------------------------------------- */

export const factoryCreateSchema = z
  .object({
    slug: slugSchema,
    name: z.string().min(1, 'name is required').max(255),
    description: z.string().max(2000).nullish(),
    timezone: z.string().min(1).max(100).default('UTC'),
    currency: z
      .string()
      .min(3)
      .max(3)
      .default('USD')
      .transform((v) => v.toUpperCase()),
    config: jsonObjectSchema.optional(),
    metadata: jsonObjectSchema.optional(),
    is_active: z.boolean().default(true),
  })
  .strict()

export type FactoryCreateInput = z.input<typeof factoryCreateSchema>
export type FactoryCreate = z.output<typeof factoryCreateSchema>

export const factoryUpdateSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(2000).nullable().optional(),
    timezone: z.string().min(1).max(100).optional(),
    currency: z
      .string()
      .length(3)
      .transform((v) => v.toUpperCase())
      .optional(),
    is_active: z.boolean().optional(),
  })
  .strict()

export type FactoryUpdateInput = z.input<typeof factoryUpdateSchema>
export type FactoryUpdate = z.output<typeof factoryUpdateSchema>

/**
 * `config` PATCH. Merge-friendly: keys present in the body are replaced,
 * keys absent from the body are left untouched (see lib/repositories/factories).
 * Set a key to `null` to remove it.
 */
export const factoryConfigUpdateSchema = z
  .object({
    config: z.record(z.string(), z.unknown().nullable()),
  })
  .strict()

export type FactoryConfigUpdateInput = z.input<typeof factoryConfigUpdateSchema>

/** Full replacement of `config`. */
export const factoryConfigReplaceSchema = z
  .object({
    config: z.record(z.string(), z.unknown()),
  })
  .strict()

export type FactoryConfigReplaceInput = z.input<typeof factoryConfigReplaceSchema>

/* -------------------------------------------------------------------------- */
/* List                                                                       */
/* -------------------------------------------------------------------------- */

export const factoryListQuerySchema = z.object({
  ...paginationSchema.shape,
  sort: sortSchema,
  is_active: z
    .enum(['true', 'false', 'any'])
    .default('any')
    .transform((v) => (v === 'any' ? undefined : v === 'true')),
})

export type FactoryListQuery = z.output<typeof factoryListQuerySchema>

/** Aggregate counts used by GET /api/v1/factories/:id/summary. */
export const factorySummarySchema = z.object({
  factory: factoryRowSchema,
  counts: z.object({
    machines: z.number(),
    processes: z.number(),
    process_dependencies: z.number(),
    production_orders: z.number(),
    energy_intervals: z.number(),
    tariffs: z.number(),
    optimization_requests: z.number(),
    optimization_results: z.number(),
    schedules: z.number(),
    schedule_entries: z.number(),
  }),
  energy_window: z.object({
    from: timestamptzSchema.nullable(),
    to: timestamptzSchema.nullable(),
  }),
  /** Deliberately no optimisation output: that must come from the optimizer. */
  optimizer: z.object({
    configured: z.boolean(),
    reason: z.string().nullable(),
  }),
})

export type FactorySummary = z.output<typeof factorySummarySchema>

/** Energy totals derived from `energy_data`. Not an optimisation result. */
export const energyTotalsSchema = z.object({
  consumption_kwh: numericFromDb,
  generation_kwh: numericFromDb,
  net_kwh: numericFromDb,
  intervals: z.number(),
  from: timestamptzSchema.nullable(),
  to: timestamptzSchema.nullable(),
})

export type EnergyTotals = z.output<typeof energyTotalsSchema>
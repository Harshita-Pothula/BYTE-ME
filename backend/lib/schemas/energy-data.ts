import { z } from 'zod'
import {
  jsonObjectSchema,
  numericFromDb,
  numericInput,
  paginationSchema,
  sortSchema,
  timestamptzSchema,
  uuidSchema,
} from './common'

/* -------------------------------------------------------------------------- */
/* Row                                                                       */
/* -------------------------------------------------------------------------- */

export const energyDataRowSchema = z.object({
  id: uuidSchema,
  factory_id: uuidSchema,
  recorded_at: timestamptzSchema,
  interval_minutes: z.number().int(),
  consumption_kwh: numericFromDb,
  generation_kwh: numericFromDb,
  machine_id: uuidSchema.nullable(),
  source: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  created_at: timestamptzSchema,
})

export type EnergyDataRow = z.infer<typeof energyDataRowSchema>

/* -------------------------------------------------------------------------- */
/* Create / update / bulk                                                    */
/* -------------------------------------------------------------------------- */

export const energyDataCreateSchema = z
  .object({
    recorded_at: timestamptzSchema,
    interval_minutes: z.number().int().positive('interval_minutes must be positive').default(15),
    consumption_kwh: numericInput.nonnegative().default(0),
    generation_kwh: numericInput.nonnegative().default(0),
    machine_id: uuidSchema.nullish(),
    source: z.string().min(1).max(60).default('measured'),
    metadata: jsonObjectSchema.optional(),
  })
  .strict()

export type EnergyDataCreateInput = z.input<typeof energyDataCreateSchema>
export type EnergyDataCreate = z.output<typeof energyDataCreateSchema>

export const energyDataUpdateSchema = z
  .object({
    interval_minutes: z.number().int().positive().optional(),
    consumption_kwh: numericInput.nonnegative().optional(),
    generation_kwh: numericInput.nonnegative().optional(),
    source: z.string().min(1).max(60).optional(),
    metadata: jsonObjectSchema.optional(),
  })
  .strict()

export type EnergyDataUpdateInput = z.input<typeof energyDataUpdateSchema>
export type EnergyDataUpdate = z.output<typeof energyDataUpdateSchema>

/**
 * Bulk ingest. `on_conflict` picks the duplicate strategy: `skip` ignores
 * rows whose (factory, machine, recorded_at) already exists, `update`
 * overwrites them.
 */
export const energyDataBulkSchema = z
  .object({
    intervals: z.array(energyDataCreateSchema).min(1, 'at least one interval is required').max(5000),
    on_conflict: z.enum(['skip', 'update']).default('skip'),
  })
  .strict()

export type EnergyDataBulkInput = z.input<typeof energyDataBulkSchema>

/* -------------------------------------------------------------------------- */
/* List                                                                       */
/* -------------------------------------------------------------------------- */

export const energyDataListQuerySchema = z.object({
  ...paginationSchema.shape,
  sort: sortSchema,
  from: timestamptzSchema.optional(),
  to: timestamptzSchema.optional(),
  machine_id: uuidSchema.optional(),
  source: z.string().min(1).max(60).optional(),
  /**
   * How to collapse rows into a coarser resolution. `sum` (default) adds
   * consumption and generation; `avg` averages them.
   */
  resolution: z.enum(['raw', 'hour', 'day']).default('raw'),
})

export type EnergyDataListQuery = z.output<typeof energyDataListQuerySchema>
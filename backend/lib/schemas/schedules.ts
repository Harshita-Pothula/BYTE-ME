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
/* Rows                                                                       */
/* -------------------------------------------------------------------------- */

export const scheduleRowSchema = z.object({
  id: uuidSchema,
  factory_id: uuidSchema,
  name: z.string(),
  version: z.number().int(),
  status: z.enum(['draft', 'published', 'active', 'completed', 'superseded', 'cancelled']),
  horizon_start: timestamptzSchema,
  horizon_end: timestamptzSchema,
  optimization_request_id: uuidSchema.nullable(),
  optimization_result_id: uuidSchema.nullable(),
  total_energy_cost: numericFromDb.nullable(),
  total_energy_kwh: numericFromDb.nullable(),
  peak_demand_kw: numericFromDb.nullable(),
  metadata: z.record(z.string(), z.unknown()),
  created_at: timestamptzSchema,
  updated_at: timestamptzSchema,
})

export type ScheduleRow = z.infer<typeof scheduleRowSchema>

export const scheduleEntryRowSchema = z.object({
  id: uuidSchema,
  schedule_id: uuidSchema,
  machine_id: uuidSchema,
  process_id: uuidSchema,
  production_order_id: uuidSchema.nullable(),
  starts_at: timestamptzSchema,
  ends_at: timestamptzSchema,
  power_kw: numericFromDb.nullable(),
  energy_kwh: numericFromDb.nullable(),
  cost: numericFromDb.nullable(),
  quantity: numericFromDb.nullable(),
  sequence: z.number().int(),
  metadata: z.record(z.string(), z.unknown()),
  created_at: timestamptzSchema,
  updated_at: timestamptzSchema,
})

export type ScheduleEntryRow = z.infer<typeof scheduleEntryRowSchema>

/** A schedule with its entries in chronological order, ready to render. */
export const scheduleWithEntriesSchema = scheduleRowSchema.extend({
  entries: z.array(scheduleEntryRowSchema),
  entry_count: z.number().int(),
  /** Totals recomputed from entries, so a client can verify the stored ones. */
  computed_totals: z.object({
    total_energy_kwh: z.number(),
    total_energy_cost: z.number(),
    peak_demand_kw: z.number(),
    duration_minutes: z.number(),
  }),
})

export type ScheduleWithEntries = z.output<typeof scheduleWithEntriesSchema>

/* -------------------------------------------------------------------------- */
/* Create / update                                                            */
/* -------------------------------------------------------------------------- */

export const scheduleCreateSchema = z
  .object({
    name: z.string().min(1, 'name is required').max(255),
    version: z.number().int().positive().default(1),
    status: z
      .enum(['draft', 'published', 'active', 'completed', 'superseded', 'cancelled'])
      .default('draft'),
    horizon_start: timestamptzSchema,
    horizon_end: timestamptzSchema,
    optimization_request_id: uuidSchema.nullish(),
    optimization_result_id: uuidSchema.nullish(),
    total_energy_cost: numericInput.nonnegative().nullish(),
    total_energy_kwh: numericInput.nonnegative().nullish(),
    peak_demand_kw: numericInput.nonnegative().nullish(),
    metadata: jsonObjectSchema.optional(),
  })
  .strict()
  .refine((value) => new Date(value.horizon_start) < new Date(value.horizon_end), {
    message: 'horizon_end must be after horizon_start',
    path: ['horizon_end'],
  })

export type ScheduleCreateInput = z.input<typeof scheduleCreateSchema>
export type ScheduleCreate = z.output<typeof scheduleCreateSchema>

export const scheduleUpdateSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    version: z.number().int().positive().optional(),
    status: z
      .enum(['draft', 'published', 'active', 'completed', 'superseded', 'cancelled'])
      .optional(),
    horizon_start: timestamptzSchema.optional(),
    horizon_end: timestamptzSchema.optional(),
    optimization_request_id: uuidSchema.nullable().optional(),
    optimization_result_id: uuidSchema.nullable().optional(),
    total_energy_cost: numericInput.nonnegative().nullable().optional(),
    total_energy_kwh: numericInput.nonnegative().nullable().optional(),
    peak_demand_kw: numericInput.nonnegative().nullable().optional(),
    metadata: jsonObjectSchema.optional(),
  })
  .strict()

export type ScheduleUpdateInput = z.input<typeof scheduleUpdateSchema>
export type ScheduleUpdate = z.output<typeof scheduleUpdateSchema>

/* -------------------------------------------------------------------------- */
/* Entries                                                                    */
/* -------------------------------------------------------------------------- */

export const scheduleEntryCreateSchema = z
  .object({
    machine_id: uuidSchema,
    process_id: uuidSchema,
    production_order_id: uuidSchema.nullish(),
    starts_at: timestamptzSchema,
    ends_at: timestamptzSchema,
    power_kw: numericInput.nonnegative().nullish(),
    energy_kwh: numericInput.nonnegative().nullish(),
    cost: numericInput.nonnegative().nullish(),
    quantity: numericInput.nonnegative().nullish(),
    sequence: z.number().int().default(0),
    metadata: jsonObjectSchema.optional(),
  })
  .strict()
  .refine((value) => new Date(value.starts_at) < new Date(value.ends_at), {
    message: 'ends_at must be after starts_at',
    path: ['ends_at'],
  })

export type ScheduleEntryCreateInput = z.input<typeof scheduleEntryCreateSchema>
export type ScheduleEntryCreate = z.output<typeof scheduleEntryCreateSchema>

export const scheduleEntryUpdateSchema = z
  .object({
    production_order_id: uuidSchema.nullable().optional(),
    starts_at: timestamptzSchema.optional(),
    ends_at: timestamptzSchema.optional(),
    power_kw: numericInput.nonnegative().nullable().optional(),
    energy_kwh: numericInput.nonnegative().nullable().optional(),
    cost: numericInput.nonnegative().nullable().optional(),
    quantity: numericInput.nonnegative().nullable().optional(),
    sequence: z.number().int().optional(),
    metadata: jsonObjectSchema.optional(),
  })
  .strict()

export type ScheduleEntryUpdateInput = z.input<typeof scheduleEntryUpdateSchema>
export type ScheduleEntryUpdate = z.output<typeof scheduleEntryUpdateSchema>

/**
 * Schedule columns a caller may set in the same transaction as its entries.
 *
 * Optional and additive: a body without `schedule` behaves exactly as before,
 * so this is not a breaking change to the endpoint's contract. It exists
 * because status/metadata updates must commit together with the entries they
 * describe — a caller that PUTs new entries and then PATCHes the status to
 * `published` has a window where the entries are live but the schedule still
 * says `draft`, and a crash in that window leaves the two disagreeing forever.
 */
const scheduleEntryBulkPatchSchema = z
  .object({
    status: scheduleUpdateSchema.shape.status,
    total_energy_cost: scheduleUpdateSchema.shape.total_energy_cost,
    total_energy_kwh: scheduleUpdateSchema.shape.total_energy_kwh,
    peak_demand_kw: scheduleUpdateSchema.shape.peak_demand_kw,
    metadata: scheduleUpdateSchema.shape.metadata,
  })
  .strict()

export const scheduleEntryBulkSchema = z
  .object({
    entries: z.array(scheduleEntryCreateSchema).min(1).max(5000),
    schedule: scheduleEntryBulkPatchSchema.optional(),
  })
  .strict()

export type ScheduleEntryBulkInput = z.input<typeof scheduleEntryBulkSchema>

/* -------------------------------------------------------------------------- */
/* List                                                                       */
/* -------------------------------------------------------------------------- */

export const scheduleListQuerySchema = z.object({
  ...paginationSchema.shape,
  sort: sortSchema,
  status: z
    .enum(['draft', 'published', 'active', 'completed', 'superseded', 'cancelled'])
    .optional(),
  /** Schedules whose horizon overlaps this instant or window. */
  active_at: timestamptzSchema.optional(),
})

export type ScheduleListQuery = z.output<typeof scheduleListQuerySchema>

export const scheduleEntryListQuerySchema = z.object({
  ...paginationSchema.shape,
  sort: sortSchema,
  machine_id: uuidSchema.optional(),
  process_id: uuidSchema.optional(),
  production_order_id: uuidSchema.optional(),
  from: timestamptzSchema.optional(),
  to: timestamptzSchema.optional(),
})

export type ScheduleEntryListQuery = z.output<typeof scheduleEntryListQuerySchema>
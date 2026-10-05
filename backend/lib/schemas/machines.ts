import { z } from 'zod'
import {
  jsonObjectSchema,
  numericFromDb,
  numericInput,
  paginationSchema,
  slugSchema,
  sortSchema,
  timestamptzSchema,
  uuidSchema,
} from './common'

/* -------------------------------------------------------------------------- */
/* Availability calendar                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Weekly availability window. Shape is a convention shared with the optimizer
 * adapter and is deliberately generic: `day` is ISO weekday (1 = Monday),
 * `start`/`end` are local `HH:MM`.
 */
export const availabilityWindowSchema = z.object({
  day: z.number().int().min(1).max(7),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:MM'),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:MM'),
})

export const availabilitySchema = z
  .object({
    weekly: z.array(availabilityWindowSchema).default([]),
    exceptions: z
      .array(
        z.object({
          from: z.string().min(4).max(40),
          to: z.string().min(4).max(40).optional(),
          available: z.boolean().default(false),
          reason: z.string().max(500).optional(),
        }),
      )
      .default([]),
  })
  .strict()
  .default({})

export type Availability = z.output<typeof availabilitySchema>

/* -------------------------------------------------------------------------- */
/* Row                                                                       */
/* -------------------------------------------------------------------------- */

export const machineRowSchema = z.object({
  id: uuidSchema,
  factory_id: uuidSchema,
  slug: slugSchema,
  name: z.string(),
  type: z.string().nullable(),
  rated_power_kw: numericFromDb.nullable(),
  min_power_kw: numericFromDb.nullable(),
  max_power_kw: numericFromDb.nullable(),
  min_runtime_minutes: numericFromDb.nullable(),
  max_runtime_minutes: numericFromDb.nullable(),
  availability: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()),
  is_active: z.boolean(),
  created_at: timestamptzSchema,
  updated_at: timestamptzSchema,
})

export type MachineRow = z.infer<typeof machineRowSchema>

/* -------------------------------------------------------------------------- */
/* Create / update                                                            */
/* -------------------------------------------------------------------------- */

export const machineCreateSchema = z
  .object({
    slug: slugSchema,
    name: z.string().min(1, 'name is required').max(255),
    type: z.string().min(1).max(100).nullish(),
    rated_power_kw: numericInput.nonnegative().nullish(),
    min_power_kw: numericInput.nonnegative().nullish(),
    max_power_kw: numericInput.nonnegative().nullish(),
    min_runtime_minutes: numericInput.nonnegative().nullish(),
    max_runtime_minutes: numericInput.nonnegative().nullish(),
    availability: availabilitySchema.optional(),
    metadata: jsonObjectSchema.optional(),
    is_active: z.boolean().default(true),
  })
  .strict()
  .superRefine((value, ctx) => {
    // Mirrors the SQL CHECK constraints so the client gets a precise message
    // instead of a generic constraint violation.
    const { min_power_kw: minP, rated_power_kw: rated, max_power_kw: maxP } = value

    if (minP != null && rated != null && minP > rated) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['min_power_kw'],
        message: 'min_power_kw must not exceed rated_power_kw',
      })
    }
    if (rated != null && maxP != null && rated > maxP) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rated_power_kw'],
        message: 'rated_power_kw must not exceed max_power_kw',
      })
    }
    if (minP != null && maxP != null && minP > maxP) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['max_power_kw'],
        message: 'max_power_kw must not be less than min_power_kw',
      })
    }
    if (
      value.min_runtime_minutes != null &&
      value.max_runtime_minutes != null &&
      value.min_runtime_minutes > value.max_runtime_minutes
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['max_runtime_minutes'],
        message: 'max_runtime_minutes must not be less than min_runtime_minutes',
      })
    }
  })

export type MachineCreateInput = z.input<typeof machineCreateSchema>
export type MachineCreate = z.output<typeof machineCreateSchema>

export const machineUpdateSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    type: z.string().min(1).max(100).nullable().optional(),
    rated_power_kw: numericInput.nonnegative().nullable().optional(),
    min_power_kw: numericInput.nonnegative().nullable().optional(),
    max_power_kw: numericInput.nonnegative().nullable().optional(),
    min_runtime_minutes: numericInput.nonnegative().nullable().optional(),
    max_runtime_minutes: numericInput.nonnegative().nullable().optional(),
    availability: availabilitySchema.optional(),
    metadata: jsonObjectSchema.optional(),
    is_active: z.boolean().optional(),
  })
  .strict()

export type MachineUpdateInput = z.input<typeof machineUpdateSchema>
export type MachineUpdate = z.output<typeof machineUpdateSchema>

/* -------------------------------------------------------------------------- */
/* List                                                                       */
/* -------------------------------------------------------------------------- */

export const machineListQuerySchema = z.object({
  ...paginationSchema.shape,
  sort: sortSchema,
  type: z.string().min(1).max(100).optional(),
  is_active: z
    .enum(['true', 'false', 'any'])
    .default('any')
    .transform((v) => (v === 'any' ? undefined : v === 'true')),
})

export type MachineListQuery = z.output<typeof machineListQuerySchema>
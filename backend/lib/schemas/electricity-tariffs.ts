import { z } from 'zod'
import {
  jsonObjectSchema,
  numericFromDb,
  numericInput,
  paginationSchema,
  sortSchema,
  timeSchema,
  timestamptzSchema,
  uuidSchema,
} from './common'

/* -------------------------------------------------------------------------- */
/* Row                                                                       */
/* -------------------------------------------------------------------------- */

export const electricityTariffRowSchema = z.object({
  id: uuidSchema,
  factory_id: uuidSchema,
  slug: z.string(),
  name: z.string(),
  currency: z.string(),
  start_time: timeSchema,
  end_time: timeSchema,
  days_of_week: z.array(z.number().int().min(1).max(7)).nullable(),
  energy_price_per_kwh: numericFromDb,
  demand_charge_per_kw: numericFromDb.nullable(),
  fixed_charge: numericFromDb.nullable(),
  tax_rate: numericFromDb.nullable(),
  effective_from: timestamptzSchema.nullable(),
  effective_to: timestamptzSchema.nullable(),
  priority: z.number().int(),
  metadata: z.record(z.string(), z.unknown()),
  created_at: timestamptzSchema,
  updated_at: timestamptzSchema,
})

export type ElectricityTariffRow = z.infer<typeof electricityTariffRowSchema>

/* -------------------------------------------------------------------------- */
/* Create / update                                                            */
/* -------------------------------------------------------------------------- */

const tariffFields = z.object({
  slug: z
    .string()
    .min(2)
    .max(63)
    .regex(/^[a-z0-9][a-z0-9_-]*$/, 'slug may only contain lowercase letters, digits, - and _'),
  name: z.string().min(1, 'name is required').max(255),
  currency: z
    .string()
    .length(3)
    .default('USD')
    .transform((v) => v.toUpperCase()),
  start_time: timeSchema.default('00:00'),
  end_time: timeSchema.default('23:59'),
  /** ISO weekdays, 1 = Monday. Omit or null for "every day". */
  days_of_week: z.array(z.number().int().min(1).max(7)).max(7).nullish(),
  energy_price_per_kwh: numericInput.nonnegative('energy_price_per_kwh cannot be negative'),
  demand_charge_per_kw: numericInput.nonnegative().nullish(),
  fixed_charge: numericInput.nonnegative().nullish(),
  /** Fractional rate: 0.21 means 21%. */
  tax_rate: numericInput.min(0).max(1).nullish(),
  effective_from: timestamptzSchema.nullish(),
  effective_to: timestamptzSchema.nullish(),
  priority: z.number().int().default(0),
  metadata: jsonObjectSchema.optional(),
})

export const electricityTariffCreateSchema = tariffFields.strict().superRefine((value, ctx) => {
  if (value.days_of_week) {
    const unique = new Set(value.days_of_week)
    if (unique.size !== value.days_of_week.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['days_of_week'],
        message: 'days_of_week must not contain duplicates',
      })
    }
  }
  if (
    value.effective_from &&
    value.effective_to &&
    new Date(value.effective_from) >= new Date(value.effective_to)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['effective_to'],
      message: 'effective_to must be after effective_from',
    })
  }
})

export type ElectricityTariffCreateInput = z.input<typeof electricityTariffCreateSchema>
export type ElectricityTariffCreate = z.output<typeof electricityTariffCreateSchema>

export const electricityTariffUpdateSchema = tariffFields.partial().strict()

export type ElectricityTariffUpdateInput = z.input<typeof electricityTariffUpdateSchema>
export type ElectricityTariffUpdate = z.output<typeof electricityTariffUpdateSchema>

/* -------------------------------------------------------------------------- */
/* List                                                                       */
/* -------------------------------------------------------------------------- */

export const electricityTariffListQuerySchema = z.object({
  ...paginationSchema.shape,
  sort: sortSchema,
  active_at: timestamptzSchema.optional(),
})

export type ElectricityTariffListQuery = z.output<typeof electricityTariffListQuerySchema>
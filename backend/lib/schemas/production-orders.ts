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

export const productionOrderRowSchema = z.object({
  id: uuidSchema,
  factory_id: uuidSchema,
  reference: z.string(),
  product: z.string().nullable(),
  quantity: numericFromDb,
  unit: z.string().nullable(),
  due_at: timestamptzSchema.nullable(),
  priority: z.number().int(),
  status: z.enum(['planned', 'released', 'in_progress', 'completed', 'cancelled', 'on_hold']),
  requirements: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()),
  created_at: timestamptzSchema,
  updated_at: timestamptzSchema,
})

export type ProductionOrderRow = z.infer<typeof productionOrderRowSchema>

/* -------------------------------------------------------------------------- */
/* Create / update                                                            */
/* -------------------------------------------------------------------------- */

export const productionOrderCreateSchema = z
  .object({
    reference: z.string().min(1, 'reference is required').max(120),
    product: z.string().max(255).nullish(),
    quantity: numericInput.positive('quantity must be greater than zero'),
    unit: z.string().max(50).nullish(),
    due_at: timestamptzSchema.nullish(),
    priority: z.number().int().min(-100).max(100).default(0),
    status: z
      .enum(['planned', 'released', 'in_progress', 'completed', 'cancelled', 'on_hold'])
      .default('planned'),
    requirements: jsonObjectSchema.optional(),
    metadata: jsonObjectSchema.optional(),
  })
  .strict()

export type ProductionOrderCreateInput = z.input<typeof productionOrderCreateSchema>
export type ProductionOrderCreate = z.output<typeof productionOrderCreateSchema>

export const productionOrderUpdateSchema = z
  .object({
    reference: z.string().min(1).max(120).optional(),
    product: z.string().max(255).nullable().optional(),
    quantity: numericInput.positive().optional(),
    unit: z.string().max(50).nullable().optional(),
    due_at: timestamptzSchema.nullable().optional(),
    priority: z.number().int().min(-100).max(100).optional(),
    status: z
      .enum(['planned', 'released', 'in_progress', 'completed', 'cancelled', 'on_hold'])
      .optional(),
    requirements: jsonObjectSchema.optional(),
    metadata: jsonObjectSchema.optional(),
  })
  .strict()

export type ProductionOrderUpdateInput = z.input<typeof productionOrderUpdateSchema>
export type ProductionOrderUpdate = z.output<typeof productionOrderUpdateSchema>

/* -------------------------------------------------------------------------- */
/* List                                                                       */
/* -------------------------------------------------------------------------- */

export const productionOrderListQuerySchema = z.object({
  ...paginationSchema.shape,
  sort: sortSchema,
  status: z
    .enum(['planned', 'released', 'in_progress', 'completed', 'cancelled', 'on_hold'])
    .optional(),
  due_before: timestamptzSchema.optional(),
  due_after: timestamptzSchema.optional(),
})

export type ProductionOrderListQuery = z.output<typeof productionOrderListQuerySchema>
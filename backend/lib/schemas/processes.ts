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
/* Rows                                                                       */
/* -------------------------------------------------------------------------- */

export const processRowSchema = z.object({
  id: uuidSchema,
  factory_id: uuidSchema,
  slug: slugSchema,
  name: z.string(),
  description: z.string().nullable(),
  duration_minutes: numericFromDb.nullable(),
  machine_id: uuidSchema,
  power_requirement_kw: numericFromDb.nullable(),
  production_quantity: numericFromDb.nullable(),
  unit: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  is_active: z.boolean(),
  created_at: timestamptzSchema,
  updated_at: timestamptzSchema,
})

export type ProcessRow = z.infer<typeof processRowSchema>

export const processDependencyRowSchema = z.object({
  id: uuidSchema,
  factory_id: uuidSchema,
  process_id: uuidSchema,
  depends_on_process_id: uuidSchema,
  dependency_type: z.enum([
    'finish_to_start',
    'start_to_start',
    'finish_to_finish',
    'start_to_finish',
  ]),
  lag_minutes: numericFromDb,
  metadata: z.record(z.string(), z.unknown()),
  created_at: timestamptzSchema,
  updated_at: timestamptzSchema,
})

export type ProcessDependencyRow = z.infer<typeof processDependencyRowSchema>

/** A process plus the dependency edges expressed with slugs, for readability. */
export const processWithDependenciesSchema = processRowSchema.extend({
  depends_on: z.array(
    z.object({
      id: uuidSchema,
      slug: slugSchema,
      name: z.string(),
      dependency_type: z.string(),
      lag_minutes: z.number(),
    }),
  ),
  blocks: z.array(
    z.object({
      id: uuidSchema,
      slug: slugSchema,
      name: z.string(),
    }),
  ),
})

export type ProcessWithDependencies = z.output<typeof processWithDependenciesSchema>

/* -------------------------------------------------------------------------- */
/* Create / update                                                            */
/* -------------------------------------------------------------------------- */

export const processCreateSchema = z
  .object({
    slug: slugSchema,
    name: z.string().min(1, 'name is required').max(255),
    description: z.string().max(2000).nullish(),
    duration_minutes: numericInput.nonnegative().nullish(),
    machine_id: uuidSchema,
    power_requirement_kw: numericInput.nonnegative().nullish(),
    production_quantity: numericInput.nonnegative().nullish(),
    unit: z.string().max(50).nullish(),
    metadata: jsonObjectSchema.optional(),
    is_active: z.boolean().default(true),
  })
  .strict()

export type ProcessCreateInput = z.input<typeof processCreateSchema>
export type ProcessCreate = z.output<typeof processCreateSchema>

export const processUpdateSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(2000).nullable().optional(),
    duration_minutes: numericInput.nonnegative().nullable().optional(),
    machine_id: uuidSchema.optional(),
    power_requirement_kw: numericInput.nonnegative().nullable().optional(),
    production_quantity: numericInput.nonnegative().nullable().optional(),
    unit: z.string().max(50).nullable().optional(),
    metadata: jsonObjectSchema.optional(),
    is_active: z.boolean().optional(),
  })
  .strict()

export type ProcessUpdateInput = z.input<typeof processUpdateSchema>
export type ProcessUpdate = z.output<typeof processUpdateSchema>

/* -------------------------------------------------------------------------- */
/* Dependencies                                                               */
/* -------------------------------------------------------------------------- */

export const dependencyTypeSchema = z.enum([
  'finish_to_start',
  'start_to_start',
  'finish_to_finish',
  'start_to_finish',
])

export type DependencyType = z.infer<typeof dependencyTypeSchema>

export const processDependencyCreateSchema = z
  .object({
    process_id: uuidSchema,
    depends_on_process_id: uuidSchema,
    dependency_type: dependencyTypeSchema.default('finish_to_start'),
    lag_minutes: numericInput.nonnegative().default(0),
    metadata: jsonObjectSchema.optional(),
  })
  .strict()
  .refine((value) => value.process_id !== value.depends_on_process_id, {
    message: 'a process cannot depend on itself',
    path: ['depends_on_process_id'],
  })

export type ProcessDependencyCreateInput = z.input<typeof processDependencyCreateSchema>
export type ProcessDependencyCreate = z.output<typeof processDependencyCreateSchema>

export const processDependencyUpdateSchema = z
  .object({
    dependency_type: dependencyTypeSchema.optional(),
    lag_minutes: numericInput.nonnegative().optional(),
    metadata: jsonObjectSchema.optional(),
  })
  .strict()

export type ProcessDependencyUpdateInput = z.input<typeof processDependencyUpdateSchema>
export type ProcessDependencyUpdate = z.output<typeof processDependencyUpdateSchema>

/** One dependency edge without its `process_id`, for bulk import. */
const dependencyEdgeShape = z.object({
  depends_on_process_id: uuidSchema,
  dependency_type: dependencyTypeSchema.default('finish_to_start'),
  lag_minutes: numericInput.nonnegative().default(0),
  metadata: jsonObjectSchema.optional(),
})

/**
 * Bulk edge import: every edge shares one `process_id` and lists the upstream
 * processes it must follow.
 */
export const processDependencyBulkSchema = z
  .object({
    dependencies: z.array(dependencyEdgeShape).max(500),
    process_id: uuidSchema,
  })
  .strict()

export type ProcessDependencyBulkInput = z.input<typeof processDependencyBulkSchema>

/* -------------------------------------------------------------------------- */
/* List                                                                       */
/* -------------------------------------------------------------------------- */

export const processListQuerySchema = z.object({
  ...paginationSchema.shape,
  sort: sortSchema,
  machine_id: uuidSchema.optional(),
  is_active: z
    .enum(['true', 'false', 'any'])
    .default('any')
    .transform((v) => (v === 'any' ? undefined : v === 'true')),
  /** When true, each row includes resolved `depends_on` / `blocks`. */
  include_dependencies: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
})

export type ProcessListQuery = z.output<typeof processListQuerySchema>

export const processDependencyListQuerySchema = z.object({
  ...paginationSchema.shape,
  sort: sortSchema,
  process_id: uuidSchema.optional(),
  depends_on_process_id: uuidSchema.optional(),
})

export type ProcessDependencyListQuery = z.output<typeof processDependencyListQuerySchema>
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

export const optimizationRequestRowSchema = z.object({
  id: uuidSchema,
  factory_id: uuidSchema,
  reference: z.string(),
  status: z.enum([
    'pending',
    'queued',
    'running',
    'succeeded',
    'failed',
    'cancelled',
    'not_configured',
  ]),
  horizon_start: timestamptzSchema.nullable(),
  horizon_end: timestamptzSchema.nullable(),
  objective: z.record(z.string(), z.unknown()),
  constraints: z.record(z.string(), z.unknown()),
  request_payload: z.unknown().nullable(),
  adapter_metadata: z.record(z.string(), z.unknown()).nullable(),
  error_message: z.string().nullable(),
  created_by: z.string().nullable(),
  created_at: timestamptzSchema,
  updated_at: timestamptzSchema,
})

export type OptimizationRequestRow = z.infer<typeof optimizationRequestRowSchema>

export const optimizationResultRowSchema = z.object({
  id: uuidSchema,
  factory_id: uuidSchema,
  optimization_request_id: uuidSchema.nullable(),
  status: z.enum(['succeeded', 'failed', 'partial']),
  objective_value: numericFromDb.nullable(),
  total_energy_cost: numericFromDb.nullable(),
  total_energy_kwh: numericFromDb.nullable(),
  peak_demand_kw: numericFromDb.nullable(),
  solution: z.unknown().nullable(),
  metrics: z.record(z.string(), z.unknown()),
  created_at: timestamptzSchema,
  updated_at: timestamptzSchema,
})

export type OptimizationResultRow = z.infer<typeof optimizationResultRowSchema>

/* -------------------------------------------------------------------------- */
/* Requests                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Creates an optimization request.
 *
 * `dry_run: true` builds the full optimizer payload from the database and
 * returns it WITHOUT calling the optimizer. That is how you inspect and
 * validate the payload while the Python contract is still being agreed, and it
 * works even when the optimizer is unconfigured.
 */
export const optimizationRequestCreateSchema = z
  .object({
    /** Optional caller-supplied correlation id; generated when omitted. */
    reference: z.string().min(1).max(120).optional(),
    /** Scheduling window. Defaults to the window covered by energy_data. */
    horizon_start: timestamptzSchema.optional(),
    horizon_end: timestamptzSchema.optional(),
    /**
     * Objective weights, e.g. `{ "cost": 1.0, "peak_demand": 0.3 }`.
     * Keys are passed through to the adapter untouched.
     */
    objective: jsonObjectSchema.optional(),
    /**
     * Scheduling constraints, e.g. `{ "max_parallel_machines": 4 }`.
     * Merged over the factory's `config.scheduling`.
     */
    constraints: jsonObjectSchema.optional(),
    created_by: z.string().max(200).nullish(),
    /**
     * Build and return the payload without contacting the optimizer.
     * Defaults to true when the optimizer is not configured, so callers
     * always get something actionable instead of an opaque failure.
     */
    dry_run: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.horizon_start && value.horizon_end) {
      if (new Date(value.horizon_start) >= new Date(value.horizon_end)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['horizon_end'],
          message: 'horizon_end must be after horizon_start',
        })
      }
    }
  })

export type OptimizationRequestCreateInput = z.input<typeof optimizationRequestCreateSchema>
export type OptimizationRequestCreate = z.output<typeof optimizationRequestCreateSchema>

export const optimizationRequestUpdateSchema = z
  .object({
    status: z
      .enum(['pending', 'queued', 'running', 'succeeded', 'failed', 'cancelled', 'not_configured'])
      .optional(),
    error_message: z.string().max(4000).nullable().optional(),
    /** Adapter bookkeeping. Left as plain `unknown` values, unlike the
     *  `jsonObjectSchema` helper, because the adapter owns this document. */
    adapter_metadata: z.record(z.string(), z.unknown()).nullish(),
  })
  .strict()

export type OptimizationRequestUpdateInput = z.input<typeof optimizationRequestUpdateSchema>
export type OptimizationRequestUpdate = z.output<typeof optimizationRequestUpdateSchema>

/* -------------------------------------------------------------------------- */
/* Results                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Records an optimizer result.
 *
 * In the intended flow this row is written BY the adapter after a successful
 * solve. The endpoint also accepts a POST from a teammate's harness that runs
 * the Python optimizer out-of-band, which is useful before the HTTP contract
 * is settled. It stores whatever `solution` is supplied; it never synthesises
 * one.
 */
export const optimizationResultCreateSchema = z
  .object({
    optimization_request_id: uuidSchema.nullish(),
    status: z.enum(['succeeded', 'failed', 'partial']).default('succeeded'),
    objective_value: numericInput.nullish(),
    total_energy_cost: numericInput.nonnegative().nullish(),
    total_energy_kwh: numericInput.nonnegative().nullish(),
    peak_demand_kw: numericInput.nonnegative().nullish(),
    solution: z.unknown().nullish(),
    /** Solver statistics. Adapter-owned, so values stay `unknown`. */
    metrics: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()

export type OptimizationResultCreateInput = z.input<typeof optimizationResultCreateSchema>
export type OptimizationResultCreate = z.output<typeof optimizationResultCreateSchema>

export const optimizationResultUpdateSchema = z
  .object({
    status: z.enum(['succeeded', 'failed', 'partial']).optional(),
    objective_value: numericInput.nullable().optional(),
    total_energy_cost: numericInput.nonnegative().nullable().optional(),
    total_energy_kwh: numericInput.nonnegative().nullable().optional(),
    peak_demand_kw: numericInput.nonnegative().nullable().optional(),
    solution: z.unknown().nullable().optional(),
    metrics: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()

export type OptimizationResultUpdateInput = z.input<typeof optimizationResultUpdateSchema>
export type OptimizationResultUpdate = z.output<typeof optimizationResultUpdateSchema>

/* -------------------------------------------------------------------------- */
/* List                                                                       */
/* -------------------------------------------------------------------------- */

export const optimizationRequestListQuerySchema = z.object({
  ...paginationSchema.shape,
  sort: sortSchema,
  status: z
    .enum(['pending', 'queued', 'running', 'succeeded', 'failed', 'cancelled', 'not_configured'])
    .optional(),
})

export type OptimizationRequestListQuery = z.output<typeof optimizationRequestListQuerySchema>

export const optimizationResultListQuerySchema = z.object({
  ...paginationSchema.shape,
  sort: sortSchema,
  status: z.enum(['succeeded', 'failed', 'partial']).optional(),
  optimization_request_id: uuidSchema.optional(),
})

export type OptimizationResultListQuery = z.output<typeof optimizationResultListQuerySchema>
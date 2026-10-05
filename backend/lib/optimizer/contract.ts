/**
 * ByteMe <-> optimizer contract.
 *
 * ------------------------------------------------------------------------
 * READ THIS BEFORE EDITING ANYTHING IN THIS DIRECTORY
 * ------------------------------------------------------------------------
 *
 * The optimizer is a separate Python + OR-Tools service written by another
 * person. Its endpoint, HTTP method, request body, response body, auth scheme
 * and URL are NOT yet agreed, and this file deliberately does not guess them.
 *
 * What lives here is only ByteMe's OWN side of the boundary:
 *
 *   - `OptimizationProblem`  what ByteMe knows how to describe, and
 *   - `OptimizationSolution`  the minimum shape ByteMe is willing to store.
 *
 * `lib/optimizer/payload.ts` turns database rows into an `OptimizationProblem`.
 * `lib/optimizer/client.ts` transmits it through an `OptimizerTransport` and
 * validates the reply into an `OptimizationSolution`.
 *
 * Once your teammate confirms the Python interface, the ONLY files that need
 * to change are `client.ts` (URL, method, headers) and, if the response shape
 * differs from `OptimizationSolution`, the decoder in `client.ts`. The
 * routes, repositories and schema stay exactly as they are.
 */

/* -------------------------------------------------------------------------- */
/* Problem: what ByteMe sends                                                 */
/* -------------------------------------------------------------------------- */

export interface ProblemMachine {
  id: string
  slug: string
  name: string
  /** Free-text machine class, e.g. 'furnace'. Never an enum. */
  type: string | null
  ratedPowerKw: number | null
  minPowerKw: number | null
  maxPowerKw: number | null
  minRuntimeMinutes: number | null
  maxRuntimeMinutes: number | null
  /** Weekly calendar as stored, plus the raw availability object. */
  availability: Record<string, unknown>
  metadata: Record<string, unknown>
}

export interface ProblemProcess {
  id: string
  slug: string
  name: string
  description: string | null
  durationMinutes: number | null
  /** The machine this process runs on. */
  machineId: string
  powerRequirementKw: number | null
  productionQuantity: number | null
  unit: string | null
  metadata: Record<string, unknown>
}

export interface ProblemDependency {
  processId: string
  dependsOnProcessId: string
  dependencyType: string
  lagMinutes: number
}

export interface ProblemProductionOrder {
  id: string
  reference: string
  product: string | null
  quantity: number
  unit: string | null
  dueAt: string | null
  priority: number
  status: string
  requirements: Record<string, unknown>
}

export interface ProblemEnergyInterval {
  recordedAt: string
  intervalMinutes: number
  consumptionKwh: number
  generationKwh: number
  /** Null for site-level series. */
  machineId: string | null
}

export interface ProblemTariff {
  id: string
  slug: string
  name: string
  currency: string
  startTime: string
  endTime: string
  /** ISO weekdays, 1 = Monday. Null means every day. */
  daysOfWeek: number[] | null
  energyPricePerKwh: number
  demandChargePerKw: number | null
  fixedCharge: number | null
  taxRate: number | null
  effectiveFrom: string | null
  effectiveTo: string | null
  priority: number
}

/**
 * The complete, factory-agnostic description of one scheduling problem.
 *
 * `constraints` carries the scheduling limits merged from the factory `config`
 * and the caller. Keys are passed through to the optimizer untouched, so the
 * optimizer team decides what they mean.
 */
export interface OptimizationProblem {
  /** Schema version of this document. Bump when the shape changes. */
  schemaVersion: string
  /** ByteMe's correlation id, also stored as optimization_requests.reference. */
  requestReference: string
  factoryId: string

  factory: {
    slug: string
    name: string
    timezone: string
    currency: string
    /** Raw factory `config`, verbatim. */
    config: Record<string, unknown>
    metadata: Record<string, unknown>
  }

  horizon: {
    start: string | null
    end: string | null
  }

  machines: ProblemMachine[]
  processes: ProblemProcess[]
  dependencies: ProblemDependency[]
  productionOrders: ProblemProductionOrder[]
  energyData: ProblemEnergyInterval[]
  tariffs: ProblemTariff[]

  /** Objective weights, e.g. { cost: 1, peakDemand: 0.3 }. */
  objective: Record<string, unknown>
  /** Scheduling constraints, e.g. { maxParallelMachines: 4 }. */
  constraints: Record<string, unknown>
}

/* -------------------------------------------------------------------------- */
/* Solution: what ByteMe is willing to store                                  */
/* -------------------------------------------------------------------------- */

export interface SolutionEntry {
  machineId: string
  processId: string
  productionOrderId: string | null
  startsAt: string
  endsAt: string
  powerKw: number | null
  energyKwh: number | null
  cost: number | null
  quantity: number | null
  sequence: number
  metadata: Record<string, unknown>
}

export interface OptimizationSolution {
  /** Optimizer-reported objective value. Null when not reported. */
  objectiveValue: number | null
  totalEnergyCost: number | null
  totalEnergyKwh: number | null
  peakDemandKw: number | null
  entries: SolutionEntry[]
  /** Solver statistics: runtime, iterations, gap, solver name, ... */
  metrics: Record<string, unknown>
  /**
   * The optimizer's raw response, stored verbatim in
   * optimization_results.solution. Nothing in ByteMe reads its shape.
   */
  raw: unknown
}

/* -------------------------------------------------------------------------- */
/* Transport: the seam ByteMe calls                                           */
/* -------------------------------------------------------------------------- */

/**
 * How ByteMe reaches the optimizer.
 *
 * Two implementations are meaningful:
 *   - `HttpOptimizerTransport` in client.ts, used once the real endpoint is
 *     configured via environment variables.
 *   - a stub that throws `ServiceUnavailableError`, used until then.
 *
 * A transport that cannot reach a configured optimizer MUST throw rather than
 * return a plausible-looking solution.
 */
export interface OptimizerTransport {
  /** Human-readable identity, recorded in optimization_requests.adapter_metadata. */
  readonly name: string

  /**
   * True only when a real endpoint has been configured. When false every
   * solve attempt answers 503 and no schedule is ever fabricated.
   */
  readonly isConfigured: boolean

  /**
   * Submits a problem and returns the decoded solution.
   *
   * @throws ServiceUnavailableError when not configured.
   * @throws UpstreamError when the optimizer is unreachable or replies with
   *         something that cannot be decoded into an OptimizationSolution.
   */
  solve(problem: OptimizationProblem, signal?: AbortSignal): Promise<OptimizationSolution>
}

/* -------------------------------------------------------------------------- */
/* Summary of what is deliberately NOT specified                               */
/* -------------------------------------------------------------------------- */

/**
 * Open questions for the optimizer team. ByteMe makes no default assumption
 * about any of them; they are configuration, not code.
 *
 *  1. Endpoint path and HTTP method for submitting a problem.
 *  2. Whether the problem is sent as the `OptimizationProblem` document above,
 *     or translated into a Python-specific schema (and what that schema is).
 *  3. Response body shape, and how scheduled intervals are expressed.
 *  4. Whether the solve is synchronous or returns a job id to poll.
 *  5. Authentication: none, static bearer token, mTLS, or something else.
 *  6. Concurrency limits and maximum problem size.
 *  7. Idempotency: how to safely retry a submission.
 *  8. Units: ByteMe sends kW, kWh, minutes and ISO-8601 UTC timestamps.
 *     Confirm the optimizer expects the same, or agree a conversion here.
 */
export const OPEN_OPTIMIZER_QUESTIONS: readonly string[] = [
  'Endpoint path and HTTP method for submitting a problem',
  'Whether to consume OptimizationProblem directly or a Python-specific schema',
  'Response body shape, including how scheduled intervals are expressed',
  'Synchronous solve versus submit-and-poll job id',
  'Authentication scheme (none, bearer token, mTLS, other)',
  'Concurrency limits and maximum problem size',
  'Idempotency and retry semantics',
  'Unit agreement (kW, kWh, minutes, ISO-8601 UTC)',
]

/** Version of the problem/solution document. Bump on breaking changes. */
export const OPTIMIZATION_SCHEMA_VERSION = '1.0.0'
import { createContext } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { Factory } from '../data/types'

export interface FactoryContextValue {
  factory: Factory
  factories: Factory[]
  setFactoryId: Dispatch<SetStateAction<string>>
  addFactory: (factory: Factory) => void
  loading: boolean
  error: string | null
  reloadFactories: () => Promise<void>
  runOptimization: () => Promise<void>
  optimizing: boolean
  optimizationError: string | null
}

export const FactoryContext = createContext<FactoryContextValue | null>(null)

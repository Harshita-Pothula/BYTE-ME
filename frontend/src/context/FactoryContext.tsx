import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import factories from '../data/factories'
import {
  getFactories,
  getFactory,
  runOptimization as requestOptimization,
} from '../data/api'
import type { Factory } from '../data/types'
import { FactoryContext } from './FactoryContextState'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export function FactoryProvider({ children }: { children: ReactNode }) {
  const [factoryId, setFactoryId] = useState('choc')
  const [apiFactories, setApiFactories] = useState<Factory[]>(
    USE_MOCK ? factories : [],
  )
  const [customFactories, setCustomFactories] = useState<Factory[]>([])
  const [loading, setLoading] = useState(!USE_MOCK)
  const [error, setError] = useState<string | null>(null)
  const [optimizing, setOptimizing] = useState(false)
  const [optimizationError, setOptimizationError] = useState<string | null>(null)
  const allFactories = useMemo(
    () => [...apiFactories, ...customFactories],
    [apiFactories, customFactories],
  )
  const factory =
    allFactories.find((item) => item.id === factoryId) ??
    allFactories[0] ??
    factories[0]

  const loadFactories = useCallback(
    () =>
      getFactories()
        .then((loadedFactories) => {
          setApiFactories(loadedFactories)
          setError(null)
        })
        .catch((loadError: unknown) => {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Factory data could not be loaded.',
          )
        })
        .finally(() => {
          setLoading(false)
        }),
    [],
  )

  const reloadFactories = useCallback(() => {
    setLoading(true)
    setError(null)
    return loadFactories()
  }, [loadFactories])

  useEffect(() => {
    void loadFactories()
  }, [loadFactories])

  const addFactory = useCallback((newFactory: Factory) => {
    setCustomFactories((existing) => [
      ...existing.filter((item) => item.id !== newFactory.id),
      newFactory,
    ])
    setFactoryId(newFactory.id)
  }, [])

  const optimizeFactory = useCallback(async () => {
    const selectedId = factory.id
    setOptimizing(true)
    setOptimizationError(null)
    try {
      await requestOptimization(selectedId)
      if (USE_MOCK && customFactories.some((item) => item.id === selectedId)) {
        return
      }
      const updated = await getFactory(selectedId)
      setApiFactories((existing) =>
        existing.map((item) => (item.id === updated.id ? updated : item)),
      )
    } catch (optimizationFailure) {
      const message =
        optimizationFailure instanceof Error
          ? optimizationFailure.message
          : 'Optimization could not be completed.'
      setOptimizationError(message)
    } finally {
      setOptimizing(false)
    }
  }, [factory.id, customFactories])

  const value = useMemo(
    () => ({
      factory,
      factories: allFactories,
      setFactoryId,
      addFactory,
      loading,
      error,
      reloadFactories,
      runOptimization: optimizeFactory,
      optimizing,
      optimizationError,
    }),
    [
      factory,
      allFactories,
      addFactory,
      loading,
      error,
      reloadFactories,
      optimizeFactory,
      optimizing,
      optimizationError,
    ],
  )

  return (
    <FactoryContext.Provider value={value}>
      {children}
    </FactoryContext.Provider>
  )
}

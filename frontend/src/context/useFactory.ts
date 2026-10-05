import { useContext } from 'react'
import { FactoryContext } from './FactoryContextState'

export function useFactory() {
  const context = useContext(FactoryContext)

  if (!context) {
    throw new Error('useFactory must be used within a FactoryProvider')
  }

  return context
}

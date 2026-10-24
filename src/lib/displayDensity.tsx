import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { readLocal, writeLocal } from './safeStorage'
import { BP } from './breakpoints'

export type DisplayDensity = 'compact' | 'comfortable'

interface DisplayDensityCtx {
  density: DisplayDensity
  setDensity: (density: DisplayDensity) => void
  toggleDensity: () => void
}

const Ctx = createContext<DisplayDensityCtx>({
  density: 'compact',
  setDensity: () => {},
  toggleDensity: () => {},
})

const KEY = 'br-display-density'

export function DisplayDensityProvider({ children, initial }: { children: ReactNode; initial?: DisplayDensity }) {
  const [density, setDensityState] = useState<DisplayDensity>(() => {
    if (typeof window === 'undefined') return initial ?? 'compact'
    const saved = readLocal(KEY)
    if (saved === 'compact' || saved === 'comfortable') return saved
    if (initial) return initial
    // Default to compact for desktop/tablet (>= 768px), comfortable for phone (< 768px)
    if (typeof window !== 'undefined' && window.innerWidth < BP.phone) {
      return 'comfortable'
    }
    return 'compact'
  })

  useEffect(() => {
    document.documentElement.dataset['density'] = density
    writeLocal(KEY, density)
  }, [density])

  const setDensity = (next: DisplayDensity) => {
    setDensityState(next)
  }

  const toggleDensity = () => {
    setDensityState((prev) => (prev === 'compact' ? 'comfortable' : 'compact'))
  }

  return (
    <Ctx.Provider value={{ density, setDensity, toggleDensity }}>
      {children}
    </Ctx.Provider>
  )
}

export function useDisplayDensity(): DisplayDensityCtx {
  return useContext(Ctx)
}

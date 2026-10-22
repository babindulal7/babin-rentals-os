// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useFirstRun, useOnboarding } from '../useFirstRun'
import { readLocal, writeLocal } from '../safeStorage'

// @ts-expect-error react act flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('useFirstRun', () => {
  let root: Root | null = null
  let container: HTMLDivElement | null = null

  beforeEach(() => {
    try {
      window.localStorage.clear()
    } catch {
      // safe
    }
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount()
      })
      root = null
    }
    if (container) {
      container.remove()
      container = null
    }
  })

  it('reports firstRun true on initial mount and marks flag in safeStorage', async () => {
    let capturedFirstRun: boolean | undefined
    function TestComponent() {
      const { firstRun } = useFirstRun()
      capturedFirstRun = firstRun
      return null
    }

    await act(async () => {
      root?.render(<TestComponent />)
    })

    expect(capturedFirstRun).toBe(true)
    expect(readLocal('babin-first-run')).toBe('true')
  })

  it('reports firstRun false when flag is already set', async () => {
    writeLocal('babin-first-run', 'true')
    let capturedFirstRun: boolean | undefined
    function TestComponent() {
      const { firstRun } = useFirstRun()
      capturedFirstRun = firstRun
      return null
    }

    await act(async () => {
      root?.render(<TestComponent />)
    })

    expect(capturedFirstRun).toBe(false)
  })

  it('completes onboarding steps and calls onComplete', async () => {
    let completed = false
    let completeFn: (() => void) | undefined
    let isCompleteCaptured: boolean | undefined

    function TestComponent() {
      const { completeOnboarding, isComplete } = useOnboarding(() => {
        completed = true
      })
      completeFn = completeOnboarding
      isCompleteCaptured = isComplete
      return null
    }

    await act(async () => {
      root?.render(<TestComponent />)
    })

    expect(isCompleteCaptured).toBe(false)

    await act(async () => {
      completeFn?.()
    })

    expect(completed).toBe(true)
    expect(isCompleteCaptured).toBe(true)
    expect(readLocal('babin-first-run')).toBe('true')
  })
})

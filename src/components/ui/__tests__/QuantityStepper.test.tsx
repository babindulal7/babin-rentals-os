// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QuantityStepper } from '../QuantityStepper'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('QuantityStepper Primitive', () => {
  let host: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount()
      })
    }
    if (host && host.parentNode) {
      host.parentNode.removeChild(host)
    }
    root = null
    host = null
  })

  it('renders with initial quantity, accessible buttons, and optional unit badge', () => {
    act(() => {
      root!.render(<QuantityStepper value={3} onChange={() => {}} unit="units" ariaLabel="Pack quantity" />)
    })

    const input = host!.querySelector('input') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.value).toBe('3')
    expect(input.getAttribute('aria-label')).toBe('Pack quantity')
    expect(host!.textContent).toContain('units')

    const decBtn = host!.querySelector('button[aria-label="Decrease Pack quantity"]') as HTMLButtonElement
    const incBtn = host!.querySelector('button[aria-label="Increase Pack quantity"]') as HTMLButtonElement
    expect(decBtn).not.toBeNull()
    expect(incBtn).not.toBeNull()
  })

  it('handles increment and decrement clicks with step and bounds', () => {
    const onChange = vi.fn()
    act(() => {
      root!.render(<QuantityStepper value={5} onChange={onChange} min={1} max={10} step={2} />)
    })

    const decBtn = host!.querySelector('button[aria-label="Decrease Quantity"]') as HTMLButtonElement
    const incBtn = host!.querySelector('button[aria-label="Increase Quantity"]') as HTMLButtonElement

    act(() => {
      decBtn.click()
    })
    expect(onChange).toHaveBeenCalledWith(3)

    act(() => {
      incBtn.click()
    })
    expect(onChange).toHaveBeenCalledWith(7)
  })

  it('disables decrement at min bound and increment at max bound', () => {
    act(() => {
      root!.render(<QuantityStepper value={1} onChange={() => {}} min={1} max={5} />)
    })

    const decBtn = host!.querySelector('button[aria-label="Decrease Quantity"]') as HTMLButtonElement
    const incBtn = host!.querySelector('button[aria-label="Increase Quantity"]') as HTMLButtonElement
    expect(decBtn.disabled).toBe(true)
    expect(incBtn.disabled).toBe(false)

    act(() => {
      root!.render(<QuantityStepper value={5} onChange={() => {}} min={1} max={5} />)
    })
    expect(decBtn.disabled).toBe(false)
    expect(incBtn.disabled).toBe(true)
  })

  it('supports ArrowUp and ArrowDown keyboard shortcuts', () => {
    const onChange = vi.fn()
    act(() => {
      root!.render(<QuantityStepper value={4} onChange={onChange} min={0} max={10} />)
    })

    const input = host!.querySelector('input') as HTMLInputElement
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    })
    expect(onChange).toHaveBeenCalledWith(5)

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })
    expect(onChange).toHaveBeenCalledWith(3)
  })

  it('guarantees Law 15 touch target floors (>= 44px)', () => {
    act(() => {
      root!.render(<QuantityStepper value={2} onChange={() => {}} />)
    })

    const decBtn = host!.querySelector('button[aria-label="Decrease Quantity"]') as HTMLButtonElement
    const incBtn = host!.querySelector('button[aria-label="Increase Quantity"]') as HTMLButtonElement

    expect(decBtn.className).toContain('min-w-[44px]')
    expect(decBtn.className).toContain('min-h-[44px]')
    expect(incBtn.className).toContain('min-w-[44px]')
    expect(incBtn.className).toContain('min-h-[44px]')
  })
})

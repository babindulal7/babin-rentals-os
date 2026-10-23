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

  it('supports clearing and typing a replacement value (e.g. replacing 5 with 12)', () => {
    let currentVal = 5
    const onChange = vi.fn((next: number) => {
      currentVal = next
    })

    const setInputValue = (el: HTMLInputElement, val: string) => {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
      descriptor?.set?.call(el, val)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }

    act(() => {
      root!.render(<QuantityStepper value={currentVal} onChange={onChange} min={1} max={20} />)
    })

    const input = host!.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('5')

    // 1. User clears the input
    act(() => {
      input.focus()
      setInputValue(input, '')
    })
    expect(input.value).toBe('')

    // 2. User types '1'
    act(() => {
      setInputValue(input, '1')
    })
    expect(input.value).toBe('1')

    // 3. User types '2' -> '12'
    act(() => {
      setInputValue(input, '12')
    })
    expect(input.value).toBe('12')

    // 4. User blurs the input to commit
    act(() => {
      input.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })
    expect(onChange).toHaveBeenCalledWith(12)
  })

  it('clamps to max bound when typed value exceeds max on blur or Enter', () => {
    const onChange = vi.fn()
    const setInputValue = (el: HTMLInputElement, val: string) => {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
      descriptor?.set?.call(el, val)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }

    act(() => {
      root!.render(<QuantityStepper value={5} onChange={onChange} min={1} max={10} />)
    })

    const input = host!.querySelector('input') as HTMLInputElement

    act(() => {
      input.focus()
      setInputValue(input, '99')
    })
    expect(input.value).toBe('99')

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(onChange).toHaveBeenCalledWith(10)
  })

  it('falls back to min bound when input is cleared and blurred', () => {
    const onChange = vi.fn()
    const setInputValue = (el: HTMLInputElement, val: string) => {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
      descriptor?.set?.call(el, val)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }

    act(() => {
      root!.render(<QuantityStepper value={5} onChange={onChange} min={2} max={10} />)
    })

    const input = host!.querySelector('input') as HTMLInputElement

    act(() => {
      input.focus()
      setInputValue(input, '')
    })

    act(() => {
      input.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })
    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('supports fractional step and decimal numbers without truncation', () => {
    let currentVal = 1.5
    const onChange = vi.fn((next: number) => {
      currentVal = next
      root!.render(<QuantityStepper value={currentVal} onChange={onChange} step={0.5} min={0} max={5} />)
    })

    const setInputValue = (el: HTMLInputElement, val: string) => {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
      descriptor?.set?.call(el, val)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }

    act(() => {
      root!.render(<QuantityStepper value={currentVal} onChange={onChange} step={0.5} min={0} max={5} />)
    })

    const input = host!.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('1.5')

    act(() => {
      input.focus()
      setInputValue(input, '2.5')
    })

    act(() => {
      input.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })
    expect(onChange).toHaveBeenCalledWith(2.5)

    const incBtn = host!.querySelector('button[aria-label="Increase Quantity"]') as HTMLButtonElement
    act(() => {
      incBtn.click()
    })
    expect(onChange).toHaveBeenCalledWith(3)
  })
})

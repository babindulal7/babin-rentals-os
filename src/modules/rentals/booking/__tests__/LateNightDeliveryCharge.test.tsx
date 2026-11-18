// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  LateNightDeliveryCharge,
  LATE_NIGHT_LINE_NAME,
  hasLateNightLine,
  lateNightDeliveryLine,
} from '../LateNightDeliveryCharge'
import type { Line } from '../RentalLineItemsTree'
import { rupees, type Paisa } from '../../../../lib/money'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const setting = vi.hoisted(() => ({ rupees: 0 as number | string }))

vi.mock('../../../../lib/settingsStore', () => ({
  getSetting: () => setting.rupees,
}))

/* RULINGS-2026-11-19 S2 row 5: one tap adds the late-night line at the Settings amount; with no amount
   set (0) it asks for one and never assumes a free charge. */

let captured: Line[] = []

function Harness({ initial = [] }: { initial?: Line[] }) {
  const [lines, setLines] = useState<Line[]>(initial)
  captured = lines
  return <LateNightDeliveryCharge lines={lines} setLines={setLines} />
}

const buttonByText = (container: HTMLElement, text: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined

function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('LateNightDeliveryCharge', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    setting.rupees = 0
    captured = []
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('adds the line at the Settings amount in one tap', async () => {
    setting.rupees = 750
    await act(async () => {
      root.render(<Harness />)
    })
    await act(async () => {
      buttonByText(container, 'Add late-night delivery')?.click()
    })
    expect(captured).toHaveLength(1)
    expect(captured[0]?.name).toBe(LATE_NIGHT_LINE_NAME)
    expect(captured[0]?.ratePaisa).toBe(rupees(750))
    expect(captured[0]?.serviceBasis).toBe('Flat')
    expect(container.textContent).toContain('Late-night added')
    expect(buttonByText(container, 'Late-night added')?.disabled).toBe(true)
  })

  it('asks for an amount when none is set in Settings, and adds nothing until one is given', async () => {
    setting.rupees = 0
    await act(async () => {
      root.render(<Harness />)
    })
    await act(async () => {
      buttonByText(container, 'Add late-night delivery')?.click()
    })
    expect(captured).toHaveLength(0)
    const input = container.querySelector('input[aria-label="Late-night delivery charge in Rupees"]') as HTMLInputElement
    expect(input).not.toBeNull()
    await act(async () => {
      typeInto(input, '1200')
    })
    await act(async () => {
      buttonByText(container, 'Add')?.click()
    })
    expect(captured).toHaveLength(1)
    expect(captured[0]?.ratePaisa).toBe(rupees(1200))
  })

  it('refuses a blank, zero or negative amount, so a late-night charge is never assumed free', async () => {
    await act(async () => {
      root.render(<Harness />)
    })
    await act(async () => {
      buttonByText(container, 'Add late-night delivery')?.click()
    })
    const input = container.querySelector('input[aria-label="Late-night delivery charge in Rupees"]') as HTMLInputElement
    for (const bad of ['', '0', '-5']) {
      await act(async () => {
        typeInto(input, bad)
      })
      await act(async () => {
        buttonByText(container, 'Add')?.click()
      })
      expect(captured).toHaveLength(0)
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('more than 0')
    }
  })

  it('does not add a second late-night line', async () => {
    const existing = lateNightDeliveryLine(rupees(500) as Paisa)
    await act(async () => {
      root.render(<Harness initial={[existing]} />)
    })
    expect(buttonByText(container, 'Late-night added')?.disabled).toBe(true)
    expect(hasLateNightLine(captured)).toBe(true)
    expect(captured).toHaveLength(1)
  })
})

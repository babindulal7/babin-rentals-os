// @vitest-environment jsdom
// @ts-expect-error test env flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DeliveryFeeGridCard } from '../DeliveryFeeGridCard'

type Result = { data: unknown; error: { message: string } | null }
const answers: Record<string, Result> = {}

vi.mock('../../../../lib/supabase', () => {
  const chain = (table: string) => {
    const result = () => answers[table] ?? { data: [], error: null }
    const builder: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order']) builder[m] = () => builder
    builder.then = (resolve: (v: Result) => unknown) => Promise.resolve(result()).then(resolve)
    return builder
  }
  return {
    supabase: {
      from: (table: string) => chain(table),
      rpc: vi.fn(async () => ({ data: true, error: null })),
    },
  }
})

/* RULING 2026-11-09 (R-9.18, R-9.20): a blank cell is not set; a quoted zone takes no amounts. */
describe('DeliveryFeeGridCard (R-9.18, R-9.20)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    for (const key of Object.keys(answers)) delete answers[key]
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  async function mount(): Promise<void> {
    await act(async () => {
      root.render(<DeliveryFeeGridCard />)
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
  }

  it('shows a read error in words, never as an empty grid', async () => {
    answers['delivery_zones'] = { data: null, error: { message: 'permission denied' } }
    await mount()
    expect(container.textContent).toContain('Could not read delivery fees: permission denied')
  })

  it('shows a quoted zone as quoted per trip, with no amount inputs', async () => {
    answers['delivery_zones'] = { data: [{ id: 'z-out', name: 'Outside valley' }], error: null }
    answers['delivery_zone_quoted'] = { data: [{ zone_id: 'z-out', quoted: true }], error: null }
    answers['delivery_zone_vehicle_fees'] = { data: [], error: null }
    await mount()
    expect(container.textContent).toContain('Quoted per trip')
    expect(container.querySelectorAll('input').length).toBe(0)
  })

  it('shows an unset cell as not set, never as a free delivery', async () => {
    answers['delivery_zones'] = { data: [{ id: 'z-in', name: 'Inside Ring Road' }], error: null }
    answers['delivery_zone_quoted'] = { data: [], error: null }
    answers['delivery_zone_vehicle_fees'] = { data: [{ zone_id: 'z-in', vehicle_class: 'Motorbike', fee_paisa: null }], error: null }
    await mount()
    expect(container.textContent).toContain('Delivery fee not set')
    expect(container.textContent).not.toContain('Rs 0')
    expect(container.querySelectorAll('input').length).toBe(3)
  })
})

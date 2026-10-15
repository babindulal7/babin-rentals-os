// @vitest-environment jsdom
/**
 * Extend Rental's labels are bound to their controls.
 *
 * The three fields ("Additional Days", "Daily Extension Rate (Rs)", "Reason for
 * Extension") had visible `<label>`s with no `htmlFor` and controls with no
 * `id`, so `input.labels` was empty and a screen reader announced three unnamed
 * edit boxes. PLAN.md §0: gate accessibility failures are release blockers.
 * Same assertion as RecordPaymentModal's "accessible name bindings" case.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'

vi.mock('../../../../actions/rentals/extendRental', () => ({
  extendRental: vi.fn(async () => ({ success: true })),
}))
vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'USR-REAL', name: 'Tester', role: 'Owner', isSharedDevice: false } }),
}))

window.matchMedia = ((q: string) => ({
  matches: false, media: q, onchange: null,
  addEventListener: () => {}, removeEventListener: () => {},
  addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { ExtendRentalModal } = await import('../ExtendRentalModal')

let container: HTMLDivElement
let root: Root

// Ids are static, so a dialog left mounted would capture the next test's `label[for]`.
afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
})

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <StrictMode>
        <ExtendRentalModal
          isOpen
          onClose={() => {}}
          onSuccess={() => {}}
          bookingId="B-864"
          client="ABC Films Pvt. Ltd."
          currentReturnDate="2026-07-31T12:00:00Z"
        />
      </StrictMode>,
    )
  })
  return container
}

describe('ExtendRentalModal — accessible names', () => {
  it('satisfies keyboard accessibility and accessible name bindings for screen readers', async () => {
    const c = await mount()
    const controls = Array.from(c.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea'))
    expect(controls.length).toBe(4)
    for (const ctrl of controls) {
      const id = ctrl.getAttribute('id')
      const ariaLabel = ctrl.getAttribute('aria-label')
      const ariaLabelledby = ctrl.getAttribute('aria-labelledby')
      const hasForLabel = id ? Boolean(c.querySelector(`label[for="${id}"]`)) : false
      expect(Boolean(ariaLabel || ariaLabelledby || hasForLabel)).toBe(true)
      expect(ctrl.tabIndex).toBeGreaterThanOrEqual(0)
      ctrl.focus()
      expect(document.activeElement).toBe(ctrl)
    }
  })

  it('names each control by its existing visible label, required markers kept', async () => {
    const c = await mount()
    const labelOf = (selector: string) => {
      const ctrl = c.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!
      expect(ctrl.labels?.length).toBe(1)
      return ctrl.labels![0]!.textContent!.replace(/\s+/g, ' ').trim()
    }
    expect(labelOf('#extend-rental-days')).toBe('Additional Days *')
    expect(labelOf('#extend-rental-daily-rate')).toBe('Daily Extension Rate (Rs) *')
    expect(labelOf('#extend-rental-reason')).toBe('Reason for Extension *')
    expect(labelOf('input[type="checkbox"]')).toBe('Client has authorized the extension and additional charges.')
  })
})

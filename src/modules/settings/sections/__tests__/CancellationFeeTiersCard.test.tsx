// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CancellationFeeTiersCard } from '../CancellationFeeTiersCard'

const { updateTier } = vi.hoisted(() => ({ updateTier: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../../../lib/auth', () => ({ useAuth: () => ({ user: { id: 'owner', role: 'Owner' } }) }))
vi.mock('../../../../lib/network', () => ({ useNetwork: () => true }))
vi.mock('../../../../lib/queries/cancellationFeeTiers', () => ({
  fetchCancellationFeeTiers: vi.fn(),
  recordCancellationFeeTier: vi.fn(),
  updateCancellationFeeTier: updateTier,
}))
vi.mock('../../../../lib/queries/useLoad', () => ({
  useLoad: () => ({
    loading: false, error: null, reload: vi.fn(),
    data: [
      { id: 'early', noticeHours: 48, feePercent: 10, retiredAt: null, createdAt: '', updatedAt: '' },
      { id: 'late', noticeHours: 24, feePercent: 25, retiredAt: null, createdAt: '', updatedAt: '' },
    ],
  }),
}))
vi.mock('../../../../components/ui/ConfirmDialog', () => ({
  ConfirmDialog: ({ onConfirm }: { onConfirm: () => void }) => (
    <button type="button" onClick={onConfirm}>Confirm retirement</button>
  ),
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('CancellationFeeTiersCard retirement drafts', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(async () => {
    updateTier.mockClear()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => root.render(<CancellationFeeTiersCard />))
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  async function click(label: string) {
    const button = [...container.querySelectorAll('button')].find(element =>
      element.getAttribute('aria-label') === label || element.textContent?.trim() === label)
    expect(button, `Missing ${label}`).toBeTruthy()
    await act(async () => button!.click())
  }
  function values() {
    return [...container.querySelectorAll<HTMLInputElement>('input[type="number"]')].map(input => input.value)
  }

  it('preserves edits to another tier when retirement succeeds', async () => {
    await click('Edit 48-hour tier')
    expect(values()).toEqual(['48', '10'])
    await click('Retire 24-hour tier')
    await click('Confirm retirement')
    expect(updateTier).toHaveBeenCalledWith(expect.objectContaining({ id: 'late' }), 'retire')
    expect(values()).toEqual(['48', '10'])
    expect(container.textContent).toContain('Save tier changes')
  })

  it('clears the editor when the edited tier itself is retired', async () => {
    await click('Edit 48-hour tier')
    await click('Retire 48-hour tier')
    await click('Confirm retirement')
    expect(updateTier).toHaveBeenCalledWith(expect.objectContaining({ id: 'early' }), 'retire')
    expect(values()).toEqual(['', ''])
    expect(container.textContent).toContain('Add fee tier')
  })
})

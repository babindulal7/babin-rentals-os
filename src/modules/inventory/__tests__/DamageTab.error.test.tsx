// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DamageTab } from '../DamageTab'
import * as damageApi from '../../../lib/queries/damage'
import type { Paisa } from '../../../lib/money'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: {
      id: 'usr-owner',
      name: 'Babin Dulal',
      role: 'Owner',
    },
  }),
}))

vi.mock('../../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => true,
}))

const mockResolveDamageFinding = vi.fn().mockResolvedValue({
  id: 'f-1',
  approval_state: 'Approved',
  disposition: 'Absorb',
})

vi.mock('../../../actions/inventory/resolveDamage', () => ({
  resolveDamageFinding: (...args: unknown[]) => mockResolveDamageFinding(...args),
}))

describe('DamageTab — error handling and resolution truthfulness (UX-14, UX-15, UX-16)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.restoreAllMocks()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('renders ErrorBanner with retry button when getDamageFindings fails', async () => {
    vi.spyOn(damageApi, 'getDamageFindings').mockRejectedValueOnce(new Error('Database unavailable'))

    await act(async () => {
      root.render(<DamageTab />)
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const alert = container.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert?.textContent).toContain('Database unavailable')
    expect(container.textContent).toContain('Could not load damage findings')
  })

  it('rejects damage finding with Absorb disposition and records honest feedback', async () => {
    const mockFinding: damageApi.DamageFinding = {
      id: 'f-1',
      bookingNo: 'BK-1001',
      client: 'Himalayan Films',
      unitName: 'Sony FX3 Body',
      serial: 'FX3-001',
      state: 'Awaiting Approval',
      description: 'Scratched top plate',
      photos: 1,
      chargePaisa: 500000 as Paisa,
      replacementPaisa: 25000000 as Paisa,
      depositPaisa: 10000000 as Paisa,
      raisedBy: 'Warehouse Staff',
      raisedAtAd: '2026-11-06',
    }

    vi.spyOn(damageApi, 'getDamageFindings').mockResolvedValueOnce([mockFinding])

    await act(async () => {
      root.render(<DamageTab />)
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const rejectBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Reject',
    )
    expect(rejectBtn).toBeDefined()

    await act(async () => {
      rejectBtn!.click()
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    expect(mockResolveDamageFinding).toHaveBeenCalledWith(
      expect.objectContaining({
        findingId: 'f-1',
        disposition: 'Absorb',
        chargePaisa: 0,
      }),
    )

    const statusBanner = container.querySelector('[role="status"]')
    expect(statusBanner).not.toBeNull()
    expect(statusBanner?.textContent).toContain('Damage resolution for Sony FX3 Body (charge absorbed / waived) has been recorded on the database.')
  })
})

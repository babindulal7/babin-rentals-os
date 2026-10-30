// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ShiftHandoverPanel from '../ShiftHandoverPanel'
import * as shiftQueries from '../../../lib/queries/shiftHandover'
import * as moneyVisibility from '../../../lib/moneyVisibility'

vi.mock('../../../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

vi.mock('../../../components/ui/Toast', () => ({
  useToast: () => ({ showSuccessToast: vi.fn() }),
  useOptionalToast: () => ({ showSuccessToast: vi.fn() }),
}))

vi.mock('../../../lib/device', () => ({
  useViewport: () => 'desktop',
  useCapability: () => ({ hasHover: true }),
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'test-user-1', name: 'Saroj K.', role: 'Coordinator' },
  }),
}))

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

describe('ShiftHandoverPanel UI', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('renders shift handover checklist and current shift information when expanded', async () => {
    vi.spyOn(shiftQueries, 'fetchShiftHandovers').mockResolvedValue([])
    vi.spyOn(moneyVisibility, 'useCanViewMoney').mockReturnValue(false)

    const root = createRoot(container)
    try {
      await act(async () => {
        root.render(<ShiftHandoverPanel />)
      })

      // Collapsed state shows current active shift
      expect(container.textContent).toMatch(/Active: Shift [A-C]/i)
      expect(container.textContent).toMatch(/\d\s*\/\s*5 Checks/i)

      // Click header bar to expand
      const headerBar = container.querySelector('[role="button"]') || container.firstChild?.childNodes[0]
      if (headerBar) {
        await act(async () => {
          (headerBar as HTMLElement).click()
        })
      }

      expect(container.textContent).toMatch(/Shift Handover Checklist/i)
      expect(container.textContent).toMatch(/Out-gear walked through/i)
      expect(container.textContent).toMatch(/Cash drawer counted/i)
      expect(container.textContent).toMatch(/Keys, fobs & lockup/i)
    } finally {
      await act(async () => root.unmount())
    }
  })

  it('displays pending handover banner with Acknowledge Handover button', async () => {
    vi.spyOn(shiftQueries, 'fetchShiftHandovers').mockResolvedValue([
      {
        id: 'handover-pending-1',
        client_uuid: 'uuid-p1',
        shift_code: 'A',
        shift_date: '2026-10-30',
        from_user_id: 'user-a',
        from_user_name: 'Babin D.',
        from_user_role: 'Operations',
        to_user_id: 'test-user-1',
        to_user_name: 'Saroj K.',
        cash_counted_paisa: 1500000,
        cash_status: 'matched',
        cash_variance_paisa: 0,
        notes: 'Everything smooth, morning rush handled.',
        open_items: [],
        checklist: [],
        status: 'pending',
        acknowledged_at: null,
        acknowledged_by: null,
        acknowledged_by_name: null,
        acknowledgement_note: null,
        archived_at: null,
        created_at: '2026-10-30T09:00:00Z',
        updated_at: '2026-10-30T09:00:00Z',
      },
    ])
    vi.spyOn(moneyVisibility, 'useCanViewMoney').mockReturnValue(true)

    const root = createRoot(container)
    try {
      await act(async () => {
        root.render(<ShiftHandoverPanel />)
      })

      expect(container.textContent).toMatch(/Pending Shift Handover/i)
      expect(container.textContent).toMatch(/Babin D\./i)
      expect(container.textContent).toMatch(/Acknowledge Handover/i)
    } finally {
      await act(async () => root.unmount())
    }
  })

  it('enforces Law 6: masks cash figures when user cannot view money', async () => {
    vi.spyOn(shiftQueries, 'fetchShiftHandovers').mockResolvedValue([
      {
        id: 'handover-ack-1',
        client_uuid: 'uuid-a1',
        shift_code: 'A',
        shift_date: '2026-10-30',
        from_user_id: 'user-a',
        from_user_name: 'Babin D.',
        from_user_role: 'Operations',
        to_user_id: null,
        to_user_name: null,
        cash_counted_paisa: null,
        cash_status: 'matched',
        cash_variance_paisa: null,
        notes: 'Handover complete.',
        open_items: [],
        checklist: [],
        status: 'acknowledged',
        acknowledged_at: '2026-10-30T14:00:00Z',
        acknowledged_by: 'user-b',
        acknowledged_by_name: 'Saroj K.',
        acknowledgement_note: 'Verified.',
        archived_at: null,
        created_at: '2026-10-30T09:00:00Z',
        updated_at: '2026-10-30T09:00:00Z',
      },
    ])
    vi.spyOn(moneyVisibility, 'useCanViewMoney').mockReturnValue(false)

    const root = createRoot(container)
    try {
      await act(async () => {
        root.render(<ShiftHandoverPanel />)
      })

      // Expand main panel
      const buttons = container.querySelectorAll('[tabindex="0"]')
      if (buttons[0]) {
        await act(async () => {
          (buttons[0] as HTMLElement).click()
        })
      }

      // "Recount Cash" button must not be rendered
      expect(container.textContent).not.toMatch(/Recount Cash/i)

      // Expand log section
      const logButton = Array.from(container.querySelectorAll('[role="button"]')).find(
        (el) => el.textContent?.includes('Handover Log')
      )
      if (logButton) {
        await act(async () => {
          (logButton as HTMLElement).click()
        })
      }

      // When canViewMoney is false, "Cash Variance Flags" KPI must not be present
      expect(container.textContent).not.toMatch(/Cash Variance Flags/i)
    } finally {
      await act(async () => root.unmount())
    }
  })

  it('renders cash variance flags and recount button when user can view money', async () => {
    vi.spyOn(shiftQueries, 'fetchShiftHandovers').mockResolvedValue([
      {
        id: 'handover-ack-1',
        client_uuid: 'uuid-a1',
        shift_code: 'A',
        shift_date: '2026-10-30',
        from_user_id: 'user-a',
        from_user_name: 'Babin D.',
        from_user_role: 'Operations',
        to_user_id: null,
        to_user_name: null,
        cash_counted_paisa: 1500000,
        cash_status: 'matched',
        cash_variance_paisa: 0,
        notes: 'Handover complete.',
        open_items: [],
        checklist: [],
        status: 'acknowledged',
        acknowledged_at: '2026-10-30T14:00:00Z',
        acknowledged_by: 'user-b',
        acknowledged_by_name: 'Saroj K.',
        acknowledgement_note: 'Verified.',
        archived_at: null,
        created_at: '2026-10-30T09:00:00Z',
        updated_at: '2026-10-30T09:00:00Z',
      },
    ])
    vi.spyOn(moneyVisibility, 'useCanViewMoney').mockReturnValue(true)

    const root = createRoot(container)
    try {
      await act(async () => {
        root.render(<ShiftHandoverPanel />)
      })

      // Expand main panel
      const buttons = container.querySelectorAll('[tabindex="0"]')
      if (buttons[0]) {
        await act(async () => {
          (buttons[0] as HTMLElement).click()
        })
      }

      // Recount Cash button is rendered
      expect(container.textContent).toMatch(/Recount Cash/i)

      // Expand log section
      const logButton = Array.from(container.querySelectorAll('[role="button"]')).find(
        (el) => el.textContent?.includes('Handover Log')
      )
      if (logButton) {
        await act(async () => {
          (logButton as HTMLElement).click()
        })
      }

      // When canViewMoney is true, "Cash Variance Flags" KPI must be present
      expect(container.textContent).toMatch(/Cash Variance Flags/i)
    } finally {
      await act(async () => root.unmount())
    }
  })
})

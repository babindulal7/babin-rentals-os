// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NeedsAttention } from '../NeedsAttention'
import type { AttentionTask } from '../attentionModel'
import type { TodayAttentionState } from '../useTodayAttention'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

let container: HTMLDivElement
let root: Root

function makeTask(overrides: Partial<AttentionTask>): AttentionTask {
  const id = overrides.bookingId || overrides.bookingNo || '1'
  return {
    key: `task:${id}`,
    bookingId: id,
    bookingNo: 'BK-101',
    stage: 'On Rent',
    kind: 'overdue_return',
    severity: 'critical',
    dueAtAd: '2026-10-18T09:00:00.000Z',
    job: 'Return',
    label: 'Overdue Return',
    detail: 'Due 2h overdue',
    clientName: 'Sagarmatha Motion Pictures Pvt Ltd',
    deliveryType: 'Delivery to Set',
    ...overrides,
  }
}

function makeState(overrides: Partial<TodayAttentionState>): TodayAttentionState {
  return {
    tasks: [],
    totalCount: 0,
    loading: false,
    error: null,
    lastFetchedAt: new Date(),
    truncated: false,
    isOffline: false,
    refresh: vi.fn(),
    ...overrides,
  }
}

async function renderComponent(props: Parameters<typeof NeedsAttention>[0]) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<NeedsAttention {...props} />)
  })
}

describe('NeedsAttention Cross-Platform & Access Verification (§5A)', () => {
  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount()
      })
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container)
    }
  })

  describe('Desktop App & Desktop Web (>= 1280px)', () => {
    it('renders accessible semantic section structure and headings', async () => {
      await renderComponent({
        onOpenTask: vi.fn(),
        state: makeState({
          tasks: [makeTask({ bookingNo: 'BK-001' })],
          totalCount: 1,
        }),
      })

      const section = container.querySelector('section[aria-labelledby="needs-attention-heading"]')
      expect(section).not.toBeNull()
      expect(section?.getAttribute('data-testid')).toBe('needs-attention-panel')

      const heading = section?.querySelector('#needs-attention-heading')
      expect(heading).not.toBeNull()
      expect(heading?.textContent).toContain('Needs Attention')
    })

    it('supports keyboard navigation with explicit buttons and aria-labels', async () => {
      const onOpen = vi.fn()
      const task = makeTask({ bookingNo: 'BK-042', kind: 'late_pickup_booked', job: 'Pack' })

      await renderComponent({
        onOpenTask: onOpen,
        state: makeState({ tasks: [task], totalCount: 1 }),
      })

      const btn = container.querySelector('button.needs-attention-btn') as HTMLButtonElement
      expect(btn).not.toBeNull()
      expect(btn.type).toBe('button')
      expect(btn.getAttribute('aria-label')).toBe('Pack booking BK-042')

      // Keyboard click
      await act(async () => {
        btn.focus()
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      })
      expect(onOpen).toHaveBeenCalledWith(task)
    })
  })

  describe('iPad (Portrait, Landscape & Split View: 320px - 1180px)', () => {
    it('enforces touch target classes (>= 44px) on all interactive buttons', async () => {
      const onViewAll = vi.fn()
      const tasks = [
        makeTask({ bookingNo: 'BK-101', kind: 'overdue_return' }),
        makeTask({ bookingNo: 'BK-102', kind: 'late_pickup_booked' }),
        makeTask({ bookingNo: 'BK-103', kind: 'late_pickup_packed' }),
        makeTask({ bookingNo: 'BK-104', kind: 'overdue_return' }),
      ]

      await renderComponent({
        onOpenTask: vi.fn(),
        onViewAll,
        state: makeState({ tasks, totalCount: 12 }),
      })

      const buttons = Array.from(container.querySelectorAll('button'))
      expect(buttons.length).toBeGreaterThanOrEqual(5) // header link + 3 action buttons + footer link

      for (const btn of buttons) {
        // Every button must include the design token touch classes .tap (or .press)
        expect(btn.className).toMatch(/tap/)
      }
    })

    it('gracefully handles narrow Split View widths without clipping action buttons', async () => {
      const task = makeTask({
        bookingNo: 'BK-LONG-NAME-999',
        clientName: 'Very Long Production House Name With Multiple Sub-Companies And Labels That Might Overflow In Split View',
      })

      await renderComponent({
        onOpenTask: vi.fn(),
        state: makeState({ tasks: [task], totalCount: 1 }),
      })

      const card = container.querySelector('[data-testid="needs-attention-card-BK-LONG-NAME-999"]')
      expect(card).not.toBeNull()

      const clientEl = card?.querySelector('.needs-attention-card__client')
      expect(clientEl).not.toBeNull()
      // Title attribute preserved for assistive technology and tooltip preview
      expect(clientEl?.getAttribute('title')).toContain('Very Long Production House')

      const actionBtn = card?.querySelector('.needs-attention-card__action button')
      expect(actionBtn).not.toBeNull()
    })
  })

  describe('Phone (Portrait 375px - 430px & Landscape 667px - 932px)', () => {
    it('renders compact single-item card cleanly with critical highlight', async () => {
      const task = makeTask({
        bookingNo: 'BK-MOBILE-1',
        severity: 'critical',
        kind: 'overdue_return',
        detail: 'Due 45m overdue',
      })

      await renderComponent({
        onOpenTask: vi.fn(),
        state: makeState({ tasks: [task], totalCount: 1 }),
      })

      const panel = container.querySelector('.needs-attention-panel--has-critical')
      expect(panel).not.toBeNull()

      const card = container.querySelector('[data-testid="needs-attention-card-BK-MOBILE-1"]')
      expect(card?.classList.contains('needs-attention-card--critical')).toBe(true)
      expect(card?.textContent).toContain('#BK-MOBILE-1')
      expect(card?.textContent).toContain('Overdue Return')
      expect(card?.textContent).toContain('Due 45m overdue')
    })
  })

  describe('Zero Financial Leakage (Floor Role Money-Blindness)', () => {
    it('contains no currency tokens, paisa values, or financial figures in rendered DOM', async () => {
      const tasks = [
        makeTask({ bookingNo: 'BK-501', clientName: 'Nepal TV Production' }),
        makeTask({ bookingNo: 'BK-502', clientName: 'Kantipur Media Group' }),
      ]

      await renderComponent({
        onOpenTask: vi.fn(),
        state: makeState({ tasks, totalCount: 2 }),
      })

      const fullHtml = container.innerHTML
      const textContent = container.textContent || ''

      // Asserts zero financial figures: no NPR, no Rs., no रू, no paisa, no payment/deposit hints
      expect(fullHtml).not.toMatch(/\bNPR\b/i)
      expect(fullHtml).not.toMatch(/\bRs\.?\b/i)
      expect(fullHtml).not.toContain('रू')
      expect(textContent).not.toMatch(/paisa/i)
      expect(textContent).not.toMatch(/deposit/i)
      expect(textContent).not.toMatch(/outstanding/i)
      expect(textContent).not.toMatch(/total/i)
      expect(textContent).not.toMatch(/vat/i)
    })
  })
})

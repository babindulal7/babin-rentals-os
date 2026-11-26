// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import ActivityReports from '../ActivityReports'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
})

// Real-shaped audit rows: the report now draws its empty state for an empty log
// (Law 16 — it used to fall back to seed activity), so the tabs need data to show
// their content. One row has no IP address (null, as the database returns it)
// and one has an IP, so the Network IP cell can be checked both ways.
vi.mock('../../../lib/supabase', async () => {
  const { fakeSupabase } = await import('../../../lib/queries/__tests__/fakeSupabase')
  return {
    supabase: fakeSupabase({
      users: [{ id: 'u1', full_name: 'Ram Thapa', primary_role: 'Warehouse', employee_code: 'S-1', is_active: true }],
      audit_events: [
        { id: 'e1', created_at: '2026-10-01T06:00:00Z', action: 'Packed booking', category: 'Operations', module: 'Operations', severity: 'Informational', status: 'success', actor_id: 'u1', ip_address: null },
        { id: 'e2', created_at: '2026-10-01T05:00:00Z', action: 'Signed in', category: 'Authentication', module: 'Authentication', severity: 'Informational', status: 'success', actor_id: 'u1', ip_address: '203.0.113.7' },
      ],
    }).client,
  }
})

describe('ActivityReports module', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    if (root && container) {
      act(() => {
        root!.unmount()
      })
      container.remove()
    }
    container = null
    root = null
  })

  it('mounts cleanly and renders header and toolbar', async () => {
    await act(async () => {
      root!.render(<ActivityReports />)
    })

    expect(container?.textContent).toContain('Staff & System Activity')
    expect(container?.textContent).toContain('Activity Overview')
    expect(container?.textContent).toContain('Operator Breakdown')
    expect(container?.textContent).toContain('Audit Trail Stream')
  })

  it('switches between tabs on click', async () => {
    await act(async () => {
      root!.render(<ActivityReports />)
    })

    const buttons = Array.from(container?.querySelectorAll('button') ?? [])
    const operatorTabBtn = buttons.find((b) => b.textContent?.includes('Operator Breakdown'))

    expect(operatorTabBtn).toBeDefined()

    await act(async () => {
      operatorTabBtn?.click()
    })

    expect(container?.textContent).toContain('Staff Operator Performance & Activity')
  })

  it('shows an em dash, never 127.0.0.1, for an event with no IP address', async () => {
    await act(async () => {
      root!.render(<ActivityReports />)
    })

    const streamTab = Array.from(container?.querySelectorAll('button') ?? []).find((b) =>
      b.textContent?.includes('Audit Trail Stream'),
    )
    await act(async () => {
      streamTab?.click()
    })

    // The Network IP cell is the last cell of each event row.
    const ipOf = (action: string) => {
      const row = Array.from(container?.querySelectorAll('tbody tr') ?? []).find((tr) =>
        tr.textContent?.includes(action),
      )
      const cells = row?.querySelectorAll('td') ?? []
      return cells[cells.length - 1]?.textContent
    }

    expect(ipOf('Packed booking')).toBe('—')
    expect(ipOf('Signed in')).toBe('203.0.113.7')
    expect(container?.textContent).not.toContain('127.0.0.1')
  })
})

// @vitest-environment jsdom
/**
 * The status filter on Problem Reports shows what each status means, and filters on the stored value.
 * `open`, `seen`, `fixed` and `wont_fix` are what the database holds; staff read "Open", "Seen", "Fixed" and "Won't fix".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

vi.mock('../../../lib/device', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device')>()),
  useViewport: () => 'desktop',
  useCapability: () => ({ coarsePointer: false, hasHover: true, standalone: false, reducedMotion: false }),
}))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'USR-TEST', name: 'Tester', role: 'Owner', isSharedDevice: false } }),
}))
vi.mock('../../../components/ui/Toast', () => ({
  useToast: () => ({ showSuccessToast: () => {}, showErrorToast: () => {} }),
}))
vi.mock('../../../lib/queries/problemReports', async (orig) => {
  const real = await orig<typeof import('../../../lib/queries/problemReports')>()
  return {
    ...real,
    listProblemReports: async () => ({ rows: [], total: 0 }),
    getProblemReportPhotoUrl: async () => null,
  }
})

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: ProblemReports } = await import('../ProblemReports')

let container: HTMLDivElement
let root: Root

beforeEach(async () => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<ProblemReports />)
  })
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

function statusFilter(): HTMLSelectElement | undefined {
  return Array.from(container.querySelectorAll('select')).find((s) => s.querySelector('option')?.textContent === 'All statuses')
}

describe('Problem Reports — the status filter reads in words', () => {
  it('shows each status as its label, never the stored value', () => {
    const labels = Array.from(statusFilter()?.querySelectorAll('option') ?? []).map((o) => o.textContent)
    expect(labels).toEqual(['All statuses', 'Open', 'Seen', 'Fixed', "Won't fix"])
  })

  it('keeps the stored value on each option, so the filter still matches the data', () => {
    const values = Array.from(statusFilter()?.querySelectorAll('option') ?? []).map((o) => o.value)
    expect(values.slice(1)).toEqual(['open', 'seen', 'fixed', 'wont_fix'])
  })
})

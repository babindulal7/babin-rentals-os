// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

const auth = vi.hoisted(() => ({ role: 'Owner' }))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'USR-REAL', name: 'Tester', role: auth.role, isSharedDevice: false } }),
}))

const db = vi.hoisted(() => {
  const tables = new Map<string, { rows: unknown[]; count: number | null }>()
  return {
    tables,
    supabase: {
      from(table: string) {
        const held = tables.get(table) ?? { rows: [], count: 0 }
        const builder: Record<string, unknown> = {
          select: () => builder,
          or: () => builder,
          in: () => builder,
          eq: () => builder,
          gte: () => builder,
          lte: () => builder,
          is: () => builder,
          not: () => builder,
          order: () => builder,
          range: () => builder,
          then(onFulfilled: (value: { data: unknown[]; error: null; count: number | null }) => unknown): void {
            onFulfilled({ data: held.rows, error: null, count: held.count })
          },
        }
        return builder
      },
      rpc: () => Promise.resolve({ data: 'EXP-2026-0001', error: null }),
    },
  }
})

vi.mock('../../../lib/supabase', () => ({
  supabase: db.supabase,
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
}))

vi.mock('../../../lib/expenseStorage', () => ({
  uploadExpenseReceipt: vi.fn().mockResolvedValue({
    storagePath: 'staff/USR-REAL/receipt_00000000-0000-4000-8000-000000000000_bill.jpg',
    signedUrl: 'https://storage.local/documents/staff/USR-REAL/receipt.jpg',
    fileSizeBytes: 2048,
  }),
  getExpenseReceiptSignedUrl: vi.fn().mockResolvedValue('https://storage.local/documents/staff/USR-REAL/receipt.jpg'),
  validateReceiptFile: (file: { size: number }, _filename: string) => {
    if (file.size > 3 * 1024 * 1024) {
      return { valid: false, error: 'Receipt photo exceeds 3 MB limit (T3-24).' }
    }
    return { valid: true }
  },
  MAX_EXPENSE_RECEIPT_BYTES: 3 * 1024 * 1024,
  EXPENSE_RECEIPT_BUCKET: 'documents',
}))

window.matchMedia = ((q: string) => ({
  matches: false,
  media: q,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: Expenses } = await import('../Expenses')

function sampleDbExpenseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    expense_no: 'EXP-2026-0001',
    expense_date: '2026-10-20',
    amount: 1200,
    vendor_name: 'Camera Care Hub',
    description: 'Lens cleaning kit',
    category_id: 'cat-1',
    branch_id: 'br-1',
    status: 'Approved',
    booking_id: null,
    receipt_url: 'staff/USR-REAL/receipt_123_bill.jpg',
    receipt_size: 2048,
    created_at: '2026-10-20T10:00:00.000Z',
    expense_categories: { code: 'MAINT', name: 'Maintenance' },
    branches: { name: 'Kathmandu Main' },
    bookings: null,
    ...overrides,
  }
}

describe('Expenses Receipt (T3-24)', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    db.tables.set('expense_categories', {
      rows: [{ id: 'cat-1', code: 'MAINT', name: 'Maintenance' }],
      count: 1,
    })
    db.tables.set('branches', {
      rows: [{ id: 'br-1', name: 'Kathmandu Main' }],
      count: 1,
    })
  })

  async function mount() {
    const root = createRoot(container)
    await act(async () => {
      root.render(<Expenses />)
    })
    return container
  }

  it('renders Receipt column header in the table', async () => {
    db.tables.set('expenses', { rows: [sampleDbExpenseRow()], count: 1 })
    const c = await mount()
    expect(c.textContent).toContain('Receipt')
  })

  it('renders view receipt button when receiptUrl exists', async () => {
    db.tables.set('expenses', { rows: [sampleDbExpenseRow()], count: 1 })
    const c = await mount()
    const btn = c.querySelector('button[aria-label="View receipt for EXP-2026-0001"]')
    expect(btn).not.toBeNull()
    expect(btn?.textContent).toContain('2 KB')
  })

  it('renders dash when no receiptUrl exists', async () => {
    db.tables.set('expenses', {
      rows: [sampleDbExpenseRow({ receipt_url: null, receipt_size: null })],
      count: 1,
    })
    const c = await mount()
    const btn = c.querySelector('button[aria-label="View receipt for EXP-2026-0001"]')
    expect(btn).toBeNull()
  })

  it('opens receipt viewer modal on clicking view receipt button', async () => {
    db.tables.set('expenses', { rows: [sampleDbExpenseRow()], count: 1 })
    const c = await mount()
    const btn = c.querySelector('button[aria-label="View receipt for EXP-2026-0001"]') as HTMLButtonElement
    expect(btn).not.toBeNull()
    await act(async () => {
      btn.click()
    })
    expect(document.body.textContent).toContain('Receipt for EXP-2026-0001')
  })
})

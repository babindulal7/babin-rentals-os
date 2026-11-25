import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
}))
vi.mock('../supabase', () => ({ supabase: { from: mocks.from } }))
import { listPartnerStock } from '../queries/partnerStock'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.from.mockReturnValue({ select: mocks.select })
  mocks.select.mockReturnValue({ order: mocks.order })
})

describe('partner stock read contract', () => {
  it('reads the reviewed projection, maps actual unit identifiers and preserves masked costs', async () => {
    mocks.order.mockResolvedValue({ error: null, data: [{
      id: 'stock-1', partner_name: 'Synthetic partner', product_id: 'product-1',
      tracking_mode: 'Serialised', quantity: 1, available_from: '2026-11-01T00:00:00Z',
      available_until: '2026-12-01T00:00:00Z', cost_kind: null, cost_paisa: null,
      status: 'Active', notes: null, returned_at: null,
      products: { name: 'Synthetic gear', brand: null, model: null },
      product_units: [{ id: 'unit-1', asset_code: 'TAG-1', serial_number: 'SER-1', status: 'Available' }],
    }] })
    const result = await listPartnerStock()
    expect(mocks.from).toHaveBeenCalledWith('partner_stock_read_v')
    expect(mocks.select.mock.calls[0]?.[0]).not.toMatch(/products\s*\(|product_units\s*\(/)
    expect(result.error).toBeNull()
    expect(result.rows[0]).toMatchObject({ partnerName: 'Synthetic partner', costKind: null, costPaisa: null,
      units: [{ id: 'unit-1', assetCode: 'TAG-1', serialNumber: 'SER-1' }] })
  })

  it('does not present backend errors as successful empty data', async () => {
    mocks.order.mockResolvedValue({ data: null, error: { message: 'Read denied' } })
    expect(await listPartnerStock()).toEqual({ rows: [], error: 'Read denied' })
  })
})

describe('both partner stock projections remain role scoped', () => {
  it('keeps both the legacy and new views behind the same explicit staff role filter and money mask', () => {
    const sql = readFileSync('supabase/migrations/0272_partner_stock_read_contract.sql', 'utf8')
    for (const view of ['temporary_stock_v', 'partner_stock_read_v']) {
      const definition = sql.split('view public.' + view + ' with (security_barrier = true) as')[1]?.split(';')[0] ?? ''
      expect(definition).toContain("where public.auth_user_role()::text in")
      expect(definition).toContain("('Owner','Admin','Manager','Coordinator','Warehouse','Technician','Accounts')")
      expect(definition.match(/case when public\.auth_can_view_money\(\) then/g)).toHaveLength(2)
      expect(sql).toContain('revoke all on public.' + view + ' from public, anon, authenticated;')
      expect(sql).toContain('grant select on public.' + view + ' to authenticated;')
    }
  })
})

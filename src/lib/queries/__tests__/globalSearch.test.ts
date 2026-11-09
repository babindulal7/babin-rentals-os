import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  bookings: vi.fn(),
  clients: vi.fn(),
  inventory: vi.fn(),
  invoices: vi.fn(),
  supabaseFrom: vi.fn(),
}))

vi.mock('../bookings', () => ({ listBookings: mocks.bookings }))
vi.mock('../clients', () => ({ listClientRecords: mocks.clients }))
vi.mock('../inventory', () => ({ listInventory: mocks.inventory }))
vi.mock('../finance', () => ({ listInvoices: mocks.invoices }))
vi.mock('../../supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mocks.supabaseFrom(...args),
  },
}))

const { searchRecords } = await import('../globalSearch')

describe('global record search permissions and shaping (T3-21)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.bookings.mockResolvedValue({ rows: [] })
    mocks.clients.mockResolvedValue([])
    mocks.inventory.mockResolvedValue({ rows: [] })
    mocks.invoices.mockResolvedValue({ rows: [] })
    mocks.supabaseFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
  })

  it('does not query any record source for external clients or short terms', async () => {
    expect(await searchRecords({ role: 'Client', term: 'camera' })).toEqual([])
    expect(await searchRecords({ role: 'Manager', term: 'x' })).toEqual([])
    expect(mocks.bookings).not.toHaveBeenCalled()
    expect(mocks.clients).not.toHaveBeenCalled()
    expect(mocks.inventory).not.toHaveBeenCalled()
    expect(mocks.invoices).not.toHaveBeenCalled()
  })

  it('omits invoice reads for money-blind staff and returns navigable cards', async () => {
    mocks.bookings.mockResolvedValue({
      rows: [{ id: 'b1', bookingNo: '880', clientName: 'Film Co', project: null, stage: 'Booked', pickupAtAd: '2026-11-09' }],
    })
    mocks.clients.mockResolvedValue([{ id: 'c1', name: 'Film Co', phone: null }])
    mocks.inventory.mockResolvedValue({
      rows: [{ id: 'e1', name: 'FX3', category: 'Camera', trackingMode: 'Serial' }],
    })
    mocks.invoices.mockResolvedValue({ rows: [] })

    const results = await searchRecords({ role: 'Warehouse', term: 'film', limit: 10 })
    expect(results.map((r) => r.to)).toEqual(['/rentals/b1', '/clients/c1', '/inventory/e1'])
    expect(mocks.invoices).not.toHaveBeenCalled()
  })

  it('includes invoices for money-visible staff and caps each source', async () => {
    mocks.invoices.mockResolvedValue({ rows: [{ id: 'i1', invoiceNo: 'INV-1', status: 'Sent' }] })

    const results = await searchRecords({ role: 'Accounts', term: 'inv', limit: 50 })
    expect(results).toEqual([{ kind: 'invoice', id: 'i1', label: 'INV-1', detail: 'Sent', to: '/finance?invoice=i1' }])
    expect(mocks.invoices).toHaveBeenCalledWith({ search: 'inv', page: { index: 0, size: 10 } })
  })

  it('Key 1: finds booking by booking number (#880, BK-880, B-880)', async () => {
    mocks.bookings.mockResolvedValueOnce({
      rows: [{ id: 'b880', bookingNo: '880', clientName: 'Kathmandu Films', project: 'Doc Feature', stage: 'Booked', pickupAtAd: '2026-11-09' }],
    })

    const results = await searchRecords({ role: 'Coordinator', term: '#880', limit: 5 })
    expect(results[0]).toEqual({
      kind: 'booking',
      id: 'b880',
      label: '#880 · Kathmandu Films',
      detail: 'Doc Feature · Booked',
      to: '/rentals/b880',
    })
  })

  it('Key 2: finds bookings by client name via client matching', async () => {
    mocks.clients.mockResolvedValueOnce([{ id: 'c10', name: 'Kathmandu Films', phone: '+9779841234567' }])
    mocks.bookings.mockImplementation(async (opts: { chips?: { client_id?: string[] } }) => {
      if (opts.chips?.client_id?.includes('c10')) {
        return {
          rows: [{ id: 'b10', bookingNo: '1001', clientName: 'Kathmandu Films', project: 'Ad Shoot', stage: 'On Rent', pickupAtAd: '2026-11-10' }],
        }
      }
      return { rows: [] }
    })

    const results = await searchRecords({ role: 'Owner', term: 'Kathmandu Films', limit: 5 })
    const bookingResult = results.find((r) => r.kind === 'booking')
    expect(bookingResult).toBeDefined()
    expect(bookingResult?.id).toBe('b10')
    expect(bookingResult?.label).toBe('#1001 · Kathmandu Films')
  })

  it('Key 3: finds bookings by client phone number (Nepal mobile digits)', async () => {
    mocks.supabaseFrom.mockImplementation((table: string) => {
      if (table === 'client_directory_v') {
        return {
          select: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [{ id: 'cPhone', name: 'Mobile Client', phone: '+9779841234567' }],
              error: null,
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }
    })

    mocks.bookings.mockImplementation(async (opts: { chips?: { client_id?: string[] } }) => {
      if (opts.chips?.client_id?.includes('cPhone')) {
        return {
          rows: [{ id: 'bPhone', bookingNo: '1002', clientName: 'Mobile Client', project: 'Music Video', stage: 'Booked', pickupAtAd: '2026-11-10' }],
        }
      }
      return { rows: [] }
    })

    const results = await searchRecords({ role: 'Owner', term: '9841-234567', limit: 5 })
    const bookingResult = results.find((r) => r.kind === 'booking')
    expect(bookingResult?.id).toBe('bPhone')
    expect(bookingResult?.label).toBe('#1002 · Mobile Client')
  })

  it('Key 4: finds bookings by collector name', async () => {
    mocks.supabaseFrom.mockImplementation((table: string) => {
      if (table === 'client_collectors_v') {
        return {
          select: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [{ client_id: 'cCollector', name: 'Ramesh Sharma' }],
              error: null,
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }
    })

    mocks.bookings.mockImplementation(async (opts: { chips?: { client_id?: string[] } }) => {
      if (opts.chips?.client_id?.includes('cCollector')) {
        return {
          rows: [{ id: 'bCollector', bookingNo: '1003', clientName: 'Collector Client', project: null, stage: 'Booked', pickupAtAd: '2026-11-10' }],
        }
      }
      return { rows: [] }
    })

    const results = await searchRecords({ role: 'Coordinator', term: 'Ramesh', limit: 5 })
    const bookingResult = results.find((r) => r.kind === 'booking')
    expect(bookingResult?.id).toBe('bCollector')
    expect(bookingResult?.label).toBe('#1003 · Collector Client')
  })

  it('Key 5: finds bookings by equipment item name on lines', async () => {
    mocks.inventory.mockResolvedValueOnce({
      rows: [{ id: 'prod-fx3', name: 'Sony FX3 Cinema Camera', category: 'Camera', trackingMode: 'Serial' }],
    })

    mocks.supabaseFrom.mockImplementation((table: string) => {
      if (table === 'booking_lines_v') {
        return {
          select: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [{ booking_id: 'bFx3', description: 'Sony FX3', product_id: 'prod-fx3' }],
              error: null,
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }
    })

    mocks.bookings.mockImplementation(async (opts: { chips?: { id?: string[] } }) => {
      if (opts.chips?.id?.includes('bFx3')) {
        return {
          rows: [{ id: 'bFx3', bookingNo: '1004', clientName: 'Cinema Co', project: 'Feature Film', stage: 'Packed', pickupAtAd: '2026-11-11' }],
        }
      }
      return { rows: [] }
    })

    const results = await searchRecords({ role: 'Warehouse', term: 'Sony FX3', limit: 5 })
    const bookingResult = results.find((r) => r.kind === 'booking')
    expect(bookingResult?.id).toBe('bFx3')
    expect(bookingResult?.label).toBe('#1004 · Cinema Co')
  })

  it('Key 6 & 7: finds bookings by hardware serial number and unit asset tag', async () => {
    mocks.supabaseFrom.mockImplementation((table: string) => {
      if (table === 'product_units_v') {
        return {
          select: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [{ id: 'unit-1', product_id: 'prod-1', serial_no: 'SN-FX3-9999', asset_tag: 'CAM-01-U01' }],
              error: null,
            }),
          }),
        }
      }
      if (table === 'booking_line_units') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [{ booking_id: 'bSerial', booking_line_id: 'line-1', asset_id: 'unit-1' }],
              error: null,
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }
    })

    mocks.bookings.mockImplementation(async (opts: { chips?: { id?: string[] } }) => {
      if (opts.chips?.id?.includes('bSerial')) {
        return {
          rows: [{ id: 'bSerial', bookingNo: '1005', clientName: 'Pro Studio', project: null, stage: 'On Rent', pickupAtAd: '2026-11-12' }],
        }
      }
      return { rows: [] }
    })

    const results = await searchRecords({ role: 'Warehouse', term: 'SN-FX3-9999', limit: 5 })
    const bookingResult = results.find((r) => r.kind === 'booking')
    expect(bookingResult?.id).toBe('bSerial')
    expect(bookingResult?.label).toBe('#1005 · Pro Studio')
  })

  it('shows recent bookings first (pickup_at descending)', async () => {
    mocks.bookings.mockResolvedValueOnce({
      rows: [
        { id: 'bOlder', bookingNo: '100', clientName: 'Client A', project: null, stage: 'Closed', pickupAtAd: '2026-08-01' },
        { id: 'bNewer', bookingNo: '200', clientName: 'Client B', project: null, stage: 'Booked', pickupAtAd: '2026-11-15' },
      ],
    })

    const results = await searchRecords({ role: 'Owner', term: 'Client', limit: 5 })
    const bookings = results.filter((r) => r.kind === 'booking')
    expect(bookings.length).toBe(2)
    expect(bookings[0]?.id).toBe('bNewer')
    expect(bookings[1]?.id).toBe('bOlder')
  })

  it('aborts search immediately when signal is aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    const results = await searchRecords({ role: 'Owner', term: 'camera', limit: 5, signal: controller.signal })
    expect(results).toEqual([])
    expect(mocks.bookings).not.toHaveBeenCalled()
    expect(mocks.clients).not.toHaveBeenCalled()
  })

  it('strictly enforces Law 6: never displays money in any booking or search result card', async () => {
    mocks.bookings.mockResolvedValueOnce({
      rows: [{ id: 'b6', bookingNo: '1006', clientName: 'Floor Client', project: 'Private Project', stage: 'Booked', pickupAtAd: '2026-11-10' }],
    })

    const results = await searchRecords({ role: 'Warehouse', term: 'Floor Client', limit: 5 })
    for (const r of results) {
      expect(r.label).not.toMatch(/Rs|\$|NPR|paisa|[0-9]+,[0-9]+/)
      expect(r.detail).not.toMatch(/Rs|\$|NPR|paisa|[0-9]+,[0-9]+/)
    }
  })
})

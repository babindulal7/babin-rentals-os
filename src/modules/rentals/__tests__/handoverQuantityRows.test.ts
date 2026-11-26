import { describe, expect, it } from 'vitest'
import type { FloorBooking } from '../../../lib/queries/bookings'
import { buildHandoverRows } from '../HandoverWorkspace'

const floor: FloorBooking = {
  id: 'booking', bookingNo: 'B-1', stage: 'Packed', clientName: null, project: null,
  pickupAtAd: null, returnAtAd: null, actualReturnAtAd: null, deliveryType: null,
  isCancelled: false, isClosed: false, linesPresence: 'present',
  lines: [{ id: 'cable', qty: 4, lineType: 'Equipment', description: 'Cable', productId: null,
    productName: null, trackingMode: 'Quantity', parentLineId: null, sortOrder: 1,
    unitsPresence: 'present', units: [] }],
}

describe('quantity handover rows', () => {
  it('only offers the uncollected quantity after a partial pickup', () => {
    const rows = buildHandoverRows(floor, new Map([['cable', 2]]))
    expect(rows.map(({ qty, prior }) => ({ qty, prior }))).toEqual([
      { qty: 2, prior: 'Picked Up' }, { qty: 2, prior: null },
    ])
  })
  it('shows a fully collected line as recorded and no longer selectable', () => {
    const rows = buildHandoverRows(floor, new Map([['cable', 4]]))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: 'Cable', qty: 4, prior: 'Picked Up' })
  })
})

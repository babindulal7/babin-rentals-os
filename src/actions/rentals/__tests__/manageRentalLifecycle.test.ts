import { beforeEach, describe, expect, it, vi } from 'vitest'
import { archiveRental, revertRental } from '../manageRentalLifecycle'
import { canManageRentalLifecycle } from '../../../lib/rbac'
import { rentalCanArchive, rentalRevertTargets } from '../../../lib/rentalLifecycle'
import type { SystemRole } from '../../../types/database'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/supabase', () => ({ supabase: { rpc } }))
const input = { bookingId: 'booking-1', reason: 'Client changed their plans', clientUuid: 'request-1' }
const manager = { userId: 'manager-1', role: 'Manager' as const }
const roles: SystemRole[] = ['Owner','Admin','Manager','Coordinator','Accounts','Warehouse','Technician','Driver','Client']

beforeEach(() => rpc.mockReset())
describe('O16-3 rental lifecycle permissions and boundaries', () => {
  it.each(roles)('grants only M+ online: %s', async role => {
    expect(canManageRentalLifecycle(role)).toBe(['Owner','Admin','Manager'].includes(role))
    expect(canManageRentalLifecycle(role, false)).toBe(false)
    if (!canManageRentalLifecycle(role)) {
      await expect(archiveRental(input, { userId: 'test', role })).rejects.toThrow(/cannot perform/)
      expect(rpc).not.toHaveBeenCalled()
    }
  })
  it('blocks offline writes before RPC', async () => {
    await expect(revertRental({ ...input, targetStage: 'Quote' }, { ...manager, isOnline: false })).rejects.toThrow(/offline/i)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('offers only earlier stages before handover', () => {
    const facts = { id: '1', bookingNo: '1', stage: 'Packed' }
    expect(rentalRevertTargets(facts)).toEqual(['Booked','Quote'])
    expect(rentalRevertTargets({ ...facts, stage: 'Booked' })).toEqual(['Quote'])
    for (const stage of ['Quote','On Rent','Returned','Closed']) expect(rentalRevertTargets({ ...facts, stage })).toEqual([])
    expect(rentalRevertTargets({ ...facts, isCancelled: true })).toEqual([])
    expect(rentalCanArchive(facts)).toBe(false)
    expect(rentalCanArchive({ ...facts, isCancelled: true })).toBe(true)
    expect(rentalCanArchive({ ...facts, stage: 'Closed' })).toBe(true)
  })
  it('requires a reason and refuses an unconfirmed response', async () => {
    await expect(archiveRental({ ...input, reason: 'short' }, manager)).rejects.toThrow(/ten characters/)
    rpc.mockResolvedValue({ data: null, error: null })
    await expect(archiveRental(input, manager)).rejects.toThrow(/did not confirm/)
  })
  it('passes the same request key and server-owned identity on retry', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Disconnected' } })
      .mockResolvedValueOnce({ data: { booking_id: input.bookingId, lifecycle_action: 'revert' }, error: null })
    const request = { ...input, targetStage: 'Quote' as const }
    await expect(revertRental(request, manager)).rejects.toThrow('Disconnected')
    await expect(revertRental(request, manager)).resolves.toMatchObject({ lifecycle_action: 'revert' })
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1])
    expect(rpc.mock.calls[1]?.[1].p_payload).not.toHaveProperty('actor_id')
  })
})

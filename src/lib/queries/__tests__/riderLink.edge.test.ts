// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchRiderJobByToken,
  riderMarkJobPickedUp,
  riderCompleteJobDelivery,
} from '../riderLink'

const edge = vi.hoisted(() => ({
  invoke: vi.fn(),
  rpc: vi.fn(),
}))

// Exercise the production branch, not the offline/localStorage mock.
vi.mock('../../supabase', () => ({
  IS_MOCK: false,
  supabase: {
    functions: { invoke: edge.invoke },
    rpc: edge.rpc,
  },
}))

const TOKEN = '0123456789abcdef0123456789abcdef'
const FAILURE = /Unable to verify the rider link/

describe('one-time rider link — Edge-only production boundary (0191)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns a rider job only when the Edge Function returns data', async () => {
    const job = { job_id: 'job-1', booking_no: 'BR-1', items: [] }
    edge.invoke.mockResolvedValue({ data: { data: job }, error: null })

    await expect(fetchRiderJobByToken(TOKEN)).resolves.toEqual(job)
    expect(edge.invoke).toHaveBeenCalledWith('rider-link', {
      body: { action: 'get_job', token: TOKEN },
    })
    expect(edge.rpc).not.toHaveBeenCalled()
  })

  it('never falls back to direct token RPCs when the Edge Function is offline', async () => {
    edge.invoke.mockRejectedValue(new Error('network offline'))

    await expect(fetchRiderJobByToken(TOKEN)).rejects.toThrow(FAILURE)
    await expect(riderMarkJobPickedUp(TOKEN)).rejects.toThrow(FAILURE)
    await expect(riderCompleteJobDelivery(TOKEN, 'Receiver Name')).rejects.toThrow(FAILURE)

    expect(edge.rpc).not.toHaveBeenCalled()
    expect(edge.invoke).toHaveBeenCalledTimes(3)
  })

  it('refuses invalid/expired Edge responses and never calls an RPC', async () => {
    edge.invoke.mockResolvedValue({ data: { error: 'expired' }, error: null })
    await expect(fetchRiderJobByToken(TOKEN)).rejects.toThrow(FAILURE)

    edge.invoke.mockResolvedValue({ data: null, error: new Error('invalid token') })
    await expect(riderMarkJobPickedUp(TOKEN)).rejects.toThrow(FAILURE)

    edge.invoke.mockResolvedValue({ data: {}, error: null })
    await expect(riderCompleteJobDelivery(TOKEN, 'Receiver Name')).rejects.toThrow(FAILURE)

    expect(edge.rpc).not.toHaveBeenCalled()
  })

  it('accepts only explicit Edge success for pickup and delivery', async () => {
    edge.invoke.mockResolvedValue({ data: { success: true }, error: null })

    await expect(riderMarkJobPickedUp(TOKEN)).resolves.toBeUndefined()
    await expect(riderCompleteJobDelivery(TOKEN, 'Receiver Name')).resolves.toBeUndefined()

    expect(edge.invoke).toHaveBeenNthCalledWith(1, 'rider-link', {
      body: { action: 'pickup', token: TOKEN },
    })
    expect(edge.invoke).toHaveBeenNthCalledWith(2, 'rider-link', {
      body: {
        action: 'deliver',
        token: TOKEN,
        receiver_name: 'Receiver Name',
        signature_svg: null,
        photo_url: null,
      },
    })
    expect(edge.rpc).not.toHaveBeenCalled()
  })

  it('rejects empty tokens before contacting the Edge Function', async () => {
    await expect(fetchRiderJobByToken('  ')).rejects.toThrow(/valid rider delivery token/)
    await expect(riderMarkJobPickedUp('  ')).rejects.toThrow(/valid rider delivery token/)
    await expect(riderCompleteJobDelivery('  ', 'Receiver')).rejects.toThrow(/valid rider delivery token/)
    expect(edge.invoke).not.toHaveBeenCalled()
    expect(edge.rpc).not.toHaveBeenCalled()
  })
})

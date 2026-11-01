import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Production mode: the rider path is the rider-link Edge Function only (SEC-2, migration 0192).
const invoke = vi.fn()
const rpc = vi.fn()
vi.mock('../../supabase', () => ({
  IS_MOCK: false,
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) }, rpc: (...args: unknown[]) => rpc(...args), from: vi.fn() },
}))

import { fetchRiderJobByToken, riderMarkJobPickedUp, riderCompleteJobDelivery } from '../riderLink'

// What @supabase/functions-js returns for a non-2xx response: a generic message plus the Response in `context`.
function httpError(status: number, body: unknown) {
  return {
    data: null,
    error: {
      name: 'FunctionsHttpError',
      message: 'Edge Function returned a non-2xx status code',
      context: new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
    },
  }
}

// What it returns when the request never reached the function.
const networkError = {
  data: null,
  error: { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function', context: new TypeError('fetch failed') },
}

describe('riderLink talks to the Edge Function only (SEC-2)', () => {
  beforeEach(() => {
    invoke.mockReset()
    rpc.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the job from the Edge Function and never calls the database directly', async () => {
    invoke.mockResolvedValue({ data: { data: { job_id: 'job-1', booking_no: 'BK-1' } }, error: null })
    const job = await fetchRiderJobByToken('  tok-1  ')
    expect(job.job_id).toBe('job-1')
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('rider-link', { body: { action: 'get_job', token: 'tok-1' } })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('shows the Edge Function\'s own reason for a dead link, with no database fallback', async () => {
    invoke.mockResolvedValue(httpError(410, { error: 'Delivery link has been revoked' }))
    await expect(fetchRiderJobByToken('tok-1')).rejects.toThrow('Delivery link has been revoked')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('treats a 200 without a job as an invalid link', async () => {
    invoke.mockResolvedValue({ data: {}, error: null })
    await expect(fetchRiderJobByToken('tok-1')).rejects.toThrow(/invalid, expired, or completed/i)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('pickup: surfaces the reason and never replays the write over RPC', async () => {
    invoke.mockResolvedValue(httpError(400, { error: 'Delivery link has expired' }))
    await expect(riderMarkJobPickedUp('tok-1')).rejects.toThrow('Delivery link has expired')
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('deliver: a network failure gives a plain message and the write is sent exactly once', async () => {
    invoke.mockResolvedValue(networkError)
    await expect(riderCompleteJobDelivery('tok-1', 'Suman Receiver', '<svg/>', undefined)).rejects.toThrow(
      /could not reach the delivery service/i,
    )
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('rider-link', {
      body: { action: 'deliver', token: 'tok-1', receiver_name: 'Suman Receiver', signature_svg: '<svg/>', photo_url: null },
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('deliver: an "already completed" answer is shown as is, not retried', async () => {
    invoke.mockResolvedValue(httpError(400, { error: 'Delivery link has already been completed' }))
    await expect(riderCompleteJobDelivery('tok-1', 'Suman Receiver')).rejects.toThrow('already been completed')
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('a non-JSON error body falls back to the plain message', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { name: 'FunctionsHttpError', message: 'x', context: new Response('<html>gateway</html>', { status: 502 }) },
    })
    await expect(riderMarkJobPickedUp('tok-1')).rejects.toThrow(/could not reach the delivery service/i)
  })

  it('does not hash on the client: the Edge path works where subtle crypto is unavailable', async () => {
    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) })
    invoke.mockResolvedValue({ data: { data: { job_id: 'job-1' } }, error: null })
    await expect(fetchRiderJobByToken('tok-1')).resolves.toMatchObject({ job_id: 'job-1' })
    expect(invoke).toHaveBeenCalledTimes(1)
  })
})

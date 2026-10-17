// @vitest-environment jsdom
/**
 * `useLoad`, driven — the same `Probe` shape as `useList.test.tsx`, for the
 * same reason (no `@testing-library/react` dependency).
 *
 * What is pinned: a read is loading until it settles; a failure is a bare
 * reason, never a fallback value; an offline failure says so and retries on
 * the `online` event; a failed refresh keeps the last good data; a disabled
 * read never runs.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useLoad, OFFLINE_REASON, loadFailureReason, type LoadResult, type UseLoadOptions } from '../useLoad'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

let container: HTMLDivElement
let root: Root
let latest: LoadResult<number> | null = null

function Probe({ fetcher, options }: { fetcher: () => Promise<number>; options?: UseLoadOptions }) {
  latest = useLoad(fetcher, options)
  return null
}

async function mount(fetcher: () => Promise<number>, options?: UseLoadOptions) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<Probe fetcher={fetcher} {...(options ? { options } : {})} />)
  })
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value })
}

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  latest = null
  setOnline(true)
})

describe('useLoad', () => {
  it('is loading until the read settles, then holds the data', async () => {
    let resolve!: (n: number) => void
    const fetcher = () => new Promise<number>((r) => (resolve = r))
    await mount(fetcher)
    expect(latest?.loading).toBe(true)
    expect(latest?.data).toBeNull()

    await act(async () => resolve(7))
    expect(latest?.loading).toBe(false)
    expect(latest?.data).toBe(7)
    expect(latest?.error).toBeNull()
    expect(latest?.lastFetchedAt).toBeInstanceOf(Date)
  })

  it('reports a failure as the bare reason, with no fallback value', async () => {
    await mount(() => Promise.reject(new Error('relation "payments" does not exist')))
    expect(latest?.loading).toBe(false)
    expect(latest?.data).toBeNull()
    expect(latest?.error).toBe('relation "payments" does not exist')
    expect(latest?.offline).toBe(false)
  })

  it('words an offline failure as offline, and retries by itself on reconnect', async () => {
    setOnline(false)
    const fetcher = vi.fn<() => Promise<number>>().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(3)
    await mount(fetcher)
    expect(latest?.error).toBe(OFFLINE_REASON)
    expect(latest?.offline).toBe(true)

    setOnline(true)
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(latest?.error).toBeNull()
    expect(latest?.data).toBe(3)
  })

  it('keeps the last good data when a Retry fails', async () => {
    const fetcher = vi.fn<() => Promise<number>>().mockResolvedValueOnce(5).mockRejectedValueOnce(new Error('JWT expired'))
    await mount(fetcher)
    expect(latest?.data).toBe(5)

    await act(async () => latest?.reload())
    expect(latest?.error).toBe('JWT expired')
    expect(latest?.data).toBe(5)
  })

  it('never runs a disabled read, and is not loading while disabled', async () => {
    const fetcher = vi.fn(() => Promise.resolve(1))
    await mount(fetcher, { enabled: false })
    expect(fetcher).not.toHaveBeenCalled()
    expect(latest?.loading).toBe(false)
    expect(latest?.data).toBeNull()
  })

  it('re-runs when the key changes', async () => {
    const fetcher = vi.fn(() => Promise.resolve(1))
    await mount(fetcher, { key: 'a' })
    await act(async () => {
      root.render(<Probe fetcher={fetcher} options={{ key: 'b' }} />)
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})

describe('loadFailureReason', () => {
  it('prefers the offline sentence whenever the browser is offline', () => {
    setOnline(false)
    expect(loadFailureReason(new Error('anything'))).toBe(OFFLINE_REASON)
  })

  it('falls back to a plain sentence rather than an empty string', () => {
    setOnline(true)
    expect(loadFailureReason(new Error(''))).toBe('The read failed without saying why.')
    expect(loadFailureReason('timeout')).toBe('timeout')
  })
})

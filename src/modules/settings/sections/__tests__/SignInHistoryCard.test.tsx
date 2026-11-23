// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SignInHistoryCard } from '../SignInHistoryCard'
import type { RecentSignInEvent } from '../../../../lib/loginAudit'

const { mockFetchEvents } = vi.hoisted(() => ({
  mockFetchEvents: vi.fn(),
}))

let currentRole = 'Owner'

vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: '00000000-0000-0000-0000-000000000101', role: currentRole, name: 'Babin Dulal' } }),
}))

vi.mock('../../../../lib/loginAudit', () => ({
  canViewSignInHistory: (role: string) => role === 'Owner' || role === 'Admin',
  fetchRecentSignInEvents: (...args: unknown[]) => mockFetchEvents(...args),
}))

describe('SignInHistoryCard (T1-18 / B22 / B23)', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    currentRole = 'Owner'
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount()
      })
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container)
    }
    container = null
    root = null
  })

  const sampleEvents: RecentSignInEvent[] = [
    {
      id: 'evt-1',
      user_id: '00000000-0000-0000-0000-000000000101',
      full_name: 'Babin Joshi',
      role: 'Owner',
      device_hash: 'dev-macbook-pro-m2',
      user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      ip_address: '27.34.20.18',
      kind: 'sign-in',
      metadata: { os: 'macOS', browser: 'Chrome' },
      created_at: '2026-11-23T04:00:00Z',
    },
    {
      id: 'evt-2',
      user_id: '00000000-0000-0000-0000-000000000102',
      full_name: 'Suman Admin',
      role: 'Admin',
      device_hash: 'dev-ipad-counter-01',
      user_agent: 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X)',
      ip_address: '27.34.20.19',
      kind: 'new_device',
      metadata: { os: 'iPadOS', browser: 'Mobile Safari' },
      created_at: '2026-11-23T03:00:00Z',
    },
  ]

  it('renders sign-in history table for Owner', async () => {
    mockFetchEvents.mockResolvedValue(sampleEvents)

    await act(async () => {
      root!.render(<SignInHistoryCard />)
    })

    const text = container?.textContent ?? ''
    expect(text).toContain('Sign-In History')
    expect(text).toContain('Babin Joshi')
    expect(text).toContain('Sign-in')
    expect(text).toContain('Suman Admin')
    expect(text).toContain('New Device')
    expect(text).toContain('27.34.20.18')
  })

  it('renders sign-in history table for Admin', async () => {
    currentRole = 'Admin'
    mockFetchEvents.mockResolvedValue(sampleEvents)

    await act(async () => {
      root!.render(<SignInHistoryCard />)
    })

    const text = container?.textContent ?? ''
    expect(text).toContain('Sign-In History')
    expect(text).toContain('Babin Joshi')
    expect(text).toContain('Suman Admin')
  })

  it('renders nothing (null) for Manager and Floor roles (B22)', async () => {
    currentRole = 'Manager'
    mockFetchEvents.mockResolvedValue(sampleEvents)

    await act(async () => {
      root!.render(<SignInHistoryCard />)
    })

    const text = container?.textContent ?? ''
    expect(text).toBe('')
    expect(mockFetchEvents).not.toHaveBeenCalled()
  })

  it('displays empty state when no events exist', async () => {
    mockFetchEvents.mockResolvedValue([])

    await act(async () => {
      root!.render(<SignInHistoryCard />)
    })

    const text = container?.textContent ?? ''
    expect(text).toContain('Sign-In History')
    expect(text).toContain('No sign-in events recorded yet.')
  })

  it('displays error banner and allows retry when fetch fails', async () => {
    mockFetchEvents.mockRejectedValue(new Error('Network connection error'))

    await act(async () => {
      root!.render(<SignInHistoryCard />)
    })

    let text = container?.textContent ?? ''
    expect(text).toContain('Network connection error')
    expect(text).toContain('Retry')

    mockFetchEvents.mockResolvedValue(sampleEvents)
    const retryBtn = container?.querySelector('button')
    await act(async () => {
      retryBtn?.click()
    })

    text = container?.textContent ?? ''
    expect(text).toContain('Babin Joshi')
  })
})

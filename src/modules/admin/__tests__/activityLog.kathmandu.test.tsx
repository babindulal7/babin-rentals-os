// @vitest-environment jsdom
/**
 * Law 7 — the activity log shows the Kathmandu clock and the Kathmandu day, the same as the audit log.
 *
 * A row stored at 21:44 UTC on 23 Nov 2026 happened at 03:29 on 24 Nov in Nepal. The screen must say so,
 * both in the time and in the day heading the row sits under.
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
vi.mock('../../../lib/queries/activity', async (orig) => {
  const real = await orig<typeof import('../../../lib/queries/activity')>()
  return {
    ...real,
    listActivityEvents: async () => ({
      rows: [
        {
          id: 'row-utc-evening',
          timestamp: '2026-11-23T21:44:00.000Z',
          user: 'Babin Dulal',
          action: 'Signed in',
          module: 'Authentication',
          target: null,
          where: 'Sign-in',
          status: 'Success',
          ip: '',
          location: '',
        },
      ],
      total: 1,
    }),
  }
})

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: ActivityLog } = await import('../ActivityLog')

let container: HTMLDivElement
let root: Root

beforeEach(async () => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<ActivityLog />)
  })
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('Activity Log — Kathmandu time and day (Law 7)', () => {
  it('shows the Kathmandu clock, not the UTC one', () => {
    expect(container.textContent).toContain('03:29 AM')
    expect(container.textContent).not.toContain('21:44')
  })

  it('files the row under the Kathmandu day it happened on', () => {
    const heading = container.querySelector('section[aria-label^="Activity on"]')?.getAttribute('aria-label')
    expect(heading).toBe('Activity on 24/11/2026')
  })
})

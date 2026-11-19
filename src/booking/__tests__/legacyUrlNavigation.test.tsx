// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// Mock clientAuthApi
vi.mock('../lib/clientAuthApi', () => ({
  getCurrentClientUser: vi.fn().mockResolvedValue(null),
  fetchOnlineProfile: vi.fn().mockResolvedValue(null),
}))

// Mock awayMode
vi.mock('@/lib/awayMode', () => ({
  fetchOnlineBookingAwayStatus: vi.fn().mockResolvedValue({
    is_away: false,
    configured_away: false,
    can_accept_requests: true,
    message: '',
    resume_date: null,
  }),
}))

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const { default: BookingApp } = await import('../App')

let container: HTMLDivElement
let root: Root

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<BookingApp />)
  })
}

async function unmount() {
  if (root) {
    await act(async () => {
      root.unmount()
    })
  }
  container?.remove()
}

describe('T7-17 BookingApp Legacy URL Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await unmount()
    window.history.replaceState({}, '', '/')
  })

  it('automatically opens product detail modal when navigating to old Booqable product URL', async () => {
    window.history.replaceState({}, '', '/products/sony-fx3-cinema-line')
    await mount()

    // Wait for items to load and effect to trigger
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(container.textContent).toContain('Sony FX3 Cinema Line Camera')
    expect(container.textContent).toContain('transferred from old store link')
  })

  it('automatically selects category filter when navigating to old Booqable category URL', async () => {
    window.history.replaceState({}, '', '/categories/cameras')
    await mount()

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(container.textContent).toContain('Showing Cameras category')
    // Active category tab should be Cameras
    const activeChip = container.querySelector('.category-tab.active')
    expect(activeChip?.textContent).toContain('Cameras')
  })

  it('lands safely on catalogue home without error when visiting an unknown old URL', async () => {
    window.history.replaceState({}, '', '/unknown/legacy/deep-page-from-2020')
    await mount()

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(container.textContent).toContain('Cinema Equipment Catalogue')
    expect(container.textContent).toContain('Welcome to the new Babin Rentals store')
    expect(container.querySelector('.empty-state')).toBeNull()
  })
})

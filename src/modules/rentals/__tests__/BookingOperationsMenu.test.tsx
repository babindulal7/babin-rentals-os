// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BookingStatus } from '../../../lib/workflow'
import BookingOperationsMenu from '../BookingOperationsMenu'
import { OperationsWorkspaceProvider } from '../../operations/OperationsWorkspaceContext'

vi.mock('../PackingWorkspace', () => ({ default: () => <div>Packing workspace body</div> }))
vi.mock('../HandoverWorkspace', () => ({ default: () => <div>Handover workspace body</div> }))
vi.mock('../ReturnWorkspace', () => ({ default: () => <div>Return workspace body</div> }))
vi.mock('../ResetWorkspace', () => ({ default: () => <div>Reset workspace body</div> }))

let currentRole: string | null = 'Owner'
let mockViewport: 'desktop' | 'phone' = 'desktop'
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: currentRole ? { id: 'u-test', name: 'Test User', role: currentRole, isSharedDevice: false } : null,
    loading: false,
    isLocked: false,
  }),
}))

vi.mock('../../../lib/device', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device')>()),
  useViewport: () => mockViewport,
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

let container: HTMLDivElement
let root: Root
let path = ''

function PathProbe() {
  path = useLocation().pathname
  return null
}

async function mount(bookingNo?: string, bookingStatus?: BookingStatus) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/rentals/new']}>
        <PathProbe />
        <OperationsWorkspaceProvider>
          <BookingOperationsMenu
            {...(bookingNo ? { bookingNo } : {})}
            {...(bookingStatus ? { bookingStatus } : {})}
          />
        </OperationsWorkspaceProvider>
      </MemoryRouter>,
    )
  })
}

async function openMenu() {
  const trigger = [...container.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Operations')
  await act(async () => trigger?.click())
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
}

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  path = ''
  currentRole = 'Owner'
  mockViewport = 'desktop'
})

describe('booking-level Operations dropdown', () => {
  it('refuses all operations while the authoritative booking status is missing', async () => {
    await mount('B-715'); await openMenu()
    const items = [...document.querySelectorAll('[role="menuitem"]')]
    expect(items).toHaveLength(4)
    expect(items.every(item => item.getAttribute('aria-disabled') === 'true')).toBe(true)
    expect(items[0]?.textContent).toContain('status is still loading')
  })

  it('returns keyboard focus to the trigger on Escape', async () => {
    await mount('B-715', 'Booked'); await openMenu()
    const popup = document.querySelector('[role="menu"]')
    await act(async () => popup?.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',bubbles:true})))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
    expect(document.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Operations')
  })
  it('contains exactly the four specified operations', async () => {
    await mount('B-715', 'Booked')
    await openMenu()

    const labels = [...document.querySelectorAll('[role="menuitem"]')].map((item) => item.querySelector('.booking-operations__name')?.textContent?.trim())
    expect(labels).toEqual(['Packing', 'Handover', 'Return & Inspection', 'Cleaning & Reset'])
  })

  it('opens the selected booking operation in-place', async () => {
    await mount('B-715', 'Booked')
    await openMenu()

    const packing = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.querySelector('.booking-operations__name')?.textContent?.trim() === 'Packing',
    )
    await act(async () => packing?.click())
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })

    expect(path).toBe('/rentals/new')
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('Operations · B-715')
    await act(async () => container.querySelector<HTMLButtonElement>('[role="dialog"] button[aria-label="Close"]')?.click())
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Operations')
  })

  it('keeps all four choices visible but unavailable before a new booking is saved', async () => {
    await mount()
    await openMenu()

    const items = [...document.querySelectorAll('[role="menuitem"]')]
    expect(items).toHaveLength(4)
    expect(items.every((item) => item.getAttribute('aria-disabled') === 'true')).toBe(true)
    expect(items[0]?.getAttribute('title')).toContain('Save and confirm this booking')
  })

  it('disables Handover for Coordinator role who lacks client-facing handover grant (P0-B, D3)', async () => {
    currentRole = 'Coordinator'
    await mount('B-715', 'Packed')
    await openMenu()

    const handover = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.querySelector('.booking-operations__name')?.textContent?.trim() === 'Handover',
    )
    expect(handover?.getAttribute('aria-disabled')).toBe('true')
    expect(handover?.getAttribute('title')).toContain('permission')
  })

  it('permits Handover for Technician role per Ruling D3 (T2-05)', async () => {
    currentRole = 'Technician'
    await mount('B-715', 'Packed')
    await openMenu()

    const handover = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.querySelector('.booking-operations__name')?.textContent?.trim() === 'Handover',
    )
    expect(handover?.getAttribute('aria-disabled')).toBe('false')
  })

  it('opens next actionable stage in one click via quick action button without opening menu', async () => {
    await mount('B-715', 'Booked')
    const quickBtn = container.querySelector<HTMLButtonElement>('.booking-operations__quick')
    expect(quickBtn).not.toBeNull()
    expect(quickBtn?.textContent).toContain('Packing')
    await act(async () => quickBtn?.click())

    expect(path).toBe('/rentals/new')
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('Operations · B-715')
  })

  describe('Quick Action Gating & Fallback Safety', () => {
    it('suppresses quick action button for anonymous (not signed in) users', async () => {
      currentRole = null
      await mount('B-715', 'Booked')
      expect(container.querySelector('.booking-operations__quick')).toBeNull()
      const trigger = container.querySelector('button[aria-label="Operations"]')
      expect(trigger).not.toBeNull()
    })

    it('suppresses quick action button for Driver role across stages', async () => {
      currentRole = 'Driver'
      await mount('B-715', 'Booked')
      expect(container.querySelector('.booking-operations__quick')).toBeNull()
    })

    it('suppresses quick action button for Coordinator role across stages', async () => {
      currentRole = 'Coordinator'
      await mount('B-715', 'Booked')
      expect(container.querySelector('.booking-operations__quick')).toBeNull()
    })

    it('suppresses quick action button for Accounts when stage is Packed (lacks Handover grant)', async () => {
      currentRole = 'Accounts'
      await mount('B-715', 'Packed')
      expect(container.querySelector('.booking-operations__quick')).toBeNull()
    })

    it('shows quick action button for Technician when stage is Packed per Ruling D3 (T2-05)', async () => {
      currentRole = 'Technician'
      await mount('B-715', 'Packed')
      const quickBtn = container.querySelector<HTMLButtonElement>('.booking-operations__quick')
      expect(quickBtn).not.toBeNull()
      expect(quickBtn?.textContent).toContain('Handover')
    })

    it('shows quick action button for Warehouse role on permitted stages', async () => {
      currentRole = 'Warehouse'
      await mount('B-715', 'Booked')
      const quickBtn = container.querySelector<HTMLButtonElement>('.booking-operations__quick')
      expect(quickBtn).not.toBeNull()
      expect(quickBtn?.textContent).toContain('Packing')
    })

    it('suppresses quick action button on Closed stage even for Owner', async () => {
      currentRole = 'Owner'
      await mount('B-715', 'Closed')
      expect(container.querySelector('.booking-operations__quick')).toBeNull()
    })

    it('suppresses quick action button on Cancelled stage even for Owner', async () => {
      currentRole = 'Owner'
      await mount('B-715', 'Cancelled' as unknown as BookingStatus)
      expect(container.querySelector('.booking-operations__quick')).toBeNull()
    })

    it('suppresses quick action button on invalid or unknown booking status', async () => {
      currentRole = 'Owner'
      await mount('B-715', 'UnknownStage' as unknown as BookingStatus)
      expect(container.querySelector('.booking-operations__quick')).toBeNull()
    })

    it('renders responsive mobile drawer on phone viewport vs desktop menu', async () => {
      mockViewport = 'phone'
      await mount('B-715', 'Booked')
      const quickBtn = container.querySelector<HTMLButtonElement>('.booking-operations__quick')
      expect(quickBtn).not.toBeNull()
      await openMenu()
      expect(document.querySelector('[data-slot="drawer-popup"], [role="dialog"]')).not.toBeNull()
    })
  })
})

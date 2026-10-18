// @vitest-environment jsdom
/**
 * Finance header actions by room — zoom audit, 15 Oct 2026.
 *
 * Measured in the mock build: at 911px (a 1366px laptop at 150%) the Finance title was
 * 0px wide, and at 1280px with the sidebar open (a 1920px laptop at 150%) it was 15px.
 * Wherever the header is compact — any tablet, or a desktop header narrower than the
 * widest tablet header — Create Invoice and Export join More, as they already did on a
 * phone (RULINGS-2026-10-13). Record Payment keeps its full label beside the title.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

const state = vi.hoisted(() => ({ viewport: 'desktop' as 'desktop' | 'tablet' | 'phone' }))

vi.mock('../../../lib/device', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/device')>()
  return { ...actual, useViewport: () => state.viewport }
})
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'USR-1', name: 'Babin', role: 'Owner', isSharedDevice: false } }),
}))
vi.mock('../../../lib/supabase', () => {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'or', 'in', 'gte', 'lte', 'is', 'not', 'order', 'range', 'eq', 'neq', 'limit']) builder[m] = () => builder
  builder.then = (resolve: (v: { data: unknown[]; error: null; count: number }) => unknown) => resolve({ data: [], error: null, count: 0 })
  return {
    supabase: { from: () => builder },
    newClientUuid: () => '00000000-0000-4000-8000-000000000000',
  }
})

window.matchMedia = ((q: string) => ({
  matches: false, media: q, onchange: null,
  addEventListener: () => {}, removeEventListener: () => {},
  addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: Finance } = await import('../Finance')

let container: HTMLDivElement
let root: Root
let header: HTMLElement | null = null

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/finance']}>
        <Finance />
      </MemoryRouter>,
    )
  })
}

/** A header launcher by its accessible name: inside the page header's actions, outside the
    open More menu (the Finance dashboard also has its own in-page toolbar). */
const launcher = (name: string) =>
  [...container.querySelectorAll<HTMLButtonElement>(`.page-actions button[aria-label="${name}"]`)].filter((b) => !b.closest('[role="menu"]'))

async function openMore() {
  const more = container.querySelector<HTMLButtonElement>('.page-actions button[aria-label="More actions"]')
  expect(more).not.toBeNull()
  await act(async () => more?.click())
  return [...document.body.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]')].map((i) => i.textContent?.trim())
}

function narrowDesktopHeader() {
  header = document.createElement('header')
  header.className = 'app-global-header'
  header.getBoundingClientRect = () => ({ width: 1024, height: 64, top: 0, left: 256, right: 1280, bottom: 64, x: 256, y: 0, toJSON: () => ({}) }) as DOMRect
  document.body.appendChild(header)
}

beforeEach(() => {
  state.viewport = 'desktop'
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  header?.remove()
  header = null
  document.body.innerHTML = ''
})

describe('Finance header — room decides', () => {
  it('a roomy desktop shows Create Invoice and Export beside Record Payment', async () => {
    await mount()
    expect(launcher('Record Payment')).toHaveLength(1)
    expect(launcher('Create Invoice')).toHaveLength(1)
    expect(launcher('Export invoices')).toHaveLength(1)
  })

  it('a tablet keeps Record Payment by name and moves Create Invoice and Export into More', async () => {
    state.viewport = 'tablet'
    await mount()
    expect(launcher('Record Payment')[0]?.textContent?.trim()).toBe('Record Payment')
    expect(launcher('Create Invoice')).toHaveLength(0)
    expect(launcher('Export invoices')).toHaveLength(0)
    expect(await openMore()).toEqual(['Create Invoice', 'Export invoices'])
  })

  it('a desktop whose open sidebar leaves a 1024px header is compact too', async () => {
    narrowDesktopHeader()
    await mount()
    expect(launcher('Record Payment')).toHaveLength(1)
    expect(launcher('Export invoices')).toHaveLength(0)
    expect(await openMore()).toEqual(['Create Invoice', 'Export invoices'])
  })
})

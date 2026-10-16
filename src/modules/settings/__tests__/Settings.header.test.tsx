// @vitest-environment jsdom
/**
 * Settings header actions by width — BLOCKER-02, 15 Oct 2026.
 *
 * Measured before the change: at 375px the title zone was 0px wide, the profile
 * button sat 2px off-screen and "View audit log" was 34px tall; at 768px the title
 * was 0px again. Below desktop only the one primary verb stays beside the title and
 * Export, the audit log and the edit-mode extras move into More. A phone also
 * shortens the verb ("Edit", "Add"); its accessible name stays the full one.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui/Toast'
import { resetSettings, writeSettings } from '../../../lib/settingsStore'

const state = vi.hoisted(() => ({ viewport: 'desktop' as 'desktop' | 'tablet' | 'phone' }))

vi.mock('../../../lib/device', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/device')>()
  return { ...actual, useViewport: () => state.viewport }
})
vi.mock('../../../lib/settingsSync', () => ({
  hydrateSharedSettings: () => Promise.resolve(),
  saveSettings: async (p: Parameters<typeof writeSettings>[0]) => writeSettings(p),
  resetSharedSettings: () => Promise.resolve(),
}))
vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => true }))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role: 'Owner', isSharedDevice: false },
    loading: false,
    isLocked: false,
    staffPinStatus: () => Promise.resolve({ hasPin: false }),
    setStaffPin: () => Promise.resolve({ error: null }),
    revokeOwnStaffPin: () => Promise.resolve({ error: null }),
    verifyStaffPin: () => Promise.resolve({ ok: false, reason: 'no_pin' }),
  }),
}))

window.matchMedia = ((q: string) => ({
  matches: false,
  media: q,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: Settings } = await import('../Settings')

let container: HTMLDivElement
let root: Root
let path = ''
function PathProbe() {
  path = useLocation().pathname
  return null
}

async function mount(search = '') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/settings${search}`]}>
        <PathProbe />
        <ToastProvider>
          <Settings />
        </ToastProvider>
      </MemoryRouter>,
    )
  })
}

/** A control on the page itself, not an item inside the open More menu. */
const visible = (label: string) =>
  [...container.querySelectorAll<HTMLElement>('button, a')].filter(
    (b) => b.textContent?.trim() === label && !b.closest('[role="menu"]'),
  )

async function click(el: Element | null | undefined) {
  await act(async () => {
    el?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function openMore() {
  await click(container.querySelector('button[aria-label="More actions"]'))
  return [...document.body.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]')]
}
const labels = (items: HTMLElement[]) => items.map((i) => i.textContent?.trim())

beforeEach(() => {
  window.localStorage.clear()
  resetSettings()
  state.viewport = 'desktop'
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('Settings header — phone', () => {
  beforeEach(() => { state.viewport = 'phone' })

  it('the section list keeps only More beside the title, with Export and the audit log inside', async () => {
    await mount()
    expect(visible('Export config')).toHaveLength(0)
    expect(visible('View audit log')).toHaveLength(0)
    expect(labels(await openMore())).toEqual(['Export config', 'View audit log'])
  })

  it('a section shows a short Edit with the full accessible name', async () => {
    await mount('?tab=business')
    const edit = container.querySelector('button[aria-label="Edit settings"]')
    expect(edit?.textContent?.trim()).toBe('Edit')
    expect(visible('Edit settings')).toHaveLength(0)
  })

  it('a section uses one title and one back action to return to the section list', async () => {
    await mount('?tab=business')
    expect(container.querySelectorAll('h1')).toHaveLength(1)
    expect(container.querySelector('h1')?.textContent).toBe('Business')
    const back = container.querySelectorAll('button[aria-label="Back to settings"]')
    expect(back).toHaveLength(1)
    await click(back[0])
    expect(container.querySelector('h1')?.textContent).toBe('Settings')
    expect(container.querySelector('button[aria-label="Edit settings"]')).toBeNull()
  })

  it('edit mode keeps Done in the header and puts Discard and Reset in More', async () => {
    await mount('?tab=business')
    await click(container.querySelector('button[aria-label="Edit settings"]'))
    expect(visible('Done')).toHaveLength(1)
    const items = await openMore()
    expect(labels(items)).toEqual(['Discard changes', 'Reset to defaults', 'Export config', 'View audit log'])
    await click(items.find((i) => i.textContent?.trim() === 'Discard changes'))
    expect(visible('Done')).toHaveLength(0)
    expect(container.querySelector('button[aria-label="Edit settings"]')).not.toBeNull()
  })

  it('View audit log in More opens the audit log', async () => {
    await mount('?tab=business')
    const items = await openMore()
    await click(items.find((i) => i.textContent?.trim() === 'View audit log'))
    expect(path).toBe('/admin/audit')
  })

  it('Branches shows a short Add and puts Export in More', async () => {
    await mount('?tab=branches')
    expect(container.querySelector('button[aria-label="Add Branch"]')?.textContent?.trim()).toBe('Add')
    expect(visible('Export')).toHaveLength(0)
    expect(labels(await openMore())).toEqual(['Export branches'])
  })
})

describe('Settings header — tablet', () => {
  beforeEach(() => { state.viewport = 'tablet' })

  it('keeps the full Edit settings label and moves Export and the audit log into More', async () => {
    await mount('?tab=business')
    expect(visible('Edit settings')).toHaveLength(1)
    expect(visible('Export config')).toHaveLength(0)
    expect(labels(await openMore())).toEqual(['Export config', 'View audit log'])
  })
})

describe('Settings header — desktop', () => {
  it('keeps every action visible, and the audit link meets the 44px floor', async () => {
    await mount('?tab=business')
    expect(visible('Edit settings')).toHaveLength(1)
    expect(visible('Export config')).toHaveLength(1)
    const audit = visible('View audit log')[0]
    expect(audit?.getAttribute('href')).toBe('/admin/audit')
    expect(audit?.style.minHeight).toBe('44px')
    expect(container.querySelector('button[aria-label="More actions"]')).toBeNull()
  })

  /* Zoom audit, 15 Oct 2026: at 1280px (a 1920px laptop at 150%) the open sidebar leaves a
     1024px header and the title measured 55px. The compact header follows the header. */
  it('uses the compact header when the open sidebar leaves a 1024px header', async () => {
    const header = document.createElement('header')
    header.className = 'app-global-header'
    header.getBoundingClientRect = () => ({ width: 1024, height: 64, top: 0, left: 256, right: 1280, bottom: 64, x: 256, y: 0, toJSON: () => ({}) }) as DOMRect
    document.body.appendChild(header)
    try {
      await mount('?tab=business')
      expect(visible('Edit settings')).toHaveLength(1)
      expect(visible('Export config')).toHaveLength(0)
      expect(labels(await openMore())).toEqual(['Export config', 'View audit log'])
    } finally {
      header.remove()
    }
  })
})

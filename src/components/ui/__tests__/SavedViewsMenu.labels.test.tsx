// @vitest-environment jsdom
/**
 * Smart Workspace Views v1 — the shared SavedViewsMenu must name the list it is
 * on. Rentals keeps its existing strings byte-for-byte; inventory gets its own,
 * and neither save dialog promises a column chooser the list does not have.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

vi.mock('../../../lib/savedViews', () => ({
  listSharedViews: async () => [],
  migrateLocalViews: async () => 0,
  readDeviceViews: () => [],
  writeDeviceViews: () => {},
  saveSharedView: async () => 'id-1',
  retireSharedView: async () => {},
  sharedViewsUnavailable: () => false,
}))

window.matchMedia = ((q: string) => ({
  matches: false, media: q, onchange: null,
  addEventListener: () => {}, removeEventListener: () => {},
  addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { SavedViewsMenu } = await import('../SavedViewsMenu')

let container: HTMLDivElement | undefined
let root: Root | undefined

async function mountMenu(listKey: string) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(
      <SavedViewsMenu
        listKey={listKey}
        canPublish={false}
        userId={'u-1'}
        currentQuery={'q=FX3'}
        currentHiddenColumns={[]}
        onApply={() => {}}
      />,
    )
  })
}

afterEach(async () => {
  await act(async () => { root?.unmount() })
  container?.remove()
  container = undefined
  root = undefined
})

describe('SavedViewsMenu copy — one control, two lists, no false promises', () => {
  it('rentals keeps its established strings', async () => {
    await mountMenu('rentals')
    const button = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((b) => /Saved views/i.test(b.textContent ?? ''))
    expect(button).not.toBeNull()
    await act(async () => { button?.click() })
    const menu = document.body.querySelector('[role="menu"]')
    expect(menu?.getAttribute('aria-label')).toBe('Saved rental views')
    expect(menu?.textContent).toContain('RENTAL VIEWS')
    expect(menu?.textContent).toContain('All rentals')

    const save = [...(menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])].find((b) => b.textContent?.includes('Save current view'))
    await act(async () => { save?.click() })
    const description = [...document.body.querySelectorAll('div')].find((d) => d.textContent?.includes('This saves the active'))
    expect(description?.textContent).toContain('visible columns')
  })

  it('inventory names its own list and never promises a column chooser it does not have', async () => {
    await mountMenu('inventory')
    const button = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((b) => /Saved views/i.test(b.textContent ?? ''))
    expect(button).not.toBeNull()
    await act(async () => { button?.click() })
    const menu = document.body.querySelector('[role="menu"]')
    expect(menu?.getAttribute('aria-label')).toBe('Saved inventory views')
    expect(menu?.textContent).toContain('INVENTORY VIEWS')
    expect(menu?.textContent).toContain('All equipment')
    expect(menu?.textContent).not.toContain('All rentals')

    const save = [...(menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])].find((b) => b.textContent?.includes('Save current view'))
    await act(async () => { save?.click() })
    const description = [...document.body.querySelectorAll('div')].find((d) => d.textContent?.includes('This saves the active'))
    expect(description?.textContent).not.toContain('visible columns')
    expect(description?.textContent).toContain('sorting and layout')
  })
})

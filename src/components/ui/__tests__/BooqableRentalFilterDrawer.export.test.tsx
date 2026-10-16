// @vitest-environment jsdom
/**
 * ADOPTIONS item 9 (RAIL §1): Export is rail furniture, pinned at the bottom
 * of the filter rail — never in the header. The drawer owns the affordance;
 * the page owns the audited handler (columns, money gate, export audit).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BooqableRentalFilterDrawer } from '../BooqableRentalFilterDrawer'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

let container: HTMLDivElement | null = null
let root: Root | null = null

function mount(node: React.ReactElement) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root?.render(node))
}

afterEach(() => {
  if (root && container) {
    act(() => root?.unmount())
    container.remove()
  }
  root = null
  container = null
})

const noop = () => {}

function baseProps() {
  return {
    embedded: true,
    open: true,
    onClose: noop,
    resultCount: 3,
    activeCount: 0,
    onClearAll: noop,
    statusFilter: new Set<never>(),
    onToggleStatus: noop,
    projectTypeFilter: new Set<string>(),
    onToggleProjectType: noop,
    quickFilter: 'All' as const,
    onSelectQuickFilter: noop,
    subOn: false,
    onToggleSub: noop,
  }
}

function exportButton(): HTMLButtonElement | null {
  const buttons = container?.querySelectorAll('button') ?? []
  for (const b of buttons) {
    if (b.textContent?.includes('Export CSV')) return b as HTMLButtonElement
  }
  return null
}

describe('BooqableRentalFilterDrawer export pin', () => {
  it('renders no export affordance without a handler', () => {
    mount(<BooqableRentalFilterDrawer {...baseProps()} />)
    expect(exportButton()).toBeNull()
  })

  it('pins an Export CSV button that calls the page handler', () => {
    let calls = 0
    mount(<BooqableRentalFilterDrawer {...baseProps()} onExport={() => { calls += 1 }} />)
    const button = exportButton()
    expect(button).not.toBeNull()
    act(() => button?.click())
    expect(calls).toBe(1)
  })
})

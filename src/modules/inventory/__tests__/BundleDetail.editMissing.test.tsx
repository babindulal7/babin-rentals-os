// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-mgr', name: 'Manager User', role: 'Manager', isSharedDevice: false },
    role: 'Manager',
    isStaff: true,
    loading: false,
    isLocked: false,
  }),
}))

vi.mock('../../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => false,
}))

vi.mock('../../../lib/device', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/device')>()),
  useViewport: () => 'desktop',
}))

// The bundle read finds nothing for this code: the same state the view route shows.
vi.mock('../../../lib/queries/useBundles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/queries/useBundles')>()),
  useBundleRecord: () => ({ rows: [], loading: false, error: null, isEmpty: true, refetch: () => {} }),
}))

vi.mock('../EditBundle', async () => {
  const { createElement } = await import('react')
  return { default: () => createElement('div', null, 'EDIT-BUNDLE-STUB') }
})

const { BundleDetail } = await import('../BundleDetail')

describe('BundleDetail: ?action=edit for a bundle code that does not exist', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  it('shows the not-found state and does not open the editor', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/inventory/bundles/BUNDLE?action=edit']}>
          <Routes>
            <Route path="/inventory/bundles/:bundleRef" element={<BundleDetail />} />
          </Routes>
        </MemoryRouter>,
      )
    })
    expect(container.textContent).toContain('Bundle not found')
    expect(container.textContent).not.toContain('EDIT-BUNDLE-STUB')
  })
})

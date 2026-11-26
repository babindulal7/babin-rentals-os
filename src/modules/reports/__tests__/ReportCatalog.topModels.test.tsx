// @vitest-environment jsdom
/**
 * The Simple view's models-by-revenue table is headed by the number of rows it
 * draws. The heading is counted from the rows, so it cannot promise more models
 * than the table shows (the mock fleet has five models, not eight).
 *
 * Reads the mock period figures, so run with VITE_DATA_SOURCE=mock.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

/** jsdom implements no `matchMedia`; `lib/device.ts` subscribes to two queries. */
Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
})

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'USR-TEST', name: 'Tester', role: 'Owner', isSharedDevice: false } }),
}))

const { ReportCatalog } = await import('../ReportCatalog')

let container: HTMLDivElement
let root: Root

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('the Simple view heads its models table with the number of models it shows', () => {
  it('reads "Top N models by revenue" for the N rows in the table', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ReportCatalog />
        </MemoryRouter>,
      )
    })

    const table = container.querySelector<HTMLElement>('[role="region"][aria-label^="Top "]')
    expect(table, 'no models-by-revenue table on the Simple view').not.toBeNull()
    const rows = table?.querySelectorAll('tbody tr').length ?? 0
    expect(rows).toBeGreaterThan(0)
    const heading = `Top ${rows} ${rows === 1 ? 'model' : 'models'} by revenue`
    expect(table?.getAttribute('aria-label')).toBe(heading)
    expect(container.textContent).toContain(heading)
    expect(container.textContent).not.toContain('Top 8 models by revenue')
  })
})

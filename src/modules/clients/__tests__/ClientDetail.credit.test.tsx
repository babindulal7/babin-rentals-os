// @vitest-environment jsdom
/**
 * Credit Available on the client header (audit sweep-D-reports-2-clients-10).
 *
 * `toClientRecord` leaves `creditUsedPaisa` at a placeholder 0 because no
 * credit-used source exists. Subtracting that from the limit printed the whole
 * limit as a real balance. The tile must read "Not tracked yet" and keep the
 * recorded limit visible in its note and in the Membership & Credit card.
 *
 * Mocks follow `ClientDetail.membership.test.tsx`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui/Toast'
import { CLIENTS_DATA } from '../../../data/clients'

const session = vi.hoisted(() => ({ limitRupees: 500_000 }))

const EMPTY_LIST = {
  rows: [] as never[],
  loading: false,
  error: null,
  isEmpty: true,
  isFiltered: false,
  total: 0,
  refetch: () => {},
}

vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => true }))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role: 'Owner', isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))
vi.mock('../../../lib/queries/useClients', async () => {
  const { CLIENTS_DATA: DATA } = await import('../../../data/clients')
  const { rupees } = await import('../../../lib/money')
  return {
    useClientProfile: () => ({
      ...EMPTY_LIST,
      rows: [
        {
          id: 'uuid-fixture',
          record: {
            ...DATA[0]!,
            dbId: 'uuid-fixture',
            creditLimitPaisa: rupees(session.limitRupees),
            creditUsedPaisa: rupees(0),
          },
          membershipKnown: true,
          deactivatedAtAd: null,
        },
      ],
      isEmpty: false,
      total: 1,
    }),
    useMembershipPlans: () => ({ ...EMPTY_LIST }),
  }
})
vi.mock('../../../lib/queries/useList', () => ({ useList: () => EMPTY_LIST }))
vi.mock('../../../lib/supabase', () => ({ supabase: {}, newClientUuid: () => 'key-one' }))

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

const { default: ClientDetail } = await import('../ClientDetail')

const CODE = CLIENTS_DATA[0]!.id
let container: HTMLDivElement
let root: Root

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/clients/${CODE}`]}>
        <ToastProvider>
          <Routes>
            <Route path="/clients/:id" element={<ClientDetail />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    )
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
}

/** The header tile whose label is `label`, as the KPI strip renders it. */
function kpiTile(label: string): HTMLElement | undefined {
  return [...container.querySelectorAll<HTMLElement>('article.kpi-tile')].find(
    (tile) => tile.querySelector('.kpi-tile__label')?.textContent?.trim() === label,
  )
}

beforeEach(() => {
  session.limitRupees = 500_000
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  document.body.innerHTML = ''
})

describe('Credit Available with no credit-used source', () => {
  it('reads Not tracked yet instead of the limit printed as a balance', async () => {
    await mount()
    const tile = kpiTile('Credit Available')
    expect(tile).toBeDefined()
    // The limit may sit in the note, but the figure in the value slot is never a balance.
    expect(tile?.querySelector('.kpi-value')?.textContent?.trim()).toBe('Not tracked yet')
    expect(tile?.querySelector('.kpi-value')?.textContent).not.toContain('Rs')
  })

  it('keeps the recorded credit limit visible on the tile and in the Membership & Credit card', async () => {
    await mount()
    const tile = kpiTile('Credit Available')
    expect(tile?.textContent).toContain('Credit limit: Rs 5,00,000')
    expect(container.textContent).toContain('Credit limit')
    expect(container.textContent).toContain('Rs 5,00,000')
  })

  it('says Not set for a client with no limit recorded, and still reads Not tracked yet', async () => {
    session.limitRupees = 0
    await mount()
    const tile = kpiTile('Credit Available')
    expect(tile?.querySelector('.kpi-value')?.textContent?.trim()).toBe('Not tracked yet')
    expect(tile?.textContent).toContain('Credit limit: Not set')
    expect(tile?.textContent).not.toContain('Rs 0')
  })
})

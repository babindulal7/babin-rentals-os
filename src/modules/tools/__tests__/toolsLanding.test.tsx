// @vitest-environment jsdom
/**
 * **Law 6 on nav item 10, driven rather than read.**
 *
 * Tools became a nav item in the wireframe rewrite, which put a labelled route
 * to two money screens — Depreciation (`10_TOOLS.md` §10.2, "purchase date ·
 * price … opening │ dep │ WDV") and Pricing (§10.3, "rate / discount chips ·
 * VAT") — into the sidebar, the tablet rail and the phone More sheet of every
 * money-blind role. `data/nav.test.ts` proves the predicate; this proves the
 * page applies it.
 *
 * ⚠ 15 Aug 2026 — **Tools is calculators only.** The four admin cards (Audit
 * Log, Activity Log, Numbering, Backup & Restore) moved to Settings ▸ System ▸
 * Administration. They were never two screens, only two URLs: `/tools/audit-log`
 * and `/admin/audit-log` both mounted the same component, four pages behind
 * eight routes and reachable from two landing pages. `/admin/*` is the single
 * spelling now, and the `/tools/*` paths survive as redirects (Law 3).
 *
 * `rbac.ts`: forbidden items are **absent**, not disabled — so the assertions
 * are about what is not in the document, not about a disabled attribute.
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import type { Viewport } from '../../../lib/device'

let viewport: Viewport = 'desktop'
let money = true

vi.mock('../../../lib/device', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device')>()),
  useViewport: () => viewport,
}))
vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => money }))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: ToolsLanding } = await import('../ToolsLanding')

let container: HTMLDivElement
let root: Root

/* Anything that is not /tools lands here, so a redirect's target can be read. */
function Landed() {
  const loc = useLocation()
  return <output data-landed>{loc.pathname + loc.search}</output>
}

async function mount(path = '/tools') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/tools" element={<ToolsLanding />} />
          <Route path="*" element={<Landed />} />
        </Routes>
      </MemoryRouter>,
    )
  })
}

const landed = (): string | null => container.querySelector('[data-landed]')?.textContent ?? null

const hrefs = (): string[] =>
  [...container.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '')

beforeEach(() => {
  viewport = 'desktop'
  money = true
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('Tools landing — Law 6', () => {
  it('shows both calculators to a role that may see money', async () => {
    await mount()
    expect(hrefs()).toEqual(expect.arrayContaining(['/tools/depreciation', '/tools/pricing']))
    expect(container.textContent).toContain('Calculators')
  })

  it('omits both calculators for a money-blind role', async () => {
    money = false
    await mount()
    expect(hrefs()).not.toContain('/tools/pricing')
    expect(hrefs()).not.toContain('/tools/depreciation')
    expect(container.textContent).not.toContain('Depreciation')
    expect(container.textContent).not.toContain('Pricing')
  })

  it('drops the emptied group rather than leaving a heading over nothing', async () => {
    money = false
    await mount()
    expect(container.textContent).not.toContain('Calculators')
  })

  it('carries no administration card — those moved to Settings, at one URL each', async () => {
    /*
     * The reverse of what this used to assert, and deliberately so. Keeping a
     * second door here is what produced eight routes for four pages: a page
     * reachable from two landings drifts, because only one of them gets updated
     * when something changes. `settingsSections.test.ts` asserts the other half
     * — that Settings ▸ System reaches all four at `/admin/*` and none at
     * `/tools/*`.
     */
    for (const money_blind of [true, false]) {
      money = !money_blind
      await mount()
      for (const admin of ['/tools/audit-log', '/tools/activity-log', '/tools/numbering', '/tools/backup']) {
        expect(hrefs(), `${admin} is still a Tools card`).not.toContain(admin)
      }
      expect(container.textContent).not.toContain('Audit Log')
      expect(container.textContent).not.toContain('Backup & Restore')
      await act(async () => root.unmount())
      container.remove()
    }
    /* afterEach unmounts once more — mount a fresh tree for it to tear down. */
    await mount()
  })

  /*
   * RULING 2026-10-13: Late Fee (fees in NPR) and Coupons & Promos (discount
   * amounts; `rental.discount` is C+ and money-blind for the floor) are money
   * too. Before this, the tab strip hid Late Fee but the page still rendered it
   * for a typed `?tab=latefee`, Coupons was open to every role and printed the
   * discount in rupees, and both Overview cards stayed up for the floor.
   */
  it('omits Late Fee and Coupons — cards and tabs — for a money-blind role', async () => {
    money = false
    await mount()
    expect(hrefs()).not.toContain('/tools/latefee')
    expect(hrefs()).not.toContain('/tools/coupons')
    expect(container.textContent).not.toContain('Late Fee')
    expect(container.textContent).not.toContain('Coupons')
  })

  it('does not render Late Fee for a money-blind role even when the tab is typed into the URL', async () => {
    money = false
    await mount('/tools?tab=latefee')
    expect(container.textContent, '?tab=latefee rendered for the floor').not.toContain('Late fee estimate')
    expect(container.textContent, '?tab=latefee rendered for the floor').not.toMatch(/Rs\s?[\d,]/)
  })

  it('still shows Late Fee to a role that may see money', async () => {
    await mount('/tools?tab=latefee')
    expect(container.textContent).toContain('Late fee estimate')
    await act(async () => root.unmount())
    container.remove()
    await mount()
    expect(hrefs()).toContain('/tools/latefee')
  })
})

/*
 * RULING 2026-10-18 (Babin's ruling): Tools is calculators plus the
 * cinematography suite. Coupons & Promos moved to Clients (with Referral Codes)
 * and QR & Barcode labels to Inventory. Both halves are pinned: they are gone
 * from Tools for every role, and an old `?tab=` link still lands at the new home.
 */
describe('Tools landing — Coupons and QR moved out (18 Oct)', () => {
  it('offers neither as a Tools card or tab, for any role', async () => {
    for (const sighted of [true, false]) {
      money = sighted
      await mount()
      expect(hrefs()).not.toContain('/tools/coupons')
      expect(hrefs()).not.toContain('/tools/qr')
      expect(container.textContent).not.toContain('Coupons')
      expect(container.textContent).not.toContain('QR & Barcode')
      await act(async () => root.unmount())
      container.remove()
    }
    await mount()
  })

  it('redirects the old tabs to their new homes', async () => {
    await mount('/tools?tab=coupons')
    expect(landed()).toBe('/clients?tab=coupons')
    await act(async () => root.unmount())
    container.remove()
    await mount('/tools?tab=qr')
    expect(landed()).toBe('/inventory/labels')
  })
})

/**
 * `WIREFRAME_RULINGS_2026-08-12.md` §6 closes the open question this page's
 * header used to carry: the cinematography suite is **kept**, it gets its own
 * group as a seventh card, and it lives at `/tools/cinematography` —
 * *"pick `/tools/cinematography`, redirect the old path, and note it."*
 *
 * Both halves are asserted, because both are reversible by accident: a session
 * reading spec 10's "Six cards… Nothing else" would delete the card, and a
 * session reading the suite's own "Settings ▸ Tools" header would move it back.
 */
describe('Tools landing — Rulings §6, the cinematography suite', () => {
  it('keeps the suite as its own group', async () => {
    await mount()
    expect(container.textContent).toContain('Cinematography suite')
    expect(hrefs()).toContain('/tools/cinematography')
  })

  it('no longer points at /settings/tools, which spec 11 has no section for', async () => {
    await mount()
    expect(hrefs()).not.toContain('/settings/tools')
  })

  it('is not a money surface — the floor keeps its camera calculators', async () => {
    money = false
    await mount()
    expect(hrefs()).toContain('/tools/cinematography')
  })

  it('does not advertise either calculator as unbuilt now that both exist', async () => {
    await mount()
    expect(container.textContent).not.toContain('Not built yet')
  })
})

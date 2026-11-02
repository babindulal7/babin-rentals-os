// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCrewTdsReport } from '../../../lib/queries/crewTdsReport'
import * as settingsStore from '../../../lib/settingsStore'
import { loadMockClient } from '../../../lib/supabase'

const state = vi.hoisted(() => ({
  money: true,
}))

vi.mock('../../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => state.money,
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

beforeAll(async () => {
  await loadMockClient()
})

const { default: CrewTdsReport } = await import('../CrewTdsReport')

let root: Root | undefined
let host: HTMLDivElement | undefined

async function mount() {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(
      <MemoryRouter>
        <CrewTdsReport />
      </MemoryRouter>,
    )
  })
  // Flush promises for useLoad
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50))
  })
}

const text = () => host?.textContent ?? ''

describe('CrewTdsReport — Query and UI (Ruling D25 / Task T8-08 / O-5)', () => {
  beforeEach(() => {
    state.money = true
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    if (root && host) {
      act(() => {
        root?.unmount()
      })
      host.remove()
      root = undefined
      host = undefined
    }
  })

  it('query returns monthly aggregated TDS schedule and honest nulls when rate is unconfigured', async () => {
    vi.spyOn(settingsStore, 'getCrewPayoutTdsPercent').mockReturnValue(null)
    const report = await getCrewTdsReport()

    expect(report.metrics.payoutCount).toBeGreaterThan(0)
    expect(report.metrics.configuredRate).toBeNull()
    // Without a rate, overall TDS and net are null, never plausible defaults
    expect(report.metrics.totalTds).toBeNull()
    expect(report.metrics.totalNet).toBeNull()

    // Monthly schedule has rows with BS and AD months
    expect(report.monthlySchedule.length).toBeGreaterThan(0)
    for (const row of report.monthlySchedule) {
      expect(row.monthAd).toBeDefined()
      expect(row.monthBs).toBeDefined()
      expect(row.rateStatus).toContain('not set')
    }
  })

  it('query computes TDS and net when rate is configured by accountant', async () => {
    vi.spyOn(settingsStore, 'getCrewPayoutTdsPercent').mockReturnValue(15)
    const report = await getCrewTdsReport()

    expect(report.metrics.configuredRate).toBe(15)
    expect(report.metrics.totalTds).not.toBeNull()
    expect(report.metrics.totalNet).not.toBeNull()
    expect(Number(report.metrics.totalTds) + Number(report.metrics.totalNet)).toBe(Number(report.metrics.totalGross))

    for (const row of report.monthlySchedule) {
      expect(row.rateStatus).toBe('15%')
      if (row.grossPayouts > 0) {
        expect(row.tdsWithheld).not.toBeNull()
        expect(row.netPaid).not.toBeNull()
      }
    }
  })

  it('money-blind roles (Warehouse, Technician, Driver, Client) receive restricted screen (Law 6)', async () => {
    state.money = false
    await mount()

    expect(text()).toContain('Crew payout rates and TDS deductions are restricted to money roles')
    expect(text()).not.toContain('Monthly TDS Withholding Schedule')
  })

  it('money roles (Owner, Admin, Manager, Accounts) see the full report with "TDS: rate not set" when unconfigured', async () => {
    state.money = true
    vi.spyOn(settingsStore, 'getCrewPayoutTdsPercent').mockReturnValue(null)
    await mount()

    expect(text()).toContain('Crew TDS Report')
    expect(text()).toContain('TDS: rate not set')
  })
})

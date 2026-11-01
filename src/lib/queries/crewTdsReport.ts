/**
 * Crew TDS Report Query (Ruling D25 / Task T8-08 / O-5)
 *
 * Produces monthly aggregated TDS reports for the accountant showing:
 *  - Monthly schedule (AD & BS months)
 *  - Gross crew payouts
 *  - TDS withheld (per stored snapshot or configured rate)
 *  - Net payable / paid
 *
 * Money roles only (PERMISSIONS §5 / Law 6).
 */

import { type Paisa } from '../money'
import { toBs, BS_MONTHS, formatAdMonth } from '../bs'
import { getCrewPayoutTdsPercent } from '../settingsStore'
import { listCrewAssignments } from './crew'
import type { ReportFilterOptions } from './reportSupport'

export interface CrewTdsMonthlyRow {
  monthKey: string
  monthAd: string
  monthBs: string
  payoutCount: number
  grossPayouts: Paisa
  tdsWithheld: Paisa | null
  netPaid: Paisa | null
  rateStatus: string
}

export interface CrewTdsItem {
  id: string
  crewBookingNo: string
  crewMemberName: string
  position: string
  phone: string
  panNumber: string
  startDateAd: string
  endDateAd: string
  startDateBs: string
  endDateBs: string
  days: number
  grossPayout: Paisa
  tdsRatePercent: number | null
  tdsAmount: Paisa | null
  netPayout: Paisa | null
  payoutStatus: string
  paidAt: string | null
  notes: string | null
}

export interface CrewTdsReportMetrics {
  totalGross: Paisa
  totalTds: Paisa | null
  totalNet: Paisa | null
  configuredRate: number | null
  payoutCount: number
  paidCount: number
  pendingCount: number
}

export interface CrewTdsReportData {
  metrics: CrewTdsReportMetrics
  monthlySchedule: CrewTdsMonthlyRow[]
  payouts: CrewTdsItem[]
}

export async function getCrewTdsReport(options?: ReportFilterOptions): Promise<CrewTdsReportData> {
  const configuredRate = getCrewPayoutTdsPercent()
  const { rows: allAssignments } = await listCrewAssignments()

  // Filter cancelled rows (they owe nobody anything per Law 3)
  let live = allAssignments.filter((a) => !a.cancelled)

  // Apply date range filters if supplied
  if (options?.from) {
    live = live.filter((a) => a.startDateAd >= options.from!)
  }
  if (options?.to) {
    live = live.filter((a) => a.startDateAd <= options.to!)
  }

  const monthlyMap = new Map<string, {
    monthAd: string
    monthBs: string
    payoutCount: number
    gross: number
    tds: number
    hasTds: boolean
  }>()

  let totalGross = 0
  let totalTds = 0
  let hasAnyTds = false
  let paidCount = 0
  let pendingCount = 0

  const items: CrewTdsItem[] = []

  for (const a of live) {
    const gross = a.totalCostPaisa as number
    totalGross += gross

    let itemTdsRate: number | null = null
    let itemTdsAmount: Paisa | null = null
    let itemNetPayout: Paisa | null = null

    if (a.payoutStatus === 'Paid') {
      paidCount++
      if (a.tdsAmountPaisa != null) {
        itemTdsAmount = a.tdsAmountPaisa
        itemTdsRate = a.tdsRatePercent ?? configuredRate
        itemNetPayout = a.netPayoutPaisa ?? ((gross - (itemTdsAmount as number)) as Paisa)
        totalTds += itemTdsAmount as number
        hasAnyTds = true
      } else if (configuredRate !== null) {
        itemTdsRate = configuredRate
        itemTdsAmount = Math.round(gross * (configuredRate / 100)) as Paisa
        itemNetPayout = (gross - (itemTdsAmount as number)) as Paisa
        totalTds += itemTdsAmount as number
        hasAnyTds = true
      }
    } else {
      pendingCount++
      if (configuredRate !== null) {
        itemTdsRate = configuredRate
        itemTdsAmount = Math.round(gross * (configuredRate / 100)) as Paisa
        itemNetPayout = (gross - (itemTdsAmount as number)) as Paisa
        totalTds += itemTdsAmount as number
        hasAnyTds = true
      }
    }

    // Determine month keys
    const d = new Date(a.startDateAd)
    const validDate = !Number.isNaN(d.getTime())
    const monthKey = validDate ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : 'unknown'
    const monthAd = validDate ? formatAdMonth(d) : 'Unknown'
    const bs = validDate ? toBs(d) : null
    const monthBs = bs ? `${BS_MONTHS[bs.month - 1] ?? ''} ${bs.year}` : 'BS unavailable'

    if (!monthlyMap.has(monthKey)) {
      monthlyMap.set(monthKey, {
        monthAd,
        monthBs,
        payoutCount: 0,
        gross: 0,
        tds: 0,
        hasTds: false,
      })
    }
    const bucket = monthlyMap.get(monthKey)!
    bucket.payoutCount++
    bucket.gross += gross
    if (itemTdsAmount !== null) {
      bucket.tds += itemTdsAmount as number
      bucket.hasTds = true
    }

    items.push({
      id: a.id,
      crewBookingNo: a.id,
      crewMemberName: a.name,
      position: a.role,
      phone: a.phone,
      panNumber: 'N/A', // crew_members_v pan_status / pan documents
      startDateAd: a.startDateAd,
      endDateAd: a.endDateAd,
      startDateBs: a.startDateBs,
      endDateBs: a.endDateBs,
      days: a.days,
      grossPayout: a.totalCostPaisa,
      tdsRatePercent: itemTdsRate,
      tdsAmount: itemTdsAmount,
      netPayout: itemNetPayout,
      payoutStatus: a.payoutStatus,
      paidAt: a.paidAt ?? null,
      notes: a.payoutNotes ?? null,
    })
  }

  // Build monthly schedule sorted descending
  const monthlySchedule: CrewTdsMonthlyRow[] = [...monthlyMap.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([monthKey, m]) => {
      const grossPaisa = m.gross as Paisa
      const tdsPaisa = m.hasTds ? (m.tds as Paisa) : null
      const netPaisa = tdsPaisa !== null ? ((m.gross - m.tds) as Paisa) : null
      const rateStatus = configuredRate !== null ? `${configuredRate}%` : 'TDS: rate not set'

      return {
        monthKey,
        monthAd: m.monthAd,
        monthBs: m.monthBs,
        payoutCount: m.payoutCount,
        grossPayouts: grossPaisa,
        tdsWithheld: tdsPaisa,
        netPaid: netPaisa,
        rateStatus,
      }
    })

  const totalGrossPaisa = totalGross as Paisa
  const totalTdsPaisa = hasAnyTds ? (totalTds as Paisa) : null
  const totalNetPaisa = totalTdsPaisa !== null ? ((totalGross - totalTds) as Paisa) : null

  return {
    metrics: {
      totalGross: totalGrossPaisa,
      totalTds: totalTdsPaisa,
      totalNet: totalNetPaisa,
      configuredRate,
      payoutCount: live.length,
      paidCount,
      pendingCount,
    },
    monthlySchedule,
    payouts: items,
  }
}

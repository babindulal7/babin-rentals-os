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
import { toAd, toBs, kathmanduCivil, BS_MONTHS, BS_MONTH_DAYS, formatAdMonth, type BsDate } from '../bs'
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
  // Only true for a paid assignment whose TDS amount was saved in the ledger.
  // A configured-rate calculation is a forecast, never evidence of withholding.
  tdsIsRecorded?: boolean
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

/** The AD months a BS month runs across, from the BS table: "July 2026 – August 2026". */
function bsMonthAdSpan(bs: BsDate): string {
  const days = BS_MONTH_DAYS[bs.year]?.[bs.month - 1]
  const first = toAd({ year: bs.year, month: bs.month, day: 1 })
  const last = days === undefined ? null : toAd({ year: bs.year, month: bs.month, day: days })
  if (!first || !last) return 'Unknown'
  const from = formatAdMonth(first)
  const to = formatAdMonth(last)
  return from === to ? from : `${from} – ${to}`
}

export async function getCrewTdsReport(
  options?: ReportFilterOptions & { requireComplete?: boolean },
): Promise<CrewTdsReportData> {
  const configuredRate = getCrewPayoutTdsPercent()
  // Ordinary dashboard reads remain unchanged. For an accountant archive,
  // every page must be read and validated before constructing tax totals.
  const allAssignments = options?.requireComplete
    ? [] as Awaited<ReturnType<typeof listCrewAssignments>>['rows']
    : (await listCrewAssignments()).rows
  if (options?.requireComplete) {
    const pageSize = 400
    const maxPages = 125
    const seenIds = new Set<string>()
    for (let page = 0; page < maxPages; page++) {
      const { rows } = await listCrewAssignments({
        range: { from: page * pageSize, to: (page + 1) * pageSize - 1 },
      })
      for (const assignment of rows) {
        if (!assignment.id || seenIds.has(assignment.id)) {
          throw new Error('Crew assignment ledger changed during pagination; accountant export refused.')
        }
        seenIds.add(assignment.id)
        allAssignments.push(assignment)
      }
      if (rows.length < pageSize) break
      if (page === maxPages - 1) {
        throw new Error('Crew assignment ledger exceeds verified export limit.')
      }
    }
  }

  // Filter cancelled rows (they owe nobody anything per Law 3)
  let live = allAssignments.filter((a) => !a.cancelled)

  // Monthly accountant packs recognise actually paid crew in the Nepal day
  // of the recorded payout; the shoot start day is only an estimate period for
  // unpaid work. Otherwise a July shoot paid in August would be falsely shown
  // as July withholding. Preserve original start-date filters for UI reports.
  if (options?.requireComplete) {
    live = live.filter((a) => {
      let day = a.startDateAd
      if (a.payoutStatus === 'Paid') {
        if (!a.paidAt) {
          throw new Error('Paid crew assignment has no payout timestamp; accountant export refused.')
        }
        const date = new Date(a.paidAt)
        if (Number.isNaN(date.getTime())) {
          throw new Error('Invalid paid crew timestamp; accountant export refused.')
        }
        day = new Date(kathmanduCivil(date)).toISOString().slice(0, 10)
      }
      return (!options.from || day >= options.from) && (!options.to || day <= options.to)
    })
  } else {
    if (options?.from) live = live.filter((a) => a.startDateAd >= options.from!)
    if (options?.to) live = live.filter((a) => a.startDateAd <= options.to!)
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

    // Each payout is bucketed by the Bikram Sambat month its own start date falls in:
    // the schedule is aggregated per BS fiscal month, and one BS month spans two AD months.
    const d = new Date(a.startDateAd)
    const validDate = !Number.isNaN(d.getTime())
    const bs = validDate ? toBs(d) : null
    let monthKey = 'unknown'
    let monthAd = 'Unknown'
    let monthBs = 'BS unavailable'
    if (bs) {
      monthKey = `${bs.year}-${String(bs.month).padStart(2, '0')}`
      monthAd = bsMonthAdSpan(bs)
      monthBs = `${BS_MONTHS[bs.month - 1] ?? ''} ${bs.year}`
    } else if (validDate) {
      // Outside the BS table: keep the AD month so the payout is not merged into another month.
      monthKey = `ad-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthAd = formatAdMonth(d)
    }

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
      tdsIsRecorded: a.payoutStatus === 'Paid' && a.tdsAmountPaisa != null,
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

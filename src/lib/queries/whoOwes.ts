import { supabase } from '../supabase'
import type { Paisa } from '../money'
import {
  listInvoices,
  listPayments,
  outstandingInvoices,
  invoicesForClient,
  paymentsForClient,
  receivedPayments,
  type InvoiceListRow,
  type PaymentListRow,
} from './finance'
import { fetchInvoiceCompany } from './invoiceCompany'
import type { InvoicePdfCompany } from '../pdf/generatePdf'

export interface WhoOwesRow {
  clientId: string
  clientName: string
  clientPhone: string | null
  clientEmail: string | null
  clientPanVat: string | null
  outstandingPaisa: Paisa
  invoiceCount: number
  oldestDateAd: string
  ageDays: number
  lastReminderSentAt: string | null
  remindersPaused: boolean
  remindersPausedReason: string | null
  invoices: InvoiceListRow[]
}

export interface WhoOwesResult {
  rows: WhoOwesRow[]
  totalOutstandingPaisa: Paisa
  pausedCount: number
}

export interface ClientStatementData {
  invoices: InvoiceListRow[]
  payments: PaymentListRow[]
  company: InvoicePdfCompany | undefined
}

const MS_PER_DAY = 86_400_000

/**
 * Computes whole calendar days between two `YYYY-MM-DD` AD dates, clamped to `>= 0`.
 */
export function daysSinceAd(fromAd: string, toAd: string): number {
  const fromMs = Date.parse(`${fromAd.slice(0, 10)}T00:00:00Z`)
  const toMs = Date.parse(`${toAd.slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0
  return Math.max(0, Math.floor((toMs - fromMs) / MS_PER_DAY))
}

/**
 * Pure aggregation helper for Who Owes (exported for unit tests and exact paisa verification).
 * Aggregates the exact `outstandingInvoices()` set so totals match Finance receivables to the paisa.
 */
export function buildWhoOwesRows(
  invoices: readonly InvoiceListRow[],
  clientMeta: ReadonlyMap<
    string,
    {
      phone: string | null
      email: string | null
      panVat: string | null
      remindersPaused: boolean
      remindersPausedReason: string | null
    }
  >,
  lastReminderByClient: ReadonlyMap<string, string>,
  todayAd: string,
): WhoOwesResult {
  const byClient = new Map<
    string,
    {
      clientName: string
      outstandingPaisa: number
      oldestDateAd: string
      invoices: InvoiceListRow[]
    }
  >()

  let totalOutstanding = 0

  for (const inv of invoices) {
    if (inv.isVoid) continue
    const bal = inv.outstandingAmount as number
    if (bal <= 0) continue

    totalOutstanding += bal
    const refDate = inv.dueDateAd || inv.issueDateAd || todayAd

    const existing = byClient.get(inv.clientId)
    if (!existing) {
      byClient.set(inv.clientId, {
        clientName: inv.clientName,
        outstandingPaisa: bal,
        oldestDateAd: refDate,
        invoices: [inv],
      })
    } else {
      existing.outstandingPaisa += bal
      if (refDate < existing.oldestDateAd) {
        existing.oldestDateAd = refDate
      }
      existing.invoices.push(inv)
    }
  }

  const rows: WhoOwesRow[] = []
  let pausedCount = 0

  for (const [clientId, agg] of byClient.entries()) {
    const meta = clientMeta.get(clientId)
    const paused = Boolean(meta?.remindersPaused)
    if (paused) pausedCount += 1

    const ageDays = daysSinceAd(agg.oldestDateAd, todayAd)
    rows.push({
      clientId,
      clientName: agg.clientName,
      clientPhone: meta?.phone ?? null,
      clientEmail: meta?.email ?? null,
      clientPanVat: meta?.panVat ?? null,
      outstandingPaisa: agg.outstandingPaisa as Paisa,
      invoiceCount: agg.invoices.length,
      oldestDateAd: agg.oldestDateAd,
      ageDays,
      lastReminderSentAt: lastReminderByClient.get(clientId) ?? null,
      remindersPaused: paused,
      remindersPausedReason: meta?.remindersPausedReason ?? null,
      invoices: agg.invoices,
    })
  }

  // Oldest first, then highest balance, then alphabetical
  rows.sort((a, b) => {
    if (b.ageDays !== a.ageDays) return b.ageDays - a.ageDays
    if ((b.outstandingPaisa as number) !== (a.outstandingPaisa as number)) {
      return (b.outstandingPaisa as number) - (a.outstandingPaisa as number)
    }
    return a.clientName.localeCompare(b.clientName)
  })

  return {
    rows,
    totalOutstandingPaisa: totalOutstanding as Paisa,
    pausedCount,
  }
}

/**
 * Fetches clients with unpaid balances, oldest first (T3-20).
 * Short-circuits immediately for money-blind roles (Law 6).
 */
export async function fetchWhoOwes(canViewMoney: boolean, todayAd: string): Promise<WhoOwesResult> {
  if (!canViewMoney) {
    return { rows: [], totalOutstandingPaisa: 0 as Paisa, pausedCount: 0 }
  }

  const { rows: openInvoices } = await listInvoices({
    ...outstandingInvoices(),
    range: { from: 0, to: 499 },
  })

  const clientIds = Array.from(new Set(openInvoices.map((i) => i.clientId).filter(Boolean)))
  const clientMeta = new Map<
    string,
    {
      phone: string | null
      email: string | null
      panVat: string | null
      remindersPaused: boolean
      remindersPausedReason: string | null
    }
  >()
  const lastReminderByClient = new Map<string, string>()

  if (clientIds.length > 0) {
    const { data: clientsData } = await supabase
      .from('client_directory_v')
      .select('id, phone, email, pan_vat, reminders_paused, reminders_paused_reason')
      .in('id', clientIds)

    if (Array.isArray(clientsData)) {
      for (const c of clientsData as Array<{
        id: string
        phone: string | null
        email: string | null
        pan_vat: string | null
        reminders_paused: boolean | null
        reminders_paused_reason: string | null
      }>) {
        clientMeta.set(c.id, {
          phone: c.phone ?? null,
          email: c.email ?? null,
          panVat: c.pan_vat ?? null,
          remindersPaused: Boolean(c.reminders_paused),
          remindersPausedReason: c.reminders_paused_reason ?? null,
        })
      }
    }

    try {
      const { data: remindersData } = await supabase
        .from('payment_reminders')
        .select('client_id, sent_at')
        .in('client_id', clientIds)
        .eq('status', 'sent')
        .order('sent_at', { ascending: false })

      if (Array.isArray(remindersData)) {
        for (const r of remindersData as Array<{ client_id: string; sent_at: string | null }>) {
          if (r.client_id && r.sent_at && !lastReminderByClient.has(r.client_id)) {
            lastReminderByClient.set(r.client_id, r.sent_at)
          }
        }
      }
    } catch {
      // If payment_reminders is unavailable in a minimal mock environment, leave lastReminderSentAt as null.
    }
  }

  return buildWhoOwesRows(openInvoices, clientMeta, lastReminderByClient, todayAd)
}

/**
 * Fetches full open invoices, payments so far, and company metadata for a client's Statement PDF.
 * Short-circuits immediately for money-blind roles (Law 6).
 */
export async function fetchClientStatementData(
  clientId: string,
  canViewMoney: boolean,
): Promise<ClientStatementData> {
  if (!canViewMoney) {
    return { invoices: [], payments: [], company: undefined }
  }

  const [invRes, payRes] = await Promise.all([
    listInvoices({ ...outstandingInvoices(), ...invoicesForClient(clientId), range: { from: 0, to: 199 } }),
    listPayments({ ...receivedPayments(), ...paymentsForClient(clientId), range: { from: 0, to: 199 } }),
  ])

  const firstBookingId = invRes.rows[0]?.bookingId
  const company = firstBookingId ? await fetchInvoiceCompany(firstBookingId).catch(() => undefined) : undefined

  return {
    invoices: invRes.rows.filter((i) => !i.isVoid && (i.outstandingAmount as number) > 0),
    payments: payRes.rows,
    company,
  }
}

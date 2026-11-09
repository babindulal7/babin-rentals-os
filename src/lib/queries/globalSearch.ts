import { listBookings, type BookingListRow } from './bookings'
import { listClientRecords, type ClientRecord } from './clients'
import { listInventory, type InventoryListRow } from './inventory'
import { listInvoices, type InvoiceListRow } from './finance'
import { canViewMoney, isStaff } from '../rbac'
import { phoneLocalDigits } from '../phone'
import { supabase } from '../supabase'
import type { SystemRole } from '../../types/database'

export type GlobalSearchKind = 'booking' | 'client' | 'equipment' | 'invoice'

export interface GlobalSearchOptions {
  role: SystemRole
  term: string
  limit?: number
  signal?: AbortSignal
}

export interface GlobalSearchResult {
  kind: GlobalSearchKind
  id: string
  label: string
  detail: string
  to: string
}

const clean = (term: string) =>
  Array.from(term)
    .map((char) => {
      const code = char.charCodeAt(0)
      return code < 32 || code === 127 ? ' ' : char
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * One permission-aware read contract for the global header search and ⌘K palette (T3-21).
 *
 * Finds bookings across seven distinct keys:
 *  1. Booking number (e.g. BK-2026-0001, #880, 880, B-880)
 *  2. Client name (e.g. Kathmandu Films, Suman)
 *  3. Client phone (Nepal mobile digits, normalized or formatted)
 *  4. Collector name (authorized collector on client profile)
 *  5. Item / Equipment name (gear on booking lines, e.g. Sony FX3)
 *  6. Serial number (hardware serial assigned to line unit)
 *  7. Asset code / Tag (product asset code or unit asset tag)
 *
 * Results show recent bookings first (pickup_at / created_at desc) and open in one tap.
 * Money amounts are never revealed to floor roles (Warehouse, Technician, Driver, Client — Law 6).
 */
export async function searchRecords({
  role,
  term,
  limit = 5,
  signal,
}: GlobalSearchOptions): Promise<GlobalSearchResult[]> {
  const search = clean(term)
  if (search.length < 2 || !isStaff(role) || signal?.aborted) return []
  const capped = Math.max(1, Math.min(10, limit))

  const hasDb = typeof (supabase as unknown as { from?: unknown })?.from === 'function'
  const digits = phoneLocalDigits(search)

  // Primary parallel lookups
  const [primaryBookingsRes, clientsRes, equipmentRes, invoicesRes] = await Promise.all([
    listBookings({ search, sort: { column: 'pickup_at', ascending: false }, page: { index: 0, size: capped } }).catch(() => ({ rows: [] as BookingListRow[] })),
    listClientRecords({ search, limit: capped }).catch(() => [] as ClientRecord[]),
    listInventory({ search, page: { index: 0, size: capped } }).catch(() => ({ rows: [] as InventoryListRow[] })),
    canViewMoney(role)
      ? listInvoices({ search, page: { index: 0, size: capped } }).catch(() => ({ rows: [] as InvoiceListRow[] }))
      : Promise.resolve({ rows: [] as InvoiceListRow[] }),
  ])

  if (signal?.aborted) return []

  // Collected booking rows and match reasons for contextual detail
  const allBookingRows: BookingListRow[] = [...primaryBookingsRes.rows]
  const matchDetails = new Map<string, string>()

  // Additional lookups for client phone, collectors, equipment items, serials and asset codes
  const clientIdsToFind = new Set<string>(clientsRes.map((c) => c.id))
  const bookingIdsToFind = new Set<string>()

  if (hasDb && !signal?.aborted) {
    try {
      const extraPromises: Promise<void>[] = []

      // 3. Client Phone lookup (if search has 4+ digits)
      if (digits.length >= 4) {
        extraPromises.push(
          (async () => {
            const { data } = await supabase
              .from('client_directory_v')
              .select('id, name, phone')
              .ilike('phone', `%${digits}%`)
              .limit(capped)
            if (data && Array.isArray(data)) {
              for (const row of data as Array<{ id: string; name: string }>) {
                clientIdsToFind.add(row.id)
              }
            }
          })(),
        )
      }

      // 4. Collector Name lookup (client_collectors_v / client_collectors)
      extraPromises.push(
        (async () => {
          let collectors: Array<{ client_id: string; name: string }> | null = null
          const resV = await supabase
            .from('client_collectors_v')
            .select('client_id, name')
            .or(`name.ilike.%${search}%,phone.ilike.%${search}%`)
            .limit(capped)
          if (!resV.error && resV.data) {
            collectors = resV.data as Array<{ client_id: string; name: string }>
          } else {
            const resBase = await supabase
              .from('client_collectors')
              .select('client_id, name')
              .or(`name.ilike.%${search}%,phone.ilike.%${search}%`)
              .limit(capped)
            if (!resBase.error && resBase.data) {
              collectors = resBase.data as Array<{ client_id: string; name: string }>
            }
          }
          if (collectors && Array.isArray(collectors)) {
            for (const col of collectors) {
              if (col.client_id) {
                clientIdsToFind.add(col.client_id)
              }
            }
          }
        })(),
      )

      // 5. Item / Equipment name on booking lines
      const productIds = equipmentRes.rows.map((e) => e.id)
      extraPromises.push(
        (async () => {
          let q = supabase
            .from('booking_lines_v')
            .select('booking_id, description, product_id')
            .is('voided_at', null)

          if (productIds.length > 0) {
            q = q.or(`description.ilike.%${search}%,product_id.in.(${productIds.join(',')})`)
          } else {
            q = q.ilike('description', `%${search}%`)
          }

          const { data } = await q.limit(capped * 2)
          if (data && Array.isArray(data)) {
            for (const line of data as Array<{ booking_id: string }>) {
              if (line.booking_id) bookingIdsToFind.add(line.booking_id)
            }
          }
        })(),
      )

      // 6 & 7. Serial number and Asset Tag on product units
      extraPromises.push(
        (async () => {
          const { data: units } = await supabase
            .from('product_units_v')
            .select('id, product_id, serial_no, asset_tag')
            .or(`serial_no.ilike.%${search}%,asset_tag.ilike.%${search}%,barcode.ilike.%${search}%,qr_code.ilike.%${search}%`)
            .limit(capped * 2)

          if (units && Array.isArray(units) && units.length > 0) {
            const unitRows = units as Array<{ id: string; serial_no: string | null; asset_tag: string }>
            const unitIds = unitRows.map((u) => u.id)
            const unitById = new Map(unitRows.map((u) => [u.id, u]))

            const { data: lineUnits } = await supabase
              .from('booking_line_units')
              .select('booking_id, booking_line_id, asset_id')
              .in('asset_id', unitIds)
              .limit(capped * 2)

            if (lineUnits && Array.isArray(lineUnits) && lineUnits.length > 0) {
              const neededLineIds: string[] = []
              const unitMap = new Map<string, { serial_no: string | null; asset_tag: string }>()

              for (const lu of lineUnits as Array<{ booking_id?: string; booking_line_id?: string; asset_id: string }>) {
                const u = unitById.get(lu.asset_id)
                if (lu.booking_id) {
                  bookingIdsToFind.add(lu.booking_id)
                  if (u) unitMap.set(lu.booking_id, u)
                } else if (lu.booking_line_id) {
                  neededLineIds.push(lu.booking_line_id)
                }
              }

              if (neededLineIds.length > 0) {
                const { data: lines } = await supabase
                  .from('booking_lines_v')
                  .select('id, booking_id')
                  .in('id', neededLineIds)
                  .limit(capped * 2)

                if (lines && Array.isArray(lines)) {
                  for (const l of lines as Array<{ id: string; booking_id: string }>) {
                    if (l.booking_id) bookingIdsToFind.add(l.booking_id)
                  }
                }
              }
            }
          }
        })(),
      )

      await Promise.all(extraPromises)
    } catch {
      // Non-blocking catch for auxiliary lookups
    }
  }

  if (signal?.aborted) return []

  // Resolve additional bookings for matched clients and line/unit booking IDs
  const secondaryPromises: Promise<void>[] = []

  // Remove booking IDs we already have
  for (const b of allBookingRows) {
    bookingIdsToFind.delete(b.id)
  }

  if (clientIdsToFind.size > 0) {
    const cIds = Array.from(clientIdsToFind).slice(0, 10)
    secondaryPromises.push(
      listBookings({
        chips: { client_id: cIds },
        sort: { column: 'pickup_at', ascending: false },
        page: { index: 0, size: capped },
      })
        .then((res) => {
          allBookingRows.push(...res.rows)
        })
        .catch(() => {}),
    )
  }

  if (bookingIdsToFind.size > 0) {
    const bIds = Array.from(bookingIdsToFind).slice(0, 10)
    secondaryPromises.push(
      listBookings({
        chips: { id: bIds },
        sort: { column: 'pickup_at', ascending: false },
        page: { index: 0, size: capped },
      })
        .then((res) => {
          allBookingRows.push(...res.rows)
        })
        .catch(() => {}),
    )
  }

  if (secondaryPromises.length > 0) {
    await Promise.all(secondaryPromises)
  }

  if (signal?.aborted) return []

  // Deduplicate bookings by ID
  const dedupedBookingsMap = new Map<string, BookingListRow>()
  for (const b of allBookingRows) {
    if (!dedupedBookingsMap.has(b.id)) {
      dedupedBookingsMap.set(b.id, b)
    }
  }

  // Sort recent items first (pickup_at / created_at descending)
  const sortedBookings = Array.from(dedupedBookingsMap.values()).sort((a, b) => {
    const tA = new Date(a.pickupAtAd || a.createdAtAd || 0).getTime()
    const tB = new Date(b.pickupAtAd || b.createdAtAd || 0).getTime()
    return tB - tA
  })

  // Format booking results
  const bookingResults: GlobalSearchResult[] = sortedBookings.slice(0, capped).map((row: BookingListRow) => {
    const hint = matchDetails.get(row.id)
    const detail = hint ?? (row.project ? `${row.project} · ${row.stage}` : row.stage)
    return {
      kind: 'booking' as const,
      id: row.id,
      label: `#${row.bookingNo} · ${row.clientName}`,
      detail,
      to: `/rentals/${row.id}`,
    }
  })

  // Format client results
  const clientResults: GlobalSearchResult[] = clientsRes.slice(0, capped).map((row: ClientRecord) => ({
    kind: 'client' as const,
    id: row.id,
    label: row.name,
    detail: row.phone ?? 'Client record',
    to: `/clients/${row.id}`,
  }))

  // Format equipment results
  const equipmentResults: GlobalSearchResult[] = equipmentRes.rows.slice(0, capped).map((row: InventoryListRow) => ({
    kind: 'equipment' as const,
    id: row.id,
    label: row.name,
    detail: row.category ?? row.trackingMode,
    to: `/inventory/${row.id}`,
  }))

  // Format invoice results (strictly filtered for money-visible roles)
  const invoiceResults: GlobalSearchResult[] = invoicesRes.rows.slice(0, capped).map((row: InvoiceListRow) => ({
    kind: 'invoice' as const,
    id: row.id,
    label: row.invoiceNo || 'Invoice',
    detail: row.status,
    to: `/finance?invoice=${row.id}`,
  }))

  return [...bookingResults, ...clientResults, ...equipmentResults, ...invoiceResults].slice(0, capped * 4)
}

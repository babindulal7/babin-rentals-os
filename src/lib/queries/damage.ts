import { formatAd } from '../bs'
import { supabase } from '../supabase'
import { DAMAGE_FINDINGS, type DamageFinding } from '../../data/damage'
import { rupees } from '../money'

export { DAMAGE_FINDINGS }
export type { DamageFinding }

interface ReturnLineBookingRow {
  id: string
  booking_lines?: {
    bookings?: {
      booking_no?: string | null
      clients?: { name?: string | null } | null
    } | null
  } | null
}

interface CleaningEntryBookingRow {
  id: string
  bookings?: {
    booking_no?: string | null
    clients?: { name?: string | null } | null
  } | null
}

export async function getDamageFindings(): Promise<DamageFinding[]> {
  try {
    // Law 6: Read from damage_findings_v to respect masked estimated_cost for money-blind roles
    const { data: findings, error: findingsError } = await supabase
      .from('damage_findings_v')
      .select('id, description, estimated_cost, approval_state, created_at, created_by, approved_by, unit_id, return_line_id, cleaning_queue_entry_id')
      .is('voided_at', null)
      .order('created_at', { ascending: false })

    if (findingsError || !findings || findings.length === 0) {
      if (findingsError) console.error('getDamageFindings query error:', findingsError)
      return []
    }

    // Collect IDs for batched lookups
    const unitIds = Array.from(new Set(findings.map((f) => f.unit_id).filter(Boolean)))
    const userIds = Array.from(
      new Set(
        findings
          .flatMap((f) => [f.created_by, f.approved_by])
          .filter((id): id is string => Boolean(id)),
      ),
    )
    const returnLineIds = Array.from(new Set(findings.map((f) => f.return_line_id).filter(Boolean)))
    const cleaningIds = Array.from(new Set(findings.map((f) => f.cleaning_queue_entry_id).filter(Boolean)))

    // 1. Fetch units and products (Law 6: products_v for replacement_value)
    const unitsMap = new Map<string, { serial_no: string; product_id: string }>()
    const productsMap = new Map<string, { name: string; replacement_value: number | null }>()

    if (unitIds.length > 0) {
      const { data: units } = await supabase
        .from('product_units')
        .select('id, serial_no, product_id')
        .in('id', unitIds)

      const productIds: string[] = []
      for (const u of units ?? []) {
        unitsMap.set(u.id, { serial_no: u.serial_no, product_id: u.product_id })
        if (u.product_id) productIds.push(u.product_id)
      }

      if (productIds.length > 0) {
        const { data: prods } = await supabase
          .from('products_v')
          .select('id, name, replacement_value')
          .in('id', Array.from(new Set(productIds)))

        for (const p of prods ?? []) {
          productsMap.set(p.id, {
            name: p.name,
            replacement_value: p.replacement_value != null ? Number(p.replacement_value) : null,
          })
        }
      }
    }

    // 2. Fetch user names (column is full_name on users)
    const usersMap = new Map<string, string>()
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, full_name')
        .in('id', userIds)

      for (const u of users ?? []) {
        if (u.full_name) usersMap.set(u.id, u.full_name)
      }
    }

    // 3. Fetch linked booking/client details from return_lines or cleaning_queue_entries
    const bookingDetails = new Map<string, { bookingNo: string; clientName: string }>()

    if (returnLineIds.length > 0) {
      const { data: returnLines } = await supabase
        .from('return_lines')
        .select('id, booking_lines(bookings(booking_no, clients(name)))')
        .in('id', returnLineIds)

      for (const rl of ((returnLines ?? []) as unknown as ReturnLineBookingRow[])) {
        const booking = rl.booking_lines?.bookings
        if (booking) {
          bookingDetails.set(`ret-${rl.id}`, {
            bookingNo: booking.booking_no || 'Unknown Booking',
            clientName: booking.clients?.name || 'Unknown Client',
          })
        }
      }
    }

    if (cleaningIds.length > 0) {
      const { data: cleaningEntries } = await supabase
        .from('cleaning_queue_entries')
        .select('id, bookings(booking_no, clients(name))')
        .in('id', cleaningIds)

      for (const cl of ((cleaningEntries ?? []) as unknown as CleaningEntryBookingRow[])) {
        const booking = cl.bookings
        if (booking) {
          bookingDetails.set(`clean-${cl.id}`, {
            bookingNo: booking.booking_no || 'Unknown Booking',
            clientName: booking.clients?.name || 'Unknown Client',
          })
        }
      }
    }

    return findings.map((row) => {
      const unit = row.unit_id ? unitsMap.get(row.unit_id) : undefined
      const product = unit?.product_id ? productsMap.get(unit.product_id) : undefined

      const bookingInfo = row.return_line_id
        ? bookingDetails.get(`ret-${row.return_line_id}`)
        : row.cleaning_queue_entry_id
          ? bookingDetails.get(`clean-${row.cleaning_queue_entry_id}`)
          : undefined

      return {
        id: row.id,
        unitName: product?.name || 'Unknown Unit',
        serial: unit?.serial_no || 'Unknown SN',
        bookingNo: bookingInfo?.bookingNo || 'Unknown Booking',
        client: bookingInfo?.clientName || 'Unknown Client',
        raisedBy: (row.created_by && usersMap.get(row.created_by)) || 'Staff',
        raisedAtBs: '',
        raisedAtAd: row.created_at ? formatAd(new Date(row.created_at)) : '',
        state: row.approval_state === 'Approved' ? 'Approved' : 'Awaiting Approval',
        description: row.description || '',
        photos: 1,
        replacementPaisa: rupees(Number(product?.replacement_value) || 0),
        chargePaisa: rupees(Number(row.estimated_cost) || 0),
        depositPaisa: rupees(0),
        approvedBy: row.approved_by ? usersMap.get(row.approved_by) : undefined,
      }
    })
  } catch (err) {
    console.error('getDamageFindings exception:', err)
    return []
  }
}

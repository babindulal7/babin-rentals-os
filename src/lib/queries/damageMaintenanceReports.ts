import { supabase } from '../supabase'
import { rupees, type Paisa } from '../money'
import { completeReportRead, embeddedName, percentOf, rowsOf, type ReportFilterOptions } from './reportSupport'

export type { ReportFilterOptions } from './reportSupport'

export interface DamageIncidentItem {
  id: string
  bookingNo: string
  clientName: string
  unitName: string
  serial: string
  description: string
  /** `damage_findings.severity` is free text; 'Not set' when blank. */
  severity: string
  estimatedCost: Paisa
  chargedAmount: Paisa
  approvalState: string
  disposition: string
  raisedAt: string
}

export interface SeverityBreakdownItem {
  severity: string
  count: number
  percent: number
  totalCost: Paisa
}

export interface DamageTypeBreakdownItem {
  damageType: string
  count: number
  percent: number
}

export interface RepairJobItem {
  id: string
  recordNo: string
  unitName: string
  serial: string
  issue: string
  vendorOrShop: string
  cost: Paisa
  priority: string
  status: string
  startedAt: string
  completedAt?: string | undefined
  /** Null until the record carries both a start and a completion. */
  turnaroundDays: number | null
}

export interface ServicingItem {
  id: string
  recordNo: string
  unitName: string
  serial: string
  serviceType: string
  scheduledDate: string
  performedBy: string
  status: string
}

export interface SidelinedUnitItem {
  id: string
  serial: string
  modelName: string
  status: string
  sidelinedSince: string
  reason: string
}

export interface DamageMaintenanceReportData {
  metrics: {
    totalFindings: number
    totalDamageCost: Paisa
    totalChargedToClient: Paisa
    activeRepairs: number
    averageTurnaroundDays: number | null
    totalRepairSpend: Paisa
    routineServicesCompleted: number
    /** In Stock ÷ every unit not Retired, now; null with no units. */
    fleetAvailabilityRate: number | null
    sidelinedUnitsCount: number
    /** Units In Stock right now. */
    rentalReadyUnits: number
  }
  severityBreakdown: SeverityBreakdownItem[]
  damageTypeBreakdown: DamageTypeBreakdownItem[]
  incidents: DamageIncidentItem[]
  repairs: RepairJobItem[]
  servicing: ServicingItem[]
  sidelinedUnits: SidelinedUnitItem[]
}

/*
 * RULING 2026-10-16 (R-P6-STATES, Law 16): this read returned MOCK_DM on a
 * failure and on an empty database, patched every metric with `|| MOCK_DM…`,
 * always showed the mock sidelined units, and stamped every incident with the
 * literal booking 'BK-2026-0042', client 'Production Client' and unit 'Rental
 * Equipment Unit'. It now throws on failure, returns honest empties, resolves
 * unit/booking/client/technician from their tables, and a figure with no
 * source is `null` ("Not tracked yet"). Money comes from the `_v` views —
 * `estimated_cost`, `cost` and the case amounts are revoked on the base tables
 * (0077/0130), so the old read was refused on live. Revert = restore MOCK_DM
 * and the `catch`.
 */

/** Units out of rotation right now (inventory_state, Inventory.md §4.1). */
const SIDELINED_STATES = ['Inspection', 'Cleaning', 'Maintenance', 'Missing'] as const

type FindingRow = {
  id: string
  unit_id: string | null
  return_line_id: string | null
  case_id: string | null
  damage_type: string | null
  description: string | null
  severity: string | null
  estimated_cost: number | string | null
  approval_state: string | null
  disposition: string | null
  created_at: string
}

type MaintenanceRow = {
  id: string
  record_no: string
  product_unit_id: string | null
  maintenance_type: string | null
  priority: string | null
  status: string | null
  description: string | null
  vendor_name: string | null
  cost: number | string | null
  scheduled_date: string | null
  started_at: string | null
  completed_at: string | null
  performed_by: string | null
  created_at: string
}

type UnitRow = { id: string; product_id: string | null; serial_no: string | null; status: string; updated_at: string | null }

const money = (v: number | string | null | undefined): Paisa => rupees(Number(v ?? 0) || 0)

export async function getDamageMaintenanceReport(options?: ReportFilterOptions): Promise<DamageMaintenanceReportData> {
  let findingsQuery = supabase
    .from('damage_findings_v')
    .select('id, unit_id, return_line_id, case_id, damage_type, description, severity, estimated_cost, approval_state, disposition, created_at')
    .is('voided_at', null)
    .order('created_at', { ascending: false })
  let maintenanceQuery = supabase
    .from('maintenance_records_v')
    .select(
      'id, record_no, product_unit_id, maintenance_type, priority, status, description, vendor_name, cost, scheduled_date, started_at, completed_at, performed_by, created_at',
    )
    .order('created_at', { ascending: false })
  if (options?.from) {
    findingsQuery = findingsQuery.gte('created_at', options.from)
    maintenanceQuery = maintenanceQuery.gte('created_at', options.from)
  }
  if (options?.to) {
    findingsQuery = findingsQuery.lte('created_at', options.to)
    maintenanceQuery = maintenanceQuery.lte('created_at', options.to)
  }

  const [findingsRes, maintenanceRes, casesRes, unitsRes, productsRes, usersRes] = await Promise.all([
    completeReportRead(findingsQuery, 'Damage findings read failed'),
    completeReportRead(maintenanceQuery, 'Maintenance records read failed'),
    completeReportRead(supabase.from('cases_v').select('id, charged_to_client_amount'), 'Cases read failed'),
    completeReportRead(supabase.from('product_units_v').select('id, product_id, serial_no, status, updated_at'), 'Units read failed'),
    completeReportRead(supabase.from('products').select('id, name'), 'Products read failed'),
    completeReportRead(supabase.from('users').select('id, full_name'), 'Staff names read failed'),
  ])
  const findings = rowsOf<FindingRow>(findingsRes, 'Damage findings read failed')
  const records = rowsOf<MaintenanceRow>(maintenanceRes, 'Maintenance records read failed')
  const cases = rowsOf<{ id: string; charged_to_client_amount: number | string | null }>(casesRes, 'Cases read failed')
  const units = rowsOf<UnitRow>(unitsRes, 'Units read failed')
  const products = rowsOf<{ id: string; name: string | null }>(productsRes, 'Products read failed')
  const users = rowsOf<{ id: string; full_name: string | null }>(usersRes, 'Staff names read failed')

  // Finding → return line → booking line → booking, only for the findings that have one.
  const returnLineIds = [...new Set(findings.map((f) => f.return_line_id).filter((x): x is string => !!x))]
  const bookingOfFinding = new Map<string, { bookingNo: string; clientName: string }>()
  if (returnLineIds.length > 0) {
    const rl = rowsOf<{ id: string; booking_line_id: string }>(
      await completeReportRead(supabase.from('return_lines').select('id, booking_line_id').in('id', returnLineIds), 'Return lines read failed'),
      'Return lines read failed',
    )
    const lineIds = [...new Set(rl.map((r) => r.booking_line_id))]
    const bl = lineIds.length
      ? rowsOf<{ id: string; booking_id: string }>(
          await completeReportRead(supabase.from('booking_lines').select('id, booking_id').in('id', lineIds), 'Booking lines read failed'),
          'Booking lines read failed',
        )
      : []
    const bookingIds = [...new Set(bl.map((l) => l.booking_id))]
    const bk = bookingIds.length
      ? rowsOf<{ id: string; booking_no: string; clients?: unknown }>(
          await completeReportRead(supabase.from('bookings').select('id, booking_no, clients!client_id(name)').in('id', bookingIds), 'Bookings read failed'),
          'Bookings read failed',
        )
      : []
    const lineToBooking = new Map(bl.map((l) => [l.id, l.booking_id]))
    const bookingById = new Map(bk.map((b) => [b.id, { bookingNo: b.booking_no, clientName: embeddedName(b.clients) }]))
    const rlToBooking = new Map(rl.map((r) => [r.id, bookingById.get(lineToBooking.get(r.booking_line_id) ?? '')]))
    for (const f of findings) {
      const hit = f.return_line_id ? rlToBooking.get(f.return_line_id) : undefined
      if (hit) bookingOfFinding.set(f.id, hit)
    }
  }

  const productName = new Map(products.map((p) => [p.id, p.name?.trim() || '—']))
  const unitById = new Map(units.map((u) => [u.id, u]))
  const userName = new Map(users.map((u) => [u.id, u.full_name?.trim() || '—']))
  const chargedByCase = new Map(cases.map((c) => [c.id, money(c.charged_to_client_amount)]))
  const unitLabel = (id: string | null) => {
    const u = id ? unitById.get(id) : undefined
    return { unitName: (u?.product_id && productName.get(u.product_id)) || '—', serial: u?.serial_no?.trim() || '—' }
  }

  // ── Damage ──
  let totalDamage = 0
  let totalCharged = 0
  const severityMap = new Map<string, { count: number; cost: number }>()
  const typeMap = new Map<string, number>()
  const incidents: DamageIncidentItem[] = []
  for (const f of findings) {
    const cost = money(f.estimated_cost)
    const charged = (f.case_id && chargedByCase.get(f.case_id)) || (0 as Paisa)
    totalDamage += cost
    totalCharged += charged
    const severity = f.severity?.trim() || 'Not set'
    const sv = severityMap.get(severity) ?? { count: 0, cost: 0 }
    sv.count++
    sv.cost += cost
    severityMap.set(severity, sv)
    const type = f.damage_type?.trim() || 'Not set'
    typeMap.set(type, (typeMap.get(type) ?? 0) + 1)
    const booking = bookingOfFinding.get(f.id)
    incidents.push({
      id: f.id,
      bookingNo: booking?.bookingNo ?? '—',
      clientName: booking?.clientName ?? '—',
      ...unitLabel(f.unit_id),
      description: f.description?.trim() || '—',
      severity,
      estimatedCost: cost,
      chargedAmount: charged,
      approvalState: f.approval_state ?? '—',
      disposition: f.disposition ?? 'Not decided',
      raisedAt: f.created_at,
    })
  }

  // ── Repairs & servicing ──
  const repairs: RepairJobItem[] = []
  const servicing: ServicingItem[] = []
  let repairSpend = 0
  let turnaroundTotal = 0
  let turnaroundCount = 0
  for (const m of records) {
    const type = m.maintenance_type?.toLowerCase() ?? ''
    const unit = unitLabel(m.product_unit_id)
    if (type.includes('repair') || type.includes('corrective')) {
      repairSpend += money(m.cost)
      let days: number | null = null
      if (m.started_at && m.completed_at) {
        const s = Date.parse(m.started_at)
        const c = Date.parse(m.completed_at)
        if (!Number.isNaN(s) && !Number.isNaN(c)) {
          days = Math.max(1, Math.round((c - s) / 86_400_000))
          turnaroundTotal += days
          turnaroundCount++
        }
      }
      repairs.push({
        id: m.id,
        recordNo: m.record_no,
        ...unit,
        issue: m.description?.trim() || '—',
        vendorOrShop: m.vendor_name?.trim() || '—',
        cost: money(m.cost),
        priority: m.priority?.trim() || '—',
        status: m.status?.trim() || '—',
        startedAt: m.started_at ?? m.created_at,
        completedAt: m.completed_at ?? undefined,
        turnaroundDays: days,
      })
    } else {
      servicing.push({
        id: m.id,
        recordNo: m.record_no,
        ...unit,
        serviceType: m.maintenance_type?.trim() || 'Not set',
        scheduledDate: m.scheduled_date ?? '',
        performedBy: (m.performed_by && userName.get(m.performed_by)) || '—',
        status: m.status?.trim() || '—',
      })
    }
  }

  // ── Fleet, as it stands now (not period-filtered: a unit's state is current) ──
  const fleet = units.filter((u) => u.status !== 'Retired')
  const ready = fleet.filter((u) => u.status === 'In Stock').length
  const sidelined = fleet.filter((u) => (SIDELINED_STATES as readonly string[]).includes(u.status))

  const nFindings = findings.length
  const typeTotal = [...typeMap.values()].reduce((a, n) => a + n, 0)
  return {
    metrics: {
      totalFindings: nFindings,
      totalDamageCost: totalDamage as Paisa,
      totalChargedToClient: totalCharged as Paisa,
      activeRepairs: repairs.filter((r) => r.status === 'In Progress').length,
      averageTurnaroundDays: turnaroundCount > 0 ? Number((turnaroundTotal / turnaroundCount).toFixed(1)) : null,
      totalRepairSpend: repairSpend as Paisa,
      routineServicesCompleted: servicing.filter((s) => s.status === 'Completed').length,
      fleetAvailabilityRate: fleet.length > 0 ? Number(((ready / fleet.length) * 100).toFixed(1)) : null,
      sidelinedUnitsCount: sidelined.length,
      rentalReadyUnits: ready,
    },
    severityBreakdown: [...severityMap.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([severity, v]) => ({ severity, count: v.count, percent: percentOf(v.count, nFindings), totalCost: v.cost as Paisa })),
    damageTypeBreakdown: [...typeMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([damageType, count]) => ({ damageType, count, percent: percentOf(count, typeTotal) })),
    incidents,
    repairs,
    servicing,
    sidelinedUnits: sidelined.map((u) => ({
      id: u.id,
      serial: u.serial_no?.trim() || '—',
      modelName: (u.product_id && productName.get(u.product_id)) || '—',
      status: u.status,
      sidelinedSince: u.updated_at ?? '',
      reason: u.status,
    })),
  }
}

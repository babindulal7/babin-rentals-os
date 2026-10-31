/**
 * Shift Handover — domain model and database persistence (T4-05, Ruling S6, Ruling W32).
 *
 * Implements three operational shifts (Ruling W32):
 *   Shift A: 06:00–15:00 (Morning)
 *   Shift B: 14:00–23:00 (Day/Evening)
 *   Shift C: 22:00–07:00 (Night)
 * Overlap hours when handover is due: 14:00–15:00, 22:00–23:00, 06:00–07:00.
 *
 * Law 3: Archive, never delete.
 * Law 5: Cash counted and variance in integer paisa.
 * Law 6: Cash figures masked for money-blind roles (Warehouse, Technician, Driver, Client).
 * Law 8: Every write carries client_uuid and is audited.
 */

import { supabase, IS_MOCK } from '../supabase'

// ── Three Shifts (Ruling W32) ────────────────────────────────────────

export interface ShiftDefinition {
  code: 'A' | 'B' | 'C'
  name: string
  hours: string
  startTime: string
  endTime: string
  overlapWindow: string
  nextShiftCode: 'A' | 'B' | 'C'
}

export const SHIFTS: ShiftDefinition[] = [
  {
    code: 'A',
    name: 'Morning Shift',
    hours: '06:00 – 15:00',
    startTime: '06:00',
    endTime: '15:00',
    overlapWindow: '14:00 – 15:00',
    nextShiftCode: 'B',
  },
  {
    code: 'B',
    name: 'Day / Evening Shift',
    hours: '14:00 – 23:00',
    startTime: '14:00',
    endTime: '23:00',
    overlapWindow: '22:00 – 23:00',
    nextShiftCode: 'C',
  },
  {
    code: 'C',
    name: 'Night Shift',
    hours: '22:00 – 07:00',
    startTime: '22:00',
    endTime: '07:00',
    overlapWindow: '06:00 – 07:00',
    nextShiftCode: 'A',
  },
]

/**
 * Returns the active shift based on Nepal Standard Time (UTC+5:45).
 */
export function getCurrentShift(date = new Date()): ShiftDefinition {
  // Compute NPT time: UTC + 5h45m
  const utc = date.getTime() + date.getTimezoneOffset() * 60000
  const nptDate = new Date(utc + 5.75 * 3600000)
  const hour = nptDate.getHours()

  if (hour >= 6 && hour < 14) {
    return SHIFTS[0]! // Shift A Morning
  } else if (hour >= 14 && hour < 22) {
    return SHIFTS[1]! // Shift B Evening
  } else {
    return SHIFTS[2]! // Shift C Night (22:00 - 06:00)
  }
}

// ── Checklist ────────────────────────────────────────────────────────

export interface ShiftCheckItem {
  key: string
  label: string
  hint: string
}

export const SHIFT_CHECKLIST: ShiftCheckItem[] = [
  { key: 'gear', label: 'Out-gear walked through', hint: 'Active floor bookings verified' },
  { key: 'cash', label: 'Cash drawer counted & till reconciled', hint: 'Physical till counted vs register' },
  { key: 'keys', label: 'Keys, fobs & lockup handed over', hint: 'Warehouse shutter, cabinet & van keys' },
  { key: 'issues', label: 'Open cases & alerts briefed', hint: 'Repairs, late returns & priority deliveries' },
  { key: 'tomorrow', label: 'Staged items for next shift ready', hint: 'Early morning / upcoming pickups prepped' },
]

// ── Handover log ─────────────────────────────────────────────────────

export type HandoverStatus = 'Complete' | 'Pending'
export type CashStatus = 'matched' | 'short' | 'over'

export interface ShiftHandoverEntity {
  id: string
  client_uuid: string
  shift_code: string
  shift_date: string
  from_user_id: string
  from_user_name: string
  from_user_role: string
  to_user_id: string | null
  to_user_name: string | null
  cash_counted_paisa: number | null
  cash_status: CashStatus
  cash_variance_paisa: number | null
  notes: string
  open_items: Array<{ key?: string | undefined; label?: string | undefined; text?: string | undefined }>
  checklist: Array<{ key: string; label: string; done?: boolean | undefined }>
  status: 'pending' | 'acknowledged' | 'archived'
  acknowledged_at: string | null
  acknowledged_by: string | null
  acknowledged_by_name: string | null
  acknowledgement_note: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface HandoverRecord {
  id: number
  dbId?: string
  date: string        // display label, e.g. 'Today, 21 Jul'
  dateISO: string     // ISO date for sorting
  shiftCode?: string
  from: string        // e.g. 'Hari KC (A)'
  to: string          // e.g. 'Raju Thapa (B)'
  cashAmount: number
  cashStatus: CashStatus
  cashDisplay: string // e.g. 'Rs 18,400 · matched'
  checksCompleted: string // e.g. '5 / 5'
  status: HandoverStatus
  notes: string
}

const STORAGE_KEY = 'br.shiftHandovers'

const SEED_RECORDS: HandoverRecord[] = [
  {
    id: 0,
    dbId: 'seed-0',
    date: 'Today, 28 Oct',
    dateISO: '2026-10-28',
    shiftCode: 'A',
    from: 'Hari KC (Shift A)',
    to: 'Raju Thapa (Shift B)',
    cashAmount: 18400,
    cashStatus: 'matched',
    cashDisplay: 'Rs 18,400 · matched',
    checksCompleted: '5 / 5',
    status: 'Pending',
    notes: 'Overlap window open — keys and drawer counted clean.',
  },
  {
    id: 1,
    dbId: 'seed-1',
    date: 'Yesterday, 27 Oct',
    dateISO: '2026-10-27',
    shiftCode: 'B',
    from: 'Raju Thapa (Shift B)',
    to: 'Bikash Shrestha (Shift C)',
    cashAmount: 21200,
    cashStatus: 'matched',
    cashDisplay: 'Rs 21,200 · matched',
    checksCompleted: '5 / 5',
    status: 'Complete',
    notes: 'Evening deliveries closed out clean, keys logged.',
  },
  {
    id: 2,
    dbId: 'seed-2',
    date: '26 Oct',
    dateISO: '2026-10-26',
    shiftCode: 'C',
    from: 'Bikash Shrestha (Shift C)',
    to: 'Hari KC (Shift A)',
    cashAmount: 16800,
    cashStatus: 'short',
    cashDisplay: 'Rs 16,800 · short Rs 200',
    checksCompleted: '5 / 5',
    status: 'Complete',
    notes: 'Rs 200 short — logged as till variance (under Rs 500 threshold).',
  },
]

// ── In-Memory Cache & Event Dispatch ────────────────────────────────

export function notifyHandoversUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('babin:handovers-updated'))
  }
}

export function subscribeToHandovers(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('babin:handovers-updated', callback)
  return () => window.removeEventListener('babin:handovers-updated', callback)
}

// ── Database Operations ──────────────────────────────────────────────

function readMockLocalStorageRecords(): HandoverRecord[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (raw) {
      const parsed = JSON.parse(raw) as HandoverRecord[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {
    /* corrupt storage — fall through to seed */
  }
  return [...SEED_RECORDS]
}

/**
 * Fetch shift handovers from the database view `shift_handovers_v`.
 * Falls back to localStorage and seed records in mock mode.
 */
export async function fetchShiftHandovers(): Promise<ShiftHandoverEntity[]> {
  if (IS_MOCK) {
    const local = readMockLocalStorageRecords()
    return local.map((r) => ({
      id: r.dbId || `local-${r.id}`,
      client_uuid: `00000000-0000-4000-8000-${String(r.id).padStart(12, '0')}`,
      shift_code: r.shiftCode || 'A',
      shift_date: r.dateISO,
      from_user_id: '00000000-0000-0000-0000-000000000001',
      from_user_name: r.from,
      from_user_role: 'Warehouse',
      to_user_id: null,
      to_user_name: r.to,
      cash_counted_paisa: r.cashAmount * 100,
      cash_status: r.cashStatus,
      cash_variance_paisa: 0,
      notes: r.notes,
      open_items: [],
      checklist: SHIFT_CHECKLIST.map((c) => ({ key: c.key, label: c.label, done: true })),
      status: r.status === 'Complete' ? 'acknowledged' : 'pending',
      acknowledged_at: r.status === 'Complete' ? new Date().toISOString() : null,
      acknowledged_by: null,
      acknowledged_by_name: r.to,
      acknowledgement_note: null,
      archived_at: null,
      created_at: new Date(r.dateISO).toISOString(),
      updated_at: new Date(r.dateISO).toISOString(),
    }))
  }

  if (!supabase || typeof supabase.from !== 'function') {
    throw new Error('Staff shift handover is unavailable. Database connection is not configured.')
  }

  const { data, error } = await supabase
    .from('shift_handovers_v')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch shift_handovers_v:', error)
    throw error
  }

  return (data as ShiftHandoverEntity[]) ?? []
}

export interface CreateShiftHandoverParams {
  shiftCode: string
  fromUserName: string
  fromUserRole: string
  toUserId?: string | null | undefined
  toUserName?: string | null | undefined
  cashCountedPaisa?: number | null | undefined
  cashStatus?: CashStatus | undefined
  cashVariancePaisa?: number | null | undefined
  notes?: string | undefined
  openItems?: Array<{ key?: string | undefined; label?: string | undefined; text?: string | undefined }> | undefined
  checklist?: Array<{ key: string; label: string; done?: boolean | undefined }> | undefined
}

/**
 * Creates a shift handover record in the database using RPC `create_shift_handover`.
 */
export async function submitShiftHandover(
  params: CreateShiftHandoverParams
): Promise<ShiftHandoverEntity> {
  const clientUuid = crypto.randomUUID()

  if (IS_MOCK) {
    const existing = readMockLocalStorageRecords()
    const nextId = existing.reduce((max, r) => Math.max(max, r.id), 0) + 1
    const newRecord: HandoverRecord = {
      id: nextId,
      dbId: clientUuid,
      date: 'Today',
      dateISO: new Date().toISOString().slice(0, 10),
      shiftCode: params.shiftCode,
      from: `${params.fromUserName} (Shift ${params.shiftCode})`,
      to: params.toUserName || 'Next Shift',
      cashAmount: Math.round((params.cashCountedPaisa ?? 0) / 100),
      cashStatus: params.cashStatus ?? 'matched',
      cashDisplay: params.cashCountedPaisa != null ? `Rs ${(params.cashCountedPaisa / 100).toLocaleString('en-IN')} · ${params.cashStatus ?? 'matched'}` : 'Counted',
      checksCompleted: `${(params.checklist ?? []).filter((c) => c.done).length} / 5`,
      status: 'Pending',
      notes: params.notes || '',
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([newRecord, ...existing]))
    }
    notifyHandoversUpdated()

    return {
      id: clientUuid,
      client_uuid: clientUuid,
      shift_code: params.shiftCode,
      shift_date: newRecord.dateISO,
      from_user_id: 'mock-user-id',
      from_user_name: params.fromUserName,
      from_user_role: params.fromUserRole,
      to_user_id: params.toUserId ?? null,
      to_user_name: params.toUserName ?? null,
      cash_counted_paisa: params.cashCountedPaisa ?? null,
      cash_status: params.cashStatus ?? 'matched',
      cash_variance_paisa: params.cashVariancePaisa ?? 0,
      notes: params.notes ?? '',
      open_items: params.openItems ?? [],
      checklist: params.checklist ?? [],
      status: 'pending',
      acknowledged_at: null,
      acknowledged_by: null,
      acknowledged_by_name: null,
      acknowledgement_note: null,
      archived_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }

  if (!supabase || typeof supabase.rpc !== 'function') {
    throw new Error('Staff shift handover is unavailable. Database connection is not configured.')
  }

  const { data, error } = await supabase.rpc('create_shift_handover', {
    p_client_uuid: clientUuid,
    p_shift_code: params.shiftCode,
    p_from_user_name: params.fromUserName,
    p_from_user_role: params.fromUserRole,
    p_to_user_id: params.toUserId ?? null,
    p_to_user_name: params.toUserName ?? null,
    p_cash_counted_paisa: params.cashCountedPaisa ?? 0,
    p_cash_status: params.cashStatus ?? 'matched',
    p_cash_variance_paisa: params.cashVariancePaisa ?? 0,
    p_notes: params.notes ?? '',
    p_open_items: params.openItems ?? [],
    p_checklist: params.checklist ?? [],
  })

  if (error) {
    console.error('Failed to create shift handover:', error)
    throw error
  }

  notifyHandoversUpdated()
  return data as ShiftHandoverEntity
}

/**
 * Acknowledges a shift handover using RPC `acknowledge_shift_handover`.
 */
export async function acknowledgeShiftHandover(
  handoverId: string,
  note?: string | null | undefined,
  operatorName?: string | null | undefined
): Promise<ShiftHandoverEntity> {
  if (IS_MOCK) {
    const existing = readMockLocalStorageRecords()
    const found = existing.find((r) => r.dbId === handoverId || String(r.id) === handoverId)
    if (found) {
      found.status = 'Complete'
      if (note) found.notes = `${found.notes}\n[Ack] ${note}`.trim()
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(existing))
      }
      notifyHandoversUpdated()
    }
    return {
      id: handoverId,
      client_uuid: crypto.randomUUID(),
      shift_code: found?.shiftCode ?? 'A',
      shift_date: found?.dateISO ?? new Date().toISOString().slice(0, 10),
      from_user_id: 'mock',
      from_user_name: found?.from ?? 'Staff',
      from_user_role: 'Operations',
      to_user_id: null,
      to_user_name: operatorName ?? 'Staff',
      cash_counted_paisa: (found?.cashAmount ?? 0) * 100,
      cash_status: found?.cashStatus ?? 'matched',
      cash_variance_paisa: 0,
      notes: found?.notes ?? '',
      open_items: [],
      checklist: [],
      status: 'acknowledged',
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: 'current-user',
      acknowledged_by_name: operatorName ?? 'Operations Staff',
      acknowledgement_note: note ?? null,
      archived_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }

  if (!supabase || typeof supabase.rpc !== 'function') {
    throw new Error('Staff shift handover is unavailable. Database connection is not configured.')
  }

  const { data, error } = await supabase.rpc('acknowledge_shift_handover', {
    p_handover_id: handoverId,
    p_acknowledgement_note: note ?? null,
    p_operator_name: operatorName ?? null,
  })

  if (error) {
    console.error('Failed to acknowledge shift handover:', error)
    throw error
  }

  notifyHandoversUpdated()
  return data as ShiftHandoverEntity
}

/**
 * Archives a shift handover using RPC `archive_shift_handover`.
 */
export async function archiveShiftHandover(handoverId: string): Promise<ShiftHandoverEntity> {
  if (IS_MOCK) {
    const existing = readMockLocalStorageRecords().filter((r) => r.dbId !== handoverId && String(r.id) !== handoverId)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing))
    }
    notifyHandoversUpdated()
    return {} as ShiftHandoverEntity
  }

  if (!supabase || typeof supabase.rpc !== 'function') {
    throw new Error('Staff shift handover is unavailable. Database connection is not configured.')
  }

  const { data, error } = await supabase.rpc('archive_shift_handover', {
    p_handover_id: handoverId,
  })

  if (error) {
    console.error('Failed to archive shift handover:', error)
    throw error
  }

  notifyHandoversUpdated()
  return data as ShiftHandoverEntity
}

// ── Backward-Compatible Legacy Helpers ───────────────────────────────

export function getHandoverRecords(): HandoverRecord[] {
  if (!IS_MOCK) throw new Error('Staff shift handover is unavailable. Existing local entries have been preserved.')
  return readMockLocalStorageRecords()
}

export function saveHandoverRecords(records: HandoverRecord[]): void {
  if (!IS_MOCK) throw new Error('Staff shift handover is unavailable. Existing local entries have been preserved.')
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  }
}

export function completeHandover(id: number, notes: string): HandoverRecord[] {
  if (!IS_MOCK) throw new Error('Staff shift handover is unavailable. Existing local entries have been preserved.')
  const records = getHandoverRecords()
  const idx = records.findIndex((r) => r.id === id)
  const existing = records[idx]
  if (idx !== -1 && existing) {
    records[idx] = {
      ...existing,
      status: 'Complete',
      checksCompleted: '5 / 5',
      notes: notes || existing.notes,
    }
    saveHandoverRecords(records)
    notifyHandoversUpdated()
  }
  return records
}

// ── KPI stats ────────────────────────────────────────────────────────

export interface HandoverStats {
  handovers7d: number
  onTimeRate: string
  cashFlags: number
  checklistMisses: number
}

export function getHandoverStats(records: HandoverRecord[]): HandoverStats {
  const total = records.length
  const onTime = records.filter((r) => r.checksCompleted === '5 / 5').length
  const cashFlags = records.filter((r) => r.cashStatus === 'short' || r.cashStatus === 'over').length
  const misses = total - onTime

  return {
    handovers7d: total,
    onTimeRate: total > 0 ? Math.round((onTime / total) * 100) + '%' : '—',
    cashFlags,
    checklistMisses: misses,
  }
}

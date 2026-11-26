import { supabase } from '../supabase'
import { operationalDayOf, operationalDayBounds, dayStartMinutesFrom } from '../operationalDay'
import { getSetting } from '../settingsStore'
import type { Bar, ResourceDefinition, RowType } from '../../data/calendar'

export interface CalendarResourceSource {
  id: string
  status: 'complete' | 'unavailable'
  reason?: string
  count?: number
  unallocated?: number
}
export interface CalendarResources {
  catalogue: ResourceDefinition[]
  bars: Bar[]
  sources: CalendarResourceSource[]
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Resource data was incomplete. Reload before planning.')
  return value as Record<string, unknown>
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('Resource identity was incomplete. Nothing was inferred.')
  return value
}
const types: readonly string[] = ['Equipment', 'Vehicles', 'Crew', 'Warehouse Bays']

/** Validate the money-free wire response before rendering any capacity or assignment. */
export function parseCalendarResources(value: unknown): CalendarResources {
  const data = record(value)
  if (!Array.isArray(data['resources']) || !Array.isArray(data['allocations']) || !Array.isArray(data['sources'])) {
    throw new Error('Resource sources were not confirmed. Availability is unknown.')
  }
  const catalogue = data['resources'].map((raw): ResourceDefinition => {
    const row = record(raw), type = text(row['type'])
    if (!types.includes(type)) throw new Error('Unknown resource type. Nothing was inferred.')
    const capacity = row['capacity']
    if (capacity !== undefined && (!Number.isSafeInteger(capacity) || Number(capacity) < 0)) throw new Error('Recorded resource capacity is invalid.')
    return { id: text(row['id']), type: type as RowType, name: text(row['name']), meta: text(row['meta']),
      icon: type === 'Crew' ? 'crew' : type === 'Vehicles' ? 'truck' : 'box',
      ...(typeof row['code'] === 'string' ? { code: row['code'] } : {}),
      ...(typeof capacity === 'number' ? { capacity } : {}) }
  })
  const ids = new Set(catalogue.map(row => row.id))
  if (ids.size !== catalogue.length) throw new Error('Resource identities were duplicated. Nothing was merged.')
  const bars = data['allocations'].map((raw): Bar => {
    const row = record(raw), resourceId = text(row['resource_id'])
    if (!ids.has(resourceId)) throw new Error('An allocation has no verified resource. Reload before planning.')
    const start = text(row['start_at']), end = text(row['end_at'])
    if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(start) >= Date.parse(end)) throw new Error('An allocation has an invalid time window.')
    const quantity = row['quantity']
    if (!Number.isSafeInteger(quantity) || Number(quantity) < 1) throw new Error('An allocation quantity was not verified.')
    const stage = text(row['stage'])
    const completed = stage === 'Closed' || stage === 'Returned'
    const bookingNo = typeof row['booking_no'] === 'string' ? row['booking_no'] : undefined
    return { id: text(row['id']), resourceId, label: bookingNo ?? text(row['label']),
      kind: completed ? 'Completed' : row['kind'] === 'Crew Duty' ? 'Crew Duty' : stage === 'On Rent' ? 'On Rent' : 'Reserved',
      from: new Date(operationalDayOf(start, dayStartMinutesFrom(getSetting('operationalDayStart'))) + 'T00:00:00Z'),
      to: new Date(operationalDayOf(end, dayStartMinutesFrom(getSetting('operationalDayStart'))) + 'T00:00:00Z'),
      intervalStart: start, intervalEnd: end, quantity: Number(quantity), stage,
      ...(typeof row['booking_id'] === 'string' ? { bookingId: row['booking_id'] } : {}),
      ...(bookingNo ? { bookingNo } : {}),
      ...(row['precision'] === 'day' ? { note: 'Recorded whole days' } : {}) }
  })
  const sources = data['sources'].map((raw): CalendarResourceSource => {
    const row = record(raw)
    if (row['status'] !== 'complete' && row['status'] !== 'unavailable') throw new Error('Resource completeness is unknown.')
    return { id: text(row['id']), status: row['status'],
      ...(typeof row['reason'] === 'string' ? { reason: row['reason'] } : {}),
      ...(typeof row['count'] === 'number' ? { count: row['count'] } : {}),
      ...(typeof row['unallocated'] === 'number' ? { unallocated: row['unallocated'] } : {}) }
  })
  return { catalogue, bars, sources }
}

export async function listCalendarResources(from: string, to: string): Promise<CalendarResources> {
  const start = dayStartMinutesFrom(getSetting('operationalDayStart'))
  const p_from = operationalDayBounds(from, start).fromAd
  const p_to = new Date(Date.parse(operationalDayBounds(to, start).toAd) + 1).toISOString()
  const { data, error } = await supabase.rpc('calendar_resource_window', { p_from, p_to })
  if (error) throw new Error('Resource planning is unavailable: ' + error.message)
  return parseCalendarResources(data)
}

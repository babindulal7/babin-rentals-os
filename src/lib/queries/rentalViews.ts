import { listBookings } from './bookings'
import { applyListFilters, type FilterBuilder, type ListFilters } from './listQuery'
import { supabase } from '../supabase'

export const RENTAL_VIEWS = [
  { id: 'All', label: 'All', icon: 'checklist', stages: [] },
  { id: 'Draft', label: 'Draft', icon: 'file', stages: ['Draft'] },
  { id: 'Quote', label: 'Quote', icon: 'file', stages: ['Quote'] },
  { id: 'Upcoming', label: 'Upcoming', icon: 'calendar', stages: ['Quote', 'Booked', 'Packed'] },
  { id: 'Out', label: 'Out', icon: 'truck', stages: ['On Rent'] },
  { id: 'Returns', label: 'Returns', icon: 'return_arrow', stages: ['Returned'] },
  { id: 'Closed', label: 'Closed', icon: 'lock', stages: ['Closed'] },
  // ADOPTIONS item 4 (Booqable §9.2): the excluded population's census.
  // Cancelled is a presence flag, not a stage (Law 3 / 0015) — every other
  // view excludes it, so without this row a cancelled booking disappears with
  // no visible opt-in. Counted with the flag flipped; never added to All.
  { id: 'Cancelled', label: 'Cancelled', icon: 'close', stages: [] },
] as const

export interface RentalViewCount { id: string; count: number | null }
interface DraftCountBuilder extends FilterBuilder<DraftCountBuilder>, PromiseLike<{ count: number | null; error: { message: string } | null }> {}

/** Facets count the matching registry, never the displayed page. No money is selected. */
export async function listRentalViewCounts(filters: ListFilters): Promise<{ rows: RentalViewCount[] }> {
  const { stage: _stage, ...chips } = filters.chips ?? {}
  const base = { ...filters, chips, page: undefined, range: undefined, sort: undefined }
  const booked = await Promise.all(RENTAL_VIEWS.map(async (view) => {
    if (view.id === 'Draft') return null
    if (view.id === 'Cancelled') {
      // The census half of the exclusion: same base narrowings, flag flipped.
      // No stage constraint — Cancelled preserves where the booking died.
      const result = await listBookings({ ...base, presence: { cancelled_at: true }, chips, headOnly: true, excludeArchived: true })
      const total = result.total
      return typeof total === 'number' && !Number.isNaN(total) ? total : null
    }
    const result = await listBookings({ ...base, chips: { ...chips, ...(view.stages.length ? { stage: [...view.stages] } : {}) }, headOnly: true, excludeArchived: true })
    const total = result.total
    return typeof total === 'number' && !Number.isNaN(total) ? total : null
  }))
  // A line-level Sub-Rental facet only provides saved booking ids; it cannot answer drafts.
  let drafts: number | null = null
  if (!chips.id?.length) {
    const { project_type: projectTypes, ...draftChips } = chips
    // JSON-path facets recurse through the SDK's JSON type; the HEAD projection needs only this structural builder.
    const head = supabase.from('rental_drafts').select('id', { count: 'exact', head: true }).eq('status', 'Active')
    const query = applyListFilters(head as unknown as DraftCountBuilder, {
      ...base,
      chips: { ...draftChips, ...(projectTypes?.length ? { 'data->>kind': projectTypes } : {}) },
      searchColumns: ['data->>bookingNo', 'data->>project', 'data->>kind', 'data->>kindOther', 'data->>clientName'],
      dateRange: filters.dateRange ? { ...filters.dateRange, column: 'data->>pickup' } : undefined,
      presence: undefined,
    })
    const { count, error } = await query
    if (error) throw new Error(`Could not count rental drafts: ${error.message}`)
    drafts = typeof count === 'number' && !Number.isNaN(count) ? count : null
  }
  return { rows: RENTAL_VIEWS.map((view, index) => {
    const bCount = booked[index]
    const bNum = typeof bCount === 'number' && !Number.isNaN(bCount) ? bCount : null
    let count: number | null = null
    if (view.id === 'Draft') {
      count = drafts
    } else if (view.id === 'All') {
      if (bNum === null || drafts === null) {
        count = null
      } else {
        count = bNum + drafts
      }
    } else {
      count = bNum
    }
    return { id: view.id, count }
  }) }
}

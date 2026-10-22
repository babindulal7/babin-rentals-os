import { useList, type ListResult } from './useList'
import { listTimesheetWeek, type TimesheetRow, type TimesheetWeek } from './timesheet'

/**
 * The crew timesheet for a week chip. The week rides in `chips` so `useList`
 * refetches on change and drops a slower, older response — switching "This
 * Week" → "Last Week" mid-load must not let the old week win.
 *
 * `isFilteredOverride: false` because a week is a place you look, not a filter
 * narrowing a list: an empty week must not offer "Clear filters".
 */
export function useTimesheetWeek(week: TimesheetWeek): ListResult<TimesheetRow> {
  return useList<TimesheetRow>(
    (filters) => listTimesheetWeek(filters.chips?.['week']?.[0] === 'Last Week' ? 'Last Week' : 'This Week'),
    { chips: { week: [week] } },
    { isFilteredOverride: false },
  )
}

import type { ReportFilters } from '../../components/ui/ReportToolbar'
import type { ReportFilterOptions } from '../../lib/queries/reportSupport'

/**
 * Small pieces the Law 16 report pages share (Phase 6 Task 3.4).
 *
 * The page-level states come from `useLoad` + `PageBody`; these cover the two
 * things every report toolbar adds on top: turning the toolbar's filters into
 * the query's options, and telling "nothing yet" from "nothing in this period".
 */

/** The toolbar's period and branch chip, as the report queries take them. */
export function reportFilterOptions(filters: ReportFilters): ReportFilterOptions {
  return {
    from: filters.dateRange?.fromAd,
    to: filters.dateRange?.toAd,
    branchId: filters.chips?.['branch_id']?.[0],
  }
}

/** True when a period or a chip narrows the read — the empty state is then "no results", not "nothing yet". */
export function hasReportFilters(filters: ReportFilters): boolean {
  if (filters.dateRange && (filters.dateRange.fromAd || filters.dateRange.toAd)) return true
  return Object.values(filters.chips ?? {}).some((v) => Array.isArray(v) && v.length > 0)
}

/**
 * One table row saying a section has nothing to list, so a table never renders
 * as a bare header. With a search query it names the query (filtered no-results);
 * without one it says the section is empty for this period.
 */
export function NoMatchRow({ colSpan, query, noun }: { colSpan: number; query?: string; noun: string }) {
  const q = query?.trim()
  return (
    <tr>
      <td
        colSpan={colSpan}
        style={{ padding: 'var(--sp-md)', fontSize: 'var(--t-meta)', color: 'var(--text2)', textAlign: 'center' }}
      >
        {q ? `No ${noun} match “${q}”.` : `No ${noun} to show.`}
      </td>
    </tr>
  )
}

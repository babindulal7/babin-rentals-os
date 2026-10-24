import { useMemo, useState, type ReactNode } from 'react'
import { DataTable, type DataTableColumn } from '../DataTable'
import { Button } from '../Page'

export interface ReportDataColumn<Row> extends DataTableColumn<Row> {
  header: string
  sortValue: (row: Row) => string | number | null
}

/** Controls only the already-authorized rows. It never reads a wider dataset. */
export function ReportDataTable<Row>({ rows, columns, getRowId, ariaLabel, sourceAction }: {
  rows: readonly Row[]
  columns: readonly ReportDataColumn<Row>[]
  getRowId: (row: Row) => string
  ariaLabel: string
  sourceAction?: ReactNode
}) {
  const [search, setSearch] = useState('')
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const [sort, setSort] = useState({ columnId: columns[0]?.id ?? '', direction: 'asc' as 'asc' | 'desc' })
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const visible = columns.filter(column => !hidden.has(column.id)).map(column => column.id)
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase()
    const result = rows.filter(row => !needle || columns.some(column => String(column.sortValue(row) ?? '').toLocaleLowerCase().includes(needle)))
    const column = columns.find(item => item.id === sort.columnId)
    if (!column) return result
    return result.map((row, index) => ({ row, index })).sort((a, b) => {
      const av = column.sortValue(a.row), bv = column.sortValue(b.row)
      if (av === null) return bv === null ? a.index - b.index : 1
      if (bv === null) return -1
      const comparison = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return (sort.direction === 'asc' ? comparison : -comparison) || a.index - b.index
    }).map(item => item.row)
  }, [rows, columns, search, sort])
  const lastPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1)
  const currentPage = Math.min(page, lastPage)
  const pageRows = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
  const control = { minHeight: 44, color: 'var(--text)', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-btn)', padding: '0 10px', font: 'inherit' } as const

  return <section aria-label={`${ariaLabel} controls`} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>Search
        <input aria-label={`Search ${ariaLabel}`} value={search} onChange={event => { setSearch(event.target.value); setPage(0) }} style={{ ...control, width: 220, maxWidth: '100%' }} />
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>Sort by
        <select aria-label={`Sort ${ariaLabel} by`} value={sort.columnId} onChange={event => { setSort({ columnId: event.target.value, direction: 'asc' }); setPage(0) }} style={control}>
          {columns.map(column => <option key={column.id} value={column.id}>{column.header}</option>)}
        </select>
      </label>
      <Button variant="secondary" onClick={() => setSort(current => ({ ...current, direction: current.direction === 'asc' ? 'desc' : 'asc' }))}>{sort.direction === 'asc' ? 'Ascending' : 'Descending'}</Button>
      <details>
        <summary style={{ ...control, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>Columns</summary>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: 10, background: 'var(--card)' }}>
          {columns.map((column, index) => <label key={column.id} style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={!hidden.has(column.id)} disabled={index === 0} onChange={event => setHidden(current => {
              const next = new Set(current)
              if (event.target.checked) next.delete(column.id); else next.add(column.id)
              return next
            })} />{column.header}
          </label>)}
        </div>
      </details>
      {sourceAction}
    </div>
    <DataTable ariaLabel={ariaLabel} rows={pageRows} columns={columns.map(column => ({ ...column, sortable: true }))} getRowId={getRowId} visibleColumnIds={visible} sort={sort} onSortChange={next => { setSort(next); setPage(0) }} emptyState={search ? `No rows match “${search}”.` : 'No records in this period.'} />
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
      <span role="status">{filtered.length} rows · Page {currentPage + 1} of {lastPage + 1}</span>
      <Button variant="secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous page</Button>
      <Button variant="secondary" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>Next page</Button>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>Rows per page
        <select aria-label={`Rows per page for ${ariaLabel}`} value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(0) }} style={control}>
          {[10, 25, 50].map(size => <option key={size}>{size}</option>)}
        </select>
      </label>
    </div>
  </section>
}

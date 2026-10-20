import { useCallback, useMemo } from 'react'
import { adjacentInspectorRow, inspectorPosition } from '../../lib/inspectorNavigation'

interface Props<Row> {
  /** Only rows present in the current filtered/sorted/page view. */
  rows: readonly Row[]
  selectedId: string | null
  getId: (row: Row) => string
  onSelect: (row: Row) => void
}

/**
 * Retains the page's own selected-record state and business actions.
 * Does NOT prefetch other pages or cross active filters.
 */
export function useInspectorTraversal<Row>({ rows, selectedId, getId, onSelect }: Props<Row>) {
  const position = useMemo(
    () => inspectorPosition(rows, selectedId, getId),
    [rows, selectedId, getId],
  )
  const step = useCallback((direction: -1 | 1) => {
    const next = adjacentInspectorRow(rows, selectedId, getId, direction)
    if (next !== null) onSelect(next)
  }, [rows, selectedId, getId, onSelect])

  const previous = useCallback(() => step(-1), [step])
  const next = useCallback(() => step(1), [step])
  return { ...position, previous, next }
}

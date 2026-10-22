/**
 * Presentation-only record traversal. Never mutates a booking or equipment record.
 * IDs must be stable database IDs, not display labels or list indexes.
 */
export interface InspectorPosition {
  index: number
  position: number
  total: number
  canPrevious: boolean
  canNext: boolean
}

export function inspectorPosition<Row>(
  rows: readonly Row[],
  selectedId: string | null,
  getId: (row: Row) => string,
): InspectorPosition {
  const total = rows.length
  const index = selectedId === null ? -1 : rows.findIndex((row) => getId(row) === selectedId)
  return {
    index,
    position: index < 0 ? 0 : index + 1,
    total,
    canPrevious: index > 0,
    canNext: index >= 0 && index < total - 1,
  }
}

export function adjacentInspectorRow<Row>(
  rows: readonly Row[],
  selectedId: string | null,
  getId: (row: Row) => string,
  direction: -1 | 1,
): Row | null {
  const { index } = inspectorPosition(rows, selectedId, getId)
  if (index < 0) return null
  return rows[index + direction] ?? null
}

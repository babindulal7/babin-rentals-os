import { describe, expect, it } from 'vitest'
import { adjacentInspectorRow, inspectorPosition } from '../inspectorNavigation'

type Row = { id: string; label: string }
const rows: Row[] = [
  { id: 'a', label: 'First' }, { id: 'b', label: 'Second' }, { id: 'c', label: 'Third' },
]
const id = (r: Row) => r.id

describe('inspector traversal: only the current visible page', () => {
  it('uses stable ID ordering, not display labels', () => {
    expect(inspectorPosition(rows, 'b', id)).toEqual({ index: 1, position: 2, total: 3, canPrevious: true, canNext: true })
    expect(adjacentInspectorRow(rows, 'b', id, -1)?.id).toBe('a')
    expect(adjacentInspectorRow(rows, 'b', id, 1)?.id).toBe('c')
  })
  it('does not navigate past a page boundary', () => {
    expect(adjacentInspectorRow(rows, 'c', id, 1)).toBeNull()
    expect(adjacentInspectorRow(rows, 'a', id, -1)).toBeNull()
  })
  it('does not navigate to a removed/filtered record', () => {
    expect(inspectorPosition(rows.slice(1), 'a', id).position).toBe(0)
    expect(adjacentInspectorRow(rows.slice(1), 'a', id, 1)).toBeNull()
  })
  it('handles empty results and duplicates of the label', () => {
    expect(inspectorPosition([], 'b', id).total).toBe(0)
    expect(inspectorPosition([...rows, { id: 'd', label: 'Second' }], 'd', id).position).toBe(4)
  })
})

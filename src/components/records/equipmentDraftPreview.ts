import type { RecordValues } from '../../lib/recordEditor'

const text = (value: unknown): string => String(value ?? '').trim()

export interface EquipmentDraftPreviewUnit {
  serial: string
  condition: string
  warehouse: string
  location: string
}

/** Read-only presentation of UNSAVED input; never models actual fleet availability. */
export interface EquipmentDraftPreviewModel {
  name: string
  category: string
  maker: string
  trackingMode: string
  quantity: number | null
  units: EquipmentDraftPreviewUnit[]
}

/**
 * Preview only what the current editor actually collected. Asset codes, unit
 * tags and custody statuses do not exist until the server accepts a save.
 */
export function buildEquipmentDraftPreview(
  values: RecordValues,
  rows: readonly RecordValues[],
  categoryName: string | undefined,
  warehouses: readonly { id: string; name: string }[],
): EquipmentDraftPreviewModel {
  const trackingMode = text(values.tracking_mode) || 'Not chosen'
  const serialised = trackingMode === 'Serialised'
  const byWarehouse = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse.name]))
  const n = Number(values.total_quantity)
  return {
    name: text(values.name) || 'Unnamed equipment',
    category: categoryName || 'Not chosen',
    maker: [text(values.brand), text(values.model)].filter(Boolean).join(' ') || 'Brand and model not set',
    trackingMode,
    quantity: serialised ? rows.length : Number.isFinite(n) && n > 0 ? n : null,
    units: serialised ? rows.map((unit) => ({
      serial: text(unit.serial_no) || 'Serial not entered',
      condition: text(unit.condition) || 'Not recorded',
      warehouse: byWarehouse.get(text(unit.warehouse_id)) || 'Warehouse not selected',
      location: [
        text(unit.rack) ? `Rack ${text(unit.rack)}` : '',
        text(unit.shelf) ? `Shelf ${text(unit.shelf)}` : '',
        text(unit.bin) ? `Bin ${text(unit.bin)}` : '',
      ].filter(Boolean).join(' · ') || 'Shelf location not set',
    })) : [],
  }
}

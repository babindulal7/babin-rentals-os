import { Card } from '../ui/Page'
import type { RecordValues } from '../../lib/recordEditor'
import { equipmentReadiness } from './equipmentAssist'
import { buildEquipmentDraftPreview } from './equipmentDraftPreviewModel'

interface Props {
  values: RecordValues
  rows: readonly RecordValues[]
  categoryName: string | undefined
  warehouses: readonly { id: string; name: string }[]
}

/** Read-only, no network access and no writes. Values update with the open form. */
export function EquipmentDraftPreview({ values, rows, categoryName, warehouses }: Props) {
  const model = buildEquipmentDraftPreview(values, rows, categoryName, warehouses)
  const readiness = equipmentReadiness(values, rows)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <p role="note" style={{ margin: 0, color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>
        Unsaved preview. No equipment, asset code, barcode or unit tag has been created.
        Availability and rental custody are managed after saving, not in this form.
      </p>
      <Card title="Equipment identity">
        <div style={{ display: 'grid', gap: 8 }}>
          <strong style={{ fontSize: 'var(--t-ui)', color: 'var(--text)' }}>{model.name}</strong>
          <span style={{ color: 'var(--text2)' }}>{model.category} · {model.maker}</span>
          <span style={{ color: 'var(--text2)' }}>Tracking: {model.trackingMode}</span>
          <span style={{ color: 'var(--text2)' }}>
            Stock entered: {model.quantity === null ? 'Not entered' : model.quantity}
          </span>
        </div>
      </Card>
      <Card title={model.trackingMode === 'Serialised' ? `Units (${model.units.length})` : 'Stock setup'}>
        {model.trackingMode !== 'Serialised'
          ? <p style={{ margin: 0, color: 'var(--text2)' }}>Quantity-tracked items do not receive invented serial numbers in this preview.</p>
          : model.units.length === 0
            ? <p style={{ margin: 0, color: 'var(--text2)' }}>No serialised units have been added.</p>
            : <ol style={{ margin: 0, paddingLeft: 'var(--sp-xl)', display: 'grid', gap: 'var(--sp-sm)' }}>
                {model.units.map((unit, index) => (
                  <li key={index}>
                    <strong>{unit.serial}</strong>
                    <div style={{ color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>{unit.condition} · {unit.warehouse} · {unit.location}</div>
                  </li>
                ))}
              </ol>}
      </Card>
      <Card title="Ready-to-rent checklist">
        <ul style={{ margin: 0, paddingLeft: 'var(--sp-xl)', display: 'grid', gap: 'var(--sp-xs)' }}>
          {readiness.map((item) => (
            <li key={item.label} style={{ color: item.ok ? 'var(--success-text)' : 'var(--text2)' }}>
              {item.ok ? 'Complete: ' : 'Needs attention: '}{item.label}
            </li>
          ))}
        </ul>
        <p style={{ marginBottom: 0, color: 'var(--muted)', fontSize: 'var(--t-meta)' }}>
          Checklist guidance only. Save validation and permissions are unchanged.
        </p>
      </Card>
    </div>
  )
}

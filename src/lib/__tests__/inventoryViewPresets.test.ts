import { describe, expect, it } from 'vitest'
import { captureInventoryView, encodeInventoryView, restoreInventoryView, type InventoryViewChoices } from '../inventoryViewPresets'

const choices: InventoryViewChoices = {
  chips: ['all', 'in-stock', 'on-rent', 'damaged'],
  categories: ['Camera', 'Lens', 'Lighting'],
  statuses: ['In Stock', 'On Rent', 'Maintenance'],
  conditions: ['Excellent', 'Good', 'Damaged'],
  trackingModes: ['Serialised', 'Quantity', 'Consumable'],
  sorts: ['Equipment A–Z', 'Equipment Z–A', 'Category A–Z'],
  defaultSort: 'Equipment A–Z',
}

describe('Inventory saved view URL codec', () => {
  it('captures filters, sort and layout without navigation or finance params', () => {
    const url = new URLSearchParams('tab=new&action=edit&page=9&per=100&q=FX3&chip=on-rent&category=Camera&purchase_price=9000')
    const result = captureInventoryView(url, { sort: 'Category A–Z', layout: 'grid' }, choices)
    expect(result).toContain('q=FX3')
    expect(result).toContain('chip=on-rent')
    expect(result).toContain('viewLayout=grid')
    expect(result).toContain('viewSort=')
    for (const forbidden of ['tab=', 'action=', 'page=', 'per=', 'purchase_price=']) expect(result).not.toContain(forbidden)
  })

  it('round-trips working facets while dropping unknown enum values', () => {
    const result = restoreInventoryView('status=In+Stock%2CBad+State&condition=Good%2CDamaged&serialisation=Serialised&viewSort=Category+A%E2%80%93Z', choices)
    expect(result.params.get('status')).toBe('In Stock')
    expect(result.params.get('condition')).toBe('Good,Damaged')
    expect(result.params.get('serialisation')).toBe('Serialised')
    expect(result.sort).toBe('Category A–Z')
  })

  it('rejects an unavailable paged sort and a malicious layout', () => {
    const result = restoreInventoryView('viewSort=Needs+attention+first&viewLayout=fullscreen&money=secret&action=delete', choices)
    expect(result.sort).toBe(choices.defaultSort)
    expect(result.layout).toBe('table')
    expect(result.params.toString()).toBe('')
  })

  it('resets to safe defaults when All equipment is chosen', () => {
    const result = restoreInventoryView(null, choices)
    expect(result.sort).toBe(choices.defaultSort)
    expect(result.layout).toBe('table')
    expect(result.params.toString()).toBe('')
  })

  it('never stores defaults as misleading active saved-view filters', () => {
    expect(encodeInventoryView(new URLSearchParams('viewSort=Equipment+A%E2%80%93Z&viewLayout=table&tab=Equipment'), choices)).toBe('')
  })

  it('truncates untrusted search terms, preserving normal search behavior', () => {
    const result = restoreInventoryView('q=' + 'x'.repeat(1000), choices)
    expect(result.params.get('q')?.length).toBe(160)
  })
})

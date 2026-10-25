import { describe, expect, it } from 'vitest'
import lumaCss from '../../styles/shadcn-luma-ui.css?inline'
import entry from '../../main.tsx?raw'

describe('shadcn preset b1aJD8RZg (Luma + Zinc + Emerald) UI styling', () => {
  it('loads after responsive.css in main.tsx', () => {
    expect(entry).toMatch(/import '\.\/styles\/responsive\.css'[\s\S]*import '\.\/styles\/shadcn-luma-ui\.css'/)
  })

  it('preserves status tokens, roles and rental law without !important overrides', () => {
    expect(lumaCss).not.toContain('!important')
    expect(lumaCss).not.toMatch(/^\s*--(?:primary|success|danger|warn|ready|neutral|st-[a-z-]+):/m)
  })

  it('enforces minimum 44px touch targets on interactive controls and buttons', () => {
    expect(lumaCss).toMatch(/\.ui-button[\s\S]*?min-height:\s*44px/)
    expect(lumaCss).toMatch(/\.control[\s\S]*?min-height:\s*44px/)
  })

  it('implements Luma medium radius scale across cards, tables, controls and tags', () => {
    expect(lumaCss).toMatch(/\.surface-card[\s\S]*?border-radius:\s*12px/)
    expect(lumaCss).toMatch(/\.data-table-shell[\s\S]*?border-radius:\s*12px/)
    expect(lumaCss).toMatch(/\.control[\s\S]*?border-radius:\s*9px/)
    expect(lumaCss).toMatch(/\.ui-button[\s\S]*?border-radius:\s*8px/)
    expect(lumaCss).toMatch(/\.tag[\s\S]*?border-radius:\s*7px/)
  })
})

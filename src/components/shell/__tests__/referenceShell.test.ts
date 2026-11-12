import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { PRIMARY_NAV, filterNavByRole } from '../../../data/nav'

const read = (relPath: string) =>
  fs.readFileSync(path.resolve(__dirname, relPath), 'utf8')

const referenceStyles = read('../referenceShell.css')
const todaySource = read('../../../modules/today/Today.tsx')
const appSource = read('../../../App.tsx')
const sidebarSource = read('../Sidebar.tsx')

/**
 * Contract checks for the 12 Nov prototype translation. The uploaded prototype
 * had demo PINs, sample revenue and simulated conflict resolution; these must
 * NEVER become operational truth in the real product.
 *
 * Actual browser screenshot and hosted RLS/device acceptance remain separate.
 */
describe('reference app shell — layout and data safety', () => {
  it('has a cinematic dark palette while retaining a readable light counterpart', () => {
    expect(referenceStyles).toContain(":root[data-theme='dark'] .br-reference-shell")
    expect(referenceStyles).toContain("--app: #050b12")
    expect(referenceStyles).toContain("--card: #0b1622")
    expect(referenceStyles).toContain("--card2: #081522")
    expect(referenceStyles).toContain(":root[data-theme='light'] .br-reference-shell")
    expect(referenceStyles).toContain('--br-brand-action: #2456d6')
  })

  it('covers desktop, iPad and phone layouts without introducing dummy viewport flags', () => {
    expect(referenceStyles).toContain('min-width: 768px')
    expect(referenceStyles).toContain('max-width: 1279px')
    expect(referenceStyles).toContain('max-width: 767px')
    expect(referenceStyles).toContain('.br-reference-workbench')
    expect(referenceStyles).toContain('.br-reference-inspector--phone')
    expect(referenceStyles).toContain('prefers-reduced-motion')
    expect(appSource).toContain('className="br-reference-shell"')
    expect(sidebarSource).toContain('br-reference-brand-mark')
  })

  it('keeps the fixed eleven real navigation destinations, not the mock fourteen', () => {
    expect(PRIMARY_NAV).toHaveLength(11)
    expect(PRIMARY_NAV.map((x) => x.to)).toContain('/finance')
    expect(filterNavByRole(PRIMARY_NAV, 'Warehouse').map((x) => x.to)).not.toContain('/finance')
  })

  it('uses RLS-filtered movement data and the existing operation gate, not static rental/PIN fixtures', () => {
    expect(todaySource).toContain('pickupRows.find(')
    expect(todaySource).toContain("dashboardAction(nextPickup, 'outgoing')")
    expect(todaySource).toContain('openOperations(')
    expect(todaySource).not.toContain('STAFF_ROLES')
    expect(todaySource).not.toContain('INITIAL_RENTALS')
    expect(todaySource).not.toContain('pinInput !==')
    expect(todaySource).not.toContain('KARTIK_REVENUE_BARS')
  })
})

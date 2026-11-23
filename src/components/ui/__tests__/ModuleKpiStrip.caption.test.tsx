import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ModuleKpiStrip, isZeroFigure, type ModuleKpiItem } from '../module-shell/ModuleKpiStrip'

function tile(overrides: Partial<ModuleKpiItem>): ModuleKpiItem {
  return {
    id: 'outstanding',
    label: 'Outstanding Invoices',
    count: 3,
    subtitle: 'Rs 1,234 receivable',
    icon: 'receipt',
    ...overrides,
  }
}

describe('ModuleKpiStrip — the tile says what it counts', () => {
  it('prints the definition on the tile, as a caption under the subtitle', () => {
    const html = renderToStaticMarkup(<ModuleKpiStrip items={[tile({ definition: 'Unpaid invoices.' })]} />)
    expect(html).toContain('module-kpi-card__caption')
    expect(html).toContain('Unpaid invoices.')
    expect(html.indexOf('Rs 1,234 receivable')).toBeLessThan(html.indexOf('Unpaid invoices.'))
  })

  it('explains a known zero in place of the definition', () => {
    const html = renderToStaticMarkup(
      <ModuleKpiStrip items={[tile({ count: 0, definition: 'Unpaid invoices.', zeroExplanation: 'Nothing receivable.' })]} />,
    )
    expect(html).toContain('Nothing receivable.')
    expect(html).not.toContain('Unpaid invoices.')
  })

  it('never reads an unknown figure as zero, so its zero explanation stays off the tile', () => {
    const html = renderToStaticMarkup(
      <ModuleKpiStrip items={[tile({ count: '—', definition: 'Unpaid invoices.', zeroExplanation: 'Nothing receivable.' })]} />,
    )
    expect(html).not.toContain('Nothing receivable.')
    expect(html).toContain('Unpaid invoices.')
  })

  it('treats a money zero as zero, and a dash or a loading ellipsis as neither zero nor a figure', () => {
    expect(isZeroFigure('Rs 0')).toBe(true)
    expect(isZeroFigure('0')).toBe(true)
    expect(isZeroFigure(0)).toBe(true)
    expect(isZeroFigure('—')).toBe(false)
    expect(isZeroFigure('…')).toBe(false)
    expect(isZeroFigure('Rs 1,234')).toBe(false)
  })

  it('prints no caption when the item gives neither a definition nor a zero explanation', () => {
    const html = renderToStaticMarkup(<ModuleKpiStrip items={[tile({})]} />)
    expect(html).not.toContain('module-kpi-card__caption')
  })
})

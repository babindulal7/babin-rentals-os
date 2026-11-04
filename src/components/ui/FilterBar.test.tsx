// @vitest-environment jsdom
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FilterBar } from './FilterBar'

describe('FilterBar quick option affordances', () => {
  it('disables informational options without selection handlers', () => {
    const html = renderToStaticMarkup(
      <FilterBar options={[{ id: 'packed', label: 'Packed', count: 3 }]} />,
    )
    expect(html).toMatch(/disabled=""/)
    expect(html).not.toContain('aria-pressed')
    expect(html).toContain('(3)')
  })

  it('keeps interactive options enabled and exposes selected state', () => {
    const html = renderToStaticMarkup(
      <FilterBar
        options={[{ id: 'packed', label: 'Packed', count: 0 }]}
        selectedOptionId="packed"
        onSelectOption={() => {}}
      />,
    )
    expect(html).toContain('aria-pressed="true"')
    expect(html).not.toContain('disabled=""')
    expect(html).toContain('(0)')
  })

  it('never prints invalid or negative result counts', () => {
    const html = renderToStaticMarkup(
      <FilterBar
        options={[
          { id: 'a', label: 'Infinite', count: Infinity },
          { id: 'b', label: 'Negative', count: -1 },
          { id: 'c', label: 'Unknown', count: NaN },
        ]}
        onSelectOption={() => {}}
      />,
    )
    expect(html).not.toContain('(Infinity)')
    expect(html).not.toContain('(-1)')
    expect(html).not.toContain('(NaN)')
  })
})

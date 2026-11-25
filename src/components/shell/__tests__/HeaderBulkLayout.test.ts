import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const header = readFileSync('src/components/shell/Header.tsx', 'utf8')
const bulk = header.split('/* Floating Bulk Selection Toolbar */')[1]?.split('/* Confirmation Dialog for actions requiring confirmation */')[0] ?? ''

describe('global bulk toolbar responsive presentation', () => {
  it('keeps the toolbar within the viewport and wraps actions instead of clipping', () => {
    expect(bulk).toContain("maxWidth: 'calc(100% - 24px)'")
    expect(bulk).toContain("flexWrap: 'wrap'")
    expect(bulk).toContain('env(safe-area-inset-bottom, 0px)')
    expect(bulk).toContain('minHeight: 44, minWidth: 44')
  })
  it('keeps labels and existing action guards', () => {
    expect(bulk).toContain('aria-label={act.label}')
    expect(bulk).toContain('act.loading ? act.loadingLabel')
    expect(bulk).not.toContain('isTablet && act.icon ? null')
    expect(bulk).toContain('visibleBulkActions.map')
    expect(bulk).toContain('disabled={!status.enabled}')
    expect(bulk).toContain('handleActionClick(act)')
  })
})

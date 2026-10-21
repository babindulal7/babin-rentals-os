import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Toolbar } from '../PageShell'
import { ModuleSubHeader } from '../module-shell/ModuleSubHeader'
import { Card } from '../Card'

describe('optional work surface furniture', () => {
  it('does not reserve a toolbar or subheader for absent/false content', () => {
    expect(renderToStaticMarkup(<Toolbar>{false}</Toolbar>)).toBe('')
    expect(renderToStaticMarkup(<ModuleSubHeader />)).toBe('')
  })
  it('retains a real zero counter and an actions-only toolbar', () => {
    expect(renderToStaticMarkup(<ModuleSubHeader counter={0} />)).toContain('0')
    expect(renderToStaticMarkup(<Toolbar actions={<button>Export</button>} />)).toContain('Export')
  })
  it('leaves surface border and elevation to CSS while retaining semantic status and overrides', () => {
    const plain=renderToStaticMarkup(<Card title="Equipment">Details</Card>)
    expect(plain).not.toContain('box-shadow:')
    expect(plain).not.toContain('border:')
    const status=renderToStaticMarkup(<Card statusColor="var(--danger-text)" style={{maxWidth:'40rem'}}>Attention</Card>)
    expect(status).toContain('border-left:3px solid var(--danger-text)')
    expect(status).toContain('max-width:40rem')
  })
})

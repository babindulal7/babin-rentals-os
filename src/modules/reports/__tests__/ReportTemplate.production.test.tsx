// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ReportTemplate } from '../ReportTemplate'
import { REPORTS } from '../catalog'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true
vi.mock('../../../lib/supabase', () => ({ IS_MOCK: false, supabase: {} }))
vi.mock('../../../lib/device', () => ({ useViewport: () => 'desktop' }))
let host: HTMLDivElement
let root: Root
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

it('names an unavailable live source truthfully and omits sample-ledger period/compare controls', async () => {
  const report = REPORTS.find(item => item.projection && item.route)
  if (!report) throw new Error('Expected a catalog entry with a dedicated source screen')
  await act(async () => root.render(<MemoryRouter><ReportTemplate report={report} /></MemoryRouter>))
  expect(host.textContent).toContain('Not tracked yet')
  expect(host.textContent).toContain('A verified live source is not connected')
  expect(host.textContent).not.toContain('The ledger covers')
  expect(host.querySelector('select[aria-label="Comparison"]')).toBeNull()
  expect(host.querySelector('.report-period-select')).toBeNull()
  expect(host.textContent).not.toContain('Save view')
  expect(host.querySelector(`a[href="${report.route}"]`)).not.toBeNull()
})

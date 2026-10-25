// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReportDataTable, type ReportDataColumn } from '../ReportDataTable'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true
const screen = vi.hoisted(() => ({ phone: false }))
vi.mock('../../../../lib/device', () => ({ useViewport: () => screen.phone ? 'phone' : 'desktop' }))
interface Row { id: string; name: string; amount: number; secret: string }
const rows: Row[] = Array.from({ length: 30 }, (_, i) => ({ id: String(i + 1), name: `Item ${String(i + 1).padStart(2, '0')}`, amount: i + 1, secret: 'withheld-money' }))
const columns: ReportDataColumn<Row>[] = [
  { id: 'name', header: 'Name', cell: row => row.name, sortValue: row => row.name },
  { id: 'amount', header: 'Amount', cell: row => row.amount, sortValue: row => row.amount },
]
let host: HTMLDivElement
let root: Root
async function render() { await act(async () => root.render(<ReportDataTable ariaLabel="Ledger" rows={rows} columns={columns} getRowId={row => row.id} />)) }
beforeEach(() => { screen.phone = false; host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove() })
const button = (text: string) => [...host.querySelectorAll('button')].find(item => item.textContent?.trim() === text) as HTMLButtonElement

describe('ReportDataTable controls', () => {
  it('searches the displayed month label when the sort value is an ISO timestamp', async () => {
    await act(async () => root.render(<ReportDataTable ariaLabel="Months" rows={[
      { id: 'july', label: 'Jul 2026', date: '2026-07-01T00:00:00Z' },
      { id: 'august', label: 'Aug 2026', date: '2026-08-01T00:00:00Z' },
    ]} columns={[{ id: 'month', header: 'Month', cell: row => row.label, sortValue: row => row.date }]} getRowId={row => row.id} />))
    const search = host.querySelector('input[aria-label="Search Months"]') as HTMLInputElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'Aug')
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(host.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(host.querySelector('tbody')?.textContent).toContain('Aug 2026')
    expect(host.querySelector('tbody')?.textContent).not.toContain('Jul 2026')
  })
  it('sorts numeric data, paginates the complete filtered rows and changes page size', async () => {
    await render()
    expect(host.querySelectorAll('tbody tr')).toHaveLength(25)
    const sort = host.querySelector('select[aria-label="Sort Ledger by"]') as HTMLSelectElement
    await act(async () => { sort.value = 'amount'; sort.dispatchEvent(new Event('change', { bubbles: true })); button('Ascending').click() })
    expect(host.querySelector('tbody tr')?.textContent).toContain('Item 30')
    await act(async () => button('Next page').click())
    expect(host.querySelectorAll('tbody tr')).toHaveLength(5)
    expect(host.querySelector('tbody tr')?.textContent).toContain('Item 05')
    const size = host.querySelector('select[aria-label="Rows per page for Ledger"]') as HTMLSelectElement
    await act(async () => { size.value = '10'; size.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(host.querySelectorAll('tbody tr')).toHaveLength(10)
    expect(host.textContent).toContain('Page 1 of 3')
  })

  it('searches and hides an optional column while retaining row identity', async () => {
    await render()
    const search = host.querySelector('input[aria-label="Search Ledger"]') as HTMLInputElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(search, 'Item 07')
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(host.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(host.querySelector('tbody')?.textContent).toContain('Item 07')
    const checkboxes = host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    expect(checkboxes[0]?.disabled).toBe(true)
    await act(async () => checkboxes[1]?.click())
    expect(host.querySelectorAll('th')).toHaveLength(1)
    expect(host.querySelector('th')?.textContent).toContain('Name')
    expect(host.querySelector('th')?.getAttribute('aria-sort')).toBe('ascending')
  })

  it('renders phone cards from authorized columns only', async () => {
    screen.phone = true
    await render()
    expect(host.querySelector('table')).toBeNull()
    expect(host.querySelectorAll('article')).toHaveLength(25)
    expect(host.querySelector('article')?.textContent).toContain('NameItem 01')
    expect(host.innerHTML).not.toContain('withheld-money')
  })
})

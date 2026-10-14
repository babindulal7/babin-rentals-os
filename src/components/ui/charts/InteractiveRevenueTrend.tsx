import { useState, type KeyboardEvent } from 'react'
import { catColor } from '../Charts'
import { formatMoney, type Paisa } from '../../../lib/money'
import type { RevenueMonth } from '../../../lib/intel/revenueTrend'

interface Props {
  months: readonly RevenueMonth[]
  onActivate?: (periodStartUtc: string) => void
}

/** Reusable point navigation and below-chart selected-period details.
 * A full HTML table is always available to keyboard and assistive tech.
 */
export function InteractiveRevenueTrend({ months, onActivate }: Props) {
  const [selected, setSelected] = useState<number | null>(null)
  const max = Math.max(1, ...months.map(m => m.amountPaisa))
  const width = 760
  const height = 230
  const pad = 18
  const x = (i: number) => pad + (months.length <= 1 ? (width - pad * 2) / 2 : i * (width - pad * 2) / (months.length - 1))
  const y = (value: number) => height - pad - value / max * (height - pad * 2)
  const points = months.map((m, i) => `${x(i)},${y(m.amountPaisa)}`).join(' ')
  const details = selected === null ? null : months[selected]
  const handleKey = (event: KeyboardEvent<SVGCircleElement>, index: number) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      const next = Math.min(months.length - 1, Math.max(0, index + (event.key === 'ArrowRight' ? 1 : -1)))
      setSelected(next)
      const group = event.currentTarget.parentElement
      group?.querySelectorAll<SVGCircleElement>('circle[tabindex]')[next]?.focus()
    } else if (event.key === 'Escape') {
      setSelected(null)
    } else if ((event.key === 'Enter' || event.key === ' ') && onActivate) {
      event.preventDefault()
      onActivate(months[index]!.periodStartUtc)
    }
  }
  if (months.length === 0) return <p>No recorded invoices in this period.</p>
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text2)', fontSize: 'var(--t-meta)', marginBottom: 10 }}>
        <span aria-hidden="true" style={{ display: 'inline-block', width: 20, borderTop: `3px solid ${catColor(0)}` }} />
        Issued invoice taxable amount · Actual · NPR, before VAT
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="group" aria-label="Issued taxable revenue by AD month, select a point for full details" style={{ display: 'block', maxHeight: 300 }}>
        {[0, .25, .5, .75, 1].map(level => <line key={level} x1={pad} x2={width-pad} y1={y(max*level)} y2={y(max*level)} stroke="var(--chart-grid)" strokeDasharray="4 5" />)}
        <polyline points={points} fill="none" stroke={catColor(0)} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {details && <line x1={x(selected!)} x2={x(selected!)} y1={pad} y2={height-pad} stroke="var(--text2)" strokeDasharray="3 5" />}
        {months.map((month, index) => (
          <circle key={month.periodStartUtc} cx={x(index)} cy={y(month.amountPaisa)} r={selected===index ? 7 : 5}
            fill="var(--card)" stroke={catColor(0)} strokeWidth={3} tabIndex={0} role="button"
            aria-label={`${month.label}: ${formatMoney(month.amountPaisa)}, ${month.invoiceCount} invoices`}
            aria-pressed={selected === index}
            onClick={() => setSelected(index)}
            onFocus={() => setSelected(index)}
            onKeyDown={event => handleKey(event, index)}
            style={{ cursor: 'pointer', outlineOffset: 4 }}
          />
        ))}
      </svg>
      <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
        <span>{months[0]?.label}</span><span>{months.length > 1 ? months[months.length-1]?.label : ''}</span>
      </div>
      <div aria-live="polite" style={{ minHeight: 46, marginTop: 12, color: 'var(--text)', fontSize: 'var(--t-meta)' }}>
        {details ? <><strong>{details.label}</strong> · {formatMoney(details.amountPaisa)} · {details.invoiceCount} issued invoice{details.invoiceCount===1?'':'s'} <button type="button" onClick={() => setSelected(null)} style={{ marginLeft: 12, minHeight:44, border: '1px solid var(--border)', padding:'0 12px', borderRadius: 'var(--rad-sm)', background: 'var(--card)', color: 'var(--text)' }}>Clear selection</button></> : 'Select a point with mouse, touch or keyboard. Arrow keys move between months.'}
      </div>
      <details>
        <summary style={{ cursor:'pointer', padding:'10px 0', minHeight:44 }}>View accessible month-by-month table</summary>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', textAlign:'left' }}>
            <thead><tr><th scope="col">AD month</th><th scope="col">Taxable revenue</th><th scope="col">Invoices</th></tr></thead>
            <tbody>{months.map(m=><tr key={m.periodStartUtc}><th scope="row">{m.label}</th><td>{formatMoney(m.amountPaisa as Paisa)}</td><td>{m.invoiceCount}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

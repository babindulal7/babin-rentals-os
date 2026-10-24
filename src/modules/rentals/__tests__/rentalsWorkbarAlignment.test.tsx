// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ModuleFilterBar } from '../../../components/ui/module-shell/ModuleFilterBar'
import { ModuleKpiStrip } from '../../../components/ui/module-shell/ModuleKpiStrip'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

describe('Rentals Hub Workbar Alignment — Phase 2', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  describe('ModuleFilterBar (WAI-ARIA Tablist & Roving Focus)', () => {
    it('sets tabIndex=0 for active tab and tabIndex=-1 for inactive tabs', () => {
      const tabs = [
        { id: 'All', label: 'All', count: 12 },
        { id: 'Upcoming', label: 'Upcoming', count: 5 },
        { id: 'Out', label: 'Out', count: 3 },
      ]

      act(() => {
        root.render(<ModuleFilterBar tabs={tabs} activeTab="All" onTabChange={() => {}} />)
      })

      const tabButtons = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
      expect(tabButtons.length).toBe(3)
      expect(tabButtons[0]?.getAttribute('tabindex')).toBe('0')
      expect(tabButtons[0]?.getAttribute('aria-selected')).toBe('true')
      expect(tabButtons[1]?.getAttribute('tabindex')).toBe('-1')
      expect(tabButtons[1]?.getAttribute('aria-selected')).toBe('false')
      expect(tabButtons[2]?.getAttribute('tabindex')).toBe('-1')
      expect(tabButtons[2]?.getAttribute('aria-selected')).toBe('false')
    })

    it('roving focus navigates between tabs via arrow keys and home/end', () => {
      const handleChange = vi.fn()
      const tabs = [
        { id: 'All', label: 'All', count: 10 },
        { id: 'Upcoming', label: 'Upcoming', count: '…' },
        { id: 'Out', label: 'Out', count: '—' },
      ]

      act(() => {
        root.render(<ModuleFilterBar tabs={tabs} activeTab="All" onTabChange={handleChange} />)
      })

      const tabButtons = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]'))

      // Focus first tab and trigger ArrowRight
      tabButtons[0]?.focus()
      act(() => {
        tabButtons[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
      })
      expect(handleChange).toHaveBeenCalledWith('Upcoming')

      // Trigger End to jump to last tab
      act(() => {
        tabButtons[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
      })
      expect(handleChange).toHaveBeenCalledWith('Out')

      // Trigger Home to jump to first tab
      act(() => {
        tabButtons[2]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
      })
      expect(handleChange).toHaveBeenCalledWith('All')
    })

    it('faithfully renders loading "…" and error "—" badges without inventing zero', () => {
      const tabs = [
        { id: 'All', label: 'All', count: 0 },
        { id: 'LoadingView', label: 'LoadingView', count: '…' },
        { id: 'ErrorView', label: 'ErrorView', count: '—' },
      ]

      act(() => {
        root.render(<ModuleFilterBar tabs={tabs} activeTab="All" onTabChange={() => {}} />)
      })

      const text = host.textContent ?? ''
      expect(text).toContain('0')
      expect(text).toContain('…')
      expect(text).toContain('—')
    })
  })

  describe('ModuleKpiStrip (Truthful Loading & Error States)', () => {
    it('renders loading "…" and error "—" KPI counts without defaulting to 0', () => {
      act(() => {
        root.render(
          <ModuleKpiStrip
            items={[
              {
                id: 'out-on-set',
                label: 'Out on Set',
                count: '…',
                subtitle: 'Active on production sets',
                icon: 'truck',
                tone: 'success',
              },
              {
                id: 'overdue-returns',
                label: 'Overdue Returns',
                count: '—',
                subtitle: 'Requires immediate return',
                icon: 'alert_triangle',
                tone: 'danger',
              },
              {
                id: 'prep-packing',
                label: 'Prep & Packing',
                count: 4,
                subtitle: 'Upcoming & booked kits',
                icon: 'package',
                tone: 'warn',
              },
            ]}
          />,
        )
      })

      const text = host.textContent ?? ''
      expect(text).toContain('Out on Set')
      expect(text).toContain('…')
      expect(text).toContain('Overdue Returns')
      expect(text).toContain('—')
      expect(text).toContain('Prep & Packing')
      expect(text).toContain('4')
    })
  })
})

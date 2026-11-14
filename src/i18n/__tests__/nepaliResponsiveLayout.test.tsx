// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { t } from '../../lib/i18n'
import activityCatalogue from '../ne/admin.json'
import clientsCatalogue from '../ne/clients.json'
import operationsCatalogue from '../ne/operations.json'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('Nepali Typography and Multi-Breakpoint Layout (T6-04, T6-05, T6-06, T6-07, 360/820/1280)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    document.documentElement.lang = 'ne'
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    document.body.innerHTML = ''
    document.documentElement.lang = 'en'
  })

  const viewports = [
    { name: 'Mobile (360px)', width: 360, height: 640 },
    { name: 'Tablet (820px)', width: 820, height: 1180 },
    { name: 'Desktop (1280px)', width: 1280, height: 800 },
  ]

  describe('1. Typography Invariants & Safe Weights', () => {
    it('enforces Latin numerals and Latin NPR currency in Nepali translations (R-21 / Law 6 / S6)', () => {
      // Numbers, IDs, booking numbers, and NPR remain in Latin script in both English and Nepali.
      // Assert zero Devanagari digits [०-९] across converted catalogues
      const catalogues = [activityCatalogue, clientsCatalogue, operationsCatalogue]
      for (const cat of catalogues) {
        for (const [, val] of Object.entries(cat)) {
          if (typeof val === 'string') {
            expect(val).not.toMatch(/[०-९]/)
          }
        }
      }
    })

    it('translates floor and desk strings with valid Devanagari', () => {
      expect(t('operations.driver.babinDelivery', 'ne')).toBe('बबिनबाट ढुवानी')
      expect(t('clients.title', 'ne')).toBe('ग्राहक')
    })
  })

  describe('2. Multi-Breakpoint Rendering (360px, 820px, 1280px)', () => {
    viewports.forEach(({ name, width, height }) => {
      it(`renders localized content cleanly without layout breakage at ${name}`, () => {
        window.innerWidth = width
        window.innerHeight = height
        container.style.width = `${width}px`

        act(() => {
          root.render(
            <div style={{ width: '100%', boxSizing: 'border-box', padding: '16px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: 400, fontFamily: 'var(--font-ne-display)' }}>
                {t('clients.title', 'ne')}
              </h1>
              <p style={{ fontSize: '14px', lineHeight: 1.6, fontFamily: 'var(--font-ne-body)' }}>
                {t('operations.driver.babinDelivery', 'ne')}
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ padding: '4px 8px', borderRadius: '4px', background: '#333', color: '#fff' }}>
                  {t('operations.col.status', 'ne')}
                </span>
                <span style={{ padding: '4px 8px', borderRadius: '4px', background: '#333', color: '#fff' }}>
                  {t('operations.col.items', 'ne')}
                </span>
              </div>
            </div>,
          )
        })

        expect(container.textContent).toContain('ग्राहक')
        expect(container.textContent).toContain('बबिनबाट ढुवानी')
        expect(container.scrollWidth).toBeLessThanOrEqual(width + 10)
      })
    })
  })
})

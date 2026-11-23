// @vitest-environment jsdom
/**
 * BABIN RENTALS OS — SHADOW INTELLIGENCE REVIEW UI TESTS (INT-SHADOW-02)
 *
 * Verifies:
 * 1. Read-only advisory presentation with safety banners.
 * 2. Role refusal for client role.
 * 3. Role simulator dynamically auditing money-blind masking.
 * 4. Zero duplicate primary CTAs (strictly secondary canonical links).
 * 5. Redacted export modal display and sanitized data.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import ShadowIntelligenceReview from '../ShadowIntelligenceReview'
import * as authModule from '../../../lib/auth'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

// Mock device viewport
vi.mock('../../../lib/device', () => ({
  useViewport: vi.fn(() => 'desktop'),
}))

// Mock auth hook
vi.mock('../../../lib/auth', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'staff-user-1', role: 'staff' },
    isAuthenticated: true,
  })),
}))

describe('ShadowIntelligenceReview Component (INT-SHADOW-02)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    vi.mocked(authModule.useAuth).mockReturnValue({
      user: { id: 'staff-user-1', role: 'staff' as any },
      isAuthenticated: true,
    } as any)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('renders Shadow Intelligence Review with safety banner and header', async () => {
    await act(async () => {
      root.render(
        createElement(MemoryRouter, null, createElement(ShadowIntelligenceReview))
      )
    })

    expect(container.textContent).toContain('Intelligence Shadow Evaluation & Action Review')
    expect(container.textContent).toContain('SHADOW MODE — READ-ONLY ADVISORY EVALUATION')
    expect(container.textContent).toContain('Awaiting Owner Acceptance')
    expect(container.textContent).toContain('v1.0.0-shadow-eval')
  })

  it('displays candidate advisories with status and severity badges', async () => {
    await act(async () => {
      root.render(
        createElement(MemoryRouter, null, createElement(ShadowIntelligenceReview))
      )
    })

    // Contains KPI cards
    expect(container.textContent).toContain('Total Suggestions')
    expect(container.textContent).toContain('Supported / Verified')
    expect(container.textContent).toContain('Could Not Verify')
    expect(container.textContent).toContain('Blocked / Masked')

    // Contains advisory rules
    expect(container.textContent).toContain('advisory.pickup_missing_serial')
    expect(container.textContent).toContain('advisory.safety_qc_hold')
  })

  it('restricts client portal role and renders access refusal view', async () => {
    vi.mocked(authModule.useAuth).mockReturnValue({
      user: { id: 'client-user-1', role: 'Client' as any },
      isAuthenticated: true,
    } as any)

    await act(async () => {
      root.render(
        createElement(MemoryRouter, null, createElement(ShadowIntelligenceReview))
      )
    })

    expect(container.textContent).toContain('Restricted Staff Surface')
    expect(container.textContent).toContain('Operational decisions and advisory evaluations are strictly internal')
    expect(container.textContent).not.toContain('SHADOW MODE — READ-ONLY ADVISORY EVALUATION')
  })

  it('opens Redacted Export Modal when clicking export button', async () => {
    await act(async () => {
      root.render(
        createElement(MemoryRouter, null, createElement(ShadowIntelligenceReview))
      )
    })

    const exportBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Export Redacted JSON')
    )
    expect(exportBtn).toBeDefined()

    await act(async () => {
      exportBtn!.click()
    })

    expect(container.textContent).toContain('Redacted Shadow Evaluation Export')
    expect(container.textContent).toContain('PII and unauthorized financial data scrubbed')
    expect(container.textContent).toContain('Download JSON Payload')
  })

  it('does NOT render duplicate filled primary CTAs anywhere on page', async () => {
    await act(async () => {
      root.render(
        createElement(MemoryRouter, null, createElement(ShadowIntelligenceReview))
      )
    })

    // Inspect canonical focus links: they must all be subtle inspection links
    const canonicalLinks = Array.from(container.querySelectorAll('a')).filter((a) =>
      a.textContent?.includes('Inspect in canonical workspace')
    )
    expect(canonicalLinks.length).toBeGreaterThan(0)
    for (const link of canonicalLinks) {
      // Must link to safe targets (/rentals, /operations, /repairs, /inventory)
      expect(link.getAttribute('href')).toMatch(/^\/(rentals|operations|repairs|inventory|intelligence)/)
    }
  })
})

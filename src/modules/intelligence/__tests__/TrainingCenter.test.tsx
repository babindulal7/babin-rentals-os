// @vitest-environment jsdom
/**
 * BABIN RENTALS OS — INTELLIGENCE TRAINING CENTER
 * Component & Integration Tests (TQC-01)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import TrainingCenter from '../TrainingCenter'
import { SYNTHETIC_GOLDEN_CASES } from '../../../lib/intelligence/goldenCases'
import { REAL_PILOT_GOLDEN_CASES } from '../../../lib/intelligence/realGoldenCases'
import * as authModule from '../../../lib/auth'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

// Mock device viewport
vi.mock('../../../lib/device', () => ({
  useViewport: vi.fn(() => 'desktop'),
}))

// Mock auth hook
vi.mock('../../../lib/auth', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'test-staff-1', role: 'staff' },
    isAuthenticated: true,
  })),
}))

describe('TrainingCenter Component (TQC-01)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    vi.mocked(authModule.useAuth).mockReturnValue({
      user: { id: 'test-staff-1', role: 'staff' as any },
      isAuthenticated: true,
    } as any)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('renders Training Center with Synthetic Offline status banner and PageHeader', async () => {
    await act(async () => {
      root.render(
        createElement(MemoryRouter, null, createElement(TrainingCenter))
      )
    })

    expect(container.textContent).toContain('Intelligence Training Center')
    expect(container.textContent).toContain('SYNTHETIC OFFLINE MODE')
    expect(container.textContent).toContain('Zero live DB writes')
    expect(container.textContent).toContain('Release Quality Gate: PASSING')
  })

  it('renders all 6 accessible navigation tabs', async () => {
    await act(async () => {
      root.render(
        createElement(MemoryRouter, null, createElement(TrainingCenter))
      )
    })

    const tabs = container.querySelectorAll('[role="tab"]')
    expect(tabs.length).toBe(6)
    const tabLabels = Array.from(tabs).map((t) => t.textContent)
    expect(tabLabels.some((l) => l?.includes('Overview'))).toBe(true)
    expect(tabLabels.some((l) => l?.includes('Data Quality'))).toBe(true)
    expect(tabLabels.some((l) => l?.includes('Knowledge Review'))).toBe(true)
    expect(tabLabels.some((l) => l?.includes('Golden Test Library'))).toBe(true)
    expect(tabLabels.some((l) => l?.includes('Evaluation Runs'))).toBe(true)
    expect(tabLabels.some((l) => l?.includes('Staff Feedback'))).toBe(true)
  })

  it('navigates to Data Quality Center tab and shows canonical issue scan', async () => {
    await act(async () => {
      root.render(
        createElement(MemoryRouter, null, createElement(TrainingCenter))
      )
    })

    const qualityTab = container.querySelector('#tab-quality') as HTMLButtonElement
    expect(qualityTab).not.toBeNull()

    await act(async () => {
      qualityTab.click()
    })

    expect(container.textContent).toContain('Canonical Catalog Quality Scan')
    expect(container.textContent).toContain('ID-001')
    expect(container.textContent).toContain('Near-duplicate model code detected (FX3 vs FX30 boundary)')
    expect(container.textContent).toContain('CMP-002')
  })

  it('states the library count from the list it shows, not a typed number', async () => {
    await act(async () => {
      root.render(
        createElement(MemoryRouter, null, createElement(TrainingCenter))
      )
    })

    const total = SYNTHETIC_GOLDEN_CASES.length + REAL_PILOT_GOLDEN_CASES.length
    const libraryTab = container.querySelector('#tab-library') as HTMLButtonElement
    await act(async () => {
      libraryTab.click()
    })

    expect(container.textContent).toContain(`Curated collection of ${total} golden assertions`)
    expect(container.textContent).toContain(`All Cases (${total})`)
  })

  it('navigates to Golden Test Library tab and filters cases', async () => {
    await act(async () => {
      root.render(
        createElement(MemoryRouter, null, createElement(TrainingCenter))
      )
    })

    const libraryTab = container.querySelector('#tab-library') as HTMLButtonElement
    await act(async () => {
      libraryTab.click()
    })

    expect(container.textContent).toContain('Golden Test Case Library')
    expect(container.textContent).toContain('SYN-001')
    expect(container.textContent).toContain('SYN-047')

    // Test Search Input filtering
    const searchInput = container.querySelector('input[placeholder*="Search case ID"]') as HTMLInputElement
    expect(searchInput).not.toBeNull()

    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      nativeSetter?.call(searchInput, 'SYN-019')
      searchInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(container.textContent).toContain('SYN-019')
    expect(container.textContent).not.toContain('SYN-001')
  })

  it('navigates to Knowledge Review Queue and processes approvals', async () => {
    await act(async () => {
      root.render(
        createElement(MemoryRouter, null, createElement(TrainingCenter))
      )
    })

    const reviewTab = container.querySelector('#tab-reviews') as HTMLButtonElement
    await act(async () => {
      reviewTab.click()
    })

    expect(container.textContent).toContain('Staff Knowledge Review Queue')
    expect(container.textContent).toContain('Sony FX3 Cinema Camera')

    // Find and click "Approve (Staff Internal)"
    const approveBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Approve (Staff Internal)')
    )
    expect(approveBtn).toBeDefined()

    await act(async () => {
      approveBtn?.click()
    })

    expect(container.textContent).toContain('Status: APPROVED_INTERNAL')
  })

  it('navigates to Staff Feedback tab and converts feedback into review candidate', async () => {
    await act(async () => {
      root.render(
        createElement(MemoryRouter, null, createElement(TrainingCenter))
      )
    })

    const feedbackTab = container.querySelector('#tab-feedback') as HTMLButtonElement
    await act(async () => {
      feedbackTab.click()
    })

    expect(container.textContent).toContain('Staff Feedback & Correction Queue')
    const createCandidateBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Create Review Candidate')
    )
    expect(createCandidateBtn).toBeDefined()

    await act(async () => {
      createCandidateBtn?.click()
    })

    expect(container.textContent).toContain('Status: Review Candidate Created')
  })

  it('strictly refuses external Client role access (Acceptance Test 10)', async () => {
    vi.mocked(authModule.useAuth).mockReturnValue({
      user: { id: 'client-user-1', role: 'Client' as any },
      isAuthenticated: true,
    } as any)

    await act(async () => {
      root.render(
        createElement(MemoryRouter, null, createElement(TrainingCenter))
      )
    })

    expect(container.textContent).toContain('Restricted Staff Surface')
    expect(container.textContent).toContain('Client portal sessions cannot view internal evaluation datasets')
    expect(container.textContent).not.toContain('SYNTHETIC OFFLINE MODE')
    expect(container.textContent).not.toContain('Golden Test Case Library')
  })
})

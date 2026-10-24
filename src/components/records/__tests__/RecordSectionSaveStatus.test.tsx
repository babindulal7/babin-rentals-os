// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  SectionSaveStatusBadge,
  SectionSaveBar,
} from '../RecordSectionSaveStatus'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('RecordSectionSaveStatus components', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  describe('SectionSaveStatusBadge', () => {
    it('renders "Not started" for untouched status', async () => {
      await act(async () => {
        root.render(<SectionSaveStatusBadge status="untouched" />)
      })
      const badge = container.querySelector('[role="status"]')
      expect(badge).not.toBeNull()
      expect(badge?.textContent).toContain('Not started')
      expect(badge?.getAttribute('aria-label')).toBe('Section status: Not started')
    })

    it('renders "Unsaved changes" for dirty status', async () => {
      await act(async () => {
        root.render(<SectionSaveStatusBadge status="dirty" />)
      })
      const badge = container.querySelector('[role="status"]')
      expect(badge?.textContent).toContain('Unsaved changes')
    })

    it('renders "Saving…" for saving status', async () => {
      await act(async () => {
        root.render(<SectionSaveStatusBadge status="saving" />)
      })
      const badge = container.querySelector('[role="status"]')
      expect(badge?.textContent).toContain('Saving…')
    })

    it('renders "Saved at HH:mm" for saved status with timestamp', async () => {
      await act(async () => {
        root.render(<SectionSaveStatusBadge status="saved" savedAtTime="14:35" />)
      })
      const badge = container.querySelector('[role="status"]')
      expect(badge?.textContent).toContain('Saved at 14:35')
    })

    it('renders "Saved" for saved status without timestamp', async () => {
      await act(async () => {
        root.render(<SectionSaveStatusBadge status="saved" />)
      })
      const badge = container.querySelector('[role="status"]')
      expect(badge?.textContent).toBe('Saved')
    })

    it('renders "Fix 1 field" when invalid with 1 error', async () => {
      await act(async () => {
        root.render(<SectionSaveStatusBadge status="invalid" errorCount={1} />)
      })
      const badge = container.querySelector('[role="status"]')
      expect(badge?.textContent).toContain('Fix 1 field')
    })

    it('renders "Fix 3 fields" when invalid with multiple errors', async () => {
      await act(async () => {
        root.render(<SectionSaveStatusBadge status="invalid" errorCount={3} />)
      })
      const badge = container.querySelector('[role="status"]')
      expect(badge?.textContent).toContain('Fix 3 fields')
    })

    it('renders "Changed elsewhere" on conflict status', async () => {
      await act(async () => {
        root.render(<SectionSaveStatusBadge status="conflict" />)
      })
      const badge = container.querySelector('[role="status"]')
      expect(badge?.textContent).toContain('Changed elsewhere')
    })

    it('renders "Not saved — offline" on offline status', async () => {
      await act(async () => {
        root.render(<SectionSaveStatusBadge status="offline" />)
      })
      const badge = container.querySelector('[role="status"]')
      expect(badge?.textContent).toContain('Not saved — offline')
    })

    it('renders "Read-only" on readonly status', async () => {
      await act(async () => {
        root.render(<SectionSaveStatusBadge status="readonly" />)
      })
      const badge = container.querySelector('[role="status"]')
      expect(badge?.textContent).toContain('Read-only')
    })

    it('renders custom error message on error status', async () => {
      await act(async () => {
        root.render(<SectionSaveStatusBadge status="error" errorMessage="Network timeout" />)
      })
      const badge = container.querySelector('[role="status"]')
      expect(badge?.textContent).toContain('Error: Network timeout')
    })
  })

  describe('SectionSaveBar', () => {
    it('renders save button and triggers onSave callback', async () => {
      const onSave = vi.fn()
      await act(async () => {
        root.render(
          <SectionSaveBar
            sectionName="Identity"
            status="dirty"
            isSaving={false}
            canSave={true}
            onSave={onSave}
          />
        )
      })

      const saveBtn = container.querySelector('button')
      expect(saveBtn?.textContent).toBe('Save Identity')
      expect(saveBtn?.disabled).toBe(false)

      await act(async () => {
        saveBtn?.click()
      })
      expect(onSave).toHaveBeenCalledTimes(1)
    })

    it('disables save button and displays disabled reason when canSave is false', async () => {
      const onSave = vi.fn()
      await act(async () => {
        root.render(
          <SectionSaveBar
            sectionName="Identity"
            status="untouched"
            isSaving={false}
            canSave={false}
            saveDisabledReason="Equipment name is required"
            onSave={onSave}
          />
        )
      })

      const saveBtn = container.querySelector('button')
      expect(saveBtn?.disabled).toBe(true)
      expect(container.textContent).toContain('Equipment name is required')

      await act(async () => {
        saveBtn?.click()
      })
      expect(onSave).not.toHaveBeenCalled()
    })

    it('shows saving spinner text while isSaving is true', async () => {
      await act(async () => {
        root.render(
          <SectionSaveBar
            sectionName="Location"
            status="saving"
            isSaving={true}
            canSave={true}
            onSave={vi.fn()}
          />
        )
      })

      const saveBtn = container.querySelector('button')
      expect(saveBtn?.disabled).toBe(true)
      expect(saveBtn?.textContent).toBe('Saving section…')
    })

    it('renders onNext button with custom nextLabel and triggers navigation', async () => {
      const onNext = vi.fn()
      await act(async () => {
        root.render(
          <SectionSaveBar
            sectionName="Identity"
            status="saved"
            isSaving={false}
            canSave={true}
            onSave={vi.fn()}
            onNext={onNext}
            nextLabel="Stock & Units"
          />
        )
      })

      const buttons = container.querySelectorAll('button')
      expect(buttons.length).toBe(2)
      const nextBtn = buttons[1]
      expect(nextBtn?.textContent).toContain('Next: Stock & Units →')

      await act(async () => {
        nextBtn?.click()
      })
      expect(onNext).toHaveBeenCalledTimes(1)
    })

    it('renders status synchronization text when status is saved', async () => {
      await act(async () => {
        root.render(
          <SectionSaveBar
            sectionName="Purchase"
            status="saved"
            isSaving={false}
            canSave={true}
            onSave={vi.fn()}
          />
        )
      })
      expect(container.textContent).toContain('Section is synchronized with server')
    })
  })
})

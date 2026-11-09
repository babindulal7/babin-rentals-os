// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
// Isolated reviewer fixture, never a production activation bypass.
vi.mock('../languageReadiness', () => ({ canEnable: () => true, NEPALI_UNAVAILABLE: '' }))
import { useTranslation } from '../i18n'
import { appendGlossaryRevision, applyGlossaryRevisions } from '../glossaryStore'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true
it('refreshes mounted translated screens immediately after approval and preserves English', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const Probe = () => { const { t } = useTranslation(); return <span>{t('nav.today')}</span> }
  try {
    document.documentElement.lang = 'ne'
    applyGlossaryRevisions([])
    await act(async () => root.render(<Probe />))
    expect(container.textContent).toBe('आज')
    await act(async () => appendGlossaryRevision({ term_key: 'nav.today', original_nepali: 'आज', nepali: 'अहिले', revision: 1 }))
    expect(container.textContent).toBe('अहिले')
    await act(async () => { document.documentElement.lang = 'en'; window.dispatchEvent(new Event('languagechange')) })
    expect(container.textContent).toBe('Today')
  } finally {
    await act(async () => root.unmount())
    applyGlossaryRevisions([])
    document.documentElement.lang = 'en'
    container.remove()
  }
})

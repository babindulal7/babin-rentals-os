import { useState } from 'react'
import { useOnboarding } from './useFirstRun'
import { useToast } from '../components/ui/Toast'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { useAuth } from './auth'
import { getUserLanguage, setUserLanguage, languageCodeOf, type SettingValue } from './settingsStore'
import { applyLanguage } from './i18n'
import { supabase } from './supabase'

/**
 * Welcome onboarding modal that appears for first-time users.
 * Uses localStorage to track that it has been shown.
 * Allows staff to choose language (English / नेपाली) on first sign-in (T6-09).
 */
function WelcomeOnboarding({ onClose }: { onClose: () => void }) {
  const { firstRun, completeOnboarding } = useOnboarding(onClose)
  const { showSuccessToast } = useToast()
  const { user } = useAuth()
  const [selectedLang, setSelectedLang] = useState<SettingValue>(() => getUserLanguage(user?.id))

  if (!firstRun) {
    return null
  }

  const handleLanguageSelect = async (lang: SettingValue) => {
    setSelectedLang(lang)
    setUserLanguage(user?.id, lang)
    await applyLanguage(languageCodeOf(lang))
    if (user?.id) {
      void supabase.auth.updateUser({ data: { language: lang } }).catch(() => {})
    }
  }

  const handleComplete = () => {
    completeOnboarding()
    showSuccessToast('Welcome!', "Let's explore your rental dashboard.")
    onClose()
  }

  return (
    <Modal
      isOpen={true}
      title="Welcome to Babin Rentals OS"
      onClose={onClose}
      size="sm"
    >
      <div style={{ padding: 'var(--sp-md)' }}>
        <p style={{ 
          margin: '0 0 16px', 
          fontSize: 'var(--t-body)', 
          color: 'var(--text2)', 
          lineHeight: 1.5 
        }}>
          Manage equipment rentals, inventory tracking, deliveries, and crew workflows all in one place.
        </p>

        {/* First sign-in language choice (T6-09) */}
        <div style={{
          marginBottom: 16,
          padding: 12,
          background: 'var(--card2)',
          borderRadius: 'var(--r-card)',
          border: '1px solid var(--border)',
        }}>
          <label style={{
            display: 'block',
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            marginBottom: 8,
            color: 'var(--text)',
          }}>
            Choose your language / भाषा छान्नुहोस्
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              type="button"
              variant={selectedLang === 'English' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => void handleLanguageSelect('English')}
              style={{ flex: 1 }}
            >
              English
            </Button>
            <Button
              type="button"
              variant={selectedLang === 'नेपाली' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => void handleLanguageSelect('नेपाली')}
              style={{ flex: 1 }}
            >
              नेपाली
            </Button>
          </div>
        </div>
        
        <div style={{ 
          margin: '16px 0', 
          display: 'grid', 
          gap: 12 
        }}>
          {['Getting Started', 'First Rental', 'Delivery & Terms', "You're All Set!"].map((title) => (
            <div key={title} style={{
              padding: '12px',
              background: 'var(--surface-muted, var(--card2))',
              borderRadius: 'var(--r-card)',
              border: '1px solid var(--border)',
            }}>
              <h4 style={{ 
                margin: '0 0 4px', 
                fontSize: 'var(--t-body)', 
                fontWeight: 600, 
                color: 'var(--text)' 
              }}>{title}</h4>
              <p style={{ 
                margin: 0, 
                fontSize: 'var(--t-meta)', 
                color: 'var(--text2)', 
                lineHeight: 1.4 
              }}>
                Get started by creating your first rental record or exploring the inventory.
              </p>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <Button 
            variant="ghost" 
            onClick={onClose}
          >
            Skip
          </Button>
          <Button 
            variant="primary" 
            onClick={handleComplete}
          >
            Get Started
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export { WelcomeOnboarding }
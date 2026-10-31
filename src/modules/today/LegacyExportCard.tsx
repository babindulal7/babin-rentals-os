/**
 * LegacyExportCard — Banner/card for Today dashboard alerting staff of old browser-local entries.
 *
 * Implements T4-06 (Ruling D28, Law 3).
 * Shown once per device until dismissed.
 * Never auto-imports, never deletes.
 */

import { useState, useEffect, useCallback } from 'react'
import { Card } from '../../components/ui/Page'
import { Button } from '../../components/ui/Button'
import Icon from '../../components/ui/Icon'
import { useToast } from '../../components/ui/Toast'
import {
  getLegacyLocalEntriesSummary,
  isLegacyExportDismissed,
  dismissLegacyExport,
  downloadLegacyExport,
  type LegacyExportSummary,
} from '../../lib/legacyLocalExport'

export default function LegacyExportCard() {
  const { showSuccessToast } = useToast()
  const [summary, setSummary] = useState<LegacyExportSummary | null>(null)
  const [dismissed, setDismissed] = useState<boolean>(() => isLegacyExportDismissed())
  const [downloading, setDownloading] = useState(false)

  const checkEntries = useCallback(async () => {
    try {
      const res = await getLegacyLocalEntriesSummary()
      setSummary(res)
    } catch {
      setSummary(null)
    }
  }, [])

  useEffect(() => {
    if (dismissed) return
    void checkEntries()
  }, [dismissed, checkEntries])

  const handleDownload = async () => {
    setDownloading(true)
    try {
      await downloadLegacyExport()
      showSuccessToast(
        'Export file downloaded',
        'Legacy device entries have been packaged for Babin. Original records remain on this device.'
      )
    } catch (err) {
      console.error('Failed to download legacy export:', err)
    } finally {
      setDownloading(false)
    }
  }

  const handleDismiss = () => {
    dismissLegacyExport()
    setDismissed(true)
  }

  // Hide if dismissed or no entries
  if (dismissed || !summary || summary.totalCount === 0) {
    return null
  }

  const count = summary.totalCount

  return (
    <Card style={{ marginBottom: 'var(--sp-md, 16px)' }}>
      <section
        role="region"
        aria-label="Legacy device export notice"
        style={{
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          background: 'color-mix(in srgb, var(--primary) 6%, var(--surface))',
          borderRadius: 'var(--radius, 10px)',
          border: '1px solid color-mix(in srgb, var(--primary) 30%, var(--border))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '8px',
                background: 'color-mix(in srgb, var(--primary) 15%, transparent)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: 2,
              }}
            >
              <Icon name="download" size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 'var(--t-body, 15px)', fontWeight: 600, color: 'var(--text)' }}>
                Old device entries found
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: 'var(--t-meta, 13px)', color: 'var(--text2)', lineHeight: 1.4 }}>
                This device has <strong className="font-mono tabular-nums">{count}</strong> old {count === 1 ? 'entry' : 'entries'} saved only here. Download them as a file for Babin.
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--muted)' }}>
                Bytes stay on this device — nothing is deleted (Law 3, D28). You can also download this later in Settings ▸ System.
              </p>
            </div>
          </div>

          <Button
            variant="ghost"
            onClick={handleDismiss}
            aria-label="Dismiss export notice"
            style={{
              minHeight: 36,
              padding: '0 8px',
              fontSize: '12px',
              color: 'var(--muted)',
            }}
          >
            Dismiss
          </Button>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button
            variant="primary"
            disabled={downloading}
            onClick={() => void handleDownload()}
            className="press tap"
            style={{
              minHeight: 'var(--tap, 44px)',
              padding: '0 16px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Icon name="download" size={16} />
            {downloading ? 'Packaging Export…' : 'Download file for Babin'}
          </Button>
        </div>
      </section>
    </Card>
  )
}
